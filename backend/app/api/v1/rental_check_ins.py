from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.api.v1.operations import (
    DB,
    IdempotencyKey,
    Staff,
    write_response,
)
from app.core.responses import make_list_response
from app.schemas.rental_check_ins import RentalCheckInAction
from app.services import rental_check_ins as service


router = APIRouter(
    prefix="/rental-check-ins",
    tags=["Rental check-ins"],
)


@router.get("")
def list_due_check_ins(
    db: DB,
    actor: Staff,
    rental_id: int | None = Query(None, gt=0),
    station_id: int | None = Query(None, gt=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    rows, total = service.list_due_check_ins(
        db,
        rental_id=rental_id,
        station_id=station_id,
        page=page,
        page_size=page_size,
    )
    return make_list_response(
        rows,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/{rental_id}")
def record_check_in(
    rental_id: int,
    body: RentalCheckInAction,
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
        prepare=lambda: service.lock_context(db, rental_id, body),
        execute=lambda context: service.record_check_in(
            db, context, actor, body
        ),
        idempotent=True,
        key=key,
    )
