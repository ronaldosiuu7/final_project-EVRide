"""Schemas cho quản lý người dùng."""
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, field_validator
# ── Response ──────────────────────────────────────────────
class UserOut(BaseModel):
    """Schema trả về cho User — KHÔNG BAO GIỜ trả password."""
    id: str            # Contract: ID là chuỗi số
    name: str
    email: str
    role: str
    status: str
    created_at: datetime
    @classmethod
    def from_model(cls, user) -> UserOut:
        return cls(
            id=str(user.id),
            name=user.name,
            email=user.email,
            role=user.role,
            status=user.status,
            created_at=user.created_at,
        )
class WalletOut(BaseModel):
    id: str
    user_id: str
    balance: str       # Contract: tiền là chuỗi, ví dụ "0.00"
    status: str
    created_at: datetime
    updated_at: datetime
    @classmethod
    def from_model(cls, wallet) -> WalletOut:
        return cls(
            id=str(wallet.id),
            user_id=str(wallet.user_id),
            balance=f"{wallet.balance:.2f}",
            status=wallet.status,
            created_at=wallet.created_at,
            updated_at=wallet.updated_at,
        )
# ── Request ───────────────────────────────────────────────
class UpdateProfileRequest(BaseModel):
    name: str
    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 100:
            raise ValueError("Tên phải từ 1 đến 100 ký tự.")
        return v
class CreateStaffRequest(BaseModel):
    """MANAGER tạo tài khoản STAFF hoặc MANAGER."""
    name: str
    email: EmailStr
    password: str
    role: Literal["STAFF", "MANAGER"]
    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 100:
            raise ValueError("Tên phải từ 1 đến 100 ký tự.")
        return v
    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 12 or len(v) > 128:
            raise ValueError("Mật khẩu phải từ 12 đến 128 ký tự.")
        return v
class UpdateUserRequest(BaseModel):
    """MANAGER cập nhật tài khoản khác."""
    name: str | None = None
    status: Literal["ACTIVE", "INACTIVE", "BLOCKED", "BLACKLISTED"] | None = None
    role: Literal["CUSTOMER", "STAFF", "MANAGER"] | None = None
    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v or len(v) > 100:
                raise ValueError("Tên phải từ 1 đến 100 ký tự.")
        return v