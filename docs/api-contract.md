# EVRide V1 — Hợp đồng API

Ngày soạn: **21/10/2026**. Base URL: `/api/v1`. Định dạng: JSON, UTF-8.

Đây là hợp đồng đề xuất để nhóm triển khai và review, **không phải danh sách API đã chạy được**. Căn cứ: [DBML 15 bảng](database.md), [phạm vi nghiệp vụ](requirements.md) và [đặc tả báo cáo](dac_ta_quan_tri_bao_cao.md).

## 1. Phạm vi và mức độ thống nhất

### 1.1. Quy tắc nghiệp vụ đã chốt

- Cho thuê ô tô điện theo trạm; chỉ đặt chiếc xe đang có sẵn, không đặt trước nhiều ngày.
- Giữ xe 30 phút kể từ khi đặt thành công. Hết hạn phải tạo lượt đặt mới và kiểm tra lại xe còn sẵn; không gia hạn hay ghi đè lượt cũ.
- Nhân viên xác nhận bàn giao mới bắt đầu thời gian thuê thực tế.
- Trả tại trạm nhận hoặc bất kỳ trạm khác còn chỗ; nhân viên nhận xe và hoàn tất thanh toán.
- Một xe không được có hai lượt giữ chỗ/chuyến thuê đang hiệu lực.
- Khách theo dõi thời gian thuê, GPS, ví, hóa đơn và lịch sử; hệ thống có khuyến mãi, sự cố và quản trị.

### 1.2. Đề xuất kỹ thuật của hợp đồng này

Tên endpoint, schema JSON, HTTP status, JWT, idempotency, phân quyền chi tiết và trạng thái bổ sung dưới đây là đề xuất triển khai V1. Nhóm cần review trước khi đóng băng hợp đồng.

DBML hiện đọc được vẫn có `planned_start_time`, `planned_end_time`, chưa có `expires_at` và trạng thái giữ chỗ/hết hạn. Hợp đồng này dùng mô hình nghiệp vụ mới; **không được triển khai trực tiếp trên schema cũ mà bỏ qua mục 13**.

Không tự coi các chính sách giá, cọc, giấy phép, ngưỡng pin và cổng thanh toán là đã được duyệt. Các quyết định còn thiếu nằm ở mục 14; API phụ thuộc chính sách chưa cấu hình trả `503 POLICY_NOT_CONFIGURED`, không tự áp dụng giá hoặc mức cọc mặc định.

## 2. Quy ước chung

### 2.1. Kiểu dữ liệu và validation

