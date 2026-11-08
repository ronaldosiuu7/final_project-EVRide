# EVRide V1 — Hợp đồng API

Ngày soạn: **21/10/2026**. Cập nhật: **08/11/2026** theo `v1-decisions.md`, schema/API quản lý giá, bảo trì, tệp đính kèm/điều chuyển và các yêu cầu khuyến mãi mới. Base URL: `/api/v1`. Định dạng: JSON, UTF-8.

Đây là hợp đồng đề xuất để nhóm triển khai và review, **không phải danh sách API đã chạy được**. Căn cứ: [15 bảng nghiệp vụ trong DBML và các bảng hạ tầng bổ sung](database.md), [phạm vi nghiệp vụ](requirements.md) và [đặc tả báo cáo](dac_ta_quan_tri_bao_cao.md).

Nguồn chính sách: [Sổ quyết định V1](v1-decisions.md). **Đã chốt:** mục 1–7, 9 và 11; yêu cầu loại giảm, phạm vi xe và hạn mức lượt dùng của mục 8. **Chờ duyệt:** các chính sách khuyến mãi còn lại, 10 (GPS/upload) và 12 (sự cố/mất xe). Số mục chính sách là số trong sổ quyết định, không phải số mục của contract này. API thanh toán/khuyến mãi vẫn là contract đề xuất; migration và service khuyến mãi đã được bổ sung nhưng chưa có luồng quote/thanh toán gọi service.

## 1. Phạm vi và mức độ thống nhất

### 1.1. Quy tắc nghiệp vụ đã chốt

- Cho thuê xe máy điện theo trạm; chỉ đặt chiếc xe đang có sẵn, không đặt trước nhiều ngày.
- Giữ xe 30 phút kể từ khi đặt thành công. Hết hạn phải tạo lượt đặt mới và kiểm tra lại xe còn sẵn; không gia hạn hay ghi đè lượt cũ.
- Nhân viên xác nhận bàn giao mới bắt đầu thời gian thuê thực tế.
- Trả tại trạm nhận hoặc bất kỳ trạm khác còn chỗ; nhân viên nhận xe và hoàn tất thanh toán.
- Một khách và một xe chỉ có tối đa một rental chưa giải quyết: RESERVED/IN_RENT/RETURN_PENDING/STOLEN.
- Nhân viên tiếp nhận xe thực tế bằng initiate-return để dừng cước; quyết toán là bước riêng. Thiếu tiền hoặc ví khóa không ngăn tiếp nhận hợp lệ.
- Khách theo dõi thời gian thuê, GPS, ví, hóa đơn và lịch sử; hệ thống có khuyến mãi, sự cố và quản trị.

### 1.2. Đề xuất kỹ thuật của hợp đồng này

Tên endpoint, schema JSON, HTTP status, JWT, idempotency, phân quyền chi tiết và trạng thái bổ sung dưới đây là đề xuất triển khai V1. Các API giá, bảo trì, file và audit điều chuyển được chốt ở mức contract/schema đề xuất; **chưa có nghĩa là API hoặc chức năng đã được triển khai**.

Hợp đồng này chọn thiết kế từ nhánh `docs/update-database-design`, hiện đã được đồng bộ trong `docs/database.md`: có `expires_at`, trạng thái `RESERVED`/`EXPIRED`, bỏ `planned_start_time`/`planned_end_time` và cho phép `total_price` là null trước khi chốt phí. Alembic quản lý schema tại `database/migrations/`; các quy tắc nghiệp vụ và thao tác ghi/replay vẫn cần được thực thi trong backend.

Giá, cọc, điều kiện CCCD/tuổi, ngưỡng pin và quy trình trả xe áp dụng quyết định R2 tại mục 6 dưới đây. Chỉ thanh toán mô phỏng; không tích hợp thanh toán thật trong V1. Các chính sách còn chờ duyệt được liệt kê tại mục 14. API phụ thuộc chính sách chưa cấu hình trả `503 POLICY_NOT_CONFIGURED`, không tự áp dụng giá 0 hoặc giá mặc định.

## 2. Quy ước chung

### 2.1. Kiểu dữ liệu và validation

| Kiểu | Quy ước |
| --- | --- | 
| ID | Chuỗi số nguyên dương, ví dụ `"101"`; DB dùng bigint, JSON dùng string tránh mất chính xác trong JavaScript. **Ngoại lệ rõ ràng:** `session_id` của phiên đăng nhập là chuỗi UUID (ví dụ `"a1348af3-05a0-4a12-8bc8-657bc97703c0"`), và `generation` của refresh token là số nguyên không âm (`integer`) |
| Tiền | Chuỗi số thập phân không âm, tối đa 2 chữ số lẻ, ví dụ `"150000.00"`; đơn vị VND; không dùng float để tính tiền |
| Thời gian | RFC 3339 có múi giờ; response UTC dạng `2026-10-21T03:00:00Z` |
| Ngày báo cáo | `YYYY-MM-DD`, hiểu theo `Asia/Ho_Chi_Minh` |
| Tọa độ | JSON number; latitude từ -90 đến 90, longitude từ -180 đến 180 |
| Pin / đánh giá | Integer; pin 0–100, rating 1–5 |
| Enum | Chuỗi viết hoa; không dịch giá trị enum trên wire |
| Trường nullable | Trả `null` khi chưa có; không dùng `0` hoặc chuỗi rỗng thay cho dữ liệu chưa biết |

ID và tiền luôn được serialize thành JSON string; enum viết hoa; timestamp API là RFC 3339 UTC; ngày báo cáo/UI diễn giải theo `Asia/Ho_Chi_Minh`. Không dùng HTTP 402 cho lỗi số dư: thiếu số dư trả `409 INSUFFICIENT_BALANCE` theo envelope lỗi chung.

Body phải là object. Từ chối trường không được khai báo bằng `422`; không cho phép client đặt `id`, `created_at`, chủ sở hữu hoặc trạng thái nghiệp vụ trực tiếp. PATCH: trường bị bỏ qua giữ nguyên; `null` chỉ hợp lệ với trường nullable. Chuỗi bắt buộc phải có nội dung sau trim. Giới hạn mặc định cho note/comment/description là 2.000 ký tự, email 100, tên người/xe 100, tên trạm 120, tiêu đề sự cố 200. Mật khẩu không trim.

### 2.2. Response

Response một đối tượng:

```json
{
  "data": {"id": "101"},
  "meta": {
    "request_id": "req_example",
    "server_time": "2026-10-21T03:00:00Z"
  }
}
```

Danh sách dùng `page` mặc định 1, `page_size` mặc định 20, tối đa 100; giá trị không hợp lệ trả 422. Sắp mặc định `created_at DESC, id DESC`; tài nguyên không có `created_at` dùng `id DESC`. Chỉ hỗ trợ bộ lọc/sort nêu tại từng endpoint.

```json
{
  "data": [],
  "meta": {
    "request_id": "req_example",
    "server_time": "2026-10-21T03:00:00Z",
    "page": 1,
    "page_size": 20,
    "total": 0
  }
}
```

Trang vượt tổng số trang trả 200 với `data: []`. Endpoint ghi không có payload được ghi là `body: {}`. GET không có body. Mã thành công mặc định 200, tạo tài nguyên 201, không dùng 204 trong hợp đồng này.

### 2.3. Lỗi

```json
{
  "error": {
    "code": "RESERVATION_EXPIRED",
    "message": "Lượt giữ xe đã hết hạn. Vui lòng đặt lại.",
    "details": {"rental_id": "501"}
  },
  "meta": {
    "request_id": "req_example",
    "server_time": "2026-10-21T03:30:00Z"
  }
}
```

Frontend xử lý theo `error.code`, không so sánh `message`. Không trả stack trace, câu SQL, JWT, giấy tờ hay dữ liệu tài chính trong lỗi.

| HTTP | Code tiêu biểu | Ý nghĩa |
| --- | --- | --- |
| 400 | `INVALID_DATE_RANGE`, `INVALID_REQUEST`, `SESSION_SELECTION_REQUIRED`, `TOO_MANY_AUTH_COOKIES` | Khoảng ngày đảo ngược, request sai cấu trúc, thiếu `X-Session-ID` hợp lệ hoặc quá giới hạn cookie phiên |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `SESSION_INVALID`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `REFRESH_INVALID`, `REFRESH_EXPIRED`, `REFRESH_REUSED` | Thiếu/sai thông tin xác thực, access token hết hạn, phiên không hợp lệ/hết hạn/đã thu hồi hoặc refresh token bị reuse |
| 403 | `FORBIDDEN`, `ACCOUNT_DISABLED`, `CUSTOMER_NOT_ELIGIBLE`, `CSRF_REJECTED` | Sai quyền, tài khoản bị khóa, chưa đủ điều kiện hoặc vi phạm kiểm tra Origin/CSRF header |
| 404 | `NOT_FOUND` | Không tồn tại hoặc không thuộc phạm vi được xem |
| 409 | `EMAIL_EXISTS`, `VEHICLE_UNAVAILABLE`, `STATION_FULL`, `STATION_UNAVAILABLE`, `REFRESH_RETRY_UNAVAILABLE` | Xung đột tài nguyên hoặc không thể replay kết quả refresh cũ trong grace |
| 409 | `RESERVATION_EXPIRED`, `INVALID_RENTAL_STATE`, `PICKUP_STATION_MISMATCH` | Sai trạng thái hoặc hết hạn |
| 409 | `WALLET_UNAVAILABLE`, `INSUFFICIENT_BALANCE`, `PROMOTION_INVALID`, `PROMOTION_EXHAUSTED`, `ALREADY_REVIEWED` | Điều kiện nghiệp vụ không đáp ứng hoặc đã hết lượt dùng |
| 409 | `IDEMPOTENCY_CONFLICT`, `REQUEST_IN_PROGRESS`, `STALE_QUOTE`, `INVALID_STATE_TRANSITION` | Request lặp khác nội dung hoặc dữ liệu đã thay đổi |
| 409 | `ACTIVE_RENTAL_EXISTS`, `DAILY_CANCELLATION_LIMIT_REACHED` | Đã có chuyến chưa giải quyết hoặc đã đủ 3 lượt hủy/hết hạn trong ngày |
| 413 | `FILE_TOO_LARGE` | File upload vượt 10 MiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | File không phải JPEG/PNG/WebP |
| 422 | `VALIDATION_ERROR` | Sai kiểu/enum, thiếu trường, số âm, trường lạ; details.fields là mảng `{field, message}` |
| 429 | `RATE_LIMITED` | Vượt giới hạn; kèm `Retry-After` |
| 503 | `POLICY_NOT_CONFIGURED`, `FEATURE_NOT_ENABLED`, `DEPENDENCY_UNAVAILABLE` | Chính sách/tích hợp chưa sẵn sàng |
| 500 | `INTERNAL_ERROR` | Lỗi bất ngờ; trả request_id để tra cứu |

### 2.4. Xác thực, Rolling Session và quyền

- **Access Token:** `Authorization: Bearer <access_token>`. JWT HS256 sống 1.800 giây (30 phút), bắt buộc các claim `sub` (chuỗi user ID bigint), `sid` (chuỗi UUID phiên), `iat`, `exp`, `iss`, `aud`, `typ="access"`, `jti`. Không tin role cũ trong JWT; backend đọc trạng thái `User` (`ACTIVE`) và `UserSession` từ database trên mỗi request.
- **Rolling Session & Refresh Token Rotation:** Mỗi lần đăng nhập thành công tạo một bản ghi `user_sessions` mới (UUID) và `refresh_tokens` thế hệ `generation = 0` có hạn 30 ngày. Refresh token là chuỗi ngẫu nhiên 256 bit, chỉ lưu bản băm SHA-256 trong DB và chỉ gửi qua cookie `HttpOnly` có tên riêng theo phiên và thế hệ: `evr_rt_<session_uuid_hex>_<generation>` (`Path=/api/v1/auth; HttpOnly; SameSite=Lax`, bật `Secure` trên HTTPS/production, không đặt `Domain`). Không trả hoặc nhận refresh token trong JSON body.
- **Grace Replay & Reuse Detection:** Mỗi lần refresh thành công đánh dấu `used_at` cho token cũ, tạo token `generation + 1` và kéo dài hạn phiên/token mới thành `now + 30 ngày` (rolling, không có absolute lifetime). Trong thời gian ân hạn `REFRESH_GRACE_SECONDS` (mặc định 15 giây tính từ `used_at` đầu tiên), nếu client retry cùng token vừa dùng và token kế tiếp vẫn chưa dùng/còn hạn, server giải mã `replay_ciphertext` (Fernet) trong chính dòng `refresh_tokens` đó để trả lại nguyên kết quả mà không xoay vòng tiếp hay kéo dài grace. Ngoài grace, việc gửi lại token đã dùng bị coi là reuse (`401 REFRESH_REUSED`) và thu hồi nguyên tử phiên đó (`revoke_reason = "REFRESH_REUSE"`).
- **Thu hồi phiên (Revocation):**
  - `POST /auth/logout` thu hồi phiên hiện tại (`LOGOUT`) và xóa các cookie của phiên đó trong request.
  - `POST /users/me/change-password` và `PATCH /users/{id}` khi chuyển trạng thái tài khoản khỏi `ACTIVE` thu hồi **mọi phiên** của tài khoản trong cùng transaction. Mở khóa lại tài khoản không hồi sinh phiên đã thu hồi.
  - Thứ tự kiểm tra trên protected API: `ACCOUNT_DISABLED` (403) → `SESSION_REVOKED` (401) → `SESSION_EXPIRED` (401) → `TOKEN_EXPIRED` (401). Chỉ `TOKEN_EXPIRED` mới được phép kích hoạt refresh tự động phía frontend.
