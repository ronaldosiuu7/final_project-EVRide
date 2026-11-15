from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query, Response

from app.api.v1.operations import DB, Staff
from app.core.responses import make_response
from app.services import analytics as service


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


def report_response(response, data):
    response.headers["Cache-Control"] = "no-store"
    return make_response(data)


@router.get("/revenue")
def get_revenue(
    response: Response,
    db: DB,
    actor: Staff,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    data = service.revenue(
        db,
        from_date=from_date,
        to_date=to_date,
    )

    return report_response(response, data)


@router.get("/financial-summary")
def get_financial_summary(
    response: Response,
    db: DB,
    actor: Staff,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    data = service.financial_summary(
        db,
        from_date=from_date,
        to_date=to_date,
    )

    return report_response(response, data)


@router.get("/revenue-details")
def get_revenue_details(
    response: Response,
    db: DB,
    actor: Staff,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    page: int = Query(1, ge=1, le=2147483647),
    page_size: int = Query(20, ge=1, le=100),
):
    data = service.revenue_details(
        db,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )

    return report_response(response, data)
