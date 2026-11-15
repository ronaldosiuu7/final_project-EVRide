from __future__ import annotations

from sqlalchemy import select

from app.models import (
    AuditLog,
    MaintenanceOrder,
    Rental,
    RentalIncident,
    Station,
    SupportTicket,
    Vehicle,
)
from app.services import fleet
from app.services import incidents as core
from app.services import operations as ops
from app.services.rental_guards import vehicle_blocking_clause


def iso(value):
    return value.isoformat() if value is not None else None


def physical_snapshot(context):
    incident = context["incident"]
    rental = context["rental"]
    vehicle = context["vehicle"]

    return {
        "rental_status": rental.status,
        "vehicle_status": vehicle.status,
        "current_station_id": (
            str(vehicle.current_station_id)
            if vehicle.current_station_id is not None
            else None
        ),
        "recovered_at": iso(incident.recovered_at),
        "arrived_station_at": iso(incident.arrived_station_at),
        "received_station_id": (
            str(incident.received_station_id)
            if incident.received_station_id is not None
            else None
        ),
        "recovery_condition": incident.recovery_condition,
        "inspected_at": iso(incident.inspected_at),
        "vehicle_released_at": iso(rental.vehicle_released_at),
    }


def result(context):
    rental = context["rental"]

    return {
        "incident": core.public_incident(context["incident"]),
        "vehicle": ops.output(context["vehicle"]),
        "rental": {
            "id": str(rental.id),
            "status": rental.status,
            "vehicle_released_at": iso(rental.vehicle_released_at),
            "vehicle_released_by": (
                str(rental.vehicle_released_by)
                if rental.vehicle_released_by is not None
                else None
            ),
        },
    }


def lock_case_only(db, incident_id):
    """
    Dùng cho ghi nhận bằng chứng.
    Không lấy khóa hoặc cập nhật xe.
    """
    rental_id = db.scalar(
        select(RentalIncident.rental_id)
        .where(RentalIncident.id == incident_id)
    )

    if rental_id is None:
        ops.fail(404, "NOT_FOUND", "Không tìm thấy hồ sơ.")

    rental = ops.load(db, Rental, rental_id, lock=True)
    incident = ops.load(db, RentalIncident, incident_id, lock=True)

    if incident.rental_id != rental.id:
        ops.fail(409, "INCIDENT_CHANGED", "Hồ sơ đã thay đổi.")

    return {
        "rental": rental,
        "incident": incident,
    }


def lock_context(
    db,
    incident_id,
    evidence_ticket_id,
    *,
    station_id=None,
    maintenance_order_id=None,
):
    """
    Thứ tự:
        station nếu cần
        -> vehicle
        -> rental
        -> incident
        -> tickets
        -> maintenance order.
    """
    preliminary = db.execute(
        select(
            Vehicle.current_station_id.label("station_id"),
        )
        .join(Rental, Rental.vehicle_id == Vehicle.id)
        .join(
            RentalIncident,
            RentalIncident.rental_id == Rental.id,
        )
        .where(RentalIncident.id == incident_id)
    ).one_or_none()

    if preliminary is None:
        ops.fail(404, "NOT_FOUND", "Không tìm thấy hồ sơ.")

    original_station_id = preliminary.station_id

    station_to_lock = (
        station_id
        if station_id is not None
        else original_station_id
    )

    station = None
    if station_to_lock is not None:
        station = ops.load(
            db,
            Station,
            station_to_lock,
            lock=True,
        )

    context = core.lock_incident_context(
        db,
        incident_id,
        [evidence_ticket_id],
    )

    vehicle = context["vehicle"]

    if vehicle.current_station_id != original_station_id:
        ops.fail(
            409,
            "VEHICLE_LOCATION_CHANGED",
            "Vị trí xe đã thay đổi, hãy gửi lại yêu cầu.",
        )

    context["station"] = station

    if maintenance_order_id is not None:
        order = db.scalar(
            select(MaintenanceOrder)
            .where(
                MaintenanceOrder.id == maintenance_order_id,
                MaintenanceOrder.vehicle_id == vehicle.id,
            )
            .execution_options(populate_existing=True)
            .with_for_update()
        )

        if order is None:
            ops.fail(
                404,
                "MAINTENANCE_NOT_FOUND",
                "Không tìm thấy phiếu bảo trì của xe này.",
            )

        context["maintenance_order"] = order

    return context


