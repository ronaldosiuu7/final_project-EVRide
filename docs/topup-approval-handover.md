# Bàn giao Frontend: Phê duyệt nạp tiền vào ví (Issue #15 & #16)

Cập nhật: **25/11/2026** (nhánh backend `codex/backend-topup-approval`, migration `d7e4b2c9a105`).

> [!WARNING]
> **Breaking change có chủ đích:** `POST /api/v1/wallets/me/topups` **không còn cộng tiền ngay** và không trả về `{wallet_transaction, wallet, payment_mode}` như trước. Endpoint này hiện tạo yêu cầu nạp ở trạng thái `PENDING` (`201 Created`). Frontend cũ gọi endpoint này và cập nhật số dư ngay sẽ bị sai và cần cập nhật trước khi coi luồng nạp tiền hoàn chỉnh.

## 1. Quy ước và nhãn hiển thị bắt buộc

- Tiền trong V1 vẫn là **Tiền mô phỏng** (`payment_mode: "DEMO"`). Không tích hợp ngân hàng, QR chuyển tiền, webhook hoặc tiền thật; thao tác nhân viên xác nhận **không** được mô tả là "ngân hàng đã xác nhận thanh toán".
- Trạng thái yêu cầu nạp tiền:
  - `PENDING` → **Chờ xác nhận**
  - `APPROVED` → **Đã duyệt**
  - `REJECTED` → **Bị từ chối**
- Khi khách gửi yêu cầu xong: chỉ thông báo **“Đã gửi yêu cầu nạp tiền”** và chờ nhân viên xác nhận. **Không** tự cộng số dư trên UI; chỉ hiển thị số dư mới theo dữ liệu backend (`GET /api/v1/wallets/me`) sau khi yêu cầu được duyệt.
- Tách hai màn hình / danh sách ở Frontend:
  1. **Danh sách yêu cầu nạp tiền** (`GET /api/v1/wallets/me/topups` cho khách; `GET /api/v1/wallet-topup-requests` cho `STAFF`/`MANAGER`).
  2. **Lịch sử giao dịch đã vào/ra ví** (`GET /api/v1/wallets/me/transactions` — chỉ chứa các bút toán đã hoàn tất như `TOPUP SUCCESS`).
- Các giao dịch `TOPUP SUCCESS` lịch sử trước khi áp dụng luồng phê duyệt vẫn hiển thị bình thường trong `/wallets/me/transactions` và không có bản ghi trong `/wallets/me/topups`.

## 2. Danh sách API và quyền

Mọi endpoint dưới đây có tiền tố `/api/v1`. Ghi chú: **K** = bắt buộc header `Idempotency-Key` (16–128 ký tự).

| Method | Endpoint | Quyền | Cần `DEMO_PAYMENTS_ENABLED` | Mục đích |
| --- | --- | --- | --- | --- |
| POST | `/wallets/me/topups` | `CUSTOMER` · K | Có | Tạo yêu cầu nạp `PENDING` (`201`) |
| GET | `/wallets/me/topups` | `CUSTOMER` | Không | Khách xem danh sách yêu cầu nạp của mình (`?status=&page=&page_size=`) |
| GET | `/wallet-topup-requests` | `STAFF` / `MANAGER` | Không | Nhân viên/quản lý xem danh sách (`?status=&customer_id=&page=&page_size=`) |
| GET | `/wallet-topup-requests/{id}` | Chủ yêu cầu / `STAFF` / `MANAGER` | Không | Xem chi tiết yêu cầu (khách khác nhận `404`) |
| POST | `/wallet-topup-requests/{id}/approve` | `STAFF` / `MANAGER` · K | Có | Duyệt yêu cầu `PENDING` -> `APPROVED`, cộng ví và tạo `WalletTransaction` (`200`) |
| POST | `/wallet-topup-requests/{id}/reject` | `STAFF` / `MANAGER` · K | Không | Từ chối yêu cầu `PENDING` -> `REJECTED` kèm `reason`; cho phép dù ví bị khóa (`200`) |

## 3. Request / Response mẫu

### 3.1. Khách gửi yêu cầu nạp (`POST /api/v1/wallets/me/topups`)

Request (`Idempotency-Key` bắt buộc; không truyền thêm field như `status`, `reviewed_by`, `wallet_id`):

```json
{
  "amount": "150000.00"
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": "12",
    "wallet_id": "5",
    "requested_by": "990001",
    "amount": "150000.00",
    "status": "PENDING",
    "payment_mode": "DEMO",
    "created_at": "2026-11-25T10:30:00Z",
    "reviewed_by": null,
    "reviewed_at": null,
    "rejection_reason": null,
    "wallet_transaction_id": null
  },
  "meta": {
    "request_id": "req_0123456789ab",
    "server_time": "2026-11-25T10:30:00Z"
  }
}
```

### 3.2. Nhân viên / Quản lý duyệt (`POST /api/v1/wallet-topup-requests/{id}/approve`)

Request (`Idempotency-Key` bắt buộc; body rỗng `{}` hoặc bỏ trống body, không gửi `amount` hay `status`):

```json
{}
```

Response `200 OK`:

```json
{
  "data": {
    "id": "12",
    "wallet_id": "5",
    "requested_by": "990001",
    "amount": "150000.00",
    "status": "APPROVED",
    "payment_mode": "DEMO",
    "created_at": "2026-11-25T10:30:00Z",
    "reviewed_by": "990006",
    "reviewed_at": "2026-11-25T10:35:00Z",
    "rejection_reason": null,
    "wallet_transaction_id": "88",
    "wallet_transaction": {
      "id": "88",
      "wallet_id": "5",
      "rental_id": null,
      "transaction_id": null,
      "idempotency_record_id": "41",
      "amount": "150000.00",
      "type": "TOPUP",
      "balance_before": "50000.00",
      "balance_after": "200000.00",
      "status": "SUCCESS",
      "created_at": "2026-11-25T10:35:00Z"
    },
    "wallet": {
      "id": "5",
      "user_id": "990001",
      "balance": "200000.00",
      "status": "ACTIVE",
      "created_at": "2026-11-01T00:00:00Z",
      "updated_at": "2026-11-25T10:35:00Z"
    }
  },
  "meta": {
    "request_id": "req_abcdef123456",
    "server_time": "2026-11-25T10:35:00Z"
  }
}
```

