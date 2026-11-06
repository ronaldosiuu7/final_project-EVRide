import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

url = make_url(os.environ["TEST_DATABASE_URL"])
if url.drivername != "postgresql+psycopg" or not (url.database or "").endswith("_test"):
    raise RuntimeError("Cần PostgreSQL psycopg và database riêng có hậu tố _test")
# Thiết lập trước import app để không dùng secrets/DB production từ .env.
os.environ.update({
    "APP_ENV": "test", "JWT_SECRET_KEY": secrets.token_urlsafe(48),
    "REFRESH_REPLAY_KEYS": Fernet.generate_key().decode(),
    "AUTH_COOKIE_SECURE": "true", "AUTH_ORIGINS": "https://thuexedien.me",
    "REFRESH_GRACE_SECONDS": "15", "JWT_ISSUER": "evride-api", "JWT_AUDIENCE": "evride-web",
    "DB_HOST": url.host or "localhost", "DB_PORT": str(url.port or 5432),
    "DB_NAME": url.database, "DB_USER": url.username or "postgres",
    "DB_PASSWORD": url.password or "",
})

from app.core import auth_sessions as service
from app.core.auth_config import JWT_SECRET, GRACE_SECONDS
from app.core.auth_http import cookie_name
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.main import app
from app.models import Base, User, UserSession, RefreshToken
from app.schemas.user import UpdateUserRequest

PASSWORD = "Test-password-2026"
NEW_PASSWORD = "Another-password-2026"
ORIGIN = "https://thuexedien.me"


@pytest.fixture
def factory(monkeypatch):
    admin = create_engine(url)
    schema = "auth_test_" + uuid4().hex
    with admin.begin() as conn:
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    Base.metadata.create_all(engine, tables=[User.__table__, UserSession.__table__, RefreshToken.__table__])
    factory = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(service, "SessionLocal", factory)
    with factory.begin() as db:
        db.add_all([
            User(name="Test", email="customer@example.com", password=hash_password(PASSWORD), role="CUSTOMER", status="ACTIVE"),
            User(name="Manager", email="manager@example.com", password=hash_password(PASSWORD), role="MANAGER", status="ACTIVE"),
        ])
    def override_db():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override_db
    yield factory
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()
    with admin.begin() as conn:
        conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
    admin.dispose()


@pytest.fixture
def client(factory):
    with TestClient(app, base_url="https://api.thuexedien.me") as c:
        yield c


def login(email="customer@example.com"):
    return service.login_session(email, PASSWORD)


def sid(grant):
    return UUID(grant["data"]["session_id"])


def offered(grant):
    return [(grant["data"]["generation"], grant["refresh_token"])]


def refresh(grant):
    return service.refresh_session(sid(grant), offered(grant))


def code(call):
    try:
        return call()
    except HTTPException as exc:
        return exc.detail["code"]


def get_me(client, grant):
    return client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + grant["data"]["access_token"]})


def headers(grant=None):
    result = {"Origin": ORIGIN, "X-EVRide-CSRF": "1"}
    if grant:
        result["X-Session-ID"] = str(sid(grant))
        result["Cookie"] = cookie_name(sid(grant), grant["data"]["generation"]) + "=" + grant["refresh_token"]
    return result


def test_login_and_rolling(factory, monkeypatch):
    real_now = service.now
    yesterday = real_now() - timedelta(days=1)
    monkeypatch.setattr(service, "now", lambda: yesterday)
    first = login()
    another = login()
    assert sid(first) != sid(another)
    monkeypatch.setattr(service, "now", real_now)
    before = real_now()
    second = refresh(first)
    assert second["data"]["generation"] == 1
    assert second["refresh_token"] != first["refresh_token"]
    with factory() as db:
        session = db.get(UserSession, sid(first))
        assert before + timedelta(days=30) <= session.expires_at <= real_now() + timedelta(days=30)
        rows = db.scalars(select(RefreshToken).where(RefreshToken.session_id == sid(first)).order_by(RefreshToken.generation)).all()
        assert len(rows) == 2 and rows[0].used_at is not None and rows[1].used_at is None
        assert rows[1].expires_at == session.expires_at
        assert rows[0].token_hash == service.digest(first["refresh_token"])
        assert second["refresh_token"] not in rows[0].replay_ciphertext


def test_lost_response_replay_does_not_extend_grace(factory):
    first = login()
    second = refresh(first)  # giả lập response bị mất: client chỉ giữ first
    with factory() as db:
        old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
        original = (old.used_at, old.replay_until)
    assert refresh(first) == second
    with factory() as db:
        old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
        assert (old.used_at, old.replay_until) == original
        assert db.scalar(select(func.count()).select_from(RefreshToken)) == 2


