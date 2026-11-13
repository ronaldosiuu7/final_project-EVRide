# EVRide — API bàn giao Frontend

Cập nhật theo router backend ngày **13/11/2026**. Đây là bản tra cứu ngắn các API đã có trong mã nguồn, không gồm API dự kiến.

## 1. Cách đọc và kết nối

- Mọi endpoint bên dưới có tiền tố **`/api/v1`**. Ví dụ: `GET /stations` → `GET /api/v1/stations`.
- Swagger tại **`/docs`**, OpenAPI tại **`/openapi.json`** trên host backend. Xem tại đây để biết đầy đủ schema, trường bắt buộc và giới hạn dữ liệu. Hướng dẫn chạy: [backend/README.md](../backend/README.md).
- Quyền: **Public** = chưa cần đăng nhập; **User** = đã đăng nhập; **C** = `CUSTOMER`; **S/M** = `STAFF` hoặc `MANAGER`; **M** = `MANAGER`. Khách chỉ truy cập dữ liệu thuộc mình, trừ dữ liệu công khai.
- **K** trong cột quyền: phải gửi `Idempotency-Key` dài 16–128 ký tự (có thể dùng UUID). Mỗi hành động mới dùng key mới; retry cùng hành động giữ nguyên key và payload.
- Body dùng JSON, trừ upload dùng `multipart/form-data`. Các trường được liệt kê là dữ liệu chính, không thay thế schema đầy đủ. `?` sau tên trường nghĩa là tùy chọn.
- Gửi ID trong body bằng chuỗi số như `"123"`; tiền bằng chuỗi thập phân như `"50000.00"`. Giữ ID dạng chuỗi trong JavaScript. Thời gian gửi dạng ISO 8601 có múi giờ; enum giữ nguyên chữ hoa.
- Không tự tính số tiền phải thu ở frontend; lấy kết quả quote/preview từ backend. Một số response dùng serializer chung có thể trả số thay vì chuỗi; chuẩn hóa dữ liệu ở API client khi nhận.
- Danh sách có phân trang thường dùng `page=1&page_size=20`, tối đa 100; chỉ gửi bộ lọc endpoint hỗ trợ.

Response thông thường: `{ "data": ..., "meta": { "request_id": "...", "server_time": "..." } }`. Danh sách phân trang thêm `page`, `page_size`, `total` trong `meta`.

Lỗi: `{ "error": { "code": "...", "message": "..." }, "meta": ... }`; có thể có chi tiết validation. Xử lý theo `error.code`: `401` cần kiểm tra phiên, `403` thiếu quyền/CSRF, `404` không tìm thấy hoặc không được xem, `409` xung đột nghiệp vụ, `422` dữ liệu sai. Không retry tự động mọi lỗi ghi dữ liệu.

Ngoại lệ: health trả JSON trực tiếp; download trả file; nguồn FAQ trả văn bản.

## 2. Xác thực và tài khoản

API cần đăng nhập gửi `Authorization: Bearer <access_token>`.

**Login, refresh, logout và đổi mật khẩu** cần `Content-Type: application/json`, `X-EVRide-CSRF: 1` và Origin nằm trong cấu hình backend. Trình duyệt tự gửi Origin. Dùng `credentials: "include"` hoặc Axios `withCredentials: true` cho các request dùng cookie phiên.

Login/refresh trả `data.access_token`, `session_id`, `expires_in`, `access_expires_at` và thông tin user/phiên. Refresh token nằm trong cookie HttpOnly, frontend không đọc hoặc tự gửi token này trong JSON. Refresh/logout gửi thêm `X-Session-ID: <session_id>` và body `{}`. Khi refresh thành công, cập nhật access token; tránh nhiều request refresh đồng thời cho cùng phiên. Đổi mật khẩu thu hồi các phiên, cần quay về đăng nhập.

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Đăng ký khách: `name`, `email`, `password`. |
| POST | `/auth/login` | Public | Đăng nhập: `email`, `password`; nhận token, phiên và user. |
| POST | `/auth/refresh` | Cookie phiên | Làm mới access token; body `{}`, header phiên như trên. |
| POST | `/auth/logout` | Cookie phiên | Đăng xuất phiên; body `{}`, header phiên như trên. |
| GET | `/users/me` | User | Thông tin tài khoản đang đăng nhập. |
| PATCH | `/users/me` | User | Đổi tên: `name`. |
| POST | `/users/me/change-password` | User | `current_password`, `new_password`; cần header CSRF. |
| GET | `/users` | S/M | Danh sách người dùng; lọc `role`, `status`, `q`. |
| GET | `/users/{user_id}` | S/M | Chi tiết người dùng. |
| POST | `/users` | M | Tạo nhân viên/quản lý: `name`, `email`, `password`, `role`. |
| PATCH | `/users/{user_id}` | M | Cập nhật `name?`, `status?`, `role?`. |

