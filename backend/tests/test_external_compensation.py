from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.v1 import operations as ops_api
from app.core.dependencies import get_current_user
from app.database import get_db
from app.main import app
from app.models import (
    AuditLog,
    Invoice,
    RentalIncident,
    RentalPricingSnapshot,
    Transaction,
    WalletTransaction,
)
from app.schemas.incident_finance import (
    ExpectedAmountAction,
    ExternalCompensationSettlement,
    FinancialEvidence,
    IncidentRentSettlement,
)
from app.services import incident_completion as completion
from app.services import incident_finance as service
from app.services import incident_rent_settlement as rent_settlement
from app.services import rentals as rental_service
from app.services.errors import ServiceError


class FakeDB:
    def __init__(self, now, *, has_ledger=False):
        self.now = now
        self.has_ledger = has_ledger
        self.added = []
        self.flushed = False

    def scalar(self, stmt):
        stmt_text = str(stmt)
        if "clock_timestamp" in stmt_text:
            return self.now
        if "transactions" in stmt_text:
            return 99 if self.has_ledger else None
        return None

    def add(self, obj):
        if isinstance(obj, AuditLog) and getattr(obj, "id", None) is None:
            obj.id = len(self.added) + 1
        self.added.append(obj)

    def flush(self):
        self.flushed = True


def _make_context(now):
    start = now - timedelta(hours=5)
    ticket_created = now - timedelta(minutes=10)
    verified_at = now - timedelta(hours=1)

    rental = SimpleNamespace(
        id=10,
        customer_id=20,
        status="STOLEN",
        actual_start_time=start,
        deposit_held=Decimal("1000000.00"),
        total_price=Decimal("50000.00"),
    )
    incident = RentalIncident(
        id=1,
        rental_id=10,
        status="CONFIRMED",
        verified_outcome="LOSS_THEFT",
        verified_by=2,
        verified_at=verified_at,
        agreement_status="PENDING",
    )
    ticket = SimpleNamespace(
        id=30,
        rental_id=10,
        report_source="STAFF",
        created_by=2,
        received_at=ticket_created,
        check_cycle=None,
        title="Biên bản thỏa thuận",
        description="Đã ký biên bản bồi thường ngoài hệ thống",
    )
    return {
        "rental": rental,
        "incident": incident,
        "wallet": None,
        "ticket": ticket,
    }


def test_external_compensation_settlement_schema_validation():
    now = datetime.now(timezone.utc)

    # 0 -> NOT_REQUIRED, không nhập thông tin thanh toán giả
    ok_zero = ExternalCompensationSettlement(
        evidence_ticket_id="30",
        reason="Không phát sinh bồi thường",
        amount="0.00",
        agreement_status="NOT_REQUIRED",
    )
    assert ok_zero.amount == Decimal("0.00")

    # > 0 -> AGREED / AUTHORITY_DECISION + đủ thông tin thanh toán ngoài
    ok_pos = ExternalCompensationSettlement(
        evidence_ticket_id="30",
        reason="Khách đã chuyển khoản ngoài hệ thống",
        amount="5000000.00",
        agreement_status="AGREED",
        payment_method="BANK_TRANSFER",
        payment_reference="VCB-123456",
        paid_at=now,
    )
    assert ok_pos.payment_reference == "VCB-123456"

    # 0 không dùng AGREED
    with pytest.raises(ValidationError):
        ExternalCompensationSettlement(
            evidence_ticket_id="30",
            reason="Sai trạng thái với số tiền 0",
            amount="0.00",
            agreement_status="AGREED",
        )

    # 0 không cho phép nhập payment_method/payment_reference/paid_at giả
    with pytest.raises(ValidationError):
        ExternalCompensationSettlement(
            evidence_ticket_id="30",
            reason="Nhập thanh toán giả cho 0đ",
            amount="0.00",
            agreement_status="NOT_REQUIRED",
            payment_method="CASH",
            payment_reference="FAKE",
            paid_at=now,
        )

    # > 0 không dùng NOT_REQUIRED
    with pytest.raises(ValidationError):
        ExternalCompensationSettlement(
            evidence_ticket_id="30",
            reason="Sai trạng thái với số tiền dương",
            amount="100000.00",
            agreement_status="NOT_REQUIRED",
            payment_method="CASH",
            payment_reference="PT-01",
            paid_at=now,
        )

    # > 0 thiếu mã tham chiếu
    with pytest.raises(ValidationError):
        ExternalCompensationSettlement(
            evidence_ticket_id="30",
            reason="Thiếu mã tham chiếu",
            amount="5000000.00",
            agreement_status="AUTHORITY_DECISION",
            payment_method="BANK_TRANSFER",
            paid_at=now,
        )


