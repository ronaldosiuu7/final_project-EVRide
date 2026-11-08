import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from cryptography.fernet import InvalidToken
from fastapi import HTTPException
from sqlalchemy import func, select, text

from app.core.auth_config import REFRESH_DAYS, GRACE_SECONDS, REPLAY_CIPHER
from app.core.dependencies import problem
from app.core.security import create_access_token, hash_password, verify_password
from app.database import SessionLocal
from app.models import User, UserSession, RefreshToken
from app.schemas.user import UserOut


def now():
    return datetime.now(timezone.utc)


def digest(raw: str) -> str:
    return hashlib.sha256(raw.encode("ascii")).hexdigest()


def password_matches(plain, hashed):
    try:
        return verify_password(plain, hashed)
    except (ValueError, TypeError):
        return False


def transaction(operation):
    with SessionLocal.begin() as db:
        result = operation(db)
    # __exit__ ở trên đã commit; không đặt raise reuse bên trong with.
    if isinstance(result, HTTPException):
        raise result
    return result


def lock_users(db, ids):
    rows = db.scalars(
        select(User).where(User.id.in_(sorted(set(ids))))
        .order_by(User.id).with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    return {u.id: u for u in rows}


def lock_sessions(db, user_ids):
    return db.scalars(
        select(UserSession).where(UserSession.user_id.in_(user_ids))
        .order_by(UserSession.id).with_for_update()
        .execution_options(populate_existing=True)
    ).all()


def require_live(user, session, at):
    if user is None or session is None or session.user_id != user.id:
        raise problem(401, "SESSION_INVALID", "Phiên không hợp lệ.")
    if user.status != "ACTIVE":
        raise problem(403, "ACCOUNT_DISABLED", "Tài khoản không hoạt động.")
    if session.revoked_at is not None:
        raise problem(401, "SESSION_REVOKED", "Phiên đã thu hồi.")
    if session.expires_at <= at:
        raise problem(401, "SESSION_EXPIRED", "Phiên đã hết hạn.")


def revoke(session, at, reason):
    if session.revoked_at is None:
        session.revoked_at = at
        session.revoke_reason = reason


def grant_for(user, session, generation, raw, at):
    access, seconds = create_access_token(user.id, session.id, at)
    return {
        "data": {
            "access_token": access, "token_type": "bearer", "expires_in": seconds,
            "access_expires_at": datetime.fromtimestamp(int(at.timestamp()) + seconds, timezone.utc).isoformat(),
            "session_id": str(session.id), "generation": generation,
            "session_expires_at": session.expires_at.isoformat(),
            "user": UserOut.from_model(user).model_dump(mode="json"),
        },
        # Chỉ dùng nội bộ để Set-Cookie/mã hóa; router không trả hai field này trong JSON.
        "refresh_token": raw, "refresh_expires_at": session.expires_at.isoformat(),
    }


def login_session(email, password, user_agent=None, ip_address=None):
    def operation(db):
        user = db.scalar(
            select(User).where(User.email == email.strip().lower()).with_for_update()
            .execution_options(populate_existing=True)
        )
        if user is None or not password_matches(password, user.password):
            raise problem(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.")
        if user.status != "ACTIVE":
            raise problem(403, "ACCOUNT_DISABLED", "Tài khoản không hoạt động.")
        at = now()
        session = UserSession(
            id=uuid4(), user_id=user.id, created_at=at, last_used_at=at,
            expires_at=at + timedelta(days=REFRESH_DAYS),
            user_agent=(user_agent or "")[:512], ip_address=(ip_address or "")[:64],
        )
        db.add(session)
        db.flush()
        raw = secrets.token_urlsafe(32)
        db.add(RefreshToken(
            session_id=session.id, generation=0, token_hash=digest(raw),
            created_at=at, expires_at=session.expires_at,
        ))
        return grant_for(user, session, 0, raw, at)
    return transaction(operation)


def locate(db, sid):
    # Chỉ đọc ID để biết phải khóa user nào; không dùng snapshot này để quyết định quyền.
    uid = db.scalar(select(UserSession.user_id).where(UserSession.id == sid))
    if uid is None:
        raise problem(401, "SESSION_INVALID", "Phiên không hợp lệ.")
    user = lock_users(db, [uid]).get(uid)
    session = db.scalar(
        select(UserSession).where(UserSession.id == sid).with_for_update()
        .execution_options(populate_existing=True)
    )
    return user, session


def matching_token(db, sid, candidates):
    if not candidates:
        raise problem(401, "REFRESH_INVALID", "Thiếu refresh cookie hợp lệ.")
    offered = {(generation, digest(raw)) for generation, raw in candidates}
    rows = db.scalars(
        select(RefreshToken)
        .where(RefreshToken.session_id == sid,
               RefreshToken.token_hash.in_([h for _, h in offered]))
        .order_by(RefreshToken.generation).with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    valid = [t for t in rows if (t.generation, t.token_hash) in offered]
    if not valid:
        raise problem(401, "REFRESH_INVALID", "Refresh token không hợp lệ.")
    return valid[-1]


def refresh_session(sid, candidates):
    def operation(db):
        user, session = locate(db, sid)
        require_live(user, session, now())
        old = matching_token(db, sid, candidates)
        at = now()  # sau khi đã lấy mọi khóa cần thiết
        require_live(user, session, at)
        if old.used_at is not None:
            if at >= old.replay_until:
                revoke(session, at, "REFRESH_REUSE")
                return problem(401, "REFRESH_REUSED", "Phát hiện reuse; phiên đã thu hồi.")
            successor = db.scalar(
                select(RefreshToken)
                .where(RefreshToken.session_id == sid,
                       RefreshToken.generation == old.generation + 1)
                .with_for_update().execution_options(populate_existing=True)
            )
            if (successor is None or successor.used_at is not None or
                    successor.expires_at <= at or not old.replay_ciphertext):
                return problem(409, "REFRESH_RETRY_UNAVAILABLE", "Không thể replay kết quả cũ.")
            try:
                grant = json.loads(REPLAY_CIPHER.decrypt(old.replay_ciphertext.encode()))
                if (grant["data"]["session_id"] != str(sid) or
                        grant["data"]["generation"] != successor.generation or
                        digest(grant["refresh_token"]) != successor.token_hash):
                    raise ValueError("Replay mismatch")
            except (InvalidToken, ValueError, TypeError, KeyError, UnicodeError):
                return problem(409, "REFRESH_RETRY_UNAVAILABLE", "Kết quả replay không còn khả dụng.")
            return grant  # không đổi used_at, hạn session/token, generation hoặc ciphertext
        if old.expires_at <= at:
            raise problem(401, "REFRESH_EXPIRED", "Refresh token đã hết hạn.")
        raw = secrets.token_urlsafe(32)
        session.last_used_at = at
        session.expires_at = at + timedelta(days=REFRESH_DAYS)
        old.used_at = at
        old.replay_until = at + timedelta(seconds=GRACE_SECONDS)
        # Giải phóng partial unique trước insert token mới.
        db.flush()
        db.add(RefreshToken(
            session_id=sid, generation=old.generation + 1, token_hash=digest(raw),
            created_at=at, expires_at=session.expires_at,
        ))
        grant = grant_for(user, session, old.generation + 1, raw, at)
        old.replay_ciphertext = REPLAY_CIPHER.encrypt(
            json.dumps(grant, separators=(",", ":")).encode()
        ).decode()
        return grant
    return transaction(operation)


def logout_session(sid, candidates):
    def operation(db):
        user, session = locate(db, sid)
        if session is None or user is None:
            raise problem(401, "SESSION_INVALID", "Phiên không hợp lệ.")
        # Token có hash khớp là bằng chứng sở hữu phiên cho thao tác chỉ thu hồi.
        # Cho phép token đã dùng/hết hạn để logout sau lỗi refresh; không rotation/replay.
        matching_token(db, sid, candidates)
        revoke(session, now(), "LOGOUT")
        return {"logged_out": True}
    return transaction(operation)


def change_session_password(uid, sid, current_password, new_password):
    def operation(db):
        user = lock_users(db, [uid]).get(uid)
        sessions = lock_sessions(db, [uid])
        current = next((s for s in sessions if s.id == sid), None)
        require_live(user, current, now())
        if not password_matches(current_password, user.password):
            raise problem(401, "INVALID_CREDENTIALS", "Mật khẩu hiện tại không đúng.")
        user.password = hash_password(new_password)
        at = now()
        for session in sessions:
            revoke(session, at, "PASSWORD_CHANGED")
        return {"changed": True, "reauthenticate": True}
    return transaction(operation)


def update_account(actor_id, actor_sid, target_id, body):
    def operation(db):
        # Một khóa riêng để serialize cập nhật role/status và bảo vệ manager cuối cùng.
        db.execute(text("SELECT pg_advisory_xact_lock(67401, 1)"))
        users = lock_users(db, [actor_id, target_id])
        actor, target = users.get(actor_id), users.get(target_id)
        sessions = lock_sessions(db, sorted(users))
        actor_session = next((s for s in sessions if s.id == actor_sid), None)
        require_live(actor, actor_session, now())
        if actor.role != "MANAGER":
            raise problem(403, "FORBIDDEN", "Không đủ quyền.")
        if target is None:
            raise problem(404, "NOT_FOUND", "Không tìm thấy người dùng.")
        if target.role == "CUSTOMER" and body.role and body.role != "CUSTOMER":
            raise problem(409, "INVALID_STATE_TRANSITION", "Không thể đổi CUSTOMER thành nhân viên.")
        demoting = body.role is not None and body.role != "MANAGER"
        disabling = body.status is not None and body.status != "ACTIVE"
        if target.role == "MANAGER" and (demoting or disabling):
            count = db.scalar(select(func.count()).select_from(User).where(
                User.role == "MANAGER", User.status == "ACTIVE"
            ))
            if count <= 1:
                raise problem(409, "INVALID_STATE_TRANSITION", "Không thể khóa/hạ quyền MANAGER cuối cùng.")
        if body.name is not None:
            target.name = body.name
        if body.role is not None:
            target.role = body.role
        if body.status is not None:
            target.status = body.status
            if body.status != "ACTIVE":
                at = now()
                for session in sessions:
                    if session.user_id == target_id:
                        revoke(session, at, "ACCOUNT_DISABLED")
        return UserOut.from_model(target).model_dump(mode="json")
    return transaction(operation)