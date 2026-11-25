from __future__ import annotations

import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import sessionmaker

TEST_DB_ENV = os.getenv("TEST_DATABASE_URL")
if not TEST_DB_ENV:
    pytest.skip(
        "Cần biến môi trường TEST_DATABASE_URL trỏ tới database *_test",
        allow_module_level=True,
    )

url = make_url(TEST_DB_ENV)
if not (url.database or "").endswith("_test"):
    raise RuntimeError("Cần database riêng có hậu tố _test")

os.environ.update(
    {
        "APP_ENV": "test",
        "JWT_SECRET_KEY": secrets.token_urlsafe(48),
        "REFRESH_REPLAY_KEYS": Fernet.generate_key().decode(),
        "AUTH_ORIGINS": "https://thuexedien.me",
        "AUTH_COOKIE_SECURE": "true",
        "DB_HOST": url.host or "localhost",
        "DB_PORT": str(url.port or 5432),
        "DB_NAME": url.database,
        "DB_USER": url.username or "postgres",
        "DB_PASSWORD": url.password or "",
    }
)

from app.core.dependencies import get_current_user  # noqa: E402
from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    AuditLog,
    Base,
    Rental,
    Station,
    User,
    UserDocument,
    Vehicle,
    Wallet,
    WalletTopupRequest,
    WalletTransaction,
)
from app.services import wallets as wallet_service  # noqa: E402
from app.services.errors import ServiceError  # noqa: E402
from app.services.idempotency import (  # noqa: E402
    begin_idempotent_request,
    complete_idempotent_request,
)
from app.services.rentals import (  # noqa: E402
    create_rental,
    create_return_quote,
    initiate_return,
    pickup_rental,
    settle_return,
)


@pytest.fixture
def pg_env(monkeypatch):
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "true")
    admin = create_engine(url)
    schema = "topup_test_" + uuid4().hex
    with admin.begin() as conn:
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')

    engine = create_engine(
        url,
        connect_args={"options": f"-csearch_path={schema}"},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    current_actor = {"user": None}

    def override_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    def override_user():
        user = current_actor["user"]
        if user is None:
            from fastapi import HTTPException

            raise HTTPException(
                status_code=401,
                detail={"code": "UNAUTHENTICATED", "message": "Thiếu access token."},
            )
        return user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        with TestClient(app, base_url="https://api.thuexedien.me") as client:
            yield factory, client, current_actor
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        with admin.begin() as conn:
            conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        admin.dispose()


def _seed_users_and_wallets(factory, *, balance1="50000.00", balance2="20000.00"):
    with factory.begin() as db:
        c1 = User(
            name="Customer One",
            email="c1@test.vn",
            password="x",
            role="CUSTOMER",
            status="ACTIVE",
        )
        c2 = User(
            name="Customer Two",
            email="c2@test.vn",
            password="x",
            role="CUSTOMER",
            status="ACTIVE",
        )
        staff = User(
            name="Staff One",
            email="staff@test.vn",
            password="x",
            role="STAFF",
            status="ACTIVE",
        )
        manager = User(
            name="Manager One",
            email="manager@test.vn",
            password="x",
            role="MANAGER",
            status="ACTIVE",
        )
        db.add_all([c1, c2, staff, manager])
        db.flush()

        w1 = Wallet(user_id=c1.id, balance=Decimal(balance1), status="ACTIVE")
        w2 = Wallet(user_id=c2.id, balance=Decimal(balance2), status="ACTIVE")
        db.add_all([w1, w2])
        db.flush()

        return {
            "c1": c1,
            "c2": c2,
            "staff": staff,
            "manager": manager,
            "w1": w1,
            "w2": w2,
        }


def _headers(prefix="key"):
    return {"Idempotency-Key": f"{prefix}-{uuid4().hex}"}


def test_create_topup_request_keeps_wallet_unchanged_and_no_topup_tx(pg_env):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory)
    c1, w1 = seeded["c1"], seeded["w1"]

    actor["user"] = c1
    resp = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "150000.00"},
        headers=_headers("create"),
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["status"] == "PENDING"
    assert data["amount"] == "150000.00"
    assert data["payment_mode"] == "DEMO"
    assert data["wallet_id"] == str(w1.id)
    assert data["requested_by"] == str(c1.id)
    assert data["reviewed_by"] is None
    assert data["reviewed_at"] is None
    assert data["rejection_reason"] is None
    assert data["wallet_transaction_id"] is None
    assert "balance_before" not in data
    assert "balance_after" not in data

    # Số dư và sổ giao dịch ví không thay đổi khi mới tạo yêu cầu.
    wallet_resp = client.get("/api/v1/wallets/me")
    assert wallet_resp.status_code == 200
    assert wallet_resp.json()["data"]["balance"] == "50000.00"

    tx_resp = client.get("/api/v1/wallets/me/transactions")
    assert tx_resp.status_code == 200
    assert tx_resp.json()["data"] == []

    # Danh sách yêu cầu nạp của khách hiển thị yêu cầu PENDING và tách khỏi lịch sử ví.
    list_pending = client.get("/api/v1/wallets/me/topups", params={"status": "PENDING"})
    assert list_pending.status_code == 200
    assert list_pending.json()["meta"]["total"] == 1
    assert list_pending.json()["data"][0]["id"] == data["id"]

    list_approved = client.get("/api/v1/wallets/me/topups", params={"status": "APPROVED"})
    assert list_approved.status_code == 200
    assert list_approved.json()["meta"]["total"] == 0

    with factory() as db:
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 0
        audit = db.scalar(
            select(AuditLog).where(
                AuditLog.resource_type == "wallet_topup_requests",
                AuditLog.resource_id == data["id"],
                AuditLog.action == "WALLET_TOPUP_REQUESTED",
            )
        )
        assert audit is not None
        assert audit.actor_id == c1.id