## 3. Giấy tờ và file

Upload ảnh trước để lấy ID, sau đó dùng ID khi tạo giấy tờ hoặc gắn bằng chứng. Ảnh hỗ trợ JPEG/PNG/WebP, tối đa 10 MiB. Với FormData, để trình duyệt tự đặt Content-Type và boundary.

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| POST | `/files/upload` | User | FormData trường `file`; nhận thông tin file/ID. |
| GET | `/files/{file_id}/download` | User, theo quyền file | Tải nội dung file; gửi Bearer token, nhận blob nếu dùng fetch. |
| GET | `/users/me/documents` | User | Giấy tờ của mình; số giấy tờ được che. |
| POST | `/users/me/documents` | User | `document_type`, `document_number`, `front_file_id`, `back_file_id`, `birth_date?`, `expires_on?`. |
| PATCH | `/user-documents/{doc_id}/verification` | S/M | Duyệt/từ chối: `verified_status`, `verified_birth_date?`, `expires_on?`. |
| GET | `/user-documents/{doc_id}/sensitive` | Chủ giấy tờ, S/M | Số giấy tờ đầy đủ và đường dẫn ảnh; không lưu vào log/frontend analytics. |
| POST | `/files/{file_id}/attachments` | User · K | Gắn ảnh vào ticket: `purpose: "TICKET_EVIDENCE"`, `support_ticket_id`. |
| GET | `/files/attachments` | User | Ảnh của ticket: query `owner_type=SUPPORT_TICKET`, `owner_id`. |

## 4. Trạm, xe và giá thuê

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| GET | `/stations` | Public | Trạm; lọc `q`, `has_available_vehicles`, `has_return_space`. |
| GET | `/stations/{station_id}` | Public | Chi tiết trạm. |
| GET | `/stations/{station_id}/vehicles` | Public | Xe có thể thuê tại trạm; lọc `model`. |
| GET | `/vehicles` | Public / User | Xe; query `station_id`, `model`, `status`; phạm vi hiển thị phụ thuộc vai trò. |
| GET | `/vehicles/{vehicle_id}` | Public / User | Chi tiết xe; dữ liệu hiển thị phụ thuộc vai trò. |
| GET | `/admin/stations` | S/M | Danh sách trạm vận hành; lọc `q`, `status`. |
| POST | `/stations` | M | Tạo trạm: tên, địa chỉ, tọa độ, sức chứa, giờ hoạt động tùy chọn. |
| PATCH | `/stations/{station_id}` | M | Cập nhật thông tin/trạng thái trạm. |
| POST | `/vehicles` | M | Tạo xe: trạm, tên, model, pin và bộ giá/cọc ban đầu. |
| PATCH | `/vehicles/{vehicle_id}` | M | Cập nhật `name?`, `model?`. |
| PATCH | `/vehicles/{vehicle_id}/battery` | S/M | Cập nhật `battery_percent`, `note`. |
| POST | `/vehicles/{vehicle_id}/status` | S/M · K | Chuyển `AVAILABLE`/`MAINTENANCE`, kèm `note`; backend kiểm tra điều kiện. |
| POST | `/vehicles/{vehicle_id}/move` | S/M · K | Điều chuyển: `target_station_id`, `note?`. |
| GET | `/vehicles/{vehicle_id}/move-history` | S/M | Lịch sử điều chuyển. |
| GET | `/prices` | S/M | Danh sách giá; lọc `vehicle_id`. |
| GET | `/prices/{price_id}` | S/M | Chi tiết bản giá. |
| POST | `/prices` | M · K | Tạo giá mới: `vehicle_id`, `first_30_minutes_price`, `extra_minute_price`, `deposit_amount`. |

