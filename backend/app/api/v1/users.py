"""Hồ sơ cá nhân và quản lý tài khoản."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.dependencies import get_current_user, require_role
from app.core.responses import make_list_response, make_response
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.models import User
from app.schemas.auth import ChangePasswordRequest
from app.schemas.user import (
    CreateStaffRequest,
    UpdateProfileRequest,
    UpdateUserRequest,
    UserOut,
)
from app.core.auth_http import require_web_request, clear_session_cookies
from app.core.auth_sessions import change_session_password, update_account
router = APIRouter(tags=["Users"])
# ── Hồ sơ cá nhân ────────────────────────────────────────
@router.get("/users/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Xem hồ sơ của chính mình."""
    return make_response(UserOut.from_model(current_user).model_dump())
@router.patch("/users/me")
def update_me(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sửa tên hiển thị."""
    current_user.name = body.name
    db.commit()
    db.refresh(current_user)
    return make_response(UserOut.from_model(current_user).model_dump())
@router.post("/users/me/change-password", dependencies=[Depends(require_web_request)])
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    sid = request.state.auth_sid
    result = change_session_password(
        current_user.id, sid, body.current_password, body.new_password
    )
    # Cookie Path=/api/v1/auth không gửi tới /users/me/change-password.
    # Tất cả phiên đã revoke trong DB; frontend gọi logout sau đó để dọn cookie hiện tại.
    clear_session_cookies(request, response, sid)
    return make_response(result)
# ── Quản lý tài khoản (S/M) ──────────────────────────────
@router.get("/users")
def list_users(
    role: str | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    """S/M xem danh sách tài khoản."""
    query = select(User)
    count_query = select(func.count()).select_from(User)
    # Lọc theo role
    if role:
        query = query.where(User.role == role.upper())
        count_query = count_query.where(User.role == role.upper())
    # Lọc theo status
    if status:
        query = query.where(User.status == status.upper())
        count_query = count_query.where(User.status == status.upper())
    # Tìm kiếm theo tên hoặc email
    if q:
        pattern = f"%{q}%"
        query = query.where(User.name.ilike(pattern) | User.email.ilike(pattern))
        count_query = count_query.where(
            User.name.ilike(pattern) | User.email.ilike(pattern)
        )
    total = db.scalar(count_query) or 0
    users = db.scalars(
        query.order_by(User.created_at.desc(), User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return make_list_response(
        [UserOut.from_model(u).model_dump() for u in users],
        page=page,
        page_size=page_size,
        total=total,
    )
@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    """S/M xem chi tiết một tài khoản."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Người dùng không tồn tại."},
        )
    return make_response(UserOut.from_model(user).model_dump())
# ── Tạo tài khoản nhân viên (M) ──────────────────────────
@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_staff(
    body: CreateStaffRequest,
    current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    """MANAGER tạo tài khoản STAFF hoặc MANAGER. Không dùng để tạo CUSTOMER."""
    email = body.email.strip().lower()
    exists = db.scalars(select(User).where(User.email == email)).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EMAIL_EXISTS", "message": "Email đã được sử dụng."},
        )
    user = User(
        name=body.name.strip(),
        email=email,
        password=hash_password(body.password),
        role=body.role,
        status="ACTIVE",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return make_response(UserOut.from_model(user).model_dump())
# ── Cập nhật tài khoản (M) ───────────────────────────────
@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    request: Request,
    current_user: User = Depends(require_role("MANAGER")),
):
    data = update_account(current_user.id, request.state.auth_sid, user_id, body)
    return make_response(data)