"""Promotion discount calculation and atomic usage consumption."""

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Promotion, UserPromotion

_ONE_DONG = Decimal("1")
_MONEY = Decimal("0.01")


class PromotionNotApplicable(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def calculate_promotion_discount(
    promotion: Promotion,
    *,
    rental_amount: Decimal,
    vehicle_model: str,
    now: datetime,
) -> Decimal:
    """Return the applied discount; this function does not consume a usage."""
    if rental_amount < 0:
        raise ValueError("rental_amount must not be negative")
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")

    if (
        promotion.status != "ACTIVE"
        or promotion.start_date > now
        or promotion.end_date <= now
        or (
            promotion.usage_limit is not None
            and promotion.used_count >= promotion.usage_limit
        )
    ):
        code = (
            "PROMOTION_EXHAUSTED"
            if promotion.usage_limit is not None
            and promotion.used_count >= promotion.usage_limit
            else "PROMOTION_INVALID"
        )
        raise PromotionNotApplicable(code, "Mã khuyến mãi không còn hiệu lực.")

    if (
        promotion.min_rental_amount is not None
        and rental_amount < promotion.min_rental_amount
    ):
        raise PromotionNotApplicable(
            "PROMOTION_INVALID", "Giá trị thuê chưa đạt mức tối thiểu."
        )

    if promotion.vehicle_model and (
        promotion.vehicle_model.casefold() != vehicle_model.casefold()
    ):
        raise PromotionNotApplicable(
            "PROMOTION_INVALID", "Mã không áp dụng cho mẫu xe này."
        )

    if promotion.discount_type == "PERCENTAGE":
        raw_discount = rental_amount * promotion.discount_value / Decimal("100")
        if promotion.max_discount_amount is not None:
            raw_discount = min(raw_discount, promotion.max_discount_amount)
    elif promotion.discount_type == "FIXED_AMOUNT":
        raw_discount = promotion.discount_value
    else:
        raise ValueError(f"Unsupported promotion discount type: {promotion.discount_type}")

    raw_discount = min(raw_discount, rental_amount)
    discounted_total = (rental_amount - raw_discount).quantize(
        _ONE_DONG, rounding=ROUND_HALF_UP
    )
    return max(Decimal("0.00"), rental_amount - discounted_total).quantize(_MONEY)


def consume_promotion(
    session: Session,
    *,
    user_id: int,
    promotion_id: int,
    rental_amount: Decimal,
    vehicle_model: str,
    now: datetime | None = None,
) -> Decimal:
    """Consume one claimed promotion inside the caller's payment transaction."""
    consumed_at = now or datetime.now(timezone.utc)
    promotion = session.scalar(
        select(Promotion)
        .where(Promotion.id == promotion_id)
        .with_for_update()
    )
    if promotion is None:
        raise PromotionNotApplicable(
            "PROMOTION_INVALID", "Mã khuyến mãi không tồn tại."
        )

    claim = session.scalar(
        select(UserPromotion)
        .where(
            UserPromotion.user_id == user_id,
            UserPromotion.promotion_id == promotion_id,
        )
        .with_for_update()
    )
    if claim is None or claim.is_used:
        raise PromotionNotApplicable(
            "PROMOTION_INVALID", "Mã chưa được nhận hoặc đã được sử dụng."
        )

    discount = calculate_promotion_discount(
        promotion,
        rental_amount=rental_amount,
        vehicle_model=vehicle_model,
        now=consumed_at,
    )
    claim.is_used = True
    claim.used_at = consumed_at
    promotion.used_count += 1
    return discount