def test_invalid_topup_inputs_and_strict_fields_rejected(pg_env):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory)
    c1, staff = seeded["c1"], seeded["staff"]

    actor["user"] = c1
    bad_payloads = [
        {"amount": "0"},
        {"amount": "0.00"},
        {"amount": "-50000.00"},
        {"amount": "NaN"},
        {"amount": "Infinity"},
        {"amount": "-Infinity"},
        {"amount": "1e4"},
        {"amount": "100.123"},
        {"amount": "10000000000.00"},
        {"amount": ""},
        {"amount": "   "},
        {"amount": 50000},
        {"amount": "50000.00", "status": "APPROVED"},
        {"amount": "50000.00", "reviewed_by": str(staff.id)},
        {"amount": "50000.00", "wallet_transaction_id": "1"},
        {"amount": "50000.00", "wallet_id": str(seeded["w2"].id)},
    ]
    for payload in bad_payloads:
        r = client.post("/api/v1/wallets/me/topups", json=payload, headers=_headers("bad"))
        assert r.status_code == 422, payload
        assert r.json()["error"]["code"] == "VALIDATION_ERROR"

    # Tạo 1 yêu cầu hợp lệ để kiểm tra validate của approve/reject.
    created = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "10000.00"},
        headers=_headers("valid"),
    )
    assert created.status_code == 201
    req_id = created.json()["data"]["id"]

    actor["user"] = staff
    r_approve_extra = client.post(
        f"/api/v1/wallet-topup-requests/{req_id}/approve",
        json={"amount": "999999.00"},
        headers=_headers("app-extra"),
    )
    assert r_approve_extra.status_code == 422

    for bad_reject in ({}, {"reason": ""}, {"reason": "   "}, {"reason": "ok", "status": "REJECTED"}):
        r_reject = client.post(
            f"/api/v1/wallet-topup-requests/{req_id}/reject",
            json=bad_reject,
            headers=_headers("rej-bad"),
        )
        assert r_reject.status_code == 422

    with factory() as db:
        assert db.scalar(select(func.count()).select_from(WalletTopupRequest)) == 1
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 0


def test_customer_isolation_and_rbac(pg_env):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory)
    c1, c2, staff = seeded["c1"], seeded["c2"], seeded["staff"]

    # Unauthenticated bị từ chối 401
    assert client.get("/api/v1/wallets/me/topups").status_code == 401
    assert client.get("/api/v1/wallet-topup-requests").status_code == 401

    actor["user"] = c1
    r1 = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "75000.00"},
        headers=_headers("c1"),
    )
    assert r1.status_code == 201
    req_id = r1.json()["data"]["id"]

    # Chính chủ xem được chi tiết
    assert client.get(f"/api/v1/wallet-topup-requests/{req_id}").status_code == 200

    # Khách không được xem danh sách toàn hệ thống hoặc tự duyệt/từ chối
    assert client.get("/api/v1/wallet-topup-requests").status_code == 403
    assert (
        client.post(
            f"/api/v1/wallet-topup-requests/{req_id}/approve",
            json={},
            headers=_headers("self-app"),
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/wallet-topup-requests/{req_id}/reject",
            json={"reason": "Tự từ chối"},
            headers=_headers("self-rej"),
        ).status_code
        == 403
    )

    # Khách khác không thấy và không rò rỉ thông tin yêu cầu của c1
    actor["user"] = c2
    other_list = client.get("/api/v1/wallets/me/topups")
    assert other_list.status_code == 200
    assert other_list.json()["data"] == []
    other_detail = client.get(f"/api/v1/wallet-topup-requests/{req_id}")
    assert other_detail.status_code == 404

    # STAFF xem được cả danh sách và chi tiết
    actor["user"] = staff
    assert client.get("/api/v1/wallet-topup-requests").status_code == 200
    assert client.get(f"/api/v1/wallet-topup-requests/{req_id}").status_code == 200


