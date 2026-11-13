from sqlalchemy import and_

from app.models import Rental


CUSTOMER_BLOCKING_STATUSES = (
    "RESERVED",
    "IN_RENT",
    "RETURN_PENDING",
    "STOLEN",
    "INCIDENT_PENDING",
)

VEHICLE_BLOCKING_STATUSES = (
    *CUSTOMER_BLOCKING_STATUSES,
    "CLOSED_INCIDENT",
)


def customer_blocking_clause():
    return Rental.status.in_(CUSTOMER_BLOCKING_STATUSES)


def vehicle_blocking_clause():
    return and_(
        Rental.status.in_(VEHICLE_BLOCKING_STATUSES),
        Rental.vehicle_released_at.is_(None),
    )