def test_many_generations_and_reuse_committed(factory, monkeypatch, client):
    first = login()
    second = refresh(first)
    third = refresh(second)
    assert code(lambda: refresh(first)) == "REFRESH_RETRY_UNAVAILABLE"
    with factory() as db:
        old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
        boundary = old.replay_until
    monkeypatch.setattr(service, "now", lambda: boundary)
    assert code(lambda: refresh(first)) == "REFRESH_REUSED"
    # Session mới, connection mới: chứng minh revocation không bị rollback bởi HTTPException.
    with factory() as db:
        assert db.get(UserSession, sid(first)).revoke_reason == "REFRESH_REUSE"
    assert get_me(client, third).json()["error"]["code"] == "SESSION_REVOKED"


@pytest.mark.parametrize("kind", ["missing_cache", "bad_cache", "successor_used"])
def test_retry_unavailable(factory, kind):
    first = login()
    second = refresh(first)
    if kind == "successor_used":
        refresh(second)
    else:
        with factory.begin() as db:
            old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
            old.replay_ciphertext = None if kind == "missing_cache" else "broken"
    assert code(lambda: refresh(first)) == "REFRESH_RETRY_UNAVAILABLE"
    with factory() as db:
        assert db.get(UserSession, sid(first)).revoked_at is None


def test_atomic_rollback(factory, monkeypatch):
    first = login()
    def fail(*args):
        raise RuntimeError("injected failure after old token flush")
    monkeypatch.setattr(service, "grant_for", fail)
    with pytest.raises(RuntimeError):
        refresh(first)
    with factory() as db:
        old = db.scalar(select(RefreshToken))
        assert old.used_at is None and old.replay_ciphertext is None
        assert db.scalar(select(func.count()).select_from(RefreshToken)) == 1


def test_password_rollback(factory, monkeypatch):
    first, other = login(), login()
    original_revoke = service.revoke
    def fail_after_revoke(session, at, reason):
        original_revoke(session, at, reason)
        raise RuntimeError("injected failure during password revocation")
    monkeypatch.setattr(service, "revoke", fail_after_revoke)
    uid = int(first["data"]["user"]["id"])
    with pytest.raises(RuntimeError):
        service.change_session_password(uid, sid(first), PASSWORD, NEW_PASSWORD)
    with factory() as db:
        assert verify_password(PASSWORD, db.get(User, uid).password)
        assert all(db.get(UserSession, sid(g)).revoked_at is None for g in [first, other])


def test_refresh_races_account_lock(factory, client):
    customer, manager = login(), login("manager@example.com")
    gate = Barrier(2)
    def a():
        gate.wait(timeout=5)
        return code(lambda: refresh(customer))
    def b():
        gate.wait(timeout=5)
        return service.update_account(
            int(manager["data"]["user"]["id"]), sid(manager),
            int(customer["data"]["user"]["id"]), UpdateUserRequest(status="BLOCKED")
        )
    with ThreadPoolExecutor(max_workers=2) as pool:
        x, y = pool.submit(a), pool.submit(b)
        outcome, _ = x.result(timeout=15), y.result(timeout=15)
    assert isinstance(outcome, dict) or outcome == "ACCOUNT_DISABLED"
    assert get_me(client, customer).status_code == 403
    with factory() as db:
        assert db.get(UserSession, sid(customer)).revoked_at is not None


def test_concurrent_refresh_rotates_once(factory):
    first = login()
    gate = Barrier(2)
    def worker():
        gate.wait(timeout=5)
        return refresh(first)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker) for _ in range(2)]
        a, b = [f.result(timeout=15) for f in futures]
    assert a == b
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(RefreshToken)) == 2


@pytest.mark.parametrize("action", ["logout", "password"])
def test_refresh_races_revocation(factory, client, action):
    first = login()
    other_session = login()
    uid = int(first["data"]["user"]["id"])
    gate = Barrier(2)
    def refresh_worker():
        gate.wait(timeout=5)
        return code(lambda: refresh(first))
    def revoke_worker():
        gate.wait(timeout=5)
        if action == "logout":
            return service.logout_session(sid(first), offered(first))
        return service.change_session_password(uid, sid(first), PASSWORD, NEW_PASSWORD)
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(refresh_worker), pool.submit(revoke_worker)
        outcome, _ = a.result(timeout=15), b.result(timeout=15)
    assert isinstance(outcome, dict) or outcome == "SESSION_REVOKED"
    assert get_me(client, first).status_code == 401
    if isinstance(outcome, dict):
        assert get_me(client, outcome).status_code == 401
    if action == "password":
        assert get_me(client, other_session).status_code == 401
        with factory() as db:
            assert verify_password(NEW_PASSWORD, db.get(User, uid).password)
    else:
        assert get_me(client, other_session).status_code == 200


def test_disable_reenable_does_not_resurrect(factory, client):
    customer = login()
    manager = login("manager@example.com")
    actor = int(manager["data"]["user"]["id"])
    target = int(customer["data"]["user"]["id"])
    service.update_account(actor, sid(manager), target, UpdateUserRequest(status="BLOCKED"))
    assert get_me(client, customer).json()["error"]["code"] == "ACCOUNT_DISABLED"
    assert code(lambda: refresh(customer)) == "ACCOUNT_DISABLED"
    service.update_account(actor, sid(manager), target, UpdateUserRequest(status="ACTIVE"))
    assert get_me(client, customer).json()["error"]["code"] == "SESSION_REVOKED"


