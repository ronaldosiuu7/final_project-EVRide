"""Initial tables migration

Revision ID: 1fc518e856f5
Revises: 
Create Date: 2026-11-01 14:27:33.420961

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1fc518e856f5'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(100), nullable=False),
        sa.Column("password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("email"),
        sa.CheckConstraint("role IN ('CUSTOMER', 'STAFF', 'MANAGER')", name="users_role_check"),
        sa.CheckConstraint("status IN ('ACTIVE', 'INACTIVE', 'BLOCKED', 'BLACKLISTED')", name="users_status_check"),
    )

    op.create_table(
        "user_documents",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_type", sa.String(30), nullable=False),
        sa.Column("document_number", sa.String(50), nullable=False),
        sa.Column("image_front_url", sa.Text(), nullable=False),
        sa.Column("image_back_url", sa.Text()),
        sa.Column("verified_status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("document_type IN ('CCCD', 'PASSPORT', 'DRIVER_LICENSE')", name="user_documents_document_type_check"),
        sa.CheckConstraint("verified_status IN ('PENDING', 'VERIFIED', 'REJECTED')", name="user_documents_verified_status_check"),
    )

    op.create_table(
        "wallets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("balance", sa.Numeric(12, 2), server_default=sa.text("0.00"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("user_id"),
        sa.CheckConstraint("balance >= 0", name="wallets_balance_check"),
        sa.CheckConstraint("status IN ('ACTIVE', 'FROZEN', 'LOCKED')", name="wallets_status_check"),
    )

    op.create_table(
        "stations",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("opens_at", sa.Time()),
        sa.Column("closes_at", sa.Time()),
        sa.Column("status", sa.String(20), nullable=False),
        sa.CheckConstraint("capacity > 0", name="stations_capacity_check"),
    )

    op.create_table(
        "vehicles",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("current_station_id", sa.BigInteger(), sa.ForeignKey("stations.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("battery_percent", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("daily_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("deposit_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("battery_percent BETWEEN 0 AND 100", name="vehicles_battery_percent_check"),
        sa.CheckConstraint("daily_price >= 0", name="vehicles_daily_price_check"),
        sa.CheckConstraint("deposit_amount >= 0", name="vehicles_deposit_amount_check"),
        sa.CheckConstraint("status IN ('AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE', 'SUSPECTED_STOLEN', 'STOLEN')", name="vehicles_status_check"),
    )

    op.create_table(
        "rentals",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("vehicle_id", sa.BigInteger(), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("pickup_station_id", sa.BigInteger(), sa.ForeignKey("stations.id"), nullable=False),
        sa.Column("actual_return_station_id", sa.BigInteger(), sa.ForeignKey("stations.id")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actual_start_time", sa.DateTime(timezone=True)),
        sa.Column("actual_end_time", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(20), server_default=sa.text("'RESERVED'"), nullable=False),
        sa.Column("total_price", sa.Numeric(12, 2)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("status IN ('RESERVED', 'IN_RENT', 'STOLEN', 'COMPLETED', 'CANCELLED', 'EXPIRED')", name="ck_rentals_status"),
        sa.CheckConstraint("total_price >= 0", name="ck_rentals_total_price_nonnegative"),
    )
    op.create_index("idx_rentals_status_expires_at", "rentals", ["status", "expires_at"])
    op.create_index("idx_rentals_customer_created_at", "rentals", ["customer_id", "created_at"])
    op.create_index("idx_rentals_vehicle_id", "rentals", ["vehicle_id"])
    op.create_index("uq_active_vehicle_rental", "rentals", ["vehicle_id"], unique=True, postgresql_where=sa.text("status IN ('RESERVED', 'IN_RENT', 'STOLEN')"))

    op.create_table(
        "handovers",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("rental_id", sa.BigInteger(), sa.ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("staff_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("battery_percent", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("kind IN ('PICKUP', 'RETURN')", name="handovers_kind_check"),
        sa.CheckConstraint("battery_percent BETWEEN 0 AND 100", name="handovers_battery_percent_check"),
    )
    op.create_index("uq_handovers_rental_kind", "handovers", ["rental_id", "kind"], unique=True)

    op.create_table(
        "rental_reviews",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("rental_id", sa.BigInteger(), sa.ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("rental_id"),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="rental_reviews_rating_check"),
    )

    op.create_table(
        "invoices",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("rental_id", sa.BigInteger(), sa.ForeignKey("rentals.id"), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("rental_id"),
        sa.CheckConstraint("total_amount >= 0", name="invoices_total_amount_check"),
        sa.CheckConstraint("status IN ('UNPAID', 'PAID', 'CANCELLED')", name="invoices_status_check"),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("rental_id", sa.BigInteger(), sa.ForeignKey("rentals.id"), nullable=False),
        sa.Column("invoice_id", sa.BigInteger(), sa.ForeignKey("invoices.id")),
        sa.Column("actor_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("amount >= 0", name="transactions_amount_check"),
        sa.CheckConstraint("kind IN ('PAYMENT', 'DEPOSIT', 'REFUND', 'FEE')", name="transactions_kind_check"),
    )

    op.create_table(
        "wallet_transactions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("wallet_id", sa.BigInteger(), sa.ForeignKey("wallets.id"), nullable=False),
        sa.Column("rental_id", sa.BigInteger(), sa.ForeignKey("rentals.id")),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("balance_before", sa.Numeric(12, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("amount >= 0", name="wallet_transactions_amount_check"),
        sa.CheckConstraint("balance_before >= 0", name="wallet_transactions_balance_before_check"),
        sa.CheckConstraint("balance_after >= 0", name="wallet_transactions_balance_after_check"),
        sa.CheckConstraint("type IN ('TOPUP', 'WITHDRAW', 'RENTAL_PAYMENT', 'RENTAL_DEPOSIT', 'RENTAL_REFUND')", name="wallet_transactions_type_check"),
        sa.CheckConstraint("status IN ('PENDING', 'SUCCESS', 'FAILED')", name="wallet_transactions_status_check"),
    )

    op.create_table(
        "promotions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("discount_percent", sa.Integer()),
        sa.Column("max_discount_amount", sa.Numeric(12, 2)),
        sa.Column("min_rental_amount", sa.Numeric(12, 2)),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("code"),
        sa.CheckConstraint("discount_percent BETWEEN 0 AND 100", name="promotions_discount_percent_check"),
        sa.CheckConstraint("max_discount_amount >= 0", name="promotions_max_discount_amount_check"),
        sa.CheckConstraint("min_rental_amount >= 0", name="promotions_min_rental_amount_check"),
        sa.CheckConstraint("status IN ('ACTIVE', 'EXPIRED', 'DISABLED')", name="promotions_status_check"),
    )

    op.create_table(
        "user_promotions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("promotion_id", sa.BigInteger(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_used", sa.Boolean(), server_default=sa.text("FALSE"), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "support_tickets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("rental_id", sa.BigInteger(), sa.ForeignKey("rentals.id"), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_to", sa.BigInteger(), sa.ForeignKey("users.id")),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')", name="support_tickets_status_check"),
    )

    op.create_table(
        "gps_points",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("rental_id", sa.BigInteger(), sa.ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    raise RuntimeError(
        "Automatic downgrade is disabled for the initial EVRide schema. "
        "Restore an approved database backup to revert."
    )
