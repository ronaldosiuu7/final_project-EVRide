"""Seed the local PostgreSQL database with fictional EVRide demo records."""

from __future__ import annotations

import argparse
import hashlib
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.database import database_url, engine
from app.demo_fixtures import (
    ACTIVE_RENTALS,
    DEPOSIT_AMOUNT,
    DEMO_PASSWORD,
    DOCUMENTS,
    EXTRA_MINUTE_PRICE,
    FIRST_30_MINUTES_PRICE,
    HISTORICAL_RENTALS,
    MAINTENANCE_ORDERS,
    PROMOTION_CLAIMS,
    PROMOTIONS,
    STATIONS,
    USERS,
    VEHICLES,
    VEHICLE_MOVE_AUDITS,
    WALLETS,
)
from app.models import (
    Base,
    Handover,
    Invoice,
    MaintenanceOrder,
    Promotion,
    Rental,
    RentalPricingSnapshot,
    Station,
    User,
    UserDocument,
    UserPromotion,
    Vehicle,
    VehicleMoveAudit,
    VehiclePricingHistory,
    Wallet,
)

EXPECTED_HEAD = "888ad91e139e"
UTC = timezone.utc


def _timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError(f"Fixture timestamp must include a timezone: {value}")
    return parsed.astimezone(UTC)


def _password_hash(email: str) -> str:
    salt = hashlib.sha256(f"evride-demo:{email}".encode("utf-8")).digest()[:16]
    digest = hashlib.pbkdf2_hmac(
        "sha256", DEMO_PASSWORD.encode("utf-8"), salt, 600_000
    )
    return f"pbkdf2_sha256$600000${salt.hex()}${digest.hex()}"


def _put_by_id(
    session: Session,
    model: type[Any],
    identifier: int,
    values: dict[str, Any],
    identity_fields: dict[str, Any],
) -> Any:
    row = session.get(model, identifier)
    if row is None:
        row = model(id=identifier, **values)
        session.add(row)
        return row

    for field, expected in identity_fields.items():
        if getattr(row, field) != expected:
            raise RuntimeError(
                f"Demo seed ID collision in {model.__tablename__}.id={identifier}; "
                f"expected {field}={expected!r}."
            )
    for field, value in values.items():
        setattr(row, field, value)
    return row


def _upsert_by(
    session: Session,
    model: type[Any],
    lookup: dict[str, Any],
    values: dict[str, Any],
) -> Any:
    row = session.scalar(
        select(model).filter_by(**lookup).with_for_update()
    )
    if row is None:
        row = model(**lookup, **values)
        session.add(row)
        return row
    for field, value in values.items():
        setattr(row, field, value)
    return row


def _verify_database_target(allow_demo_seed: bool) -> None:
    if not allow_demo_seed:
        raise RuntimeError(
            "Refusing to seed without --allow-demo-seed. This command writes "
            "fictional accounts and demo records."
        )
    if database_url.host not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError(
            "Demo seeding is restricted to a loopback PostgreSQL host; "
            f"configured host is {database_url.host!r}."
        )

    config = Config("alembic.ini")
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    if heads != [EXPECTED_HEAD]:
        raise RuntimeError(
            f"Seed script expects the single Alembic head {EXPECTED_HEAD}; "
            f"found {heads!r}."
        )

    with engine.connect() as connection:
        if "alembic_version" not in set(
            connection.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = current_schema()"
                )
            ).scalars()
        ):
            raise RuntimeError("Database is not migrated; run alembic upgrade head.")
        current = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalars().all()
    if current != [EXPECTED_HEAD]:
        raise RuntimeError(
            f"Database revision must be {EXPECTED_HEAD}; found {current!r}. "
            "Run alembic upgrade head before seeding."
        )

    missing_tables = set(Base.metadata.tables) - set(inspect(engine).get_table_names())
    if missing_tables:
        raise RuntimeError(
            "Database is missing model tables: " + ", ".join(sorted(missing_tables))
        )


