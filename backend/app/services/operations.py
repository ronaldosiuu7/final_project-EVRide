from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.models import (
    AuditLog,
    FileAttachment,
    GPSPoint,
    MaintenanceOrder,
    Rental,
    RentalIncident,
    RentalReview,
    Station,
    StoredFile,
    SupportTicket,
    User,
    Vehicle,
)
from app.services.errors import ServiceError
from app.services.rental_guards import vehicle_blocking_clause


STAFF_ROLES = {"STAFF", "MANAGER"}
ACTIVE_MAINTENANCE = {"OPEN", "IN_PROGRESS"}
GPS_STALE_SECONDS = 60


def fail(status, code, message):
    raise ServiceError(status, code, message)


def utcnow():
    return datetime.now(timezone.utc)


def output(row):
    """Chỉ dùng cho các model nghiệp vụ được trả ở module này."""
    result = {}

    for column in row.__table__.columns:
        name = column.name
        value = getattr(row, name)

        is_identifier = (
            name == "id"
            or name.endswith("_id")
            or name.endswith("_by")
            or name == "assigned_to"
        )

        if value is not None and is_identifier:
            value = str(value)
        elif isinstance(value, Decimal):
            value = float(value)

        result[name] = value

    return result


def load(db, model, row_id, *, lock=False):
    query = (
        select(model)
        .where(model.id == row_id)
        .execution_options(populate_existing=True)
    )

    if lock:
        query = query.with_for_update()

    row = db.scalar(query)

    if row is None:
        fail(404, "NOT_FOUND", "Không tìm thấy dữ liệu.")

    return row


def rental_access(db, rental_id, actor, *, lock=False):
    rental = load(db, Rental, rental_id, lock=lock)

    if actor.role not in STAFF_ROLES:
        if actor.role != "CUSTOMER" or rental.customer_id != actor.id:
            fail(404, "NOT_FOUND", "Không tìm thấy lượt thuê.")

    return rental


def ticket_access(db, ticket_id, actor, *, lock=False):
    ticket = load(db, SupportTicket, ticket_id, lock=lock)

    if (
        ticket.check_cycle is not None
        and actor.role not in STAFF_ROLES
    ):
        fail(
            404,
            "NOT_FOUND",
            "Không tìm thấy ticket.",
        )

    rental_access(db, ticket.rental_id, actor)
    return ticket


def validate_assignee(db, user_id):
    if user_id is None:
        return

    employee = db.get(User, user_id)

    if (
        employee is None
        or employee.role not in STAFF_ROLES
        or employee.status != "ACTIVE"
    ):
        fail(
            422,
            "INVALID_ASSIGNEE",
            "Người phụ trách phải là STAFF/MANAGER đang hoạt động.",
        )


def audit(db, actor, action, row, before=None, extra=None):
    after = {
        "status": getattr(row, "status", None),
        **(extra or {}),
    }

    db.add(
        AuditLog(
            actor_id=actor.id if actor is not None else None,
            action=action,
            resource_type=row.__tablename__,
            resource_id=str(row.id),
            before_data=before,
            after_data=after,
        )
    )


def list_page(db, query, page, page_size):
    total = db.scalar(
        select(func.count()).select_from(
            query.order_by(None).subquery()
        )
    ) or 0

    rows = db.scalars(
        query.offset((page - 1) * page_size).limit(page_size)
    ).all()

    return [output(row) for row in rows], total
def create_ticket(db, rental, actor, body):
    if rental.status not in {
        "IN_RENT",
        "RETURN_PENDING",
        "STOLEN",
        "INCIDENT_PENDING",
        "COMPLETED",
    }:
        fail(
            409,
            "INVALID_RENTAL_STATE",
            "Chuyến chưa đủ điều kiện báo sự cố.",
        )

    now = db.scalar(select(func.clock_timestamp()))

    ticket = SupportTicket(
        rental_id=rental.id,
        created_by=actor.id,
        report_source=(
            "CUSTOMER"
            if actor.role == "CUSTOMER"
            else "STAFF"
        ),
        received_at=now,
        title=body.title,
        description=body.description,
        status="OPEN",
        created_at=now,
        updated_at=now,
    )

    db.add(ticket)
    db.flush()

    audit(db, actor, "SUPPORT_TICKET_CREATED", ticket)
    return output(ticket)


