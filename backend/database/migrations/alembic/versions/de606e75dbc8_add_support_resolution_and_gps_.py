"""add support resolution and gps constraints

Revision ID: de606e75dbc8
Revises: b18f7e4c2a91
Create Date: 2026-11-11 11:32:30.743095

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'de606e75dbc8'
down_revision: Union[str, Sequence[str], None] = 'b18f7e4c2a91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "support_tickets",
        sa.Column("resolution_note", sa.Text(), nullable=True),
    )
    op.add_column(
        "support_tickets",
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "support_tickets",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
    )

    op.create_check_constraint(
        "ck_gps_points_latitude",
        "gps_points",
        "latitude BETWEEN -90 AND 90",
    )
    op.create_check_constraint(
        "ck_gps_points_longitude",
        "gps_points",
        "longitude BETWEEN -180 AND 180",
    )
    op.create_index(
        "idx_gps_points_rental_recorded",
        "gps_points",
        ["rental_id", "recorded_at", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_gps_points_rental_recorded",
        table_name="gps_points",
    )
    op.drop_constraint(
        "ck_gps_points_longitude",
        "gps_points",
        type_="check",
    )
    op.drop_constraint(
        "ck_gps_points_latitude",
        "gps_points",
        type_="check",
    )

    op.drop_column("support_tickets", "updated_at")
    op.drop_column("support_tickets", "resolved_at")
    op.drop_column("support_tickets", "resolution_note")