### 3.3. Nhân viên / Quản lý từ chối (`POST /api/v1/wallet-topup-requests/{id}/reject`)

Request (`Idempotency-Key` bắt buộc; `reason` bắt buộc khác rỗng, tối đa 2000 ký tự):

```json
{
  "reason": "Chưa xác nhận được yêu cầu nạp demo"
}
```

Response `200 OK`:

```json
{
  "data": {
    "id": "12",
    "wallet_id": "5",
    "requested_by": "990001",
    "amount": "150000.00",
    "status": "REJECTED",
    "payment_mode": "DEMO",
    "created_at": "2026-11-25T10:30:00Z",
    "reviewed_by": "990006",
    "reviewed_at": "2026-11-25T10:36:00Z",
    "rejection_reason": "Chưa xác nhận được yêu cầu nạp demo",
    "wallet_transaction_id": null
  },
  "meta": {
    "request_id": "req_fedcba654321",
    "server_time": "2026-11-25T10:36:00Z"
  }
}
```

## 4. Mã lỗi cần xử lý trên Frontend

| HTTP | `error.code` | Ý nghĩa |
| --- | --- | --- |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Thiếu hoặc sai độ dài `Idempotency-Key` |
| 403 | `FORBIDDEN` / `ACCOUNT_DISABLED` | Sai vai trò hoặc tài khoản người gọi / tài khoản khách khi duyệt không `ACTIVE` |
| 404 | `NOT_FOUND` | Không tìm thấy yêu cầu hoặc khách không có quyền xem |
| 409 | `WALLET_UNAVAILABLE` | Ví khách không ở trạng thái `ACTIVE` (khi tạo hoặc duyệt) |
| 409 | `WALLET_LIMIT_EXCEEDED` | Số dư sau khi duyệt vượt giới hạn `Numeric(12,2)` |
| 409 | `INVALID_STATE_TRANSITION` | Yêu cầu đã `APPROVED` hoặc `REJECTED`, không thể duyệt/từ chối lại |
| 409 | `IDEMPOTENCY_CONFLICT` / `IDEMPOTENCY_IN_PROGRESS` | Trùng key khác payload hoặc request cùng key đang chạy |
| 422 | `VALIDATION_ERROR` | Số tiền sai định dạng/âm/0, thiếu `reason` khi từ chối, hoặc gửi thừa field |
| 503 | `FEATURE_NOT_ENABLED` | `DEMO_PAYMENTS_ENABLED` đang tắt (chỉ chặn tạo và duyệt) |

## 5. Việc cần làm cho Issue #15 và #16 & Tiến độ phiên

- **Issue #15 (Ví khách hàng - Frontend):**
  - Cập nhật form nạp tiền tại `POST /api/v1/wallets/me/topups`: bỏ kỳ vọng `wallet`/`wallet_transaction` tức thì; hiển thị thông báo **“Đã gửi yêu cầu nạp tiền”** (nhãn **Tiền mô phỏng**) và tải lại danh sách yêu cầu nạp.
  - Bổ sung bảng/danh sách **Yêu cầu nạp tiền** (`GET /api/v1/wallets/me/topups`, lọc `PENDING` / `APPROVED` / `REJECTED`) tách biệt với bảng **Lịch sử giao dịch ví** (`GET /api/v1/wallets/me/transactions`).
  - Hiển thị trạng thái tiếng Việt (`Chờ xác nhận`, `Đã duyệt`, `Bị từ chối`) và lý do từ chối (`rejection_reason`) nếu bị từ chối.
- **Issue #16 (Vận hành Staff/Manager - Frontend):**
  - Thêm màn hình/tab **Duyệt yêu cầu nạp tiền** gọi `GET /api/v1/wallet-topup-requests` (mặc định lọc `PENDING`, hỗ trợ lọc theo trạng thái và `customer_id`).
  - Thêm nút **Duyệt** (`POST /wallet-topup-requests/{id}/approve` kèm `Idempotency-Key`) và **Từ chối** (mở modal nhập `reason` bắt buộc -> `POST /wallet-topup-requests/{id}/reject` kèm `Idempotency-Key`); ẩn/vô hiệu hóa nút nếu trạng thái không còn `PENDING`; tải lại danh sách sau khi xử lý hoặc gặp `409`.
- **Tiến độ phiên hiện tại:**
  - [x] ORM & migration `d7e4b2c9a105` (`wallet_topup_requests` + `uq_wallet_transactions_id_wallet`).
  - [x] Service khóa `customer -> wallet -> wallet_topup_requests`, API 6 endpoint, idempotency và audit.
  - [x] Kiểm thử tích hợp + concurrency trên PostgreSQL `evride_test` (`test_wallet_topup_approval.py`, `test_fresh_database_migrations.py`, `test_business_schemas.py`).
  - [x] Đồng bộ tài liệu backend (`api-contract.md`, `v1-decisions.md`, `database.md`, `api.md`, `requirements.md`, `architecture.md`, `ke_hoach_kiem_thu.md`, `backend/README.md`).
  - [ ] Áp dụng `alembic upgrade head` lên `evride_db` khi sẵn sàng và triển khai Frontend cho Issue #15 và #16.
