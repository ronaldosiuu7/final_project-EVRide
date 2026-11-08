"""Schemas cho giấy tờ người dùng."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, field_validator


class DocumentOut(BaseModel):
    """Trả về giấy tờ — số giấy tờ bị che (masked)."""

    id: str
    user_id: str
    document_type: str
    document_number_masked: str
    verified_status: str
    expires_on: date | None
    verified_birth_date: date | None
    verified_by: str | None
    verified_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime

    @classmethod
    def from_model(cls, doc) -> DocumentOut:
        # Che số giấy tờ: chỉ hiện 4 ký tự cuối
        number = doc.document_number
        masked = "*" * max(0, len(number) - 4) + number[-4:] if len(number) > 4 else number

        return cls(
            id=str(doc.id),
            user_id=str(doc.user_id),
            document_type=doc.document_type,
            document_number_masked=masked,
            verified_status=doc.verified_status,
            expires_on=doc.expires_on,
            verified_birth_date=doc.verified_birth_date,
            verified_by=str(doc.verified_by) if doc.verified_by else None,
            verified_at=doc.verified_at,
            revoked_at=doc.revoked_at,
            created_at=doc.created_at,
        )


class CreateDocumentRequest(BaseModel):
    document_type: Literal["CCCD", "PASSPORT", "DRIVER_LICENSE"]
    document_number: str
    front_file_id: int
    back_file_id: int
    birth_date: date | None = None
    expires_on: date | None = None

    @field_validator("document_number")
    @classmethod
    def number_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 50:
            raise ValueError("Số giấy tờ phải từ 1 đến 50 ký tự.")
        return v


class VerifyDocumentRequest(BaseModel):
    verified_status: Literal["VERIFIED", "REJECTED"]
    verified_birth_date: date | None = None
    expires_on: date | None = None
