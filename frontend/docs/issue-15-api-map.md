# Bản đồ API Issue #15 — Giao diện CUSTOMER & Nền tảng dùng chung

Cập nhật: **25/11/2026**. Base URL: `/api/v1` (cấu hình qua `VITE_API_BASE_URL`).
Ký hiệu: **I** = bắt buộc header `Idempotency-Key` (16–128 ký tự); **CSRF** = bắt buộc `credentials: 'include'`, `Content-Type: application/json`, `X-EVRide-CSRF: 1` (và `Origin` hợp lệ).

---

## 1. Xác thực, Hồ sơ cá nhân, Giấy tờ & Tệp dùng chung

| Màn hình / Hành động | Method & Path | Quyền | File backend nguồn | Lưu ý thực tế đã xác minh |
| --- | --- | --- | --- | --- |
| Đăng ký tài khoản khách hàng | `POST /auth/register` | Public | `backend/app/api/v1/auth.py`, `schemas/auth.py` | Tạo `CUSTOMER` + `Wallet` (`"0.00"`). Mật khẩu 12–128 ký tự, **không trim**; trùng email trả `409 EMAIL_EXISTS`. |
| Đăng nhập (chung C/S/M) | `POST /auth/login` | Public · CSRF | `backend/app/api/v1/auth.py`, `core/auth_sessions.py`, `core/auth_http.py` | Trả `access_token` (giữ RAM), `session_id` (UUID), `generation: 0`, `user`; đặt cookie `HttpOnly` `evr_rt_<sid_hex>_0` tại `Path=/api/v1/auth`. |
| Làm mới phiên truy cập | `POST /auth/refresh` | Cookie phiên · CSRF | `backend/app/api/v1/auth.py`, `core/auth_sessions.py` | Gửi thêm `X-Session-ID: <session_id>`, body `{}`. Chỉ tự động gọi tối đa 1 lần khi gặp `401 TOKEN_EXPIRED`; điều phối qua Web Locks (`evride-auth`) + BroadcastChannel. |
| Đăng xuất phiên hiện tại | `POST /auth/logout` | Cookie phiên · CSRF | `backend/app/api/v1/auth.py`, `core/auth_sessions.py` | Gửi thêm `X-Session-ID: <session_id>`, body `{}`; thu hồi phiên và xóa cookie `evr_rt_*`. |
| Xem hồ sơ của tôi | `GET /users/me` | `CUSTOMER` / `STAFF` / `MANAGER` | `backend/app/api/v1/users.py`, `schemas/user.py` | Trả `{ id, name, email, role, status, created_at }`. |
| Cập nhật tên hiển thị | `PATCH /users/me` | `CUSTOMER` / `STAFF` / `MANAGER` | `backend/app/api/v1/users.py`, `schemas/user.py` | Body `{ name }` (1–100 ký tự sau trim). |
| Đổi mật khẩu | `POST /users/me/change-password` | `CUSTOMER` / `STAFF` / `MANAGER` · CSRF | `backend/app/api/v1/users.py`, `core/auth_sessions.py` | Body `{ current_password, new_password }` (12–128 ký tự, không trim). Thành công thu hồi mọi phiên trong DB → FE gọi tiếp `POST /auth/logout` để dọn cookie rồi chuyển về `/login`. |
| Tải ảnh lên hệ thống (dùng chung) | `POST /files/upload` | `CUSTOMER` / `STAFF` / `MANAGER` | `backend/app/api/v1/files.py` | `multipart/form-data` (`file`: JPEG/PNG/WebP, 1B–10MiB). Trả `201` `{ file_id, original_filename, content_type, size_bytes, sha256, status: "READY" }`. |
| Tải ảnh riêng tư để hiển thị/lưu | `GET /files/{file_id}/download` | Người upload / Chủ tài nguyên / `STAFF` / `MANAGER` | `backend/app/api/v1/files.py` | Trả luồng nhị phân (`FileResponse`) kèm Bearer token; hiển thị bằng `ObjectURL` tạm thời và thu hồi khi unmount, không cache lâu dài. |
| Danh sách giấy tờ của tôi | `GET /users/me/documents` | `CUSTOMER` / `STAFF` / `MANAGER` | `backend/app/api/v1/documents.py`, `schemas/document.py` | Phân trang `page`, `page_size`. Trả số giấy tờ đã che (`document_number_masked`), `verified_status`, `expires_on`, `verified_birth_date`, `revoked_at`. Không có trường `rejection_reason` riêng. |
| Nộp / nộp lại giấy tờ eKYC | `POST /users/me/documents` | `CUSTOMER` / `STAFF` / `MANAGER` | `backend/app/api/v1/documents.py`, `schemas/document.py` | Tạo bản `PENDING` mới. **Code thực tế bắt buộc cả `front_file_id` và `back_file_id`** (khác tài liệu ghi `back_file_id` tùy chọn); nhận thêm `document_type`, `document_number`, `birth_date?`, `expires_on?`. |
| Xem số đầy đủ & ảnh giấy tờ | `GET /user-documents/{doc_id}/sensitive` | Chủ sở hữu / `STAFF` / `MANAGER` | `backend/app/api/v1/documents.py` | Trả `{ id, document_number, document_type, front_download_url, back_download_url }` (không có `urls_expire_at`). Chỉ tải khi người dùng bấm xem, không lưu storage. |