def _seed_users(session: Session) -> dict[str, int]:
    user_ids: dict[str, int] = {}
    for fixture in USERS:
        values = {
            "name": fixture["name"],
            "email": fixture["email"],
            "password": _password_hash(fixture["email"]),
            "role": fixture["role"],
            "status": fixture["status"],
        }
        row = _put_by_id(
            session,
            User,
            fixture["id"],
            values,
            {"email": fixture["email"]},
        )
        user_ids[fixture["key"]] = row.id
    session.flush()
    return user_ids


def _seed_stations(session: Session) -> dict[str, int]:
    result: dict[str, int] = {}
    for fixture in STATIONS:
        values = {
            "name": fixture["name"],
            "address": fixture["address"],
            "latitude": Decimal(fixture["latitude"]),
            "longitude": Decimal(fixture["longitude"]),
            "capacity": fixture["capacity"],
            "opens_at": None,
            "closes_at": None,
            "status": "ACTIVE",
        }
        row = _put_by_id(
            session,
            Station,
            fixture["id"],
            values,
            {"name": fixture["name"]},
        )
        result[fixture["key"]] = row.id
    session.flush()
    return result


def _seed_vehicles(
    session: Session, station_ids: dict[str, int]
) -> dict[str, int]:
    result: dict[str, int] = {}
    for fixture in VEHICLES:
        values = {
            "current_station_id": (
                station_ids[fixture["station"]] if fixture["station"] else None
            ),
            "name": fixture["name"],
            "type": fixture["type"],
            "battery_percent": fixture["battery_percent"],
            "status": fixture["status"],
            "first_30_minutes_price": Decimal(FIRST_30_MINUTES_PRICE),
            "extra_minute_price": Decimal(EXTRA_MINUTE_PRICE),
            "deposit_amount": Decimal(DEPOSIT_AMOUNT),
        }
        row = _put_by_id(
            session,
            Vehicle,
            fixture["id"],
            values,
            {"name": fixture["name"]},
        )
        result[fixture["key"]] = row.id
    session.flush()
    return result


def _seed_documents(
    session: Session, user_ids: dict[str, int]
) -> None:
    for fixture in DOCUMENTS:
        verified_by = (
            user_ids[fixture["verified_by"]]
            if fixture["verified_by"]
            else None
        )
        values = {
            "document_type": "CCCD",
            "birth_date": date.fromisoformat(fixture["birth_date"]),
            "expires_on": date.fromisoformat(fixture["expires_on"]),
            "verified_status": fixture["verified_status"],
            "verified_birth_date": (
                date.fromisoformat(fixture["verified_birth_date"])
                if fixture["verified_birth_date"]
                else None
            ),
            "verified_by": verified_by,
            "verified_at": (
                _timestamp(fixture["verified_at"])
                if fixture["verified_at"]
                else None
            ),
            "revoked_at": None,
        }
        _upsert_by(
            session,
            UserDocument,
            {
                "user_id": user_ids[fixture["user"]],
                "document_number": fixture["document_number"],
            },
            values,
        )


def _seed_wallets(session: Session, user_ids: dict[str, int]) -> None:
    now = datetime.now(UTC)
    for fixture in WALLETS:
        _upsert_by(
            session,
            Wallet,
            {"user_id": user_ids[fixture["user"]]},
            {
                "balance": Decimal(fixture["balance"]),
                "status": fixture["status"],
                "updated_at": now,
            },
        )


def _seed_promotions(session: Session) -> dict[str, int]:
    result: dict[str, int] = {}
    for fixture in PROMOTIONS:
        values = {
            "description": fixture["description"],
            "discount_percent": fixture["discount_percent"],
            "max_discount_amount": Decimal(fixture["max_discount_amount"]),
            "min_rental_amount": Decimal(fixture["min_rental_amount"]),
            "start_date": _timestamp(fixture["start_date"]),
            "end_date": _timestamp(fixture["end_date"]),
            "status": fixture["status"],
        }
        row = session.get(Promotion, fixture["id"])
        if row is None:
            row = session.scalar(
                select(Promotion)
                .where(Promotion.code == fixture["code"])
                .with_for_update()
            )
        if row is None:
            row = Promotion(id=fixture["id"], code=fixture["code"], **values)
            session.add(row)
        else:
            if row.code != fixture["code"]:
                raise RuntimeError(
                    f"Demo seed ID collision in promotions.id={fixture['id']}."
                )
            for field, value in values.items():
                setattr(row, field, value)
        result[fixture["code"]] = row.id
    session.flush()
    return result


