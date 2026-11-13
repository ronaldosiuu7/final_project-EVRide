from __future__ import annotations

import re
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BeforeValidator, Field, model_validator

from app.schemas.operations import EntityID, RequestModel


def parse_money(value):
    if not isinstance(value, str):
        raise ValueError("Số tiền phải được gửi bằng chuỗi.")

    value = value.strip()

    if not re.fullmatch(r"[0-9]{1,10}(?:\.[0-9]{1,2})?", value):
        raise ValueError(
            "Số tiền phải không âm, tối đa 10 chữ số nguyên "
            "và 2 chữ số thập phân."
        )

    return Decimal(value).quantize(Decimal("0.01"))


Money = Annotated[Decimal, BeforeValidator(parse_money)]


class FinancialEvidence(RequestModel):
    evidence_ticket_id: EntityID
    reason: str = Field(min_length=1, max_length=5000)


class IncidentRentSettlement(FinancialEvidence):
    expected_rent_amount: Money


class ExpectedAmountAction(FinancialEvidence):
    expected_amount: Money


class ExternalCompensationSettlement(FinancialEvidence):
    amount: Money
    agreement_status: Literal[
        "AGREED",
        "AUTHORITY_DECISION",
        "NOT_REQUIRED",
    ]
    payment_method: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )
    payment_reference: str | None = Field(
        default=None,
        min_length=1,
        max_length=120,
    )
    paid_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_external_resolution(self):
        if self.amount == Decimal("0.00"):
            if self.agreement_status != "NOT_REQUIRED":
                raise ValueError(
                    "Nghĩa vụ bằng 0 phải dùng NOT_REQUIRED."
                )
            if (
                self.payment_method is not None
                or self.payment_reference is not None
                or self.paid_at is not None
            ):
                raise ValueError(
                    "Nghĩa vụ bằng 0 không được gửi thông tin thanh toán ngoài hệ thống."
                )
        else:
            if self.agreement_status not in {
                "AGREED",
                "AUTHORITY_DECISION",
            }:
                raise ValueError(
                    "Nghĩa vụ dương phải dùng AGREED hoặc AUTHORITY_DECISION."
                )
            if (
                self.payment_method is None
                or self.payment_reference is None
                or self.paid_at is None
            ):
                raise ValueError(
                    "Khoản bồi thường dương cần payment_method, "
                    "payment_reference và paid_at."
                )
        return self
