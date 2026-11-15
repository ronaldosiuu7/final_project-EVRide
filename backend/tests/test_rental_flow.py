import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

url = make_url(os.environ["TEST_DATABASE_URL"])
if not (url.database or "").endswith("_test"):
    raise RuntimeError("Cần database riêng có hậu tố _test")
os.environ.update({
    "APP_ENV": "test", "JWT_SECRET_KEY": secrets.token_urlsafe(48),
    "REFRESH_REPLAY_KEYS": Fernet.generate_key().decode(),
    "AUTH_ORIGINS": "https://thuexedien.me", "AUTH_COOKIE_SECURE": "true",
    "DB_HOST": url.host or "localhost", "DB_PORT": str(url.port or 5432),
    "DB_NAME": url.database, "DB_USER": url.username or "postgres",
    "DB_PASSWORD": url.password or "",
})

import app.expire_reservations as expire_job
from app.models import (
    Base, Handover, Rental, Station, Transaction, User, UserDocument,
    Vehicle, Wallet, WalletTransaction,
)
from app.services.errors import ServiceError
from app.services.idempotency import begin_idempotent_request, complete_idempotent_request
from app.services.rentals import cancel_rental, create_rental, pickup_rental


@pytest.fixture
def factory(monkeypatch):
    admin = create_engine(url)
    schema = "rental_test_" + uuid4().hex
    with admin.begin() as conn:
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(expire_job, "SessionLocal", factory)
    yield factory
    engine.dispose()
    with admin.begin() as conn:
        conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
    admin.dispose()


def seed(factory, customers=1, balance="150000.00"):
    """Tạo 1 trạm 24/7, 1 xe đủ pin, 1 staff và N khách có CCCD VERIFIED."""
    with factory.begin() as db:
        staff = User(name="Staff", email="staff@test.vn", password="x", role="STAFF", status="ACTIVE")
        station = Station(name="Trạm A", address="HN", latitude=Decimal("21"),
                          longitude=Decimal("105"), capacity=5, status="ACTIVE")
        db.add_all([staff, station])
        db.flush()
        vehicle = Vehicle(current_station_id=station.id, name="Xe 1", model="VF",
                          battery_percent=80, status="AVAILABLE",
                          first_30_minutes_price=Decimal("10000.00"),
                          extra_minute_price=Decimal("350.00"),
                          deposit_amount=Decimal("100000.00"))
        db.add(vehicle)
        ids = []
        for i in range(customers):
            c = User(name=f"C{i}", email=f"c{i}@test.vn", password="x", role="CUSTOMER", status="ACTIVE")
            db.add(c)
            db.flush()
            db.add(Wallet(user_id=c.id, balance=Decimal(balance), status="ACTIVE"))
            db.add(UserDocument(user_id=c.id, document_type="CCCD", document_number=f"0010{i}",
                                verified_status="VERIFIED", verified_by=staff.id,
                                verified_at=datetime.now(timezone.utc),
                                verified_birth_date=date(2000, 1, 1),
                                expires_on=date(2040, 1, 1)))
            ids.append(c.id)
        db.flush()
        return {"staff": staff.id, "station": station.id, "vehicle": vehicle.id, "customers": ids}


def reserve(factory, data, customer_id):
    with factory.begin() as db:
        return create_rental(db, customer_id=customer_id, vehicle_id=data["vehicle"],
                             pickup_station_id=data["station"]).id


def test_reserve_holds_30_minutes(factory):
    data = seed(factory)
    rental_id = reserve(factory, data, data["customers"][0])
    with factory() as db:
        rental = db.get(Rental, rental_id)
        assert rental.status == "RESERVED"
        assert rental.expires_at - rental.created_at == timedelta(minutes=30)
        assert db.get(Vehicle, data["vehicle"]).status == "RESERVED"


def test_two_customers_same_vehicle_only_one_wins(factory):
    data = seed(factory, customers=2)
    gate = Barrier(2)

    def worker(cid):
        gate.wait(timeout=5)
        try:
            return reserve(factory, data, cid)
        except ServiceError as e:
            return e.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, data["customers"]))
    assert sorted(type(r).__name__ for r in results) == ["int", "str"]
    assert "VEHICLE_UNAVAILABLE" in results
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Rental)
                         .where(Rental.status == "RESERVED")) == 1


def test_insufficient_balance_rejected(factory):
    data = seed(factory, balance="109999.00")  # < 100.000 cọc + 10.000 block đầu
    with pytest.raises(ServiceError) as exc:
        reserve(factory, data, data["customers"][0])
    assert exc.value.code == "INSUFFICIENT_BALANCE"


