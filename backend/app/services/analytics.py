from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.services.errors import ServiceError


LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

TIME_BASIS = {
    "normal_rental_revenue": "rentals.actual_end_time",
    "incident_rental_revenue": "rental_incidents.rent_settled_at",
    "compensation_flows": "transactions.created_at",
    "deposit_held": "CURRENT_SNAPSHOT",
}


def period_params(
    from_date: date | None,
    to_date: date | None,
):
    if (from_date is None) != (to_date is None):
        raise ServiceError(
            400,
            "DATE_RANGE_REQUIRED",
            "from_date và to_date phải được gửi cùng nhau.",
        )

    if from_date is None:
        return {
            "start_at": None,
            "end_at": None,
        }

    if from_date > to_date:
        raise ServiceError(
            400,
            "INVALID_DATE_RANGE",
            "from_date không được lớn hơn to_date.",
        )

    try:
        start_at = datetime.combine(
            from_date,
            time.min,
            tzinfo=LOCAL_TZ,
        ).astimezone(timezone.utc)

        end_at = datetime.combine(
            to_date + timedelta(days=1),
            time.min,
            tzinfo=LOCAL_TZ,
        ).astimezone(timezone.utc)

    except (OverflowError, ValueError) as error:
        raise ServiceError(
            400,
            "INVALID_DATE_RANGE",
            "Khoảng ngày nằm ngoài phạm vi hỗ trợ.",
        ) from error

    return {
        "start_at": start_at,
        "end_at": end_at,
    }


def report_context(from_date, to_date):
    return {
        "from_date": from_date.isoformat() if from_date else None,
        "to_date": to_date.isoformat() if to_date else None,
        "timezone": "Asia/Ho_Chi_Minh",
        "time_basis": TIME_BASIS,
    }


def amount_string(value):
    amount = Decimal(value)

    if not amount.is_finite():
        raise ServiceError(
            409,
            "INVALID_REPORT_AMOUNT",
            "Dữ liệu báo cáo có số tiền không hợp lệ.",
        )

    return format(amount, ".2f")


# Một dòng doanh thu cho mỗi rental.
# Ledger tiền thuê sự cố được tổng hợp trước khi JOIN.
REPORT_BASE = """
WITH incident_payments AS (
    SELECT
        incident_id,
        SUM(amount) AS paid_amount,
        COUNT(*) AS posting_count,
        COUNT(invoice_id) AS invoice_reference_count,
        MIN(invoice_id) AS min_invoice_id,
        MAX(invoice_id) AS max_invoice_id
    FROM transactions
    WHERE status = 'SUCCESS'
      AND kind = 'PAYMENT'
      AND obligation_type = 'RENTAL_FEE'
      AND incident_id IS NOT NULL
    GROUP BY incident_id
),
normal_events AS (
    SELECT
        r.id AS rental_id,
        i.id AS invoice_id,
        'NORMAL'::text AS revenue_type,
        r.actual_end_time AS recognized_at,
        i.total_amount AS revenue,
        (
            i.total_amount >= 0
            AND i.total_amount <> 'NaN'::numeric
            AND NOT EXISTS (
                SELECT 1
                FROM rental_incidents ri
                WHERE ri.rental_id = r.id
                  AND ri.status IN ('CONFIRMED', 'CLOSED')
                  AND ri.verified_outcome IN (
                      'LOSS_THEFT', 'ABANDONMENT'
                  )
            )
        ) AS is_valid
    FROM rentals r
    JOIN invoices i ON i.rental_id = r.id
    WHERE r.status = 'COMPLETED'
      AND i.status = 'PAID'
      AND r.actual_end_time IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM rental_incidents ri
          WHERE ri.rental_id = r.id
            AND ri.rent_settled_at IS NOT NULL
      )
),
incident_events AS (
    SELECT
        r.id AS rental_id,
        i.id AS invoice_id,
        'INCIDENT'::text AS revenue_type,
        ri.rent_settled_at AS recognized_at,
        i.total_amount AS revenue,
        COALESCE(
            ri.status IN ('CONFIRMED', 'CLOSED')
            AND ri.verified_outcome IN (
                'LOSS_THEFT', 'ABANDONMENT'
            )
            AND r.status IN (
                'STOLEN',
                'INCIDENT_PENDING',
                'CLOSED_INCIDENT'
            )
            AND i.status = 'PAID'
            AND i.total_amount >= 0
            AND i.total_amount <> 'NaN'::numeric
            AND i.total_amount = COALESCE(p.paid_amount, 0)
            AND r.total_price = i.total_amount
            AND (
                COALESCE(p.posting_count, 0) = 0
                OR (
                    p.invoice_reference_count = p.posting_count
                    AND p.min_invoice_id = i.id
                    AND p.max_invoice_id = i.id
                )
            ),
            FALSE
        ) AS is_valid
    FROM rental_incidents ri
    JOIN rentals r ON r.id = ri.rental_id
    LEFT JOIN invoices i ON i.rental_id = r.id
    LEFT JOIN incident_payments p ON p.incident_id = ri.id
    WHERE ri.rent_settled_at IS NOT NULL
),
revenue_events AS (
    SELECT * FROM normal_events
    UNION ALL
    SELECT * FROM incident_events
),
filtered AS (
    SELECT
        e.*,
        NULLIF(
            btrim(s.vehicle_model_snapshot),
            ''
        ) AS vehicle_model
    FROM revenue_events e
    LEFT JOIN rental_pricing_snapshots s
        ON s.rental_id = e.rental_id
    WHERE (
        CAST(:start_at AS timestamptz) IS NULL
        OR e.recognized_at >= CAST(:start_at AS timestamptz)
    )
    AND (
        CAST(:end_at AS timestamptz) IS NULL
        OR e.recognized_at < CAST(:end_at AS timestamptz)
    )
)
"""


