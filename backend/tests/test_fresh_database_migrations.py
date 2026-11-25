import os
import re
import secrets
import uuid

import pytest
from alembic import command
from alembic.config import Config
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.schema import ForeignKeyConstraint


url = make_url(os.environ["TEST_DATABASE_URL"])
if url.drivername != "postgresql+psycopg" or not (url.database or "").endswith("_test"):
    raise RuntimeError("Cần PostgreSQL psycopg và database riêng có hậu tố _test")

os.environ.update({
    "APP_ENV": "test",
    "JWT_SECRET_KEY": secrets.token_urlsafe(48),
    "REFRESH_REPLAY_KEYS": Fernet.generate_key().decode(),
    "AUTH_COOKIE_SECURE": "true",
    "AUTH_ORIGINS": "https://thuexedien.me",
    "DB_HOST": url.host or "localhost",
    "DB_PORT": str(url.port or 5432),
    "DB_NAME": url.database,
    "DB_USER": url.username or "postgres",
    "DB_PASSWORD": url.password or "",
})

from app.models import Base, RentalIncident


ALEMBIC_HEAD = "d7e4b2c9a105"


def _make_schema():
    schema = "migration_test_" + uuid.uuid4().hex
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')

    scoped_url = url.update_query_dict({"options": f"-csearch_path={schema}"})
    engine = create_engine(scoped_url)
    config = Config("alembic.ini")
    config.set_main_option(
        "sqlalchemy.url",
        scoped_url.render_as_string(hide_password=False).replace("%", "%%"),
    )
    return schema, admin, engine, config


def _drop_schema(admin, schema):
    with admin.begin() as connection:
        connection.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


@pytest.fixture
def migration_context():
    schema, admin, engine, config = _make_schema()
    try:
        yield engine, config
    finally:
        engine.dispose()
        _drop_schema(admin, schema)
        admin.dispose()


def _normalized_type(column_type):
    normalized = re.sub(r"\s+", " ", str(column_type).upper())
    if "UUID" in normalized or "CHAR(32)" in normalized:
        return "UUID"
    if "TIMESTAMP" in normalized or "DATETIME" in normalized:
        return "DATETIME"
    if "NUMERIC" in normalized:
        return "NUMERIC"
    if "BIGINT" in normalized:
        return "BIGINT"
    if "VARCHAR" in normalized:
        return "VARCHAR"
    return normalized


def test_empty_database_migrates_to_head_and_matches_models(migration_context):
    engine, config = migration_context

    command.upgrade(config, "head")

    with engine.connect() as connection:
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()
    assert revision == ALEMBIC_HEAD

    inspector = inspect(engine)
    database_tables = set(inspector.get_table_names()) - {"alembic_version"}
    model_tables = set(Base.metadata.tables)
    assert database_tables == model_tables

    for table_name, table in Base.metadata.tables.items():
        db_columns = {
            column["name"]: column
            for column in inspector.get_columns(table_name)
        }
        assert set(db_columns) == set(table.c.keys()), table_name

        for column_name, model_column in table.c.items():
            db_column = db_columns[column_name]
            assert db_column["nullable"] == model_column.nullable, (
                table_name,
                column_name,
            )
            assert _normalized_type(db_column["type"]) == _normalized_type(
                model_column.type
            ), (table_name, column_name, db_column["type"], model_column.type)

        model_indexes = {
            index.name: {
                "unique": index.unique,
                "columns": tuple(index.columns.keys()),
            }
            for index in table.indexes
            if index.name
        }
        db_indexes = {
            index["name"]: {
                "unique": index["unique"],
                "columns": tuple(index["column_names"]),
            }
            for index in inspector.get_indexes(table_name)
        }
        for name, expected in model_indexes.items():
            assert name in db_indexes, (table_name, name)
            assert db_indexes[name]["unique"] == expected["unique"], (
                table_name,
                name,
            )

        model_check_names = {
            constraint.name
            for constraint in table.constraints
            if hasattr(constraint, "name")
            and constraint.name
            and constraint.__class__.__name__ == "CheckConstraint"
        }
        db_check_names = {
            constraint["name"]
            for constraint in inspector.get_check_constraints(table_name)
            if constraint["name"]
        }
        assert model_check_names - db_check_names == set(), (
            table_name,
            model_check_names - db_check_names,
        )

    with engine.connect() as connection:
        triggers = set(connection.execute(text(
            """
            SELECT tgname
            FROM pg_trigger
            WHERE NOT tgisinternal
              AND (
                tgrelid::regclass::text LIKE 'vehicle_%'
                OR tgrelid::regclass::text LIKE 'rental_%'
              )
            """
        )).scalars())
    assert "trg_vehicle_pricing_history_append_only" in triggers
    assert "trg_vehicle_move_audits_append_only" in triggers