def update_ticket(db, ticket, actor, body):
    if ticket.check_cycle is not None:
        fail(
            409,
            "ALERT_WORKFLOW_REQUIRED",
            "Cảnh báo chuyến thuê phải được xử lý qua luồng cảnh báo.",
        )
    values = body.model_dump(exclude_unset=True)
    before = {
        "status": ticket.status,
        "assigned_to": (
            str(ticket.assigned_to)
            if ticket.assigned_to is not None
            else None
        ),
    }

    target = values.get("status", ticket.status)

    next_status = {
        "OPEN": "IN_PROGRESS",
        "IN_PROGRESS": "RESOLVED",
        "RESOLVED": "CLOSED",
        "CLOSED": None,
    }

    if (
        target != ticket.status
        and next_status[ticket.status] != target
    ):
        fail(
            409,
            "INVALID_STATE_TRANSITION",
            "Không được bỏ qua bước hoặc chuyển ngược trạng thái.",
        )

    if "assigned_to" in values:
        validate_assignee(db, values["assigned_to"])
        ticket.assigned_to = values["assigned_to"]

    if target == "IN_PROGRESS" and ticket.assigned_to is None:
        fail(
            422,
            "ASSIGNEE_REQUIRED",
            "Cần phân công nhân viên trước khi xử lý.",
        )

    note = values.get("resolution_note")

    if note is not None and target != "RESOLVED":
        fail(
            422,
            "INVALID_REQUEST",
            "Chỉ ghi kết quả xử lý ở trạng thái RESOLVED.",
        )

    if target == "RESOLVED" and ticket.status != "RESOLVED":
        if not note:
            fail(
                422,
                "RESOLUTION_REQUIRED",
                "Phải nhập kết quả xử lý.",
            )
        ticket.resolved_at = utcnow()

    if note is not None:
        ticket.resolution_note = note

    ticket.status = target
    ticket.updated_at = utcnow()

    db.flush()

    audit(
        db,
        actor,
        "SUPPORT_TICKET_UPDATED",
        ticket,
        before=before,
        extra={
            "assigned_to": (
                str(ticket.assigned_to)
                if ticket.assigned_to is not None
                else None
            )
        },
    )

    return output(ticket)


def lock_ticket_file(db, actor, ticket_id, file_id):
    # Thứ tự cố định: ticket rồi file.
    ticket = ticket_access(db, ticket_id, actor, lock=True)
    stored_file = load(db, StoredFile, file_id, lock=True)
    return ticket, stored_file


def attach_ticket_file(db, context, actor):
    ticket, stored_file = context

    # Bản này chỉ cho gắn file do chính người thao tác upload.
    if stored_file.uploaded_by != actor.id:
        fail(404, "NOT_FOUND", "Không tìm thấy file.")

    if stored_file.status != "READY":
        fail(409, "FILE_NOT_READY", "File chưa sẵn sàng.")

    if stored_file.content_type not in {
        "image/jpeg", "image/png", "image/webp"
    }:
        fail(415, "UNSUPPORTED_MEDIA_TYPE", "Chỉ nhận ảnh.")

    existing = db.scalar(
        select(FileAttachment.id)
        .where(FileAttachment.file_id == stored_file.id)
        .limit(1)
    )

    if existing is not None:
        fail(
            409,
            "FILE_ALREADY_ATTACHED",
            "Ảnh đã được gắn vào tài nguyên khác.",
        )

    attachment = FileAttachment(
        file_id=stored_file.id,
        support_ticket_id=ticket.id,
        purpose="TICKET_EVIDENCE",
        attached_by=actor.id,
    )

    db.add(attachment)
    db.flush()

    audit(db, actor, "TICKET_EVIDENCE_ATTACHED", attachment)
    return output(attachment)
def lock_maintenance(db, order_id):
    # Đọc vehicle_id trước, chưa lấy khóa phiếu.
    vehicle_id = db.scalar(
        select(MaintenanceOrder.vehicle_id)
        .where(MaintenanceOrder.id == order_id)
    )

    if vehicle_id is None:
        fail(404, "NOT_FOUND", "Không tìm thấy phiếu bảo trì.")

    # Luôn khóa vehicle trước maintenance order.
    vehicle = load(db, Vehicle, vehicle_id, lock=True)
    order = load(db, MaintenanceOrder, order_id, lock=True)

    return vehicle, order


def prepare_maintenance_create(db, body):
    if body.incident_id is None:
        return {
            "station": None,
            "vehicle": load(db, Vehicle, body.vehicle_id, lock=True),
            "rental": None,
            "incident": None,
        }

    preliminary = db.execute(
        select(
            RentalIncident.rental_id.label("rental_id"),
            RentalIncident.received_station_id.label("station_id"),
        ).where(RentalIncident.id == body.incident_id)
    ).one_or_none()

    if preliminary is None:
        fail(404, "NOT_FOUND", "Không tìm thấy hồ sơ sự cố.")

    station = (
        load(db, Station, preliminary.station_id, lock=True)
        if preliminary.station_id is not None
        else None
    )
    vehicle = load(db, Vehicle, body.vehicle_id, lock=True)
    rental = load(db, Rental, preliminary.rental_id, lock=True)
    incident = load(db, RentalIncident, body.incident_id, lock=True)

    return {
        "station": station,
        "vehicle": vehicle,
        "rental": rental,
        "incident": incident,
    }


