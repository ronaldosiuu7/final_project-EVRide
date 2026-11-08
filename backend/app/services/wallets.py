"""Wallet and promotion management operations."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AuditLog,
    Promotion,
    User,
    UserPromotion,
    Wallet,
    WalletTransaction,
)
from app.services.errors import ServiceError


def get_wallet_for_user(session: Session, user_id: int) -> Wallet:
    wallet = session.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if wallet is None:
        raise ServiceError(404, "NOT_FOUND", "Ví không tồn tại.")
    return wallet


def top_up_demo(
    session: Session,
    *,
    user_id: int,
    amount: Decimal,
    idempotency_record_id: int,
) -> tuple[Wallet, WalletTransaction]:
    if os.getenv("DEMO_PAYMENTS_ENABLED", "").strip().lower() not in ("1", "true", "yes"):
        raise ServiceError(503, "FEATURE_NOT_ENABLED", "Nạp tiền mô phỏng chưa được bật.")
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise ServiceError(404, "NOT_FOUND", "Người dùng không tồn tại.")
    wallet = session.scalar(
        select(Wallet).where(Wallet.user_id == user_id).with_for_update()
    )
    if wallet is None:
        raise ServiceError(404, "NOT_FOUND", "Ví không tồn tại.")
    if wallet.status != "ACTIVE":
        raise ServiceError(409, "WALLET_UNAVAILABLE", "Ví không ở trạng thái ACTIVE.")
    if amount <= 0:
        raise ServiceError(422, "INVALID_AMOUNT", "Số tiền nạp phải lớn hơn 0.")
    before = wallet.balance
    wallet.balance = before + amount
    wallet.updated_at = datetime.now(timezone.utc)
    entry = WalletTransaction(
        wallet_id=wallet.id,
        idempotency_record_id=idempotency_record_id,
        amount=amount,
        type="TOPUP",
        balance_before=before,
        balance_after=wallet.balance,
        status="SUCCESS",
    )
    session.add(entry)
    session.flush()
    return wallet, entry


def update_wallet_status(
    session: Session, wallet_id: int, new_status: str, actor_id: int
) -> Wallet:
    wallet_owner = session.scalar(
        select(Wallet.user_id).where(Wallet.id == wallet_id)
    )
    if wallet_owner is None:
        raise ServiceError(404, "NOT_FOUND", "Ví không tồn tại.")
    session.scalar(select(User).where(User.id == wallet_owner).with_for_update())
    wallet = session.scalar(
        select(Wallet).where(Wallet.id == wallet_id).with_for_update()
    )
    if wallet is None:
        raise ServiceError(404, "NOT_FOUND", "Ví không tồn tại.")
    if new_status not in ("ACTIVE", "FROZEN", "LOCKED"):
        raise ServiceError(422, "INVALID_REQUEST", "Trạng thái ví không hợp lệ.")
    if wallet.status != new_status:
        before = {"status": wallet.status}
        wallet.status = new_status
        wallet.updated_at = datetime.now(timezone.utc)
        session.add(
            AuditLog(
                actor_id=actor_id,
                action="WALLET_STATUS_UPDATED",
                resource_type="wallet",
                resource_id=str(wallet.id),
                before_data=before,
                after_data={"status": new_status},
            )
        )
    session.flush()
    return wallet


def create_promotion(session: Session, payload: dict) -> Promotion:
    code = payload["code"]
    if session.scalar(
        select(Promotion.id).where(func.upper(Promotion.code) == code)
    ) is not None:
        raise ServiceError(409, "PROMOTION_CODE_EXISTS", "Mã khuyến mãi đã tồn tại.")
    promotion = Promotion(
        **payload,
        status="ACTIVE",
        used_count=0,
    )
    session.add(promotion)
    session.flush()
    return promotion


def update_promotion_status(
    session: Session, promotion_id: int, new_status: str
) -> Promotion:
    promotion = session.scalar(
        select(Promotion).where(Promotion.id == promotion_id).with_for_update()
    )
    if promotion is None:
        raise ServiceError(404, "NOT_FOUND", "Mã khuyến mãi không tồn tại.")
    if new_status not in ("ACTIVE", "DISABLED"):
        raise ServiceError(422, "INVALID_REQUEST", "Trạng thái khuyến mãi không hợp lệ.")
    promotion.status = new_status
    session.flush()
    return promotion


def claim_promotion(
    session: Session, *, user_id: int, promotion_id: int
) -> tuple[UserPromotion, Promotion, bool]:
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise ServiceError(404, "NOT_FOUND", "Người dùng không tồn tại.")
    promotion = session.scalar(
        select(Promotion).where(Promotion.id == promotion_id).with_for_update()
    )
    if promotion is None:
        raise ServiceError(404, "NOT_FOUND", "Mã khuyến mãi không tồn tại.")
    now = datetime.now(timezone.utc)
    if (
        promotion.status != "ACTIVE"
        or promotion.start_date > now
        or promotion.end_date <= now
    ):
        raise ServiceError(409, "PROMOTION_INVALID", "Mã khuyến mãi không còn hiệu lực.")
    if promotion.usage_limit is not None and promotion.used_count >= promotion.usage_limit:
        raise ServiceError(409, "PROMOTION_EXHAUSTED", "Mã khuyến mãi đã hết lượt.")
    existing = session.scalar(
        select(UserPromotion).where(
            UserPromotion.user_id == user_id,
            UserPromotion.promotion_id == promotion_id,
        ).with_for_update()
    )
    if existing is not None:
        return existing, promotion, False
    claim = UserPromotion(user_id=user_id, promotion_id=promotion_id)
    session.add(claim)
    session.flush()
    return claim, promotion, True