- **CSRF, CORS và phối hợp phía Frontend:**
  - Các endpoint `/auth/login`, `/auth/refresh`, `/auth/logout` và `/users/me/change-password` bắt buộc `Origin` nằm trong allowlist `AUTH_ORIGINS` (không dùng `*`), header `X-EVRide-CSRF: 1` và `Content-Type: application/json`.
  - `/auth/refresh` và `/auth/logout` bắt buộc header `X-Session-ID: <session_uuid>` và body `{}`.
  - Mọi response auth và lỗi auth đều đặt `Cache-Control: no-store`.
  - Frontend chỉ giữ `access_token` trong bộ nhớ (RAM), chỉ lưu `session_id` và trạng thái không bí mật trong `localStorage`, đồng thời dùng Web Locks (`evride-auth`) kết hợp BroadcastChannel để điều phối liên tab.

Ký hiệu quyền trong bảng endpoint:

- `Public`: không cần đăng nhập.
- `C`: CUSTOMER, tài khoản ACTIVE, chỉ dữ liệu của chính mình.
- `S`: STAFF, tài khoản ACTIVE.
- `M`: MANAGER, tài khoản ACTIVE.
- `Owner/S/M`: khách sở hữu đối tượng hoặc nhân viên/quản lý.

Chỉ dùng enum role `CUSTOMER`, `STAFF`, `MANAGER`; các tài liệu cũ ghi `nhan_vien` được hiểu là `STAFF`, không phải một giá trị DB/API. Sai vai trò trả 403; truy cập tài nguyên cá nhân của khách khác trả 404. S/M không có nghĩa được đóng vai khách đặt xe hoặc thanh toán từ ví bất kỳ. **Đã chốt:** STAFF thực hiện pickup/initiate-return/return/move ở mọi trạm; MANAGER quản trị toàn hệ thống. Không thêm `staff_station_assignments` trong V1. Quyền toàn hệ thống không bỏ qua các điều kiện nghiệp vụ; production cần thiết kế phân quyền theo trạm.

### 2.5. Idempotency và giao dịch

Các POST được đánh dấu `I` bắt buộc header `Idempotency-Key`, chuỗi ngẫu nhiên 16–128 ký tự; thiếu/sai định dạng trả 422.

- Khóa theo `(actor_id, method, path, key)`; lưu hash body và kết quả trong kho bền vững tối thiểu 24 giờ.
- Cùng key/cùng body: trả nguyên mã HTTP và payload nghiệp vụ lần đầu, không tạo tác động mới. Cùng key/khác body: 409 `IDEMPOTENCY_CONFLICT`.
- Request đầu đang xử lý: 409 `REQUEST_IN_PROGRESS`, client retry cùng key.
- Lỗi validation/quyền trước khi bắt đầu giao dịch không lưu kết quả. Kết quả đã commit phải replay được sau timeout.
- Key đã hết thời gian lưu không thay thế các ràng buộc lâu dài: một hóa đơn/lượt thuê, một PICKUP/RETURN, một đánh giá, một lần ghi sổ cho mỗi giao dịch thanh toán.
- Mọi thay đổi liên quan trong **mỗi hành động** phải commit/rollback cùng nhau. Tiếp nhận xe và quyết toán là hai transaction riêng; lỗi quyết toán không rollback việc tiếp nhận đã commit. Không gọi dịch vụ thanh toán bên ngoài trong lúc giữ khóa DB dài hạn.

Schema có bảng `idempotency_records`, liên kết giao dịch/sổ ví và snapshot giá trong `database.md`. Backend vẫn phải triển khai claim nguyên tử theo khóa duy nhất, hash body, lưu response cùng transaction và chỉ dọn record sau `expires_at`. Client không được tự retry nghiệp vụ bằng key mới chỉ vì chưa nhận response.

Trước khi tách `trips`, mọi implementation reserve/expiry/cancel/pickup/initiate-return/settle phải dùng chung transaction/locking/idempotency contract, không để router hoặc module khác tự ghi các bảng rental/vehicle/wallet/ledger. Cùng key/body replay nguyên status/payload; cùng key khác body trả `409 IDEMPOTENCY_CONFLICT`; mọi ghi liên quan một hành động commit/rollback thống nhất. Các test tranh chấp, rollback giữa các bước và retry sau timeout phải chạy trên PostgreSQL thật.

## 3. Tài nguyên API

Các schema bên dưới liệt kê trường response. ID/tiền/thời gian theo mục 2. Dấu `?` chỉ trường có giá trị nullable, không phải một phần tên trường. Mọi field không nullable được trả đầy đủ.

| Bảng | Schema response | Quyền xem |
| --- | --- | --- |
| `users` | User: `id, name, email, role, status, created_at` | Chính mình/S/M qua API được phép; tuyệt đối không trả password/hash |
| `user_documents` | Document: `id, user_id, document_type, document_number_masked, verified_status, expires_on?, verified_birth_date?, verified_by?, verified_at?, revoked_at?, created_at` | Chính mình/S/M; ảnh và số đầy đủ chỉ qua endpoint riêng |
| `stations` | Station: `id, name, address, latitude, longitude, capacity, opens_at?, closes_at?, status, occupied_spaces, available_spaces, available_vehicle_count` | Public |
| `vehicles` | Vehicle: `id, current_station_id?, name, type, battery_percent, status, first_30_minutes_price, extra_minute_price, deposit_amount, created_at` | Public chỉ xe có thể thuê; S/M xem tất cả |
| `rentals` | Rental: `id, customer_id, vehicle_id, pickup_station_id, actual_return_station_id?, created_at, expires_at, actual_start_time?, actual_end_time?, return_initiated_at?, settled_at?, cancelled_at?, cancellation_reason?, cancellation_limit_exempt, first_30_minutes_price_snapshot, extra_minute_price_snapshot, deposit_amount_snapshot, vehicle_type_snapshot, pricing_policy_version, billing_unit, deposit_held, status, total_price?, remaining_hold_seconds, elapsed_seconds` | Owner/S/M |
| `handovers` | Handover: `id, rental_id, staff_id, kind, time, battery_percent, vehicle_condition?, note?, created_at` | Owner/S/M |
| `vehicle_pricing_history` | PriceVersion: `id, vehicle_id, version_number, old_first_30_minutes_price?, new_first_30_minutes_price, old_extra_minute_price?, new_extra_minute_price, old_deposit_amount?, new_deposit_amount, changed_by, created_at` | S/M |
| `maintenance_orders` | MaintenanceOrder: `id, vehicle_id, created_by, assigned_to?, title, description, status, opened_at, started_at?, completed_at?, resolution_note?, created_at, updated_at` | S/M |
| `stored_files` | StoredFile: `id, original_filename, content_type, size_bytes, sha256, status, uploaded_by, created_at, verified_at?` | Người tải lên/S/M theo quyền |
| `file_attachments` | FileAttachment: `id, file_id, owner_type, owner_id, purpose, attached_by, created_at` | Theo quyền xem tài nguyên cha |
| `vehicle_move_audits` | VehicleMoveAudit: `id, vehicle_id, from_station_id, to_station_id, actor_id, idempotency_record_id?, note?, moved_at` | S/M |
| `invoices` | Invoice: `id, rental_id, total_amount, status, created_at` | Owner/S/M |
| `transactions` | Transaction: `id, rental_id, invoice_id?, actor_id, amount, kind, status, created_at` | Owner/S/M |
| `wallets` | Wallet: `id, user_id, balance, status, created_at, updated_at` | Chủ ví/M |
| `wallet_transactions` | WalletTransaction: `id, wallet_id, rental_id?, amount, type, balance_before, balance_after, status, created_at` | Chủ ví/M |
| `promotions` | Promotion: `id, code, description?, discount_type, discount_value, max_discount_amount?, min_rental_amount?, vehicle_model?, usage_limit?, used_count, start_date, end_date, status, created_at` | C xem mã đủ điều kiện; M xem tất cả |
| `user_promotions` | UserPromotion: `id, user_id, promotion_id, is_used, used_at?, promotion` | Chủ sở hữu/M |
| `support_tickets` | Ticket: `id, rental_id, created_by, assigned_to?, title, description, status, created_at` | Owner/S/M |
| `gps_points` | GpsPoint: `id, rental_id, latitude, longitude, recorded_at` | Owner/S/M |
| `rental_reviews` | Review: `id, rental_id, rating, comment?, created_at` | Owner/S/M; V1 không công khai đánh giá cá nhân |

Không lưu các bộ đếm `occupied_spaces`, `available_spaces`, `available_vehicle_count`, `rentable_vehicles` hoặc `free_slots` trong stations. Chúng là truy vấn động/View thường; available_spaces là alias của free_slots, available_vehicle_count là alias của rentable_vehicles.

Field dẫn xuất không tạo thêm bảng: `occupied_spaces` đếm tất cả xe đang ở trạm; `available_spaces = capacity - occupied_spaces`; số xe thuê được loại trừ giữ chỗ, xe lỗi và không đủ điều kiện. Không dùng max(0, ...) để che số chỗ âm: ghi nhận lỗi nhất quán và chặn nhận thêm xe.

`remaining_hold_seconds = max(0, floor(expires_at - server_time))` khi RESERVED, trạng thái khác bằng 0. `elapsed_seconds` bằng 0 trước nhận xe, sau đó tính từ actual_start_time đến actual_end_time hoặc server_time. Đây không phải số đơn vị tính phí.

Enum bổ sung đề xuất: Station `ACTIVE/INACTIVE`; Transaction `PENDING/SUCCESS/FAILED`. Theo DBML ở nhánh `docs/update-database-design`, Vehicle đã có `RESERVED`; Rental cần dùng `RESERVED/IN_RENT/RETURN_PENDING/COMPLETED/CANCELLED/EXPIRED/STOLEN`; Vehicle cần bổ sung `RETURN_PENDING` bên cạnh `AVAILABLE/RESERVED/RENTED/MAINTENANCE/SUSPECTED_STOLEN/STOLEN`. Đây là yêu cầu migration, không phải xác nhận enum đã có. Giữ các enum khác trong DBML. `OVERDUE` chưa dùng vì chưa chốt hạn trả xe.

Với `file_attachments`, `owner_id` là trường response suy ra từ đúng một FK owner đã lưu (vehicle, maintenance order, handover, user document hoặc support ticket); `owner_type` được suy ra từ loại FK. Không lưu hai trường đa hình này làm FK giả trong DB.

## 4. Đăng ký, đăng nhập, hồ sơ và giấy tờ

|Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| POST `/auth/register` | Public | `{name, email, password}` | 201 `{user: User, wallet: Wallet}` |
| POST `/auth/login` | Public (Web CSRF) | `{email, password}`; header `Origin`, `X-EVRide-CSRF: 1` | 200 `{access_token, token_type: "bearer", expires_in: 1800, access_expires_at, session_id, generation: 0, session_expires_at, user: User}` + `Set-Cookie` HttpOnly |
| POST `/auth/refresh` | Cookie phiên (Web CSRF) | `{}`; header `Origin`, `X-EVRide-CSRF: 1`, `X-Session-ID`, cookie `evr_rt_*` | 200 `{access_token, token_type: "bearer", expires_in: 1800, access_expires_at, session_id, generation, session_expires_at, user: User}` + `Set-Cookie` mới & xóa cookie thế hệ cũ |
| POST `/auth/logout` | Cookie phiên (Web CSRF) | `{}`; header `Origin`, `X-EVRide-CSRF: 1`, `X-Session-ID`, cookie `evr_rt_*` | 200 `{logged_out: true}` + xóa cookie phiên |
| GET `/users/me` | C/S/M | — | User |
| PATCH `/users/me` | C/S/M | `{name}` | User |
| POST `/users/me/change-password` | C/S/M (Web CSRF) | `{current_password, new_password}`; header `Origin`, `X-EVRide-CSRF: 1` | 200 `{changed: true, reauthenticate: true}` |
| GET `/users/me/documents` | C/S/M | Phân trang | Document[] |
| POST `/users/me/documents` | C/S/M | `{document_type, document_number, front_file_id, back_file_id?, expires_on?, birth_date?}` | 201 Document, trạng thái PENDING |
| GET `/user-documents/{id}/sensitive` | Owner/S/M | — | `{id, document_number, front_download_url, back_download_url?, urls_expire_at}` |
| PATCH `/user-documents/{id}/verification` | S/M | `{verified_status: "VERIFIED" hoặc "REJECTED", verified_birth_date?, expires_on?}` | Document |
| GET `/users` | S/M | `role?, status?, q?`, phân trang | User[] |
| GET `/users/{id}` | S/M | — | User |
| POST `/users` | M | `{name, email, password, role}`; role STAFF hoặc MANAGER | 201 User |
| PATCH `/users/{id}` | M | `{name?, status?, role?}` | User |

Đăng ký luôn tạo CUSTOMER ACTIVE và ví ACTIVE số dư `"0.00"` trong cùng giao dịch. Email chuẩn hóa trim/lowercase và unique; trùng trả 409. Đề xuất mật khẩu 12–128 ký tự, lưu hash, login lỗi không tiết lộ email có tồn tại. Thay mật khẩu cần mật khẩu hiện tại, cập nhật mật khẩu và thu hồi toàn bộ phiên (`user_sessions`) của tài khoản trong cùng một transaction (`PASSWORD_CHANGED`); sau đó frontend gọi `/auth/logout` để dọn cookie ở đường dẫn `/api/v1/auth` rồi yêu cầu đăng nhập lại. Khi MANAGER khóa tài khoản (`status != "ACTIVE"`), toàn bộ phiên của tài khoản bị thu hồi nguyên tử (`ACCOUNT_DISABLED`).