## 5. Ví và khuyến mãi

Ví/nạp tiền là mô phỏng trong V1. Frontend lấy số dư và kết quả giao dịch từ backend.

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| GET | `/wallets/me` | C | Số dư và trạng thái ví của mình. |
| GET | `/wallets/me/transactions` | C | Lịch sử ví; lọc `type`, `status`, `from`, `to`. |
| POST | `/wallets/me/topups` | C · K | Nạp demo: `amount`. |
| GET | `/users/{user_id}/wallet` | M | Xem ví khách. |
| PATCH | `/wallets/{wallet_id}/status` | M | `status`: `ACTIVE`, `FROZEN` hoặc `LOCKED`. |
| GET | `/promotions` | User | Danh sách mã khuyến mãi; lọc `status`, phạm vi theo vai trò. |
| POST | `/promotions` | M | Tạo mã, loại/mức giảm, giới hạn sử dụng và thời gian áp dụng; xem schema. |
| PATCH | `/promotions/{promotion_id}` | M | Bật/tắt mã: `status` là `ACTIVE` hoặc `DISABLED`. |
| POST | `/promotions/{promotion_id}/claim` | C · K | Lưu mã vào tài khoản; không cần body. |
| GET | `/users/me/promotions` | C | Mã của mình; lọc `is_used`. |

## 6. Thuê, nhận và trả xe

Luồng chính: **đặt xe → nhân viên pickup → nhân viên initiate-return → return-quote → nhân viên return**. Giữ xe 30 phút; pickup mới bắt đầu thời gian thuê. Initiate-return ghi nhận nhận xe thực tế và dừng cước; return hoàn tất quyết toán.

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| POST | `/rentals` | C · K | Giữ xe: `vehicle_id`, `pickup_station_id`. |
| GET | `/rentals` | User | Chuyến của khách/nhân viên theo quyền; lọc `status`, `vehicle_id`, `pickup_station_id`, `created_from`, `created_to`, `customer_id`. |
| GET | `/rentals/{rental_id}` | Chủ chuyến, S/M | Chi tiết chuyến. |
| POST | `/rentals/{rental_id}/cancel` | C · K | Hủy lượt giữ của mình; không cần body. |
| POST | `/rentals/{rental_id}/cancel-operational` | S/M · K | Hủy vận hành: `reason` (`VEHICLE_FAULT`/`SYSTEM_ERROR`), `note`. |
| POST | `/rentals/{rental_id}/pickup` | S/M · K | Bàn giao xe: `station_id`, `battery_percent`, `note?`. |
| POST | `/rentals/{rental_id}/initiate-return` | S/M · K | Nhận xe: `return_station_id`, `battery_percent`, `vehicle_condition` (`OK`/`NEEDS_MAINTENANCE`), `note?`. |
| POST | `/rentals/{rental_id}/return-quote` | Chủ chuyến, S/M | Báo giá: `return_station_id`, `promotion_code?`; nhận `quote_token` để quyết toán. |
| POST | `/rentals/{rental_id}/return` | S/M · K | Quyết toán bằng `quote_token` hợp lệ; không gửi số tiền tự tính. |
| GET | `/rentals/{rental_id}/handovers` | Chủ chuyến, S/M | Biên bản giao/nhận. |
| GET | `/rentals/{rental_id}/invoice` | Chủ chuyến, S/M | Hóa đơn chuyến. |
| GET | `/rentals/{rental_id}/transactions` | Chủ chuyến, S/M | Giao dịch chuyến; lọc `kind`, `status`. |

## 7. Ticket hỗ trợ

Khách báo vấn đề bằng ticket; ticket không tự xác nhận mất xe hoặc phát sinh bồi thường.

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| POST | `/rentals/{rental_id}/support-tickets` | Chủ chuyến, S/M | Tạo ticket: `title`, `description`. |
| GET | `/support-tickets` | User | Danh sách theo quyền; lọc `status`, `rental_id`, `assigned_to`. |
| GET | `/support-tickets/{ticket_id}` | Chủ ticket/chuyến, S/M | Chi tiết ticket. |
| PATCH | `/support-tickets/{ticket_id}` | S/M | Xử lý ticket: `assigned_to?`, `status?`, `resolution_note?`. |

