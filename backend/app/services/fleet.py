"""Transactional business rules for stations, vehicles, and their prices."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AuditLog,
    MaintenanceOrder,
    Rental,
    Station,
    User,
    Vehicle,
    VehicleMoveAudit,
    VehiclePricingHistory,
)
from app.services.errors import ServiceError
from app.services.rental_guards import vehicle_blocking_clause

LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def station_is_open(station: Station, now: datetime | None = None) -> bool:
    if station.status != "ACTIVE":
        return False
    if station.opens_at is None:
        return True
    local_time = (now or datetime.now(timezone.utc)).astimezone(LOCAL_TZ).time()
    if station.opens_at < station.closes_at:
        return station.opens_at <= local_time < station.closes_at
    return local_time >= station.opens_at or local_time < station.closes_at


def station_counts(session: Session, station_id: int) -> tuple[int, int]:
    occupied = session.scalar(
        select(func.count()).select_from(Vehicle).where(
            Vehicle.current_station_id == station_id
        )
    ) or 0
    blocked_vehicle = (
        select(MaintenanceOrder.id)
        .where(
            MaintenanceOrder.vehicle_id == Vehicle.id,
            MaintenanceOrder.status.in_(("OPEN", "IN_PROGRESS")),
        )
        .exists()
    )
    rentable = session.scalar(
        select(func.count()).select_from(Vehicle).where(
            Vehicle.current_station_id == station_id,
            Vehicle.status == "AVAILABLE",
            Vehicle.battery_percent >= 30,
            ~blocked_vehicle,
        )
    ) or 0
    return occupied, rentable


def count_free_slots(session: Session, station_id: int) -> int:
    station = session.scalar(
        select(Station).where(Station.id == station_id).with_for_update()
    )
    if station is None:
        raise ServiceError(404, "NOT_FOUND", "Trạm không tồn tại.")
    occupied, _ = station_counts(session, station_id)
    if occupied > station.capacity:
        raise ServiceError(409, "STATION_CAPACITY_INCONSISTENT", "Sức chứa trạm đã vượt giới hạn.")
    return station.capacity - occupied


def require_no_active_rental(session: Session, vehicle_id: int) -> None:
    exists = session.scalar(
        select(Rental.id).where(
            Rental.vehicle_id == vehicle_id,
            vehicle_blocking_clause(),
        ).limit(1)
    )
    if exists is not None:
        raise ServiceError(409, "ACTIVE_RENTAL_EXISTS", "Xe đang có lượt thuê/giữ chỗ.")


def create_station(session: Session, payload: dict) -> Station:
    station = Station(**payload, status="ACTIVE")
    session.add(station)
    session.flush()
    return station


def update_station(session: Session, station_id: int, payload: dict) -> Station:
    station = session.scalar(
        select(Station).where(Station.id == station_id).with_for_update()
    )
    if station is None:
        raise ServiceError(404, "NOT_FOUND", "Trạm không tồn tại.")
    values = dict(payload)
    if "capacity" in values:
        occupied = session.scalar(
            select(func.count()).select_from(Vehicle).where(
                Vehicle.current_station_id == station_id
            )
        ) or 0
        if values["capacity"] < occupied:
            raise ServiceError(409, "STATION_FULL", "Không thể giảm sức chứa dưới số xe đang ở trạm.")
    if values.get("status") == "INACTIVE":
        occupied_or_reserved = session.scalar(
            select(func.count()).select_from(Vehicle).where(
                Vehicle.current_station_id == station_id
            )
        ) or 0
        held = session.scalar(
            select(func.count()).select_from(Rental).where(
                Rental.pickup_station_id == station_id,
                Rental.status == "RESERVED",
            )
        ) or 0
        if occupied_or_reserved or held:
            raise ServiceError(
                409, "STATION_NOT_EMPTY", "Không thể ngừng trạm còn xe hoặc lượt giữ chỗ."
            )
    for key, value in values.items():
        setattr(station, key, value)
    session.flush()
    return station


def create_vehicle(session: Session, payload: dict, actor_id: int) -> Vehicle:
    station = session.scalar(
        select(Station)
        .where(Station.id == payload["current_station_id"])
        .with_for_update()
    )
    if station is None or not station_is_open(station):
        raise ServiceError(409, "STATION_UNAVAILABLE", "Trạm không tồn tại hoặc đang đóng.")
    if count_free_slots(session, station.id) <= 0:
        raise ServiceError(409, "STATION_FULL", "Trạm đã hết chỗ.")
    vehicle = Vehicle(**payload, status="AVAILABLE")
    session.add(vehicle)
    session.flush()
    session.add(
        VehiclePricingHistory(
            vehicle_id=vehicle.id,
            changed_by=actor_id,
            version_number=1,
            old_first_30_minutes_price=None,
            new_first_30_minutes_price=vehicle.first_30_minutes_price,
            old_extra_minute_price=None,
            new_extra_minute_price=vehicle.extra_minute_price,
            old_deposit_amount=None,
            new_deposit_amount=vehicle.deposit_amount,
        )
    )
    session.flush()
    return vehicle


def update_vehicle(session: Session, vehicle_id: int, payload: dict) -> Vehicle:
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update()
    )
    if vehicle is None:
        raise ServiceError(404, "NOT_FOUND", "Xe không tồn tại.")
    if vehicle.status in ("STOLEN", "SUSPECTED_STOLEN"):
        raise ServiceError(409, "INVALID_VEHICLE_STATE", "Không thể sửa xe đang báo mất.")
    if payload.get("model") and payload["model"].casefold() != vehicle.model.casefold():
        require_no_active_rental(session, vehicle_id)
    for key, value in payload.items():
        setattr(vehicle, key, value)
    session.flush()
    return vehicle


def set_vehicle_battery(
    session: Session, vehicle_id: int, battery_percent: int, note: str, actor_id: int
) -> Vehicle:
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update()
    )
    if vehicle is None:
        raise ServiceError(404, "NOT_FOUND", "Xe không tồn tại.")
    if vehicle.status in ("STOLEN", "SUSPECTED_STOLEN"):
        raise ServiceError(409, "INVALID_VEHICLE_STATE", "Không thể cập nhật pin xe đang báo mất.")
    before = {"battery_percent": vehicle.battery_percent}
    vehicle.battery_percent = battery_percent
    session.add(
        AuditLog(
            actor_id=actor_id,
            action="VEHICLE_BATTERY_UPDATED",
            resource_type="vehicle",
            resource_id=str(vehicle.id),
            before_data=before,
            after_data={"battery_percent": battery_percent, "note": note},
        )
    )
    session.flush()
    return vehicle


def set_vehicle_status(
    session: Session, vehicle_id: int, target_status: str, note: str, actor_id: int
) -> Vehicle:
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update()
    )
    if vehicle is None:
        raise ServiceError(404, "NOT_FOUND", "Xe không tồn tại.")
    if (
        vehicle.status == "MAINTENANCE"
        and target_status == "AVAILABLE"
    ):
        actor = session.get(User, actor_id)

        if (
            actor is None
            or actor.role != "MANAGER"
            or actor.status != "ACTIVE"
        ):
            raise ServiceError(
                403,
                "FORBIDDEN",
                "Chỉ MANAGER được mở lại xe sau bảo trì.",
            )
    if target_status == vehicle.status:
        return vehicle
    if target_status not in ("AVAILABLE", "MAINTENANCE"):
        raise ServiceError(422, "INVALID_REQUEST", "Trạng thái đích không hợp lệ.")
    if vehicle.current_station_id is None:
        raise ServiceError(409, "INVALID_VEHICLE_STATE", "Xe phải đang ở trạm.")
    require_no_active_rental(session, vehicle.id)
    if target_status == "AVAILABLE":
        active_order = session.scalar(
            select(MaintenanceOrder.id).where(
                MaintenanceOrder.vehicle_id == vehicle.id,
                MaintenanceOrder.status.in_(("OPEN", "IN_PROGRESS")),
            ).limit(1)
        )
        if active_order is not None:
            raise ServiceError(409, "ACTIVE_MAINTENANCE_ORDER", "Xe còn phiếu bảo trì đang xử lý.")
    before = {"status": vehicle.status}
    vehicle.status = target_status
    session.add(
        AuditLog(
            actor_id=actor_id,
            action="VEHICLE_STATUS_UPDATED",
            resource_type="vehicle",
            resource_id=str(vehicle.id),
            before_data=before,
            after_data={"status": target_status, "note": note},
        )
    )
    session.flush()
    return vehicle


def move_vehicle(
    session: Session,
    vehicle_id: int,
    target_station_id: int,
    note: str | None,
    actor_id: int,
    idempotency_record_id: int | None = None,
) -> Vehicle:
    preliminary = session.get(Vehicle, vehicle_id)
    if preliminary is None:
        raise ServiceError(404, "NOT_FOUND", "Xe không tồn tại.")
    if preliminary.current_station_id is None:
        raise ServiceError(409, "INVALID_VEHICLE_STATE", "Xe hiện không ở trạm.")
    source_id = preliminary.current_station_id
    if source_id == target_station_id:
        raise ServiceError(422, "INVALID_REQUEST", "Trạm đích phải khác trạm hiện tại.")

    stations = session.scalars(
        select(Station)
        .where(Station.id.in_(sorted((source_id, target_station_id))))
        .order_by(Station.id)
        .with_for_update()
    ).all()
    stations_by_id = {station.id: station for station in stations}
    source = stations_by_id.get(source_id)
    target = stations_by_id.get(target_station_id)
    if source is None or target is None or not station_is_open(target):
        raise ServiceError(409, "STATION_UNAVAILABLE", "Trạm nguồn/đích không khả dụng.")

    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update()
    )
    if vehicle is None or vehicle.current_station_id != source_id:
        raise ServiceError(409, "INVALID_VEHICLE_STATE", "Vị trí xe đã thay đổi, hãy thử lại.")
    if vehicle.status in ("RESERVED", "RENTED", "RETURN_PENDING", "SUSPECTED_STOLEN", "STOLEN"):
        raise ServiceError(409, "INVALID_VEHICLE_STATE", "Không thể điều chuyển xe đang giữ/thuê.")
    require_no_active_rental(session, vehicle.id)
    if count_free_slots(session, target.id) <= 0:
        raise ServiceError(409, "STATION_FULL", "Trạm đích đã hết chỗ.")

    vehicle.current_station_id = target.id
    audit = VehicleMoveAudit(
        vehicle_id=vehicle.id,
        from_station_id=source.id,
        to_station_id=target.id,
        actor_id=actor_id,
        idempotency_record_id=idempotency_record_id,
        note=note,
    )
    session.add(audit)
    session.flush()
    return vehicle


def create_price_version(
    session: Session, vehicle_id: int, prices: dict, actor_id: int
) -> VehiclePricingHistory:
    vehicle = session.scalar(
        select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update()
    )
    if vehicle is None:
        raise ServiceError(404, "NOT_FOUND", "Xe không tồn tại.")
    last_version = session.scalar(
        select(func.max(VehiclePricingHistory.version_number)).where(
            VehiclePricingHistory.vehicle_id == vehicle.id
        )
    ) or 0
    row = VehiclePricingHistory(
        vehicle_id=vehicle.id,
        changed_by=actor_id,
        version_number=last_version + 1,
        old_first_30_minutes_price=vehicle.first_30_minutes_price,
        new_first_30_minutes_price=prices["first_30_minutes_price"],
        old_extra_minute_price=vehicle.extra_minute_price,
        new_extra_minute_price=prices["extra_minute_price"],
        old_deposit_amount=vehicle.deposit_amount,
        new_deposit_amount=prices["deposit_amount"],
    )
    vehicle.first_30_minutes_price = prices["first_30_minutes_price"]
    vehicle.extra_minute_price = prices["extra_minute_price"]
    vehicle.deposit_amount = prices["deposit_amount"]
    session.add(row)
    session.flush()
    return row