M không tự khóa/hạ quyền tài khoản MANAGER cuối cùng; không đổi CUSTOMER thành nhân viên bằng PATCH để tránh nhập nhằng quyền sở hữu dữ liệu. Tạo nhân viên dùng POST `/users`. Không có DELETE tài khoản trong V1.

Giấy tờ chỉ nhận loại CCCD/PASSPORT/DRIVER_LICENSE. `front_file_id` và `back_file_id` phải trỏ tới file READY do luồng upload của hệ thống cấp; không nhận URL tùy ý để backend tải về. Endpoint sensitive trả URL tải ký ngắn hạn, không cache, ghi audit truy cập; các API danh sách không trả ảnh hoặc số đầy đủ. S/M không tự duyệt giấy tờ của mình. Nộp lại giấy tờ tạo bản PENDING mới, không sửa bằng chứng đã duyệt.

Khi POST giấy tờ, backend gắn các file đã upload với tài liệu mới bằng `USER_DOCUMENT_FRONT`/`USER_DOCUMENT_BACK` trong cùng transaction; client không gửi URL file hoặc ID tài liệu do mình chọn.

Các trường ngày sinh/hạn giấy tờ đầu vào là thông tin khai báo; chỉ dùng ngày sinh và hạn CCCD đã được S/M xác minh để xét thuê. Xác minh CCCD thành VERIFIED bắt buộc có `verified_birth_date` và `expires_on`; server ghi `verified_by`, `verified_at`. Đề xuất endpoint kỹ thuật bổ sung: POST `/user-documents/{id}/revoke` (S/M, I), body `{reason}`, trả Document; lưu `revoked_at`, người thu hồi/lý do trong audit, không xóa lịch sử. Không tự xác minh/thu hồi hồ sơ của mình.

CCCD hợp lệ khi VERIFIED, chưa thu hồi và ngày hiện tại tại Asia/Ho_Chi_Minh không sau expires_on. Khách đủ 16 tuổi ở cả ngày giữ và ngày nhận. Không bắt buộc GPLX/PASSPORT; bản CCCD VERIFIED cũ còn hạn vẫn có hiệu lực khi nộp bản mới PENDING. Đây là chính sách demo, không phải kết luận pháp lý về mọi loại xe máy điện.

**Upload/kho ảnh chờ duyệt theo quyết định 10:** schema và API dự kiến được mô tả tại mục 5.1; chưa có tích hợp được duyệt thì trả `503 FEATURE_NOT_ENABLED`, không giả định có kho ảnh thật. Seed chỉ dùng dữ liệu giả.

## 5. Trạm và xe

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| GET `/stations` | Public | `q?, has_available_vehicles?, has_return_space?`, phân trang | Station[] ACTIVE |
| GET `/stations/{id}` | Public | — | Station ACTIVE |
| GET `/stations/{id}/vehicles` | Public | `type?`, phân trang | Vehicle[] có thể đặt tại trạm |
| GET `/vehicles` | Public hoặc S/M | `station_id?, type?, status?`, phân trang | Vehicle[]; Public chỉ AVAILABLE đủ điều kiện |
| GET `/vehicles/{id}` | Public hoặc S/M | — | Vehicle; Public chỉ xe đang cho phép đặt, còn lại 404 |
| GET `/admin/stations` | S/M | `status?, q?`, phân trang | Station[] mọi trạng thái |
| POST `/stations` | M | `{name, address, latitude, longitude, capacity, opens_at?, closes_at?}` | 201 Station ACTIVE |
| PATCH `/stations/{id}` | M | Các trường tạo + `status`, tất cả optional | Station |
| POST `/vehicles` | M | `{current_station_id, name, type, battery_percent, first_30_minutes_price, extra_minute_price, deposit_amount}` | 201 Vehicle AVAILABLE |
| PATCH `/vehicles/{id}` | M | `{name?, type?}` | Vehicle |
| PATCH `/vehicles/{id}/battery` | S/M | `{battery_percent, note}` | Vehicle; có audit, không dùng để vượt qua bàn giao hoặc xử lý mất xe |
| POST `/vehicles/{id}/status` | S/M, I | `{status: "AVAILABLE" hoặc "MAINTENANCE", note}` | Vehicle |

`opens_at/closes_at`: cùng null nghĩa là 24/7; nếu có thì cả hai ở dạng `HH:mm:ss`, giờ Việt Nam. Cặp giờ qua nửa đêm là khoảng mở xuyên đêm; hai giờ bằng nhau bị từ chối, dùng null cho 24/7.

### 5.1. Bảng giá, tệp đính kèm và điều chuyển (đề xuất, chưa triển khai)

Các endpoint trong mục này là **đề xuất contract, chưa triển khai**. API bảo trì được mô tả tại mục 9 và cũng chưa triển khai. ID/tiền vẫn là chuỗi theo quy ước chung.

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| GET `/prices` | S/M | `vehicle_id?`, phân trang | PriceVersion[] |
| GET `/prices/{id}` | S/M | — | PriceVersion |
| POST `/prices` | M, I | `{vehicle_id, first_30_minutes_price, extra_minute_price, deposit_amount}` | 201 PriceVersion mới |
| POST `/vehicles/{id}/move` | S/M, I | `{target_station_id, note?}` | Vehicle tại trạm mới |
| GET `/vehicles/{id}/move-history` | S/M | Phân trang | VehicleMoveAudit[] |
| POST `/files/upload-intents` | C/S/M, I | `{filename, content_type, size_bytes, sha256}` | 201 `{file_id, upload_url, method: "PUT", headers, expires_at}` |
| PUT `upload_url` | URL ký, không dùng bearer token | Bytes của file | Thành công theo provider object storage, ngoài API envelope |
| POST `/files/{id}/complete` | Người upload/S/M, I | `{}` | StoredFile READY hoặc lỗi kiểm tra |
| POST `/files/{id}/attachments` | Owner/S/M, I | `{purpose, vehicle_id?, maintenance_order_id?, handover_id?, user_document_id?, support_ticket_id?}`; đúng một owner | 201 FileAttachment |
| GET `/files/attachments` | Owner/S/M | `owner_type` (`VEHICLE`, `MAINTENANCE_ORDER`, `HANDOVER`, `USER_DOCUMENT`, `SUPPORT_TICKET`), `owner_id`, phân trang | FileAttachment[] |
| GET `/files/{id}/download` | Public với ảnh xe công khai; nếu không Owner/S/M | — | `{download_url, expires_at}` |

- Bảng giá được quản lý **theo từng xe**. `POST /vehicles` tạo phiên bản giá đầu tiên; `POST /prices` thêm phiên bản tiếp theo, không sửa/xóa phiên bản cũ. Trong một transaction, khóa xe, ghi `vehicle_pricing_history` với version tăng đơn điệu và giá/cọc cũ-mới, cập nhật giá hiện tại trên `vehicles`, rồi trả version mới. Snapshot của rental hiện có không thay đổi.
- `GET /prices` mặc định trả phiên bản mới nhất của mỗi xe; khi có `vehicle_id`, trả lịch sử xe đó theo `version_number DESC`. Trang lịch sử là append-only, thứ tự phụ khi cần là `id DESC`. Giá/cọc là chuỗi tiền; ID là chuỗi.
- Quyền mọi trạm của STAFF không bỏ qua việc điều chuyển: khóa trạm nguồn/đích theo ID tăng dần, sau đó khóa xe; kiểm tra status, capacity và quan hệ rental trước ghi. Cập nhật `vehicles.current_station_id` và append `vehicle_move_audits` cùng transaction. Ghi station nguồn/đích, actor, thời điểm server, note và idempotency record. Replay cùng key không tạo audit thứ hai.
- Upload chỉ nhận JPEG/PNG/WebP tối đa 10 MiB/file. `POST /files/upload-intents` (C/S/M, I) nhận `{filename, content_type, size_bytes, sha256}` và trả `{file_id, upload_url, method: "PUT", headers, expires_at}`. URL upload ký có hiệu lực 5 phút; client PUT trực tiếp lên object storage riêng tư. `POST /files/{id}/complete` (C/S/M, I) xác minh object có thật, MIME và magic bytes, kích thước và SHA-256 rồi đánh dấu READY; file không khớp bị REJECTED, không được attach/download.
- `POST /files/{id}/attachments` (C/S/M, I) nhận đúng một owner trong `{vehicle_id?, maintenance_order_id?, handover_id?, user_document_id?, support_ticket_id?}` cùng `purpose`; file chỉ attach một lần. Lưu liên kết FK trong `file_attachments`. Download qua `GET /files/{id}/download` trả URL ký ngắn hạn (5 phút), không trả `object_key`; kiểm tra quyền với tài nguyên cha trước khi cấp URL. Ảnh xe chỉ công khai nếu xe tương ứng được phép xem công khai; giấy tờ và bằng chứng nghiệp vụ chỉ Owner/S/M. Ghi audit tải ảnh nhạy cảm, không cache URL.
- `GET /files/attachments` chỉ liệt kê metadata của tệp gắn với owner được phép xem; kiểm tra quyền trên tài nguyên cha trước khi trả kết quả, không cấp URL tải trong danh sách.
- Khi object storage, malware/content validation hoặc ký URL chưa được cấu hình, endpoint liên quan trả `503 FEATURE_NOT_ENABLED`/`DEPENDENCY_UNAVAILABLE`, không tạo response giả hoặc chấp nhận URL bên ngoài. Xóa file và chính sách lưu trữ cần review riêng; V1 không xóa bằng chứng gắn với tài chính/giấy tờ.
- Bảng `file_attachments` chỉ nhận file READY và đúng một owner FK; `purpose` phải phù hợp loại ảnh. CUSTOMER chỉ attach giấy tờ, bằng chứng ticket hoặc handover thuộc tài nguyên của mình; STAFF/MANAGER theo quyền tài nguyên. File không được attach nhiều lần. Download kiểm tra quyền cha mỗi lần cấp URL; URL hết hạn không thay quyền truy cập.

Tạo xe khóa trạm đích; điều chuyển khóa cả trạm nguồn/đích theo ID tăng dần trước khi khóa xe và kiểm tra lại chỗ. Không điều chuyển xe RESERVED/RENTED/RETURN_PENDING/SUSPECTED_STOLEN/STOLEN. Không giảm capacity dưới số xe đang đỗ; không ngừng trạm khi còn xe hoặc lượt giữ chỗ ở trạm. Không đặt/nhận/trả tại trạm không hoạt động hoặc ngoài giờ mở.

AVAILABLE ↔ MAINTENANCE chỉ khi xe đang ở trạm và không có thuê/giữ chỗ đang hiệu lực; không dùng endpoint status để bỏ qua bàn giao, giải phóng xe đang thuê hoặc xử lý mất xe. `note` cần kho audit theo mục 13. Giá mới không được thay đổi snapshot của rental đã tạo. Lưu lịch sử đổi giá/cọc. API cập nhật pin có audit; chặn sửa xe STOLEN/SUSPECTED_STOLEN và không mở lại khả năng thuê nếu còn rental/bảo trì chặn. Xe dưới 30% không cho đặt/pickup, nhưng vẫn được tiếp nhận trả.

## 6. Giữ xe, nhận xe và trả xe

### 6.1. Vòng đời và endpoint

| Từ | Hành động | Sang |
| --- | --- | --- |
| Chưa có rental | POST /rentals | RESERVED |
| RESERVED | pickup trước hạn | IN_RENT |
| RESERVED | cancel trước hạn / hết hạn | CANCELLED / EXPIRED |
| IN_RENT | initiate-return sau khi nhân viên giữ xe thực tế | RETURN_PENDING |
| RETURN_PENDING | return quyết toán thành công | COMPLETED |

STOLEN chưa giải quyết chặn khách/xe theo quyết định 6. Quy trình ghi nhận và giải quyết mất xe chờ bổ sung theo quyết định 12; không thêm CLOSED_INCIDENT, API khôi phục hoặc chính sách giữ cọc mất xe trong lần cập nhật này.

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| POST `/rentals` | C, I | `{vehicle_id, pickup_station_id}` | 201 Rental |
| GET `/rentals` | C/S/M | `status?, vehicle_id?, pickup_station_id?, created_from?, created_to?`, phân trang; S/M thêm `customer_id?` | Rental[]; C chỉ của mình |
| GET `/rentals/{id}` | Owner/S/M | — | Rental |
| POST `/rentals/{id}/cancel` | C sở hữu, I | `{}` | Rental CANCELLED |
| POST `/rentals/{id}/cancel-operational` | S/M, I | `{reason, note}` | Rental CANCELLED; chỉ RESERVED trước pickup, lý do lỗi xe/hệ thống được xác nhận, audit và miễn hạn mức |
| POST `/rentals/{id}/pickup` | S/M, I | `{station_id, battery_percent, note?}` | `{rental: Rental, handover: Handover, wallet: Wallet}` |
| POST `/rentals/{id}/initiate-return` | S/M, I | `{return_station_id, battery_percent, vehicle_condition, note?}` | `{rental: Rental, handover: Handover}`; RETURN_PENDING |
| POST `/rentals/{id}/return-quote` | Owner/S/M | `{return_station_id, promotion_code?}` | ReturnQuote; không trừ tiền/tiêu thụ mã |
| POST `/rentals/{id}/return` | S/M, I | `{quote_token}` | `{rental: Rental, handover: Handover, invoice: Invoice, transactions: Transaction[], wallet: Wallet}` |
| GET `/rentals/{id}/handovers` | Owner/S/M | Phân trang | Handover[] |