Ảnh bằng chứng dùng nhóm file ở mục 3. Ticket hỗ trợ vẫn có người phụ trách; hồ sơ sự cố và kiểm tra chuyến không có API phân công riêng.

## 8. Chuyến đến lịch kiểm tra

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| GET | `/rental-check-ins` | S/M | Danh sách đến lịch; lọc `rental_id`, `station_id`, có phân trang. |
| POST | `/rental-check-ins/{rental_id}` | S/M · K | Ghi `outcome`, `note`, `next_check_at?`, `source_ticket_id?`. |

- `CONTINUE_RENTAL` hoặc `NO_ANSWER`: bắt buộc `next_check_at`, không gửi `source_ticket_id`.
- `ESCALATE`: chuyển sang tiếp nhận sự cố; không gửi `next_check_at`, có thể gửi `source_ticket_id`.
- Mốc đầu tiên là sau 24 giờ thuê; đây là lịch kiểm tra, không phải hạn trả/phạt. Danh sách được tính khi GET, không có workflow `/rental-alerts` cũ.

## 9. Hồ sơ sự cố và thu hồi

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| POST | `/rentals/{rental_id}/incident/intake` | S/M · K | Tiếp nhận từ ticket: `source_ticket_id`, `note`. |
| GET | `/rental-incidents` | S/M | Hồ sơ sự cố; lọc `status`, `rental_id`, có phân trang. |
| GET | `/rental-incidents/{incident_id}` | S/M | Chi tiết hồ sơ. |
| GET | `/rental-incidents/{incident_id}/events` | S/M | Lịch sử xử lý, có phân trang. |
| POST | `/rental-incidents/{incident_id}/verify` | M · K | Kết luận: `outcome`, `evidence_ticket_id`, `reason`, trường bổ sung theo kết luận. |
| POST | `/rental-incidents/{incident_id}/evidence-tickets` | S/M · K | Thêm ticket bằng chứng: `title`, `description`. |
| POST | `/rental-incidents/{incident_id}/recovery` | S/M · K | Ghi thu hồi: `recovered_at`, `evidence_ticket_id`, `note`. |
| POST | `/rental-incidents/{incident_id}/arrival` | S/M · K | Nhận tại trạm và kiểm tra: `station_id`, `arrived_at`, `condition`, `inspected_at?`, `evidence_ticket_id`, `note`. |
| POST | `/rental-incidents/{incident_id}/release-vehicle` | M · K | Cho phép xe hoạt động lại sau kiểm tra: `maintenance_order_id`, `evidence_ticket_id`, `note`. |

Kết luận verify: `FALSE_ALARM` cần `next_check_at`; `LOSS_THEFT` cần `valid_report_ticket_id`; `ABANDONMENT` không gửi hai trường đó. Tình trạng khi arrival: `INTACT`, `REPAIRABLE`, `UNREPAIRABLE`.

Thu hồi thực tế và về trạm có thể khác thời điểm. Bảo trì tạo bằng API chung ở mục 11 với `incident_id`. Không tự đổi xe sang AVAILABLE từ frontend.

## 10. Tiền thuê/cọc sự cố và kết quả bồi thường

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| GET | `/rental-incidents/{incident_id}/rent-preview` | S/M | Xem tiền thuê cần quyết toán. |
| POST | `/rental-incidents/{incident_id}/settle-rent` | M · K | `expected_rent_amount`, `evidence_ticket_id`, `reason`. |
| GET | `/rental-incidents/{incident_id}/finance-summary` | Chủ chuyến, S/M | Tình hình tiền thuê, cọc, kết quả giải quyết và điều kiện đóng. |
| POST | `/rental-incidents/{incident_id}/deposit/refund` | M · K | Hoàn cọc dư: `expected_amount`, `evidence_ticket_id`, `reason`. |
| POST | `/rental-incidents/{incident_id}/compensation/external-settlement` | M · K | Ghi kết quả bồi thường đã giải quyết bên ngoài; dữ liệu bên dưới. |
| POST | `/rental-incidents/{incident_id}/close` | M · K | Đóng hồ sơ: `evidence_ticket_id`, `reason`; backend kiểm tra đủ điều kiện. |