def require_operational_case(db, context, actor):
    core.require_employee(actor)

    incident = context["incident"]
    rental = context["rental"]
    vehicle = context["vehicle"]

    if (
        incident.status not in {"CONFIRMED", "CLOSED"}
        or incident.verified_outcome
        not in {"LOSS_THEFT", "ABANDONMENT"}
    ):
        ops.fail(
            409,
            "INCIDENT_NOT_CONFIRMED",
            "Luồng này cần hồ sơ sự cố đã được xác nhận.",
        )

    if incident.status == "CLOSED":
        expected_rental_status = "CLOSED_INCIDENT"
    elif incident.verified_outcome == "LOSS_THEFT":
        expected_rental_status = "STOLEN"
    else:
        expected_rental_status = "INCIDENT_PENDING"

    if rental.status != expected_rental_status:
        ops.fail(
            409,
            "INCIDENT_RENTAL_STATE_MISMATCH",
            "Trạng thái chuyến không khớp hồ sơ sự cố.",
        )

    if rental.vehicle_released_at is not None:
        ops.fail(
            409,
            "VEHICLE_ALREADY_RELEASED",
            "Xe đã được giải phóng khỏi hồ sơ này. "
            "Không được thay đổi xe qua hồ sơ cũ.",
        )

    other_rental = db.scalar(
        select(Rental.id)
        .where(
            Rental.vehicle_id == vehicle.id,
            Rental.id != rental.id,
            vehicle_blocking_clause(),
        )
        .limit(1)
    )

    if other_rental is not None:
        ops.fail(
            409,
            "VEHICLE_USED_BY_ANOTHER_RENTAL",
            "Xe đang thuộc quyền sử dụng của chuyến khác.",
        )


def require_evidence(context, body, now):
    ticket = context["tickets"][body.evidence_ticket_id]

    core.require_human_ticket(
        ticket,
        context["rental"],
        now,
    )

    return ticket


def require_time(value, lower_bound, now, field_name):
    if lower_bound is None or not lower_bound <= value <= now:
        ops.fail(
            422,
            "INVALID_EVENT_TIME",
            f"{field_name} không hợp lệ với trình tự nghiệp vụ.",
        )


def require_at_received_station(context):
    incident = context["incident"]
    vehicle = context["vehicle"]
    station = context["station"]

    if (
        incident.arrived_station_at is None
        or station is None
        or vehicle.current_station_id != station.id
        or incident.received_station_id != station.id
    ):
        ops.fail(
            409,
            "VEHICLE_NOT_AT_RECEIVED_STATION",
            "Xe chưa được tiếp nhận tại trạm của hồ sơ.",
        )

    if vehicle.status != "MAINTENANCE":
        ops.fail(
            409,
            "INVALID_VEHICLE_STATE",
            "Xe phải đang ở trạng thái bảo trì.",
        )

    return station


def record_physical_event(
    db,
    context,
    actor,
    action,
    now,
    ticket,
    *,
    before,
    extra=None,
):
    core.record_event(
        db,
        context["incident"],
        actor,
        action,
        now,
        before=before,
        extra={
            "physical_state": physical_snapshot(context),
            "evidence_ticket": core.ticket_snapshot(ticket),
            **(extra or {}),
        },
    )


def create_evidence(db, context, actor, body):
    core.require_employee(actor)

    incident = context["incident"]

    if incident.status not in {
        "INVESTIGATING",
        "CONFIRMED",
        "CLOSED",
    }:
        ops.fail(
            409,
            "INVALID_INCIDENT_STATE",
            "Không tạo bằng chứng qua luồng này cho hồ sơ hiện tại.",
        )

    now = core.server_now(db)

    ticket = SupportTicket(
        rental_id=incident.rental_id,
        created_by=actor.id,
        report_source="STAFF",
        received_at=now,
        title=body.title,
        description=body.description,
        status="OPEN",
        created_at=now,
        updated_at=now,
    )

    db.add(ticket)
    db.flush()

    incident.updated_at = now

    core.record_event(
        db,
        incident,
        actor,
        "RENTAL_INCIDENT_EVIDENCE_CREATED",
        now,
        extra={
            "evidence_ticket": core.ticket_snapshot(ticket),
        },
    )

    db.flush()
    return ops.output(ticket)


