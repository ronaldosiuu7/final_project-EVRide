"""Remove vehicle type from promotion applicability scope.

Revision ID: f73c21e84a6b
Revises: d3f914a27c6b
Create Date: 2026-11-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f73c21e84a6b"
down_revision: Union[str, Sequence[str], None] = "d3f914a27c6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Keep promotion vehicle scope on model only."""
    bind = op.get_bind()
    scoped_promotions = bind.execute(
        sa.text(
            "SELECT id FROM promotions WHERE vehicle_type IS NOT NULL LIMIT 1"
        )
    ).first()
    if scoped_promotions:
        raise RuntimeError(
            "Cannot drop vehicle_type promotion scopes without reviewing their "
            f"replacement model scopes: promotion id={scoped_promotions.id}. "
            "Assign an equivalent vehicle_model or clear the scope before retrying."
        )

    op.drop_constraint(
        "ck_promotions_vehicle_type_nonempty", "promotions", type_="check"
    )
    op.drop_column("promotions", "vehicle_type")


def downgrade() -> None:
    """Restore the optional vehicle type scope for older applications."""
    op.add_column(
        "promotions",
        sa.Column("vehicle_type", sa.String(length=50), nullable=True),
    )
    op.create_check_constraint(
        "ck_promotions_vehicle_type_nonempty",
        "promotions",
        "vehicle_type IS NULL OR char_length(trim(vehicle_type)) > 0",
    )
