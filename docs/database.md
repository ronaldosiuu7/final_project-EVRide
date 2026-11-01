# EVRide – Hệ thống Quản lý Cho thuê Xe máy Điện theo Trạm
> **Cập nhật thiết kế:** 21/10/2026  
> **Định dạng gốc:** DBML (Database Markup Language) – Dùng để vẽ sơ đồ ERD & tham chiếu thiết kế backend.

---

## 1. TỔNG QUAN VỀ QUY TẮC VẬN HÀNH (BUSINESS RULES)

1. **Giữ chỗ xe:** Khách hàng chỉ được đặt xe đang ở trạng thái `AVAILABLE`. Thời gian giữ chỗ mặc định là **30 phút** (`expires_at = created_at + 30m`). Không hỗ trợ đặt trước nhiều ngày hoặc gia hạn lượt giữ chỗ.
2. **Hết hạn giữ chỗ:** Khi quá thời gian `expires_at`, lượt đặt chuyển sang `EXPIRED`. Xe sẽ được giải phóng về trạng thái `AVAILABLE` (trừ khi gặp sự cố/sửa chữa).
3. **Nhận xe (Pickup):** Khi nhân viên giao xe thành công, trạng thái chuyển sang `IN_RENT`. Xe rời trạm (`current_station_id = NULL`).
4. **Trả xe (Return):** Khách trả xe tại trạm bất kỳ còn đủ sức chứa (`capacity`). Nhân viên kiểm tra, xác nhận trả xe để hoàn tất chuyến đi (`COMPLETED`).

---

## 2. ĐỊNH NGHĨA BẢNG CƠ SỞ DỮ LIỆU (TABLE DEFINITIONS)

### 2.1. Quản lý Người dùng & Ví (Users & Wallets)

#### Bảng `users`
Lưu trữ thông tin tài khoản người dùng (Khách hàng, Nhân viên, Quản lý).

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `name` | `varchar(100)` | NOT NULL |
| `email` | `varchar(100)` | UNIQUE, NOT NULL |
| `password` | `varchar(255)` | NOT NULL (Mật khẩu đã hash) |
| `role` | `varchar(20)` | NOT NULL (`CUSTOMER`, `STAFF`, `MANAGER`) |
| `status` | `varchar(20)` | NOT NULL (`ACTIVE`, `INACTIVE`, `BLOCKED`, `BLACKLISTED`) |
| `created_at` | `timestamptz` | NOT NULL |

#### Bảng `user_documents`
Lưu trữ giấy tờ định danh (eKYC) và bằng lái xe.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `user_id` | `bigint` | **FK** -> `users.id`, NOT NULL |
| `document_type` | `varchar(30)` | NOT NULL (`CCCD`, `PASSPORT`, `DRIVER_LICENSE`) |
| `document_number` | `varchar(50)` | NOT NULL |
| `image_front_url` | `text` | NOT NULL |
| `image_back_url` | `text` | NULL |
| `verified_status` | `varchar(20)` | NOT NULL (`PENDING`, `VERIFIED`, `REJECTED`) |
| `created_at` | `timestamptz` | NOT NULL |

#### Bảng `wallets`
Ví điện tử và số dư của người dùng.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `user_id` | `bigint` | **FK** -> `users.id`, UNIQUE, NOT NULL |
| `balance` | `numeric(12,2)`| NOT NULL, Default: `0` |
| `status` | `varchar(20)` | NOT NULL (`ACTIVE`, `FROZEN`, `LOCKED`) |
| `created_at` | `timestamptz` | NOT NULL |
| `updated_at` | `timestamptz` | NOT NULL |

---

### 2.2. Quản lý Trạm & Phương tiện (Stations & Vehicles)

#### Bảng `stations`
Thông tin các trạm xe điện, sức chứa và giờ hoạt động.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `name` | `varchar(120)` | NOT NULL |
| `address` | `text` | NOT NULL |
| `latitude` | `numeric(9,6)` | NOT NULL |
| `longitude` | `numeric(9,6)` | NOT NULL |
| `capacity` | `int` | NOT NULL (Sức chứa tối đa) |
| `opens_at` | `time` | NULL |
| `closes_at` | `time` | NULL |
| `status` | `varchar(20)` | NOT NULL |

#### Bảng `vehicles`
Danh sách phương tiện và trạng thái thực tế.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `current_station_id` | `bigint` | **FK** -> `stations.id` (NULL khi đang được thuê) |
| `name` | `varchar(100)` | NOT NULL |
| `type` | `varchar(50)` | NOT NULL |
| `battery_percent` | `int` | NOT NULL (0 - 100) |
| `status` | `varchar(20)` | NOT NULL (`AVAILABLE`, `RESERVED`, `RENTED`, `MAINTENANCE`, `SUSPECTED_STOLEN`, `STOLEN`) |
| `daily_price` | `numeric(12,2)`| NOT NULL |
| `deposit_amount` | `numeric(12,2)`| NOT NULL |
| `created_at` | `timestamptz` | NOT NULL |