@pytest.mark.parametrize("kind", ["session", "refresh"])
def test_expiration(factory, client, kind):
    grant = login()
    with factory.begin() as db:
        obj = db.get(UserSession, sid(grant)) if kind == "session" else db.scalar(select(RefreshToken))
        obj.created_at = service.now() - timedelta(days=31)
        obj.expires_at = service.now() - timedelta(seconds=1)
    assert code(lambda: refresh(grant)) == ("SESSION_EXPIRED" if kind == "session" else "REFRESH_EXPIRED")
    if kind == "session":
        assert get_me(client, grant).status_code == 401


def test_access_expired_and_invalid_claims(factory, client):
    grant = login()
    payload = jwt.decode(grant["data"]["access_token"], options={"verify_signature": False})
    expired = dict(payload, exp=int(datetime.now(timezone.utc).timestamp()) - 1)
    expired["iat"] = expired["exp"] - 1800
    token = jwt.encode(expired, JWT_SECRET, algorithm="HS256")
    r = client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token})
    assert r.json()["error"]["code"] == "TOKEN_EXPIRED"
    for key in ["sid", "sub", "exp", "iat"]:
        broken = dict(payload)
        broken.pop(key)
        token = jwt.encode(broken, JWT_SECRET, algorithm="HS256")
        assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    broken = dict(payload, sub="abc")
    token = jwt.encode(broken, JWT_SECRET, algorithm="HS256")
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    token = jwt.encode(payload, secrets.token_urlsafe(48), algorithm="HS256")
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS384")
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    for changes in [{"aud":"wrong-audience"}, {"iss":"wrong-issuer"}, {"sid":str(uuid4())}, {"typ":"refresh"}]:
        token = jwt.encode(dict(payload, **changes), JWT_SECRET, algorithm="HS256")
        assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    token = jwt.encode(dict(payload, sub="9223372036854775807"), JWT_SECRET, algorithm="HS256")
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401


def test_http_cookie_csrf_and_cors(client):
    path = "/api/v1/auth/login"
    body = {"email": "customer@example.com", "password": PASSWORD}
    assert client.post(path, json=body).status_code == 403
    assert client.post(path, json=body, headers={"Origin": "https://evil.example", "X-EVRide-CSRF": "1"}).status_code == 403
    assert client.post(path, json=body, headers={"Origin": ORIGIN}).status_code == 403
    r = client.post(path, json=body, headers=headers())
    assert r.status_code == 200
    assert "refresh_token" not in r.json()["data"]
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=lax" in cookie
    assert "path=/api/v1/auth" in cookie and "domain=" not in cookie
    assert r.headers["cache-control"] == "no-store"
    selected = r.json()["data"]["session_id"]
    refreshed = client.post("/api/v1/auth/refresh", json={}, headers={**headers(), "X-Session-ID": selected})
    assert refreshed.status_code == 200
    out = client.post("/api/v1/auth/logout", json={}, headers={**headers(), "X-Session-ID": selected})
    assert out.status_code == 200 and "max-age=0" in out.headers["set-cookie"].lower()
    for origin, allowed in [(ORIGIN, True), ("https://evil.example", False)]:
        r = client.options("/api/v1/auth/refresh", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-evride-csrf,x-session-id",
        })
        assert (r.headers.get("access-control-allow-origin") == origin) is allowed
    r = client.post("/api/v1/auth/refresh", json={"refresh_token":"forbidden"}, headers={**headers(), "X-Session-ID": selected})
    assert r.status_code == 422


def test_late_cookie_cannot_overwrite_new_generation(factory, client):
    first = login()
    second = refresh(first)
    third = refresh(second)
    assert len({cookie_name(sid(g), g["data"]["generation"]) for g in [first, second, third]}) == 3
    # Cookie cũ xuất hiện lại cùng cookie mới: chọn gen2, không revoke do gen0.
    fourth = service.refresh_session(sid(first), offered(first) + offered(second) + offered(third))
    assert fourth["data"]["generation"] == 3
    service.logout_session(sid(first), offered(first))
    assert code(lambda: refresh(fourth)) == "SESSION_REVOKED"
    assert get_me(client, fourth).status_code == 401


def test_http_reuse_is_committed_without_set_cookie(factory, client, monkeypatch):
    first = login()
    refresh(first)
    with factory() as db:
        old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
        expired_grace = old.replay_until
    monkeypatch.setattr(service, "now", lambda: expired_grace)
    r = client.post("/api/v1/auth/refresh", json={}, headers=headers(first))
    assert r.status_code == 401 and r.json()["error"]["code"] == "REFRESH_REUSED"
    assert "set-cookie" not in r.headers
    with factory() as db:
        assert db.get(UserSession, sid(first)).revoked_at is not None