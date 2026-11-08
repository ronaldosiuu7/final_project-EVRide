"""Request and response schemas for stations, vehicles, and pricing."""

from __future__ import annotations

from datetime import time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StationCreate(StrictRequest):
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(min_length=1)
    latitude: Decimal = Field(ge=-90, le=90)
    longitude: Decimal = Field(ge=-180, le=180)
    capacity: int = Field(gt=0)
    opens_at: time | None = None
    closes_at: time | None = None

    @field_validator("name", "address")
    @classmethod
    def trim_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Không được để trống.")
        return value

    @model_validator(mode="after")
    def validate_hours_pair(self):
        if (self.opens_at is None) != (self.closes_at is None):
            raise ValueError("Giờ mở và giờ đóng phải cùng có hoặc cùng null.")
        if self.opens_at == self.closes_at and self.opens_at is not None:
            raise ValueError("Giờ mở và giờ đóng không được giống nhau.")
        return self


class StationUpdate(StrictRequest):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    address: str | None = Field(default=None, min_length=1)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    capacity: int | None = Field(default=None, gt=0)
    opens_at: time | None = None
    closes_at: time | None = None
    status: Literal["ACTIVE", "INACTIVE"] | None = None

    @field_validator("name", "address", mode="before")
    @classmethod
    def trim_optional_text(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("Giá trị phải là chuỗi.")
        value = value.strip()
        if not value:
            raise ValueError("Không được để trống.")
        return value

    @model_validator(mode="after")
    def validate_hours_pair(self):
        values = self.model_fields_set
        if ("opens_at" in values) != ("closes_at" in values):
            raise ValueError("Cập nhật giờ mở/đóng cần gửi cả hai trường.")
        if self.opens_at == self.closes_at and self.opens_at is not None:
            raise ValueError("Giờ mở và giờ đóng không được giống nhau.")
        return self


class VehicleCreate(StrictRequest):
    current_station_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    battery_percent: int = Field(ge=0, le=100)
    first_30_minutes_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    extra_minute_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    deposit_amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)

    @field_validator(
        "current_station_id", mode="before", json_schema_input_type=str
    )
    @classmethod
    def require_id_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("ID phải được gửi dưới dạng chuỗi.")
        return value

    @field_validator("name", "model")
    @classmethod
    def trim_vehicle_values(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Không được để trống.")
        return value

    @field_validator(
        "first_30_minutes_price",
        "extra_minute_price",
        "deposit_amount",
        mode="before",
        json_schema_input_type=str,
    )
    @classmethod
    def require_money_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("Giá tiền phải được gửi dưới dạng chuỗi.")
        return value


class VehicleUpdate(StrictRequest):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    model: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("name", "model", mode="before")
    @classmethod
    def trim_optional_text(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("Giá trị phải là chuỗi.")
        value = value.strip()
        if not value:
            raise ValueError("Không được để trống.")
        return value


class BatteryUpdate(StrictRequest):
    battery_percent: int = Field(ge=0, le=100)
    note: str = Field(min_length=1, max_length=2000)


class VehicleStatusUpdate(StrictRequest):
    status: Literal["AVAILABLE", "MAINTENANCE"]
    note: str = Field(min_length=1, max_length=2000)


class VehicleMoveRequest(StrictRequest):
    target_station_id: int = Field(gt=0)
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("target_station_id", mode="before", json_schema_input_type=str)
    @classmethod
    def require_id_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("ID phải được gửi dưới dạng chuỗi.")
        return value


class PriceCreate(StrictRequest):
    vehicle_id: int = Field(gt=0)
    first_30_minutes_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    extra_minute_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    deposit_amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)

    @field_validator("vehicle_id", mode="before", json_schema_input_type=str)
    @classmethod
    def require_id_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("ID phải được gửi dưới dạng chuỗi.")
        return value

    @field_validator(
        "first_30_minutes_price",
        "extra_minute_price",
        "deposit_amount",
        mode="before",
        json_schema_input_type=str,
    )
    @classmethod
    def require_money_string(cls, value):
        if not isinstance(value, str):
            raise ValueError("Giá tiền phải được gửi dưới dạng chuỗi.")
        return value


def station_out(station, *, occupied: int, rentable: int) -> dict:
    return {
        "id": str(station.id),
        "name": station.name,
        "address": station.address,
        "latitude": str(station.latitude),
        "longitude": str(station.longitude),
        "capacity": station.capacity,
        "opens_at": station.opens_at.isoformat() if station.opens_at else None,
        "closes_at": station.closes_at.isoformat() if station.closes_at else None,
        "status": station.status,
        "occupied_spaces": occupied,
        "available_spaces": station.capacity - occupied,
        "rentable_vehicles": rentable,
        "available_vehicle_count": rentable,
    }


def vehicle_out(vehicle) -> dict:
    return {
        "id": str(vehicle.id),
        "current_station_id": (
            str(vehicle.current_station_id) if vehicle.current_station_id else None
        ),
        "name": vehicle.name,
        "model": vehicle.model,
        "battery_percent": vehicle.battery_percent,
        "status": vehicle.status,
        "first_30_minutes_price": f"{vehicle.first_30_minutes_price:.2f}",
        "extra_minute_price": f"{vehicle.extra_minute_price:.2f}",
        "deposit_amount": f"{vehicle.deposit_amount:.2f}",
        "created_at": vehicle.created_at,
    }


def price_out(row) -> dict:
    return {
        "id": str(row.id),
        "vehicle_id": str(row.vehicle_id),
        "version_number": row.version_number,
        "old_first_30_minutes_price": (
            f"{row.old_first_30_minutes_price:.2f}"
            if row.old_first_30_minutes_price is not None
            else None
        ),
        "new_first_30_minutes_price": f"{row.new_first_30_minutes_price:.2f}",
        "old_extra_minute_price": (
            f"{row.old_extra_minute_price:.2f}"
            if row.old_extra_minute_price is not None
            else None
        ),
        "new_extra_minute_price": f"{row.new_extra_minute_price:.2f}",
        "old_deposit_amount": (
            f"{row.old_deposit_amount:.2f}" if row.old_deposit_amount is not None else None
        ),
        "new_deposit_amount": f"{row.new_deposit_amount:.2f}",
        "changed_by": str(row.changed_by),
        "created_at": row.created_at,
    }
