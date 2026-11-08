"""Rental, handover, quote, and settlement transactions."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Handover,
    Invoice,
    MaintenanceOrder,
    Promotion,
    Rental,
    RentalPricingSnapshot,
    RentalReturnQuote,
    Station,
    Transaction,
    User,
    UserDocument,
    UserPromotion,
    Vehicle,
    Wallet,
    WalletTransaction,
)
from app.services import fleet as fleet_service
from app.services.errors import ServiceError
from app.services.promotions import (
    PromotionNotApplicable,
    calculate_promotion_discount,
    consume_promotion,
)

ACTIVE_RENTAL_STATUSES = ("RESERVED", "IN_RENT", "RETURN_PENDING", "STOLEN")
MIN_BATTERY_PERCENT = 30
HOLD_DURATION = timedelta(minutes=30)
QUOTE_DURATION = timedelta(minutes=10)
BILLING_UNIT = "FIRST_1800_SECONDS_THEN_CEIL_MINUTE"
PRICING_POLICY_VERSION = "EVRIDE_DEMO_V1_20261102_R2"
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
CENT = Decimal("0.01")
WHOLE_DONG = Decimal("1")


def _clock(session: Session) -> datetime:
    value = session.scalar(select(func.clock_timestamp()))
    if value is None:
        raise RuntimeError("The database did not return clock_timestamp().")
    return value


def _lock_station(
    session: Session, station_id: int, *, require_open: bool = True
):
    station = session.scalar(
        select(Station)
        .where(Station.id == station_id)
        .with_for_update()
    )
    if station is None:
        raise ServiceError(404, "NOT_FOUND", "Trạm không tồn tại.")
    if require_open and not fleet_service.station_is_open(station):
        raise ServiceError(409, "STATION_UNAVAILABLE", "Trạm đang đóng hoặc không hoạt động.")
    return station


def _lock_customer_and_wallet(session: Session, customer_id: int) -> tuple[User, Wallet]:
    customer = session.scalar(
        select(User).where(User.id == customer_id).with_for_update()
    )
    if customer is None or customer.role != "CUSTOMER" or customer.status != "ACTIVE":
        raise ServiceError(403, "ACCOUNT_DISABLED", "Tài khoản khách không hoạt động.")
    wallet = session.scalar(
        select(Wallet).where(Wallet.user_id == customer_id).with_for_update()
    )
    if wallet is None:
        raise ServiceError(404, "NOT_FOUND", "Ví không tồn tại.")
    return customer, wallet


def _check_customer_documents(session: Session, customer_id: int, now: datetime) -> None:
    local_today = now.astimezone(LOCAL_TZ).date()
    documents = session.scalars(
        select(UserDocument).where(
            UserDocument.user_id == customer_id,
            UserDocument.document_type == "CCCD",
            UserDocument.verified_status == "VERIFIED",
            UserDocument.revoked_at.is_(None),
        ).order_by(UserDocument.verified_at.desc(), UserDocument.id.desc())
    ).all()
    for document in documents:
        birth = document.verified_birth_date
        expiry = document.expires_on
        if birth is None or expiry is None or expiry < local_today:
            continue
        age = local_today.year - birth.year - (
            (local_today.month, local_today.day) < (birth.month, birth.day)
        )
        if age >= 16:
            return
    raise ServiceError(
        409, "VERIFIED_CCCD_REQUIRED", "Cần CCCD đã xác minh, còn hạn và đủ điều kiện tuổi."
    )


def _set_reserved_vehicle_after_expiry(
    session: Session, vehicle: Vehicle, expired_rental: Rental
) -> None:
    if vehicle.status != "RESERVED":
        return
    other_live = session.scalar(
        select(Rental.id).where(
            Rental.vehicle_id == vehicle.id,
            Rental.id != expired_rental.id,
            Rental.status.in_(ACTIVE_RENTAL_STATUSES),
        ).limit(1)
    )
    if other_live is not None:
        return
    active_maintenance = session.scalar(
        select(MaintenanceOrder.id).where(
            MaintenanceOrder.vehicle_id == vehicle.id,
            MaintenanceOrder.status.in_(("OPEN", "IN_PROGRESS")),
        ).limit(1)
    )
    vehicle.status = "MAINTENANCE" if active_maintenance is not None else "AVAILABLE"


def _lock_reservation_candidates(
    session: Session, *, candidates: list[Rental], selected_vehicle_id: int
) -> tuple[dict[int, Vehicle], list[Rental]]:
    if not candidates:
        vehicles = session.scalars(
            select(Vehicle)
            .where(Vehicle.id == selected_vehicle_id)
            .with_for_update()
        ).all()
        return {vehicle.id: vehicle for vehicle in vehicles}, []
    candidate_vehicle_ids = sorted(
        {row.vehicle_id for row in candidates} | {selected_vehicle_id}
    )
    vehicles = session.scalars(
        select(Vehicle)
        .where(Vehicle.id.in_(candidate_vehicle_ids))
        .order_by(Vehicle.id)
        .with_for_update()
    ).all()
    vehicle_by_id = {vehicle.id: vehicle for vehicle in vehicles}
    rentals = session.scalars(
        select(Rental)
        .where(Rental.id.in_([row.id for row in candidates]))
        .order_by(Rental.id)
        .with_for_update()
    ).all()
    return vehicle_by_id, rentals


def _reservation_candidates(
    session: Session, *, customer_id: int, selected_vehicle_id: int
) -> list[Rental]:
    return session.scalars(
        select(Rental)
        .where(
            Rental.status == "RESERVED",
            or_(
                Rental.customer_id == customer_id,
                Rental.vehicle_id == selected_vehicle_id,
            ),
        )
        .order_by(Rental.id)
    ).all()


def _expire_locked_reservations(
    session: Session,
    *,
    vehicles: dict[int, Vehicle],
    rentals: list[Rental],
    now: datetime,
) -> None:
    for rental in rentals:
        if rental.status == "RESERVED" and rental.expires_at <= now:
            rental.status = "EXPIRED"
            vehicle = vehicles.get(rental.vehicle_id)
            if vehicle is not None:
                _set_reserved_vehicle_after_expiry(session, vehicle, rental)


def _daily_cancellations(session: Session, customer_id: int, now: datetime) -> int:
    local_day = now.astimezone(LOCAL_TZ).date()
    day_start = datetime.combine(local_day, time.min, tzinfo=LOCAL_TZ).astimezone(timezone.utc)
    day_end = datetime.combine(local_day + timedelta(days=1), time.min, tzinfo=LOCAL_TZ).astimezone(timezone.utc)
    return session.scalar(
        select(func.count()).select_from(Rental).where(
            Rental.customer_id == customer_id,
            or_(
                (Rental.status == "CANCELLED")
                & (Rental.cancelled_at >= day_start)
                & (Rental.cancelled_at < day_end),
                (Rental.status == "EXPIRED")
                & (Rental.expires_at >= day_start)
                & (Rental.expires_at < day_end),
            ),
            Rental.cancellation_limit_exempt.is_(False),
        )
    ) or 0


def create_rental(
    session: Session, *, customer_id: int, vehicle_id: int, pickup_station_id: int
) -> Rental:
    station = _lock_station(session, pickup_station_id)
    candidates = _reservation_candidates(
        session, customer_id=customer_id, selected_vehicle_id=vehicle_id
    )
    candidate_customer_ids = sorted(
        {row.customer_id for row in candidates} | {customer_id}
    )
    customers = session.scalars(
        select(User)
        .where(User.id.in_(candidate_customer_ids))
        .order_by(User.id)
        .with_for_update()
    ).all()
    customer_by_id = {row.id: row for row in customers}
    customer = customer_by_id.get(customer_id)
    if customer is None or customer.role != "CUSTOMER" or customer.status != "ACTIVE":
        raise ServiceError(403, "ACCOUNT_DISABLED", "Tài khoản khách không hoạt động.")
    refreshed_candidates = _reservation_candidates(
        session, customer_id=customer_id, selected_vehicle_id=vehicle_id
    )
    if any(row.customer_id not in customer_by_id for row in refreshed_candidates):
        raise ServiceError(
            409,
            "CONCURRENT_STATE_CHANGED",
            "Dữ liệu giữ xe vừa thay đổi; hãy thử lại cùng Idempotency-Key.",
        )
    candidates = refreshed_candidates
    wallet = session.scalar(
        select(Wallet).where(Wallet.user_id == customer_id).with_for_update()
    )
    if wallet is None:
        raise ServiceError(404, "NOT_FOUND", "Ví không tồn tại.")
    vehicles, locked_rentals = _lock_reservation_candidates(
        session, candidates=candidates, selected_vehicle_id=vehicle_id
    )
    now = _clock(session)
    if not fleet_service.station_is_open(station, now):
        raise ServiceError(409, "STATION_UNAVAILABLE", "Trạm đã đóng.")
    _expire_locked_reservations(
        session, vehicles=vehicles, rentals=locked_rentals, now=now
    )
    vehicle = vehicles.get(vehicle_id)
    if vehicle is None:
        raise ServiceError(404, "NOT_FOUND", "Xe không tồn tại.")
    _check_customer_documents(session, customer_id, now)
    if _daily_cancellations(session, customer_id, now) >= 3:
        raise ServiceError(
            409,
            "DAILY_CANCELLATION_LIMIT_REACHED",
            "Đã đạt giới hạn hủy/hết hạn giữ xe trong ngày.",
        )
    active_customer_rental = session.scalar(
        select(Rental.id).where(
            Rental.customer_id == customer_id,
            Rental.status.in_(ACTIVE_RENTAL_STATUSES),
        ).limit(1)
    )
    if active_customer_rental is not None:
        raise ServiceError(409, "ACTIVE_RENTAL_EXISTS", "Khách đang có lượt thuê chưa giải quyết.")
    if (
        vehicle.status != "AVAILABLE"
        or vehicle.current_station_id != station.id
        or vehicle.battery_percent < MIN_BATTERY_PERCENT
    ):
        raise ServiceError(409, "VEHICLE_UNAVAILABLE", "Xe không đủ điều kiện giữ.")
    if fleet_service.count_free_slots(session, station.id) < 0:
        raise ServiceError(409, "STATION_CAPACITY_INCONSISTENT", "Sức chứa trạm không hợp lệ.")
    active_maintenance = session.scalar(
        select(MaintenanceOrder.id).where(
            MaintenanceOrder.vehicle_id == vehicle.id,
            MaintenanceOrder.status.in_(("OPEN", "IN_PROGRESS")),
        ).limit(1)
    )
    if active_maintenance is not None:
        raise ServiceError(409, "VEHICLE_UNAVAILABLE", "Xe đang bị chặn bởi bảo trì.")
    if wallet.status != "ACTIVE":
        raise ServiceError(409, "WALLET_UNAVAILABLE", "Ví không ở trạng thái ACTIVE.")
    required_balance = vehicle.deposit_amount + vehicle.first_30_minutes_price
    if wallet.balance < required_balance:
        raise ServiceError(409, "INSUFFICIENT_BALANCE", "Số dư không đủ cọc và block thuê đầu.")

    rental = Rental(
        customer_id=customer.id,
        vehicle_id=vehicle.id,
        pickup_station_id=station.id,
        created_at=now,
        expires_at=now + HOLD_DURATION,
        status="RESERVED",
        deposit_held=Decimal("0.00"),
    )
    session.add(rental)
    vehicle.status = "RESERVED"
    session.flush()
    snapshot = RentalPricingSnapshot(
        rental_id=rental.id,
        vehicle_name=vehicle.name,
        vehicle_model_snapshot=vehicle.model,
        first_30_minutes_price_snapshot=vehicle.first_30_minutes_price,
        extra_minute_price_snapshot=vehicle.extra_minute_price,
        deposit_amount_snapshot=vehicle.deposit_amount,
        pricing_policy_version=PRICING_POLICY_VERSION,
        billing_unit=BILLING_UNIT,
        pricing_policy_snapshot={
            "pricing_policy_version": PRICING_POLICY_VERSION,
            "billing_unit": BILLING_UNIT,
            "first_block_seconds": 1800,
            "extra_minute_rounding": "CEIL",
            "currency": "VND",
        },
        discount_amount=Decimal("0.00"),
    )
    session.add(snapshot)
    session.flush()
    return rental


def cancel_rental(
    session: Session, *, rental_id: int, customer_id: int
) -> Rental:
    preliminary = session.get(Rental, rental_id)
    if preliminary is None or preliminary.customer_id != customer_id:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    session.scalar(select(User).where(User.id == customer_id).with_for_update())
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == preliminary.vehicle_id).with_for_update()
    )
    rental = session.scalar(
        select(Rental).where(Rental.id == rental_id).with_for_update()
    )
    if rental is None or rental.customer_id != customer_id:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    if rental.status != "RESERVED":
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Chỉ có thể hủy lượt đang RESERVED.")
    now = _clock(session)
    if rental.expires_at <= now:
        rental.status = "EXPIRED"
    else:
        rental.status = "CANCELLED"
        rental.cancelled_at = now
        rental.cancelled_by = customer_id
        rental.cancellation_reason = "CUSTOMER_CANCELLED"
    if vehicle is not None:
        _set_reserved_vehicle_after_expiry(session, vehicle, rental)
    session.flush()
    return rental


def cancel_operational_rental(
    session: Session,
    *,
    rental_id: int,
    reason: str,
    note: str,
    actor_id: int,
) -> Rental:
    preliminary = session.get(Rental, rental_id)
    if preliminary is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    session.scalar(select(User).where(User.id == preliminary.customer_id).with_for_update())
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == preliminary.vehicle_id).with_for_update()
    )
    rental = session.scalar(
        select(Rental).where(Rental.id == rental_id).with_for_update()
    )
    if rental is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    if rental.status != "RESERVED":
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Chỉ có thể hủy lượt đang RESERVED.")
    now = _clock(session)
    if rental.expires_at <= now:
        rental.status = "EXPIRED"
        rental.cancellation_limit_exempt = False
    else:
        rental.status = "CANCELLED"
        rental.cancelled_at = now
        rental.cancelled_by = actor_id
        rental.cancellation_reason = reason
        rental.cancellation_limit_exempt = True
    if vehicle is not None:
        _set_reserved_vehicle_after_expiry(session, vehicle, rental)
    from app.models import AuditLog

    session.add(
        AuditLog(
            actor_id=actor_id,
            action="RENTAL_OPERATIONAL_CANCELLED",
            resource_type="rental",
            resource_id=str(rental.id),
            before_data={"status": "RESERVED"},
            after_data={
                "status": rental.status,
                "reason": reason,
                "note": note,
                "cancellation_limit_exempt": rental.cancellation_limit_exempt,
            },
        )
    )
    session.flush()
    return rental


def pickup_rental(
    session: Session,
    *,
    rental_id: int,
    station_id: int,
    battery_percent: int,
    note: str | None,
    staff_id: int,
    idempotency_record_id: int,
) -> tuple[Rental, Handover, Wallet]:
    preliminary = session.get(Rental, rental_id)
    if preliminary is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    station = _lock_station(session, station_id)
    _, wallet = _lock_customer_and_wallet(session, preliminary.customer_id)
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == preliminary.vehicle_id).with_for_update()
    )
    rental = session.scalar(
        select(Rental).where(Rental.id == rental_id).with_for_update()
    )
    if rental is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    now = _clock(session)
    if not fleet_service.station_is_open(station, now):
        raise ServiceError(409, "STATION_UNAVAILABLE", "Trạm đã đóng.")
    if rental.status != "RESERVED":
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Lượt thuê không còn RESERVED.")
    if rental.expires_at <= now:
        rental.status = "EXPIRED"
        if vehicle is not None:
            _set_reserved_vehicle_after_expiry(session, vehicle, rental)
        raise ServiceError(409, "RESERVATION_EXPIRED", "Lượt giữ xe đã hết hạn.")
    if (
        vehicle is None
        or vehicle.status != "RESERVED"
        or vehicle.current_station_id != station.id
        or station.id != rental.pickup_station_id
    ):
        raise ServiceError(409, "VEHICLE_UNAVAILABLE", "Xe không ở trạm nhận của lượt thuê.")
    if battery_percent < MIN_BATTERY_PERCENT:
        raise ServiceError(409, "VEHICLE_UNAVAILABLE", "Pin xe dưới ngưỡng cho phép nhận.")
    if wallet.status != "ACTIVE":
        raise ServiceError(409, "WALLET_UNAVAILABLE", "Ví không ở trạng thái ACTIVE.")
    snapshot = session.scalar(
        select(RentalPricingSnapshot).where(
            RentalPricingSnapshot.rental_id == rental.id
        )
    )
    if snapshot is None:
        raise ServiceError(503, "POLICY_NOT_CONFIGURED", "Thiếu snapshot giá của lượt thuê.")
    _check_customer_documents(session, rental.customer_id, now)
    deposit = snapshot.deposit_amount_snapshot
    minimum_fee = snapshot.first_30_minutes_price_snapshot
    if wallet.balance < deposit + minimum_fee:
        raise ServiceError(409, "INSUFFICIENT_BALANCE", "Số dư không đủ cọc và block thuê đầu.")
    handover = Handover(
        rental_id=rental.id,
        staff_id=staff_id,
        kind="PICKUP",
        time=now,
        created_at=now,
        battery_percent=battery_percent,
        note=note,
    )
    if deposit > 0:
        before = wallet.balance
        wallet.balance -= deposit
        wallet.updated_at = now
        transaction = Transaction(
            rental_id=rental.id,
            actor_id=staff_id,
            idempotency_record_id=idempotency_record_id,
            amount=deposit,
            kind="DEPOSIT",
            status="SUCCESS",
        )
        session.add(transaction)
        session.flush()
        session.add(
            WalletTransaction(
                wallet_id=wallet.id,
                rental_id=rental.id,
                transaction_id=transaction.id,
                idempotency_record_id=idempotency_record_id,
                amount=deposit,
                type="RENTAL_DEPOSIT",
                balance_before=before,
                balance_after=wallet.balance,
                status="SUCCESS",
            )
        )
    rental.status = "IN_RENT"
    rental.actual_start_time = now
    rental.deposit_held = deposit
    vehicle.battery_percent = battery_percent
    vehicle.status = "RENTED"
    vehicle.current_station_id = None
    session.add(handover)
    session.flush()
    return rental, handover, wallet


def initiate_return(
    session: Session,
    *,
    rental_id: int,
    return_station_id: int,
    battery_percent: int,
    vehicle_condition: str,
    note: str | None,
    staff_id: int,
) -> tuple[Rental, Handover]:
    preliminary = session.get(Rental, rental_id)
    if preliminary is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    station = _lock_station(
        session,
        return_station_id,
        require_open=preliminary.status != "RETURN_PENDING",
    )
    session.scalar(select(User).where(User.id == preliminary.customer_id).with_for_update())
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == preliminary.vehicle_id).with_for_update()
    )
    rental = session.scalar(
        select(Rental).where(Rental.id == rental_id).with_for_update()
    )
    if rental is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    if rental.status == "RETURN_PENDING":
        if rental.actual_return_station_id == station.id:
            handover = session.scalar(
                select(Handover).where(
                    Handover.rental_id == rental.id, Handover.kind == "RETURN"
                )
            )
            if (
                handover is not None
                and handover.battery_percent == battery_percent
                and handover.vehicle_condition == vehicle_condition
                and handover.note == note
            ):
                return rental, handover
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Thông tin tiếp nhận khác phiên đã lưu.")
    if rental.status != "IN_RENT" or vehicle is None or vehicle.status != "RENTED":
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Lượt thuê không ở trạng thái IN_RENT.")
    if vehicle.current_station_id is not None:
        raise ServiceError(409, "INVALID_VEHICLE_STATE", "Xe đã ở một trạm.")
    if fleet_service.count_free_slots(session, station.id) <= 0:
        raise ServiceError(409, "STATION_FULL", "Trạm trả đã hết chỗ.")
    now = _clock(session)
    if not fleet_service.station_is_open(station, now):
        raise ServiceError(409, "STATION_UNAVAILABLE", "Trạm đã đóng.")
    handover = Handover(
        rental_id=rental.id,
        staff_id=staff_id,
        kind="RETURN",
        time=now,
        created_at=now,
        battery_percent=battery_percent,
        vehicle_condition=vehicle_condition,
        note=note,
    )
    rental.status = "RETURN_PENDING"
    rental.return_initiated_at = now
    rental.actual_end_time = now
    rental.actual_return_station_id = station.id
    vehicle.current_station_id = station.id
    vehicle.battery_percent = battery_percent
    vehicle.status = "RETURN_PENDING"
    session.add(handover)
    session.flush()
    return rental, handover


def _quote_financials(
    *,
    rental: Rental,
    snapshot: RentalPricingSnapshot,
    return_time: datetime,
    promotion: Promotion | None,
    promotion_now: datetime,
) -> dict:
    if rental.actual_start_time is None or return_time < rental.actual_start_time:
        raise ServiceError(409, "INVALID_RENTAL_TIME", "Thời gian trả trước thời gian nhận.")
    elapsed_delta = return_time - rental.actual_start_time
    elapsed_microseconds = (
        (elapsed_delta.days * 86400 + elapsed_delta.seconds) * 1_000_000
        + elapsed_delta.microseconds
    )
    elapsed = (elapsed_microseconds + 999_999) // 1_000_000
    extra_microseconds = max(elapsed_microseconds - 1_800_000_000, 0)
    extra_minutes = (extra_microseconds + 59_999_999) // 60_000_000
    fee = (
        snapshot.first_30_minutes_price_snapshot
        + Decimal(extra_minutes) * snapshot.extra_minute_price_snapshot
    ).quantize(CENT, rounding=ROUND_HALF_UP)
    discount = Decimal("0.00")
    if promotion is not None:
        try:
            discount = calculate_promotion_discount(
                promotion,
                rental_amount=fee,
                vehicle_model=snapshot.vehicle_model_snapshot,
                now=promotion_now,
            )
        except PromotionNotApplicable as error:
            raise ServiceError(409, error.code, str(error)) from error
    total = max(Decimal("0.00"), fee - discount).quantize(
        WHOLE_DONG, rounding=ROUND_HALF_UP
    ).quantize(CENT)
    deposit = rental.deposit_held
    applied = min(deposit, total)
    additional = max(Decimal("0.00"), total - applied)
    refund = max(Decimal("0.00"), deposit - applied)
    return {
        "elapsed_seconds": elapsed,
        "rental_fee": fee,
        "discount_amount": discount,
        "total_amount": total,
        "deposit_held": deposit,
        "deposit_applied": applied,
        "additional_payment": additional,
        "deposit_refund": refund,
    }


def _promotion_for_quote(
    session: Session, *, customer_id: int, code: str | None, now: datetime
) -> tuple[Promotion | None, dict | None]:
    if code is None:
        return None, None
    promotion = session.scalar(
        select(Promotion)
        .where(func.upper(Promotion.code) == code.strip().upper())
        .with_for_update()
    )
    if promotion is None:
        raise ServiceError(409, "PROMOTION_INVALID", "Mã khuyến mãi không tồn tại.")
    claim = session.scalar(
        select(UserPromotion).where(
            UserPromotion.user_id == customer_id,
            UserPromotion.promotion_id == promotion.id,
        )
    )
    if claim is None or claim.is_used:
        raise ServiceError(409, "PROMOTION_INVALID", "Mã chưa được nhận hoặc đã sử dụng.")
    if (
        promotion.status != "ACTIVE"
        or promotion.start_date > now
        or promotion.end_date <= now
    ):
        raise ServiceError(409, "PROMOTION_INVALID", "Mã khuyến mãi không còn hiệu lực.")
    if promotion.usage_limit is not None and promotion.used_count >= promotion.usage_limit:
        raise ServiceError(409, "PROMOTION_EXHAUSTED", "Mã khuyến mãi đã hết lượt.")
    source = {
        "id": str(promotion.id),
        "code": promotion.code,
        "discount_type": promotion.discount_type,
        "discount_value": str(promotion.discount_value),
        "max_discount_amount": (
            str(promotion.max_discount_amount)
            if promotion.max_discount_amount is not None
            else None
        ),
        "min_rental_amount": (
            str(promotion.min_rental_amount)
            if promotion.min_rental_amount is not None
            else None
        ),
        "vehicle_model": promotion.vehicle_model,
        "claim_id": str(claim.id),
    }
    return promotion, source


def create_return_quote(
    session: Session,
    *,
    rental_id: int,
    return_station_id: int,
    promotion_code: str | None,
    actor_id: int,
    is_owner: bool,
) -> tuple[RentalReturnQuote, str]:
    preliminary = session.get(Rental, rental_id)
    if preliminary is None or (is_owner and preliminary.customer_id != actor_id):
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    station = _lock_station(
        session,
        return_station_id,
        require_open=preliminary.status != "RETURN_PENDING",
    )
    session.scalar(select(User).where(User.id == preliminary.customer_id).with_for_update())
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == preliminary.vehicle_id).with_for_update()
    )
    rental = session.scalar(
        select(Rental).where(Rental.id == rental_id).with_for_update()
    )
    if rental is None or vehicle is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    if rental.status not in ("IN_RENT", "RETURN_PENDING"):
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Chưa thể báo giá lượt thuê này.")
    if rental.status == "RETURN_PENDING" and rental.actual_return_station_id != station.id:
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Trạm không khớp nơi tiếp nhận xe.")
    if rental.status == "IN_RENT" and fleet_service.count_free_slots(session, station.id) <= 0:
        raise ServiceError(409, "STATION_FULL", "Trạm trả đã hết chỗ.")
    snapshot = session.scalar(
        select(RentalPricingSnapshot).where(
            RentalPricingSnapshot.rental_id == rental.id
        )
    )
    if snapshot is None or rental.actual_start_time is None:
        raise ServiceError(503, "POLICY_NOT_CONFIGURED", "Thiếu snapshot giá của lượt thuê.")
    now = _clock(session)
    if rental.status == "IN_RENT" and not fleet_service.station_is_open(station, now):
        raise ServiceError(409, "STATION_UNAVAILABLE", "Trạm đang đóng.")
    promotion, promo_source = _promotion_for_quote(
        session,
        customer_id=rental.customer_id,
        code=promotion_code,
        now=now,
    )
    is_estimate = rental.status == "IN_RENT"
    billable_time = now if is_estimate else rental.return_initiated_at
    if billable_time is None:
        raise ServiceError(503, "POLICY_NOT_CONFIGURED", "Thiếu mốc tiếp nhận xe.")
    amounts = _quote_financials(
        rental=rental,
        snapshot=snapshot,
        return_time=billable_time,
        promotion=promotion,
        promotion_now=now,
    )
    token = secrets.token_urlsafe(32)
    source_snapshot = {
        "rental_id": str(rental.id),
        "vehicle_id": str(vehicle.id),
        "return_station_id": str(station.id),
        "pricing_snapshot_id": str(snapshot.id),
        "return_initiated_at": (
            rental.return_initiated_at.isoformat()
            if rental.return_initiated_at is not None
            else None
        ),
        "deposit_held": str(rental.deposit_held),
        "pricing_policy_version": snapshot.pricing_policy_version,
        "promotion": promo_source,
    }
    quote = RentalReturnQuote(
        rental_id=rental.id,
        return_station_id=station.id,
        is_estimate=is_estimate,
        return_initiated_at=rental.return_initiated_at,
        quote_created_at=now,
        quote_expires_at=now + QUOTE_DURATION,
        currency="VND",
        pricing_policy_version=snapshot.pricing_policy_version,
        **amounts,
        promotion_code=promotion.code if promotion else None,
        quote_token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        source_snapshot=source_snapshot,
    )
    session.add(quote)
    session.flush()
    return quote, token


def settle_return(
    session: Session,
    *,
    rental_id: int,
    quote_token: str,
    staff_id: int,
    idempotency_record_id: int,
) -> tuple[Rental, Handover, Invoice, list[Transaction], Wallet]:
    preliminary = session.get(Rental, rental_id)
    if preliminary is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    if preliminary.actual_return_station_id is None:
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Lượt thuê chưa được tiếp nhận.")
    station = _lock_station(
        session, preliminary.actual_return_station_id, require_open=False
    )
    _, wallet = _lock_customer_and_wallet(session, preliminary.customer_id)
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == preliminary.vehicle_id).with_for_update()
    )
    rental = session.scalar(
        select(Rental).where(Rental.id == rental_id).with_for_update()
    )
    if rental is None or vehicle is None:
        raise ServiceError(404, "NOT_FOUND", "Lượt thuê không tồn tại.")
    if rental.status != "RETURN_PENDING":
        raise ServiceError(409, "INVALID_RENTAL_STATE", "Lượt thuê không chờ quyết toán.")
    if vehicle.current_station_id != station.id or vehicle.status != "RETURN_PENDING":
        raise ServiceError(409, "INVALID_VEHICLE_STATE", "Xe không còn ở trạm tiếp nhận.")
    quote_hash = hashlib.sha256(quote_token.encode("utf-8")).hexdigest()
    quote = session.scalar(
        select(RentalReturnQuote)
        .where(
            RentalReturnQuote.rental_id == rental.id,
            RentalReturnQuote.quote_token_hash == quote_hash,
        )
        .with_for_update()
    )
    if quote is None or quote.is_estimate:
        raise ServiceError(409, "STALE_QUOTE", "Báo giá không tồn tại hoặc chưa chốt.")
    now = _clock(session)
    if quote.quote_expires_at <= now:
        raise ServiceError(409, "STALE_QUOTE", "Báo giá đã hết hạn.")
    if (
        quote.return_station_id != station.id
        or quote.return_initiated_at != rental.return_initiated_at
        or quote.source_snapshot.get("pricing_snapshot_id")
        != str(session.scalar(
            select(RentalPricingSnapshot.id).where(
                RentalPricingSnapshot.rental_id == rental.id
            )
        ))
    ):
        raise ServiceError(409, "STALE_QUOTE", "Nguồn báo giá đã thay đổi.")
    if wallet.status != "ACTIVE":
        raise ServiceError(409, "WALLET_UNAVAILABLE", "Ví không ở trạng thái ACTIVE.")
    if wallet.balance < quote.additional_payment:
        raise ServiceError(409, "INSUFFICIENT_BALANCE", "Số dư không đủ thanh toán phần còn thiếu.")

    snapshot = session.scalar(
        select(RentalPricingSnapshot).where(
            RentalPricingSnapshot.rental_id == rental.id
        )
    )
    if snapshot is None:
        raise ServiceError(503, "POLICY_NOT_CONFIGURED", "Thiếu snapshot giá của lượt thuê.")
    if (
        quote.deposit_held != rental.deposit_held
        or quote.source_snapshot.get("deposit_held") != str(rental.deposit_held)
        or quote.pricing_policy_version != snapshot.pricing_policy_version
        or quote.source_snapshot.get("pricing_policy_version")
        != snapshot.pricing_policy_version
    ):
        raise ServiceError(409, "STALE_QUOTE", "Snapshot tiền cọc hoặc chính sách đã thay đổi.")
    promotion = None
    if quote.promotion_code is not None:
        promotion, current_source = _promotion_for_quote(
            session,
            customer_id=rental.customer_id,
            code=quote.promotion_code,
            now=now,
        )
        if current_source != quote.source_snapshot.get("promotion"):
            raise ServiceError(409, "STALE_QUOTE", "Điều kiện khuyến mãi đã thay đổi.")
        if promotion is not None:
            try:
                expected_discount = calculate_promotion_discount(
                    promotion,
                    rental_amount=quote.rental_fee,
                    vehicle_model=snapshot.vehicle_model_snapshot,
                    now=now,
                )
            except PromotionNotApplicable as error:
                raise ServiceError(409, error.code, str(error)) from error
            if expected_discount != quote.discount_amount:
                raise ServiceError(409, "STALE_QUOTE", "Mức giảm không còn khớp báo giá.")
    handover = session.scalar(
        select(Handover).where(
            Handover.rental_id == rental.id,
            Handover.kind == "RETURN",
        ).with_for_update()
    )
    if handover is None:
        raise ServiceError(503, "POLICY_NOT_CONFIGURED", "Thiếu biên bản nhận trả xe.")
    if promotion is not None:
        try:
            actual_discount = consume_promotion(
                session,
                user_id=rental.customer_id,
                promotion_id=promotion.id,
                rental_amount=quote.rental_fee,
                vehicle_model=snapshot.vehicle_model_snapshot,
                now=now,
            )
        except PromotionNotApplicable as error:
            raise ServiceError(409, error.code, str(error)) from error
        if actual_discount != quote.discount_amount:
            raise ServiceError(409, "STALE_QUOTE", "Mức giảm không còn khớp báo giá.")

    invoice = Invoice(
        rental_id=rental.id,
        total_amount=quote.total_amount,
        status="PAID",
    )
    session.add(invoice)
    session.flush()
    transactions: list[Transaction] = []
    deposit_transaction = None
    additional_transaction = None
    refund_transaction = None
    if quote.deposit_applied > 0:
        deposit_transaction = Transaction(
                rental_id=rental.id,
                invoice_id=invoice.id,
                actor_id=staff_id,
                idempotency_record_id=idempotency_record_id,
                amount=quote.deposit_applied,
                kind="PAYMENT",
                status="SUCCESS",
            )
        transactions.append(deposit_transaction)
    if quote.additional_payment > 0:
        additional_transaction = Transaction(
                rental_id=rental.id,
                invoice_id=invoice.id,
                actor_id=staff_id,
                idempotency_record_id=idempotency_record_id,
                amount=quote.additional_payment,
                kind="PAYMENT",
                status="SUCCESS",
            )
        transactions.append(additional_transaction)
    if quote.deposit_refund > 0:
        refund_transaction = Transaction(
                rental_id=rental.id,
                invoice_id=invoice.id,
                actor_id=staff_id,
                idempotency_record_id=idempotency_record_id,
                amount=quote.deposit_refund,
                kind="REFUND",
                status="SUCCESS",
            )
        transactions.append(refund_transaction)
    session.add_all(transactions)
    session.flush()

    before = wallet.balance
    wallet.balance = before - quote.additional_payment + quote.deposit_refund
    if wallet.balance < 0:
        raise ServiceError(409, "INSUFFICIENT_BALANCE", "Số dư không đủ thanh toán.")
    wallet.updated_at = now
    if quote.additional_payment > 0:
        if additional_transaction is None:
            raise RuntimeError("Missing additional-payment ledger transaction.")
        session.add(
            WalletTransaction(
                wallet_id=wallet.id,
                rental_id=rental.id,
                transaction_id=additional_transaction.id,
                idempotency_record_id=idempotency_record_id,
                amount=quote.additional_payment,
                type="RENTAL_PAYMENT",
                balance_before=before,
                balance_after=before - quote.additional_payment,
                status="SUCCESS",
            )
        )
        before -= quote.additional_payment
    if quote.deposit_refund > 0:
        if refund_transaction is None:
            raise RuntimeError("Missing deposit-refund ledger transaction.")
        session.add(
            WalletTransaction(
                wallet_id=wallet.id,
                rental_id=rental.id,
                transaction_id=refund_transaction.id,
                idempotency_record_id=idempotency_record_id,
                amount=quote.deposit_refund,
                type="RENTAL_REFUND",
                balance_before=before,
                balance_after=before + quote.deposit_refund,
                status="SUCCESS",
            )
        )
    rental.total_price = quote.total_amount
    rental.deposit_held = Decimal("0.00")
    rental.status = "COMPLETED"
    rental.settled_at = now
    vehicle.status = (
        "MAINTENANCE" if handover.vehicle_condition == "NEEDS_MAINTENANCE" else "AVAILABLE"
    )
    session.flush()
    return rental, handover, invoice, transactions, wallet


def get_rental_snapshot(session: Session, rental: Rental) -> RentalPricingSnapshot | None:
    return session.scalar(
        select(RentalPricingSnapshot).where(
            RentalPricingSnapshot.rental_id == rental.id
        )
    )