REVENUE_SQL = REPORT_BASE + """
, monthly AS (
    SELECT
        to_char(
            timezone('Asia/Ho_Chi_Minh', recognized_at),
            'YYYY-MM'
        ) AS month,
        vehicle_model,
        COUNT(*) AS rental_count,
        SUM(revenue) AS revenue,
        COALESCE(
            SUM(revenue) FILTER (
                WHERE revenue_type = 'NORMAL'
            ),
            0
        ) AS normal_revenue,
        COALESCE(
            SUM(revenue) FILTER (
                WHERE revenue_type = 'INCIDENT'
            ),
            0
        ) AS incident_revenue
    FROM filtered
    GROUP BY 1, 2
),
windowed AS (
    SELECT
        *,
        SUM(revenue) OVER (
            PARTITION BY vehicle_model
            ORDER BY month
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_revenue,
        SUM(revenue) OVER (
            PARTITION BY month
        ) AS month_revenue
    FROM monthly
)
SELECT
    statement_timestamp() AS generated_at,
    (
        SELECT COUNT(*)
        FROM filtered
        WHERE NOT is_valid
    ) AS invalid_count,
    (
        SELECT COUNT(*)
        FROM filtered
        WHERE vehicle_model IS NULL
    ) AS missing_snapshot_count,
    (
        SELECT COUNT(*)
        FROM filtered
    ) AS rental_count,
    COALESCE(
        (SELECT SUM(revenue) FROM filtered),
        0
    ) AS total_revenue,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'month', month,
                    'vehicle_model', vehicle_model,
                    'rental_count', rental_count,
                    'revenue', round(revenue, 2)::text,
                    'normal_revenue', round(normal_revenue, 2)::text,
                    'incident_revenue', round(incident_revenue, 2)::text,
                    'cumulative_revenue',
                        round(cumulative_revenue, 2)::text,
                    'share_percent',
                        round(
                            CASE
                                WHEN month_revenue = 0 THEN 0::numeric
                                ELSE revenue * 100 / month_revenue
                            END,
                            2
                        )::text
                )
                ORDER BY month, vehicle_model NULLS LAST
            )
            FROM windowed
        ),
        '[]'::jsonb
    ) AS items
"""


FINANCIAL_SUMMARY_SQL = REPORT_BASE + """
, period_flows AS (
    SELECT
        COALESCE(
            SUM(amount) FILTER (
                WHERE kind = 'PAYMENT'
                  AND obligation_type = 'COMPENSATION'
            ),
            0
        ) AS compensation_collected,
        COALESCE(
            SUM(amount) FILTER (
                WHERE kind = 'REFUND'
                  AND obligation_type = 'COMPENSATION'
            ),
            0
        ) AS compensation_refunded,
        COALESCE(
            SUM(amount) FILTER (
                WHERE kind = 'REFUND'
                  AND obligation_type = 'DEPOSIT'
            ),
            0
        ) AS incident_deposit_refunded
    FROM transactions
    WHERE status = 'SUCCESS'
      AND incident_id IS NOT NULL
      AND (
          CAST(:start_at AS timestamptz) IS NULL
          OR created_at >= CAST(:start_at AS timestamptz)
      )
      AND (
          CAST(:end_at AS timestamptz) IS NULL
          OR created_at < CAST(:end_at AS timestamptz)
      )
),
current_deposits AS (
    SELECT
        COALESCE(SUM(r.deposit_held), 0) AS all_rentals,
        COALESCE(
            SUM(r.deposit_held) FILTER (
                WHERE ri.status IN ('CONFIRMED', 'CLOSED')
            ),
            0
        ) AS confirmed_incidents
    FROM rentals r
    LEFT JOIN rental_incidents ri ON ri.rental_id = r.id
)
SELECT
    statement_timestamp() AS generated_at,
    (
        SELECT COUNT(*)
        FROM filtered
        WHERE NOT is_valid
    ) AS invalid_count,
    (
        SELECT COUNT(*)
        FROM filtered
        WHERE vehicle_model IS NULL
    ) AS missing_snapshot_count,
    (
        SELECT COUNT(*)
        FROM filtered
    ) AS rental_count,
    (
        SELECT COUNT(*)
        FROM filtered
        WHERE revenue_type = 'NORMAL'
    ) AS normal_rental_count,
    (
        SELECT COUNT(*)
        FROM filtered
        WHERE revenue_type = 'INCIDENT'
    ) AS incident_rental_count,
    COALESCE(
        (
            SELECT SUM(revenue)
            FROM filtered
            WHERE revenue_type = 'NORMAL'
        ),
        0
    ) AS normal_rental_revenue,
    COALESCE(
        (
            SELECT SUM(revenue)
            FROM filtered
            WHERE revenue_type = 'INCIDENT'
        ),
        0
    ) AS incident_rental_revenue,
    COALESCE(
        (SELECT SUM(revenue) FROM filtered),
        0
    ) AS rental_revenue,
    f.compensation_collected,
    f.compensation_refunded,
    f.compensation_collected - f.compensation_refunded
        AS compensation_net_movement,
    f.incident_deposit_refunded,
    d.all_rentals AS deposit_held_all_rentals,
    d.confirmed_incidents AS deposit_held_incidents
FROM period_flows f
CROSS JOIN current_deposits d
"""