def test_single_external_compensation_settlement_rules():
    now = datetime.now(timezone.utc)
    db = FakeDB(now)
    context = _make_context(now)
    manager = SimpleNamespace(id=2, role="MANAGER")
    staff = SimpleNamespace(id=3, role="STAFF")

    body = ExternalCompensationSettlement(
        evidence_ticket_id="30",
        reason="Đã nhận chuyển khoản bồi thường 5tr ngoài hệ thống",
        amount="5000000.00",
        agreement_status="AGREED",
        payment_method="BANK_TRANSFER",
        payment_reference="VCB-999",
        paid_at=now,
    )

    with pytest.raises(ServiceError) as exc:
        service.settle_external_compensation(db, context, staff, body)
    assert exc.value.code == "MANAGER_REQUIRED"

    res = service.settle_external_compensation(db, context, manager, body)
    incident = context["incident"]
    rental = context["rental"]

    assert incident.compensation_assessed_amount == Decimal("5000000.00")
    assert incident.agreement_status == "AGREED"
    assert incident.compensation_basis == "Đã nhận chuyển khoản bồi thường 5tr ngoài hệ thống"
    assert incident.compensation_approved_by == 2
    assert incident.compensation_approved_at == now
    assert incident.compensation_ticket_id == 30
    assert incident.compensation_settled_at == now
    assert rental.deposit_held == Decimal("1000000.00")
    assert rental.total_price == Decimal("50000.00")
    assert res["incident"]["compensation_assessed_amount"] == "5000000.00"
    assert len(db.added) == 1
    assert db.added[0].action == "RENTAL_INCIDENT_EXTERNAL_COMPENSATION_SETTLED"
    assert db.added[0].after_data["payment_reference"] == "VCB-999"

    # Không cho sửa âm thầm kết quả đã chốt
    with pytest.raises(ServiceError) as exc_repeat:
        service.settle_external_compensation(
            db,
            context,
            manager,
            ExternalCompensationSettlement(
                evidence_ticket_id="30",
                reason="Thử sửa kết quả đã chốt",
                amount="100000.00",
                agreement_status="AGREED",
                payment_method="CASH",
                payment_reference="PT-02",
                paid_at=now,
            ),
        )
    assert exc_repeat.value.code == "COMPENSATION_ALREADY_SETTLED"


def test_simplified_routes_registered():
    paths = set(app.openapi()["paths"].keys())

    for expected in (
        "/api/v1/rental-check-ins",
        "/api/v1/rental-check-ins/{rental_id}",
        "/api/v1/rentals/{rental_id}/incident/intake",
        "/api/v1/rental-incidents",
        "/api/v1/rental-incidents/{incident_id}",
        "/api/v1/rental-incidents/{incident_id}/events",
        "/api/v1/rental-incidents/{incident_id}/verify",
        "/api/v1/rental-incidents/{incident_id}/evidence-tickets",
        "/api/v1/rental-incidents/{incident_id}/recovery",
        "/api/v1/rental-incidents/{incident_id}/arrival",
        "/api/v1/rental-incidents/{incident_id}/release-vehicle",
        "/api/v1/rental-incidents/{incident_id}/rent-preview",
        "/api/v1/rental-incidents/{incident_id}/settle-rent",
        "/api/v1/rental-incidents/{incident_id}/compensation/external-settlement",
        "/api/v1/rental-incidents/{incident_id}/finance-summary",
        "/api/v1/rental-incidents/{incident_id}/deposit/refund",
        "/api/v1/rental-incidents/{incident_id}/close",
        "/api/v1/maintenance-orders",
    ):
        assert expected in paths

    for removed in (
        "/api/v1/rental-alerts",
        "/api/v1/rental-alerts/{ticket_id}",
        "/api/v1/rental-alerts/{ticket_id}/assign",
        "/api/v1/rental-alerts/{ticket_id}/contacts",
        "/api/v1/rental-alerts/{ticket_id}/resolve",
        "/api/v1/rental-incidents/{incident_id}/assign",
        "/api/v1/rental-incidents/{incident_id}/inspection",
        "/api/v1/rental-incidents/{incident_id}/maintenance-orders",
        "/api/v1/rental-incidents/{incident_id}/values/{kind}",
        "/api/v1/rental-incidents/{incident_id}/compensation/proposals",
        "/api/v1/rental-incidents/{incident_id}/compensation/dispute",
        "/api/v1/rental-incidents/{incident_id}/compensation/approve",
        "/api/v1/rental-incidents/{incident_id}/compensation/settle",
        "/api/v1/rental-incidents/{incident_id}/compensation/review-status",
        "/api/v1/rental-incidents/{incident_id}/compensation/external-result",
        "/api/v1/rental-incidents/{incident_id}/recovery-finance/apply",
        "/api/v1/rental-incidents/{incident_id}/compensation/refund",
    ):
        assert removed not in paths


