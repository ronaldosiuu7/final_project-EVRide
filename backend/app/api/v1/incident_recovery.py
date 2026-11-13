from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.v1.incidents import Manager
from app.api.v1.operations import (
    DB,
    Staff,
    IdempotencyKey,
    write_response,
)
from app.schemas.incident_recovery import (
    IncidentArrivalCreate,
    IncidentRecoveryCreate,
    IncidentVehicleRelease,
)
from app.schemas.operations import TicketCreate
from app.services import incident_recovery as service


router = APIRouter(
    prefix="/rental-incidents",
    tags=["Incident recovery"],
)


@router.post("/{incident_id}/evidence-tickets", status_code=201)
def create_evidence(
    incident_id: int,
    body: TicketCreate,
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
        prepare=lambda: service.lock_case_only(db, incident_id),
        execute=lambda context: service.create_evidence(
            db, context, actor, body
        ),
        status_code=201,
        idempotent=True,
        key=key,
    )


@router.post("/{incident_id}/recovery")
def record_recovery(
    incident_id: int,
    body: IncidentRecoveryCreate,
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
        prepare=lambda: service.lock_context(
            db,
            incident_id,
            body.evidence_ticket_id,
        ),
        execute=lambda context: service.record_recovery(
            db, context, actor, body
        ),
        idempotent=True,
        key=key,
    )


@router.post("/{incident_id}/arrival")
def record_arrival(
    incident_id: int,
    body: IncidentArrivalCreate,
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
        prepare=lambda: service.lock_context(
            db,
            incident_id,
            body.evidence_ticket_id,
            station_id=body.station_id,
        ),
        execute=lambda context: service.record_arrival(
            db, context, actor, body
        ),
        idempotent=True,
        key=key,
    )


@router.post("/{incident_id}/release-vehicle")
def release_vehicle(
    incident_id: int,
    body: IncidentVehicleRelease,
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
        prepare=lambda: service.lock_context(
            db,
            incident_id,
            body.evidence_ticket_id,
            maintenance_order_id=body.maintenance_order_id,
        ),
        execute=lambda context: service.release_vehicle(
            db, context, actor, body
        ),
        idempotent=True,
        key=key,
    )