---

## 2. Trạm, Xe máy điện, Giữ xe & Theo dõi chuyến thuê

| Màn hình / Hành động | Method & Path | Quyền | File backend nguồn | Lưu ý thực tế đã xác minh |
| --- | --- | --- | --- | --- |
| Danh sách trạm đang hoạt động & tìm trạm trả | `GET /stations` | Public | `backend/app/api/v1/fleet.py`, `schemas/fleet.py` | Query `q?`, `has_available_vehicles?`, `has_return_space?`, `page`, `page_size`. `latitude`/`longitude` trả dạng `string`; `opens_at`/`closes_at` cùng `null` là mở 24/7. |
| Chi tiết trạm | `GET /stations/{station_id}` | Public | `backend/app/api/v1/fleet.py` | Chỉ trả trạm `ACTIVE` (trạm `INACTIVE` trả `404`). Có bộ đếm động `available_vehicle_count` và `available_spaces`. |
| Danh sách xe có thể đặt tại trạm | `GET /stations/{station_id}/vehicles` | Public | `backend/app/api/v1/fleet.py`, `schemas/fleet.py` | Query `model?`, `page`, `page_size`. Tự lọc xe `AVAILABLE`, `battery_percent >= 30`, trạm đang mở và không có phiếu bảo trì `OPEN`/`IN_PROGRESS`. |
| Tìm kiếm xe trên toàn hệ thống | `GET /vehicles` | Public (hoặc S/M) | `backend/app/api/v1/fleet.py` | Query `station_id?`, `model?`, `page`, `page_size`. Với khách/Public chỉ trả xe đủ điều kiện đặt. Hiển thị giá 30 phút đầu + phút thêm + cọc. |
| Chi tiết một xe | `GET /vehicles/{vehicle_id}` | Public (hoặc S/M) | `backend/app/api/v1/fleet.py` | Với khách/Public: nếu xe vừa được giữ/thuê hoặc tụt pin <30% sẽ trả `404 NOT_FOUND` (cần xử lý êm trên chi tiết chuyến bằng dữ liệu snapshot của chuyến). |
| Xác nhận giữ xe 30 phút | `POST /rentals` | `CUSTOMER` · **I** | `backend/app/api/v1/rentals.py`, `schemas/rental.py`, `services/rentals.py` | Body `{ vehicle_id, pickup_station_id }` (**ID bắt buộc gửi dạng string**). Kiểm tra ví `ACTIVE` có số dư `>= deposit + first_30_minutes_price`, CCCD `VERIFIED` còn hạn & đủ 16 tuổi (`409 VERIFIED_CCCD_REQUIRED`), giới hạn 3 lần hủy/hết hạn/ngày (`409 DAILY_CANCELLATION_LIMIT_REACHED`), tối đa 1 chuyến chưa giải quyết (`409 ACTIVE_RENTAL_EXISTS`). |
| Danh sách chuyến hiện tại & lịch sử chuyến | `GET /rentals` | `CUSTOMER` (chỉ của mình) / S/M | `backend/app/api/v1/rentals.py`, `schemas/rental.py` | Query `status?`, `vehicle_id?`, `pickup_station_id?`, `created_from?`, `created_to?`, `page`, `page_size`. Tự chuyển `RESERVED` quá hạn thành `EXPIRED` khi đọc. |
| Chi tiết chuyến thuê | `GET /rentals/{rental_id}` | Chủ sở hữu / S/M | `backend/app/api/v1/rentals.py`, `schemas/rental.py` | Trả kèm snapshot giá/mẫu xe (`vehicle_name`, `vehicle_model_snapshot`, giá/cọc snapshot), `remaining_hold_seconds` (đếm ngược bù `meta.server_time`), `elapsed_seconds` (`null` trước khi nhận xe). |
| Khách hủy giữ chỗ trước khi nhận xe | `POST /rentals/{rental_id}/cancel` | `CUSTOMER` sở hữu · **I** | `backend/app/api/v1/rentals.py`, `services/rentals.py` | Body `{}`. Miễn phí trước pickup nhưng tính vào hạn mức 3 lần hủy/hết hạn mỗi ngày theo giờ Việt Nam. Quá hạn giữ chỗ sẽ trả `409 RESERVATION_EXPIRED`. |
| Xem báo giá trả xe (ước tính hoặc chốt 10 phút) | `POST /rentals/{rental_id}/return-quote` | Chủ sở hữu / S/M | `backend/app/api/v1/rentals.py`, `schemas/rental.py`, `services/rentals.py` | Body `{ return_station_id, promotion_code? }` (`return_station_id` dạng string). Khi `IN_RENT`: trả ước tính (`is_estimate: true`). Khi `RETURN_PENDING`: phải truyền `actual_return_station_id`, trả báo giá khóa cước 10 phút (`is_estimate: false`, tách `rental_fee`, `discount_amount`, `total_amount`, `deposit_applied`, `additional_payment`, `deposit_refund`). Không tiêu thụ mã khuyến mãi. |
| Xem biên bản bàn giao / nhận trả xe | `GET /rentals/{rental_id}/handovers` | Chủ sở hữu / S/M | `backend/app/api/v1/rentals.py` | Phân trang. Hiển thị mốc nhận xe (`PICKUP`), tiếp nhận trả xe (`RETURN`), phần trăm pin và tình trạng xe. |
| Xem hóa đơn chuyến thuê | `GET /rentals/{rental_id}/invoice` | Chủ sở hữu / S/M | `backend/app/api/v1/rentals.py` | Trả `404 NOT_FOUND` nếu chuyến chưa phát hành hóa đơn (cần xử lý như trạng thái “Chưa phát hành hóa đơn”, không coi là lỗi hệ thống). |
| Xem giao dịch tài chính của chuyến | `GET /rentals/{rental_id}/transactions` | Chủ sở hữu / S/M | `backend/app/api/v1/rentals.py` | Query `kind?`, `status?`, `page`, `page_size`. Gồm các khoản `DEPOSIT`, `PAYMENT`, `REFUND`. |
| Xem vị trí GPS mô phỏng mới nhất | `GET /rentals/{rental_id}/gps/latest` | Chủ sở hữu / S/M | `backend/app/api/v1/operations.py`, `services/operations.py` | Trả `{ point, stale_after_seconds: 60, is_stale }`. `latitude`/`longitude` của `point` là `number` (`float`). Hiển thị cảnh báo khi `is_stale === true`. |
| Xem lịch sử lộ trình GPS mô phỏng | `GET /rentals/{rental_id}/gps` | Chủ sở hữu / S/M | `backend/app/api/v1/operations.py` | Query `from?`, `to?` (ISO có múi giờ), `page`, `page_size`. |

