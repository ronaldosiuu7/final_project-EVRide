"""Wallet and promotion API schemas."""

import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MONEY_PATTERN = re.compile(r"^[0-9]{1,10}(?:\.[0-9]{1,2})?$")


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TopUpRequest(StrictRequest):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)

    @field_validator("amount", mode="before", json_schema_input_type=str)
    @classmethod
    def require_money_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("Số tiền phải được gửi dưới dạng chuỗi.")
        stripped = value.strip()
        if not MONEY_PATTERN.fullmatch(stripped):
            raise ValueError(
                "Số tiền phải là chuỗi thập phân dương, tối đa 10 chữ số nguyên và 2 chữ số lẻ."
            )
        parsed = Decimal(stripped).quantize(Decimal("0.01"))
        if parsed <= 0:
            raise ValueError("Số tiền nạp phải lớn hơn 0.")
        return parsed


class TopUpApproveRequest(StrictRequest):
    pass


class TopUpRejectRequest(StrictRequest):
    reason: str = Field(min_length=1, max_length=2000)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Lý do từ chối không được để trống.")
        return normalized


class WalletStatusUpdate(StrictRequest):
    status: Literal["ACTIVE", "FROZEN", "LOCKED"]


class PromotionCreate(StrictRequest):
    code: str = Field(min_length=1, max_length=50)
    description: str | None = None
    discount_type: Literal["PERCENTAGE", "FIXED_AMOUNT"]
    discount_value: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    max_discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    min_rental_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    vehicle_model: str | None = Field(default=None, max_length=100)
    usage_limit: int = Field(gt=0)
    start_date: datetime
    end_date: datetime

    @field_validator("discount_value", mode="before", json_schema_input_type=str)
    @classmethod
    def require_discount_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("Giá trị tiền phải được gửi dưới dạng chuỗi.")
        return value

    @field_validator(
        "max_discount_amount",
        "min_rental_amount",
        mode="before",
        json_schema_input_type=str | None,
    )
    @classmethod
    def require_optional_money_string(cls, value):
        if value is not None and not isinstance(value, str):
            raise ValueError("Giá trị tiền phải được gửi dưới dạng chuỗi.")
        return value

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Mã khuyến mãi không được để trống.")
        return normalized

    @field_validator("vehicle_model")
    @classmethod
    def normalize_model(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Mẫu xe không được để trống.")
        return value

    @model_validator(mode="after")
    def validate_policy(self):
        if self.start_date.tzinfo is None or self.start_date.utcoffset() is None:
            raise ValueError("start_date phải có timezone.")
        if self.end_date.tzinfo is None or self.end_date.utcoffset() is None:
            raise ValueError("end_date phải có timezone.")
        if self.end_date <= self.start_date:
            raise ValueError("end_date phải sau start_date.")
        if self.discount_type == "PERCENTAGE":
            if self.discount_value > 100 or self.discount_value != self.discount_value.to_integral_value():
                raise ValueError("Giảm theo phần trăm phải là số nguyên từ 1 đến 100.")
        elif self.max_discount_amount is not None:
            raise ValueError("max_discount_amount chỉ dùng cho giảm theo phần trăm.")
        return self


class PromotionStatusUpdate(StrictRequest):
    status: Literal["ACTIVE", "DISABLED"]


def _utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def topup_request_out(row) -> dict:
    return {
        "id": str(row.id),
        "wallet_id": str(row.wallet_id),
        "requested_by": str(row.requested_by),
        "amount": f"{row.amount:.2f}",
        "status": row.status,
        "payment_mode": "DEMO",
        "created_at": _utc_datetime(row.created_at),
        "reviewed_by": str(row.reviewed_by) if row.reviewed_by is not None else None,
        "reviewed_at": _utc_datetime(row.reviewed_at),
        "rejection_reason": row.rejection_reason,
        "wallet_transaction_id": (
            str(row.wallet_transaction_id)
            if row.wallet_transaction_id is not None
            else None
        ),
    }


def wallet_out(wallet) -> dict:
    return {
        "id": str(wallet.id),
        "user_id": str(wallet.user_id),
        "balance": f"{wallet.balance:.2f}",
        "status": wallet.status,
        "created_at": _utc_datetime(wallet.created_at),
        "updated_at": _utc_datetime(wallet.updated_at),
    }


def wallet_transaction_out(row) -> dict:
    return {
        "id": str(row.id),
        "wallet_id": str(row.wallet_id),
        "rental_id": str(row.rental_id) if row.rental_id is not None else None,
        "transaction_id": str(row.transaction_id) if row.transaction_id is not None else None,
        "idempotency_record_id": (
            str(row.idempotency_record_id)
            if row.idempotency_record_id is not None
            else None
        ),
        "amount": f"{row.amount:.2f}",
        "type": row.type,
        "balance_before": f"{row.balance_before:.2f}",
        "balance_after": f"{row.balance_after:.2f}",
        "status": row.status,
        "created_at": _utc_datetime(row.created_at),
    }


def promotion_out(promotion) -> dict:
    return {
        "id": str(promotion.id),
        "code": promotion.code,
        "description": promotion.description,
        "discount_type": promotion.discount_type,
        "discount_value": f"{promotion.discount_value:.2f}",
        "max_discount_amount": (
            f"{promotion.max_discount_amount:.2f}"
            if promotion.max_discount_amount is not None
            else None
        ),
        "min_rental_amount": (
            f"{promotion.min_rental_amount:.2f}"
            if promotion.min_rental_amount is not None
            else None
        ),
        "vehicle_model": promotion.vehicle_model,
        "usage_limit": promotion.usage_limit,
        "used_count": promotion.used_count,
        "start_date": promotion.start_date,
        "end_date": promotion.end_date,
        "status": promotion.status,
        "created_at": promotion.created_at,
    }


def user_promotion_out(claim, promotion) -> dict:
    return {
        "id": str(claim.id),
        "user_id": str(claim.user_id),
        "promotion_id": str(claim.promotion_id),
        "is_used": claim.is_used,
        "used_at": claim.used_at,
        "promotion": promotion_out(promotion),
    }
