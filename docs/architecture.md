# Kiến trúc hệ thống EVRide

EVRide là hệ thống cho thuê xe máy điện theo trạm, sử dụng React (Frontend), FastAPI (Backend) và PostgreSQL 16.

```text
Trình duyệt (React)
        |
        | HTTP / JSON (REST API + HttpOnly Refresh Cookie)
        v
API (FastAPI — backend/app/api/v1/)
        |
        | Router -> Service -> SQLAlchemy Session
        v
PostgreSQL 16 (backend/app/models.py, Alembic migrations)
```

Mã nguồn backend hiện tổ chức tại `backend/app/api/v1/`, `backend/app/schemas/`, `backend/app/services/`, `backend/app/core/`, `backend/app/models.py` và `backend/app/database.py`. Chính sách nghiệp vụ đối chiếu tại [v1-decisions.md](v1-decisions.md) và [api-contract.md](api-contract.md).

## 1. Bất biến giao dịch và thứ tự khóa toàn cục (Global Lock Order)

- `app/services/rentals.py` sở hữu vòng đời chuyến thuê thông thường: `reserve`, `lazy expiration`, `cancel`, `pickup`, `initiate-return`, `return-quote` và `settle_return`.
- Mọi thao tác nghiệp vụ tuân thủ thứ tự khóa dòng (`SELECT ... FOR UPDATE`):
  **`station → customer(users) → wallet → vehicle → rental → incident`** (khóa nhiều dòng cùng nhóm theo `id` tăng dần; chỉ khóa các tài nguyên thực sự cần cho thao tác). Sau khi giành khóa phải đọc lại dữ liệu và dùng giờ thực tế của PostgreSQL (`clock_timestamp()`) để xét hạn giữ chỗ/báo giá.
- Mỗi thao tác nguyên tử có một chủ sở hữu transaction. Lỗi trước khi commit sẽ rollback toàn bộ thay đổi của thao tác; tiếp nhận xe trả (`initiate-return`) và quyết toán trả xe (`return`) là hai transaction độc lập theo hợp đồng API.
- Các endpoint ghi có gắn `I` sử dụng chung bảng `idempotency_records`: gửi lại cùng `Idempotency-Key` và cùng request body sẽ replay nguyên HTTP status/payload; cùng key nhưng khác body trả `409 IDEMPOTENCY_CONFLICT`.
- Các service `fleet.py`, `operations.py`, `promotions.py`, `files.py` chỉ sửa tài nguyên thuộc phạm vi của mình; điều chuyển xe ghi `vehicle_move_audits` trong cùng transaction với cập nhật vị trí xe.

## 2. Ranh giới phân hệ sự cố và kiểm tra 24 giờ