def create_maintenance(db, context, actor, body):
    if isinstance(context, Vehicle):
        vehicle = context
        incident = None
        rental = None
        station = None
    else:
        vehicle = context["vehicle"]
        incident = context["incident"]
        rental = context["rental"]
        station = context["station"]

    if incident is not None:
        if rental.vehicle_id != vehicle.id:
            fail(
                409,
                "INVALID_INCIDENT_VEHICLE",
                "Xe không khớp với hồ sơ sự cố.",
            )

        if (
            incident.status not in {"CONFIRMED", "CLOSED"}
            or incident.verified_outcome not in {"LOSS_THEFT", "ABANDONMENT"}
        ):
            fail(
                409,
                "INVALID_INCIDENT_STATE",
                "Hồ sơ chưa xác nhận sự cố hoặc không ở luồng thu hồi xe.",
            )

        if rental.vehicle_released_at is not None:
            fail(
                409,
                "VEHICLE_ALREADY_RELEASED",
                "Xe của hồ sơ sự cố này đã được giải phóng.",
            )

        if (
            incident.arrived_station_at is None
            or station is None
            or incident.received_station_id != station.id
            or vehicle.current_station_id != station.id
        ):
            fail(
                409,
                "VEHICLE_NOT_AT_RECEIVED_STATION",
                "Xe chưa được tiếp nhận tại trạm của hồ sơ.",
            )

        if vehicle.status != "MAINTENANCE":
            fail(
                409,
                "INVALID_VEHICLE_STATE",
                "Xe phải đang ở trạng thái bảo trì.",
            )

        if incident.recovery_condition not in {"INTACT", "REPAIRABLE"}:
            fail(
                409,
                "INSPECTION_REQUIRED",
                "Cần kết quả kiểm tra ban đầu INTACT hoặc REPAIRABLE để mở "
                "phiếu kiểm tra/sửa chữa phục vụ đưa xe hoạt động lại.",
            )

        other_active_rental = db.scalar(
            select(Rental.id)
            .where(
                Rental.vehicle_id == vehicle.id,
                Rental.id != rental.id,
                vehicle_blocking_clause(),
            )
            .limit(1)
        )
        if other_active_rental is not None:
            fail(
                409,
                "ACTIVE_RENTAL_EXISTS",
                "Xe đang có lượt giữ hoặc chuyến khác chưa giải quyết.",
            )
    else:
        if (
            vehicle.current_station_id is None
            or vehicle.status not in {"AVAILABLE", "MAINTENANCE"}
        ):
            fail(
                409,
                "INVALID_VEHICLE_STATE",
                "Xe phải ở trạm và có trạng thái AVAILABLE/MAINTENANCE.",
            )

        active_rental = db.scalar(
            select(Rental.id)
            .where(
                Rental.vehicle_id == vehicle.id,
                vehicle_blocking_clause(),
            )
            .limit(1)
        )

        if active_rental is not None:
            fail(
                409,
                "ACTIVE_RENTAL_EXISTS",
                "Xe đang có lượt giữ hoặc chuyến chưa giải quyết.",
            )

    active_order = db.scalar(
        select(MaintenanceOrder.id)
        .where(
            MaintenanceOrder.vehicle_id == vehicle.id,
            MaintenanceOrder.status.in_(ACTIVE_MAINTENANCE),
        )
        .limit(1)
    )

    if active_order is not None:
        fail(
            409,
            "ACTIVE_MAINTENANCE_ORDER",
            "Xe đã có phiếu bảo trì đang hoạt động.",
        )

    validate_assignee(db, body.assigned_to)
    now = db.scalar(select(func.clock_timestamp()))

    order = MaintenanceOrder(
        vehicle_id=vehicle.id,
        incident_id=incident.id if incident is not None else None,
        created_by=actor.id,
        assigned_to=body.assigned_to,
        title=body.title,
        description=body.description,
        status="OPEN",
        opened_at=now,
        updated_at=now,
    )

    before_vehicle = {"status": vehicle.status}
    vehicle.status = "MAINTENANCE"

    db.add(order)
    db.flush()

    audit(
        db,
        actor,
        "MAINTENANCE_CREATED",
        order,
        extra=(
            {"incident_id": str(incident.id)}
            if incident is not None
            else None
        ),
    )
    audit(
        db,
        actor,
        "VEHICLE_MAINTENANCE_BLOCKED",
        vehicle,
        before=before_vehicle,
    )

    if incident is not None:
        incident.updated_at = now
        db.add(
            AuditLog(
                actor_id=actor.id,
                action="RENTAL_INCIDENT_MAINTENANCE_CREATED",
                resource_type="rental_incidents",
                resource_id=str(incident.id),
                after_data={
                    "status": incident.status,
                    "maintenance_order_id": str(order.id),
                    "note": body.description,
                },
                created_at=now,
            )
        )

    return output(order)


