import os
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, MultiFernet
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

APP_ENV = os.getenv("APP_ENV", "development")
if APP_ENV not in {"development", "test", "production"}:
    raise RuntimeError("APP_ENV không hợp lệ")
JWT_SECRET = os.environ.get("JWT_SECRET_KEY", "")
if len(JWT_SECRET.encode()) < 32 or JWT_SECRET in {
    "your-super-secret-key-change-in-production", "dev-secret-change-me"
}:
    raise RuntimeError("Phải cấu hình JWT_SECRET_KEY ngẫu nhiên riêng")
JWT_ISSUER = os.getenv("JWT_ISSUER", "evride-api")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "evride-web")
ACCESS_SECONDS = 1800
REFRESH_DAYS = 30
GRACE_SECONDS = int(os.getenv("REFRESH_GRACE_SECONDS", "15"))
if not 1 <= GRACE_SECONDS <= 60:
    raise RuntimeError("Grace phải trong 1..60 giây")
keys = [k.strip() for k in os.getenv("REFRESH_REPLAY_KEYS", "").split(",") if k.strip()]
if not keys:
    raise RuntimeError("Thiếu REFRESH_REPLAY_KEYS")
REPLAY_CIPHER = MultiFernet([Fernet(k.encode()) for k in keys])
ORIGINS = tuple(o.strip() for o in os.getenv("AUTH_ORIGINS", "").split(",") if o.strip())
if not ORIGINS:
    raise RuntimeError("Thiếu AUTH_ORIGINS")
for origin in ORIGINS:
    p = urlsplit(origin)
    if p.scheme not in {"http", "https"} or not p.hostname or p.username or p.password:
        raise RuntimeError("Origin không hợp lệ")
    if p.path or p.query or p.fragment or "*" in origin:
        raise RuntimeError("Origin phải chính xác, không path/wildcard")
    if APP_ENV == "production" and p.scheme != "https":
        raise RuntimeError("Production cần HTTPS origin")
secure = os.getenv("AUTH_COOKIE_SECURE", "true").lower()
if secure not in {"true", "false"}:
    raise RuntimeError("AUTH_COOKIE_SECURE phải true hoặc false")
COOKIE_SECURE = secure == "true"
if APP_ENV == "production" and not COOKIE_SECURE:
    raise RuntimeError("Production bắt buộc cookie Secure")
COOKIE_PATH = "/api/v1/auth"
COOKIE_SAMESITE = "lax"