- **Danh sách cần kiểm tra 24 giờ (`app/services/rental_check_ins.py`):** Truy vấn trực tiếp các chuyến `IN_RENT` đến lịch kiểm tra (`COALESCE(rentals.next_check_at, rentals.actual_start_time + INTERVAL '24 hours') <= clock_timestamp()`) và chưa có hồ sơ sự cố đang mở. `GET /api/v1/rental-check-ins` chỉ đọc; `POST /api/v1/rental-check-ins/{rental_id}` ghi nhận `CONTINUE_RENTAL`, `NO_ANSWER` (đặt lịch thử lại ở `rentals.next_check_at`), hoặc `ESCALATE` (tạo ticket + mở hồ sơ sự cố nguyên tử trong cùng transaction). Không sử dụng worker quét cảnh báo nền.
- **Điều phối sự cố (`incidents.py`, `incident_recovery.py`, `incident_finance.py`, `incident_completion.py`):**
  - Tiếp nhận (`intake`) mở hồ sơ `rental_incidents` ở trạng thái `INVESTIGATING` (không qua bước phân công `assign` bắt buộc) và chuyển xe sang `SUSPECTED_STOLEN` mentre `rental` giữ `IN_RENT`.
  - Xác minh (`verify` bởi `MANAGER`):
    - `FALSE_ALARM`: hồ sơ chuyển `DISMISSED`; nếu khách tiếp tục thuê thì xe về `RENTED`, `rental` giữ `IN_RENT` và đồng bộ `rentals.next_check_at`.
    - `LOSS_THEFT`: hồ sơ chuyển `CONFIRMED`, cả `rental` và `vehicle` chuyển `STOLEN`, chốt `billing_cutoff_at` theo thời điểm server nhận báo cáo hợp lệ.
    - `ABANDONMENT`: hồ sơ chuyển `CONFIRMED`, `rental` chuyển `INCIDENT_PENDING`, `vehicle` chuyển `SUSPECTED_STOLEN` (hoặc `MAINTENANCE` khi thu hồi); chốt `billing_cutoff_at = recovered_at`.
  - Thu hồi thực địa (`recovery`) và đưa xe về trạm (`arrival`, kèm đánh giá ban đầu `condition`: `INTACT` | `REPAIRABLE` | `UNREPAIRABLE`) là hai sự kiện riêng. Chỉ `arrival` mới khóa trạm, kiểm tra sức chứa và cập nhật `current_station_id`.
  - Bảo trì xe sự cố dùng chung endpoint `POST /api/v1/maintenance-orders` với tham số tùy chọn `incident_id` (`maintenance_orders.incident_id`). Sau khi phiếu bảo trì đạt `COMPLETED`, `MANAGER` gọi `POST /api/v1/rental-incidents/{id}/release-vehicle` để ghi nhận `rentals.vehicle_released_at` và mở xe `AVAILABLE` cho khách mới thuê, độc lập với công nợ của khách cũ.
  - **Tách bạch tiền thuê/cọc và bồi thường ngoài hệ thống:**
    - Tiền thuê quyết toán qua `settle-rent` (dùng `Decimal`/`NUMERIC`, cấn `deposit_held` vào tiền thuê và ghi nhận doanh thu thuê một lần tại `rent_settled_at`); phần cọc dư chỉ dùng để hoàn về ví qua `deposit/refund`.
    - Định giá, thương lượng, tranh chấp và thanh toán/hoàn trả bồi thường diễn ra **ngoài hệ thống**. Backend chỉ ghi nhận kết quả xác nhận cuối cùng qua một endpoint `POST /api/v1/rental-incidents/{id}/compensation/external-settlement`, không tạo giao dịch ví hay thay đổi tiền cọc/doanh thu thuê.
    - Hồ sơ chỉ đóng (`close` -> `rental.status = CLOSED_INCIDENT`, `incident.status = CLOSED`) khi đã `settle-rent`, `deposit_held = 0.00`, và đã ghi nhận kết quả + thanh toán bồi thường ngoài hệ thống (`compensation_assessed_amount` và `compensation_settled_at` khác `NULL`). Thu hồi xe sau khi đã `CLOSED_INCIDENT` chỉ cập nhật thông tin thu hồi trên hồ sơ cũ, không mở lại `rental` hoặc tính lại tiền thuê.

## 3. Xác thực, quản lý phiên và thứ tự khóa Auth

- `app/core/auth_sessions.py` là service duy nhất sở hữu transaction tạo, xoay vòng và thu hồi phiên (`user_sessions`, `refresh_tokens`), đổi mật khẩu và cập nhật trạng thái tài khoản.
- **Thứ tự khóa thao tác Auth:** `users (theo id tăng dần) → user_sessions (theo id tăng dần) → refresh_tokens (theo generation tăng dần)`.
- **Khóa cho `PATCH /api/v1/users/{id}` (`update_account`):** Lấy `pg_advisory_xact_lock(67401, 1)` trước, sau đó khóa `actor` và `target` trong `users` theo `id` tăng dần rồi khóa `user_sessions`, ngăn hai `MANAGER` đồng thời tự khóa/hạ quyền làm mất `MANAGER` hoạt động cuối cùng.
- Dependency `get_current_user` chỉ đọc (`SELECT` với `populate_existing=True`), kiểm tra tài khoản `ACTIVE` và phiên còn hiệu lực, không giữ khóa dòng trước khi đi vào luồng nghiệp vụ.

## 4. Tác vụ nền (Background CLI Tasks)

Backend hiện chỉ duy trì 2 tác vụ CLI chạy định kỳ từ thư mục `backend/`:
1. `python -m app.cleanup_auth`: Xóa `replay_ciphertext` đã qua thời gian grace (15 giây) và dọn các phiên đăng nhập đã kết thúc (`revoked`/`expired`) quá 30 ngày.
2. `python -m app.expire_reservations`: Quét theo lô các lượt `RESERVED` đã quá hạn `expires_at` để chuyển sang `EXPIRED` và giải phóng xe sớm (bổ trợ cho cơ chế Lazy Expiration trong từng request đặt/nhận xe).