class CompletionFakeDB:
    def __init__(self, now, *, transactions=None, wallet_transactions=None, invoice=None):
        self.now = now
        self.transactions = list(transactions or [])
        self.wallet_transactions = list(wallet_transactions or [])
        self.invoice = invoice
        self.audit_logs = []
        self._next_tx_id = 1000
        self._next_wt_id = 2000
        self._next_audit_id = 3000

    def scalar(self, stmt):
        text = str(stmt)
        if "clock_timestamp" in text:
            return self.now
        if "FROM transactions" in text:
            for tx in self.transactions:
                if tx.obligation_type == "COMPENSATION" and tx.status == "SUCCESS":
                    return tx.id
            return None
        if "FROM invoices" in text:
            return self.invoice
        if "FROM audit_logs" in text:
            return None
        return None

    def scalars(self, stmt):
        text = str(stmt)
        if "FROM transactions" in text:
            rows = self.transactions
        elif "FROM wallet_transactions" in text:
            rows = self.wallet_transactions
        else:
            rows = []

        class _Result:
            def __init__(self, items):
                self._items = items

            def all(self):
                return list(self._items)

        return _Result(rows)

    def add(self, obj):
        if isinstance(obj, Transaction):
            if getattr(obj, "id", None) is None:
                obj.id = self._next_tx_id
                self._next_tx_id += 1
            self.transactions.append(obj)
        elif isinstance(obj, WalletTransaction):
            if getattr(obj, "id", None) is None:
                obj.id = self._next_wt_id
                self._next_wt_id += 1
            self.wallet_transactions.append(obj)
        elif isinstance(obj, AuditLog):
            if getattr(obj, "id", None) is None:
                obj.id = self._next_audit_id
                self._next_audit_id += 1
            self.audit_logs.append(obj)

    def flush(self):
        pass


def _make_completion_context(now, *, deposit_held="70000.00", rent_settled=True):
    start = now - timedelta(hours=5)
    verified_at = now - timedelta(hours=2)
    rent_settled_at = now - timedelta(hours=1) if rent_settled else None

    rental = SimpleNamespace(
        id=10,
        customer_id=20,
        status="STOLEN",
        actual_start_time=start,
        deposit_held=Decimal(deposit_held),
        total_price=Decimal("30000.00") if rent_settled else None,
    )
    vehicle = SimpleNamespace(id=50, status="STOLEN")
    incident = RentalIncident(
        id=1,
        rental_id=10,
        status="CONFIRMED",
        verified_outcome="LOSS_THEFT",
        verified_by=2,
        verified_at=verified_at,
        rent_settled_at=rent_settled_at,
        agreement_status="PENDING",
    )
    wallet = SimpleNamespace(
        id=5,
        user_id=20,
        status="ACTIVE",
        balance=Decimal("100000.00"),
        updated_at=now,
    )
    ticket = SimpleNamespace(
        id=30,
        rental_id=10,
        report_source="STAFF",
        created_by=2,
        received_at=now - timedelta(minutes=5),
        check_cycle=None,
        title="Ticket kiểm chứng",
        description="Bằng chứng",
    )
    deposit_tx = Transaction(
        id=101,
        rental_id=10,
        actor_id=20,
        amount=Decimal("100000.00"),
        kind="DEPOSIT",
        status="SUCCESS",
    )
    deposit_wt = WalletTransaction(
        id=201,
        wallet_id=5,
        rental_id=10,
        transaction_id=101,
        amount=Decimal("100000.00"),
        type="RENTAL_DEPOSIT",
        balance_before=Decimal("200000.00"),
        balance_after=Decimal("100000.00"),
        status="SUCCESS",
    )
    txs = [deposit_tx]
    wts = [deposit_wt]
    invoice = None
    if rent_settled:
        invoice = Invoice(
            id=11,
            rental_id=10,
            total_amount=Decimal("30000.00"),
            status="PAID",
        )
        rent_tx = Transaction(
            id=102,
            rental_id=10,
            incident_id=1,
            invoice_id=11,
            actor_id=2,
            amount=Decimal("30000.00"),
            kind="PAYMENT",
            status="SUCCESS",
            obligation_type="RENTAL_FEE",
            funding_source="DEPOSIT",
            source_transaction_id=101,
            business_operation_key="RENT_SETTLEMENT",
            posting_key="DEPOSIT:101",
            decision_ticket_id=30,
        )
        txs.append(rent_tx)

    db = CompletionFakeDB(
        now,
        transactions=txs,
        wallet_transactions=wts,
        invoice=invoice,
    )
    context = {
        "rental": rental,
        "vehicle": vehicle,
        "incident": incident,
        "wallet": wallet,
        "ticket": ticket,
    }
    return db, context