def test_staff_and_manager_approve_creates_single_tx_updates_balance_and_audits(pg_env):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="50000.00", balance2="20000.00")
    c1, c2, staff, manager = seeded["c1"], seeded["c2"], seeded["staff"], seeded["manager"]

    actor["user"] = c1
    req1_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "100000.00"},
        headers=_headers("c1"),
    ).json()["data"]["id"]

    actor["user"] = c2
    req2_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "250000.00"},
        headers=_headers("c2"),
    ).json()["data"]["id"]

    # STAFF duyệt req1 (gửi {})
    actor["user"] = staff
    app1 = client.post(
        f"/api/v1/wallet-topup-requests/{req1_id}/approve",
        json={},
        headers=_headers("staff-app"),
    )
    assert app1.status_code == 200
    d1 = app1.json()["data"]
    assert d1["status"] == "APPROVED"
    assert d1["reviewed_by"] == str(staff.id)
    assert d1["reviewed_at"] is not None
    assert d1["rejection_reason"] is None
    assert d1["wallet_transaction_id"] is not None
    assert d1["wallet"]["balance"] == "150000.00"
    assert d1["wallet_transaction"]["type"] == "TOPUP"
    assert d1["wallet_transaction"]["status"] == "SUCCESS"
    assert d1["wallet_transaction"]["amount"] == "100000.00"
    assert d1["wallet_transaction"]["balance_before"] == "50000.00"
    assert d1["wallet_transaction"]["balance_after"] == "150000.00"

    # MANAGER duyệt req2 (không gửi body)
    actor["user"] = manager
    app2 = client.post(
        f"/api/v1/wallet-topup-requests/{req2_id}/approve",
        headers=_headers("mgr-app"),
    )
    assert app2.status_code == 200
    d2 = app2.json()["data"]
    assert d2["status"] == "APPROVED"
    assert d2["reviewed_by"] == str(manager.id)
    assert d2["wallet"]["balance"] == "270000.00"
    assert d2["wallet_transaction"]["balance_before"] == "20000.00"
    assert d2["wallet_transaction"]["balance_after"] == "270000.00"

    # Lọc STAFF/MANAGER theo status và customer_id
    filtered = client.get(
        "/api/v1/wallet-topup-requests",
        params={"status": "APPROVED", "customer_id": str(c1.id)},
    )
    assert filtered.status_code == 200
    assert filtered.json()["meta"]["total"] == 1
    assert filtered.json()["data"][0]["id"] == req1_id

    # Lịch sử ví của c1 có đúng 1 TOPUP SUCCESS
    actor["user"] = c1
    txs = client.get("/api/v1/wallets/me/transactions")
    assert txs.status_code == 200
    assert txs.json()["meta"]["total"] == 1
    assert txs.json()["data"][0]["id"] == d1["wallet_transaction_id"]

    with factory() as db:
        audit = db.scalar(
            select(AuditLog).where(
                AuditLog.resource_type == "wallet_topup_requests",
                AuditLog.resource_id == req1_id,
                AuditLog.action == "WALLET_TOPUP_APPROVED",
            )
        )
        assert audit is not None
        assert audit.actor_id == staff.id
        assert audit.before_data == {"status": "PENDING", "wallet_balance": "50000.00"}
        assert audit.after_data["balance_after"] == "150000.00"


def test_reject_with_reason_allowed_when_wallet_locked_or_demo_off(pg_env, monkeypatch):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="50000.00")
    c1, staff, manager, w1 = seeded["c1"], seeded["staff"], seeded["manager"], seeded["w1"]

    actor["user"] = c1
    req_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "80000.00"},
        headers=_headers("c1"),
    ).json()["data"]["id"]

    # Khóa ví khách và tắt cờ DEMO_PAYMENTS_ENABLED sau khi đã tạo yêu cầu.
    actor["user"] = manager
    assert (
        client.patch(f"/api/v1/wallets/{w1.id}/status", json={"status": "LOCKED"}).status_code
        == 200
    )
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "false")

    # Tra cứu vẫn hoạt động khi tắt DEMO_PAYMENTS_ENABLED
    actor["user"] = c1
    assert client.get("/api/v1/wallets/me/topups").status_code == 200
    assert client.get(f"/api/v1/wallet-topup-requests/{req_id}").status_code == 200

    # Từ chối vẫn hoạt động dù ví bị LOCKED và DEMO_PAYMENTS_ENABLED=false
    actor["user"] = staff
    assert client.get("/api/v1/wallet-topup-requests").status_code == 200
    rej = client.post(
        f"/api/v1/wallet-topup-requests/{req_id}/reject",
        json={"reason": "  Không xác nhận được yêu cầu demo  "},
        headers=_headers("rej"),
    )
    assert rej.status_code == 200
    data = rej.json()["data"]
    assert data["status"] == "REJECTED"
    assert data["reviewed_by"] == str(staff.id)
    assert data["reviewed_at"] is not None
    assert data["rejection_reason"] == "Không xác nhận được yêu cầu demo"
    assert data["wallet_transaction_id"] is None

    with factory() as db:
        wallet = db.get(Wallet, w1.id)
        assert wallet.balance == Decimal("50000.00")
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 0
        audit = db.scalar(
            select(AuditLog).where(
                AuditLog.resource_type == "wallet_topup_requests",
                AuditLog.resource_id == req_id,
                AuditLog.action == "WALLET_TOPUP_REJECTED",
            )
        )
        assert audit is not None
        assert audit.after_data["rejection_reason"] == "Không xác nhận được yêu cầu demo"