def record_recovery(db, context, actor, body):
    require_operational_case(db, context, actor)

    incident = context["incident"]
    rental = context["rental"]
    vehicle = context["vehicle"]

    if incident.recovered_at is not None:
        ops.fail(
            409,
            "RECOVERY_ALREADY_RECORDED",
            "Hồ sơ đã ghi nhận thu hồi xe.",
        )

    expected_vehicle_status = (
        "STOLEN"
        if incident.verified_outcome == "LOSS_THEFT"
        else "SUSPECTED_STOLEN"
    )

    if (
        vehicle.status != expected_vehicle_status
        or vehicle.current_station_id is not None
    ):
        ops.fail(
            409,
            "INVALID_RECOVERY_STATE",
            "Trạng thái hoặc vị trí xe không phù hợp để ghi thu hồi.",
        )

    now = core.server_now(db)
    ticket = require_evidence(context, body, now)

    require_time(
        body.recovered_at,
        rental.actual_start_time,
        now,
        "recovered_at",
    )

    before = physical_snapshot(context)

    incident.recovered_at = body.recovered_at
    incident.received_by = actor.id
    incident.recovery_note = body.note
    incident.updated_at = now

    if incident.verified_outcome == "ABANDONMENT":
        incident.billing_cutoff_at = body.recovered_at
        incident.billing_cutoff_reason = "RECOVERY"

    # LOSS_THEFT giữ nguyên cutoff từ báo cáo hợp lệ.
    vehicle.status = "MAINTENANCE"

    record_physical_event(
        db,
        context,
        actor,
        "RENTAL_INCIDENT_RECOVERED",
        now,
        ticket,
        before=before,
        extra={"note": body.note},
    )

    db.flush()
    return result(context)


def record_arrival(db, context, actor, body):
    require_operational_case(db, context, actor)

    incident = context["incident"]
    vehicle = context["vehicle"]
    station = context["station"]

    if (
        incident.recovered_at is None
        or incident.arrived_station_at is not None
        or incident.recovery_condition is not None
        or vehicle.current_station_id is not None
        or vehicle.status != "MAINTENANCE"
    ):
        ops.fail(
            409,
            "INVALID_ARRIVAL_STATE",
            "Xe phải đã thu hồi, chưa về trạm và chưa ghi tình trạng kiểm tra ban đầu.",
        )

    now = core.server_now(db)
    ticket = require_evidence(context, body, now)

    require_time(
        body.arrived_at,
        incident.recovered_at,
        now,
        "arrived_at",
    )

    inspected_at = (
        body.inspected_at if body.inspected_at is not None else body.arrived_at
    )
    require_time(
        inspected_at,
        body.arrived_at,
        now,
        "inspected_at",
    )

    if station is None or station.id != body.station_id:
        ops.fail(409, "INVALID_STATION", "Trạm tiếp nhận không hợp lệ.")

    if not fleet.station_is_open(station, now):
        ops.fail(
            409,
            "STATION_UNAVAILABLE",
            "Trạm tiếp nhận hiện không mở.",
        )

    if fleet.count_free_slots(db, station.id) <= 0:
        ops.fail(409, "STATION_FULL", "Trạm đã hết chỗ.")

    before = physical_snapshot(context)

    incident.arrived_station_at = body.arrived_at
    incident.received_station_id = station.id
    incident.station_received_by = actor.id
    incident.recovery_condition = body.condition
    incident.inspected_at = inspected_at
    incident.inspected_by = actor.id
    incident.inspection_note = body.note
    incident.inspection_ticket_id = ticket.id
    incident.updated_at = now

    vehicle.current_station_id = station.id

    record_physical_event(
        db,
        context,
        actor,
        "RENTAL_INCIDENT_ARRIVED",
        now,
        ticket,
        before=before,
        extra={
            "note": body.note,
            "condition": body.condition,
            "inspected_at": inspected_at.isoformat(),
        },
    )

    db.flush()
    return result(context)