def test_external_completion_deposit_refund_close_and_retry(monkeypatch):
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "true")
    now = datetime.now(timezone.utc)
    db, context = _make_completion_context(now)
    manager = SimpleNamespace(id=2, role="MANAGER")
    incident = context["incident"]
    rental = context["rental"]
    wallet = context["wallet"]
    vehicle = context["vehicle"]

    # 1. Chưa có kết quả bồi thường: không được đóng hồ sơ (không coi None là 0)
    with pytest.raises(ServiceError) as exc_close:
        completion.close_incident(
            db,
            context,
            manager,
            FinancialEvidence(evidence_ticket_id="30", reason="Đóng sớm"),
            None,
        )
    assert exc_close.value.code == "COMPENSATION_NOT_APPROVED"

    # 2. Cấn cọc chỉ cho thuê; hoàn phần cọc dư ngay sau rent_settled_at
    res_refund = completion.refund_deposit(
        db,
        context,
        manager,
        ExpectedAmountAction(
            evidence_ticket_id="30",
            reason="Hoàn cọc dư sau quyết toán thuê",
            expected_amount="70000.00",
        ),
        None,
    )
    assert rental.deposit_held == Decimal("0.00")
    assert wallet.balance == Decimal("170000.00")
    assert res_refund["compensation_mode"] == "EXTERNAL"

    # Retry refund_deposit không hoàn trùng
    res_refund_retry = completion.refund_deposit(
        db,
        context,
        manager,
        ExpectedAmountAction(
            evidence_ticket_id="30",
            reason="Retry hoàn cọc",
            expected_amount="0.00",
        ),
        None,
    )
    assert res_refund_retry["nothing_to_refund"] is True
    assert wallet.balance == Decimal("170000.00")

    # 3. Chốt kết quả & thanh toán ngoài hệ thống trong 1 bước (không đổi ví/cọc) -> đóng hồ sơ
    service.settle_external_compensation(
        db,
        context,
        manager,
        ExternalCompensationSettlement(
            evidence_ticket_id="30",
            reason="Khách đã chuyển khoản ngoài 2tr",
            amount="2000000.00",
            agreement_status="AGREED",
            payment_method="BANK_TRANSFER",
            payment_reference="VCB-777",
            paid_at=now,
        ),
    )
    assert wallet.balance == Decimal("170000.00")
    assert rental.deposit_held == Decimal("0.00")

    res_close = completion.close_incident(
        db,
        context,
        manager,
        FinancialEvidence(evidence_ticket_id="30", reason="Hoàn tất hồ sơ"),
        None,
    )
    assert incident.status == "CLOSED"
    assert rental.status == "CLOSED_INCIDENT"
    assert vehicle.status == "STOLEN"
    assert res_close["incident_status"] == "CLOSED"

    res_close_retry = completion.close_incident(
        db,
        context,
        manager,
        FinancialEvidence(evidence_ticket_id="30", reason="Retry đóng"),
        None,
    )
    assert res_close_retry["already_closed"] is True