def _seed_promotion_claims(
    session: Session, user_ids: dict[str, int], promotion_ids: dict[str, int]
) -> None:
    for fixture in PROMOTION_CLAIMS:
        _upsert_by(
            session,
            UserPromotion,
            {
                "user_id": user_ids[fixture["user"]],
                "promotion_id": promotion_ids[fixture["promotion"]],
            },
            {
                "is_used": fixture["is_used"],
                "used_at": (
                    _timestamp("2026-03-05T09:10:00+00:00")
                    if fixture["is_used"]
                    else None
                ),
            },
        )


def _seed_rentals_and_related(
    session: Session,
    user_ids: dict[str, int],
    station_ids: dict[str, int],
    vehicle_ids: dict[str, int],
    now: datetime,
) -> None:
    for fixture in HISTORICAL_RENTALS:
        started = _timestamp(fixture["actual_start_time"])
        ended = _timestamp(fixture["actual_end_time"])
        _seed_one_rental(
            session,
            fixture=fixture,
            status="COMPLETED",
            user_ids=user_ids,
            station_ids=station_ids,
            vehicle_ids=vehicle_ids,
            created_at=_timestamp(fixture["created_at"]),
            actual_start_time=started,
            return_initiated_at=ended,
            actual_end_time=ended,
            settled_at=ended + timedelta(minutes=5),
        )
        _seed_handover(
            session, fixture["id"], "PICKUP", started, 92, "OK", user_ids["staff"]
        )
        _seed_handover(
            session, fixture["id"], "RETURN", ended, 70, "OK", user_ids["staff"]
        )
        _upsert_by(
            session,
            Invoice,
            {"rental_id": fixture["id"]},
            {
                "total_amount": Decimal(fixture["total_price"]),
                "status": fixture["invoice_status"],
                "created_at": ended + timedelta(minutes=5),
            },
        )

    for fixture in ACTIVE_RENTALS:
        created_at = now
        started = None
        return_started = None
        ended = None
        settled = None
        if fixture["status"] == "IN_RENT":
            created_at = now - timedelta(hours=4)
            started = now - timedelta(hours=3)
        elif fixture["status"] == "RETURN_PENDING":
            created_at = now - timedelta(hours=2)
            started = now - timedelta(minutes=90)
        elif fixture["status"] == "STOLEN":
            created_at = now - timedelta(hours=4)
            started = now - timedelta(hours=3)
        if fixture["status"] == "RETURN_PENDING":
            return_started = now - timedelta(minutes=10)
            ended = return_started
        _seed_one_rental(
            session,
            fixture=fixture,
            status=fixture["status"],
            user_ids=user_ids,
            station_ids=station_ids,
            vehicle_ids=vehicle_ids,
            created_at=created_at,
            actual_start_time=started,
            return_initiated_at=return_started,
            actual_end_time=ended,
            settled_at=settled,
        )
        if started:
            _seed_handover(
                session,
                fixture["id"],
                "PICKUP",
                started,
                70,
                "OK",
                user_ids["staff"],
            )
        if fixture["status"] == "RETURN_PENDING" and return_started:
            _seed_handover(
                session,
                fixture["id"],
                "RETURN",
                return_started,
                29,
                "NEEDS_MAINTENANCE",
                user_ids["staff"],
            )
    session.flush()