def change_maintenance(db, context, actor, action, body):
    vehicle, order = context

    required_status = {
        "start": "OPEN",
        "complete": "IN_PROGRESS",
        "cancel": "OPEN",
    }

    if order.status != required_status[action]:
        fail(
            409,
            "INVALID_STATE_TRANSITION",
            "Trạng thái phiếu không cho phép thao tác này.",
        )

    if vehicle.status != "MAINTENANCE":
        fail(
            409,
            "INVALID_VEHICLE_STATE",
            "Xe không còn ở trạng thái bảo trì.",
        )

    before = {"status": order.status}
    now = db.scalar(select(func.clock_timestamp()))
    extra = {}

    if action == "start":
        if "assigned_to" in body.model_fields_set:
            validate_assignee(db, body.assigned_to)
            order.assigned_to = body.assigned_to

        if order.assigned_to is None:
            order.assigned_to = actor.id

        validate_assignee(db, order.assigned_to)
        order.status = "IN_PROGRESS"
        order.started_at = now

    elif action == "complete":
        order.status = "COMPLETED"
        order.completed_at = now
        order.resolution_note = body.resolution_note

    else:
        order.status = "CANCELLED"
        # Lý do hủy lưu audit, không gán completed_at.
        extra["reason"] = body.reason

    order.updated_at = now

    # Không đặt vehicle.status = AVAILABLE tại đây.
    db.flush()

    audit(
        db,
        actor,
        f"MAINTENANCE_{action.upper()}",
        order,
        before=before,
        extra=extra,
    )

    return output(order)
def require_demo_gps():
    enabled = os.getenv(
        "DEMO_GPS_ENABLED", "false"
    ).lower() in {"true", "1", "yes"}

    environment = os.getenv(
        "APP_ENV", "development"
    ).strip().lower()

    if not enabled or environment not in {
        "development", "test", "demo"
    }:
        fail(
            503,
            "FEATURE_NOT_ENABLED",
            "GPS mô phỏng chưa được bật cho môi trường này.",
        )


def create_gps(db, rental, body):
    require_demo_gps()

    if rental.status != "IN_RENT":
        fail(
            409,
            "INVALID_RENTAL_STATE",
            "Chỉ ghi GPS khi chuyến đang IN_RENT.",
        )

    now = utcnow()
    recorded_at = body.recorded_at.astimezone(timezone.utc)

    if (
        rental.actual_start_time is None
        or recorded_at < rental.actual_start_time
        or recorded_at > now + timedelta(seconds=30)
    ):
        fail(
            422,
            "INVALID_GPS_TIME",
            "Thời điểm GPS không hợp lệ.",
        )

    point = GPSPoint(
        rental_id=rental.id,
        latitude=body.latitude,
        longitude=body.longitude,
        recorded_at=recorded_at,
    )

    db.add(point)
    db.flush()

    return output(point)


def latest_gps(db, rental):
    point = db.scalar(
        select(GPSPoint)
        .where(GPSPoint.rental_id == rental.id)
        .order_by(
            GPSPoint.recorded_at.desc(),
            GPSPoint.id.desc(),
        )
        .limit(1)
    )

    now = utcnow()

    is_stale = (
        point is None
        or (now - point.recorded_at).total_seconds()
        > GPS_STALE_SECONDS
    )

    return {
        "point": output(point) if point is not None else None,
        "stale_after_seconds": GPS_STALE_SECONDS,
        "is_stale": is_stale,
    }


def create_review(db, rental, body):
    if rental.status != "COMPLETED":
        fail(
            409,
            "RENTAL_NOT_COMPLETED",
            "Chỉ đánh giá chuyến đã hoàn tất.",
        )

    review_id = db.scalar(
        insert(RentalReview)
        .values(
            rental_id=rental.id,
            rating=body.rating,
            comment=body.comment,
        )
        .on_conflict_do_nothing(
            index_elements=[RentalReview.rental_id]
        )
        .returning(RentalReview.id)
    )

    if review_id is None:
        fail(
            409,
            "ALREADY_REVIEWED",
            "Chuyến này đã được đánh giá.",
        )

    review = db.get(RentalReview, review_id)
    return output(review)
