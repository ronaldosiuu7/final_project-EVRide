from __future__ import annotations

from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app.schemas.operations import EntityID, RequestModel


class IncidentIntake(RequestModel):
    source_ticket_id: EntityID
    note: str = Field(min_length=1, max_length=5000)


class IncidentVerify(RequestModel):
    outcome: Literal[
        "FALSE_ALARM",
        "LOSS_THEFT",
        "ABANDONMENT",
    ]

    evidence_ticket_id: EntityID

    reason: str = Field(min_length=1, max_length=5000)

    valid_report_ticket_id: EntityID | None = None

    next_check_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_outcome_fields(self):
        if self.outcome == "LOSS_THEFT":
            if self.valid_report_ticket_id is None:
                raise ValueError(
                    "Xác nhận mất/trộm phải chọn báo cáo hợp lệ."
                )
        elif self.valid_report_ticket_id is not None:
            raise ValueError(
                "Chỉ kết luận LOSS_THEFT được chọn "
                "valid_report_ticket_id."
            )

        if self.outcome == "FALSE_ALARM":
            if self.next_check_at is None:
                raise ValueError(
                    "Báo nhầm phải có lịch kiểm tra tiếp."
                )
        elif self.next_check_at is not None:
            raise ValueError(
                "Chỉ kết luận FALSE_ALARM được đặt "
                "next_check_at tại bước này."
            )

        return self
