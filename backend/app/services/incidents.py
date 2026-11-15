from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, func, or_, select

from app.models import (
    AuditLog,
    Rental,
    RentalIncident,
    SupportTicket,
    Transaction,
    Vehicle,
)
from app.services import operations as ops


INCIDENT_ACTIONS = (
    "RENTAL_INCIDENT_INTAKE",
    "RENTAL_INCIDENT_REOPENED",
    "RENTAL_INCIDENT_ASSIGNED",
    "RENTAL_INCIDENT_FALSE_ALARM",
    "RENTAL_INCIDENT_VERIFIED",
    "RENTAL_INCIDENT_EVIDENCE_CREATED",
    "RENTAL_INCIDENT_RECOVERED",
    "RENTAL_INCIDENT_ARRIVED",
    "RENTAL_INCIDENT_INSPECTED",
    "RENTAL_INCIDENT_MAINTENANCE_CREATED",
    "RENTAL_INCIDENT_VEHICLE_RELEASED",
    "RENTAL_INCIDENT_VALUE_APPROVED",
    "RENTAL_INCIDENT_COMPENSATION_PROPOSED",
    "RENTAL_INCIDENT_COMPENSATION_DISPUTED",
    "RENTAL_INCIDENT_COMPENSATION_APPROVED",
    "RENTAL_INCIDENT_RENT_SETTLED",
    "RENTAL_INCIDENT_COMPENSATION_SETTLED",
    "RENTAL_INCIDENT_RECOVERY_FINANCE_APPLIED",
    "RENTAL_INCIDENT_COMPENSATION_REFUNDED",
    "RENTAL_INCIDENT_DEPOSIT_REFUNDED",
    "RENTAL_INCIDENT_COMPENSATION_REVIEW_CHANGED",
    "RENTAL_INCIDENT_EXTERNAL_COMPENSATION_RECORDED",
    "RENTAL_INCIDENT_EXTERNAL_COMPENSATION_SETTLED",
    "RENTAL_INCIDENT_CLOSED",
)


def server_now(db):
    return db.scalar(select(func.clock_timestamp()))


def public_incident(incident):
    result = ops.output(incident)

    # Giữ convention ID dưới dạng chuỗi.
    for column in incident.__table__.columns:
        name = column.name

        if name.endswith("_by"):
            value = getattr(incident, name)
            result[name] = str(value) if value is not None else None

    return result


def incident_snapshot(incident):
    return {
        "status": incident.status,
        "assigned_to": (
            str(incident.assigned_to)
            if incident.assigned_to is not None
            else None
        ),
        "verified_outcome": incident.verified_outcome,
        "verification_reason": incident.verification_reason,
        "verified_by": (
            str(incident.verified_by)
            if incident.verified_by is not None
            else None
        ),
        "verified_at": (
            incident.verified_at.isoformat()
            if incident.verified_at is not None
            else None
        ),
        "valid_report_ticket_id": (
            str(incident.valid_report_ticket_id)
            if incident.valid_report_ticket_id is not None
            else None
        ),
        "billing_cutoff_at": (
            incident.billing_cutoff_at.isoformat()
            if incident.billing_cutoff_at is not None
            else None
        ),
        "billing_cutoff_reason": incident.billing_cutoff_reason,
    }


def ticket_snapshot(ticket):
    return {
        "id": str(ticket.id),
        "report_source": ticket.report_source,
        "created_by": (
            str(ticket.created_by)
            if ticket.created_by is not None
            else None
        ),
        "received_at": (
            ticket.received_at.isoformat()
            if ticket.received_at is not None
            else None
        ),
        "title": ticket.title,
        "description": ticket.description,
    }


def record_event(
    db,
    incident,
    actor,
    action,
    now,
    *,
    before=None,
    extra=None,
):
    db.add(
        AuditLog(
            actor_id=actor.id,
            action=action,
            resource_type="rental_incidents",
            resource_id=str(incident.id),
            before_data=before,
            after_data={
                **incident_snapshot(incident),
                **(extra or {}),
            },
            created_at=now,
        )
    )


