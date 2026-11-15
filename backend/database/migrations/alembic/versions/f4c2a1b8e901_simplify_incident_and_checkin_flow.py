"""Simplify incident flow and replace alerts with rental check-ins.

Revision ID: f4c2a1b8e901
Revises: e8a412c9f603
Create Date: 2026-11-13 18:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f4c2a1b8e901"
down_revision = "e8a412c9f603"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rentals",
        sa.Column("next_check_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_rentals_in_rent_check",
        "rentals",
        ["actual_start_time", "next_check_at"],
        unique=False,
        postgresql_where=sa.text(
            "status = 'IN_RENT' AND actual_start_time IS NOT NULL"
        ),
    )

    op.drop_constraint(
        "ck_rental_incidents_investigation_assignee",
        "rental_incidents",
        type_="check",
    )

    op.add_column(
        "maintenance_orders",
        sa.Column("incident_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "maintenance_orders_incident_id_fkey",
        "maintenance_orders",
        "rental_incidents",
        ["incident_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_maintenance_orders_incident",
        "maintenance_orders",
        ["incident_id"],
        unique=False,
    )

    # Chuyển lịch kiểm tra tiếp theo từ dữ liệu alert cũ (nếu có) sang rentals.next_check_at.
    op.execute(
        """
        UPDATE rentals AS r
        SET next_check_at = src.target_check_at
        FROM (
            SELECT DISTINCT ON (st.rental_id)
                st.rental_id,
                COALESCE(st.next_check_at, st.alert_due_at) AS target_check_at
            FROM support_tickets AS st
            WHERE st.check_cycle IS NOT NULL
              AND st.report_source = 'SYSTEM'
              AND (
                  st.status IN ('OPEN', 'IN_PROGRESS')
                  OR (
                      st.status IN ('RESOLVED', 'CLOSED')
                      AND st.alert_outcome = 'CONTINUE_RENTAL'
                      AND st.next_check_at IS NOT NULL
                  )
              )
            ORDER BY st.rental_id, st.check_cycle DESC, st.id DESC
        ) AS src
        WHERE r.id = src.rental_id
          AND r.status = 'IN_RENT'
          AND r.next_check_at IS NULL
          AND src.target_check_at IS NOT NULL
        """
    )

    # Backfill maintenance_orders.incident_id từ audit log tạo bảo trì qua sự cố (nếu có).
    op.execute(
        """
        UPDATE maintenance_orders AS mo
        SET incident_id = al.resource_id::bigint
        FROM audit_logs AS al
        WHERE al.resource_type = 'rental_incidents'
          AND al.action = 'RENTAL_INCIDENT_MAINTENANCE_CREATED'
          AND al.resource_id ~ '^[0-9]+$'
          AND (al.after_data ->> 'maintenance_order_id') ~ '^[0-9]+$'
          AND mo.id = (al.after_data ->> 'maintenance_order_id')::bigint
          AND mo.incident_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM rental_incidents AS ri
              WHERE ri.id = al.resource_id::bigint
          )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_maintenance_orders_incident", table_name="maintenance_orders")
    op.drop_constraint(
        "maintenance_orders_incident_id_fkey",
        "maintenance_orders",
        type_="foreignkey",
    )
    op.drop_column("maintenance_orders", "incident_id")

    op.create_check_constraint(
        "ck_rental_incidents_investigation_assignee",
        "rental_incidents",
        "status <> 'INVESTIGATING' OR assigned_to IS NOT NULL",
    )

    op.drop_index("ix_rentals_in_rent_check", table_name="rentals")
    op.drop_column("rentals", "next_check_at")
