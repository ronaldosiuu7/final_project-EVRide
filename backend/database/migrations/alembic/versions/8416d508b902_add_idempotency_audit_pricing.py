"""Add persistent idempotency, audit, pricing snapshots, and ledger links.

Revision ID: 8416d508b902
Revises: 557c5e6a380e
Create Date: 2026-11-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "8416d508b902"
down_revision: Union[str, Sequence[str], None] = "557c5e6a380e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add durable request replay, audit, pricing snapshot, and accounting links."""
    bind = op.get_bind()

    duplicate_promotions = bind.execute(
        sa.text(
            "SELECT user_id, promotion_id FROM user_promotions "
            "GROUP BY user_id, promotion_id HAVING count(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate_promotions:
        raise RuntimeError(
            "Cannot add the per-user promotion uniqueness constraint while duplicate "
            f"claims exist for user_id={duplicate_promotions.user_id}, "
            f"promotion_id={duplicate_promotions.promotion_id}."
        )

    invalid_transaction_statuses = bind.execute(
        sa.text(
            "SELECT DISTINCT status FROM transactions "
            "WHERE status IS NULL OR status NOT IN ('PENDING', 'SUCCESS', 'FAILED')"
        )
    ).scalars().all()
    if invalid_transaction_statuses:
        raise RuntimeError(
            "Cannot add the transaction status constraint; unsupported values exist: "
            + ", ".join(sorted(str(status) for status in invalid_transaction_statuses))
        )

    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "actor_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("http_method", sa.String(10), nullable=False),
        sa.Column("request_path", sa.String(500), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column(
            "state",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'PROCESSING'"),
        ),
        sa.Column("response_status", sa.Integer()),
        sa.Column("response_body", postgresql.JSONB()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "actor_id",
            "http_method",
            "request_path",
            "idempotency_key",
            name="uq_idempotency_scope_key",
        ),
        sa.CheckConstraint(
            "state IN ('PROCESSING', 'COMPLETED')",
            name="ck_idempotency_records_state",
        ),
        sa.CheckConstraint(
            "char_length(idempotency_key) BETWEEN 16 AND 128",
            name="ck_idempotency_records_key_length",
        ),
        sa.CheckConstraint(
            "char_length(request_hash) = 64",
            name="ck_idempotency_records_hash_length",
        ),
        sa.CheckConstraint(
            "(state = 'PROCESSING' AND completed_at IS NULL "
            "AND response_status IS NULL) OR "
            "(state = 'COMPLETED' AND completed_at IS NOT NULL "
            "AND response_status BETWEEN 100 AND 599)",
            name="ck_idempotency_records_completion",
        ),
        sa.CheckConstraint(
            "expires_at >= created_at + INTERVAL '24 hours'",
            name="ck_idempotency_records_minimum_retention",
        ),
    )
    op.create_index(
        "idx_idempotency_records_expiry",
        "idempotency_records",
        ["expires_at"],
    )

    op.create_table(
        "rental_pricing_snapshots",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "rental_id",
            sa.BigInteger(),
            sa.ForeignKey("rentals.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("vehicle_name", sa.String(100), nullable=False),
        sa.Column("vehicle_type", sa.String(50), nullable=False),
        sa.Column("daily_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("pricing_policy_version", sa.String(64), nullable=False),
        sa.Column("pricing_policy_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("deposit_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "promotion_id",
            sa.BigInteger(),
            sa.ForeignKey("promotions.id", ondelete="SET NULL"),
        ),
        sa.Column("promotion_code", sa.String(50)),
        sa.Column("discount_percent", sa.Integer()),
        sa.Column("max_discount_amount", sa.Numeric(12, 2)),
        sa.Column(
            "discount_amount",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0.00"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.UniqueConstraint("rental_id", name="uq_rental_pricing_snapshots_rental"),
        sa.CheckConstraint(
            "daily_price >= 0", name="ck_rental_price_daily_nonnegative"
        ),
        sa.CheckConstraint(
            "deposit_amount >= 0", name="ck_rental_price_deposit_nonnegative"
        ),
        sa.CheckConstraint(
            "discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100",
            name="ck_rental_price_discount_percent",
        ),
        sa.CheckConstraint(
            "max_discount_amount IS NULL OR max_discount_amount >= 0",
            name="ck_rental_price_max_discount_nonnegative",
        ),
        sa.CheckConstraint(
            "discount_amount >= 0", name="ck_rental_price_discount_nonnegative"
        ),
        sa.CheckConstraint(
            "pricing_policy_version <> ''",
            name="ck_rental_price_policy_version_nonempty",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(pricing_policy_snapshot) = 'object'",
            name="ck_rental_price_policy_snapshot_object",
        ),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "actor_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(100)),
        sa.Column("request_id", sa.String(64)),
        sa.Column("before_data", postgresql.JSONB()),
        sa.Column("after_data", postgresql.JSONB()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
    )
    op.create_index(
        "idx_audit_logs_actor_created", "audit_logs", ["actor_id", "created_at"]
    )
    op.create_index(
        "idx_audit_logs_resource",
        "audit_logs",
        ["resource_type", "resource_id"],
    )
    op.create_index("idx_audit_logs_created", "audit_logs", ["created_at"])
    op.create_index("idx_audit_logs_request_id", "audit_logs", ["request_id"])

    op.add_column(
        "transactions",
        sa.Column(
            "idempotency_record_id",
            sa.BigInteger(),
            sa.ForeignKey("idempotency_records.id", ondelete="SET NULL"),
        ),
    )
    op.create_check_constraint(
        "ck_transactions_status",
        "transactions",
        "status IN ('PENDING', 'SUCCESS', 'FAILED')",
    )

    op.add_column(
        "wallet_transactions",
        sa.Column(
            "transaction_id",
            sa.BigInteger(),
            sa.ForeignKey("transactions.id", ondelete="RESTRICT"),
        ),
    )
    op.add_column(
        "wallet_transactions",
        sa.Column(
            "idempotency_record_id",
            sa.BigInteger(),
            sa.ForeignKey("idempotency_records.id", ondelete="SET NULL"),
        ),
    )
    op.create_unique_constraint(
        "uq_wallet_transactions_transaction",
        "wallet_transactions",
        ["transaction_id"],
    )

    op.create_unique_constraint(
        "uq_user_promotions_user_promotion",
        "user_promotions",
        ["user_id", "promotion_id"],
    )


def downgrade() -> None:
    """Remove only structures introduced by this revision."""
    op.drop_constraint(
        "uq_user_promotions_user_promotion", "user_promotions", type_="unique"
    )
    op.drop_constraint(
        "uq_wallet_transactions_transaction",
        "wallet_transactions",
        type_="unique",
    )
    op.drop_column("wallet_transactions", "idempotency_record_id")
    op.drop_column("wallet_transactions", "transaction_id")
    op.drop_constraint("ck_transactions_status", "transactions", type_="check")
    op.drop_column("transactions", "idempotency_record_id")

    op.drop_index("idx_audit_logs_request_id", table_name="audit_logs")
    op.drop_index("idx_audit_logs_created", table_name="audit_logs")
    op.drop_index("idx_audit_logs_resource", table_name="audit_logs")
    op.drop_index("idx_audit_logs_actor_created", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_table("rental_pricing_snapshots")
    op.drop_index(
        "idx_idempotency_records_expiry", table_name="idempotency_records"
    )
    op.drop_table("idempotency_records")