`vehicle_condition` là OK hoặc NEEDS_MAINTENANCE, lưu cùng phiên tiếp nhận. POST return không nhận lại trạm/pin/tình trạng/mốc thời gian; dùng dữ liệu đã lưu từ initiate-return. Tên endpoint cancel-operational là đề xuất kỹ thuật để thực thi miễn hạn mức đã chốt; client khách không được tự chọn miễn trừ.

Không có DELETE rental, PATCH status, gia hạn hoặc thời gian đặt trước nhiều ngày. Không nhận giá, customer_id, timestamp nghiệp vụ hoặc trạng thái tùy ý từ client. Body ngoài schema trả 422. Pickup yêu cầu xe RESERVED đúng rental/trạm; chuyển xe RENTED, current_station_id=null, ghi PICKUP và actual_start_time cùng transaction thu cọc. Chỉ thời gian thực tế sau khi lấy khóa < expires_at mới được nhận.

Các trường mới của Rental đều được trả theo schema mục 3. `billing_unit = "FIRST_1800_SECONDS_THEN_CEIL_MINUTE"`; deposit_held là cọc hiện còn giữ cho chuyến (0 trước pickup và sau quyết toán thành công). total_price=null trước quyết toán; quote là báo giá riêng. cancellation_limit_exempt mặc định false, chỉ server thay đổi theo xác nhận vận hành có audit.

Các mục 6.2–6.8 dưới đây chuyển nguyên nội dung chính sách 1–7 từ sổ quyết định; các tham chiếu “mục 1…7” bên trong chúng chỉ các mục của **v1-decisions.md**.

### 6.2. Giá thuê đã chốt

- Đơn vị thanh toán: VND. Dùng Decimal/NUMERIC, không dùng float.
- Thu tối thiểu một block 1.800 giây (30 phút) đầu tiên. Chỉ phần vượt 30 phút được tính theo phút, làm tròn lên.
- Giá cấu hình theo xe: `first_30_minutes_price = 10000.00`, `extra_minute_price = 350.00` trong seed.
- Tính từ pickup thành công đến `return_initiated_at`, thời điểm server ghi nhận nhân viên kiểm tra trả xe thực tế tại trạm theo mục 7. Thời gian giữ xe chưa bàn giao không tính tiền; thời gian chờ thanh toán sau mốc này không tính thêm. Tạm dừng di chuyển trước mốc này vẫn tính tiền.
- Tối thiểu một block, kể cả nhận rồi trả ngay. Không thêm phí mở khóa, không phụ thu trả khác trạm, không có trần ngày hoặc gói ngày/tháng trong V1 này.
- Làm tròn tổng tiền sau giảm giá đến 1 đồng bằng HALF_UP; API vẫn biểu diễn tiền bằng chuỗi, ví dụ `"10000.00"`.
- Backend tính theo thời gian UTC với độ chính xác lưu trữ; không bỏ giây lẻ trước khi làm tròn. Đúng 30 phút chỉ thu 10.000đ; vượt 30 phút dù nhỏ hơn một giây tính thêm một phút. Timestamp ngược thứ tự phải bị từ chối.

```text
elapsed_seconds = return_initiated_at - actual_start_time
extra_minutes = ceil(max(elapsed_seconds - 1800, 0) / 60)
rental_fee = first_30_minutes_price_snapshot + extra_minutes × extra_minute_price_snapshot
total_due = HALF_UP(rental_fee - valid_discount, đến 1 đồng)
```

`valid_discount` chỉ nhận kết quả từ chính sách khuyến mãi đã được chốt riêng; các ví dụ trong file dùng 0, không tự phê duyệt mục khuyến mãi. Thiếu cấu hình bắt buộc phải trả POLICY_NOT_CONFIGURED, không âm thầm dùng giá 0.

| Thời gian thuê | Phút tính thêm | Phí với giá demo |
| --- | ---: | ---: |
| 1 phút | 0 | 10.000đ |
| Đúng 30 phút | 0 | 10.000đ |
| 30 phút 1 giây | 1 | 10.350đ |
| Đúng 31 phút | 1 | 10.350đ |
| 31 phút 1 giây | 2 | 10.700đ |
| Đúng 2 giờ | 90 | 41.500đ |
| 5 giờ 30 phút | 300 | 115.000đ |

Lý do: phù hợp chuyến ngắn giữa các trạm; dễ hiển thị và kiểm thử hơn việc bắt chuyến ngắn trả tối thiểu một ngày. Đây là thay đổi so với đề xuất tính theo ngày trong kế hoạch cũ.

### 6.3. Snapshot tại giữ xe

- Khi tạo rental thành công, lưu `first_30_minutes_price_snapshot`, `extra_minute_price_snapshot`, `deposit_amount_snapshot`, `vehicle_type_snapshot`, `pricing_policy_version` và đơn vị tính phí.
- Frontend hiển thị giá 30 phút đầu, giá mỗi phút thêm, cọc và cách làm tròn trước khi khách xác nhận giữ xe.
- Giá/cọc mới do MANAGER cập nhật chỉ áp dụng cho rental tạo sau thay đổi. Rental đang giữ hoặc đang thuê vẫn dùng snapshot cũ.
- Hết hạn/hủy rồi đặt lại là rental mới, dùng giá/cọc hiện hành.
- Lưu lịch sử thay đổi giá gồm giá cũ/mới, người sửa và thời điểm. Không sửa lịch sử hóa đơn.
- Quote, return và báo cáo đều đọc snapshot; không tính lại tiền chuyến cũ bằng giá hiện tại trong bảng vehicles.

Ví dụ: khách giữ lúc giá 10.000đ/30 phút đầu + 350đ/phút thêm, sau đó quản lý đổi thành 12.000đ + 400đ/phút. Khách nhận trong hạn vẫn dùng cả hai mức cũ; đặt lại sau hết hạn dùng cả hai mức mới.

### 6.4. Cọc và số dư

- Cọc cấu hình theo xe qua `deposit_amount`; seed ban đầu: `100000.00`.
- Khi giữ xe: ví phải ACTIVE và số dư ít nhất bằng cọc snapshot cộng giá một block snapshot. Chỉ kiểm tra, chưa trừ/khóa tiền.
- Khi pickup: kiểm tra lại cùng điều kiện; thu cọc và ghi biên bản, chuyển trạng thái chuyến/xe trong cùng transaction. Với seed, cần số dư ít nhất 110.000đ, trừ cọc 100.000đ, còn 10.000đ trong ví.
- Cọc được ghi riêng theo rental; không còn là số dư có thể chi tiêu và không được tính là doanh thu thuê.
- Hủy giữ chỗ hoặc hết 30 phút trước pickup: không thu phí, không mất cọc vì chưa thu cọc. Sau pickup không dùng API cancel để kết thúc chuyến; phải return.
- Trả xe: dùng cọc để thanh toán, thu thêm nếu thiếu, hoàn phần dư vào ví nếu thừa. Không coi thiếu phần thu thêm là được phép trừ hết cọc và ghi thanh toán dở.
- Không giữ giấy tờ bản gốc làm cọc. Không tự động khấu trừ phí hỏng/mất xe chưa được chốt.

```text
additional_payment = max(total_due - deposit_held, 0)
deposit_refund = max(deposit_held - total_due, 0)
wallet_after_return = wallet_before_return - additional_payment + deposit_refund
```

| Tình huống (không giảm giá) | Kết quả |
| --- | --- |
| Ví 150.000đ trước pickup | Sau thu cọc: ví 50.000đ, cọc đang giữ 100.000đ |
| Cùng chuyến trên kiểm tra trả sau 2 giờ, phí 41.500đ | Hoàn cọc dư 58.500đ; ví cuối 108.500đ |
| Cùng số dư ban đầu, kiểm tra trả sau 5 giờ 30 phút, phí 115.000đ | Thu thêm 15.000đ; ví cuối 35.000đ |
| Hủy trước pickup | Ví không thay đổi, không phát sinh thu/hoàn cọc |

Sổ giao dịch phải giải thích được phần cọc đã dùng, phần hoàn và phần thu thêm; không ghi khoản tiền 0 hoặc cộng tiền thuê hai lần. Retry chỉ ghi một lần.

### 6.5. Điều kiện khách và giấy tờ

- Chính sách nội bộ demo V1 theo yêu cầu trưởng nhóm: khách đủ 16 tuổi tại ngày giữ xe và ngày nhận xe; tài khoản CUSTOMER ACTIVE. Tuổi tính theo ngày sinh đã xác minh và ngày hiện tại tại Asia/Ho_Chi_Minh, không chia số ngày cho 365.
- Chỉ yêu cầu CCCD còn hiệu lực và VERIFIED. Không yêu cầu GPLX; không dùng PASSPORT thay CCCD trong điều kiện thuê V1.
- Đây là quy tắc sản phẩm demo, không phải kết luận pháp lý rằng người đủ 16 tuổi được vận hành mọi loại xe máy điện. Danh mục vận hành thực tế cần được đối chiếu riêng với điều kiện sử dụng từng loại xe.
- Có thể đăng ký, xem trạm/xe trước khi được duyệt; chỉ được giữ xe khi đủ điều kiện trên. Kiểm tra lại lúc pickup; nhân viên đối chiếu khách với hồ sơ.
- Nộp lại giấy tờ tạo bản PENDING mới; bản VERIFIED cũ còn hiệu lực vẫn dùng được nếu chưa bị thu hồi. Bản mới PENDING không tự thay thế bản đã duyệt; hết hạn/thu hồi bản cũ thì phải chờ bản mới được duyệt.
- Không cho tự duyệt hồ sơ; không lưu ảnh hoặc số giấy tờ đầy đủ trong API danh sách/log.

Schema cần bổ sung ngày sinh đã xác minh, hạn CCCD, thông tin người/thời điểm xác minh và trạng thái thu hồi. Nghiệp vụ phải kiểm đúng loại CCCD, hạn giấy tờ và tuổi. Enum cũ có thể giữ PASSPORT/DRIVER_LICENSE để bảo toàn lịch sử, nhưng chúng không được dùng làm điều kiện bắt buộc hoặc thay CCCD trong V1.

### 6.6. Pin và sức chứa

- `MIN_RENTAL_BATTERY_PERCENT = 30` tại thời điểm giữ xe và pickup; đúng 30% được phép, 29% không được phép.
- Xe có thể giữ phải AVAILABLE, ở trạm hoạt động/đang mở và không có lỗi/phiếu bảo trì chặn vận hành, ngoài điều kiện pin.
- Pin giảm dưới 30% sau khi giữ: không được pickup; cho khách hủy miễn phí rồi đặt xe khác, không âm thầm đổi vehicle_id trong rental.
- Không từ chối nhận lại xe chỉ vì pin dưới 30%; không tự thu phí pin thấp. Nhân viên ghi pin thực tế lúc trả.
- Xe trả còn thấp pin nhưng không hỏng có thể có trạng thái AVAILABLE về mặt vòng đời; bộ lọc `rentable` và available_vehicle_count phải loại xe dưới ngưỡng. Xe vẫn chiếm chỗ trạm.
- Nhân viên ghi nhận pin sau khi sạc bằng thao tác có quyền/audit; chỉ mở lại khả năng thuê khi đạt ngưỡng và không còn lỗi chặn.
- Pin 30% không được quảng cáo thành số km bảo đảm. Đây là ngưỡng demo do EVRide chọn, không phải tiêu chuẩn được các nguồn tham khảo xác nhận.

#### Đếm xe và sức chứa bằng truy vấn động

- Tuyệt đối không lưu cột đếm vật lý `available_vehicle_count`, `rentable_vehicles`, `occupied_spaces` hoặc `free_slots` trong bảng `stations`. Về sức chứa, bảng chỉ lưu `capacity`; các trường thông tin trạm khác vẫn giữ nguyên.
- `rentable_vehicles = COUNT(*)` xe tại trạm có `status = 'AVAILABLE' AND battery_percent >= 30` và không có phiếu bảo trì đang hoạt động (`NOT EXISTS` phiếu OPEN/IN_PROGRESS). Chỉ hiển thị khả năng đặt khi trạm hoạt động và đang mở.
- `free_slots = capacity - COUNT(*)` tất cả xe có `current_station_id = station.id`, bất kể pin/trạng thái, gồm xe RESERVED, MAINTENANCE và đang chờ thanh toán tại trạm.
- Dùng truy vấn tổng hợp hoặc View thông thường; không dùng bộ đếm lưu sẵn làm nguồn quyết định. Không JOIN phiếu bảo trì theo cách nhân đôi số xe.
- Để giữ tương thích contract: `available_vehicle_count` trong response là alias tính động của `rentable_vehicles`; `available_spaces` là alias của `free_slots`, không phải cột DB.
- Khi thêm xe, điều chuyển hoặc bắt đầu nhận trả, khóa dòng station rồi đếm lại trong transaction; mọi luồng đưa xe vào trạm phải theo cùng quy tắc. Không che số âm bằng max(0, ...); dữ liệu sai phải báo lỗi và chặn nhận thêm.