REVENUE_DETAILS_SQL = REPORT_BASE + """
, page_rows AS (
    SELECT *
    FROM filtered
    ORDER BY recognized_at DESC, rental_id DESC
    LIMIT :limit
    OFFSET :offset
)
SELECT
    statement_timestamp() AS generated_at,
    (
        SELECT COUNT(*)
        FROM filtered
        WHERE NOT is_valid
    ) AS invalid_count,
    (
        SELECT COUNT(*)
        FROM filtered
        WHERE vehicle_model IS NULL
    ) AS missing_snapshot_count,
    (
        SELECT COUNT(*)
        FROM filtered
    ) AS total,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'rental_id', rental_id::text,
                    'invoice_id', invoice_id::text,
                    'revenue_type', revenue_type,
                    'recognized_at', recognized_at,
                    'vehicle_model', vehicle_model,
                    'revenue', round(revenue, 2)::text
                )
                ORDER BY recognized_at DESC, rental_id DESC
            )
            FROM page_rows
        ),
        '[]'::jsonb
    ) AS items
"""


def execute_report(db, sql, params):
    row = db.execute(text(sql), params).mappings().one()

    if row["invalid_count"] > 0:
        raise ServiceError(
            409,
            "REVENUE_DATA_INCONSISTENT",
            "Có dữ liệu doanh thu không khớp trạng thái, "
            "hóa đơn hoặc ledger tiền thuê sự cố.",
        )

    return row


def revenue(db, from_date=None, to_date=None):
    params = period_params(from_date, to_date)
    row = execute_report(db, REVENUE_SQL, params)

    return {
        **report_context(from_date, to_date),
        "generated_at": row["generated_at"],
        "items": row["items"],
        "rental_count": row["rental_count"],
        "total_revenue": amount_string(row["total_revenue"]),
        "missing_snapshot_count": row["missing_snapshot_count"],
    }


def financial_summary(db, from_date=None, to_date=None):
    params = period_params(from_date, to_date)
    row = execute_report(db, FINANCIAL_SUMMARY_SQL, params)

    money_fields = (
        "normal_rental_revenue",
        "incident_rental_revenue",
        "rental_revenue",
        "compensation_collected",
        "compensation_refunded",
        "compensation_net_movement",
        "incident_deposit_refunded",
    )

    return {
        **report_context(from_date, to_date),
        "generated_at": row["generated_at"],
        "rental_count": row["rental_count"],
        "normal_rental_count": row["normal_rental_count"],
        "incident_rental_count": row["incident_rental_count"],
        **{
            name: amount_string(row[name])
            for name in money_fields
        },
        "deposit_held_current": {
            "as_of": row["generated_at"],
            "all_rentals": amount_string(
                row["deposit_held_all_rentals"]
            ),
            "confirmed_incidents": amount_string(
                row["deposit_held_incidents"]
            ),
        },
        "missing_snapshot_count": row["missing_snapshot_count"],
    }


def revenue_details(
    db,
    from_date=None,
    to_date=None,
    *,
    page=1,
    page_size=20,
):
    params = {
        **period_params(from_date, to_date),
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }

    row = execute_report(db, REVENUE_DETAILS_SQL, params)

    return {
        **report_context(from_date, to_date),
        "generated_at": row["generated_at"],
        "items": row["items"],
        "page": page,
        "page_size": page_size,
        "total": row["total"],
        "missing_snapshot_count": row["missing_snapshot_count"],
    }
