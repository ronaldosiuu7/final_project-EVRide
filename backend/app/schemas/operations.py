from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    model_validator,
)


def parse_id(value):
    # Theo convention project: ID trong JSON gửi bằng chuỗi.
    if (
        not isinstance(value, str)
        or not value.isascii()
        or not value.isdigit()
    ):
        raise ValueError("ID phải là chuỗi số nguyên dương.")
    return int(value)


EntityID = Annotated[
    int,
    Field(gt=0, le=9223372036854775807),
    BeforeValidator(parse_id),
]


class RequestModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )


class TicketCreate(RequestModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)


class TicketUpdate(RequestModel):
    assigned_to: EntityID | None = None
    status: Literal[
        "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"
    ] | None = None
    resolution_note: str | None = Field(
        default=None,
        min_length=1,
        max_length=5000,
    )

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Phải gửi ít nhất một trường.")

        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("status không được null.")

        if (
            "resolution_note" in self.model_fields_set
            and self.resolution_note is None
        ):
            raise ValueError("resolution_note không được null.")

        return self


class TicketAttachmentCreate(RequestModel):
    purpose: Literal["TICKET_EVIDENCE"]
    support_ticket_id: EntityID


class MaintenanceCreate(RequestModel):
    vehicle_id: EntityID
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    assigned_to: EntityID | None = None
    incident_id: EntityID | None = None


class MaintenanceStart(RequestModel):
    assigned_to: EntityID | None = None


class MaintenanceComplete(RequestModel):
    resolution_note: str = Field(min_length=1, max_length=5000)


class MaintenanceCancel(RequestModel):
    reason: str = Field(min_length=1, max_length=2000)


class GPSCreate(RequestModel):
    latitude: Decimal = Field(
        ge=-90,
        le=90,
        max_digits=9,
        decimal_places=6,
    )
    longitude: Decimal = Field(
        ge=-180,
        le=180,
        max_digits=9,
        decimal_places=6,
    )
    recorded_at: AwareDatetime


class ReviewCreate(RequestModel):
    rating: int = Field(strict=True, ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class ChatMessage(RequestModel):
    message: str = Field(min_length=1, max_length=2000)