Body external-settlement gồm `amount`, `agreement_status`, `evidence_ticket_id`, `reason`:
- Nếu `amount = "0.00"`: dùng `NOT_REQUIRED`, không gửi thông tin thanh toán.
- Nếu `amount > 0`: dùng `AGREED` hoặc `AUTHORITY_DECISION`, bắt buộc thêm `payment_method`, `payment_reference`, `paid_at`.

Luồng: xem tiền thuê → quyết toán thuê → hoàn cọc dư nếu có → ghi kết quả xử lý bên ngoài → đóng hồ sơ khi đủ điều kiện. Bồi thường không trừ ví/cấn cọc và không là doanh thu thuê. Đóng hồ sơ không tự giải phóng xe. Các API định giá, tranh chấp, thu/hoàn bồi thường qua ví và `external-result` cũ không còn trong router hiện tại.

## 11. Bảo trì

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| POST | `/maintenance-orders` | S/M · K | `vehicle_id`, `title`, `description`, `assigned_to?`, `incident_id?`. |
| GET | `/maintenance-orders` | S/M | Lọc `vehicle_id`, `incident_id`, `status`, `assigned_to`. |
| GET | `/maintenance-orders/{order_id}` | S/M | Chi tiết phiếu. |
| POST | `/maintenance-orders/{order_id}/start` | S/M · K | Bắt đầu xử lý: `assigned_to?`; có thể gửi `{}`. |
| POST | `/maintenance-orders/{order_id}/complete` | S/M · K | Hoàn thành: `resolution_note`. |
| POST | `/maintenance-orders/{order_id}/cancel` | S/M · K | Hủy phiếu: `reason`. |

Hoàn tất bảo trì không đồng nghĩa frontend được tự đổi xe sang AVAILABLE; xe sự cố dùng release-vehicle sau khi backend xác nhận điều kiện.

## 12. GPS, đánh giá và FAQ

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| POST | `/rentals/{rental_id}/gps` | S/M · K | Ghi GPS demo: `latitude`, `longitude`, `recorded_at`. |
| GET | `/rentals/{rental_id}/gps/latest` | Chủ chuyến, S/M | Vị trí gần nhất. |
| GET | `/rentals/{rental_id}/gps` | Chủ chuyến, S/M | Lịch sử vị trí; query `from`, `to`, phân trang. |
| POST | `/rentals/{rental_id}/review` | C | Đánh giá chuyến của mình: `rating` 1–5, `comment?`; chỉ khi đủ điều kiện. |
| GET | `/rentals/{rental_id}/review` | Chủ chuyến, S/M | Xem đánh giá. |
| GET | `/faq` | Public | Danh sách câu hỏi/trả lời và nguồn. |
| GET | `/faq/sources/{source_id}` | Public | Nội dung nguồn FAQ dạng văn bản. |
| POST | `/chatbot/messages` | C | Hỏi FAQ: `message`; không phải API chat AI tổng quát. |

## 13. Báo cáo và kiểm tra hệ thống

| Method | Endpoint | Quyền | Nội dung / dữ liệu chính |
| --- | --- | --- | --- |
| GET | `/analytics/revenue` | S/M | Doanh thu; query `from_date`, `to_date`. |
| GET | `/analytics/financial-summary` | S/M | Tổng hợp tài chính; query `from_date`, `to_date`. |
| GET | `/analytics/revenue-details` | S/M | Chi tiết doanh thu; query ngày và phân trang. |
| GET | `/health` | Public | Kiểm tra ứng dụng sống; trả `{"status":"ok"}`, không kiểm tra kết nối DB. |

Ngày báo cáo có dạng `YYYY-MM-DD`. Chỉ ba API analytics ở trên đang được đăng ký; các báo cáo mở rộng trong tài liệu thiết kế chưa phải endpoint frontend có thể gọi.

## 14. Tham chiếu

- [Hợp đồng API và giải thích nghiệp vụ chi tiết](api-contract.md).
- [Phạm vi chức năng](requirements.md).
- [Hướng dẫn backend](../backend/README.md).

Danh mục này được đối chiếu tĩnh với router/schema hiện tại; không phải biên bản kiểm thử server hay xác nhận migration đã chạy trên môi trường triển khai.