def test_processed_request_cannot_transition_again(pg_env):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory)
    c1, staff, manager = seeded["c1"], seeded["staff"], seeded["manager"]

    actor["user"] = c1
    req1_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "100000.00"},
        headers=_headers("c1-a"),
    ).json()["data"]["id"]
    req2_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "100000.00"},
        headers=_headers("c1-b"),
    ).json()["data"]["id"]

    actor["user"] = staff
    assert (
        client.post(
            f"/api/v1/wallet-topup-requests/{req1_id}/approve",
            json={},
            headers=_headers("app1"),
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/wallet-topup-requests/{req2_id}/reject",
            json={"reason": "Từ chối lần đầu"},
            headers=_headers("rej2"),
        ).status_code
        == 200
    )

    actor["user"] = manager
    for path, body in (
        (f"/api/v1/wallet-topup-requests/{req1_id}/approve", {}),
        (f"/api/v1/wallet-topup-requests/{req1_id}/reject", {"reason": "Đổi sang từ chối"}),
        (f"/api/v1/wallet-topup-requests/{req2_id}/approve", {}),
        (f"/api/v1/wallet-topup-requests/{req2_id}/reject", {"reason": "Từ chối lại"}),
    ):
        resp = client.post(path, json=body, headers=_headers("retransition"))
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

    with factory() as db:
        assert db.get(Wallet, seeded["w1"].id).balance == Decimal("150000.00")
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 1


def test_ineligible_wallet_account_demo_flag_and_balance_limit_block_create_or_approve(
    pg_env, monkeypatch
):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="50000.00", balance2="9999999990.00")
    c1, c2, manager, w1 = seeded["c1"], seeded["c2"], seeded["manager"], seeded["w1"]

    # DEMO_PAYMENTS_ENABLED=false chặn tạo yêu cầu
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "false")
    actor["user"] = c1
    r_disabled = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "10000.00"},
        headers=_headers("off"),
    )
    assert r_disabled.status_code == 503
    assert r_disabled.json()["error"]["code"] == "FEATURE_NOT_ENABLED"

    # Ví bị FROZEN chặn tạo yêu cầu
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "true")
    actor["user"] = manager
    assert client.patch(f"/api/v1/wallets/{w1.id}/status", json={"status": "FROZEN"}).status_code == 200
    actor["user"] = c1
    r_frozen_create = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "10000.00"},
        headers=_headers("frozen-create"),
    )
    assert r_frozen_create.status_code == 409
    assert r_frozen_create.json()["error"]["code"] == "WALLET_UNAVAILABLE"

    # Mở lại ví, tạo yêu cầu hợp lệ cho c1 và c2
    actor["user"] = manager
    assert client.patch(f"/api/v1/wallets/{w1.id}/status", json={"status": "ACTIVE"}).status_code == 200
    actor["user"] = c1
    req1_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "10000.00"},
        headers=_headers("ok1"),
    ).json()["data"]["id"]

    actor["user"] = c2
    req2_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "20.00"},
        headers=_headers("ok2"),
    ).json()["data"]["id"]

    # 1. Tắt DEMO_PAYMENTS_ENABLED -> không duyệt được, giữ PENDING
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "false")
    actor["user"] = manager
    r_app_off = client.post(
        f"/api/v1/wallet-topup-requests/{req1_id}/approve",
        json={},
        headers=_headers("app-off"),
    )
    assert r_app_off.status_code == 503
    assert r_app_off.json()["error"]["code"] == "FEATURE_NOT_ENABLED"

    # 2. Khóa ví sau khi tạo -> không duyệt được, giữ PENDING
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "true")
    assert client.patch(f"/api/v1/wallets/{w1.id}/status", json={"status": "LOCKED"}).status_code == 200
    r_app_locked = client.post(
        f"/api/v1/wallet-topup-requests/{req1_id}/approve",
        json={},
        headers=_headers("app-locked"),
    )
    assert r_app_locked.status_code == 409
    assert r_app_locked.json()["error"]["code"] == "WALLET_UNAVAILABLE"

    # 3. Khóa tài khoản khách sau khi tạo -> không duyệt được, giữ PENDING
    assert client.patch(f"/api/v1/wallets/{w1.id}/status", json={"status": "ACTIVE"}).status_code == 200
    with factory.begin() as db:
        db.get(User, c1.id).status = "BLOCKED"
    r_app_blocked = client.post(
        f"/api/v1/wallet-topup-requests/{req1_id}/approve",
        json={},
        headers=_headers("app-blocked"),
    )
    assert r_app_blocked.status_code == 403
    assert r_app_blocked.json()["error"]["code"] == "ACCOUNT_DISABLED"

    # 4. Số dư sau cộng vượt NUMERIC(12,2) -> từ chối, giữ PENDING
    r_app_overflow = client.post(
        f"/api/v1/wallet-topup-requests/{req2_id}/approve",
        json={},
        headers=_headers("app-overflow"),
    )
    assert r_app_overflow.status_code == 409
    assert r_app_overflow.json()["error"]["code"] == "WALLET_LIMIT_EXCEEDED"

    with factory() as db:
        assert db.get(WalletTopupRequest, int(req1_id)).status == "PENDING"
        assert db.get(WalletTopupRequest, int(req2_id)).status == "PENDING"
        assert db.get(Wallet, w1.id).balance == Decimal("50000.00")
        assert db.get(Wallet, seeded["w2"].id).balance == Decimal("9999999990.00")
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 0