def test_migration_accepts_existing_empty_rental_incidents_table(migration_context):
    engine, config = migration_context

    command.upgrade(config, "de606e75dbc8")
    incident_table = RentalIncident.__table__
    for constraint in list(incident_table.constraints):
        if isinstance(constraint, ForeignKeyConstraint):
            if any(
                foreign_key.column.table.name == "support_tickets"
                for foreign_key in constraint.elements
            ):
                incident_table.constraints.remove(constraint)
    incident_table.create(engine, checkfirst=True)

    with engine.begin() as connection:
        constraints = connection.execute(text(
            """
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'rental_incidents'::regclass
              AND contype IN ('f', 'c')
            """
        )).scalars().all()
        for constraint_name in constraints:
            connection.exec_driver_sql(
                f'ALTER TABLE rental_incidents DROP CONSTRAINT "{constraint_name}"'
            )
        incident_indexes = connection.execute(text(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND tablename = 'rental_incidents'
              AND indexname NOT LIKE '%_pkey'
              AND indexname NOT LIKE 'uq_%'
            """
        )).scalars().all()
        for index_name in incident_indexes:
            connection.exec_driver_sql(f'DROP INDEX "{index_name}"')

    command.upgrade(config, "head")

    with engine.connect() as connection:
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()
        incident_count = connection.execute(
            text("SELECT count(*) FROM rental_incidents")
        ).scalar_one()
    assert revision == ALEMBIC_HEAD
    assert incident_count == 0


def test_topup_migration_preserves_legacy_topups_and_guards_downgrade(migration_context):
    engine, config = migration_context

    command.upgrade(config, "f4c2a1b8e901")

    with engine.begin() as connection:
        customer_id = connection.execute(
            text(
                "INSERT INTO users (name, email, password, role, status) "
                "VALUES ('Legacy', 'legacy@test.vn', 'hash', 'CUSTOMER', 'ACTIVE') "
                "RETURNING id"
            )
        ).scalar_one()
        staff_id = connection.execute(
            text(
                "INSERT INTO users (name, email, password, role, status) "
                "VALUES ('Staff', 'staff@test.vn', 'hash', 'STAFF', 'ACTIVE') "
                "RETURNING id"
            )
        ).scalar_one()
        wallet_id = connection.execute(
            text(
                "INSERT INTO wallets (user_id, balance, status) "
                "VALUES (:uid, 250000.00, 'ACTIVE') RETURNING id"
            ),
            {"uid": customer_id},
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO wallet_transactions "
                "(wallet_id, amount, type, balance_before, balance_after, status) "
                "VALUES (:wid, 250000.00, 'TOPUP', 0.00, 250000.00, 'SUCCESS')"
            ),
            {"wid": wallet_id},
        )

    command.upgrade(config, "head")

    inspector = inspect(engine)
    assert "wallet_topup_requests" in set(inspector.get_table_names())
    topup_cols = {col["name"] for col in inspector.get_columns("wallet_topup_requests")}
    assert {
        "id",
        "wallet_id",
        "requested_by",
        "amount",
        "status",
        "reviewed_by",
        "reviewed_at",
        "rejection_reason",
        "wallet_transaction_id",
        "idempotency_record_id",
        "created_at",
    }.issubset(topup_cols)
    wt_uniques = {u["name"] for u in inspector.get_unique_constraints("wallet_transactions")}
    assert "uq_wallet_transactions_id_wallet" in wt_uniques

    with engine.connect() as connection:
        legacy_row = connection.execute(
            text(
                "SELECT type, status, amount, balance_before, balance_after "
                "FROM wallet_transactions WHERE wallet_id = :wid"
            ),
            {"wid": wallet_id},
        ).mappings().one()
        request_count = connection.execute(
            text("SELECT count(*) FROM wallet_topup_requests")
        ).scalar_one()

    assert legacy_row["type"] == "TOPUP"
    assert legacy_row["status"] == "SUCCESS"
    assert str(legacy_row["amount"]) == "250000.00"
    assert request_count == 0

    # Downgrade khi bảng mới còn rỗng phải thành công và upgrade lại sạch.
    command.downgrade(config, "f4c2a1b8e901")
    command.upgrade(config, "head")

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO wallet_topup_requests (wallet_id, requested_by, amount, status) "
                "VALUES (:wid, :uid, 50000.00, 'PENDING')"
            ),
            {"wid": wallet_id, "uid": customer_id},
        )
        # Kiểm tra cột và constraint mới có mặt.
        assert staff_id > 0

    with pytest.raises(RuntimeError):
        command.downgrade(config, "f4c2a1b8e901")
