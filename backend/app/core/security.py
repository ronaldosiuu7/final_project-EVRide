"""JWT token và password hashing."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import bcrypt
import jwt
from app.core.auth_config import ACCESS_SECONDS, JWT_AUDIENCE, JWT_ISSUER, JWT_SECRET


# ── Password ──────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Hash mật khẩu bằng bcrypt. Trả về chuỗi lưu vào DB."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """So sánh mật khẩu người dùng nhập với hash đã lưu."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT ───────────────────────────────────────────────────

def create_access_token(user_id: int, session_id: UUID, now: datetime) -> tuple[str, int]:
    issued = int(now.timestamp())
    payload = {
        "sub": str(user_id), "sid": str(session_id), "iat": issued,
        "exp": issued + ACCESS_SECONDS, "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE, "typ": "access", "jti": str(uuid4()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256"), ACCESS_SECONDS


def decode_access_token(token: str) -> dict:
    # Xác minh cấu trúc trước khi phân loại hết hạn; không biến JWT thiếu sid thành TOKEN_EXPIRED.
    payload = jwt.decode(
        token, JWT_SECRET, algorithms=["HS256"], issuer=JWT_ISSUER,
        audience=JWT_AUDIENCE,
        options={"require": ["sub", "sid", "iat", "exp", "iss", "aud", "typ", "jti"],
                 "verify_exp": False},
    )
    try:
        uid = payload["sub"]
        if not isinstance(uid, str) or not uid.isascii() or not uid.isdigit():
            raise ValueError()
        if not 0 < int(uid) <= 9223372036854775807:
            raise ValueError()
        if not isinstance(payload["sid"], str) or not isinstance(payload["jti"], str):
            raise ValueError()
        UUID(payload["sid"])
        UUID(payload["jti"])
        if payload["typ"] != "access":
            raise ValueError()
        if type(payload["iat"]) is not int or type(payload["exp"]) is not int:
            raise ValueError()
        if payload["exp"] - payload["iat"] != ACCESS_SECONDS:
            raise ValueError()
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise jwt.InvalidTokenError("Invalid claims") from exc
    # Chỉ đánh dấu expired sau xác minh chữ ký, issuer, audience và cấu trúc.
    payload["expired"] = payload["exp"] <= datetime.now(timezone.utc).timestamp()
    return payload