def _seed_one_rental(
    session: Session,
    fixture: dict[str, Any],
    status: str,
    user_ids: dict[str, int],
    station_ids: dict[str, int],
    vehicle_ids: dict[str, int],
    created_at: datetime,
    actual_start_time: datetime | None,
    return_initiated_at: datetime | None,
    actual_end_time: datetime | None,
    settled_at: datetime | None,
) -> None:
    vehicle_fixture = next(
        item for item in VEHICLES if item["key"] == fixture["vehicle"]
    )
    vehicle_id = vehicle_ids[fixture["vehicle"]]
    customer_id = user_ids[fixture["customer"]]
    if status == "COMPLETED":
        total_price = Decimal(fixture["total_price"])
        deposit_held = Decimal("0.00")
    elif status == "RESERVED":
        total_price = None
        deposit_held = Decimal("0.00")
    else:
        total_price = None
        deposit_held = Decimal(DEPOSIT_AMOUNT)

    rental_values = {
        "customer_id": customer_id,
        "vehicle_id": vehicle_id,
        "pickup_station_id": station_ids[fixture["pickup_station"]],
        "actual_return_station_id": (
            station_ids[fixture["return_station"]]
            if fixture.get("return_station")
            else (
                station_ids["spacious"]
                if status == "RETURN_PENDING"
                else None
            )
        ),
        "created_at": created_at,
        "expires_at": created_at + timedelta(minutes=30),
        "actual_start_time": actual_start_time,
        "actual_end_time": actual_end_time,
        "return_initiated_at": return_initiated_at,
        "settled_at": settled_at,
        "cancelled_at": None,
        "cancellation_reason": None,
        "cancellation_limit_exempt": False,
        "cancelled_by": None,
        "deposit_held": deposit_held,
        "status": status,
        "total_price": total_price,
    }
    rental = _put_by_id(
        session,
        Rental,
        fixture["id"],
        rental_values,
        {"customer_id": customer_id, "vehicle_id": vehicle_id},
    )
    session.flush()

    snapshot_values = {
        "vehicle_name": vehicle_fixture["name"],
        "vehicle_type_snapshot": vehicle_fixture["type"],
        "first_30_minutes_price_snapshot": Decimal(FIRST_30_MINUTES_PRICE),
        "extra_minute_price_snapshot": Decimal(EXTRA_MINUTE_PRICE),
        "pricing_policy_version": "EVRIDE_DEMO_V1_20261102_R2",
        "billing_unit": "MINUTE_AFTER_FIRST_30",
        "pricing_policy_snapshot": {
            "is_demo": True,
            "first_30_minutes_price": FIRST_30_MINUTES_PRICE,
            "extra_minute_price": EXTRA_MINUTE_PRICE,
            "billing_unit": "MINUTE_AFTER_FIRST_30",
        },
        "deposit_amount_snapshot": Decimal(DEPOSIT_AMOUNT),
        "promotion_id": None,
        "promotion_code": None,
        "discount_percent": None,
        "max_discount_amount": None,
        "discount_amount": Decimal("0.00"),
        "created_at": created_at,
    }
    _upsert_by(
        session, RentalPricingSnapshot, {"rental_id": rental.id}, snapshot_values
    )


def _seed_handover(
    session: Session,
    rental_id: int,
    kind: str,
    happened_at: datetime,
    battery_percent: int,
    vehicle_condition: str,
    staff_id: int,
) -> None:
    _upsert_by(
        session,
        Handover,
        {"rental_id": rental_id, "kind": kind},
        {
            "staff_id": staff_id,
            "time": happened_at,
            "battery_percent": battery_percent,
            "vehicle_condition": vehicle_condition,
            "note": "Fictional demo handover.",
            "created_at": happened_at,
        },
    )


def _seed_pricing_history(
    session: Session,
    vehicle_ids: dict[str, int],
    manager_id: int,
    now: datetime,
) -> None:
    for fixture in VEHICLES:
        lookup = {
            "vehicle_id": vehicle_ids[fixture["key"]],
            "version_number": 1,
        }
        existing = session.scalar(
            select(VehiclePricingHistory).filter_by(**lookup)
        )
        if existing:
            expected = Decimal(FIRST_30_MINUTES_PRICE)
            if existing.new_first_30_minutes_price != expected:
                raise RuntimeError(
                    "Conflicting vehicle pricing history for demo vehicle "
                    f"{fixture['name']} version 1."
                )
            continue
        session.add(
            VehiclePricingHistory(
                **lookup,
                changed_by=manager_id,
                old_first_30_minutes_price=None,
                new_first_30_minutes_price=Decimal(FIRST_30_MINUTES_PRICE),
                old_extra_minute_price=None,
                new_extra_minute_price=Decimal(EXTRA_MINUTE_PRICE),
                old_deposit_amount=None,
                new_deposit_amount=Decimal(DEPOSIT_AMOUNT),
                created_at=now,
            )
        )
    session.flush()