| Kiểu | Quy ước |
| --- | --- |
| ID | Chuỗi số nguyên dương, ví dụ `"101"`; DB dùng bigint, JSON dùng string tránh mất chính xác trong JavaScript |
| Tiền | Chuỗi số thập phân không âm, tối đa 2 chữ số lẻ, ví dụ `"150000.00"`; đơn vị VND; không dùng float để tính tiền |
| Thời gian | RFC 3339 có múi giờ; response UTC dạng `2026-10-21T03:00:00Z` |
| Ngày báo cáo | `YYYY-MM-DD`, hiểu theo `Asia/Ho_Chi_Minh` |
| Tọa độ | JSON number; latitude từ -90 đến 90, longitude từ -180 đến 180 |
| Pin / đánh giá | Integer; pin 0–100, rating 1–5 |
| Enum | Chuỗi viết hoa; không dịch giá trị enum trên wire |
| Trường nullable | Trả `null` khi chưa có; không dùng `0` hoặc chuỗi rỗng thay cho dữ liệu chưa biết |

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
| 400 | `INVALID_DATE_RANGE`, `INVALID_REQUEST` | Khoảng ngày đảo ngược hoặc request sai cấu trúc |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED` | Thiếu/sai thông tin xác thực |
| 403 | `FORBIDDEN`, `ACCOUNT_DISABLED`, `CUSTOMER_NOT_ELIGIBLE` | Sai quyền, tài khoản bị khóa, chưa đủ điều kiện |
| 404 | `NOT_FOUND` | Không tồn tại hoặc không thuộc phạm vi được xem |
| 409 | `EMAIL_EXISTS`, `VEHICLE_UNAVAILABLE`, `STATION_FULL`, `STATION_UNAVAILABLE` | Xung đột tài nguyên |
| 409 | `RESERVATION_EXPIRED`, `INVALID_RENTAL_STATE`, `PICKUP_STATION_MISMATCH` | Sai trạng thái hoặc hết hạn |
| 409 | `WALLET_UNAVAILABLE`, `INSUFFICIENT_BALANCE`, `PROMOTION_INVALID`, `ALREADY_REVIEWED` | Điều kiện nghiệp vụ không đáp ứng |
| 409 | `IDEMPOTENCY_CONFLICT`, `REQUEST_IN_PROGRESS`, `STALE_QUOTE`, `INVALID_STATE_TRANSITION` | Request lặp khác nội dung hoặc dữ liệu đã thay đổi |
| 422 | `VALIDATION_ERROR` | Sai kiểu/enum, thiếu trường, số âm, trường lạ; details.fields là mảng `{field, message}` |
| 429 | `RATE_LIMITED` | Vượt giới hạn; kèm `Retry-After` |
| 503 | `POLICY_NOT_CONFIGURED`, `FEATURE_NOT_ENABLED`, `DEPENDENCY_UNAVAILABLE` | Chính sách/tích hợp chưa sẵn sàng |
| 500 | `INTERNAL_ERROR` | Lỗi bất ngờ; trả request_id để tra cứu |

### 2.4. Xác thực và quyền

`Authorization: Bearer <access_token>`. JWT access token đề xuất sống 30 phút, response login trả `expires_in: 1800`. V1 chưa có refresh token/logout phía server; client xóa token để đăng xuất, đăng nhập lại khi hết hạn. Backend kiểm tra role và trạng thái tài khoản hiện tại trên mỗi request; khóa tài khoản phải có hiệu lực dù JWT chưa hết hạn.

Ký hiệu quyền trong bảng endpoint:

- `Public`: không cần đăng nhập.
- `C`: CUSTOMER, tài khoản ACTIVE, chỉ dữ liệu của chính mình.
- `S`: STAFF, tài khoản ACTIVE.
- `M`: MANAGER, tài khoản ACTIVE.
- `Owner/S/M`: khách sở hữu đối tượng hoặc nhân viên/quản lý.

Sai vai trò trả 403; truy cập tài nguyên cá nhân của khách khác trả 404. S/M không có nghĩa được đóng vai khách đặt xe hoặc thanh toán từ ví bất kỳ. V1 DBML chưa có phân công nhân viên theo trạm: đề xuất S vận hành toàn hệ thống; nếu giới hạn theo trạm phải bổ sung mô hình quyền trước khi triển khai.

### 2.5. Idempotency và giao dịch

Các POST được đánh dấu `I` bắt buộc header `Idempotency-Key`, chuỗi ngẫu nhiên 16–128 ký tự; thiếu/sai định dạng trả 422.

- Khóa theo `(actor_id, method, path, key)`; lưu hash body và kết quả trong kho bền vững tối thiểu 24 giờ.
- Cùng key/cùng body: trả nguyên mã HTTP và payload nghiệp vụ lần đầu, không tạo tác động mới. Cùng key/khác body: 409 `IDEMPOTENCY_CONFLICT`.
- Request đầu đang xử lý: 409 `REQUEST_IN_PROGRESS`, client retry cùng key.
- Lỗi validation/quyền trước khi bắt đầu giao dịch không lưu kết quả. Kết quả đã commit phải replay được sau timeout.
- Key đã hết thời gian lưu không thay thế các ràng buộc lâu dài: một hóa đơn/lượt thuê, một PICKUP/RETURN, một đánh giá, một lần ghi sổ cho mỗi giao dịch thanh toán.
- Mọi thay đổi xe, lượt thuê, trạm, ví và sổ giao dịch liên quan phải commit/rollback cùng nhau. Không gọi dịch vụ thanh toán bên ngoài trong lúc giữ khóa DB dài hạn.

DBML chưa có kho idempotency hoặc tham chiếu cổng thanh toán: xem mục 13. Client không được tự retry nghiệp vụ bằng key mới chỉ vì chưa nhận response.

## 3. Tài nguyên và ánh xạ đủ 15 bảng

Các schema bên dưới liệt kê trường response. ID/tiền/thời gian theo mục 2. Dấu `?` chỉ trường có giá trị nullable, không phải một phần tên trường. Mọi field không nullable được trả đầy đủ.

| Bảng | Schema response | Quyền xem |
| --- | --- | --- |
| `users` | User: `id, name, email, role, status, created_at` | Chính mình/S/M qua API được phép; tuyệt đối không trả password/hash |
| `user_documents` | Document: `id, user_id, document_type, document_number_masked, verified_status, created_at` | Chính mình/S/M; ảnh và số đầy đủ chỉ qua endpoint riêng |
| `stations` | Station: `id, name, address, latitude, longitude, capacity, opens_at?, closes_at?, status, occupied_spaces, available_spaces, available_vehicle_count` | Public |
| `vehicles` | Vehicle: `id, current_station_id?, name, type, battery_percent, status, daily_price, deposit_amount, created_at` | Public chỉ xe có thể thuê; S/M xem tất cả |
| `rentals` | Rental: `id, customer_id, vehicle_id, pickup_station_id, actual_return_station_id?, created_at, expires_at, actual_start_time?, actual_end_time?, status, total_price?, remaining_hold_seconds, elapsed_seconds` | Owner/S/M |
| `handovers` | Handover: `id, rental_id, staff_id, kind, time, battery_percent, note?, created_at` | Owner/S/M |
| `invoices` | Invoice: `id, rental_id, total_amount, status, created_at` | Owner/S/M |
| `transactions` | Transaction: `id, rental_id, invoice_id?, actor_id, amount, kind, status, created_at` | Owner/S/M |
| `wallets` | Wallet: `id, user_id, balance, status, created_at, updated_at` | Chủ ví/M |
| `wallet_transactions` | WalletTransaction: `id, wallet_id, rental_id?, amount, type, balance_before, balance_after, status, created_at` | Chủ ví/M |
| `promotions` | Promotion: `id, code, description?, discount_percent?, max_discount_amount?, min_rental_amount?, start_date, end_date, status, created_at` | C xem mã đủ điều kiện; M xem tất cả |
| `user_promotions` | UserPromotion: `id, user_id, promotion_id, is_used, used_at?, promotion` | Chủ sở hữu/M |
| `support_tickets` | Ticket: `id, rental_id, created_by, assigned_to?, title, description, status, created_at` | Owner/S/M |
| `gps_points` | GpsPoint: `id, rental_id, latitude, longitude, recorded_at` | Owner/S/M |
| `rental_reviews` | Review: `id, rental_id, rating, comment?, created_at` | Owner/S/M; V1 không công khai đánh giá cá nhân |

Field dẫn xuất không tạo thêm bảng: `occupied_spaces` đếm tất cả xe đang ở trạm; `available_spaces = capacity - occupied_spaces`; số xe thuê được loại trừ giữ chỗ, xe lỗi và không đủ điều kiện. Không trả số chỗ âm để che lỗi dữ liệu: ghi nhận lỗi nhất quán và chặn nhận thêm xe.

`remaining_hold_seconds = max(0, floor(expires_at - server_time))` khi RESERVED, trạng thái khác bằng 0. `elapsed_seconds` bằng 0 trước nhận xe, sau đó tính từ actual_start_time đến actual_end_time hoặc server_time. Đây không phải số đơn vị tính phí.

Enum bổ sung đề xuất: Station `ACTIVE/INACTIVE`; Transaction `PENDING/SUCCESS/FAILED`; Vehicle thêm `RESERVED`; Rental dùng `RESERVED/IN_RENT/COMPLETED/CANCELLED/EXPIRED/STOLEN`. Giữ các enum khác trong DBML. `OVERDUE` chưa dùng vì chưa chốt hạn trả xe.

## 4. Đăng ký, đăng nhập, hồ sơ và giấy tờ

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| POST `/auth/register` | Public | `{name, email, password}` | 201 `{user: User, wallet: Wallet}` |
| POST `/auth/login` | Public | `{email, password}` | 200 `{access_token, token_type: "bearer", expires_in: 1800, user: User}` |
| GET `/users/me` | C/S/M | — | User |
| PATCH `/users/me` | C/S/M | `{name}` | User |
| POST `/users/me/change-password` | C/S/M | `{current_password, new_password}` | `{changed: true}` |
| GET `/users/me/documents` | C/S/M | Phân trang | Document[] |
| POST `/users/me/documents` | C/S/M | `{document_type, document_number, image_front_url, image_back_url?}` | 201 Document, trạng thái PENDING |
| GET `/user-documents/{id}/sensitive` | Owner/S/M | — | `{id, document_number, image_front_url, image_back_url?, urls_expire_at}` |
| PATCH `/user-documents/{id}/verification` | S/M | `{verified_status: "VERIFIED" hoặc "REJECTED"}` | Document |
| GET `/users` | S/M | `role?, status?, q?`, phân trang | User[] |
| GET `/users/{id}` | S/M | — | User |
| POST `/users` | M | `{name, email, password, role}`; role STAFF hoặc MANAGER | 201 User |
| PATCH `/users/{id}` | M | `{name?, status?, role?}` | User |

Đăng ký luôn tạo CUSTOMER ACTIVE và ví ACTIVE số dư `"0.00"` trong cùng giao dịch. Email chuẩn hóa trim/lowercase và unique; trùng trả 409. Đề xuất mật khẩu 12–128 ký tự, lưu hash, login lỗi không tiết lộ email có tồn tại. Thay mật khẩu cần mật khẩu hiện tại; JWT cũ chỉ bị thu hồi nếu nhóm bổ sung token version/kho phiên, không tuyên bố thu hồi trong thiết kế 15 bảng hiện tại.

M không tự khóa/hạ quyền tài khoản MANAGER cuối cùng; không đổi CUSTOMER thành nhân viên bằng PATCH để tránh nhập nhằng quyền sở hữu dữ liệu. Tạo nhân viên dùng POST `/users`. Không có DELETE tài khoản trong V1.

Giấy tờ chỉ nhận loại CCCD/PASSPORT/DRIVER_LICENSE. URL ảnh đầu vào phải là đường dẫn HTTPS thuộc kho upload được hệ thống tin cậy, không nhận URL tùy ý để backend tải về. API upload chưa nằm trong 15 bảng; hợp đồng tích hợp kho ảnh cần chốt riêng. Endpoint sensitive trả URL ký ngắn hạn, không cache, ghi audit truy cập; các API danh sách không trả ảnh hoặc số đầy đủ. S/M không tự duyệt giấy tờ của mình. Nộp lại giấy tờ tạo bản PENDING mới, không sửa bằng chứng đã duyệt.

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
| POST `/vehicles` | M | `{current_station_id, name, type, battery_percent, daily_price, deposit_amount}` | 201 Vehicle AVAILABLE |
| PATCH `/vehicles/{id}` | M | `{name?, type?, daily_price?, deposit_amount?}` | Vehicle |
| POST `/vehicles/{id}/move` | S/M, I | `{target_station_id}` | Vehicle tại trạm mới |
| POST `/vehicles/{id}/status` | S/M, I | `{status: "AVAILABLE" hoặc "MAINTENANCE", note}` | Vehicle |

`opens_at/closes_at`: cùng null nghĩa là 24/7; nếu có thì cả hai ở dạng `HH:mm:ss`, giờ Việt Nam. Cặp giờ qua nửa đêm là khoảng mở xuyên đêm; hai giờ bằng nhau bị từ chối, dùng null cho 24/7.

Tạo/điều chuyển xe phải khóa trạm đích và kiểm tra chỗ. Không điều chuyển xe RESERVED/RENTED/SUSPECTED_STOLEN/STOLEN. Không giảm capacity dưới số xe đang đỗ; không ngừng trạm khi còn xe hoặc lượt giữ chỗ ở trạm. Không đặt/nhận/trả tại trạm không hoạt động hoặc ngoài giờ mở.

AVAILABLE ↔ MAINTENANCE chỉ khi xe đang ở trạm và không có thuê/giữ chỗ đang hiệu lực; không dùng endpoint status để bỏ qua bàn giao, giải phóng xe đang thuê hoặc xử lý mất xe. `note` cần kho audit theo mục 13. Giá mới không được thay đổi giá đã chốt của các lượt thuê trước đó.

## 6. Giữ xe, nhận xe và trả xe

### 6.1. Vòng đời

```text
Đặt thành công ──> RESERVED ──nhân viên nhận trước hạn──> IN_RENT ──trả và thanh toán──> COMPLETED
                      ├──khách hủy trước hạn──> CANCELLED
                      └──đạt mốc 30 phút─────> EXPIRED
                                                  └──muốn thuê: POST tạo lượt mới
