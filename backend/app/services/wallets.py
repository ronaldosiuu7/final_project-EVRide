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
    WalletTopupRequest,
    WalletTransaction,
)
from app.services.errors import ServiceError

ZERO = Decimal("0.00")
MAX_WALLET_MONEY = Decimal("9999999999.99")
TOPUP_REQUEST_STATUSES = ("PENDING", "APPROVED", "REJECTED")
REVIEWER_ROLES = ("STAFF", "MANAGER")


def _require_demo_payments_enabled() -> None:
    if os.getenv("DEMO_PAYMENTS_ENABLED", "").strip().lower() not in ("1", "true", "yes"):
        raise ServiceError(503, "FEATURE_NOT_ENABLED", "Nạp tiền mô phỏng chưa được bật.")


def _clock(session: Session) -> datetime:
    now = session.scalar(select(func.clock_timestamp()))
    if now is None:
        raise RuntimeError("The database did not return clock_timestamp().")
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def _validate_positive_amount(amount: Decimal) -> Decimal:
    if (
        not isinstance(amount, Decimal)
        or not amount.is_finite()
        or amount <= ZERO
        or amount > MAX_WALLET_MONEY
        or amount.as_tuple().exponent < -2
    ):
        raise ServiceError(422, "INVALID_AMOUNT", "Số tiền nạp phải lớn hơn 0 và hợp lệ.")
    return amount.quantize(Decimal("0.01"))


def get_wallet_for_user(session: Session, user_id: int) -> Wallet:
    wallet = session.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if wallet is None:
        raise ServiceError(404, "NOT_FOUND", "Ví không tồn tại.")
    return wallet