---

### 2.3. Quản lý Thuê xe & Bàn giao (Rentals & Handovers)

#### Bảng `rentals`
Thông tin chi tiết từng lượt đặt / thuê xe.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `customer_id` | `bigint` | **FK** -> `users.id`, NOT NULL |
| `vehicle_id` | `bigint` | **FK** -> `vehicles.id`, NOT NULL |
| `pickup_station_id` | `bigint` | **FK** -> `stations.id`, NOT NULL |
| `actual_return_station_id` | `bigint` | **FK** -> `stations.id`, NULL |
| `expires_at` | `timestamptz` | NOT NULL (Mặc định `created_at + 30m`) |
| `actual_start_time` | `timestamptz` | NULL (Thời điểm nhận xe thực tế) |
| `actual_end_time` | `timestamptz` | NULL (Thời điểm trả xe thực tế) |
| `status` | `varchar(20)` | NOT NULL, Default: `'RESERVED'` (`RESERVED`, `IN_RENT`, `STOLEN`, `COMPLETED`, `CANCELLED`, `EXPIRED`) |
| `total_price` | `numeric(12,2)`| NULL (Tổng chi phí sau khi tính toán) |
| `created_at` | `timestamptz` | NOT NULL |

- **Indexes:**
  - `idx_rentals_status_expires_at` (`status`, `expires_at`)
  - `idx_rentals_customer_created_at` (`customer_id`, `created_at`)
  - `idx_rentals_vehicle_id` (`vehicle_id`)

#### Bảng `handovers`
Biên bản giao/nhận xe do nhân viên xác thực tại trạm.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `rental_id` | `bigint` | **FK** -> `rentals.id`, NOT NULL |
| `staff_id` | `bigint` | **FK** -> `users.id`, NOT NULL |
| `kind` | `varchar(10)` | NOT NULL (`PICKUP` - Giao xe, `RETURN` - Nhận lại xe) |
| `time` | `timestamptz` | NOT NULL |
| `battery_percent` | `int` | NOT NULL |
| `note` | `text` | NULL |
| `created_at` | `timestamptz` | NOT NULL |

- **Indexes:**
  - `uq_handovers_rental_kind` UNIQUE (`rental_id`, `kind`)

#### Bảng `rental_reviews`
Đánh giá chất lượng sau chuyến đi.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `rental_id` | `bigint` | **FK** -> `rentals.id`, UNIQUE, NOT NULL |
| `rating` | `int` | NOT NULL (1 đến 5 sao) |
| `comment` | `text` | NULL |
| `created_at` | `timestamptz` | NOT NULL |

---

### 2.4. Tài chính, Thanh toán & Khuyến mãi (Financials & Promotions)

#### Bảng `invoices`
Hóa đơn thanh toán cho chuyến đi.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `rental_id` | `bigint` | **FK** -> `rentals.id`, UNIQUE, NOT NULL |
| `total_amount` | `numeric(12,2)`| NOT NULL |
| `status` | `varchar(20)` | NOT NULL (`UNPAID`, `PAID`, `CANCELLED`) |
| `created_at` | `timestamptz` | NOT NULL |

#### Bảng `transactions`
Lịch sử giao dịch liên quan đến đơn thuê.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `rental_id` | `bigint` | **FK** -> `rentals.id`, NOT NULL |
| `invoice_id` | `bigint` | **FK** -> `invoices.id`, NULL |
| `actor_id` | `bigint` | **FK** -> `users.id`, NOT NULL |
| `amount` | `numeric(12,2)`| NOT NULL |
| `kind` | `varchar(20)` | NOT NULL (`PAYMENT`, `DEPOSIT`, `REFUND`, `FEE`) |
| `status` | `varchar(20)` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL |

#### Bảng `wallet_transactions`
Biến động số dư ví cá nhân.

| Cột (Column) | Kiểu Dữ Liệu | Ràng Buộc / Mô Tả |
| :--- | :--- | :--- |
| `id` | `bigint` | **PK** |
| `wallet_id` | `bigint` | **FK** -> `wallets.id`, NOT NULL |
| `rental_id` | `bigint` | **FK** -> `rentals.id`, NULL |
| `amount` | `numeric(12,2)`| NOT NULL |
| `type` | `varchar(30)` | NOT NULL (`TOPUP`, `WITHDRAW`, `RENTAL_PAYMENT`, `RENTAL_DEPOSIT`, `RENTAL_REFUND`) |
| `balance_before` | `numeric(12,2)`| NOT NULL |
| `balance_after` | `numeric(12,2)`| NOT NULL |
| `status` | `varchar(20)` | NOT NULL (`PENDING`, `SUCCESS`, `FAILED`) |
| `created_at` | `timestamptz` | NOT NULL |

