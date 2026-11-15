"""Quét định kỳ các lượt RESERVED đã quá hạn và giải phóng xe.

Job chỉ giúp dọn sớm; tính đúng vẫn nằm ở lazy expiration trong từng thao tác.
Chạy: python -m app.expire_reservations
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Rental, User, Vehicle
from app.services.rentals import _set_reserved_vehicle_after_expiry

BATCH_SIZE = 200


def expire_due_reservations() -> int:
    # 1. Đọc sơ bộ danh sách ứng viên (không khóa)
    with SessionLocal() as db:
        candidates = db.execute(
            select(Rental.id, Rental.customer_id, Rental.vehicle_id)
            .where(Rental.status == "RESERVED", Rental.expires_at <= func.now())
            .order_by(Rental.id)
            .limit(BATCH_SIZE)
        ).all()

    expired = 0
    # 2. Mỗi lượt một transaction riêng, khóa đúng thứ tự customer → vehicle → rental
    for rental_id, customer_id, vehicle_id in candidates:
        with SessionLocal.begin() as db:
            db.scalar(select(User).where(User.id == customer_id).with_for_update())
            vehicle = db.scalar(
                select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update()
            )
            rental = db.scalar(
                select(Rental).where(Rental.id == rental_id).with_for_update()
            )
            now = db.scalar(select(func.clock_timestamp()))  # giờ thật sau khi chờ khóa
            # 3. Kiểm tra lại sau khóa: request khác có thể đã pickup/hủy
            if rental is None or rental.status != "RESERVED" or rental.expires_at > now:
                continue
            rental.status = "EXPIRED"
            if vehicle is not None:
                _set_reserved_vehicle_after_expiry(db, vehicle, rental)
            expired += 1
    return expired


if __name__ == "__main__":
    print(f"Expired {expire_due_reservations()} reservation(s).")