### 6.7. Ràng buộc chuyến, hạn mức và khóa

- Mỗi customer chỉ có tối đa một rental RESERVED, IN_RENT hoặc RETURN_PENDING. Rental STOLEN chưa giải quyết cũng chặn đặt xe mới.
- Một xe chỉ có tối đa một rental RESERVED/IN_RENT/RETURN_PENDING/STOLEN.
- RESERVED hết hạn phải chuyển EXPIRED trong transaction trước khi cho đặt mới. Không dùng thời gian hiện tại trong điều kiện partial unique index.
- Thêm partial unique index cho customer_id và vehicle_id với trạng thái RESERVED/IN_RENT/RETURN_PENDING/STOLEN. RETURN_PENDING là xe đã được nhân viên giữ tại trạm nhưng còn chờ quyết toán theo mục 7.
- Hai request đồng thời của cùng khách đặt hai xe: chỉ một request được thành công. Không hỗ trợ thuê hộ/thuê nhóm trong V1.
- Hủy/hết hạn/trả hoàn tất mới cho đặt lượt tiếp theo, nếu tài khoản và ví vẫn đủ điều kiện. Không tự giải phóng rental STOLEN theo timeout 30 phút.

#### Giới hạn hủy/hết hạn theo ngày

- **Mỗi khách tối đa hủy/để hết hạn 3 lần/ngày**, tính tổng CANCELLED + EXPIRED, không phải 3 lần mỗi loại. Sau lần thứ ba, chặn tạo lượt giữ mới đến 00:00 ngày tiếp theo tại Asia/Ho_Chi_Minh.
- Trước khi tạo rental, kiểm tra số lần trong ngày nhỏ hơn 3; khi đã bằng 3 trả 409 `DAILY_CANCELLATION_LIMIT_REACHED`. Không cấm hủy để ép khách phải nhận xe.
- Ngày ghi nhận: hủy dùng `cancelled_at`; hết hạn dùng `expires_at`, không dùng giờ job/Lazy Expiration chạy. Biên ngày quy đổi từ giờ Việt Nam sang UTC để truy vấn.
- Mỗi rental chỉ tính một lần, kể cả request retry hoặc job và API chạy đồng thời. Hủy sau hạn phải được xử lý thành EXPIRED trước, không tạo thêm lần CANCELLED.
- Hủy do khách hoặc hết hạn đều tính hạn mức. Hủy do lỗi xe/hệ thống được nhân viên xác nhận (ví dụ pin tụt dưới ngưỡng sau giữ) không tính; lưu reason, người xác nhận và audit, khách không tự chọn lý do miễn trừ.
- Kiểm hạn mức sau Lazy Expiration dưới khóa customer; dùng dữ liệu rental/audit làm nguồn, không reset bộ đếm bằng cron.

#### Lazy Expiration trước khi kiểm tra đặt xe

- Trong transaction đặt xe, trước kiểm tra các điều kiện đặt, tìm **mọi** rental RESERVED có `expires_at <= thời điểm kiểm tra` thỏa `customer_id = khách đang gọi OR vehicle_id = xe đang chọn`. Phải xử lý cả hai phía, không chỉ lượt giữ trên xe đang chọn.
- Chuyển các rental đó sang EXPIRED; chỉ giải phóng xe nếu còn RESERVED cho chính lượt đó và không có lỗi/bảo trì chặn. Giữ lịch sử, hạn gốc và ngày tính hạn mức; không sửa lượt IN_RENT/RETURN_PENDING/STOLEN.
- Ý nghĩa nghiệp vụ là `expires_at <= NOW()`. Với PostgreSQL, `NOW()` cố định từ đầu transaction: sau khi chờ lấy khóa phải lấy giờ thực tế mới bằng `clock_timestamp()` và dùng một mốc chung cho kiểm tra này. Không dùng thời gian cũ trước khi chờ khóa để nhận/đặt xe quá hạn.
- Sau khi dọn, kiểm tra lại số lượt, hạn mức, tài khoản, ví, xe và trạm; chỉ tạo created_at/expires_at mới khi đủ điều kiện. Nếu từ chối đặt do điều kiện nghiệp vụ, vẫn commit việc dọn hết hạn đã hợp lệ rồi trả lỗi; lỗi hệ thống thì rollback. Không raise lỗi làm vô tình rollback việc dọn khi cần lưu kết quả.

Các luồng TV1/TV2 và các module trước/sau khi tách `trips` phải theo cùng một orchestration contract: `station → customer → wallet → vehicle → rental`, khóa ID tăng dần trong từng nhóm, khóa xong đọc lại, xử lý expiration trong transaction, cùng quy tắc commit/rollback và idempotency. Không nhân đôi thao tác ghi trạng thái rental/xe/ví ở router hoặc module khác. Trước khi tách module, test PostgreSQL thật cho hai xe cùng customer, hai customer cùng xe, hai request cùng chỗ cuối, rollback giữa các bước ghi và retry sau timeout.
- Job định kỳ chỉ giúp dọn sớm. Tính đúng ở mỗi thao tác không phụ thuộc job; đây không phải cam kết mọi dòng DB tự đổi trạng thái đúng từng giây khi không có request/job.

#### Thứ tự khóa toàn cục (Global Lock Order)

**`station → customer → wallet → vehicle → rental`**. `customer` là dòng trong bảng `users` có vai trò CUSTOMER. Trong cùng một nhóm, khóa theo ID tăng dần; chỉ bỏ qua nhóm không cần dùng, tuyệt đối không khóa ngược thứ tự.

- Chọn **customer làm khóa điều phối bắt buộc** cho mọi thao tác của khách có thay đổi giữ xe, chuyến, ví, cọc hoặc hạn mức, kể cả nạp tiền và MANAGER đổi trạng thái ví. Vì customer–wallet là 1–1, đọc ví dưới khóa customer không cần thêm SELECT FOR UPDATE ví chỉ để tuần tự hóa. Không được tùy luồng chọn customer hoặc wallet làm khóa thay thế.
- UPDATE ví vẫn tạo khóa dòng thực tế. Nếu luồng sẽ cập nhật ví sau khi đã khóa vehicle/rental, phải khóa wallet trước vehicle/rental theo thứ tự trên (hoặc thực hiện cập nhật ví đúng thứ tự). Không được hiểu quan hệ 1–1 là loại bỏ mọi nhu cầu khóa ví. Khóa ẩn do UPDATE/FK cũng cần được review.
- Khóa tất cả trạm liên quan (điều chuyển: cả trạm nguồn/đích), sau đó tất cả customer liên quan, wallet cần ghi, vehicle và rental. Bản ghi quote/promotion/idempotency dùng thêm phải có thứ tự ổn định sau các nhóm trên; không giữ khóa phụ rồi quay lại khóa station/customer.
- Lazy Expiration có thể chạm xe khác của cùng khách hoặc khách khác đang giữ xe được chọn. Đọc sơ bộ để thu thập đầy đủ tập trạm/customer/xe/rental, khóa theo thứ tự, rồi đọc lại xác minh. Nếu phát hiện thêm tài nguyên hoặc quan hệ thay đổi, rollback và retry với tập đầy đủ; không khóa bổ sung một nhóm đứng trước khi đã giữ nhóm sau.
- Dùng cùng cơ chế cho reserve/cancel/expiry/pickup/return/move và giao dịch ví. Retry deadlock có giới hạn, kết hợp idempotency và unique index; thứ tự khóa không thay thế kiểm tra trạng thái sau khóa.

API tạo rental: sau Lazy Expiration, nếu khách còn lượt chưa giải quyết trả 409 ACTIVE_RENTAL_EXISTS; nếu xe bị giữ/thuê trả 409 VEHICLE_UNAVAILABLE; hết hạn pickup trả 409 RESERVATION_EXPIRED. Xe chuyển RESERVED khi đặt, vẫn ở trạm. Mỗi thao tác lấy giờ server sau khi có khóa; giữ created_at/expires_at gốc. GET không được hiển thị lượt quá hạn như còn hiệu lực; replay idempotency vẫn trả kết quả gốc, khách cần GET để biết trạng thái hiện tại. Khi đặt lại dùng rental và key mới.

### 6.8. Tiếp nhận xe và quyết toán hai giai đoạn

- Chốt kết hợp: **đóng băng thời gian cước bằng `return_initiated_at` và giữ báo giá 10 phút bằng `quote_expires_at`**. Thay thời hạn báo giá cũ trong luồng trả xe này.
- Tách hai hành động: xem báo giá ước tính không dừng cước; chỉ STAFF/MANAGER bấm kiểm tra trả xe sau khi xác nhận xe thực tế đã ở trạm và được nhân viên giữ mới được đóng băng cước. Khách không tự ghi timestamp hoặc tự dừng cước.
- Bổ sung hành động `POST /rentals/{id}/initiate-return` có Idempotency-Key. Dưới khóa theo thứ tự mục 6, kiểm tra rental IN_RENT, đúng xe, trạm hoạt động/còn chỗ và pin/tình trạng xe thực tế; server lấy giờ sau khi có khóa, lưu `return_initiated_at` bất biến, `actual_end_time` bằng mốc nhận xe này, `actual_return_station_id`, biên bản RETURN, xe tại trạm với trạng thái RETURN_PENDING và rental RETURN_PENDING trong một transaction.
- Ghi `settled_at` riêng khi quyết toán thành công. Thời điểm kết thúc sử dụng/nhận lại xe khác thời điểm trả tiền; không thay `actual_end_time` bằng thời điểm thanh toán.
- RETURN_PENDING chiếm một chỗ trạm, chặn khách đặt mới, chặn xe cho thuê/điều chuyển và không tự thành AVAILABLE. Nhân viên giữ xe trong thời gian chờ, khách không tiếp tục sử dụng. Gọi lại initiate-return chỉ trả phiên đã có, không đổi trạm hoặc mốc dừng cước. V1 không có resume/hủy đóng băng cước.
- Phạm vi thanh toán: không trả một phần, không ví âm. Có trạng thái chờ quyết toán tại trạm nhưng chưa có hệ thống công nợ/thu hồi nợ riêng; MANAGER theo dõi các lượt RETURN_PENDING chưa giải quyết.
- Từ lúc bắt đầu kiểm tra trả hợp lệ, phí thuê cố định theo snapshot và `return_initiated_at`. Kiểm tra đủ tiền bằng `wallet.balance >= additional_payment`, không yêu cầu ví đủ toàn bộ hóa đơn khi đang có cọc.
- Quote chốt tổng tiền và các khoản cọc/giảm giá hợp lệ; gắn với rental, trạm thực tế, phiên bản chính sách và trạng thái các nguồn liên quan. `quote_expires_at = quote_created_at + 10 phút`; hợp lệ khi giờ thực tế sau khóa < hạn. Quote không trừ tiền hoặc tiêu thụ mã. Điều kiện khuyến mãi vẫn theo chính sách riêng; thay đổi điều kiện/mã làm quote cũ không còn hợp lệ thì trả STALE_QUOTE trước khi quyết toán.
- Với quote còn hợp lệ và các điều kiện khác không thay đổi, tổng tiền không tăng do chờ thanh toán. Hết hạn quote hoặc đổi mã thì lấy quote mới, nhưng **không đổi mốc dừng cước**. Các khoản giảm có thể thay đổi theo chính sách khuyến mãi riêng; cước thuê gốc không tăng.
- Return quyết toán chỉ thành công khi rental RETURN_PENDING, xe vẫn ở trạm đã ghi nhận, ví ACTIVE, quote hợp lệ và đủ phần thu thêm. Không kiểm tra "còn một chỗ trống" thêm lần nữa: xe đã chiếm chỗ khi initiate-return, tránh từ chối sai khi chính nó làm trạm đầy.
- Thiếu tiền: trả INSUFFICIENT_BALANCE, giữ rental/xe RETURN_PENDING và biên bản RETURN đã ghi; không phát hành hóa đơn PAID, không tiêu thụ mã, không trừ thêm/cấn trừ cọc dở. Không rollback lần tiếp nhận vật lý đã commit trước đó và không khởi động lại đồng hồ phí.
- Ví FROZEN/LOCKED: từ chối quyết toán với lỗi ví theo contract, kể cả cọc đủ; MANAGER xử lý trạng thái ví trước khi thử lại. Không ngăn tiếp nhận xe thực tế/đóng băng cước chỉ vì ví khóa hoặc thiếu tiền.
- Khách nạp bổ sung qua luồng demo được bật riêng. Nếu quote còn hiệu lực thì dùng lại, nếu hết hạn thì lấy mới; phí thuê vẫn theo mốc cố định.
- Khi quyết toán thành công, ghi hóa đơn PAID, bút toán cấn trừ/hoàn cọc/thu thêm, tiêu thụ mã, rental COMPLETED, settled_at và xe AVAILABLE/MAINTENANCE theo tình trạng trong cùng transaction. Không tạo biên bản RETURN thứ hai; xe AVAILABLE pin thấp vẫn bị bộ lọc thuê loại. Retry không ghi sổ hai lần; lỗi giữa transaction quyết toán rollback phần quyết toán, giữ nguyên phiên tiếp nhận đã commit.

Ví dụ: nhân viên tiếp nhận sau 5 giờ 30 phút, phí cố định 115.000đ; cọc 100.000đ, ví còn 10.000đ thì cần thu thêm 15.000đ, thiếu 5.000đ. Xe ở trạm và rental RETURN_PENDING. Khách nạp thêm 5.000đ sau 12 phút: quote đầu đã hết hạn, lấy quote mới vẫn có phí thuê 115.000đ nếu không thay khuyến mãi; quyết toán xong ví còn 0đ. Không cộng 12 phút chờ vào cước.