def test_idempotency_for_create_approve_and_reject(pg_env):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="50000.00")
    c1, staff = seeded["c1"], seeded["staff"]

    # Thiếu Idempotency-Key -> 400
    actor["user"] = c1
    r_no_key = client.post("/api/v1/wallets/me/topups", json={"amount": "10000.00"})
    assert r_no_key.status_code == 400
    assert r_no_key.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"

    # Create replay & conflict
    create_key = "create-idem-" + uuid4().hex
    r1 = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "100000.00"},
        headers={"Idempotency-Key": create_key},
    )
    assert r1.status_code == 201
    r1_replay = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "100000.00"},
        headers={"Idempotency-Key": create_key},
    )
    assert r1_replay.status_code == 201
    assert r1_replay.json() == r1.json()
    r1_conflict = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "200000.00"},
        headers={"Idempotency-Key": create_key},
    )
    assert r1_conflict.status_code == 409
    assert r1_conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    req1_id = r1.json()["data"]["id"]
    req2_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "50000.00"},
        headers=_headers("c2"),
    ).json()["data"]["id"]

    # Approve replay
    actor["user"] = staff
    assert (
        client.post(f"/api/v1/wallet-topup-requests/{req1_id}/approve", json={}).status_code == 400
    )
    app_key = "approve-idem-" + uuid4().hex
    a1 = client.post(
        f"/api/v1/wallet-topup-requests/{req1_id}/approve",
        json={},
        headers={"Idempotency-Key": app_key},
    )
    assert a1.status_code == 200
    a1_replay = client.post(
        f"/api/v1/wallet-topup-requests/{req1_id}/approve",
        json={},
        headers={"Idempotency-Key": app_key},
    )
    assert a1_replay.status_code == 200
    assert a1_replay.json() == a1.json()

    # Reject replay & conflict
    assert (
        client.post(
            f"/api/v1/wallet-topup-requests/{req2_id}/reject",
            json={"reason": "Lý do 1"},
        ).status_code
        == 400
    )
    rej_key = "reject-idem-" + uuid4().hex
    j1 = client.post(
        f"/api/v1/wallet-topup-requests/{req2_id}/reject",
        json={"reason": "Lý do 1"},
        headers={"Idempotency-Key": rej_key},
    )
    assert j1.status_code == 200
    j1_replay = client.post(
        f"/api/v1/wallet-topup-requests/{req2_id}/reject",
        json={"reason": "Lý do 1"},
        headers={"Idempotency-Key": rej_key},
    )
    assert j1_replay.status_code == 200
    assert j1_replay.json() == j1.json()
    j1_conflict = client.post(
        f"/api/v1/wallet-topup-requests/{req2_id}/reject",
        json={"reason": "Lý do khác"},
        headers={"Idempotency-Key": rej_key},
    )
    assert j1_conflict.status_code == 409
    assert j1_conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    with factory() as db:
        assert db.scalar(select(func.count()).select_from(WalletTopupRequest)) == 2
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 1
        assert db.get(Wallet, seeded["w1"].id).balance == Decimal("150000.00")


def test_concurrent_approvals_only_credit_once(pg_env):
    factory, _, _ = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="50000.00")
    c1, staff, manager, w1 = seeded["c1"], seeded["staff"], seeded["manager"], seeded["w1"]

    with factory.begin() as db:
        req = wallet_service.create_topup_request(
            db, user_id=c1.id, amount=Decimal("100000.00"), idempotency_record_id=None
        )
        req_id = req.id

    gate = Barrier(2)

    def approve_worker(actor_id: int):
        gate.wait(timeout=5)
        try:
            with factory.begin() as db:
                rec, _ = begin_idempotent_request(
                    db,
                    actor_id=actor_id,
                    method="POST",
                    path=f"/api/v1/wallet-topup-requests/{req_id}/approve",
                    key=f"conc-app-{uuid4().hex}",
                    payload={},
                )
                topup_req, tx, wallet = wallet_service.approve_topup_request(
                    db,
                    request_id=req_id,
                    actor_id=actor_id,
                    idempotency_record_id=rec.id,
                )
                complete_idempotent_request(
                    rec,
                    status_code=200,
                    response_body={"data": {"id": str(topup_req.id)}},
                )
                return ("OK", tx.id, str(wallet.balance))
        except ServiceError as exc:
            return ("ERR", exc.code)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(approve_worker, [staff.id, manager.id]))

    statuses = sorted(r[0] for r in results)
    assert statuses == ["ERR", "OK"], results
    assert ("ERR", "INVALID_STATE_TRANSITION") in results

    with factory() as db:
        wallet = db.get(Wallet, w1.id)
        topup_req = db.get(WalletTopupRequest, req_id)
        assert wallet.balance == Decimal("150000.00")
        assert topup_req.status == "APPROVED"
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 1
        assert (
            db.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(
                    AuditLog.resource_type == "wallet_topup_requests",
                    AuditLog.resource_id == str(req_id),
                    AuditLog.action == "WALLET_TOPUP_APPROVED",
                )
            )
            == 1
        )


