"""Add promotion discount types, vehicle scopes, and usage limits.

Revision ID: d3f914a27c6b
Revises: 2500f37c8961
Create Date: 2026-11-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3f914a27c6b"
down_revision: Union[str, Sequence[str], None] = "2500f37c8961"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Extend promotion terms while preserving existing percentage promotions."""
    bind = op.get_bind()
    invalid_promotions = bind.execute(
        sa.text(
            "SELECT id FROM promotions "
            "WHERE discount_percent IS NULL OR discount_percent NOT BETWEEN 1 AND 100 "
            "LIMIT 1"
        )
    ).first()
    if invalid_promotions:
        raise RuntimeError(
            "Cannot migrate promotions without a valid discount_percent: "
            f"promotion id={invalid_promotions.id}. Repair the promotion before retrying."
        )
    invalid_snapshots = bind.execute(
        sa.text(
            "SELECT id FROM rental_pricing_snapshots "
            "WHERE discount_percent IS NOT NULL "
            "AND discount_percent NOT BETWEEN 1 AND 100 LIMIT 1"
        )
    ).first()
    if invalid_snapshots:
        raise RuntimeError(
            "Cannot migrate a pricing snapshot without a valid discount_percent: "
            f"snapshot id={invalid_snapshots.id}. Repair the snapshot before retrying."
        )

    op.add_column(
        "vehicles",
        sa.Column("model", sa.String(length=100), nullable=True),
    )
    op.execute("UPDATE vehicles SET model = name")
    op.alter_column("vehicles", "model", nullable=False)

    op.add_column(
        "promotions", sa.Column("discount_type", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "promotions", sa.Column("discount_value", sa.Numeric(12, 2), nullable=True)
    )
    op.add_column(
        "promotions", sa.Column("vehicle_type", sa.String(length=50), nullable=True)
    )
    op.add_column(
        "promotions", sa.Column("vehicle_model", sa.String(length=100), nullable=True)
    )
    op.add_column("promotions", sa.Column("usage_limit", sa.Integer(), nullable=True))
    op.add_column(
        "promotions",
        sa.Column(
            "used_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.execute(
        """
        UPDATE promotions
        SET discount_type = 'PERCENTAGE',
            discount_value = discount_percent::numeric,
            used_count = (
                SELECT count(*) FROM user_promotions
                WHERE user_promotions.promotion_id = promotions.id
                  AND user_promotions.is_used = TRUE
            )
        """
    )
    op.alter_column("promotions", "discount_type", nullable=False)
    op.alter_column("promotions", "discount_value", nullable=False)

    op.drop_constraint(
        "ck_promotions_discount_percent_range", "promotions", type_="check"
    )
    op.drop_constraint(
        "ck_promotions_max_discount_amount_nonnegative", "promotions", type_="check"
    )
    op.create_check_constraint(
        "ck_promotions_discount_value",
        "promotions",
        "(discount_type = 'PERCENTAGE' AND discount_value BETWEEN 1 AND 100 "
        "AND discount_value = trunc(discount_value)) OR "
        "(discount_type = 'FIXED_AMOUNT' AND discount_value > 0)",
    )
    op.create_check_constraint(
        "ck_promotions_max_discount_amount_nonnegative",
        "promotions",
        "max_discount_amount IS NULL OR "
        "(discount_type = 'PERCENTAGE' AND max_discount_amount >= 0)",
    )
    op.create_check_constraint(
        "ck_promotions_usage_limit_positive",
        "promotions",
        "usage_limit IS NULL OR usage_limit > 0",
    )
    op.create_check_constraint(
        "ck_promotions_used_count_range",
        "promotions",
        "used_count >= 0 AND (usage_limit IS NULL OR used_count <= usage_limit)",
    )
    op.create_check_constraint(
        "ck_promotions_vehicle_type_nonempty",
        "promotions",
        "vehicle_type IS NULL OR char_length(trim(vehicle_type)) > 0",
    )
    op.create_check_constraint(
        "ck_promotions_vehicle_model_nonempty",
        "promotions",
        "vehicle_model IS NULL OR char_length(trim(vehicle_model)) > 0",
    )

    op.add_column(
        "rental_pricing_snapshots",
        sa.Column("vehicle_model_snapshot", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "rental_pricing_snapshots",
        sa.Column("discount_type", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "rental_pricing_snapshots",
        sa.Column("discount_value", sa.Numeric(12, 2), nullable=True),
    )
    op.execute(
        """
        UPDATE rental_pricing_snapshots AS snapshot
        SET vehicle_model_snapshot = vehicle.model
        FROM rentals
        JOIN vehicles AS vehicle ON vehicle.id = rentals.vehicle_id
        WHERE rentals.id = snapshot.rental_id
        """
    )
    op.execute(
        """
        UPDATE rental_pricing_snapshots
        SET discount_type = 'PERCENTAGE',
            discount_value = discount_percent::numeric
        WHERE discount_percent IS NOT NULL
        """
    )
    op.alter_column(
        "rental_pricing_snapshots", "vehicle_model_snapshot", nullable=False
    )
    op.drop_constraint(
        "ck_rental_price_discount_percent",
        "rental_pricing_snapshots",
        type_="check",
    )
    op.create_check_constraint(
        "ck_rental_price_discount_snapshot",
        "rental_pricing_snapshots",
        "(discount_type IS NULL AND discount_value IS NULL) OR "
        "(discount_type = 'PERCENTAGE' AND discount_value BETWEEN 1 AND 100 "
        "AND discount_value = trunc(discount_value)) OR "
        "(discount_type = 'FIXED_AMOUNT' AND discount_value > 0)",
    )
    op.drop_column("promotions", "discount_percent")
    op.drop_column("rental_pricing_snapshots", "discount_percent")


def downgrade() -> None:
    """Refuse lossy conversion of fixed and vehicle-scoped promotions."""
    raise RuntimeError(
        "This migration is irreversible: fixed discounts, vehicle scopes, and "
        "usage counts cannot be represented by the previous promotion schema."
    )