def test_idempotent_retry_returns_same_rental(factory):
    data = seed(factory)
    cid, key = data["customers"][0], "reserve-key-" + uuid4().hex
    payload = {"vehicle_id": str(data["vehicle"]), "pickup_station_id": str(data["station"])}
    with factory.begin() as db:
        record, replay = begin_idempotent_request(
            db, actor_id=cid, method="POST", path="/api/v1/rentals", key=key, payload=payload)
        assert replay is None
        rental = create_rental(db, customer_id=cid, vehicle_id=data["vehicle"],
                               pickup_station_id=data["station"])
        complete_idempotent_request(record, status_code=201,
                                    response_body={"data": {"id": str(rental.id)}})
    with factory.begin() as db:
        _, replay = begin_idempotent_request(
            db, actor_id=cid, method="POST", path="/api/v1/rentals", key=key, payload=payload)
    assert replay == (201, {"data": {"id": str(rental.id)}})
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Rental)) == 1


def test_expired_reservation_releases_vehicle(factory):
    data = seed(factory)
    rental_id = reserve(factory, data, data["customers"][0])
    with factory.begin() as db:
        rental = db.get(Rental, rental_id)
        rental.created_at -= timedelta(minutes=31)
        rental.expires_at -= timedelta(minutes=31)
    assert expire_job.expire_due_reservations() == 1
    with factory() as db:
        assert db.get(Rental, rental_id).status == "EXPIRED"
        assert db.get(Vehicle, data["vehicle"]).status == "AVAILABLE"


def test_cancel_before_expiry_frees_vehicle(factory):
    data = seed(factory)
    cid = data["customers"][0]
    rental_id = reserve(factory, data, cid)
    with factory.begin() as db:
        assert cancel_rental(db, rental_id=rental_id, customer_id=cid).status == "CANCELLED"
    with factory() as db:
        assert db.get(Vehicle, data["vehicle"]).status == "AVAILABLE"


def test_pickup_collects_deposit_once(factory):
    data = seed(factory)
    rental_id = reserve(factory, data, data["customers"][0])
    with factory.begin() as db:
        record, _ = begin_idempotent_request(
            db, actor_id=data["staff"], method="POST",
            path=f"/api/v1/rentals/{rental_id}/pickup", key="pickup-key-" + uuid4().hex,
            payload={"station_id": str(data["station"]), "battery_percent": 80})
        pickup_rental(db, rental_id=rental_id, station_id=data["station"], battery_percent=80,
                      note=None, staff_id=data["staff"], idempotency_record_id=record.id)
    with factory() as db:
        rental = db.get(Rental, rental_id)
        assert rental.status == "IN_RENT" and rental.actual_start_time is not None
        assert rental.deposit_held == Decimal("100000.00")
        wallet = db.scalar(select(Wallet).where(Wallet.user_id == data["customers"][0]))
        assert wallet.balance == Decimal("50000.00")
        assert db.scalar(select(func.count()).select_from(Handover)) == 1
        assert db.scalar(select(func.count()).select_from(Transaction)
                         .where(Transaction.kind == "DEPOSIT")) == 1
        assert db.scalar(select(func.count()).select_from(WalletTransaction)) == 1
        vehicle = db.get(Vehicle, data["vehicle"])
        assert vehicle.status == "RENTED" and vehicle.current_station_id is None
    # Pickup lần 2 (key khác) phải bị từ chối, không thu cọc lần 2
    with pytest.raises(ServiceError) as exc:
        with factory.begin() as db:
            record, _ = begin_idempotent_request(
                db, actor_id=data["staff"], method="POST",
                path=f"/api/v1/rentals/{rental_id}/pickup", key="pickup-key-" + uuid4().hex,
                payload={"station_id": str(data["station"]), "battery_percent": 80})
            pickup_rental(db, rental_id=rental_id, station_id=data["station"], battery_percent=80,
                          note=None, staff_id=data["staff"], idempotency_record_id=record.id)
    assert exc.value.code == "INVALID_RENTAL_STATE"


def test_pickup_after_expiry_rejected(factory):
    data = seed(factory)
    rental_id = reserve(factory, data, data["customers"][0])
    with factory.begin() as db:
        rental = db.get(Rental, rental_id)
        rental.created_at -= timedelta(minutes=31)
        rental.expires_at -= timedelta(minutes=31)
    with pytest.raises(ServiceError) as exc:
        with factory.begin() as db:
            record, _ = begin_idempotent_request(
                db, actor_id=data["staff"], method="POST",
                path=f"/api/v1/rentals/{rental_id}/pickup", key="pickup-key-" + uuid4().hex,
                payload={})
            pickup_rental(db, rental_id=rental_id, station_id=data["station"], battery_percent=80,
                          note=None, staff_id=data["staff"], idempotency_record_id=record.id)
    assert exc.value.code == "RESERVATION_EXPIRED"