#### Bảng `promotions` & `user_promotions`
Chương trình khuyến mãi và ví voucher của người dùng.

* **`promotions`**: `id`, `code` (UNIQUE), `description`, `discount_percent`, `max_discount_amount`, `min_rental_amount`, `start_date`, `end_date`, `status` (`ACTIVE`/`EXPIRED`/`DISABLED`), `created_at`.
* **`user_promotions`**: `id`, `user_id` (FK), `promotion_id` (FK), `is_used` (boolean), `used_at` (timestamptz).

---

### 2.5. Hỗ trợ & Giám sát (Support & Tracking)

* **`support_tickets`**: `id`, `rental_id` (FK), `created_by` (FK -> `users`), `assigned_to` (FK -> `users`), `title`, `description`, `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), `created_at`.
* **`gps_points`**: `id`, `rental_id` (FK), `latitude`, `longitude`, `recorded_at`.

---

## 3. MỐI QUAN HỆ CƠ SỞ DỮ LIỆU (RELATIONSHIPS SUMMARY)

```text
users (1) <---> (1) wallets
users (1) <---> (N) user_documents
users (1) <---> (N) rentals (as customer)
users (1) <---> (N) handovers (as staff)
users (1) <---> (N) support_tickets (as creator/assignee)

stations (1) <---> (N) vehicles (current location)
stations (1) <---> (N) rentals (pickup / return station)

vehicles (1) <---> (N) rentals

rentals (1) <---> (1) rental_reviews
rentals (1) <---> (1) invoices
rentals (1) <---> (N) handovers (Max 2: PICKUP & RETURN)
rentals (1) <---> (N) transactions
rentals (1) <---> (N) gps_points
rentals (1) <---> (N) support_tickets

wallets (1) <---> (N) wallet_transactions
promotions (1) <---> (N) user_promotions
```

---

## 4. QUY TẮC KỸ THUẬT (MIGRATIONS & BACKEND LOGIC)

### 4.1. Xử lý Thời gian & Hết hạn giữ xe
* **Múi giờ:** Luôn lưu dưới dạng `timestamptz` (thống nhất chuẩn UTC trong CSDL).
* **Tự động hết hạn:** Backend tính toán `expires_at = created_at + INTERVAL '30 minutes'`.
* **Ràng buộc khi nhận xe:** Khách chỉ được nhận xe khi `status = 'RESERVED'` và `NOW() < expires_at`.
* **Giải phóng xe:** Tác vụ cronjob/background job sẽ cập nhật `RESERVED` -> `EXPIRED` và đưa xe về `AVAILABLE`.

### 4.2. Khóa chống Tranh chấp (Concurrency & Locking)
* **Partial Unique Index:** Khống chế 1 xe không thể có 2 đơn thuê hoạt động cùng lúc:
  ```sql
  CREATE UNIQUE INDEX uq_active_vehicle_rental 
  ON rentals (vehicle_id) 
  WHERE status IN ('RESERVED', 'IN_RENT', 'STOLEN');
  ```
* **Pessimistic Locking (`SELECT ... FOR UPDATE`):**
  * Khi người dùng thực hiện các thao tác: **Đặt xe, Nhận xe, Trả xe, Hủy đơn**, bắt buộc phải thực hiện khóa dòng (`vehicles`, `rentals`, `stations`) trong cùng 1 Database Transaction để tránh race-condition.

### 4.3. Kiểm tra Sức chứa Trạm (Station Capacity)
* Số chỗ đang dùng tại trạm = Tổng tất cả xe có `current_station_id = station_id` (Bao gồm xe `AVAILABLE`, `RESERVED`, và `MAINTENANCE`).
* Không cho phép thực hiện hành động Trả xe / Điều chuyển xe vào trạm nếu số xe hiện tại $\ge$ `capacity`.

### 4.4. Check Constraints & Ràng buộc Dữ liệu
* `capacity > 0`
* `battery_percent BETWEEN 0 AND 100`
* Các trường giá tiền/số dư phải $\ge 0$.
* Mật khẩu (`users.password`) **bắt buộc** phải là chuỗi đã được hash (Bcrypt, Argon2,...), tuyệt đối không lưu plaintext.