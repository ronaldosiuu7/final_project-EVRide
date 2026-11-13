# Migrations

Lưu lịch sử thay đổi schema PostgreSQL.

- Alembic được cấu hình tại `backend/alembic.ini`; scripts và revisions nằm trong `alembic/`.
- Chạy lệnh Alembic từ thư mục `backend/`.
- Không chỉnh sửa migration đã được áp dụng trên môi trường dùng chung; tạo migration mới.
- Mô tả cách khôi phục hoặc tác động mất dữ liệu cho các thay đổi có liên quan.
- Revision `888ad91e139e` yêu cầu xử lý tường minh dữ liệu legacy trước khi chạy; migration tự từ chối nếu phát hiện giá/ảnh/xác minh giấy tờ không thể chuyển đổi an toàn.
- Tạo revision mới bằng `python -m alembic revision --autogenerate -m "description"` rồi review và chạy thử trước khi áp dụng; không chạy `upgrade head` ngoài môi trường đã được xác nhận.

## Lịch sử revision sự cố và kiểm tra 24 giờ

Head hiện tại trong mã nguồn: `f4c2a1b8e901` (cha `e8a412c9f603`, trước đó là `de606e75dbc8`).
Trước khi chạy migration trên môi trường bất kỳ, chạy `python -m alembic heads` và `python -m alembic current` từ `backend/`.

Các thay đổi trong `e8a412c9f603` và `f4c2a1b8e901` (xem chi tiết tại [docs/database.md](../../../docs/database.md)):

- Bảng `rental_incidents`, trạng thái `INCIDENT_PENDING` / `CLOSED_INCIDENT`, tách điều kiện chặn khách (`uq_active_customer_rental`) và quyền sử dụng xe (`uq_active_vehicle_rental` dựa trên `vehicle_released_at`).
- Cột `rentals.next_check_at` + partial index `ix_rentals_in_rent_check` phục vụ danh sách kiểm tra 24 giờ (`/rental-check-ins`).
- Cột `maintenance_orders.incident_id` + index `ix_maintenance_orders_incident` để dùng chung luồng bảo trì cho xe sự cố.
- Bỏ ràng buộc bắt buộc `assigned_to` trên `rental_incidents`, giữ tương thích dữ liệu lịch sử.

Không sửa các revision đã áp dụng; luôn kiểm tra trên database thử (`evride_test`) trước khi chạy `alembic upgrade head` trên database chính.