Thay đổi này cần bổ sung RETURN_PENDING cho rental và vehicle, cùng các trường timestamp, endpoint và test trong schema/contract. Không chỉ thêm quote_expires_at vào response rồi coi như đã xử lý việc nhận xe khi thiếu tiền. Báo cáo thời lượng dùng actual_start_time/actual_end_time; doanh thu vẫn chỉ tính COMPLETED + hóa đơn PAID theo định nghĩa contract, không tính RETURN_PENDING là doanh thu đã thu.

### 6.9. Schema báo giá

ReturnQuote trả đủ các trường sau. Ví dụ không dùng khuyến mãi: pickup 03:00, nhân viên nhận xe 05:00, báo giá tạo 05:01, hết hạn 05:11 (UTC). Cọc 100.000đ; cước 2 giờ là 41.500đ.

```json
{
  "rental_id": "501",
  "return_station_id": "11",
  "is_estimate": false,
  "return_initiated_at": "2026-11-02T05:00:00Z",
  "quote_created_at": "2026-11-02T05:01:00Z",
  "quote_expires_at": "2026-11-02T05:11:00Z",
  "elapsed_seconds": 7200,
  "currency": "VND",
  "pricing_policy_version": "EVRIDE_DEMO_V1_20261102_R2",
  "rental_fee": "41500.00",
  "discount_amount": "0.00",
  "total_amount": "41500.00",
  "deposit_held": "100000.00",
  "deposit_applied": "41500.00",
  "additional_payment": "0.00",
  "deposit_refund": "58500.00",
  "promotion_code": null,
  "quote_token": "opaque-server-issued-token"
}
```

Trong IN_RENT, return-quote chỉ trả ước tính (`is_estimate=true`, return_initiated_at=null), tính đến quote_created_at; không dừng cước hoặc giữ chỗ. Token ước tính không dùng để quyết toán. Trong RETURN_PENDING, trạm phải khớp actual_return_station_id, báo giá có is_estimate=false và chỉ lấy thời lượng đã khóa. deposit_applied=min(deposit_held,total_amount). Tổng tiền làm tròn HALF_UP đến 1 đồng.

Token phải ràng buộc rental, phiên tiếp nhận, trạm, snapshot/version, tiền cọc, mã giảm giá và phiên bản/trạng thái nguồn liên quan. Token hết hạn đúng tại quote_expires_at; sai nguồn hoặc token ước tính trả 409 STALE_QUOTE trước mọi tác động tài chính. Thay giá hiện hành của xe không đổi snapshot và không làm chuyến cũ tăng giá.

Chưa có chính sách khuyến mãi được duyệt: request có promotion_code trả 503 POLICY_NOT_CONFIGURED, không âm thầm bỏ mã. Request không chọn mã dùng discount_amount=0 một cách tường minh; không coi đây là phê duyệt quy tắc khuyến mãi.

Gọi initiate-return lần nữa với cùng dữ liệu trả phiên đã có, kể cả key khác, không tạo RETURN thứ hai hoặc đổi timestamp. Dữ liệu khác phiên đã lưu bị từ chối 409 INVALID_RENTAL_STATE; sau COMPLETED chỉ replay key đã thành công, không mở lại chuyến. Return retry cùng key replay kết quả; key khác khi đã COMPLETED trả 409 INVALID_RENTAL_STATE, không thu lại tiền.

## 7. Ví, hóa đơn và lịch sử giao dịch

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| GET `/wallets/me` | C | — | Wallet |
| GET `/wallets/me/transactions` | C | `type?, status?, from?, to?`, phân trang | WalletTransaction[] |
| GET `/users/{id}/wallet` | M | — | Wallet |
| PATCH `/wallets/{id}/status` | M | `{status: "ACTIVE" hoặc "FROZEN" hoặc "LOCKED"}` | Wallet |
| POST `/wallets/me/topups` | C, I | `{amount}` | 201 `{wallet_transaction: WalletTransaction, payment_mode: "DEMO", wallet: Wallet}` |
| GET `/rentals/{id}/invoice` | Owner/S/M | — | Invoice; chưa phát hành trả 404 |
| GET `/rentals/{id}/transactions` | Owner/S/M | `kind?, status?`, phân trang | Transaction[] |

Topup ở đây là **luồng demo đã chốt về phạm vi**, chỉ bật khi cấu hình `DEMO_PAYMENTS_ENABLED` và giao diện hiện rõ tiền mô phỏng; amount > 0, ví ACTIVE, tạo TOPUP SUCCESS và tăng ví nguyên tử. Môi trường thanh toán thật phải tắt endpoint demo hoặc thay bằng contract provider đã duyệt; chưa có provider thì 503 `FEATURE_NOT_ENABLED`, không nhận tiền thật bằng cách cho client tự báo thành công.

Ví FROZEN/LOCKED không được nạp/trừ tự động. Không có API sửa trực tiếp balance hoặc tạo Transaction SUCCESS từ request khách. `balance_after` phải đúng với hướng tác động: TOPUP/RENTAL_REFUND cộng; WITHDRAW/RENTAL_PAYMENT/RENTAL_DEPOSIT trừ. Amount luôn là độ lớn dương; khoản bằng 0 không cần tạo bút toán.

V1 chưa mở rút ví, hoàn tiền thủ công, thu phí sự cố tùy ý hay webhook thật. Hoàn phần cọc dư khi trả xe thành công là luồng đã chốt, khác hoàn tiền thủ công.

Pickup ghi DEPOSIT/RENTAL_DEPOSIT đúng một lần; cọc chuyển khỏi ví sang khoản giữ riêng theo rental. Quyết toán ghi phần cọc cấn trừ trong sổ giao dịch rental (không trừ ví lần hai); chỉ phần additional_payment mới ghi RENTAL_PAYMENT trừ ví, phần deposit_refund ghi RENTAL_REFUND cộng ví. Khoản 0 không ghi bút toán. Tổng invoice là total_amount, không cộng cọc vào doanh thu. Wallet balance_after phải khớp công thức mục 6.4. Ví phải ACTIVE kể cả khi cọc đủ.

Không tích hợp hoặc bật thanh toán thật trong V1. Tài liệu thiết kế mô tả interface PaymentProvider với bản triển khai mô phỏng; provider thật (VNPay/MoMo/ZaloPay), xác minh webhook tại server và đối soát nằm ngoài phạm vi. Giao diện ví/nạp/thanh toán có nhãn “Tiền mô phỏng”. DEMO_PAYMENTS_ENABLED phải bật rõ ràng để nạp demo; tắt hoặc thiếu cấu hình thì FEATURE_NOT_ENABLED. Không có API nhận xác nhận thanh toán thật từ client.

## 8. Khuyến mãi

Yêu cầu đã chốt cho phần xử lý: có giảm theo phần trăm hoặc số tiền cố định; phạm vi tùy chọn theo mẫu xe; mỗi mã có hạn mức tổng số lượt. Do EVRide chỉ phục vụ xe điện, không lọc promotion theo `vehicle_type`. Các endpoint dưới đây vẫn là thiết kế contract, chưa được triển khai. Backend hiện có service tính giảm và tiêu thụ lượt dùng, nhưng chưa có luồng quote/thanh toán để gọi service; không coi service độc lập là thanh toán đã tích hợp.

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| GET `/promotions` | C/M | `status?`, phân trang | Promotion[]; C chỉ ACTIVE trong thời hạn |
| POST `/promotions` | M | `{code, description?, discount_type, discount_value, max_discount_amount?, min_rental_amount?, vehicle_model?, usage_limit, start_date, end_date}` | 201 Promotion ACTIVE |
| PATCH `/promotions/{id}` | M | `{status: "ACTIVE" hoặc "DISABLED"}` | Promotion |
| POST `/promotions/{id}/claim` | C, I | `{}` | 201 UserPromotion |
| GET `/users/me/promotions` | C | `is_used?`, phân trang | UserPromotion[] |

`discount_type` nhận `PERCENTAGE` (giá trị nguyên 1–100) hoặc `FIXED_AMOUNT` (số tiền VND dương, tối đa 2 chữ số thập phân). `max_discount_amount` chỉ hợp lệ cho `PERCENTAGE`; giảm cố định và giảm phần trăm đều không vượt tiền thuê. Code viết hoa, tối đa 50 ký tự và unique; `end_date > start_date`. `usage_limit` bắt buộc là số nguyên dương khi tạo mã; `used_count` do server quản lý. Mã cũ chưa có hạn mức có `usage_limit = null` và chưa bị giới hạn cho tới khi quản trị cấu hình. Không sửa giá trị giảm/phạm vi của mã đã phát hành; tạo mã mới để giữ lịch sử.

Một user chỉ nhận một bản của mỗi mã (unique user_id/promotion_id). Claim lặp khác key trả 200 bản đang có, không nhân bản. Claim không giữ chỗ lượt dùng. Khi thanh toán, điều kiện gồm `start_date <= thời điểm thanh toán < end_date`, ACTIVE, claim thuộc user và chưa dùng, chưa hết hạn mức, đủ `min_rental_amount` nếu có. Nếu promotion có `vehicle_model`, mẫu phải khớp `vehicles.model` không phân biệt hoa thường. Mỗi rental dùng tối đa một mã.

Giảm trên rental_fee, không giảm cọc/phí sự cố. `PERCENTAGE` áp dụng `discount_value` phần trăm và giới hạn `max_discount_amount` nếu có; `FIXED_AMOUNT` trừ tối đa bằng tiền thuê. Tổng thuê sau giảm làm tròn đến 1 VND bằng `HALF_UP` theo R2. Quote không tiêu thụ mã; khi thanh toán thành công, service `app.services.promotions.consume_promotion` khóa promotion/claim, tăng `used_count` và cập nhật `is_used/used_at`; caller phải chạy cùng transaction quyết toán để rollback đồng bộ nếu thanh toán thất bại. Mức cap bị tranh chấp giữa các giao dịch được quyết định lại dưới khóa promotion, hết lượt trả `409 PROMOTION_EXHAUSTED`. Snapshot giữ loại/giá trị giảm, code, mẫu xe và số tiền giảm.

## 9. Sự cố, bảo trì và đánh giá

**Quy trình sự cố/mất xe chờ bổ sung/chưa duyệt theo mục 12 của v1-decisions.** Schema ticket, endpoint và vòng đời ticket bên dưới là đề xuất. Chưa duyệt chính sách phụ thuộc thì từ chối thao tác bằng 503 POLICY_NOT_CONFIGURED. Không thêm CLOSED_INCIDENT hoặc endpoint xác nhận/khôi phục mất xe. Chưa chốt cách xử lý cọc, hóa đơn, bồi thường hoặc giải phóng rental STOLEN. Ràng buộc STOLEN tại mục 6.7 vẫn có hiệu lực. Quy tắc đánh giá chuyến COMPLETED, bảo trì thông thường và ảnh bằng chứng là các luồng riêng. API phiếu bảo trì dưới đây là hợp đồng/schema đề xuất, **chưa có nghĩa chức năng đã được triển khai**.

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| POST `/rentals/{id}/support-tickets` | Owner/S/M | `{title, description}` | 201 Ticket OPEN; created_by lấy từ token |
| GET `/support-tickets` | C/S/M | `status?, rental_id?`, S/M thêm `assigned_to?`, phân trang | Ticket[]; C chỉ ticket của rental mình |
| GET `/support-tickets/{id}` | Owner/S/M | — | Ticket |
| PATCH `/support-tickets/{id}` | S/M | `{assigned_to?, status?}` | Ticket |
| GET `/maintenance-orders` | S/M | `vehicle_id?, status?, assigned_to?`, phân trang | MaintenanceOrder[] |
| POST `/maintenance-orders` | S/M, I | `{vehicle_id, title, description, assigned_to?}` | 201 MaintenanceOrder OPEN |
| GET `/maintenance-orders/{id}` | S/M | — | MaintenanceOrder |
| POST `/maintenance-orders/{id}/start` | S/M, I | `{assigned_to?}` | MaintenanceOrder IN_PROGRESS |
| POST `/maintenance-orders/{id}/complete` | S/M, I | `{resolution_note}` | MaintenanceOrder COMPLETED |
| POST `/maintenance-orders/{id}/cancel` | S/M, I | `{reason}` | MaintenanceOrder CANCELLED |
| POST `/rentals/{id}/review` | C sở hữu | `{rating, comment?}` | 201 Review |
| GET `/rentals/{id}/review` | Owner/S/M | — | Review hoặc 404 |

Đề xuất ticket được tạo cho IN_RENT/RETURN_PENDING/STOLEN/COMPLETED; rental giữ chỗ chưa nhận không tạo báo hỏng trong chuyến. Assigned_to phải là STAFF/MANAGER ACTIVE; null bỏ phân công. Luồng OPEN → IN_PROGRESS → RESOLVED → CLOSED; cùng trạng thái là no-op; chuyển ngược trả 409 `INVALID_STATE_TRANSITION`.