def test_abandonment_rent_settlement_external_zero_and_close(monkeypatch):
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "true")
    now = datetime.now(timezone.utc)
    db, context = _make_completion_context(
        now, deposit_held="100000.00", rent_settled=False
    )
    manager = SimpleNamespace(id=2, role="MANAGER")
    rental = context["rental"]
    incident = context["incident"]
    vehicle = context["vehicle"]
    wallet = context["wallet"]

    rental.status = "INCIDENT_PENDING"
    vehicle.status = "MAINTENANCE"
    incident.verified_outcome = "ABANDONMENT"
    incident.recovered_at = now - timedelta(minutes=30)
    incident.billing_cutoff_at = incident.recovered_at
    incident.billing_cutoff_reason = "RECOVERY"

    snapshot = RentalPricingSnapshot(
        rental_id=10,
        vehicle_name="Xe 1",
        vehicle_model_snapshot="VF",
        first_30_minutes_price_snapshot=Decimal("10000.00"),
        extra_minute_price_snapshot=Decimal("500.00"),
        pricing_policy_version=rental_service.PRICING_POLICY_VERSION,
        billing_unit=rental_service.BILLING_UNIT,
        pricing_policy_snapshot={
            "first_block_seconds": 1800,
            "extra_minute_rounding": "CEIL",
            "currency": "VND",
        },
        deposit_amount_snapshot=Decimal("100000.00"),
    )

    orig_scalar = db.scalar

    def scalar_for_rent(stmt):
        text = str(stmt)
        if "FROM rental_pricing_snapshots" in text:
            return snapshot
        if "FROM invoices" in text:
            return db.invoice
        if "FROM wallet_transactions" in text:
            return db.wallet_transactions[0]
        return orig_scalar(stmt)

    db.scalar = scalar_for_rent

    def add_with_invoice(obj):
        if isinstance(obj, Invoice):
            obj.id = 11
            db.invoice = obj
            return
        CompletionFakeDB.add(db, obj)

    db.add = add_with_invoice

    preview = service.rent_preview(db, context)
    assert preview["status"] == "UNSETTLED"
    expected_rent = preview["rent_amount"]

    settled = rent_settlement.settle_rent(
        db,
        context,
        manager,
        IncidentRentSettlement(
            evidence_ticket_id="30",
            reason="Quyết toán tiền thuê bỏ xe",
            expected_rent_amount=expected_rent,
        ),
        None,
    )
    assert incident.rent_settled_at == now
    assert rental.total_price == Decimal(expected_rent)
    assert Decimal(settled["deposit_remaining_held"]) == rental.deposit_held

    with pytest.raises(ServiceError) as exc_rent:
        rent_settlement.settle_rent(
            db,
            context,
            manager,
            IncidentRentSettlement(
                evidence_ticket_id="30",
                reason="Retry quyết toán thuê",
                expected_rent_amount=expected_rent,
            ),
            None,
        )
    assert exc_rent.value.code == "RENT_ALREADY_SETTLED"

    deposit_left = rental.deposit_held
    wallet_before = wallet.balance
    completion.refund_deposit(
        db,
        context,
        manager,
        ExpectedAmountAction(
            evidence_ticket_id="30",
            reason="Hoàn cọc dư bỏ xe",
            expected_amount=format(deposit_left, ".2f"),
        ),
        None,
    )
    assert rental.deposit_held == Decimal("0.00")
    assert wallet.balance == wallet_before + deposit_left

    service.settle_external_compensation(
        db,
        context,
        manager,
        ExternalCompensationSettlement(
            evidence_ticket_id="30",
            reason="Bỏ xe nguyên vẹn, không bồi thường",
            amount="0.00",
            agreement_status="NOT_REQUIRED",
        ),
    )
    completion.close_incident(
        db,
        context,
        manager,
        FinancialEvidence(evidence_ticket_id="30", reason="Đóng hồ sơ bỏ xe"),
        None,
    )
    assert incident.status == "CLOSED"
    assert rental.status == "CLOSED_INCIDENT"
    assert vehicle.status == "MAINTENANCE"