def test_concurrent_approve_and_reject_mutually_exclusive(pg_env):
    factory, _, _ = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="50000.00")
    c1, staff, manager, w1 = seeded["c1"], seeded["staff"], seeded["manager"], seeded["w1"]

    with factory.begin() as db:
        req = wallet_service.create_topup_request(
            db, user_id=c1.id, amount=Decimal("100000.00"), idempotency_record_id=None
        )
        req_id = req.id

    gate = Barrier(2)

    def worker(mode: str):
        gate.wait(timeout=5)
        try:
            with factory.begin() as db:
                if mode == "approve":
                    wallet_service.approve_topup_request(
                        db,
                        request_id=req_id,
                        actor_id=staff.id,
                        idempotency_record_id=None,
                    )
                    return ("APPROVED", None)
                wallet_service.reject_topup_request(
                    db,
                    request_id=req_id,
                    actor_id=manager.id,
                    reason="Từ chối tranh chấp đồng thời",
                )
                return ("REJECTED", None)
        except ServiceError as exc:
            return ("ERR", exc.code)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, ["approve", "reject"]))

    ok_outcomes = [r[0] for r in results if r[0] != "ERR"]
    err_outcomes = [r for r in results if r[0] == "ERR"]
    assert len(ok_outcomes) == 1, results
    assert err_outcomes == [("ERR", "INVALID_STATE_TRANSITION")], results

    with factory() as db:
        wallet = db.get(Wallet, w1.id)
        topup_req = db.get(WalletTopupRequest, req_id)
        tx_count = db.scalar(select(func.count()).select_from(WalletTransaction))
        if ok_outcomes[0] == "APPROVED":
            assert topup_req.status == "APPROVED"
            assert topup_req.wallet_transaction_id is not None
            assert wallet.balance == Decimal("150000.00")
            assert tx_count == 1
        else:
            assert topup_req.status == "REJECTED"
            assert topup_req.wallet_transaction_id is None
            assert wallet.balance == Decimal("50000.00")
            assert tx_count == 0


def test_rollback_on_failure_mid_approval(pg_env, monkeypatch):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="50000.00")
    c1, staff, w1 = seeded["c1"], seeded["staff"], seeded["w1"]

    actor["user"] = c1
    req_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "100000.00"},
        headers=_headers("rb"),
    ).json()["data"]["id"]

    # Gây lỗi DB đúng lúc ghi AuditLog cuối quá trình duyệt để kiểm tra rollback toàn phần.
    def fail_on_audit(*_args, **_kwargs):
        raise RuntimeError("Simulated mid-approval failure")

    monkeypatch.setattr(wallet_service, "AuditLog", fail_on_audit)

    actor["user"] = staff
    with pytest.raises(RuntimeError, match="Simulated mid-approval failure"):
        client.post(
            f"/api/v1/wallet-topup-requests/{req_id}/approve",
            json={},
            headers=_headers("rb-app"),
        )

    with factory() as db:
        wallet = db.get(Wallet, w1.id)
        topup_req = db.get(WalletTopupRequest, int(req_id))
        assert wallet.balance == Decimal("50000.00")
        assert topup_req.status == "PENDING"
        assert topup_req.reviewed_by is None
        assert topup_req.reviewed_at is None
        assert topup_req.wallet_transaction_id is None
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 0


