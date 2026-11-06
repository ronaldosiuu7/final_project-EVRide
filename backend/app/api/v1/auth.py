"""Đăng ký, đăng nhập."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.responses import make_response
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.models import User, Wallet
from app.schemas.auth import LoginRequest, RegisterRequest
from app.schemas.user import UserOut, WalletOut
router = APIRouter(tags=["Auth"])
@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """
    Đăng ký tài khoản CUSTOMER.
    Tạo user + wallet (balance=0) trong cùng một transaction.
    """
    # 1. Chuẩn hóa email
    email = body.email.strip().lower()
    # 2. Kiểm tra email đã tồn tại chưa
    exists = db.scalars(select(User).where(User.email == email)).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EMAIL_EXISTS", "message": "Email đã được sử dụng."},
        )
    # 3. Tạo User
    user = User(
        name=body.name.strip(),
        email=email,
        password=hash_password(body.password),
        role="CUSTOMER",
        status="ACTIVE",
    )
    db.add(user)
    db.flush()  # flush để có user.id cho wallet
    # 4. Tạo Wallet trong cùng transaction
    wallet = Wallet(
        user_id=user.id,
        balance=0,
        status="ACTIVE",
    )
    db.add(wallet)
    # 5. Commit cả hai
    db.commit()
    db.refresh(user)
    db.refresh(wallet)
    return make_response({
        "user": UserOut.from_model(user).model_dump(),
        "wallet": WalletOut.from_model(wallet).model_dump(),
    })
from fastapi import Request, Response
from pydantic import BaseModel, ConfigDict

from app.core.auth_http import (
    require_web_request, session_header, cookie_candidates,
    set_grant_cookie, clear_session_cookies,
)
from app.core.auth_sessions import login_session, refresh_session, logout_session


class EmptyAuthBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


@router.post("/auth/login", dependencies=[Depends(require_web_request)])
def login(body: LoginRequest, request: Request, response: Response):
    grant = login_session(
        str(body.email), body.password, request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    set_grant_cookie(request, response, grant)
    return make_response(grant["data"])


@router.post("/auth/refresh", dependencies=[Depends(require_web_request)])
def refresh(body: EmptyAuthBody, request: Request, response: Response):
    sid = session_header(request)
    grant = refresh_session(sid, cookie_candidates(request, sid))
    set_grant_cookie(request, response, grant)
    return make_response(grant["data"])


@router.post("/auth/logout", dependencies=[Depends(require_web_request)])
def logout(body: EmptyAuthBody, request: Request, response: Response):
    sid = session_header(request)
    result = logout_session(sid, cookie_candidates(request, sid))
    clear_session_cookies(request, response, sid)
    return make_response(result)