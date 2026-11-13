"""Rental lifecycle, return quotes, invoices, and transactions."""
from __future__ import annotations
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.core.responses import make_list_response, make_response
from app.database import get_db
from app.models import (
    Handover,
    Invoice,
    Rental,
    Transaction,
    User,
)
from app.schemas.rental import (
    InitiateReturnRequest,
    OperationalCancelRequest,
    PickupRequest,
    RentalCreate,
    ReturnQuoteRequest,
    ReturnRequest,
    handover_out,
    invoice_out,
    quote_out,
    rental_out,
    transaction_out,
)
from app.schemas.wallet import wallet_out
from app.services.errors import ServiceError
from app.services.idempotency import (
    begin_idempotent_request,
    complete_idempotent_request,
)
from app.services.rentals import (
    cancel_operational_rental,
    cancel_rental,
    create_rental,
    create_return_quote,
    get_rental_snapshot,
    initiate_return,
    pickup_rental,
    settle_return,
)

router = APIRouter(tags=["Rentals"])


def _raise_service_error(error: ServiceError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from error


def _rental_or_404(session: Session, rental_id: int, user: User) -> Rental:
    rental = session.get(Rental, rental_id)
    if rental is None or (
        user.role == "CUSTOMER" and rental.customer_id != user.id
    ):
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Lượt thuê không tồn tại."})
    return rental


def _commit_idempotent_response(
    session: Session,
    record,
    body: dict,
    status_code: int,
) -> JSONResponse:
    encoded = jsonable_encoder(body)
    complete_idempotent_request(
        record, status_code=status_code, response_body=encoded
    )
    session.commit()
    return JSONResponse(status_code=status_code, content=encoded)


def _idempotency_error_response(session: Session, record, error: ServiceError):
    if record is None:
        session.rollback()
        raise HTTPException(
            status_code=error.status_code,
            detail={"code": error.code, "message": error.message},
        ) from error
    has_expiration = any(
        isinstance(row, Rental) and row.status == "EXPIRED" for row in session.dirty
    )
    body = {
        "error": {"code": error.code, "message": error.message},
        "meta": make_response(None)["meta"],
    }
    if has_expiration:
        complete_idempotent_request(
            record, status_code=error.status_code, response_body=body
        )
        session.commit()
        return JSONResponse(status_code=error.status_code, content=body)
    session.rollback()
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from error


@router.post("/rentals", status_code=status.HTTP_201_CREATED)
def post_rental(
    body: RentalCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("CUSTOMER")),
    db: Session = Depends(get_db),
):
    record = None
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path="/api/v1/rentals",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        rental = create_rental(
            db,
            customer_id=current_user.id,
            vehicle_id=body.vehicle_id,
            pickup_station_id=body.pickup_station_id,
        )
        snapshot = get_rental_snapshot(db, rental)
        now = datetime.now(timezone.utc)
        response_body = make_response(rental_out(rental, snapshot, now=now))
        return _commit_idempotent_response(db, record, response_body, 201)
    except ServiceError as error:
        return _idempotency_error_response(db, record, error)


