from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.v1.incidents import Manager
from app.api.v1.operations import (
    DB,
    Staff,
    IdempotencyKey,
    write_response,
)
from app.core.responses import make_response
from app.schemas.incident_finance import (
    ExternalCompensationSettlement,
    IncidentRentSettlement,
)
from app.services import incident_finance as service
from app.services import incident_rent_settlement as settlement


router = APIRouter(
    prefix="/rental-incidents",
    tags=["Incident finance"],
)


def financial_write(
    db,
    request,
    actor,
    body,
    incident_id,
    key,
    action,
    *,
    with_wallet=False,
    with_record=False,
):
    if with_record:
        execute = lambda context, record: action(
            db, context, actor, body, record
        )
    else:
        execute = lambda context: action(
            db, context, actor, body
        )

    return write_response(
        db,
        request,
        actor,
        body,
        prepare=lambda: service.lock_context(
            db,
            incident_id,
            body.evidence_ticket_id,
            with_wallet=with_wallet,
        ),
        execute=execute,
        idempotent=True,
        key=key,
        pass_idempotency_record=with_record,
    )


@router.post("/{incident_id}/compensation/external-settlement")
def settle_external_compensation(
    incident_id: int,
    body: ExternalCompensationSettlement,
    request: Request,
    db: DB,
    actor: Manager,
    key: IdempotencyKey = None,
):
    return financial_write(
        db, request, actor, body, incident_id, key,
        service.settle_external_compensation,
    )


@router.get("/{incident_id}/rent-preview")
def rent_preview(
    incident_id: int,
    db: DB,
    actor: Staff,
):
    try:
        context = service.lock_context(db, incident_id)
        return make_response(service.rent_preview(db, context))
    finally:
        # Giải phóng khóa của lần đọc nhất quán.
        db.rollback()


@router.post("/{incident_id}/settle-rent")
def settle_rent(
    incident_id: int,
    body: IncidentRentSettlement,
    request: Request,
    db: DB,
    actor: Manager,
    key: IdempotencyKey = None,
):
    return financial_write(
        db, request, actor, body, incident_id, key,
        settlement.settle_rent,
        with_wallet=True,
        with_record=True,
    )
