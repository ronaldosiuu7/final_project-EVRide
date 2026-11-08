"""Schemas cho đăng ký, đăng nhập, đổi mật khẩu."""
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Tên không được để trống.")
        if len(v) > 100:
            raise ValueError("Tên tối đa 100 ký tự.")
        return v
    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        # Contract: 12–128 ký tự, KHÔNG trim
        if len(v) < 12 or len(v) > 128:
            raise ValueError("Mật khẩu phải từ 12 đến 128 ký tự.")
        return v
class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str
class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str
    new_password: str
    @field_validator("new_password")
    @classmethod
    def new_password_length(cls, v: str) -> str:
        if len(v) < 12 or len(v) > 128:
            raise ValueError("Mật khẩu mới phải từ 12 đến 128 ký tự.")
        return v

  