`POST /maintenance-orders` chỉ nhận xe đang ở trạm và không có rental hiệu lực; tạo OPEN và đặt xe MAINTENANCE cùng transaction. Xe có rental RESERVED/IN_RENT/RETURN_PENDING/STOLEN trả 409 `ACTIVE_RENTAL_EXISTS`; không tự hủy chuyến. Một xe chỉ có tối đa một phiếu OPEN/IN_PROGRESS. Chuyển trạng thái theo OPEN → IN_PROGRESS → COMPLETED; chỉ OPEN được hủy. Thao tác hoàn tất/hủy không tự đưa xe về AVAILABLE: MANAGER phải kiểm tra xe và dùng endpoint trạng thái mục 5 sau khi không còn phiếu đang hoạt động hoặc rental/bộ chặn khác. Không có yêu cầu quản lý vật tư/chi phí trong schema V1 tối thiểu.

Ticket không tự dừng chuyến, tự hoàn tiền hoặc đổi xe MAINTENANCE. Ảnh báo hỏng gắn với ticket qua `file_attachments` và `purpose="TICKET_EVIDENCE"`. Chỉ đánh giá rental COMPLETED, mỗi rental một đánh giá; tạo lần hai trả 409 `ALREADY_REVIEWED`.

## 10. GPS và chatbot

**GPS chờ duyệt theo mục 10 của v1-decisions.** Các ngưỡng và endpoint GPS dưới đây tiếp tục là đề xuất; không tự bật tích hợp thật hoặc coi demo đã được duyệt. Phụ thuộc chưa sẵn sàng trả FEATURE_NOT_ENABLED.

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| GET `/rentals/{id}/gps/latest` | Owner/S/M | — | `{point: GpsPoint hoặc null, stale_after_seconds: 60, is_stale: boolean}` |
| GET `/rentals/{id}/gps` | Owner/S/M | `from?, to?`, phân trang | GpsPoint[] sắp recorded_at ASC, id ASC |
| POST `/rentals/{id}/gps` | S/M, chỉ demo, I | `{latitude, longitude, recorded_at}` | 201 GpsPoint |
| POST `/chatbot/messages` | C | `{message}` | `{reply, sources: [{title, url}], mode: "FAQ"}` |

GPS demo chỉ nhận rental IN_RENT; recorded_at không trước actual_start_time hoặc vượt giờ server quá 30 giây. `latest` chọn recorded_at lớn nhất; không có point thì is_stale=true. Đề xuất cảnh báo dữ liệu cũ sau 60 giây; frontend hiện thời điểm cập nhật, không giả định xe đang di chuyển từ dữ liệu cũ. C không được ghi tọa độ thay cho thiết bị xe.

GPS thật cần danh tính thiết bị, xác thực và chống replay riêng, chưa nằm trong hợp đồng 15 bảng. Endpoint demo tắt khi chạy thật; vượt phạm vi demo trả 503 `FEATURE_NOT_ENABLED`.

Chatbot FAQ không có lịch sử hội thoại lưu DB, message 1–2.000 ký tự, sources chỉ trỏ tài liệu đã được hệ thống duyệt. Chưa tích hợp trả 503 `FEATURE_NOT_ENABLED`; chatbot không được thay khách đặt xe, chuyển tiền hoặc quyết định quyền thuê.

## 11. Báo cáo

S/M được truy cập. Các endpoint dưới trả 200 theo envelope chung. Tham số `from_date`, `to_date` phải đi cùng nhau; bỏ cả hai lấy toàn bộ dữ liệu, có cả hai thì from_date <= to_date. Khoảng thời gian bao gồm ngày cuối bằng cách chuyển sang khoảng UTC `[đầu ngày from_date, đầu ngày sau to_date)` theo giờ Việt Nam.

| GET path | Query bổ sung | Schema `data` |
| --- | --- | --- |
| `/analytics/overview` | — | `{trip_count, revenue, average_trip_minutes, customer_count, vehicles_by_status: [{status, count}], recent_tickets: Ticket[], near_full_stations: Station[]}` |
| `/analytics/peak-hours` | `station_id?` | `{items: [{station_id, station_name, hour, rental_count}], filtered_trip_count, included_trip_count}`; tối đa 20 trạm |
| `/analytics/revenue` | — | `{items: [{month, vehicle_type, rental_count, revenue, cumulative_revenue, share_percent}], total_revenue}` |
| `/analytics/top-routes` | — | `{items: [{month, rank, pickup_station_id, return_station_id, rental_count}]}` |
| `/analytics/idle-time` | `limit` mặc định 15, 1–100 | `{items: [{station_id, station_name, average_idle_minutes}], coverage: "OBSERVED_RETURN_PICKUP_PAIRS"}` |
| `/analytics/inactive-customers` | `days` trong 14/30/60/90, mặc định 30; `as_of_date?`; phân trang; không dùng from_date/to_date | `{items: [{user_id, name, email, balance}], as_of_date, days}`; meta có phân trang |

Định nghĩa:

- Trip_count và heatmap đếm actual_start_time trong khoảng, không đếm RESERVED/CANCELLED/EXPIRED. Hour là 0–23 theo giờ Việt Nam. Heatmap chọn tối đa 20 trạm theo tổng số lượt DESC, station_id ASC; trả đủ 24 giờ cho từng trạm. `station_id` lọc một trạm cụ thể và không vượt giới hạn 20. `included_trip_count` là tổng lượt của các trạm hiển thị; `filtered_trip_count` là tổng trong phạm vi lọc trước khi giới hạn top 20.
- Revenue chỉ tính rental COMPLETED có hóa đơn PAID, theo actual_end_time; không cộng cọc/topup, không tính hai lần do JOIN nhiều giao dịch. Hoàn phần cọc dư đã có trong V1, không phải giảm doanh thu thuê. Hoàn phí thuê/hoàn tiền thủ công chưa mở; nếu mở phải bổ sung quy tắc doanh thu thuần. Không tính RETURN_PENDING là doanh thu đã thu; settled_at lưu thời điểm quyết toán riêng.
- month dạng `YYYY-MM`; cumulative_revenue cộng trong khoảng lọc theo từng loại xe, share_percent là chuỗi số có 2 chữ số lẻ, tháng tổng 0 thì tỷ trọng 0. Phải lưu loại xe/giá đã áp dụng hoặc khóa thay đổi làm sai lịch sử.
- Top routes đếm các chuyến COMPLETED theo actual_end_time, RANK theo số chuyến trong từng tháng, lấy rank <= 3; đồng hạng có thể trả hơn ba dòng.
- Idle-time: với cùng xe, lấy một lần trả và lần nhận kế tiếp tại cùng trạm, không có lần nhận khác xen giữa; chỉ tính cặp có cả hai mốc nằm trong khoảng lọc, bỏ xe có điều chuyển ngoài chuyến không chứng minh được lịch sử. Đây là thời gian nằm tại trạm quan sát được, gồm thời gian giữ chỗ, không khẳng định là thời gian AVAILABLE. Báo cáo đầy đủ cần lịch sử vị trí/trạng thái theo mục 13.
- Inactive: CUSTOMER ACTIVE, balance > 0, không có actual_start_time trong khoảng N ngày kết thúc ở đầu ngày sau as_of_date theo giờ Việt Nam. Mặc định as_of_date là ngày có actual_start_time mới nhất; không có chuyến thì dùng ngày server tại Việt Nam. Sắp balance DESC, user_id ASC.
- Overview: average_trip_minutes tính trên chuyến COMPLETED kết thúc trong khoảng; không có thì 0. Customer_count là số khách khác nhau có chuyến bắt đầu trong khoảng. Xe theo trạng thái/trạm sắp đầy là snapshot hiện tại; near_full_stations có available_spaces <= 1, ACTIVE, tối đa 10 theo available_spaces ASC, id ASC. recent_tickets là 5 ticket mới nhất hiện tại.
- Không có dữ liệu trả mảng rỗng/tổng 0, không trả 404. Truy vấn số liệu phải được đối chiếu độc lập khi kiểm thử.

`/prices` là endpoint quản lý đề xuất ở mục 5.1; bảng giá theo từng xe, có lịch sử append-only và snapshot bất biến tại thời điểm giữ xe. Doanh thu nhóm theo `vehicle_type_snapshot` từ rental snapshot, không suy ra loại xe/giá lịch sử từ giá trị hiện tại của `vehicles`.

## 12. Kiểm tra hệ thống và tiêu chí nghiệm thu

GET `/health`: Public, 200 `{status: "ok"}` trong envelope, không lộ cấu hình. GET `/health/ready`: chỉ hạ tầng nội bộ, 200 `{status: "ready"}` hoặc 503 `DEPENDENCY_UNAVAILABLE` nếu DB/migration chưa sẵn sàng.

| Ca kiểm thử | Kết quả bắt buộc |
| --- | --- |
| Hai khách đặt một xe đồng thời | Một 201, một 409 VEHICLE_UNAVAILABLE; chỉ một lượt giữ hiệu lực |
| Cùng một customer đặt hai xe đồng thời | Một request thành công, request còn lại 409 ACTIVE_RENTAL_EXISTS; xác minh customer row lock và partial unique customer index |
| Đặt trước nhiều ngày / truyền expires_at | 422 VALIDATION_ERROR |
| Nhận xe ngay trước hạn | Thành công nếu vẫn đủ điều kiện sau khi giành khóa |
| Nhận đúng hạn hoặc muộn hơn | 409 RESERVATION_EXPIRED |
| Tác vụ dọn hết hạn bị trễ | API vẫn từ chối nhận muộn, không hiển thị lượt còn hiệu lực |
| Đặt lại sau hết hạn | Rental ID mới, hạn mới; record cũ EXPIRED không đổi |
| Retry đặt với key cũ | Trả lượt cũ, không gia hạn |
| Pickup và cancel/hết hạn đồng thời | Chỉ một chuyển trạng thái, không xe vừa thuê vừa AVAILABLE |
| Trả khác trạm còn chỗ | Thành công, cập nhật trạm thực tế và biên bản RETURN |
| Hai xe tranh một chỗ trống khi initiate-return | Chỉ một tiếp nhận thành công, không vượt capacity |
| Quote hết hạn / nguồn giảm giá thay đổi | 409 STALE_QUOTE, chưa trừ tiền; giá xe hiện hành thay đổi không sửa snapshot |
| Thiếu tiền / ví khóa khi quyết toán | 409 tương ứng; giữ phiên RETURN_PENDING đã commit, cước không tăng; không ghi tài chính dở |
| Timeout rồi retry thanh toán | Không có hóa đơn, biên bản hoặc bút toán trùng |
| Hai chuyến dùng cùng mã cá nhân (sau khi chính sách khuyến mãi được duyệt) | Chỉ một lần tiêu thụ mã thành công |
| Khách xem rental/ví/GPS người khác | 404 hoặc 403 theo loại endpoint, không rò dữ liệu |
| Khách gọi pickup/return/báo cáo | 403 |
| Token của tài khoản bị khóa | 403 ACCOUNT_DISABLED |
| Dữ liệu báo cáo rỗng / khoảng ngày đảo | 200 với tổng 0 / 400 INVALID_DATE_RANGE |
| Demo payment/GPS tắt | 503 FEATURE_NOT_ENABLED, không tác động dữ liệu |
| Thay giá/cùng key replay | Chỉ có một version append-only, current price khớp version mới; replay không nhân đôi |
| Ghi lỗi giữa cập nhật giá/xe và history | Cả current price và history rollback |
| Mở/đóng maintenance order và xe active | Order chỉ OPEN/IN_PROGRESS chặn thuê; xe không tự AVAILABLE khi complete/cancel |
| Move audit lỗi/retry | Vị trí và audit rollback cùng nhau; replay không tạo audit thứ hai |
| Upload file không hợp lệ/chưa READY | 413/415 hoặc REJECTED theo lỗi; không tạo attachment/download URL |
| Attachment sai owner hoặc download trái quyền | Từ chối; object key không xuất hiện trong response |

Các ca bắt buộc bổ sung theo R2:

| Ca kiểm thử | Kết quả bắt buộc |
| --- | --- |
| 30 phút / 30 phút + giây lẻ / 31 phút / 31 phút + giây lẻ | 10.000 / 10.350 / 10.350 / 10.700đ, không giảm giá |
| Giá/cọc đổi sau giữ xe | Pickup, quote và return dùng snapshot cũ |
| Ví 110.000đ khi pickup, cọc 100.000đ | Ví còn 10.000đ, cọc giữ riêng 100.000đ; retry không thu thêm |
| Pin 29% / 30% khi đặt và pickup | Từ chối / cho phép nếu đủ điều kiện khác |
| Trả pin dưới 30% | Được tiếp nhận; xe không rentable sau hoàn tất dù AVAILABLE |
| Đúng sinh nhật 16 tuổi / CCCD hết hạn hoặc thu hồi | Đủ tuổi / từ chối thuê; PENDING mới không thay CCCD VERIFIED còn hiệu lực |
| Một khách đặt hai xe đồng thời | Chỉ một thành công; partial unique cho customer và vehicle |
| Lazy Expiration cả customer và vehicle | Dọn đủ hai phía; commit dọn khi từ chối nghiệp vụ; lỗi hệ thống rollback |
| Hủy/hết hạn lần 3, đặt lần tiếp theo, qua nửa đêm Việt Nam | Chặn đặt sau tổng 3 lần; ngày ghi hết hạn theo expires_at; ngày mới tính lại |
| Hủy lỗi xe được nhân viên xác nhận | Không tính hạn mức; khách không tự miễn trừ |
| Ví thiếu/khóa khi initiate-return | Tiếp nhận hợp lệ vẫn thành công, lưu RETURN và dừng cước |
| Retry initiate-return cùng/khác key | Không đổi mốc/trạm; không tạo RETURN thứ hai; dữ liệu khác bị từ chối |
| Quote đúng hạn 10 phút | Hết hiệu lực; quote mới không tăng cước gốc |
| Trạm đầy do chính xe RETURN_PENDING | Quyết toán vẫn được; không kiểm thêm một chỗ trống |
| Quyết toán lỗi giữa transaction | Rollback tài chính, giữ tiếp nhận đã commit; không tiêu thụ mã |
| Cọc thừa/thiếu và nạp ví đồng thời | Bút toán đúng, không ví âm, không trả một phần, không trừ cọc hai lần |
| STAFF thao tác ở nhiều trạm / CUSTOMER gọi API vận hành | Cho phép khi đủ điều kiện / 403 |
| STOLEN chưa giải quyết | Chặn đặt mới, không tự hết hạn; không tự áp chính sách mất cọc/khôi phục |
| Bộ đếm trạm | Đếm động, không nhân đôi khi JOIN bảo trì; tính cả RETURN_PENDING |

