"""Use vehicle model as the only vehicle classification.

Revision ID: b18f7e4c2a91
Revises: f73c21e84a6b
Create Date: 2026-11-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b18f7e4c2a91"
down_revision: Union[str, Sequence[str], None] = "f73c21e84a6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("rental_pricing_snapshots", "vehicle_type_snapshot")
    op.drop_column("vehicles", "type")


def downgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column("type", sa.String(length=50), nullable=True),
    )
    op.execute("UPDATE vehicles SET type = model")
    op.alter_column("vehicles", "type", nullable=False)

    op.add_column(
        "rental_pricing_snapshots",
        sa.Column("vehicle_type_snapshot", sa.String(length=50), nullable=True),
    )
    op.execute(
        "UPDATE rental_pricing_snapshots "
        "SET vehicle_type_snapshot = vehicle_model_snapshot"
    )
    op.alter_column(
        "rental_pricing_snapshots",
        "vehicle_type_snapshot",
        nullable=False,
    )