def test_concurrent_approve_and_rental_pickup_no_lost_update(pg_env):
    factory, _, _ = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="110000.00")
    c1, staff, manager, w1 = seeded["c1"], seeded["staff"], seeded["manager"], seeded["w1"]

    with factory.begin() as db:
        station = Station(
            name="Trạm Test",
            address="HN",
            latitude=Decimal("21"),
            longitude=Decimal("105"),
            capacity=5,
            status="ACTIVE",
        )
        db.add(station)
        db.flush()
        vehicle = Vehicle(
            current_station_id=station.id,
            name="Xe Test",
            model="VF",
            battery_percent=85,
            status="AVAILABLE",
            first_30_minutes_price=Decimal("10000.00"),
            extra_minute_price=Decimal("350.00"),
            deposit_amount=Decimal("100000.00"),
        )
        db.add(vehicle)
        db.add(
            UserDocument(
                user_id=c1.id,
                document_type="CCCD",
                document_number="001200000001",
                verified_status="VERIFIED",
                verified_by=staff.id,
                verified_at=datetime.now(timezone.utc),
                verified_birth_date=date(2000, 1, 1),
                expires_on=date(2040, 1, 1),
            )
        )
        db.flush()
        rental = create_rental(
            db, customer_id=c1.id, vehicle_id=vehicle.id, pickup_station_id=station.id
        )
        req = wallet_service.create_topup_request(
            db, user_id=c1.id, amount=Decimal("50000.00"), idempotency_record_id=None
        )
        rental_id = rental.id
        station_id = station.id
        req_id = req.id

    gate = Barrier(2)

    def run_approve():
        gate.wait(timeout=5)
        with factory.begin() as db:
            rec, _ = begin_idempotent_request(
                db,
                actor_id=manager.id,
                method="POST",
                path=f"/api/v1/wallet-topup-requests/{req_id}/approve",
                key=f"pickup-race-app-{uuid4().hex}",
                payload={},
            )
            _, tx, _ = wallet_service.approve_topup_request(
                db,
                request_id=req_id,
                actor_id=manager.id,
                idempotency_record_id=rec.id,
            )
            complete_idempotent_request(rec, status_code=200, response_body={"ok": True})
            return tx.id

    def run_pickup():
        gate.wait(timeout=5)
        with factory.begin() as db:
            rec, _ = begin_idempotent_request(
                db,
                actor_id=staff.id,
                method="POST",
                path=f"/api/v1/rentals/{rental_id}/pickup",
                key=f"pickup-race-p-{uuid4().hex}",
                payload={},
            )
            r, _, _ = pickup_rental(
                db,
                rental_id=rental_id,
                station_id=station_id,
                battery_percent=85,
                note=None,
                staff_id=staff.id,
                idempotency_record_id=rec.id,
            )
            complete_idempotent_request(rec, status_code=200, response_body={"ok": True})
            return r.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(run_approve)
        f2 = pool.submit(run_pickup)
        assert f1.result(timeout=10) > 0
        assert f2.result(timeout=10) == "IN_RENT"

    with factory() as db:
        wallet = db.get(Wallet, w1.id)
        rental = db.get(Rental, rental_id)
        assert rental.status == "IN_RENT"
        assert rental.deposit_held == Decimal("100000.00")
        assert wallet.balance == Decimal("60000.00")
        txs = db.scalars(
            select(WalletTransaction)
            .where(WalletTransaction.wallet_id == w1.id)
            .order_by(WalletTransaction.id)
        ).all()
        assert len(txs) == 2
        assert {tx.type for tx in txs} == {"TOPUP", "RENTAL_DEPOSIT"}
        # Chuỗi số dư liền mạch, không mất cập nhật
        assert txs[0].balance_before == Decimal("110000.00")
        assert txs[0].balance_after == txs[1].balance_before
        assert txs[1].balance_after == Decimal("60000.00")


def test_historical_topup_readable_and_rental_return_refund_intact(pg_env):
    factory, client, actor = pg_env
    seeded = _seed_users_and_wallets(factory, balance1="80000.00")
    c1, staff, manager, w1 = seeded["c1"], seeded["staff"], seeded["manager"], seeded["w1"]

    # Chèn giao dịch TOPUP SUCCESS lịch sử (không có WalletTopupRequest tương ứng)
    with factory.begin() as db:
        db.add(
            WalletTransaction(
                wallet_id=w1.id,
                amount=Decimal("80000.00"),
                type="TOPUP",
                balance_before=Decimal("0.00"),
                balance_after=Decimal("80000.00"),
                status="SUCCESS",
            )
        )
        station = Station(
            name="Trạm Return",
            address="HN",
            latitude=Decimal("21"),
            longitude=Decimal("105"),
            capacity=5,
            status="ACTIVE",
        )
        db.add(station)
        db.flush()
        vehicle = Vehicle(
            current_station_id=station.id,
            name="Xe Return",
            model="VF",
            battery_percent=90,
            status="AVAILABLE",
            first_30_minutes_price=Decimal("10000.00"),
            extra_minute_price=Decimal("350.00"),
            deposit_amount=Decimal("100000.00"),
        )
        db.add(vehicle)
        db.add(
            UserDocument(
                user_id=c1.id,
                document_type="CCCD",
                document_number="001200000002",
                verified_status="VERIFIED",
                verified_by=staff.id,
                verified_at=datetime.now(timezone.utc),
                verified_birth_date=date(1999, 1, 1),
                expires_on=date(2040, 1, 1),
            )
        )
        db.flush()
        station_id = station.id
        vehicle_id = vehicle.id

    # Lịch sử ví đọc được TOPUP cũ; danh sách request vẫn trống
    actor["user"] = c1
    hist = client.get("/api/v1/wallets/me/transactions")
    assert hist.status_code == 200
    assert hist.json()["meta"]["total"] == 1
    assert hist.json()["data"][0]["type"] == "TOPUP"
    assert client.get("/api/v1/wallets/me/topups").json()["meta"]["total"] == 0

    # Nạp thêm 40000 qua quy trình duyệt để đủ 120000 đặt/nhận/trả/hoàn cọc
    req_id = client.post(
        "/api/v1/wallets/me/topups",
        json={"amount": "40000.00"},
        headers=_headers("topup-flow"),
    ).json()["data"]["id"]
    actor["user"] = manager
    assert (
        client.post(
            f"/api/v1/wallet-topup-requests/{req_id}/approve",
            json={},
            headers=_headers("app-flow"),
        ).status_code
        == 200
    )

    with factory.begin() as db:
        rental = create_rental(
            db, customer_id=c1.id, vehicle_id=vehicle_id, pickup_station_id=station_id
        )
        rec_p, _ = begin_idempotent_request(
            db,
            actor_id=staff.id,
            method="POST",
            path=f"/api/v1/rentals/{rental.id}/pickup",
            key="p-" + uuid4().hex,
            payload={},
        )
        pickup_rental(
            db,
            rental_id=rental.id,
            station_id=station_id,
            battery_percent=90,
            note=None,
            staff_id=staff.id,
            idempotency_record_id=rec_p.id,
        )
        initiate_return(
            db,
            rental_id=rental.id,
            return_station_id=station_id,
            battery_percent=80,
            vehicle_condition="OK",
            note=None,
            staff_id=staff.id,
        )
        _, quote_token = create_return_quote(
            db,
            rental_id=rental.id,
            return_station_id=station_id,
            promotion_code=None,
            actor_id=staff.id,
            is_owner=False,
        )
        rec_r, _ = begin_idempotent_request(
            db,
            actor_id=staff.id,
            method="POST",
            path=f"/api/v1/rentals/{rental.id}/return",
            key="r-" + uuid4().hex,
            payload={},
        )
        settled_rental, _, invoice, _, final_wallet = settle_return(
            db,
            rental_id=rental.id,
            quote_token=quote_token,
            staff_id=staff.id,
            idempotency_record_id=rec_r.id,
        )
        assert settled_rental.status == "COMPLETED"
        assert settled_rental.deposit_held == Decimal("0.00")
        assert invoice.status == "PAID"
        # 120000 - 100000 cọc = 20000; trả xe < 30 phút => phí 10000, hoàn 90000 cọc dư => 110000
        assert final_wallet.balance == Decimal("110000.00")