```

STOLEN là nhánh sự cố cần xử lý riêng, không cho phép trả/hủy bình thường. API xử lý mất xe ngoài luồng hỗ trợ cần được chốt trước khi bật.

### 6.2. Danh mục endpoint

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| POST `/rentals` | C, I | `{vehicle_id, pickup_station_id}` | 201 Rental |
| GET `/rentals` | C/S/M | `status?, vehicle_id?, pickup_station_id?, created_from?, created_to?`, phân trang; S/M thêm `customer_id?` | Rental[]; C chỉ của mình |
| GET `/rentals/{id}` | Owner/S/M | — | Rental |
| POST `/rentals/{id}/cancel` | C sở hữu, I | `{}` | Rental CANCELLED |
| POST `/rentals/{id}/pickup` | S/M, I | `{station_id, battery_percent, note?}` | `{rental: Rental, handover: Handover}` |
| POST `/rentals/{id}/return-quote` | Owner/S/M | `{return_station_id, promotion_code?}` | ReturnQuote, không giữ chỗ trạm, không trừ tiền |
| POST `/rentals/{id}/return` | S/M, I | `{return_station_id, battery_percent, vehicle_condition, quote_token, note?}` | `{rental: Rental, handover: Handover, invoice: Invoice, transactions: Transaction[], wallet: Wallet}` |
| GET `/rentals/{id}/handovers` | Owner/S/M | Phân trang | Handover[] |

`vehicle_condition`: `OK` hoặc `NEEDS_MAINTENANCE`. Không nhận `customer_id`, `expires_at`, ngày đặt trước, giá, thời gian bắt đầu/kết thúc hoặc trạng thái từ khách.

### 6.3. Đặt xe và hết hạn

Ví dụ POST `/rentals`, header `Idempotency-Key: reserve-example-0001`:

```json
{"vehicle_id": "101", "pickup_station_id": "10"}
```

Response 201:

```json
{
  "data": {
    "id": "501",
    "customer_id": "20",
    "vehicle_id": "101",
    "pickup_station_id": "10",
    "actual_return_station_id": null,
    "created_at": "2026-10-21T03:00:00Z",
    "expires_at": "2026-10-21T03:30:00Z",
    "actual_start_time": null,
    "actual_end_time": null,
    "status": "RESERVED",
    "total_price": null,
    "remaining_hold_seconds": 1800,
    "elapsed_seconds": 0
  },
  "meta": {
    "request_id": "req_example",
    "server_time": "2026-10-21T03:00:00Z"
  }
}
```

Backend khóa xe, xử lý giữ chỗ cũ đã quá hạn nếu có, kiểm tra xe đúng trạm/có sẵn/đủ điều kiện rồi tạo lượt mới. `created_at` lấy sau khi giành được quyền giữ xe; `expires_at = created_at + 30 phút`. Xe chuyển RESERVED nhưng vẫn chiếm chỗ tại trạm.

Đúng `03:30:00Z` trong ví dụ là đã hết hạn. Tác vụ dọn định kỳ chuyển trạng thái, nhưng API đọc và ghi đều phải xét hạn để không trả RESERVED như còn hợp lệ. GET có thể chuẩn hóa trạng thái hết hạn trong service; client không được dùng endpoint gia hạn hoặc cập nhật status.

Khi hủy/hết hạn, chỉ trả xe về AVAILABLE nếu vẫn thuộc lượt giữ đó và đủ điều kiện vận hành. Giữ nguyên record CANCELLED/EXPIRED. Gửi lại key đặt cũ trả lượt cũ kể cả đã hết hạn; **đặt lại cần POST mới với key mới**.

### 6.4. Nhận xe

Pickup chỉ hợp lệ với RESERVED, thời gian thực tế sau khi lấy khóa nhỏ hơn expires_at, station_id khớp trạm nhận, xe vẫn ở đúng trạm và khách đáp ứng điều kiện giấy tờ/cọc đã được cấu hình.

Trong một giao dịch: ghi handover PICKUP, actual_start_time, chuyển rental IN_RENT, xe RENTED và current_station_id thành null. Không cập nhật thời hạn để cho phép nhận muộn. Request pickup/hủy/tác vụ hết hạn cùng lúc chỉ một chuyển trạng thái được thành công.

Lỗi đặc thù: 409 `RESERVATION_EXPIRED`, `INVALID_RENTAL_STATE`, `PICKUP_STATION_MISMATCH`, `VEHICLE_UNAVAILABLE`; 403 `CUSTOMER_NOT_ELIGIBLE`; lỗi ví theo mục 2.

### 6.5. Báo giá trả xe và thanh toán

ReturnQuote:

```json
{
  "rental_id": "501",
  "return_station_id": "11",
  "calculated_at": "2026-10-21T05:00:00Z",
  "valid_until": "2026-10-21T05:02:00Z",
  "elapsed_seconds": 6600,
  "currency": "VND",
  "rental_fee": "200000.00",
  "discount_amount": "20000.00",
  "total_amount": "180000.00",
  "deposit_applied": "0.00",
  "amount_due": "180000.00",
  "refund_amount": "0.00",
  "promotion_code": "EV10",
  "quote_token": "opaque-signed-value"
}
```

Số tiền trên chỉ minh họa schema, **không phải bảng giá được duyệt**. Quote token do server ký hoặc lưu, ràng buộc rental, trạm, mã giảm giá, phiên bản chính sách và tổng tiền; đề xuất hiệu lực 120 giây. Không nhận số tiền do client tự gửi.

Khi xác nhận trả, server dùng thời điểm nhận thực tế để tính lại theo chính sách đã chốt. Nếu token hết hạn, khác trạm/chuyến hoặc số tiền phải trả thay đổi: 409 `STALE_QUOTE`, yêu cầu lấy quote mới, không ghi nhận hoàn tất/trừ tiền. Quote không bảo đảm chỗ đỗ hay giữ mã khuyến mãi.

Đề xuất thanh toán V1 bằng ví: kiểm tra và khóa trạm, xe, rental, ví, mã khuyến mãi; xác minh đủ chỗ/số dư; ghi RETURN, actual_end_time, actual_return_station_id, hóa đơn PAID, giao dịch SUCCESS, biến động ví, trạng thái COMPLETED, xe tại trạm mới AVAILABLE hoặc MAINTENANCE trong cùng giao dịch. Chốt thứ tự khóa nhất quán cho toàn backend và retry deadlock có giới hạn.

Thiếu tiền trả 409 `INSUFFICIENT_BALANCE`, không đánh dấu COMPLETED và không ghi dữ liệu dở. **Đây là đề xuất cho demo; quy trình nhận xe vật lý nhưng còn nợ chưa được chốt và không được triển khai vận hành thật bằng cách bỏ qua tình huống này.**

Không có DELETE rental, PATCH status, endpoint gia hạn, hoặc API hoàn tất thanh toán nhận số tiền tùy ý. Không cho khách tự xác nhận nhận/trả.

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

Topup ở đây là **đề xuất demo**, chỉ bật khi cấu hình `DEMO_PAYMENTS_ENABLED` và giao diện hiện rõ tiền mô phỏng; amount > 0, ví ACTIVE, tạo TOPUP SUCCESS và tăng ví nguyên tử. Môi trường thanh toán thật phải tắt endpoint demo hoặc thay bằng contract provider đã duyệt; chưa có provider thì 503 `FEATURE_NOT_ENABLED`, không nhận tiền thật bằng cách cho client tự báo thành công.

Ví FROZEN/LOCKED không được nạp/trừ tự động. Không có API sửa trực tiếp balance hoặc tạo Transaction SUCCESS từ request khách. `balance_after` phải đúng với hướng tác động: TOPUP/RENTAL_REFUND cộng; WITHDRAW/RENTAL_PAYMENT/RENTAL_DEPOSIT trừ. Amount luôn là độ lớn dương; khoản bằng 0 không cần tạo bút toán.

V1 chưa mở rút ví, hoàn tiền thủ công, thu phí sự cố tùy ý hay webhook thật. Nếu có cọc, chính sách phải chỉ rõ thời điểm ghi DEPOSIT/REFUND và cách cấn trừ; không tính tiền cọc là doanh thu thuê.

## 8. Khuyến mãi

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| GET `/promotions` | C/M | `status?`, phân trang | Promotion[]; C chỉ ACTIVE trong thời hạn |
| POST `/promotions` | M | `{code, description?, discount_percent, max_discount_amount?, min_rental_amount?, start_date, end_date}` | 201 Promotion ACTIVE |
| PATCH `/promotions/{id}` | M | `{status: "ACTIVE" hoặc "DISABLED"}` | Promotion |
| POST `/promotions/{id}/claim` | C, I | `{}` | 201 UserPromotion |
| GET `/users/me/promotions` | C | `is_used?`, phân trang | UserPromotion[] |

Đề xuất V1 hỗ trợ phần trăm, integer 1–100; code viết hoa, tối đa 50 ký tự và unique; end_date > start_date. Không sửa giá trị giảm của mã đã phát hành; tạo mã mới để giữ lịch sử.

Một user chỉ nhận một bản của mỗi mã (unique user_id/promotion_id). Claim lặp khác key trả 200 bản đang có, không nhân bản. Hiệu lực: start_date <= thời điểm thanh toán < end_date, ACTIVE, thuộc user, chưa dùng, đủ min_rental_amount. Mỗi rental dùng tối đa một mã.

Đề xuất công thức: giảm theo rental_fee, giới hạn max_discount_amount nếu có, không vượt rental_fee; không giảm cọc/phí sự cố. Quy tắc làm tròn tiền cần chốt ở mục 14. Quote chưa tiêu thụ mã; chỉ cập nhật is_used/used_at cùng giao dịch thanh toán thành công. Cần lưu mã và số tiền giảm đã áp dụng theo mục 13 để truy vết.

## 9. Sự cố, bảo trì và đánh giá

| Method / path | Quyền | Request | Thành công |
| --- | --- | --- | --- |
| POST `/rentals/{id}/support-tickets` | Owner/S/M | `{title, description}` | 201 Ticket OPEN; created_by lấy từ token |
| GET `/support-tickets` | C/S/M | `status?, rental_id?`, S/M thêm `assigned_to?`, phân trang | Ticket[]; C chỉ ticket của rental mình |
| GET `/support-tickets/{id}` | Owner/S/M | — | Ticket |
| PATCH `/support-tickets/{id}` | S/M | `{assigned_to?, status?}` | Ticket |
| POST `/rentals/{id}/review` | C sở hữu | `{rating, comment?}` | 201 Review |
| GET `/rentals/{id}/review` | Owner/S/M | — | Review hoặc 404 |

Ticket được tạo cho IN_RENT/STOLEN/COMPLETED; rental giữ chỗ chưa nhận không tạo báo hỏng trong chuyến. Assigned_to phải là STAFF/MANAGER ACTIVE; null bỏ phân công. Luồng OPEN → IN_PROGRESS → RESOLVED → CLOSED; cùng trạng thái là no-op; chuyển ngược trả 409 `INVALID_STATE_TRANSITION`.

Ticket không tự dừng chuyến, tự hoàn tiền hoặc đổi xe MAINTENANCE. Xử lý bảo trì tối thiểu qua endpoint trạng thái xe mục 5; DBML **chưa có bảng phiếu bảo trì, vật tư, chi phí hoặc ảnh sự cố**, nên không giả lập các trường này trong Ticket. Chỉ đánh giá rental COMPLETED, mỗi rental một đánh giá; tạo lần hai trả 409 `ALREADY_REVIEWED`.

## 10. GPS và chatbot

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
| `/analytics/peak-hours` | `station_id?`, `limit` mặc định 20, 1–100 | `{items: [{station_id, station_name, hour, rental_count}], filtered_trip_count, included_trip_count}` |
| `/analytics/revenue` | — | `{items: [{month, vehicle_type, rental_count, revenue, cumulative_revenue, share_percent}], total_revenue}` |
| `/analytics/top-routes` | — | `{items: [{month, rank, pickup_station_id, return_station_id, rental_count}]}` |
| `/analytics/idle-time` | `limit` mặc định 15, 1–100 | `{items: [{station_id, station_name, average_idle_minutes}], coverage: "OBSERVED_RETURN_PICKUP_PAIRS"}` |
| `/analytics/inactive-customers` | `days` trong 14/30/60/90, mặc định 30; `as_of_date?`; phân trang; không dùng from_date/to_date | `{items: [{user_id, name, email, balance}], as_of_date, days}`; meta có phân trang |

Định nghĩa:

- Trip_count và heatmap đếm actual_start_time trong khoảng, không đếm RESERVED/CANCELLED/EXPIRED. Hour là 0–23 theo giờ Việt Nam. Heatmap trả đủ 24 giờ cho từng trạm được chọn; top trạm theo số lượt DESC, station_id ASC. included_trip_count là tổng các trạm hiển thị; filtered_trip_count có thể lớn hơn nếu có giới hạn top 20.
- Revenue chỉ tính rental COMPLETED có hóa đơn PAID, theo actual_end_time; không cộng cọc/topup, không tính hai lần do JOIN nhiều giao dịch. V1 chưa mở refund; nếu mở phải bổ sung quy tắc doanh thu thuần và thời điểm ghi nhận hoàn tiền.
- month dạng `YYYY-MM`; cumulative_revenue cộng trong khoảng lọc theo từng loại xe, share_percent là chuỗi số có 2 chữ số lẻ, tháng tổng 0 thì tỷ trọng 0. Phải lưu loại xe/giá đã áp dụng hoặc khóa thay đổi làm sai lịch sử.
- Top routes đếm các chuyến COMPLETED theo actual_end_time, RANK theo số chuyến trong từng tháng, lấy rank <= 3; đồng hạng có thể trả hơn ba dòng.
- Idle-time: với cùng xe, lấy một lần trả và lần nhận kế tiếp tại cùng trạm, không có lần nhận khác xen giữa; chỉ tính cặp có cả hai mốc nằm trong khoảng lọc, bỏ xe có điều chuyển ngoài chuyến không chứng minh được lịch sử. Đây là thời gian nằm tại trạm quan sát được, gồm thời gian giữ chỗ, không khẳng định là thời gian AVAILABLE. Báo cáo đầy đủ cần lịch sử vị trí/trạng thái theo mục 13.
- Inactive: CUSTOMER ACTIVE, balance > 0, không có actual_start_time trong khoảng N ngày kết thúc ở đầu ngày sau as_of_date theo giờ Việt Nam. Mặc định as_of_date là ngày có actual_start_time mới nhất; không có chuyến thì dùng ngày server tại Việt Nam. Sắp balance DESC, user_id ASC.
- Overview: average_trip_minutes tính trên chuyến COMPLETED kết thúc trong khoảng; không có thì 0. Customer_count là số khách khác nhau có chuyến bắt đầu trong khoảng. Xe theo trạng thái/trạm sắp đầy là snapshot hiện tại; near_full_stations có available_spaces <= 1, ACTIVE, tối đa 10 theo available_spaces ASC, id ASC. recent_tickets là 5 ticket mới nhất hiện tại.
- Không có dữ liệu trả mảng rỗng/tổng 0, không trả 404. Truy vấn số liệu phải được đối chiếu độc lập khi kiểm thử.

Endpoint `/prices` trong đặc tả cũ chưa thuộc V1 này vì DBML chưa có lịch sử bảng giá. V1 quản lý daily_price/deposit_amount trên xe, kèm yêu cầu lưu giá áp dụng từng lượt.

## 12. Kiểm tra hệ thống và tiêu chí nghiệm thu

GET `/health`: Public, 200 `{status: "ok"}` trong envelope, không lộ cấu hình. GET `/health/ready`: chỉ hạ tầng nội bộ, 200 `{status: "ready"}` hoặc 503 `DEPENDENCY_UNAVAILABLE` nếu DB/migration chưa sẵn sàng.

| Ca kiểm thử | Kết quả bắt buộc |
| --- | --- |
| Hai khách đặt một xe đồng thời | Một 201, một 409 VEHICLE_UNAVAILABLE; chỉ một lượt giữ hiệu lực |
| Đặt trước nhiều ngày / truyền expires_at | 422 VALIDATION_ERROR |
| Nhận xe ngay trước hạn | Thành công nếu vẫn đủ điều kiện sau khi giành khóa |
| Nhận đúng hạn hoặc muộn hơn | 409 RESERVATION_EXPIRED |
| Tác vụ dọn hết hạn bị trễ | API vẫn từ chối nhận muộn, không hiển thị lượt còn hiệu lực |
| Đặt lại sau hết hạn | Rental ID mới, hạn mới; record cũ EXPIRED không đổi |
| Retry đặt với key cũ | Trả lượt cũ, không gia hạn |
| Pickup và cancel/hết hạn đồng thời | Chỉ một chuyển trạng thái, không xe vừa thuê vừa AVAILABLE |
| Trả khác trạm còn chỗ | Thành công, cập nhật trạm thực tế và biên bản RETURN |
| Hai xe tranh một chỗ trống | Chỉ một lượt trả thành công, không vượt capacity |
| Quote cũ/giá thay đổi | 409 STALE_QUOTE, chưa trừ tiền |
| Thiếu tiền / ví khóa | 409 tương ứng, không có cập nhật dở |
| Timeout rồi retry thanh toán | Không có hóa đơn, biên bản hoặc bút toán trùng |
| Hai chuyến dùng cùng mã cá nhân | Chỉ một lần tiêu thụ mã thành công |
| Khách xem rental/ví/GPS người khác | 404 hoặc 403 theo loại endpoint, không rò dữ liệu |
| Khách gọi pickup/return/báo cáo | 403 |
| Token của tài khoản bị khóa | 403 ACCOUNT_DISABLED |
| Dữ liệu báo cáo rỗng / khoảng ngày đảo | 200 với tổng 0 / 400 INVALID_DATE_RANGE |
| Demo payment/GPS tắt | 503 FEATURE_NOT_ENABLED, không tác động dữ liệu |

Kiểm thử tranh chấp dùng PostgreSQL thật với các kết nối độc lập. Frontend đếm ngược dựa expires_at/server_time, không dùng đồng hồ client để quyết định quyền nhận xe; tải lại dữ liệu sau lỗi xung đột.

## 13. Chênh lệch với DBML và yêu cầu lưu trữ

Không tự thêm bảng trong file DBML qua tài liệu này. Thành viên CSDL phải cập nhật thiết kế và migration trước khi tuyên bố API tương ứng đã sẵn sàng.

| Hạng mục | Thay đổi cần có |
| --- | --- |
| Thời hạn | Thêm rentals.expires_at, bỏ yêu cầu planned_start_time/planned_end_time cho đặt lịch; giữ actual_start_time/actual_end_time |
| Trạng thái | Thêm Vehicle RESERVED; Rental RESERVED/EXPIRED, thay PENDING/CONFIRMED; không dùng OVERDUE khi chưa có chính sách |
| Tiền chưa tính | rentals.total_price nullable trước khi chốt phí, không dùng 0 để giả định đã miễn phí |
| Chống đặt trùng | Partial unique index vehicle_id với trạng thái RESERVED/IN_RENT/STOLEN; hết hạn phải được chuyển trạng thái trong giao dịch, không dùng NOW() trong predicate index |
| Bàn giao / mã | UNIQUE handovers(rental_id, kind), UNIQUE user_promotions(user_id, promotion_id) |
| Snapshot thanh toán | Lưu giá, loại xe, phiên bản chính sách, mã và số tiền giảm/cọc đã áp dụng ở rental/invoice hoặc cấu trúc phụ đã duyệt |
| Ghi sổ một lần | Liên kết định danh giao dịch nghiệp vụ với wallet_transactions; ràng buộc không ghi cùng thanh toán hai lần |
| Idempotency | Kho bền vững lưu key, request hash, kết quả và trạng thái xử lý; không giả định 15 bảng hiện tại đã hỗ trợ |
| Audit / GPS thật | Kho audit cho quản trị, xác minh giấy tờ; mô hình thiết bị nếu tích hợp GPS thật |
| Bảo trì / bảng giá | Nếu cần phiếu bảo trì, lịch sử giá hoặc vị trí đầy đủ phải bổ sung bảng; support_tickets không thay thế toàn bộ |
| Kiểm tra giá trị | CHECK enum, capacity > 0, pin 0–100, tiền không âm, thứ tự các mốc thời gian, expires_at = created_at + 30 phút |
| FK DBML | Quan hệ nullable biểu diễn bằng cột nullable và ký hiệu quan hệ chuẩn; rà soát ký hiệu `>?` trong bản hiện tại trước khi xuất ERD |

Giữ các ràng buộc unique sẵn có như wallets.user_id, invoices.rental_id, rental_reviews.rental_id. Không xóa dữ liệu lịch sử có liên quan tài chính. Bất kỳ endpoint nào cần trường chưa có phải chờ migration, không trả dữ liệu giả để che thiếu schema.

## 14. Các quyết định cần nhóm duyệt trước khi đóng băng V1

| Quyết định | Đề xuất/phạm vi hiện tại | API bị ảnh hưởng |
| --- | --- | --- |
| Giá thuê | DBML có daily_price; chưa chốt ngày lịch hay mỗi 24 giờ, làm tròn và mức tối thiểu | quote, return, revenue |
| Cọc | Chưa chốt thu lúc giữ hay nhận, cấn trừ/hoàn, phí hủy/hết hạn | reserve, cancel, pickup, return |
| Điều kiện khách/xe | Chưa chốt giấy tờ bắt buộc và ngưỡng pin; không mặc định các số minh họa cũ | danh sách xe, reserve, pickup |
| Số chuyến của một khách | Chưa chốt giới hạn một hay nhiều; không tự áp unique customer_id cho lượt đang hoạt động | reserve |
| Trả xe thiếu tiền | Demo đề xuất từ chối hoàn tất; vận hành thật cần quy trình nhận xe và công nợ | return, invoice |
| Tiền / khuyến mãi | Đề xuất giảm phần trăm trên tiền thuê; cần chốt làm tròn, điều kiện nhận và thanh toán | promotions, quote |
| Tích hợp thanh toán | Demo ví được đánh dấu rõ; chưa có contract provider/webhook thật | topups, refund |
| GPS / upload | Demo GPS nhân viên nhập; kho ảnh, thiết bị và dữ liệu thật cần contract tích hợp | documents, gps |
| Nhân viên | Đề xuất quyền toàn hệ thống do chưa có phân công theo trạm | pickup, return, quản trị |
| Tính phí theo quote | Đề xuất token 120 giây, tính lại tại trả và yêu cầu quote mới nếu tổng đổi | quote, return |
| Sự cố/mất xe | Hỗ trợ ticket, không tự kết thúc chuyến/hoàn tiền; cần quy trình xử lý riêng | support, stolen, maintenance |

Trình tự triển khai: duyệt các quyết định phụ thuộc → đồng bộ DBML/migration → tạo schema request/response và OpenAPI từ backend → frontend dùng đúng contract → chạy kiểm thử mục 12. Mọi thay đổi tên field, enum hoặc hành vi phải được cập nhật vào tài liệu này và thông báo cho nhóm trước khi tích hợp.