def _seed_maintenance(
    session: Session,
    user_ids: dict[str, int],
    vehicle_ids: dict[str, int],
) -> None:
    for fixture in MAINTENANCE_ORDERS:
        opened_at = (
            _timestamp(fixture["started_at"]) - timedelta(hours=1)
            if fixture.get("started_at")
            else _timestamp("2026-05-01T08:00:00+00:00")
        )
        values = {
            "vehicle_id": vehicle_ids[fixture["vehicle"]],
            "created_by": user_ids["manager"],
            "assigned_to": user_ids["staff"],
            "title": fixture["title"],
            "description": fixture["description"],
            "status": fixture["status"],
            "opened_at": opened_at,
            "started_at": (
                _timestamp(fixture["started_at"])
                if fixture.get("started_at")
                else None
            ),
            "completed_at": (
                _timestamp(fixture["completed_at"])
                if fixture.get("completed_at")
                else None
            ),
            "resolution_note": fixture.get("resolution_note"),
            "created_at": opened_at,
            "updated_at": (
                _timestamp(fixture["completed_at"])
                if fixture.get("completed_at")
                else opened_at
            ),
        }
        _put_by_id(
            session,
            MaintenanceOrder,
            fixture["id"],
            values,
            {"vehicle_id": vehicle_ids[fixture["vehicle"]]},
        )


def _seed_move_audits(
    session: Session,
    station_ids: dict[str, int],
    vehicle_ids: dict[str, int],
    actor_id: int,
) -> None:
    for fixture in VEHICLE_MOVE_AUDITS:
        moved_at = _timestamp(fixture["moved_at"])
        exists = session.scalar(
            select(VehicleMoveAudit).where(
                VehicleMoveAudit.vehicle_id == vehicle_ids[fixture["vehicle"]],
                VehicleMoveAudit.moved_at == moved_at,
            )
        )
        if exists:
            continue
        session.add(
            VehicleMoveAudit(
                vehicle_id=vehicle_ids[fixture["vehicle"]],
                from_station_id=station_ids[fixture["from_station"]],
                to_station_id=station_ids[fixture["to_station"]],
                actor_id=actor_id,
                idempotency_record_id=None,
                note=fixture["note"],
                moved_at=moved_at,
            )
        )
    session.flush()


def seed_demo_data() -> None:
    now = datetime.now(UTC).replace(microsecond=0)
    with Session(engine) as session, session.begin():
        user_ids = _seed_users(session)
        station_ids = _seed_stations(session)
        vehicle_ids = _seed_vehicles(session, station_ids)
        _seed_documents(session, user_ids)
        _seed_wallets(session, user_ids)
        promotion_ids = _seed_promotions(session)
        _seed_promotion_claims(session, user_ids, promotion_ids)
        _seed_rentals_and_related(
            session, user_ids, station_ids, vehicle_ids, now
        )
        _seed_pricing_history(
            session, vehicle_ids, user_ids["manager"], now
        )
        _seed_maintenance(session, user_ids, vehicle_ids)
        _seed_move_audits(
            session, station_ids, vehicle_ids, user_ids["staff"]
        )
        for table_name in (
            "users",
            "stations",
            "vehicles",
            "rentals",
            "promotions",
            "maintenance_orders",
        ):
            session.execute(
                text(
                    f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                    f"(SELECT COALESCE(max(id), 1) FROM {table_name}), true)"
                )
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-demo-seed",
        action="store_true",
        help="Confirm that this loopback database may receive fictional demo data.",
    )
    arguments = parser.parse_args()
    _verify_database_target(arguments.allow_demo_seed)
    seed_demo_data()
    print("Demo seed complete. All records are fictional and safe to reseed.")
    print(f"Demo login password for all fixture users: {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
