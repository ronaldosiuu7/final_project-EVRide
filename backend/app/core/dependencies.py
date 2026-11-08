from datetime import datetime, timezone
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.models import User, UserSession

bearer_scheme = HTTPBearer(auto_error=False)


def problem(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message},
                         headers={"WWW-Authenticate": "Bearer"} if status == 401 else None)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise problem(401, "UNAUTHENTICATED", "Thiếu access token.")
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError:
        raise problem(401, "UNAUTHENTICATED", "Access token không hợp lệ.")
    row = db.execute(
        select(User, UserSession)
        .join(UserSession, UserSession.user_id == User.id)
        .where(User.id == int(payload["sub"]), UserSession.id == UUID(payload["sid"]))
        .execution_options(populate_existing=True)
    ).first()
    if row is None:
        raise problem(401, "SESSION_INVALID", "Phiên không hợp lệ.")
    user, session = row
    if user.status != "ACTIVE":
        raise problem(403, "ACCOUNT_DISABLED", "Tài khoản không hoạt động.")
    if session.revoked_at is not None:
        raise problem(401, "SESSION_REVOKED", "Phiên đã thu hồi.")
    if session.expires_at <= datetime.now(timezone.utc):
        raise problem(401, "SESSION_EXPIRED", "Phiên đã hết hạn.")
    if payload["expired"]:
        raise problem(401, "TOKEN_EXPIRED", "Access token đã hết hạn.")
    request.state.auth_sid = session.id
    return user


def require_role(*allowed_roles: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise problem(403, "FORBIDDEN", "Không đủ quyền.")
        return current_user
    return checker