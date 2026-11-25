"""Add wallet top-up approval requests table.

Revision ID: d7e4b2c9a105
Revises: f4c2a1b8e901
Create Date: 2026-11-25 17:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "d7e4b2c9a105"
down_revision = "f4c2a1b8e901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_wallet_transactions_id_wallet",
        "wallet_transactions",
        ["id", "wallet_id"],
    )

    op.create_table(
        "wallet_topup_requests",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "wallet_id",
            sa.BigInteger(),
            sa.ForeignKey("wallets.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "requested_by",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'PENDING'"),
        ),
        sa.Column(
            "reviewed_by",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column(
            "wallet_transaction_id",
            sa.BigInteger(),
            sa.ForeignKey("wallet_transactions.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "idempotency_record_id",
            sa.BigInteger(),
            sa.ForeignKey("idempotency_records.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.CheckConstraint(
            "amount > 0 AND amount <= 9999999999.99 AND amount <> 'NaN'::numeric",
            name="ck_wallet_topup_requests_amount_positive",
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED')",
            name="ck_wallet_topup_requests_status",
        ),
        sa.CheckConstraint(
            """
            (
                status = 'PENDING'
                AND reviewed_by IS NULL
                AND reviewed_at IS NULL
                AND rejection_reason IS NULL
                AND wallet_transaction_id IS NULL
            )
            OR
            (
                status = 'APPROVED'
                AND reviewed_by IS NOT NULL
                AND reviewed_at IS NOT NULL
                AND rejection_reason IS NULL
                AND wallet_transaction_id IS NOT NULL
            )
            OR
            (
                status = 'REJECTED'
                AND reviewed_by IS NOT NULL
                AND reviewed_at IS NOT NULL
                AND rejection_reason IS NOT NULL
                AND length(btrim(rejection_reason)) > 0
                AND wallet_transaction_id IS NULL
            )
            """,
            name="ck_wallet_topup_requests_state_details",
        ),
        sa.CheckConstraint(
            "reviewed_at IS NULL OR reviewed_at >= created_at",
            name="ck_wallet_topup_requests_review_time_order",
        ),
        sa.CheckConstraint(
            "reviewed_by IS NULL OR reviewed_by <> requested_by",
            name="ck_wallet_topup_requests_reviewer_not_requester",
        ),
        sa.UniqueConstraint(
            "wallet_transaction_id",
            name="uq_wallet_topup_requests_wallet_transaction",
        ),
        sa.UniqueConstraint(
            "idempotency_record_id",
            name="uq_wallet_topup_requests_idempotency_record",
        ),
        sa.ForeignKeyConstraint(
            ["wallet_transaction_id", "wallet_id"],
            ["wallet_transactions.id", "wallet_transactions.wallet_id"],
            name="fk_wallet_topup_requests_tx_wallet",
            ondelete="RESTRICT",
        ),
    )

    op.create_index(
        "ix_wallet_topup_requests_status_created",
        "wallet_topup_requests",
        ["status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_wallet_topup_requests_wallet_created",
        "wallet_topup_requests",
        ["wallet_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_wallet_topup_requests_requested_by_created",
        "wallet_topup_requests",
        ["requested_by", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    has_rows = bind.execute(
        sa.text("SELECT 1 FROM wallet_topup_requests LIMIT 1")
    ).first()
    if has_rows is not None:
        raise RuntimeError(
            "Không thể downgrade khi wallet_topup_requests đã có dữ liệu."
        )

    op.drop_index(
        "ix_wallet_topup_requests_requested_by_created",
        table_name="wallet_topup_requests",
    )
    op.drop_index(
        "ix_wallet_topup_requests_wallet_created",
        table_name="wallet_topup_requests",
    )
    op.drop_index(
        "ix_wallet_topup_requests_status_created",
        table_name="wallet_topup_requests",
    )
    op.drop_table("wallet_topup_requests")
    op.drop_constraint(
        "uq_wallet_transactions_id_wallet",
        "wallet_transactions",
        type_="unique",
    )
