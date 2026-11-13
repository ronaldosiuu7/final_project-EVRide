from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.api.v1.incident_finance import financial_write
from app.api.v1.incidents import Manager
from app.api.v1.operations import (
    Actor,
    DB,
    IdempotencyKey,
)
from app.core.responses import make_response
from app.models import Rental, RentalIncident
from app.schemas.incident_finance import (
    ExpectedAmountAction,
    FinancialEvidence,
)
from app.services import incident_completion as service
from app.services import incident_finance as finance
from app.services import operations as ops


router = APIRouter(
    prefix="/rental-incidents",
    tags=["Incident completion"],
)


def write_action(
    db, request, actor, body, incident_id, key, action
):
    return financial_write(
        db,
        request,
        actor,
        body,
        incident_id,
        key,
        action,
        with_wallet=True,
        with_record=True,
    )


@router.get("/{incident_id}/finance-summary")
def finance_summary(
    incident_id: int,
    db: DB,
    actor: Actor,
):
    owner_id = db.scalar(
        select(Rental.customer_id)
        .join(
            RentalIncident,
            RentalIncident.rental_id == Rental.id,
        )
        .where(RentalIncident.id == incident_id)
    )

    if (
        owner_id is None
        or (
            actor.role not in ops.STAFF_ROLES
            and actor.id != owner_id
        )
    ):
        ops.fail(404, "NOT_FOUND", "Không tìm thấy hồ sơ.")

    try:
        context = finance.lock_context(
            db,
            incident_id,
            with_wallet=True,
        )
        return make_response(service.get_summary(db, context))
    finally:
        db.rollback()


@router.post("/{incident_id}/deposit/refund")
def refund_deposit(
    incident_id: int,
    body: ExpectedAmountAction,
    request: Request,
    db: DB,
    actor: Manager,
    key: IdempotencyKey = None,
):
    return write_action(
        db, request, actor, body, incident_id, key,
        service.refund_deposit,
    )


@router.post("/{incident_id}/close")
def close_incident(
    incident_id: int,
    body: FinancialEvidence,
    request: Request,
    db: DB,
    actor: Manager,
    key: IdempotencyKey = None,
):
    return write_action(
        db, request, actor, body, incident_id, key,
        service.close_incident,
    )
