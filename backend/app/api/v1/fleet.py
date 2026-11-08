"""Fleet and station APIs."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.dependencies import get_optional_current_user, require_role
from app.core.responses import make_list_response, make_response
from app.database import get_db
from app.models import (
    MaintenanceOrder,
    Station,
    User,
    Vehicle,
    VehicleMoveAudit,
    VehiclePricingHistory,
)
from app.schemas.fleet import (
    BatteryUpdate,
    PriceCreate,
    StationCreate,
    StationUpdate,
    VehicleCreate,
    VehicleMoveRequest,
    VehicleStatusUpdate,
    VehicleUpdate,
    price_out,
    station_out,
    vehicle_out,
)
from app.services import fleet as fleet_service
from app.services.errors import ServiceError
from app.services.idempotency import (
    begin_idempotent_request,
    complete_idempotent_request,
)

router = APIRouter(tags=["Fleet"])
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _raise_service_error(error: ServiceError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from error


def _commit_idempotent_response(session: Session, record, body: dict, status_code: int):
    encoded = jsonable_encoder(body)
    complete_idempotent_request(
        record, status_code=status_code, response_body=encoded
    )
    session.commit()
    return JSONResponse(status_code=status_code, content=encoded)


def _public_vehicle_query():
    local_time = datetime.now(LOCAL_TZ).time()
    active_maintenance = (
        select(MaintenanceOrder.id)
        .where(
            MaintenanceOrder.vehicle_id == Vehicle.id,
            MaintenanceOrder.status.in_(("OPEN", "IN_PROGRESS")),
        )
        .exists()
    )
    active_station = (
        select(Station.id)
        .where(
            Station.id == Vehicle.current_station_id,
            Station.status == "ACTIVE",
            or_(
                Station.opens_at.is_(None),
                and_(
                    Station.opens_at < Station.closes_at,
                    Station.opens_at <= local_time,
                    Station.closes_at > local_time,
                ),
                and_(
                    Station.opens_at > Station.closes_at,
                    or_(
                        Station.opens_at <= local_time,
                        Station.closes_at > local_time,
                    ),
                ),
            ),
        )
        .exists()
    )
    return select(Vehicle).where(
        Vehicle.status == "AVAILABLE",
        Vehicle.battery_percent >= 30,
        Vehicle.current_station_id.is_not(None),
        active_station,
        ~active_maintenance,
    )


def _station_view(session: Session, station: Station) -> dict:
    occupied, rentable = fleet_service.station_counts(session, station.id)
    if not fleet_service.station_is_open(station):
        rentable = 0
    return station_out(station, occupied=occupied, rentable=rentable)


def _paginate(query, count_query, session, page: int, page_size: int):
    total = session.scalar(count_query) or 0
    items = session.scalars(
        query.offset((page - 1) * page_size).limit(page_size)
    ).all()
    return items, total


@router.get("/stations")
def list_stations(
    q: str | None = None,
    has_available_vehicles: bool | None = None,
    has_return_space: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = select(Station).where(Station.status == "ACTIVE")
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(Station.name.ilike(pattern) | Station.address.ilike(pattern))
    stations = db.scalars(query.order_by(Station.id)).all()
    result = []
    for station in stations:
        occupied, rentable = fleet_service.station_counts(db, station.id)
        if not fleet_service.station_is_open(station):
            rentable = 0
        if (
            has_available_vehicles is not None
            and (rentable > 0) != has_available_vehicles
        ):
            continue
        has_space = station.capacity - occupied > 0 and fleet_service.station_is_open(
            station
        )
        if has_return_space is not None and has_space != has_return_space:
            continue
        result.append(station_out(station, occupied=occupied, rentable=rentable))
    total = len(result)
    start = (page - 1) * page_size
    return make_list_response(
        result[start : start + page_size],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/stations/{station_id}")
def get_station(station_id: int, db: Session = Depends(get_db)):
    station = db.get(Station, station_id)
    if station is None or station.status != "ACTIVE":
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Trạm không tồn tại."})
    return make_response(_station_view(db, station))


@router.get("/stations/{station_id}/vehicles")
def list_station_vehicles(
    station_id: int,
    type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    station = db.get(Station, station_id)
    if station is None or station.status != "ACTIVE":
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Trạm không tồn tại."})
    query = _public_vehicle_query().where(Vehicle.current_station_id == station_id)
    count_query = select(func.count()).select_from(query.subquery())
    if type:
        query = query.where(Vehicle.type == type.upper())
        count_query = select(func.count()).select_from(query.subquery())
    vehicles, total = _paginate(
        query.order_by(Vehicle.id), count_query, db, page, page_size
    )
    return make_list_response(
        [vehicle_out(vehicle) for vehicle in vehicles],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/vehicles")
def list_vehicles(
    station_id: int | None = None,
    type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    query = _public_vehicle_query()
    is_staff = current_user is not None and current_user.role in ("STAFF", "MANAGER")
    if is_staff:
        query = select(Vehicle)
        if status_filter:
            query = query.where(Vehicle.status == status_filter.upper())
    if station_id is not None:
        query = query.where(Vehicle.current_station_id == station_id)
    if type:
        query = query.where(Vehicle.type == type.upper())
    count_query = select(func.count()).select_from(query.subquery())
    vehicles, total = _paginate(
        query.order_by(Vehicle.id), count_query, db, page, page_size
    )
    return make_list_response(
        [vehicle_out(vehicle) for vehicle in vehicles],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/vehicles/{vehicle_id}")
def get_vehicle(
    vehicle_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    vehicle = db.get(Vehicle, vehicle_id)
    is_staff = current_user is not None and current_user.role in ("STAFF", "MANAGER")
    if vehicle is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Xe không tồn tại."})
    if not is_staff:
        public_vehicle = db.scalar(
            _public_vehicle_query().where(Vehicle.id == vehicle_id)
        )
        if public_vehicle is None:
            raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Xe không tồn tại."})
    return make_response(vehicle_out(vehicle))


@router.get("/admin/stations")
def list_admin_stations(
    q: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    query = select(Station)
    count_query = select(func.count()).select_from(Station)
    if status_filter:
        query = query.where(Station.status == status_filter.upper())
        count_query = count_query.where(Station.status == status_filter.upper())
    if q:
        pattern = f"%{q.strip()}%"
        predicate = Station.name.ilike(pattern) | Station.address.ilike(pattern)
        query = query.where(predicate)
        count_query = count_query.where(predicate)
    stations, total = _paginate(
        query.order_by(Station.id), count_query, db, page, page_size
    )
    return make_list_response(
        [_station_view(db, station) for station in stations],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/stations", status_code=status.HTTP_201_CREATED)
def post_station(
    body: StationCreate,
    _current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    station = fleet_service.create_station(db, body.model_dump())
    db.commit()
    db.refresh(station)
    return make_response(_station_view(db, station))


@router.patch("/stations/{station_id}")
def patch_station(
    station_id: int,
    body: StationUpdate,
    _current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        station = fleet_service.update_station(
            db, station_id, body.model_dump(exclude_unset=True)
        )
        db.commit()
        db.refresh(station)
        return make_response(_station_view(db, station))
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.post("/vehicles", status_code=status.HTTP_201_CREATED)
def post_vehicle(
    body: VehicleCreate,
    current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        vehicle = fleet_service.create_vehicle(
            db, body.model_dump(), current_user.id
        )
        db.commit()
        db.refresh(vehicle)
        return make_response(vehicle_out(vehicle))
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.patch("/vehicles/{vehicle_id}")
def patch_vehicle(
    vehicle_id: int,
    body: VehicleUpdate,
    _current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        vehicle = fleet_service.update_vehicle(
            db, vehicle_id, body.model_dump(exclude_unset=True)
        )
        db.commit()
        db.refresh(vehicle)
        return make_response(vehicle_out(vehicle))
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.patch("/vehicles/{vehicle_id}/battery")
def patch_vehicle_battery(
    vehicle_id: int,
    body: BatteryUpdate,
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        vehicle = fleet_service.set_vehicle_battery(
            db, vehicle_id, body.battery_percent, body.note, current_user.id
        )
        db.commit()
        db.refresh(vehicle)
        return make_response(vehicle_out(vehicle))
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.post("/vehicles/{vehicle_id}/status")
def post_vehicle_status(
    vehicle_id: int,
    body: VehicleStatusUpdate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path=f"/api/v1/vehicles/{vehicle_id}/status",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        vehicle = fleet_service.set_vehicle_status(
            db, vehicle_id, body.status, body.note, current_user.id
        )
        db.refresh(vehicle)
        return _commit_idempotent_response(
            db, record, make_response(vehicle_out(vehicle)), 200
        )
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.post("/vehicles/{vehicle_id}/move")
def post_vehicle_move(
    vehicle_id: int,
    body: VehicleMoveRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path=f"/api/v1/vehicles/{vehicle_id}/move",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        vehicle = fleet_service.move_vehicle(
            db,
            vehicle_id,
            body.target_station_id,
            body.note,
            current_user.id,
            record.id,
        )
        db.refresh(vehicle)
        return _commit_idempotent_response(
            db, record, make_response(vehicle_out(vehicle)), 200
        )
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)


@router.get("/vehicles/{vehicle_id}/move-history")
def list_move_history(
    vehicle_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    if db.get(Vehicle, vehicle_id) is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Xe không tồn tại."})
    query = select(VehicleMoveAudit).where(VehicleMoveAudit.vehicle_id == vehicle_id)
    count_query = select(func.count()).select_from(VehicleMoveAudit).where(
        VehicleMoveAudit.vehicle_id == vehicle_id
    )
    records, total = _paginate(
        query.order_by(VehicleMoveAudit.moved_at.desc(), VehicleMoveAudit.id.desc()),
        count_query,
        db,
        page,
        page_size,
    )
    data = [
        {
            "id": str(row.id),
            "vehicle_id": str(row.vehicle_id),
            "from_station_id": str(row.from_station_id),
            "to_station_id": str(row.to_station_id),
            "actor_id": str(row.actor_id),
            "note": row.note,
            "moved_at": row.moved_at,
        }
        for row in records
    ]
    return make_list_response(data, page=page, page_size=page_size, total=total)


@router.get("/prices")
def list_prices(
    vehicle_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    query = select(VehiclePricingHistory)
    if vehicle_id is not None:
        query = query.where(VehiclePricingHistory.vehicle_id == vehicle_id)
        count_query = select(func.count()).select_from(VehiclePricingHistory).where(
            VehiclePricingHistory.vehicle_id == vehicle_id
        )
        order = (VehiclePricingHistory.version_number.desc(), VehiclePricingHistory.id.desc())
    else:
        latest = (
            select(
                VehiclePricingHistory.vehicle_id,
                func.max(VehiclePricingHistory.version_number).label("version_number"),
            )
            .group_by(VehiclePricingHistory.vehicle_id)
            .subquery()
        )
        query = query.join(
            latest,
            (latest.c.vehicle_id == VehiclePricingHistory.vehicle_id)
            & (latest.c.version_number == VehiclePricingHistory.version_number),
        )
        count_query = select(func.count()).select_from(latest)
        order = (VehiclePricingHistory.vehicle_id.asc(),)
    rows, total = _paginate(query.order_by(*order), count_query, db, page, page_size)
    return make_list_response(
        [price_out(row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/prices/{price_id}")
def get_price(
    price_id: int,
    _current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    row = db.get(VehiclePricingHistory, price_id)
    if row is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Phiên bản giá không tồn tại."})
    return make_response(price_out(row))


@router.post("/prices", status_code=status.HTTP_201_CREATED)
def post_price(
    body: PriceCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(require_role("MANAGER")),
    db: Session = Depends(get_db),
):
    try:
        record, replay = begin_idempotent_request(
            db,
            actor_id=current_user.id,
            method="POST",
            path="/api/v1/prices",
            key=idempotency_key,
            payload=body.model_dump(mode="json"),
        )
        if replay is not None:
            return JSONResponse(status_code=replay[0], content=replay[1])
        row = fleet_service.create_price_version(
            db,
            body.vehicle_id,
            {
                "first_30_minutes_price": body.first_30_minutes_price,
                "extra_minute_price": body.extra_minute_price,
                "deposit_amount": body.deposit_amount,
            },
            current_user.id,
        )
        db.refresh(row)
        return _commit_idempotent_response(
            db, record, make_response(price_out(row), status_code=201), 201
        )
    except ServiceError as error:
        db.rollback()
        _raise_service_error(error)