---

## 3. Ví Tiền mô phỏng & Khuyến mãi

| Màn hình / Hành động | Method & Path | Quyền | File backend nguồn | Lưu ý thực tế đã xác minh |
| --- | --- | --- | --- | --- |
| Xem thông tin & số dư ví | `GET /wallets/me` | `CUSTOMER` | `backend/app/api/v1/wallets.py`, `schemas/wallet.py` | Trả `{ id, user_id, balance, status, created_at, updated_at }`. Luôn hiển thị nhãn **“Tiền mô phỏng”**. |
| Lịch sử biến động số dư ví | `GET /wallets/me/transactions` | `CUSTOMER` | `backend/app/api/v1/wallets.py`, `schemas/wallet.py` | Query `type?`, `status?`, `from?`, `to?`, `page`, `page_size`. Chỉ chứa các giao dịch đã thực sự ghi sổ ví (`TOPUP`, `RENTAL_DEPOSIT`, `RENTAL_PAYMENT`, `RENTAL_REFUND`...). |
| Gửi yêu cầu nạp tiền chờ duyệt *(PR #40 đã merge `origin/develop`)* | `POST /wallets/me/topups` | `CUSTOMER` · **I** | `origin/develop` (`b52ef8f`, PR #40 SHA `142451c9f9631b35c1fbc6be512d12a70ad51772`): `api/v1/wallets.py`, `schemas/wallet.py`, `services/wallets.py` | **Đã merge vào `origin/develop`** (`2026-11-25T16:12:43Z`, migration `d7e4b2c9a105`). Body `{ amount }` (chuỗi thập phân dương `^[0-9]{1,10}(?:\.[0-9]{1,2})?$`, `<= 9999999999.99`, `extra="forbid"`). Trả `201` `{ id, wallet_id, requested_by, amount, status: "PENDING", payment_mode: "DEMO", created_at, reviewed_by, reviewed_at, rejection_reason, wallet_transaction_id }`. Cần bật `DEMO_PAYMENTS_ENABLED` (`503 FEATURE_NOT_ENABLED` nếu tắt). Không tự cộng số dư ví trên UI; khóa nút gửi nếu backend local chưa cập nhật contract mới (`GET /wallets/me/topups` trả `404`/`405`). |
| Danh sách yêu cầu nạp tiền của tôi *(PR #40 đã merge `origin/develop`)* | `GET /wallets/me/topups` | `CUSTOMER` | `origin/develop` (`b52ef8f`, PR #40 SHA `142451c9f9631b35c1fbc6be512d12a70ad51772`): `api/v1/wallets.py` | Query `status?` (`PENDING` \| `APPROVED` \| `REJECTED`), `page`, `page_size`. Không phụ thuộc `DEMO_PAYMENTS_ENABLED`. Hiển thị tách biệt với `/wallets/me/transactions`. |
| Chi tiết một yêu cầu nạp tiền *(PR #40 đã merge `origin/develop`)* | `GET /wallet-topup-requests/{request_id}` | Chủ yêu cầu / S/M | `origin/develop` (`b52ef8f`, PR #40 SHA `142451c9f9631b35c1fbc6be512d12a70ad51772`): `api/v1/wallets.py` | Xem thời điểm xử lý (`reviewed_at`) và `rejection_reason` khi bị từ chối. Khách khác nhận `404`. |
| Danh sách chương trình khuyến mãi khả dụng | `GET /promotions` | `CUSTOMER` / `MANAGER` | `backend/app/api/v1/wallets.py`, `schemas/wallet.py` | Với `CUSTOMER`: backend tự lọc mã `ACTIVE` đang trong khoảng `start_date <= now < end_date`. |
| Nhận mã khuyến mãi về tài khoản | `POST /promotions/{promotion_id}/claim` | `CUSTOMER` · **I** | `backend/app/api/v1/wallets.py`, `services/wallets.py` | Body `{}`. Lần đầu trả `201`, nhận lại mã đã có trả `200` bản hiện có (không nhân bản). Nhận mã chưa giữ lượt dùng. |
| Danh sách mã khuyến mãi của tôi | `GET /users/me/promotions` | `CUSTOMER` | `backend/app/api/v1/wallets.py`, `schemas/wallet.py` | Query `is_used?` (`true`/`false`), `page`, `page_size`. Trả `{ id, user_id, promotion_id, is_used, used_at, promotion }`. |

---

## 4. Hỗ trợ, Sự cố phía khách, Đánh giá & Hỏi đáp FAQ

| Màn hình / Hành động | Method & Path | Quyền | File backend nguồn | Lưu ý thực tế đã xác minh |
| --- | --- | --- | --- | --- |
| Gửi ticket hỗ trợ / báo sự cố theo chuyến | `POST /rentals/{rental_id}/support-tickets` | Chủ sở hữu / S/M | `backend/app/api/v1/operations.py`, `schemas/operations.py`, `services/operations.py` | Body `{ title, description }` (`title` 1–200, `description` 1–5000 ký tự). Chỉ nhận chuyến `IN_RENT`, `RETURN_PENDING`, `STOLEN`, `INCIDENT_PENDING`, `COMPLETED`. Gửi ticket không tự dừng cước. |
| Danh sách ticket hỗ trợ của tôi | `GET /support-tickets` | `CUSTOMER` (chỉ của mình, ẩn ticket cảnh báo hệ thống) / S/M | `backend/app/api/v1/operations.py` | Query `status?` (`OPEN` \| `IN_PROGRESS` \| `RESOLVED` \| `CLOSED`), `rental_id?`, `page`, `page_size`. Không truyền `assigned_to` từ phía khách (`403`). |
| Chi tiết ticket hỗ trợ | `GET /support-tickets/{ticket_id}` | Chủ sở hữu / S/M | `backend/app/api/v1/operations.py` | Hiển thị tiến độ xử lý và `resolution_note` khi `RESOLVED`/`CLOSED`. |
| Đính kèm ảnh bằng chứng vào ticket | `POST /files/{file_id}/attachments` | Chủ sở hữu (người tự upload file) / S/M · **I** | `backend/app/api/v1/operations.py`, `schemas/operations.py`, `services/operations.py` | Body `{ purpose: "TICKET_EVIDENCE", support_ticket_id }` (`support_ticket_id` bắt buộc dạng string). Mỗi `file_id` chỉ gắn được 1 lần. |
| Danh sách ảnh bằng chứng của ticket | `GET /files/attachments` | Chủ sở hữu / S/M | `backend/app/api/v1/operations.py` | Query bắt buộc `owner_type=SUPPORT_TICKET&owner_id={ticket_id}`, `page`, `page_size`. Tải ảnh qua `GET /files/{file_id}/download`. |
| Xem tổng hợp tài chính hồ sơ sự cố | `GET /rental-incidents/{incident_id}/finance-summary` | Chủ sở hữu chuyến / S/M | `backend/app/api/v1/incident_completion.py`, `services/incident_completion.py` | Tách rõ `rent_paid`, `deposit_remaining_held`, `compensation_amount` (`null` chưa xác định vs `"0.00"` không phải bồi thường vs số dương ngoài hệ thống), `agreement_status`, `closed_at`. **Lưu ý giới hạn backend:** `GET /rental-incidents` là `S/M only` và `rental_out` chưa trả `incident_id`; chỉ gọi khi có `incident_id` hợp lệ và xử lý êm `409 INCIDENT_NOT_CONFIRMED`. |
| Gửi đánh giá chuyến đã hoàn tất | `POST /rentals/{rental_id}/review` | `CUSTOMER` sở hữu | `backend/app/api/v1/operations.py`, `schemas/operations.py`, `services/operations.py` | Body `{ rating, comment? }` (`rating` nguyên `1..5`, `comment` tối đa 2000 ký tự). Chỉ áp dụng cho `COMPLETED` (`CLOSED_INCIDENT` bị từ chối `409 RENTAL_NOT_COMPLETED`); mỗi chuyến tối đa 1 lần (`409 ALREADY_REVIEWED`). |
| Xem đánh giá của chuyến | `GET /rentals/{rental_id}/review` | Chủ sở hữu / S/M | `backend/app/api/v1/operations.py` | Trả `404 NOT_FOUND` nếu chuyến chưa có đánh giá. |
| Danh sách 12 câu hỏi thường gặp | `GET /faq` | Public | `backend/app/api/v1/operations.py`, `services/faq.py` | Trả mảng `{ id, question, answer, sources: [{ title, url }] }`; trả `503 DEPENDENCY_UNAVAILABLE` nếu thiếu file nguồn. |
| Đọc nội dung tài liệu nguồn FAQ | `GET /faq/sources/{source_id}` | Public | `backend/app/api/v1/operations.py`, `services/faq.py` | `source_id` thuộc allowlist (`decisions`, `contract`, `overview`); trả văn bản `text/plain` (không bọc `{ data, meta }`). |
| Hỏi đáp Chatbot FAQ | `POST /chatbot/messages` | `CUSTOMER` | `backend/app/api/v1/operations.py`, `schemas/operations.py`, `services/faq.py` | Body `{ message }` (1–2000 ký tự). Trả `{ reply, sources, mode: "FAQ" }`; không hỗ trợ đặt xe hay chuyển tiền qua chat. |

---

## 5. Tổng hợp Trạng thái Hợp nhất & Giới hạn API trên `develop`

1. **Đã merge vào `origin/develop` (PR #40 — merge commit `b52ef8f`, head SHA `142451c9f9631b35c1fbc6be512d12a70ad51772`, migration `d7e4b2c9a105`):**
   - `POST /api/v1/wallets/me/topups` (tạo yêu cầu `201 PENDING` thay cho bản cộng ngay cũ).
   - `GET /api/v1/wallets/me/topups` (khách xem danh sách yêu cầu nạp của mình).
   - `GET /api/v1/wallet-topup-requests/{request_id}` (chủ yêu cầu xem chi tiết yêu cầu nạp).
   - Lưu ý môi trường local: nhánh FE `codex/fe-customer-integration` tách từ commit `61b1c9c` trước `b52ef8f` (và không sửa `backend/`), nên nếu chạy backend trực tiếp từ working tree hiện tại chưa đồng bộ `origin/develop` + `alembic upgrade head`, `GET /wallets/me/topups` sẽ trả `405` → Frontend tự động khóa nút gửi yêu cầu nạp để không bao giờ gọi nhầm endpoint cộng ngay cũ.
   - Các API phía `STAFF`/`MANAGER` (`GET /wallet-topup-requests`, `POST .../approve`, `POST .../reject`) thuộc phạm vi Issue #16.
2. **Giới hạn API hiện hành trên Backend `develop` (cần xử lý theo đúng thực tế, không giả lập thành công):**
   - Khách hàng (`CUSTOMER`) **không** có API liệt kê hoặc đọc trực tiếp bản ghi `rental_incidents` (`GET /rental-incidents` và `GET /rental-incidents/{id}` đều giới hạn `STAFF`/`MANAGER`), và `GET /rentals/{id}` chưa đính kèm `incident_id` hay `billing_cutoff_at`.
   - `DocumentOut` (`GET /users/me/documents`) chưa lưu/trả trường lý do từ chối riêng khi giấy tờ bị `REJECTED`.
   - Luồng presigned URL (`POST /files/upload-intents`, `POST /files/{id}/complete`), cổng thanh toán thật và GPS phần cứng nằm ngoài phạm vi triển khai V1.


## Điều chỉnh sau review nhiệm vụ 9

- Contract nạp tiền đã đối chiếu code `origin/develop:b52ef8f`, `backend/app/api/v1/wallets.py` và `schemas/wallet.py`; PR #40 đã merge, không còn dependency chờ merge. Runtime demo/migration vẫn phải xác nhận riêng.
- `createCustomerTopupRequest(payload, key, { backendCompatible: true })` yêu cầu opt-in sau GET danh sách thành công. Bỏ tham số sẽ chặn trước network; POST chỉ nhận bản ghi có id string, PENDING và payment_mode DEMO. Lỗi response không có nghĩa giao dịch chưa ghi: tải lại lịch sử, giữ key nếu kết quả chưa rõ.
- Ví tải lại số dư/giao dịch/danh sách mỗi 12 giây khi trang hiển thị và API tương thích, độc lập bộ lọc và số trang. Không suy ra duyệt thành công chỉ vì một yêu cầu biến mất khỏi danh sách. Không hủy request chậm bằng lượt polling kế tiếp.
- AuthProvider remount subtree theo session/user/role; refresh token cùng phiên không remount. Hồ sơ dùng `updateSessionUser`, không có `updateCurrentUser`.
- API client từ chối URL tuyệt đối khác origin API trước khi gửi bearer/cookie. Link download/source nên dùng đường dẫn API tương đối để tương thích proxy.
- Quote countdown dùng thời gian hiện tại đã bù offset từ meta.server_time, không dùng lại thời điểm response cố định. Đổi mã/trạng thái/chuyến vô hiệu hóa quote cũ; response quote đến trễ không ghi đè yêu cầu mới.
- Checklist kiểm chứng và hợp đồng dùng chung cho #16: [issue-15-review.md](issue-15-review.md).
