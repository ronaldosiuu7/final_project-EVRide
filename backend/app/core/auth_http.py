import re
from datetime import datetime
from uuid import UUID

from fastapi import Request, Response

from app.core.auth_config import COOKIE_PATH, COOKIE_SECURE, COOKIE_SAMESITE, ORIGINS
from app.core.dependencies import problem


def require_web_request(request: Request):
    if request.headers.get("origin") not in ORIGINS:
        raise problem(403, "CSRF_REJECTED", "Origin không được phép.")
    if request.headers.get("x-evride-csrf") != "1":
        raise problem(403, "CSRF_REJECTED", "Thiếu header chống CSRF.")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise problem(415, "UNSUPPORTED_MEDIA_TYPE", "Cần application/json.")


def session_header(request: Request) -> UUID:
    try:
        return UUID(request.headers["x-session-id"])
    except (KeyError, ValueError, AttributeError):
        raise problem(400, "SESSION_SELECTION_REQUIRED", "Cần X-Session-ID hợp lệ.")


def cookie_name(sid: UUID, generation: int) -> str:
    return f"evr_rt_{sid.hex}_{generation}"


def cookie_candidates(request: Request, sid: UUID) -> list[tuple[int, str]]:
    pattern = re.compile(rf"^evr_rt_{sid.hex}_(0|[1-9][0-9]{{0,9}})$")
    result = []
    for name, value in request.cookies.items():
        match = pattern.fullmatch(name)
        if match and re.fullmatch(r"[A-Za-z0-9_-]{43}", value):
            result.append((int(match[1]), value))
    if len(result) > 32:
        raise problem(400, "TOO_MANY_AUTH_COOKIES", "Cần xóa cookie cũ và đăng nhập lại.")
    return result


def no_store(response: Response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


def clear_cookie(response: Response, name: str):
    response.delete_cookie(name, path=COOKIE_PATH, domain=None,
                           secure=COOKIE_SECURE, httponly=True, samesite=COOKIE_SAMESITE)


def clear_session_cookies(request: Request, response: Response, sid: UUID):
    prefix = f"evr_rt_{sid.hex}_"
    for name in request.cookies:
        if name.startswith(prefix):
            clear_cookie(response, name)
    no_store(response)


def set_grant_cookie(request: Request, response: Response, grant: dict):
    sid = UUID(grant["data"]["session_id"])
    generation = grant["data"]["generation"]
    prefix = f"evr_rt_{sid.hex}_"
    for name in request.cookies:
        if name.startswith(prefix):
            suffix = name[len(prefix):]
            if suffix.isascii() and suffix.isdigit() and len(suffix) <= 10 and int(suffix) < generation:
                clear_cookie(response, name)
    response.set_cookie(
        cookie_name(sid, generation), grant["refresh_token"],
        expires=datetime.fromisoformat(grant["refresh_expires_at"]),
        path=COOKIE_PATH, domain=None, secure=COOKIE_SECURE,
        httponly=True, samesite=COOKIE_SAMESITE,
    )
    no_store(response)