@router.get("/rentals")
def list_rentals(
    status_filter: str | None = Query(default=None, alias="status"),
    vehicle_id: int | None = None,
    pickup_station_id: int | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    customer_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    predicates = []
    if current_user.role == "CUSTOMER":
        predicates.append(Rental.customer_id == current_user.id)
    elif customer_id is not None:
        predicates.append(Rental.customer_id == customer_id)
    if status_filter:
        predicates.append(Rental.status == status_filter.upper())
    if vehicle_id is not None:
        predicates.append(Rental.vehicle_id == vehicle_id)
    if pickup_station_id is not None:
        predicates.append(Rental.pickup_station_id == pickup_station_id)
    if created_from is not None:
        predicates.append(Rental.created_at >= created_from)
    if created_to is not None:
        predicates.append(Rental.created_at <= created_to)
    count_query = select(func.count()).select_from(Rental).where(*predicates)
    rentals = db.scalars(
        select(Rental)
        .where(*predicates)
        .order_by(Rental.created_at.desc(), Rental.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    total = db.scalar(count_query) or 0
    now = datetime.now(timezone.utc)
    data = [
        rental_out(rental, get_rental_snapshot(db, rental), now=now)
        for rental in rentals
    ]
    for row in data:
        if row["status"] == "RESERVED" and row["expires_at"] <= now:
            row["status"] = "EXPIRED"
    return make_list_response(data, page=page, page_size=page_size, total=total)


@router.get("/rentals/{rental_id}")
def get_rental(
    rental_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rental = _rental_or_404(db, rental_id, current_user)
    now = datetime.now(timezone.utc)
    data = rental_out(rental, get_rental_snapshot(db, rental), now=now)
    if data["status"] == "RESERVED" and rental.expires_at <= now:
        data["status"] = "EXPIRED"
    return make_response(data)


@router.post("/rentals/{rental_id}/cancel")
def post_cancel(
    rental_id: int,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("CUSTOMER")),
    db: Session = Depends(get_db),
):
    record = None
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path=f"/api/v1/rentals/{rental_id}/cancel",
            key=idempotency_key,
            payload={},
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        rental = cancel_rental(db, rental_id=rental_id, customer_id=current_user.id)
        response_body = make_response(rental_out(rental, get_rental_snapshot(db, rental)))
        return _commit_idempotent_response(db, record, response_body, 200)
    except ServiceError as error:
        return _idempotency_error_response(db, record, error)
    except IntegrityError as error:
        db.rollback()
        constraint = getattr(getattr(error.orig, "diag", None), "constraint_name", "")
        code = (
            "ACTIVE_RENTAL_EXISTS"
            if constraint == "uq_active_customer_rental"
            else "VEHICLE_UNAVAILABLE"
        )
        raise HTTPException(
            409, detail={"code": code, "message": "Xe hoặc khách đã có lượt đang hoạt động."}
        ) from error


@router.post("/rentals/{rental_id}/cancel-operational")
def post_operational_cancel(
    rental_id: int,
    body: OperationalCancelRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    record = None
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path=f"/api/v1/rentals/{rental_id}/cancel-operational",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        rental = cancel_operational_rental(
            db,
            rental_id=rental_id,
            reason=body.reason,
            note=body.note,
            actor_id=current_user.id,
        )
        response_body = make_response(rental_out(rental, get_rental_snapshot(db, rental)))
        return _commit_idempotent_response(db, record, response_body, 200)
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.post("/rentals/{rental_id}/pickup")
def post_pickup(
    rental_id: int,
    body: PickupRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    record = None
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path=f"/api/v1/rentals/{rental_id}/pickup",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        rental, handover, wallet = pickup_rental(
            db,
            rental_id=rental_id,
            station_id=body.station_id,
            battery_percent=body.battery_percent,
            note=body.note,
            staff_id=current_user.id,
            idempotency_record_id=record.id,
        )
        response_body = make_response(
            {
                "rental": rental_out(rental, get_rental_snapshot(db, rental)),
                "handover": handover_out(handover),
                "wallet": wallet_out(wallet),
            }
        )
        return _commit_idempotent_response(db, record, response_body, 200)
    except ServiceError as error:
        return _idempotency_error_response(db, record, error)


@router.post("/rentals/{rental_id}/initiate-return")
def post_initiate_return(
    rental_id: int,
    body: InitiateReturnRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    record = None
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path=f"/api/v1/rentals/{rental_id}/initiate-return",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        rental, handover = initiate_return(
            db,
            rental_id=rental_id,
            return_station_id=body.return_station_id,
            battery_percent=body.battery_percent,
            vehicle_condition=body.vehicle_condition,
            note=body.note,
            staff_id=current_user.id,
        )
        response_body = make_response(
            {
                "rental": rental_out(rental, get_rental_snapshot(db, rental)),
                "handover": handover_out(handover),
            }
        )
        return _commit_idempotent_response(db, record, response_body, 200)
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.post("/rentals/{rental_id}/return-quote")
def post_return_quote(
    rental_id: int,
    body: ReturnQuoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("CUSTOMER", "STAFF", "MANAGER"):
        raise HTTPException(403, detail={"code": "FORBIDDEN", "message": "Không đủ quyền."})
    try:
        quote, token = create_return_quote(
            db,
            rental_id=rental_id,
            return_station_id=body.return_station_id,
            promotion_code=body.promotion_code,
            actor_id=current_user.id,
            is_owner=current_user.role == "CUSTOMER",
        )
        db.commit()
        db.refresh(quote)
        return make_response(quote_out(quote, token))
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.post("/rentals/{rental_id}/return")
def post_return(
    rental_id: int,
    body: ReturnRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    record = None
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path=f"/api/v1/rentals/{rental_id}/return",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        rental, handover, invoice, transactions, wallet = settle_return(
            db,
            rental_id=rental_id,
            quote_token=body.quote_token,
            staff_id=current_user.id,
            idempotency_record_id=record.id,
        )
        response_body = make_response(
            {
                "rental": rental_out(rental, get_rental_snapshot(db, rental)),
                "handover": handover_out(handover),
                "invoice": invoice_out(invoice),
                "transactions": [transaction_out(row) for row in transactions],
                "wallet": wallet_out(wallet),
            }
        )
        return _commit_idempotent_response(db, record, response_body, 200)
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.get("/rentals/{rental_id}/handovers")
def list_handovers(
    rental_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _rental_or_404(db, rental_id, current_user)
    query = select(Handover).where(Handover.rental_id == rental_id)
    total = db.scalar(
        select(func.count()).select_from(Handover).where(Handover.rental_id == rental_id)
    ) or 0
    rows = db.scalars(
        query.order_by(Handover.time, Handover.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return make_list_response(
        [handover_out(row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/rentals/{rental_id}/invoice")
def get_invoice(
    rental_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _rental_or_404(db, rental_id, current_user)
    invoice = db.scalar(select(Invoice).where(Invoice.rental_id == rental_id))
    if invoice is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Hóa đơn chưa được phát hành."})
    return make_response(invoice_out(invoice))


@router.get("/rentals/{rental_id}/transactions")
def list_rental_transactions(
    rental_id: int,
    kind: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _rental_or_404(db, rental_id, current_user)
    predicates = [Transaction.rental_id == rental_id]
    if kind:
        predicates.append(Transaction.kind == kind.upper())
    if status_filter:
        predicates.append(Transaction.status == status_filter.upper())
    total = db.scalar(
        select(func.count()).select_from(Transaction).where(*predicates)
    ) or 0
    rows = db.scalars(
        select(Transaction)
        .where(*predicates)
        .order_by(Transaction.created_at.desc(), Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return make_list_response(
        [transaction_out(row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
    )