def release_vehicle(db, context, actor, body):
    if actor.role != "MANAGER":
        ops.fail(
            403,
            "MANAGER_REQUIRED",
            "Chỉ MANAGER được giải phóng xe.",
        )

    require_operational_case(db, context, actor)
    station = require_at_received_station(context)

    incident = context["incident"]
    rental = context["rental"]
    vehicle = context["vehicle"]
    order = context["maintenance_order"]

    if incident.recovery_condition not in {"INTACT", "REPAIRABLE"}:
        ops.fail(
            409,
            "VEHICLE_NOT_RELEASABLE",
            "Xe chưa đủ điều kiện hoặc không thể sửa chữa.",
        )

    latest_linked_order_id = db.scalar(
        select(MaintenanceOrder.id)
        .where(
            MaintenanceOrder.incident_id == incident.id,
            MaintenanceOrder.vehicle_id == vehicle.id,
        )
        .order_by(MaintenanceOrder.id.desc())
        .limit(1)
    )

    if latest_linked_order_id is not None:
        if order.incident_id != incident.id or order.id != latest_linked_order_id:
            ops.fail(
                409,
                "MAINTENANCE_NOT_LINKED",
                "Phải dùng phiếu bảo trì gần nhất được mở "
                "qua hồ sơ sự cố này.",
            )
    else:
        latest_order_event = db.scalar(
            select(AuditLog)
            .where(
                AuditLog.resource_type == "rental_incidents",
                AuditLog.resource_id == str(incident.id),
                AuditLog.action
                == "RENTAL_INCIDENT_MAINTENANCE_CREATED",
            )
            .order_by(AuditLog.id.desc())
            .limit(1)
        )

        if (
            latest_order_event is None
            or latest_order_event.after_data.get("maintenance_order_id")
            != str(order.id)
        ):
            ops.fail(
                409,
                "MAINTENANCE_NOT_LINKED",
                "Phải dùng phiếu bảo trì gần nhất được mở "
                "qua hồ sơ sự cố này.",
            )

    now = core.server_now(db)
    ticket = require_evidence(context, body, now)

    if (
        order.status != "COMPLETED"
        or order.completed_at is None
        or order.opened_at < incident.inspected_at
        or order.completed_at > now
    ):
        ops.fail(
            409,
            "MAINTENANCE_NOT_COMPLETED",
            "Phiếu kiểm tra/sửa chữa chưa hoàn tất hợp lệ.",
        )

    if ticket.received_at < order.completed_at:
        ops.fail(
            422,
            "RELEASE_EVIDENCE_TOO_EARLY",
            "Cần ticket nghiệm thu được lập sau khi "
            "phiếu bảo trì hoàn tất.",
        )

    active_order = db.scalar(
        select(MaintenanceOrder.id)
        .where(
            MaintenanceOrder.vehicle_id == vehicle.id,
            MaintenanceOrder.status.in_(("OPEN", "IN_PROGRESS")),
        )
        .limit(1)
    )

    if active_order is not None:
        ops.fail(
            409,
            "ACTIVE_MAINTENANCE_ORDER",
            "Xe vẫn còn phiếu bảo trì đang xử lý.",
        )

    if station.status != "ACTIVE":
        ops.fail(
            409,
            "STATION_UNAVAILABLE",
            "Trạm hiện không hoạt động.",
        )

    if vehicle.battery_percent < 30:
        ops.fail(
            409,
            "BATTERY_TOO_LOW",
            "Cần sạc xe đạt ít nhất 30% trước khi giải phóng.",
        )

    before = physical_snapshot(context)

    rental.vehicle_released_at = now
    rental.vehicle_released_by = actor.id
    rental.vehicle_release_note = body.note

    vehicle.status = "AVAILABLE"
    incident.updated_at = now

    record_physical_event(
        db,
        context,
        actor,
        "RENTAL_INCIDENT_VEHICLE_RELEASED",
        now,
        ticket,
        before=before,
        extra={
            "maintenance_order_id": str(order.id),
            "note": body.note,
        },
    )

    # Không đổi rental.status hoặc incident.status.
    # Không xử lý tiền thuê, bồi thường hay số dư ví.
    db.flush()

    return result(context)
