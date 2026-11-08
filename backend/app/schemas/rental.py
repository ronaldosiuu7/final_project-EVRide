"""Rental lifecycle request and response schemas."""

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RentalCreate(StrictRequest):
    vehicle_id: int = Field(gt=0)
    pickup_station_id: int = Field(gt=0)

    @field_validator(
        "vehicle_id", "pickup_station_id", mode="before", json_schema_input_type=str
    )
    @classmethod
    def require_id_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("ID phải được gửi dưới dạng chuỗi.")
        return value


class PickupRequest(StrictRequest):
    station_id: int = Field(gt=0)
    battery_percent: int = Field(ge=0, le=100)
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("station_id", mode="before", json_schema_input_type=str)
    @classmethod
    def require_id_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("ID phải được gửi dưới dạng chuỗi.")
        return value


class InitiateReturnRequest(StrictRequest):
    return_station_id: int = Field(gt=0)
    battery_percent: int = Field(ge=0, le=100)
    vehicle_condition: Literal["OK", "NEEDS_MAINTENANCE"]
    note: str | None = Field(default=None, max_length=2000)

    @field_validator(
        "return_station_id", mode="before", json_schema_input_type=str
    )
    @classmethod
    def require_id_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("ID phải được gửi dưới dạng chuỗi.")
        return value


class ReturnQuoteRequest(StrictRequest):
    return_station_id: int = Field(gt=0)
    promotion_code: str | None = Field(default=None, min_length=1, max_length=50)

    @field_validator(
        "return_station_id", mode="before", json_schema_input_type=str
    )
    @classmethod
    def require_id_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("ID phải được gửi dưới dạng chuỗi.")
        return value


class ReturnRequest(StrictRequest):
    quote_token: str = Field(min_length=32, max_length=256)


class OperationalCancelRequest(StrictRequest):
    reason: Literal["VEHICLE_FAULT", "SYSTEM_ERROR"]
    note: str = Field(min_length=1, max_length=2000)


def rental_out(rental, pricing_snapshot=None, *, now=None) -> dict:
    data = {
        "id": str(rental.id),
        "customer_id": str(rental.customer_id),
        "vehicle_id": str(rental.vehicle_id),
        "pickup_station_id": str(rental.pickup_station_id),
        "actual_return_station_id": (
            str(rental.actual_return_station_id)
            if rental.actual_return_station_id is not None
            else None
        ),
        "created_at": rental.created_at,
        "expires_at": rental.expires_at,
        "actual_start_time": rental.actual_start_time,
        "actual_end_time": rental.actual_end_time,
        "return_initiated_at": rental.return_initiated_at,
        "settled_at": rental.settled_at,
        "cancelled_at": rental.cancelled_at,
        "cancellation_reason": rental.cancellation_reason,
        "cancellation_limit_exempt": rental.cancellation_limit_exempt,
        "deposit_held": f"{rental.deposit_held:.2f}",
        "status": rental.status,
        "total_price": (
            f"{rental.total_price:.2f}" if rental.total_price is not None else None
        ),
        "remaining_hold_seconds": (
            max(0, int((rental.expires_at - now).total_seconds()))
            if rental.status == "RESERVED" and now is not None
            else 0
        ),
        "elapsed_seconds": (
            int(((rental.return_initiated_at or now) - rental.actual_start_time).total_seconds())
            if rental.actual_start_time is not None
            and (rental.return_initiated_at is not None or now is not None)
            else None
        ),
    }
    if pricing_snapshot is not None:
        data.update(
            {
                "first_30_minutes_price_snapshot": f"{pricing_snapshot.first_30_minutes_price_snapshot:.2f}",
                "extra_minute_price_snapshot": f"{pricing_snapshot.extra_minute_price_snapshot:.2f}",
                "deposit_amount_snapshot": f"{pricing_snapshot.deposit_amount_snapshot:.2f}",
                "vehicle_name": pricing_snapshot.vehicle_name,
                "vehicle_type_snapshot": pricing_snapshot.vehicle_type_snapshot,
                "vehicle_model_snapshot": pricing_snapshot.vehicle_model_snapshot,
                "pricing_policy_version": pricing_snapshot.pricing_policy_version,
                "billing_unit": pricing_snapshot.billing_unit,
            }
        )
    return data


def handover_out(handover) -> dict:
    return {
        "id": str(handover.id),
        "rental_id": str(handover.rental_id),
        "staff_id": str(handover.staff_id),
        "kind": handover.kind,
        "time": handover.time,
        "battery_percent": handover.battery_percent,
        "vehicle_condition": handover.vehicle_condition,
        "note": handover.note,
        "created_at": handover.created_at,
    }


def quote_out(quote, quote_token: str) -> dict:
    return {
        "id": str(quote.id),
        "rental_id": str(quote.rental_id),
        "return_station_id": str(quote.return_station_id),
        "is_estimate": quote.is_estimate,
        "return_initiated_at": quote.return_initiated_at,
        "quote_created_at": quote.quote_created_at,
        "quote_expires_at": quote.quote_expires_at,
        "elapsed_seconds": quote.elapsed_seconds,
        "currency": quote.currency,
        "pricing_policy_version": quote.pricing_policy_version,
        "rental_fee": f"{quote.rental_fee:.2f}",
        "discount_amount": f"{quote.discount_amount:.2f}",
        "total_amount": f"{quote.total_amount:.2f}",
        "deposit_held": f"{quote.deposit_held:.2f}",
        "deposit_applied": f"{quote.deposit_applied:.2f}",
        "additional_payment": f"{quote.additional_payment:.2f}",
        "deposit_refund": f"{quote.deposit_refund:.2f}",
        "promotion_code": quote.promotion_code,
        "quote_token": quote_token,
    }


def invoice_out(invoice) -> dict:
    return {
        "id": str(invoice.id),
        "rental_id": str(invoice.rental_id),
        "total_amount": f"{invoice.total_amount:.2f}",
        "status": invoice.status,
        "created_at": invoice.created_at,
    }


def transaction_out(transaction) -> dict:
    return {
        "id": str(transaction.id),
        "rental_id": str(transaction.rental_id),
        "invoice_id": (
            str(transaction.invoice_id) if transaction.invoice_id is not None else None
        ),
        "actor_id": str(transaction.actor_id),
        "amount": f"{transaction.amount:.2f}",
        "kind": transaction.kind,
        "status": transaction.status,
        "created_at": transaction.created_at,
    }