Kiểm thử tranh chấp dùng PostgreSQL thật với các kết nối độc lập. Frontend đếm ngược dựa expires_at/server_time, không dùng đồng hồ client để quyết định quyền nhận xe; tải lại dữ liệu sau lỗi xung đột.

## 13. Đối chiếu DBML và yêu cầu lưu trữ

Contract này phân biệt rõ: **15 bảng nghiệp vụ gốc** trong DBML ban đầu, **24 bảng ORM** sau khi bổ sung hạ tầng báo giá/bảo trì/file/idempotency/audit, và **26 bảng ORM** sau khi thêm hai bảng xác thực `user_sessions` và `refresh_tokens` (không tính `alembic_version`). Các yêu cầu sau phải được đồng bộ trước khi API liên quan sẵn sàng. Không trả dữ liệu giả để che thiếu schema.

| Hạng mục | Yêu cầu |
| --- | --- |
| Phiên & Refresh token | Bổ sung bảng `user_sessions` (UUID PK, FK `users.id` RESTRICT, `created_at`, `last_used_at`, `expires_at`, `revoked_at`, `revoke_reason`, metadata) và `refresh_tokens` (UUID PK, FK `user_sessions.id` CASCADE, `generation`, `token_hash` SHA-256 64 ký tự unique, `used_at`, `replay_until`, `replay_ciphertext`, partial unique `used_at IS NULL`). Grace replay lưu mã hóa Fernet có TTL ngắn ngay trong `refresh_tokens`; **tuyệt đối không** lưu raw token vào `idempotency_records`, `audit_logs` hay response log |
| Giá xe | Thay daily_price/price_per_30_minutes bằng first_30_minutes_price, extra_minute_price; giữ deposit_amount. Không tự chia giá ngày cũ để suy ra giá mới |
| Seed | 10.000đ/30 phút đầu, 350đ/phút thêm, cọc 100.000đ; chỉ áp dụng dữ liệu demo mới |
| Snapshot | Lưu first_30_minutes_price_snapshot, extra_minute_price_snapshot, deposit_amount_snapshot, vehicle_type_snapshot, pricing_policy_version, billing_unit ngay khi reserve thành công; lịch sử đổi giá/cọc |
| Trạng thái và thời gian | RETURN_PENDING cho rental/vehicle; return_initiated_at, actual_end_time, settled_at; expires_at=created_at+30 phút. settled_at khác mốc nhận xe |
| Phiên trả và quote | Lưu trạm, pin, tình trạng, RETURN bất biến; quote_created_at, quote_expires_at, nguồn/version và token. Hết hạn quote không đổi return_initiated_at |
| Unique lượt đang hoạt động | Hai partial unique index riêng trên customer_id và vehicle_id cho RESERVED/IN_RENT/RETURN_PENDING/STOLEN; không dùng NOW() trong predicate |
| Hủy/hết hạn | cancelled_at, reason, cancellation_limit_exempt, người xác nhận/audit; hết hạn tính ngày theo expires_at; không reset hạn mức bằng cron |
| CCCD/tuổi | Ngày sinh đã xác minh, expires_on, verified_by/verified_at, revoked_at và audit thu hồi; giữ lịch sử giấy tờ và không dùng bản PENDING thay bản VERIFIED hợp lệ |
| Cọc và giao dịch | Cọc riêng theo rental, liên kết DEPOSIT/PAYMENT/REFUND với bút toán ví và hóa đơn; cấn trừ cọc không trừ ví lần hai; unique định danh nghiệp vụ |
| Sức chứa | stations chỉ lưu capacity về sức chứa; bộ đếm tính động bằng COUNT/View thường; đếm cả RETURN_PENDING |
| Bảo trì | Bổ sung cấu trúc phiếu bảo trì OPEN/IN_PROGRESS hoặc mô hình chặn vận hành tương ứng có contract rõ ràng để thực thi bộ lọc NOT EXISTS đã chốt; không coi Ticket là phiếu bảo trì |
| Handover | UNIQUE(rental_id,kind), lưu pin/tình trạng/lý do và người thực hiện; chỉ một PICKUP và một RETURN |
| Idempotency/audit | Kho bền vững và request hash/kết quả, audit vận hành; review thứ tự khóa phụ sau nhóm station/customer/wallet/vehicle/rental |
| Khuyến mãi | Thiết kế dự kiến UNIQUE(user_id,promotion_id), snapshot mã/giảm giá và tiêu thụ nguyên tử; chờ duyệt chính sách mục 8 |
| STAFF | Không thêm staff_station_assignments trong V1; quyền vận hành toàn hệ thống, giữ giới hạn vai trò |
| GPS/upload/sự cố | Chờ duyệt; không thêm trạng thái CLOSED_INCIDENT hoặc tự quyết chính sách tài chính mất xe |
| CHECK/FK | Enum hợp lệ, capacity>0, pin 0–100, tiền không âm, thứ tự thời gian hợp lệ, FK và unique wallets.user_id/invoices.rental_id/rental_reviews.rental_id |

Migration phải bảo toàn nghĩa dữ liệu lịch sử. Nếu giá cũ chưa rõ đơn vị thì xử lý tường minh, không áp giá seed mới lên lịch sử. Giá trị chưa có vẫn null khi schema cho phép, không lấy 0 thay thiếu dữ liệu. Không xóa lịch sử liên quan tài chính. Kiểm tra tranh chấp trên PostgreSQL thật.

## 14. Trạng thái quyết định và việc cần đồng bộ

| Mục trong v1-decisions | Trạng thái | Phần contract liên quan |
| Thời hạn | Schema dùng rentals.expires_at, bỏ planned_start_time/planned_end_time; migration backfill hạn giữ chỗ 30 phút và backend phải kiểm tra/hết hạn |
| Trạng thái | Rental dùng RESERVED/IN_RENT/RETURN_PENDING/STOLEN/COMPLETED/CANCELLED/EXPIRED; vehicle có RETURN_PENDING; schema/migration phải có CHECK |
| Tiền chưa tính | rentals.total_price nullable trước khi chốt phí; migration giữ null khác 0 |
| Chống đặt trùng | Hai partial unique index theo vehicle_id và customer_id cho RESERVED/IN_RENT/RETURN_PENDING/STOLEN; expiration được cập nhật trong transaction, không dùng NOW() trong predicate |
| Bàn giao | Đã khai báo UNIQUE handovers(rental_id, kind); cần tạo bằng migration |
| Mã cá nhân | Có UNIQUE user_promotions(user_id, promotion_id); backend phải tiêu thụ voucher trong cùng transaction với thanh toán |
| Snapshot và lịch sử giá | Snapshot rental bất biến; `/prices` quản lý giá theo xe với version append-only, schema/API đề xuất tại mục 5.1 |
| Ghi sổ một lần | Có liên kết duy nhất wallet_transactions.transaction_id; backend phải ghi transaction, số dư ví và bút toán cùng một DB transaction |
| Idempotency | Có idempotency_records lưu scope, request hash, trạng thái, response và thời hạn tối thiểu 24 giờ; backend vẫn phải triển khai claim/replay/cleanup |
| Audit / GPS thật | Có audit_logs cho actor/action/resource/before-after; backend phải ghi sự kiện, loại bỏ bí mật payload. GPS thật vẫn cần mô hình thiết bị khi tích hợp |
| Bảo trì / bảng giá | `maintenance_orders`, `vehicle_pricing_history` và `vehicle_move_audits` là schema đề xuất; support_tickets không thay thế phiếu bảo trì |
| Ảnh đính kèm | `stored_files`/`file_attachments`, upload intent và download URL ký là schema/API đề xuất; object storage chưa tích hợp thì trả FEATURE_NOT_ENABLED |
| Kiểm tra giá trị | Đã mô tả quy tắc trong DBML; cần CHECK enum, capacity > 0, pin 0–100, tiền không âm, thứ tự các mốc thời gian và expires_at = created_at + 30 phút trong migration/backend |
| FK DBML | Đã sửa ký hiệu quan hệ nullable sang cột nullable và quan hệ chuẩn; dùng bản thiết kế mới khi xuất ERD |

Giữ các ràng buộc unique sẵn có như users.email, wallets.user_id, invoices.rental_id, rental_reviews.rental_id, handovers(rental_id, kind), user_promotions(user_id, promotion_id), wallet_transactions.transaction_id. Partial unique index của rentals bảo đảm tối đa một lượt đang hiệu lực trên mỗi xe và mỗi khách, gồm `RESERVED/IN_RENT/RETURN_PENDING/STOLEN`; không đặt `NOW()` trong predicate. Lazy expiration cập nhật trạng thái trong transaction trước khi xét index. Không xóa dữ liệu lịch sử có liên quan tài chính. Các bảng lưu trữ đã có không đồng nghĩa endpoint/backend đã triển khai thao tác ghi hoặc replay.

## 14. Các quyết định cần nhóm duyệt trước khi đóng băng V1

| Quyết định | Đề xuất/phạm vi hiện tại | API bị ảnh hưởng |
| --- | --- | --- |
| 1. Giá thuê | Đã chốt R2: 10.000đ/30 phút đầu + 350đ/phút thêm, ceil phút lẻ, HALF_UP tổng đến 1đ | 5, 6.2, 6.9 |
| 2. Snapshot | Đã chốt tại giữ xe; lưu lịch sử đổi giá | 3, 6.3, 13 |
| 3. Cọc/hủy | Đã chốt: 100.000đ demo, kiểm tra cọc + block lúc reserve/pickup, thu lúc pickup; hủy trước nhận miễn phí | 6.4, 7 |
| 4. Điều kiện khách | Đã chốt demo: đủ 16 tuổi, CUSTOMER ACTIVE, CCCD VERIFIED còn hạn/chưa thu hồi | 4, 6.5 |
| 5. Pin/sức chứa | Đã chốt 30%; đếm xe/chỗ động | 5, 6.6 |
| 6. Giới hạn chuyến/hủy | Đã chốt một chuyến chưa giải quyết, 3 hủy/hết hạn/ngày; Lazy Expiration và Global Lock Order | 6.7 |
| 7. Trả thiếu tiền/ví khóa | Đã chốt RETURN_PENDING, dừng cước lúc nhận xe, quote 10 phút, quyết toán riêng | 6.8–6.9, 7 |
| 8. Khuyến mãi | Chờ ý kiến thành viên; chưa chốt làm tròn riêng, claim/thanh toán và min/max | 8 |
| 9. Thanh toán thật | Chốt chỉ mô phỏng trong V1; không chốt provider hoặc triển khai production | 7 |
| 10. GPS/upload | Chờ ý kiến thành viên | 4, 10 |
| 11. Quyền STAFF | Đã chốt vận hành mọi trạm; MANAGER quản trị toàn bộ | 2.4, 5–6 |
| 12. Sự cố/mất xe | Chờ bổ sung/chưa duyệt; giữ chặn STOLEN theo mục 6, không tự xử lý tài chính hoặc khôi phục | 6.1, 9 |

Checklist đồng bộ issue #14 và hai issue backend:

- [ ] Đồng bộ mục 1–7, 9, 11 vào tài liệu yêu cầu, DBML/migration, backend, frontend và OpenAPI; giữ mục 8/10/12 chờ duyệt.
- [ ] Đổi field giá, bổ sung snapshot/lịch sử và sổ cọc; kiểm tra dữ liệu cũ trước migration.
- [ ] Bổ sung CCCD/tuổi, pin và truy vấn đếm động, quyền STAFF mọi trạm.
- [ ] Thêm initiate-return, RETURN_PENDING và quyết toán riêng; cập nhật client để không dùng request return cũ.
- [ ] Thực thi Lazy Expiration hai phía, unique customer/vehicle, hạn mức hủy và thứ tự khóa toàn cục; kiểm tra cả khóa ẩn/FK.
- [ ] Chỉ nạp tiền demo khi cờ bật, gắn nhãn tiền mô phỏng và mô tả PaymentProvider; không bật production.
- [ ] Chạy ca kiểm thử mục 12, kiểm tra rollback/retry và báo cáo không cộng cọc hoặc RETURN_PENDING thành doanh thu.
- [ ] Bổ sung rồi duyệt riêng quy trình sự cố/mất xe; không triển khai đề xuất CLOSED_INCIDENT hoặc xử lý cọc mất xe khi chưa duyệt.

Các tên endpoint/field kỹ thuật bổ sung là thiết kế thực thi chính sách để nhóm review, không phải xác nhận tính năng đã chạy. Mọi thay đổi wire schema phải được cập nhật cùng OpenAPI và thông báo trước khi tích hợp.