def test_db_constraints_reject_invalid_wallet_topup_request_states(pg_env):
    factory, _, _ = pg_env
    seeded = _seed_users_and_wallets(factory)
    c1, staff, w1, w2 = seeded["c1"], seeded["staff"], seeded["w1"], seeded["w2"]

    # amount <= 0 / NaN / Infinity / vượt precision Numeric(12,2)
    for bad_sql_amount in ("0.00", "-1.00", "NaN", "Infinity", "10000000000.00"):
        with pytest.raises((IntegrityError, DataError)):
            with factory.begin() as db:
                db.execute(
                    text(
                        "INSERT INTO wallet_topup_requests (wallet_id, requested_by, amount, status) "
                        "VALUES (:wid, :uid, CAST(:amt AS numeric), 'PENDING')"
                    ),
                    {"wid": w1.id, "uid": c1.id, "amt": bad_sql_amount},
                )

    # Self-review bị chặn ở DB
    with pytest.raises(IntegrityError):
        with factory.begin() as db:
            db.execute(
                text(
                    "INSERT INTO wallet_topup_requests "
                    "(wallet_id, requested_by, amount, status, reviewed_by, reviewed_at, rejection_reason) "
                    "VALUES (:wid, :uid, 10000.00, 'REJECTED', :uid, clock_timestamp(), 'self')"
                ),
                {"wid": w1.id, "uid": c1.id},
            )

    # APPROVED thiếu wallet_transaction_id bị chặn ở DB
    with pytest.raises(IntegrityError):
        with factory.begin() as db:
            db.execute(
                text(
                    "INSERT INTO wallet_topup_requests "
                    "(wallet_id, requested_by, amount, status, reviewed_by, reviewed_at) "
                    "VALUES (:wid, :uid, 10000.00, 'APPROVED', :sid, clock_timestamp())"
                ),
                {"wid": w1.id, "uid": c1.id, "sid": staff.id},
            )

    # REJECTED lý do rỗng bị chặn ở DB
    with pytest.raises(IntegrityError):
        with factory.begin() as db:
            db.execute(
                text(
                    "INSERT INTO wallet_topup_requests "
                    "(wallet_id, requested_by, amount, status, reviewed_by, reviewed_at, rejection_reason) "
                    "VALUES (:wid, :uid, 10000.00, 'REJECTED', :sid, clock_timestamp(), '   ')"
                ),
                {"wid": w1.id, "uid": c1.id, "sid": staff.id},
            )

    # Link tới WalletTransaction của ví khác bị FK (wallet_transaction_id, wallet_id) chặn
    with factory.begin() as db:
        tx_other = WalletTransaction(
            wallet_id=w2.id,
            amount=Decimal("10000.00"),
            type="TOPUP",
            balance_before=Decimal("20000.00"),
            balance_after=Decimal("30000.00"),
            status="SUCCESS",
        )
        db.add(tx_other)
        db.flush()
        tx_other_id = tx_other.id

    with pytest.raises(IntegrityError):
        with factory.begin() as db:
            db.execute(
                text(
                    "INSERT INTO wallet_topup_requests "
                    "(wallet_id, requested_by, amount, status, reviewed_by, reviewed_at, wallet_transaction_id) "
                    "VALUES (:wid, :uid, 10000.00, 'APPROVED', :sid, clock_timestamp(), :txid)"
                ),
                {"wid": w1.id, "uid": c1.id, "sid": staff.id, "txid": tx_other_id},
            )
