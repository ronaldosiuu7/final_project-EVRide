from datetime import timedelta
from sqlalchemy import select, update

from app.core.auth_sessions import now, lock_users, lock_sessions
from app.database import SessionLocal
from app.models import UserSession, RefreshToken


def cleanup():
    at = now()
    # Transaction riêng chỉ chạm token; không lấy user/session sau token.
    with SessionLocal.begin() as db:
        db.execute(update(RefreshToken).where(
            RefreshToken.replay_until <= at,
            RefreshToken.replay_ciphertext.is_not(None),
        ).values(replay_ciphertext=None))
    cutoff = at - timedelta(days=30)
    with SessionLocal() as db:
        candidates = db.execute(select(UserSession.id, UserSession.user_id).where(
            (UserSession.revoked_at < cutoff) |
            ((UserSession.revoked_at.is_(None)) & (UserSession.expires_at < cutoff))
        ).order_by(UserSession.id).limit(500)).all()
    for sid, uid in candidates:
        with SessionLocal.begin() as db:
            lock_users(db, [uid])
            sessions = lock_sessions(db, [uid])
            session = next((s for s in sessions if s.id == sid), None)
            if session is None:
                continue
            terminal = session.revoked_at or session.expires_at
            if terminal < cutoff:
                db.delete(session)


if __name__ == "__main__":
    cleanup()