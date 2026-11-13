from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select

from app.models import (
    AuditLog,
    Rental,
    RentalIncident,
    Station,
    SupportTicket,
    User,
    Vehicle,
)
from app.services import incidents
from app.services import operations as ops


FIRST_CHECK_DELAY = timedelta(hours=24)
CHECK_IN_ACTION = "RENTAL_CHECK_IN_RECORDED"


def server_now(db):
    return db.scalar(select(func.clock_timestamp()))


def due_expression():
    return func.coalesce(
        Rental.next_check_at,
        Rental.actual_start_time + FIRST_CHECK_DELAY,
    )


def serialize_due_item(rental, vehicle, customer, station, due_at):
    first_due_at = rental.actual_start_time + FIRST_CHECK_DELAY
    return {
        "rental_id": str(rental.id),
        "customer_id": str(rental.customer_id),
        "customer_name": customer.name,
        "customer_email": customer.email,
        "vehicle_id": str(rental.vehicle_id),
        "vehicle_name": vehicle.name,
        "vehicle_model": vehicle.model,
        "pickup_station_id": str(rental.pickup_station_id),
        "pickup_station_name": station.name,
        "status": rental.status,
        "actual_start_time": rental.actual_start_time.isoformat(),
        "first_due_at": first_due_at.isoformat(),
        "next_check_at": (
            rental.next_check_at.isoformat()
            if rental.next_check_at is not None
            else None
        ),
        "due_at": due_at.isoformat(),
    }


def list_due_check_ins(
    db,
    *,
    rental_id: int | None = None,
    station_id: int | None = None,
    page: int = 1,
    page_size: int = 20,
):
    now = server_now(db)
    due_expr = due_expression()

    active_incident_exists = (
        select(RentalIncident.id)
        .where(
            RentalIncident.rental_id == Rental.id,
            RentalIncident.status != "DISMISSED",
        )
        .exists()
    )

    filters = [
        Rental.status == "IN_RENT",
        Rental.actual_start_time.is_not(None),
        Rental.actual_end_time.is_(None),
        Rental.return_initiated_at.is_(None),
        Rental.settled_at.is_(None),
        Rental.vehicle_released_at.is_(None),
        ~active_incident_exists,
        due_expr <= now,
    ]

    if rental_id is not None:
        filters.append(Rental.id == rental_id)

    if station_id is not None:
        filters.append(Rental.pickup_station_id == station_id)

    total = db.scalar(
        select(func.count()).select_from(Rental).where(*filters)
    ) or 0

    rows = db.execute(
        select(Rental, Vehicle, User, Station, due_expr.label("due_at"))
        .join(Vehicle, Vehicle.id == Rental.vehicle_id)
        .join(User, User.id == Rental.customer_id)
        .join(Station, Station.id == Rental.pickup_station_id)
        .where(*filters)
        .order_by(due_expr.asc(), Rental.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items = [
        serialize_due_item(rental, vehicle, customer, station, due_at)
        for rental, vehicle, customer, station, due_at in rows
    ]
    return items, total


def lock_context(db, rental_id, body):
    ticket_ids = (
        (body.source_ticket_id,)
        if body.source_ticket_id is not None
        else ()
    )
    return incidents.lock_rental_context(db, rental_id, ticket_ids)


def record_check_in(db, context, actor, body):
    incidents.require_employee(actor)
    incidents.require_unreturned_rental(context)

    rental = context["rental"]
    incident = context["incident"]

    if incident is not None and incident.status != "DISMISSED":
        ops.fail(
            409,
            "INCIDENT_ALREADY_EXISTS",
            "Chuyến đã có hồ sơ sự cố đang được xử lý.",
        )

    now = server_now(db)

    if body.outcome in {"CONTINUE_RENTAL", "NO_ANSWER"}:
        due_at = (
            rental.next_check_at
            if rental.next_check_at is not None
            else rental.actual_start_time + FIRST_CHECK_DELAY
        )
        if now < due_at:
            ops.fail(
                409,
                "CHECK_IN_NOT_DUE_YET",
                "Chuyến thuê chưa đến thời điểm cần kiểm tra.",
            )

        if body.next_check_at <= now:
            ops.fail(
                422,
                "INVALID_NEXT_CHECK_TIME",
                "Lịch kiểm tra tiếp theo phải lớn hơn giờ server.",
            )

        previous_next_check = rental.next_check_at
        rental.next_check_at = body.next_check_at

        db.add(
            AuditLog(
                actor_id=actor.id,
                action=CHECK_IN_ACTION,
                resource_type="rentals",
                resource_id=str(rental.id),
                before_data={
                    "next_check_at": (
                        previous_next_check.isoformat()
                        if previous_next_check is not None
                        else None
                    )
                },
                after_data={
                    "outcome": body.outcome,
                    "note": body.note,
                    "due_at": due_at.isoformat(),
                    "next_check_at": body.next_check_at.isoformat(),
                },
                created_at=now,
            )
        )
        db.flush()

        return {
            "rental_id": str(rental.id),
            "status": rental.status,
            "outcome": body.outcome,
            "note": body.note,
            "next_check_at": rental.next_check_at.isoformat(),
            "incident": None,
        }

    # outcome == "ESCALATE": phải bảo đảm tạo hồ sơ sự cố thành công trong cùng transaction.
    if body.source_ticket_id is not None:
        source = context["tickets"][body.source_ticket_id]
        incidents.require_human_ticket(source, rental, now)
    else:
        source = SupportTicket(
            rental_id=rental.id,
            created_by=actor.id,
            report_source="STAFF",
            received_at=now,
            title=f"Kiểm tra chuyến {rental.id} - chuyển xử lý sự cố",
            description=body.note,
            status="OPEN",
            created_at=now,
            updated_at=now,
        )
        db.add(source)
        db.flush()

    previous_next_check = rental.next_check_at
    incident_result = incidents.execute_intake(
        db,
        context,
        actor,
        source,
        note=body.note,
    )

    db.add(
        AuditLog(
            actor_id=actor.id,
            action=CHECK_IN_ACTION,
            resource_type="rentals",
            resource_id=str(rental.id),
            before_data={
                "next_check_at": (
                    previous_next_check.isoformat()
                    if previous_next_check is not None
                    else None
                )
            },
            after_data={
                "outcome": "ESCALATE",
                "note": body.note,
                "source_ticket_id": str(source.id),
                "incident_id": incident_result["id"],
            },
            created_at=now,
        )
    )
    db.flush()

    return {
        "rental_id": str(rental.id),
        "status": rental.status,
        "outcome": "ESCALATE",
        "note": body.note,
        "next_check_at": None,
        "incident": incident_result,
    }
