"""Wallet and promotion APIs."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.core.responses import make_list_response, make_response
from app.database import get_db
from app.models import Promotion, User, UserPromotion, WalletTransaction
from app.schemas.wallet import (
    PromotionCreate,
    PromotionStatusUpdate,
    TopUpRequest,
    WalletStatusUpdate,
    promotion_out,
    user_promotion_out,
    wallet_out,
    wallet_transaction_out,
)
from app.services.errors import ServiceError
from app.services.idempotency import (
    begin_idempotent_request,
    complete_idempotent_request,
)
from app.services.wallets import (
    claim_promotion,
    create_promotion,
    get_wallet_for_user,
    top_up_demo,
    update_promotion_status,
    update_wallet_status,
)

router = APIRouter(tags=["Wallets and promotions"])


def _raise_service_error(error: ServiceError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from error


@router.get("/wallets/me")
def get_my_wallet(
    current_user: User = Depends(require_role("CUSTOMER")),
    db: Session = Depends(get_db),
):
    try:
        return make_response(wallet_out(get_wallet_for_user(db, current_user.id)))
    except ServiceError as error:
        _raise_service_error(error)


@router.get("/wallets/me/transactions")
def list_my_wallet_transactions(
    type_filter: str | None = Query(default=None, alias="type"),
    status_filter: str | None = Query(default=None, alias="status"),
    from_time: datetime | None = Query(default=None, alias="from"),
    to_time: datetime | None = Query(default=None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_role("CUSTOMER")),
    db: Session = Depends(get_db),
):
    wallet = get_wallet_for_user(db, current_user.id)
    predicates = [WalletTransaction.wallet_id == wallet.id]
    if type_filter:
        predicates.append(WalletTransaction.type == type_filter.upper())
    if status_filter:
        predicates.append(WalletTransaction.status == status_filter.upper())
    if from_time:
        predicates.append(WalletTransaction.created_at >= from_time)
    if to_time:
        predicates.append(WalletTransaction.created_at <= to_time)
    count_query = (
        select(func.count()).select_from(WalletTransaction).where(*predicates)
    )
    rows = db.scalars(
        select(WalletTransaction)
        .where(*predicates)
        .order_by(WalletTransaction.created_at.desc(), WalletTransaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    total = db.scalar(count_query) or 0
    return make_list_response(
        [wallet_transaction_out(row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/users/{user_id}/wallet")
def get_user_wallet(
    user_id: int,
    _current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        return make_response(wallet_out(get_wallet_for_user(db, user_id)))
    except ServiceError as error:
        _raise_service_error(error)


@router.patch("/wallets/{wallet_id}/status")
def patch_wallet_status(
    wallet_id: int,
    body: WalletStatusUpdate,
    current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        wallet = update_wallet_status(db, wallet_id, body.status, current_user.id)
        db.commit()
        db.refresh(wallet)
        return make_response(wallet_out(wallet))
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.post("/wallets/me/topups", status_code=status.HTTP_201_CREATED)
def post_top_up(
    body: TopUpRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("CUSTOMER")),
    db: Session = Depends(get_db),
):
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path="/api/v1/wallets/me/topups",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        wallet, entry = top_up_demo(
            db,
            user_id=current_user.id,
            amount=body.amount,
            idempotency_record_id=record.id,
        )
        db.flush()
        response_body = make_response(
            {
                "wallet_transaction": wallet_transaction_out(entry),
                "payment_mode": "DEMO",
                "wallet": wallet_out(wallet),
            },
            status_code=201,
        )
        encoded = jsonable_encoder(response_body)
        complete_idempotent_request(record, status_code=201, response_body=encoded)
        db.commit()
        return encoded
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.get("/promotions")
def list_promotions(
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("CUSTOMER", "MANAGER"):
        raise HTTPException(403, detail={"code": "FORBIDDEN", "message": "Không đủ quyền."})
    now = datetime.now(timezone.utc)
    query = select(Promotion)
    count_query = select(func.count()).select_from(Promotion)
    if current_user.role == "CUSTOMER":
        predicates = [
            Promotion.status == "ACTIVE",
            Promotion.start_date <= now,
            Promotion.end_date > now,
        ]
    else:
        predicates = []
        if status_filter:
            predicates.append(Promotion.status == status_filter.upper())
    if predicates:
        query = query.where(*predicates)
        count_query = count_query.where(*predicates)
    promotions = db.scalars(
        query.order_by(Promotion.start_date.desc(), Promotion.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    total = db.scalar(count_query) or 0
    return make_list_response(
        [promotion_out(promotion) for promotion in promotions],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/promotions", status_code=status.HTTP_201_CREATED)
def post_promotion(
    body: PromotionCreate,
    _current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        promotion = create_promotion(db, body.model_dump())
        db.commit()
        db.refresh(promotion)
        return make_response(promotion_out(promotion), status_code=201)
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)
    except IntegrityError as error:
        db.rollback()
        diagnostic = getattr(error.orig, "diag", None)
        constraint_name = getattr(diagnostic, "constraint_name", "")
        if constraint_name not in ("promotions_code_key", "uq_promotions_code"):
            raise
        raise HTTPException(
            status_code=409,
            detail={
                "code": "PROMOTION_CODE_EXISTS",
                "message": "Mã khuyến mãi đã tồn tại.",
            },
        ) from error


@router.patch("/promotions/{promotion_id}")
def patch_promotion(
    promotion_id: int,
    body: PromotionStatusUpdate,
    _current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        promotion = update_promotion_status(db, promotion_id, body.status)
        db.commit()
        db.refresh(promotion)
        return make_response(promotion_out(promotion))
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.post("/promotions/{promotion_id}/claim")
def post_promotion_claim(
    promotion_id: int,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "CUSTOMER":
        raise HTTPException(403, detail={"code": "FORBIDDEN", "message": "Không đủ quyền."})
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path=f"/api/v1/promotions/{promotion_id}/claim",
            key=idempotency_key,
            payload={},
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        claim, promotion, created = claim_promotion(
            db, user_id=current_user.id, promotion_id=promotion_id
        )
        response_status = 201 if created else 200
        encoded = jsonable_encoder(
            make_response(user_promotion_out(claim, promotion), status_code=response_status)
        )
        complete_idempotent_request(
            record, status_code=response_status, response_body=encoded
        )
        db.commit()
        return JSONResponse(status_code=response_status, content=encoded)
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.get("/users/me/promotions")
def list_my_promotions(
    is_used: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_role("CUSTOMER")),
    db: Session = Depends(get_db),
):
    predicates = [UserPromotion.user_id == current_user.id]
    if is_used is not None:
        predicates.append(UserPromotion.is_used.is_(is_used))
    count_query = select(func.count()).select_from(UserPromotion).where(*predicates)
    rows = db.execute(
        select(UserPromotion, Promotion)
        .join(Promotion, Promotion.id == UserPromotion.promotion_id)
        .where(*predicates)
        .order_by(UserPromotion.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    total = db.scalar(count_query) or 0
    return make_list_response(
        [user_promotion_out(claim, promotion) for claim, promotion in rows],
        page=page,
        page_size=page_size,
        total=total,
    )