def create_topup_request(
    session: Session,
    *,
    user_id: int,
    amount: Decimal,
    idempotency_record_id: int | None,
) -> WalletTopupRequest:
    _require_demo_payments_enabled()
    normalized_amount = _validate_positive_amount(amount)

    # Thứ tự khóa toàn cục: customer (users) -> wallet.
    user = session.scalar(
        select(User)
        .where(User.id == user_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if user is None:
        raise ServiceError(404, "NOT_FOUND", "Người dùng không tồn tại.")
    if user.role != "CUSTOMER":
        raise ServiceError(403, "FORBIDDEN", "Chỉ khách hàng mới được gửi yêu cầu nạp tiền.")
    if user.status != "ACTIVE":
        raise ServiceError(403, "ACCOUNT_DISABLED", "Tài khoản khách không hoạt động.")

    wallet = session.scalar(
        select(Wallet)
        .where(Wallet.user_id == user_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if wallet is None:
        raise ServiceError(404, "NOT_FOUND", "Ví không tồn tại.")
    if wallet.status != "ACTIVE":
        raise ServiceError(409, "WALLET_UNAVAILABLE", "Ví không ở trạng thái ACTIVE.")

    now = _clock(session)
    topup_request = WalletTopupRequest(
        wallet_id=wallet.id,
        requested_by=user.id,
        amount=normalized_amount,
        status="PENDING",
        idempotency_record_id=idempotency_record_id,
        created_at=now,
    )
    session.add(topup_request)
    session.flush()

    session.add(
        AuditLog(
            actor_id=user.id,
            action="WALLET_TOPUP_REQUESTED",
            resource_type="wallet_topup_requests",
            resource_id=str(topup_request.id),
            before_data=None,
            after_data={
                "status": "PENDING",
                "wallet_id": str(wallet.id),
                "requested_by": str(user.id),
                "amount": f"{normalized_amount:.2f}",
                "payment_mode": "DEMO",
            },
            created_at=now,
        )
    )
    session.flush()
    return topup_request


def list_topup_requests(
    session: Session,
    *,
    wallet_id: int | None = None,
    customer_id: int | None = None,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[WalletTopupRequest], int]:
    predicates = []
    if wallet_id is not None:
        predicates.append(WalletTopupRequest.wallet_id == wallet_id)
    if customer_id is not None:
        predicates.append(WalletTopupRequest.requested_by == customer_id)
    if status_filter is not None:
        normalized_status = status_filter.upper()
        if normalized_status not in TOPUP_REQUEST_STATUSES:
            raise ServiceError(422, "VALIDATION_ERROR", "Trạng thái yêu cầu nạp tiền không hợp lệ.")
        predicates.append(WalletTopupRequest.status == normalized_status)

    count_query = select(func.count()).select_from(WalletTopupRequest)
    data_query = select(WalletTopupRequest)
    if predicates:
        count_query = count_query.where(*predicates)
        data_query = data_query.where(*predicates)

    rows = session.scalars(
        data_query.order_by(
            WalletTopupRequest.created_at.desc(),
            WalletTopupRequest.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    total = session.scalar(count_query) or 0
    return rows, total


def get_topup_request(
    session: Session,
    *,
    request_id: int,
    actor: User,
) -> WalletTopupRequest:
    topup_request = session.get(WalletTopupRequest, request_id)
    if topup_request is None:
        raise ServiceError(404, "NOT_FOUND", "Yêu cầu nạp tiền không tồn tại.")
    if actor.role not in REVIEWER_ROLES and topup_request.requested_by != actor.id:
        raise ServiceError(404, "NOT_FOUND", "Yêu cầu nạp tiền không tồn tại.")
    return topup_request


def _lock_topup_request_context(
    session: Session,
    *,
    request_id: int,
    actor_id: int,
) -> tuple[User, User, Wallet, WalletTopupRequest]:
    actor = session.scalar(
        select(User)
        .where(User.id == actor_id)
        .execution_options(populate_existing=True)
    )
    if actor is None or actor.status != "ACTIVE":
        raise ServiceError(403, "ACCOUNT_DISABLED", "Tài khoản người xử lý không hoạt động.")
    if actor.role not in REVIEWER_ROLES:
        raise ServiceError(403, "FORBIDDEN", "Chỉ STAFF hoặc MANAGER mới được xử lý yêu cầu nạp tiền.")

    preliminary = session.execute(
        select(
            WalletTopupRequest.requested_by,
            WalletTopupRequest.wallet_id,
        ).where(WalletTopupRequest.id == request_id)
    ).one_or_none()
    if preliminary is None:
        raise ServiceError(404, "NOT_FOUND", "Yêu cầu nạp tiền không tồn tại.")

    if preliminary.requested_by == actor.id:
        raise ServiceError(403, "FORBIDDEN", "Không được tự xử lý yêu cầu nạp tiền của chính mình.")

    # Thứ tự khóa toàn cục: customer (users) -> wallet -> wallet_topup_requests.
    customer = session.scalar(
        select(User)
        .where(User.id == preliminary.requested_by)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    wallet = session.scalar(
        select(Wallet)
        .where(Wallet.id == preliminary.wallet_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    topup_request = session.scalar(
        select(WalletTopupRequest)
        .where(WalletTopupRequest.id == request_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if topup_request is None or customer is None or wallet is None:
        raise ServiceError(404, "NOT_FOUND", "Yêu cầu nạp tiền không tồn tại.")
    if (
        topup_request.requested_by != customer.id
        or topup_request.wallet_id != wallet.id
        or wallet.user_id != customer.id
    ):
        raise ServiceError(409, "INVALID_STATE_TRANSITION", "Dữ liệu yêu cầu và ví không khớp.")
    if wallet.user_id == actor.id:
        raise ServiceError(403, "FORBIDDEN", "Không được tự xử lý yêu cầu nạp tiền của chính mình.")
    return actor, customer, wallet, topup_request


def approve_topup_request(
    session: Session,
    *,
    request_id: int,
    actor_id: int,
    idempotency_record_id: int | None,
) -> tuple[WalletTopupRequest, WalletTransaction, Wallet]:
    _require_demo_payments_enabled()
    actor, customer, wallet, topup_request = _lock_topup_request_context(
        session,
        request_id=request_id,
        actor_id=actor_id,
    )

    if topup_request.status != "PENDING" or topup_request.wallet_transaction_id is not None:
        raise ServiceError(
            409,
            "INVALID_STATE_TRANSITION",
            f"Yêu cầu nạp tiền đang ở trạng thái {topup_request.status}, không thể duyệt.",
        )

    if customer.role != "CUSTOMER" or customer.status != "ACTIVE":
        raise ServiceError(403, "ACCOUNT_DISABLED", "Tài khoản khách không hoạt động.")

    if wallet.status != "ACTIVE":
        raise ServiceError(409, "WALLET_UNAVAILABLE", "Ví không ở trạng thái ACTIVE.")

    amount = _validate_positive_amount(topup_request.amount)
    before = wallet.balance
    if not before.is_finite() or before < ZERO:
        raise ServiceError(409, "INVALID_FINANCIAL_DATA", "Số dư ví hiện tại không hợp lệ.")
    after = before + amount
    if after > MAX_WALLET_MONEY:
        raise ServiceError(
            409,
            "WALLET_LIMIT_EXCEEDED",
            "Số dư ví sau khi nạp vượt giới hạn cho phép.",
        )

    now = _clock(session)
    if now < topup_request.created_at:
        raise ServiceError(
            409,
            "INVALID_STATE_TRANSITION",
            "Thời điểm xử lý không hợp lệ so với thời điểm tạo yêu cầu.",
        )

    entry = WalletTransaction(
        wallet_id=wallet.id,
        idempotency_record_id=idempotency_record_id,
        amount=amount,
        type="TOPUP",
        balance_before=before,
        balance_after=after,
        status="SUCCESS",
        created_at=now,
    )
    wallet.balance = after
    wallet.updated_at = now
    session.add(entry)
    session.flush()

    topup_request.status = "APPROVED"
    topup_request.reviewed_by = actor.id
    topup_request.reviewed_at = now
    topup_request.rejection_reason = None
    topup_request.wallet_transaction_id = entry.id

    session.add(
        AuditLog(
            actor_id=actor.id,
            action="WALLET_TOPUP_APPROVED",
            resource_type="wallet_topup_requests",
            resource_id=str(topup_request.id),
            before_data={
                "status": "PENDING",
                "wallet_balance": f"{before:.2f}",
            },
            after_data={
                "status": "APPROVED",
                "wallet_id": str(wallet.id),
                "requested_by": str(customer.id),
                "amount": f"{amount:.2f}",
                "wallet_transaction_id": str(entry.id),
                "balance_before": f"{before:.2f}",
                "balance_after": f"{after:.2f}",
            },
            created_at=now,
        )
    )
    session.flush()
    return topup_request, entry, wallet


def reject_topup_request(
    session: Session,
    *,
    request_id: int,
    actor_id: int,
    reason: str,
) -> WalletTopupRequest:
    normalized_reason = reason.strip()
    if not normalized_reason:
        raise ServiceError(422, "VALIDATION_ERROR", "Lý do từ chối không được để trống.")

    # Từ chối không yêu cầu bật DEMO_PAYMENTS_ENABLED và được phép dù ví/tài khoản khách đã bị khóa.
    actor, customer, wallet, topup_request = _lock_topup_request_context(
        session,
        request_id=request_id,
        actor_id=actor_id,
    )

    if topup_request.status != "PENDING" or topup_request.wallet_transaction_id is not None:
        raise ServiceError(
            409,
            "INVALID_STATE_TRANSITION",
            f"Yêu cầu nạp tiền đang ở trạng thái {topup_request.status}, không thể từ chối.",
        )

    now = _clock(session)
    if now < topup_request.created_at:
        raise ServiceError(
            409,
            "INVALID_STATE_TRANSITION",
            "Thời điểm xử lý không hợp lệ so với thời điểm tạo yêu cầu.",
        )

    topup_request.status = "REJECTED"
    topup_request.reviewed_by = actor.id
    topup_request.reviewed_at = now
    topup_request.rejection_reason = normalized_reason
    topup_request.wallet_transaction_id = None

    session.add(
        AuditLog(
            actor_id=actor.id,
            action="WALLET_TOPUP_REJECTED",
            resource_type="wallet_topup_requests",
            resource_id=str(topup_request.id),
            before_data={"status": "PENDING"},
            after_data={
                "status": "REJECTED",
                "wallet_id": str(wallet.id),
                "requested_by": str(customer.id),
                "amount": f"{topup_request.amount:.2f}",
                "rejection_reason": normalized_reason,
            },
            created_at=now,
        )
    )
    session.flush()
    return topup_request


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
