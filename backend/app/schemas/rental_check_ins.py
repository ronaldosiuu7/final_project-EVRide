from __future__ import annotations

from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app.schemas.operations import EntityID, RequestModel


class RentalCheckInAction(RequestModel):
    outcome: Literal["CONTINUE_RENTAL", "NO_ANSWER", "ESCALATE"]
    note: str = Field(min_length=1, max_length=5000)
    next_check_at: AwareDatetime | None = None
    source_ticket_id: EntityID | None = None

    @model_validator(mode="after")
    def validate_outcome(self):
        if self.outcome in {"CONTINUE_RENTAL", "NO_ANSWER"}:
            if self.next_check_at is None:
                raise ValueError(
                    "Phải truyền next_check_at khi tiếp tục theo dõi chuyến."
                )
            if self.source_ticket_id is not None:
                raise ValueError(
                    "source_ticket_id chỉ dùng khi chuyển sang tiếp nhận sự cố."
                )
        elif self.outcome == "ESCALATE" and self.next_check_at is not None:
            raise ValueError(
                "Không truyền next_check_at khi chuyển sang tiếp nhận sự cố."
            )
        return self
