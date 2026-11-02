"""align rentals with reservation contract

Revision ID: 557c5e6a380e
Revises: 1fc518e856f5
Create Date: 2026-11-02 22:34:20.286439

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '557c5e6a380e'
down_revision: Union[str, Sequence[str], None] = '1fc518e856f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Align legacy rental columns and statuses with the reservation contract."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "rentals" not in inspector.get_table_names():
        raise RuntimeError(
            "The rentals table is missing; initialize the database schema before "
            "applying this migration."
        )

    columns = {column["name"]: column for column in inspector.get_columns("rentals")}
    if "expires_at" not in columns:
        op.add_column(
            "rentals", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True)
        )
    elif (
        isinstance(columns["expires_at"]["type"], sa.DateTime)
        and not columns["expires_at"]["type"].timezone
    ):
        op.alter_column(
            "rentals",
            "expires_at",
            type_=sa.DateTime(timezone=True),
            postgresql_using="expires_at AT TIME ZONE 'UTC'",
        )

    op.execute(
        sa.text(
            "UPDATE rentals "
            "SET expires_at = created_at + INTERVAL '30 minutes' "
            "WHERE expires_at IS NULL"
        )
    )
    inspector = sa.inspect(bind)
    expires_at = next(
        column
        for column in inspector.get_columns("rentals")
        if column["name"] == "expires_at"
    )
    if expires_at["nullable"]:
        op.alter_column("rentals", "expires_at", nullable=False)

    columns = {column["name"] for column in inspector.get_columns("rentals")}
    for column_name in ("planned_start_time", "planned_end_time"):
        if column_name in columns:
            op.drop_column("rentals", column_name)

    columns = {column["name"]: column for column in sa.inspect(bind).get_columns("rentals")}
    if "total_price" not in columns:
        op.add_column("rentals", sa.Column("total_price", sa.Numeric(12, 2)))
    elif not columns["total_price"]["nullable"]:
        op.alter_column("rentals", "total_price", nullable=True)

    check_constraints = sa.inspect(bind).get_check_constraints("rentals")
    for constraint in check_constraints:
        expression = (constraint.get("sqltext") or "").lower()
        if "status" in expression or "total_price" in expression:
            op.drop_constraint(constraint["name"], "rentals", type_="check")

    op.execute(
        sa.text(
            "UPDATE rentals "
            "SET status = CASE "
            "WHEN status IN ('PENDING', 'CONFIRMED') THEN 'RESERVED' "
            "WHEN status = 'OVERDUE' THEN 'IN_RENT' "
            "ELSE status END "
            "WHERE status IN ('PENDING', 'CONFIRMED', 'OVERDUE')"
        )
    )
    unsupported_statuses = bind.execute(
        sa.text(
            "SELECT DISTINCT status FROM rentals "
            "WHERE status IS NULL OR status NOT IN "
            "('RESERVED', 'IN_RENT', 'STOLEN', 'COMPLETED', 'CANCELLED', 'EXPIRED')"
        )
    ).scalars().all()
    if unsupported_statuses:
        raise RuntimeError(
            "Cannot migrate rentals with unsupported statuses: "
            + ", ".join(sorted(str(status) for status in unsupported_statuses))
        )

    status_column = next(
        column
        for column in sa.inspect(bind).get_columns("rentals")
        if column["name"] == "status"
    )
    if status_column["nullable"]:
        op.alter_column("rentals", "status", nullable=False)
    op.alter_column(
        "rentals",
        "status",
        server_default=sa.text("'RESERVED'"),
    )
    op.create_check_constraint(
        "ck_rentals_status",
        "rentals",
        "status IN ('RESERVED', 'IN_RENT', 'STOLEN', 'COMPLETED', 'CANCELLED', 'EXPIRED')",
    )
    op.create_check_constraint(
        "ck_rentals_total_price_nonnegative",
        "rentals",
        "total_price >= 0",
    )

    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("rentals")}
    if "idx_rentals_status_expires_at" not in indexes:
        op.create_index(
            "idx_rentals_status_expires_at", "rentals", ["status", "expires_at"]
        )
    if "uq_active_vehicle_rental" not in indexes:
        op.create_index(
            "uq_active_vehicle_rental",
            "rentals",
            ["vehicle_id"],
            unique=True,
            postgresql_where=sa.text("status IN ('RESERVED', 'IN_RENT', 'STOLEN')"),
        )


def downgrade() -> None:
    """The removed planned-time values and merged statuses cannot be restored."""
    raise RuntimeError(
        "This migration is irreversible: planned rental times were removed and "
        "legacy statuses were consolidated. Restore a database backup to revert."
    )