def test_http_routes_rbac_idempotency_and_removed_endpoints(monkeypatch):
    now = datetime.now(timezone.utc)
    db, context = _make_completion_context(now)
    current_actor = {"user": SimpleNamespace(id=2, role="MANAGER")}
    idempotency_store = {}
    calls = {"settle": 0}

    class HttpFakeDB(CompletionFakeDB):
        def commit(self):
            pass

        def rollback(self):
            pass

    http_db = HttpFakeDB(
        now,
        transactions=db.transactions,
        wallet_transactions=db.wallet_transactions,
        invoice=db.invoice,
    )
    orig_scalar = http_db.scalar

    def http_scalar(stmt):
        text = str(stmt)
        if "FROM rentals" in text and "rental_incidents" in text:
            return context["rental"].customer_id
        return orig_scalar(stmt)

    http_db.scalar = http_scalar

    def fake_begin(session, *, actor_id, method, path, key, payload):
        if key is None or not 16 <= len(key) <= 128:
            raise ServiceError(400, "IDEMPOTENCY_KEY_REQUIRED", "Missing key")
        cache_key = (actor_id, method, path, key)
        if cache_key in idempotency_store:
            return idempotency_store[cache_key], (
                idempotency_store[cache_key].response_status,
                idempotency_store[cache_key].response_body,
            )
        rec = SimpleNamespace(response_status=None, response_body=None)
        idempotency_store[cache_key] = rec
        return rec, None

    def fake_complete(record, *, status_code, response_body):
        record.response_status = status_code
        record.response_body = response_body

    monkeypatch.setattr(ops_api, "begin_idempotent_request", fake_begin)
    monkeypatch.setattr(ops_api, "complete_idempotent_request", fake_complete)
    monkeypatch.setattr(service, "lock_context", lambda *_a, **_kw: context)

    orig_settle = service.settle_external_compensation

    def wrapped_settle(*args, **kwargs):
        calls["settle"] += 1
        return orig_settle(*args, **kwargs)

    monkeypatch.setattr(service, "settle_external_compensation", wrapped_settle)

    app.dependency_overrides[get_db] = lambda: http_db
    app.dependency_overrides[get_current_user] = lambda: current_actor["user"]

    try:
        client = TestClient(app)
        headers = {"Idempotency-Key": "test-idempotency-key-123456"}
        payload = {
            "evidence_ticket_id": "30",
            "reason": "Thỏa thuận ngoài hệ thống",
            "amount": "1500000.00",
            "agreement_status": "AGREED",
            "payment_method": "BANK_TRANSFER",
            "payment_reference": "VCB-20261113",
            "paid_at": now.isoformat(),
        }

        current_actor["user"] = SimpleNamespace(id=3, role="STAFF")
        r_staff = client.post(
            "/api/v1/rental-incidents/1/compensation/external-settlement",
            json=payload,
            headers=headers,
        )
        assert r_staff.status_code == 403

        current_actor["user"] = SimpleNamespace(id=2, role="MANAGER")
        r1 = client.post(
            "/api/v1/rental-incidents/1/compensation/external-settlement",
            json=payload,
            headers=headers,
        )
        assert r1.status_code == 200
        assert r1.json()["data"]["incident"]["compensation_assessed_amount"] == "1500000.00"
        assert calls["settle"] == 1

        r2 = client.post(
            "/api/v1/rental-incidents/1/compensation/external-settlement",
            json=payload,
            headers=headers,
        )
        assert r2.status_code == 200
        assert r2.json() == r1.json()
        assert calls["settle"] == 1

        current_actor["user"] = SimpleNamespace(id=999, role="CUSTOMER")
        r_other = client.get("/api/v1/rental-incidents/1/finance-summary")
        assert r_other.status_code == 404

        current_actor["user"] = SimpleNamespace(id=20, role="CUSTOMER")
        r_owner = client.get("/api/v1/rental-incidents/1/finance-summary")
        assert r_owner.status_code == 200
        assert r_owner.json()["data"]["compensation_mode"] == "EXTERNAL"

        current_actor["user"] = SimpleNamespace(id=2, role="MANAGER")
        for removed_path in (
            "/api/v1/rental-incidents/1/assign",
            "/api/v1/rental-incidents/1/inspection",
            "/api/v1/rental-incidents/1/maintenance-orders",
            "/api/v1/rental-incidents/1/values/vehicle",
            "/api/v1/rental-incidents/1/compensation/proposals",
            "/api/v1/rental-incidents/1/compensation/dispute",
            "/api/v1/rental-incidents/1/compensation/approve",
            "/api/v1/rental-incidents/1/compensation/settle",
            "/api/v1/rental-incidents/1/compensation/review-status",
            "/api/v1/rental-incidents/1/compensation/external-result",
            "/api/v1/rental-incidents/1/recovery-finance/apply",
            "/api/v1/rental-incidents/1/compensation/refund",
        ):
            r_gone = client.post(removed_path, json={}, headers=headers)
            assert r_gone.status_code in {404, 405}
    finally:
        app.dependency_overrides.clear()
