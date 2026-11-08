"""add rolling auth sessions

Revision ID: 2500f37c8961
Revises: 888ad91e139e
Create Date: 2026-11-06 22:54:47.036114

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2500f37c8961'
down_revision: Union[str, Sequence[str], None] = '888ad91e139e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoke_reason", sa.String(40)),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("ip_address", sa.String(64)),
        sa.CheckConstraint("expires_at > created_at", name="ck_sessions_expiry"),
        sa.CheckConstraint("last_used_at >= created_at", name="ck_sessions_usage"),
    )
    for suffix, column in [("user", "user_id"), ("expiry", "expires_at"), ("revoked", "revoked_at")]:
        op.create_index("ix_sessions_" + suffix, "user_sessions", [column])
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("session_id", sa.Uuid(), sa.ForeignKey("user_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("replay_until", sa.DateTime(timezone=True)),
        sa.Column("replay_ciphertext", sa.Text()),
        sa.UniqueConstraint("session_id", "generation", name="uq_refresh_generation"),
        sa.CheckConstraint("generation >= 0", name="ck_refresh_generation"),
        sa.CheckConstraint("char_length(token_hash) = 64", name="ck_refresh_hash"),
        sa.CheckConstraint("expires_at > created_at", name="ck_refresh_expiry"),
        sa.CheckConstraint("used_at IS NULL OR used_at >= created_at", name="ck_refresh_usage"),
        sa.CheckConstraint(
            "(used_at IS NULL AND replay_until IS NULL AND replay_ciphertext IS NULL) OR "
            "(used_at IS NOT NULL AND replay_until IS NOT NULL AND replay_until >= used_at)", name="ck_refresh_replay"
        ),
    )
    op.create_index("uq_refresh_current", "refresh_tokens", ["session_id"],
                    unique=True, postgresql_where=sa.text("used_at IS NULL"))
    op.create_index("ix_refresh_replay_until", "refresh_tokens", ["replay_until"])


def downgrade():
    raise RuntimeError(
        "Auth downgrade would erase session/reuse history. Roll back app with "
        "the new tables retained; use a separately reviewed data migration if needed."
    )
