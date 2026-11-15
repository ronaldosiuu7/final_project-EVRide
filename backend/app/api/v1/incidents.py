from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from app.api.v1.operations import (
    DB,
    Staff,
    IdempotencyKey,
    paginated,
    write_response,
)
from app.core.dependencies import require_role
from app.core.responses import make_response
from app.models import RentalIncident, User
from app.schemas.incidents import (
    IncidentIntake,
    IncidentVerify,
)
from app.services import incidents as service
from app.services import operations as ops


router = APIRouter(tags=["Rental incidents"])

Manager = Annotated[
    User,
    Depends(require_role("MANAGER")),
]


@router.post("/rentals/{rental_id}/incident/intake")
def intake_incident(
    rental_id: int,
    body: IncidentIntake,
    request: Request,
    db: DB,
    actor: Staff,
    key: IdempotencyKey = None,
):
    return write_response(
        db,
        request,
        actor,
        body,
        prepare=lambda: service.lock_rental_context(
            db,
            rental_id,
            [body.source_ticket_id],
        ),
        execute=lambda context: service.intake_incident(
            db, context, actor, body
        ),
        idempotent=True,
        key=key,
    )


@router.get("/rental-incidents")
def list_incidents(
    db: DB,
    actor: Staff,
    status_filter: Literal[
        "OPEN",
        "INVESTIGATING",
        "CONFIRMED",
        "DISMISSED",
        "CLOSED",
    ] | None = Query(None, alias="status"),
    rental_id: int | None = Query(None, gt=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(RentalIncident)

    if status_filter is not None:
        query = query.where(
            RentalIncident.status == status_filter
        )

    if rental_id is not None:
        query = query.where(
            RentalIncident.rental_id == rental_id
        )

    # paginated hiện dùng output chung.
    # Các ID kết thúc _by được bổ sung ở bước 5.
    return paginated(
        db,
        query.order_by(RentalIncident.id.desc()),
        page,
        page_size,
    )


@router.get("/rental-incidents/{incident_id}")
def get_incident(
    incident_id: int,
    db: DB,
    actor: Staff,
):
    incident = ops.load(db, RentalIncident, incident_id)
    return make_response(service.public_incident(incident))


@router.get("/rental-incidents/{incident_id}/events")
def list_incident_events(
    incident_id: int,
    db: DB,
    actor: Staff,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    ops.load(db, RentalIncident, incident_id)

    return paginated(
        db,
        service.event_query(incident_id),
        page,
        page_size,
    )


@router.post("/rental-incidents/{incident_id}/verify")
def verify_incident(
    incident_id: int,
    body: IncidentVerify,
    request: Request,
    db: DB,
    actor: Manager,
    key: IdempotencyKey = None,
):
    return write_response(
        db,
        request,
        actor,
        body,
        prepare=lambda: service.lock_incident_context(
            db,
            incident_id,
            [
                body.evidence_ticket_id,
                body.valid_report_ticket_id,
            ],
        ),
        execute=lambda context: service.verify_incident(
            db, context, actor, body
        ),
        idempotent=True,
        key=key,
    )