def latest_false_alarm(db, incident_id):
    return db.scalar(
        select(AuditLog)
        .where(
            AuditLog.resource_type == "rental_incidents",
            AuditLog.resource_id == str(incident_id),
            AuditLog.action == "RENTAL_INCIDENT_FALSE_ALARM",
        )
        .order_by(AuditLog.id.desc())
        .limit(1)
    )


def event_query(incident_id):
    return (
        select(AuditLog)
        .where(
            AuditLog.resource_type == "rental_incidents",
            AuditLog.resource_id == str(incident_id),
            AuditLog.action.in_(INCIDENT_ACTIONS),
        )
        .order_by(AuditLog.created_at, AuditLog.id)
    )


def lock_rental_context(db, rental_id, ticket_ids=()):
    """
    Thứ tự khóa:
        vehicle -> rental -> incident -> tickets theo ID.

    Chỉ lấy khóa và xác định tài nguyên tại đây.
    Kiểm tra trạng thái nghiệp vụ nằm trong execute,
    để idempotency vẫn replay được request đã thành công.
    """
    vehicle_id = db.scalar(
        select(Rental.vehicle_id).where(Rental.id == rental_id)
    )

    if vehicle_id is None:
        ops.fail(404, "NOT_FOUND", "Không tìm thấy chuyến thuê.")

    vehicle = ops.load(db, Vehicle, vehicle_id, lock=True)
    rental = ops.load(db, Rental, rental_id, lock=True)

    if rental.vehicle_id != vehicle.id:
        ops.fail(
            409,
            "RENTAL_CHANGED",
            "Xe của chuyến thuê đã thay đổi.",
        )

    incident = db.scalar(
        select(RentalIncident)
        .where(RentalIncident.rental_id == rental.id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )

    requested_ids = {
        ticket_id
        for ticket_id in ticket_ids
        if ticket_id is not None
    }

    tickets = []
    if requested_ids:
        tickets = db.scalars(
            select(SupportTicket)
            .where(
                SupportTicket.rental_id == rental.id,
                SupportTicket.id.in_(requested_ids),
            )
            .order_by(SupportTicket.id)
            .execution_options(populate_existing=True)
            .with_for_update()
        ).all()

    by_id = {ticket.id: ticket for ticket in tickets}

    if requested_ids - set(by_id):
        ops.fail(
            404,
            "TICKET_NOT_FOUND",
            "Ticket không tồn tại hoặc không thuộc chuyến này.",
        )

    return {
        "rental": rental,
        "vehicle": vehicle,
        "incident": incident,
        "tickets": by_id,
    }


def lock_incident_context(db, incident_id, ticket_ids=()):
    rental_id = db.scalar(
        select(RentalIncident.rental_id)
        .where(RentalIncident.id == incident_id)
    )

    if rental_id is None:
        ops.fail(404, "NOT_FOUND", "Không tìm thấy hồ sơ sự cố.")

    context = lock_rental_context(db, rental_id, ticket_ids)

    incident = context["incident"]
    if incident is None or incident.id != incident_id:
        ops.fail(
            409,
            "INCIDENT_CHANGED",
            "Hồ sơ sự cố đã thay đổi.",
        )

    return context


def require_employee(actor):
    if actor.role not in ops.STAFF_ROLES:
        ops.fail(403, "FORBIDDEN", "Không đủ quyền.")


def require_unreturned_rental(context):
    rental = context["rental"]

    if (
        rental.status != "IN_RENT"
        or rental.actual_start_time is None
        or rental.actual_end_time is not None
        or rental.return_initiated_at is not None
        or rental.settled_at is not None
        or rental.vehicle_released_at is not None
    ):
        ops.fail(
            409,
            "INCIDENT_INTAKE_NOT_ALLOWED",
            "Luồng nghi mất chỉ áp dụng cho chuyến "
            "đang sử dụng và chưa tiếp nhận trả xe.",
        )


def require_human_ticket(ticket, rental, now):
    if (
        ticket.report_source not in {"CUSTOMER", "STAFF"}
        or ticket.created_by is None
        or ticket.received_at is None
        or ticket.check_cycle is not None
    ):
        ops.fail(
            422,
            "HUMAN_REPORT_REQUIRED",
            "Cần ticket của khách hoặc nhân viên "
            "có thời điểm tiếp nhận đã lưu.",
        )

    if not rental.actual_start_time <= ticket.received_at <= now:
        ops.fail(
            422,
            "INVALID_REPORT_TIME",
            "Thời điểm nhận báo cáo không hợp lệ với chuyến thuê.",
        )


def require_reopenable(db, incident):
    protected_fields = (
        "recovered_at",
        "arrived_station_at",
        "recovery_condition",
        "vehicle_value_snapshot",
        "approved_repair_cost",
        "recovered_asset_value",
        "compensation_proposed_amount",
        "compensation_assessed_amount",
        "rent_settled_at",
        "compensation_settled_at",
        "closed_at",
    )

    has_protected_data = any(
        getattr(incident, name) is not None
        for name in protected_fields
    )

    has_transaction = db.scalar(
        select(Transaction.id)
        .where(Transaction.incident_id == incident.id)
        .limit(1)
    )

    if (
        incident.status != "DISMISSED"
        or incident.agreement_status != "PENDING"
        or has_protected_data
        or has_transaction is not None
    ):
        ops.fail(
            409,
            "INCIDENT_REOPEN_NOT_ALLOWED",
            "Hồ sơ có dữ liệu cần được xử lý theo "
            "quy trình riêng, không được đặt lại.",
        )


def execute_intake(
    db,
    context,
    actor,
    source,
    *,
    note: str,
    assigned_to: int | None = None,
):
    require_employee(actor)
    require_unreturned_rental(context)

    rental = context["rental"]
    vehicle = context["vehicle"]
    incident = context["incident"]

    now = server_now(db)

    if vehicle.status != "RENTED":
        ops.fail(
            409,
            "INVALID_VEHICLE_STATE",
            "Xe không ở trạng thái đang được khách sử dụng.",
        )

    require_human_ticket(source, rental, now)

    before = None
    action = "RENTAL_INCIDENT_INTAKE"

    if incident is not None:
        if incident.status != "DISMISSED":
            ops.fail(
                409,
                "INCIDENT_ALREADY_EXISTS",
                "Chuyến đã có hồ sơ sự cố đang được xử lý.",
            )

        require_reopenable(db, incident)

        if (
            incident.verified_at is None
            or source.received_at <= incident.verified_at
        ):
            ops.fail(
                409,
                "NEW_REPORT_REQUIRED",
                "Cần báo cáo mới được tiếp nhận sau "
                "quyết định báo nhầm trước đó.",
            )

        before = incident_snapshot(incident)
        action = "RENTAL_INCIDENT_REOPENED"

        # Quyết định cũ vẫn còn trong audit.
        incident.verified_outcome = None
        incident.verification_reason = None
        incident.verified_by = None
        incident.verified_at = None

    else:
        incident = RentalIncident(
            rental_id=rental.id,
            created_at=now,
        )
        db.add(incident)

    incident.status = "INVESTIGATING"
    incident.assigned_to = assigned_to
    incident.updated_at = now

    rental.next_check_at = None
    vehicle.status = "SUSPECTED_STOLEN"

    # Rental vẫn IN_RENT; chưa xác định cutoff hoặc tiền phải thu.
    db.flush()

    record_event(
        db,
        incident,
        actor,
        action,
        now,
        before=before,
        extra={
            "note": note,
            "source_ticket": ticket_snapshot(source),
            "rental_status": rental.status,
            "vehicle_status": vehicle.status,
        },
    )

    db.flush()
    return public_incident(incident)


def intake_incident(db, context, actor, body):
    source = context["tickets"][body.source_ticket_id]
    return execute_intake(
        db,
        context,
        actor,
        source,
        note=body.note,
    )


def verify_incident(db, context, actor, body):
    if actor.role != "MANAGER":
        ops.fail(
            403,
            "MANAGER_REQUIRED",
            "Chỉ MANAGER được duyệt kết luận.",
        )

    require_unreturned_rental(context)

    rental = context["rental"]
    vehicle = context["vehicle"]
    incident = context["incident"]

    if (
        incident.status != "INVESTIGATING"
        or vehicle.status != "SUSPECTED_STOLEN"
    ):
        ops.fail(
            409,
            "INVALID_INCIDENT_STATE",
            "Hồ sơ chưa ở trạng thái được phép kết luận.",
        )

    now = server_now(db)
    evidence = context["tickets"][body.evidence_ticket_id]
    require_human_ticket(evidence, rental, now)

    report = None

    if body.outcome == "LOSS_THEFT":
        report = context["tickets"][body.valid_report_ticket_id]
        require_human_ticket(report, rental, now)

        previous_false_alarm = latest_false_alarm(db, incident.id)

        if previous_false_alarm is not None:
            previous_time = datetime.fromisoformat(
                previous_false_alarm.after_data["verified_at"]
            )

            if report.received_at <= previous_time:
                ops.fail(
                    422,
                    "STALE_VALID_REPORT",
                    "Không dùng lại báo cáo trước quyết định "
                    "báo nhầm để chốt sự cố mới.",
                )

    if body.outcome == "FALSE_ALARM":
        if (
            body.next_check_at is None
            or body.next_check_at <= now
        ):
            ops.fail(
                422,
                "INVALID_NEXT_CHECK_TIME",
                "Lịch kiểm tra tiếp phải lớn hơn giờ server.",
            )

    before = {
        **incident_snapshot(incident),
        "rental_status": rental.status,
        "vehicle_status": vehicle.status,
    }

    incident.verified_outcome = body.outcome
    incident.verification_reason = body.reason
    incident.verified_by = actor.id
    incident.verified_at = now
    incident.updated_at = now

    if body.outcome == "FALSE_ALARM":
        incident.status = "DISMISSED"
        vehicle.status = "RENTED"
        rental.next_check_at = body.next_check_at

        action = "RENTAL_INCIDENT_FALSE_ALARM"

    elif body.outcome == "LOSS_THEFT":
        incident.status = "CONFIRMED"

        incident.valid_report_ticket_id = report.id
        incident.valid_report_received_at = report.received_at

        incident.billing_cutoff_at = report.received_at
        incident.billing_cutoff_reason = "VALID_REPORT"

        rental.status = "STOLEN"
        vehicle.status = "STOLEN"

        action = "RENTAL_INCIDENT_VERIFIED"

    else:
        incident.status = "CONFIRMED"
        rental.status = "INCIDENT_PENDING"

        # Chưa thu hồi thực tế nên chưa chốt cutoff.
        # Xe tiếp tục bị chặn thuê.
        action = "RENTAL_INCIDENT_VERIFIED"

    record_event(
        db,
        incident,
        actor,
        action,
        now,
        before=before,
        extra={
            "evidence_ticket": ticket_snapshot(evidence),
            "valid_report_ticket": (
                ticket_snapshot(report)
                if report is not None
                else None
            ),
            "next_check_at": (
                body.next_check_at.isoformat()
                if body.next_check_at is not None
                else None
            ),
            "rental_status": rental.status,
            "vehicle_status": vehicle.status,
        },
    )

    # Không tạo hóa đơn, giao dịch hoặc biến động ví.
    # Không ghi actual_end_time/RETURN giả.
    db.flush()

    return public_incident(incident)
