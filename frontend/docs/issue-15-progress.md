# Tiến độ triển khai Issue #15 — Giao diện CUSTOMER & Nền tảng API/Auth/Upload dùng chung

**Nhiệm vụ 9 (25/11/2026): đã review và sửa FE; chưa nghiệm thu hoàn tất issue.** Xem [ma trận từng checklist, kết quả kiểm tra và kịch bản demo](issue-15-review.md). Các dấu `[x]` bên dưới là tiến độ triển khai, không chứng minh E2E đã pass. Người dùng chọn tự kiểm thử demo.

Lịch sử trước review: **25/11/2026** — Triển khai **Nhiệm vụ 8** (Hỗ trợ khách hàng `/support` & `/support/tickets/:ticketId` kèm upload ảnh bằng chứng `ImageUploadField` + `PrivateImage`, tổng hợp tài chính sự cố chỉ dùng endpoint `CUSTOMER` có quyền `GET /rental-incidents/{id}/finance-summary` tách biệt tiền thuê/cọc/bồi thường ngoài hệ thống `null` vs `0đ`, đánh giá chuyến 1 lần duy nhất cho `COMPLETED` và chặn `CLOSED_INCIDENT`, trang `/faq` công khai với accordion/tìm kiếm/xem nguồn `text/plain` an toàn & chatbot FAQ, kèm bộ test `customerSupportAndFaq.test.mjs`).

- **Issue:** [#15 — [FE] Khách hàng V1 và nền tảng API, xác thực, upload dùng chung](https://github.com/ronaldosiuu7/final_project-EVRide/issues/15)
- **Nhánh tích hợp chuẩn:** `develop` (commit nền `61b1c9c` — đã bao gồm PR #39 của Issue #16)
- **Nhánh làm việc FE:** `codex/fe-customer-integration` (tạo trực tiếp từ `develop`)
- **Phạm vi thư mục:** Chỉ làm việc trong `frontend/`; tuyệt đối không sửa/import từ `frontend-private/` và không sửa `backend/`.

---

## 1. Hiện trạng khảo sát trên `develop` (Không làm trùng)

PR #39 (Issue #16) đã được merge vào `develop`, cung cấp sẵn các phần dùng chung sau để #15 tái sử dụng và nâng cấp đúng ranh giới:

1. **Bộ UI dùng chung (`frontend/src/components/ui/`):**
   - Đã có: `Button`, `TextField`, `SelectField`, `TextareaField`, `StatusBadge`, `LoadingState`, `EmptyState`, `ErrorState`, `Pagination`, `FilterBar`, `DateRangeFilter`, `DataTable`, `Modal`, `ConfirmDialog`, `ToastProvider` (`useToast`), `Tabs`, `PrivateImage`.
   - Lưu ý cho #15: `src/utils/statusConfig.js` hiện gắn kèm mã enum trong ngoặc cho vận hành (ví dụ `Đang giữ chỗ (RESERVED)`). Giao diện `CUSTOMER` của #15 **không được hiển thị tên enum/field/endpoint**, nên sẽ truyền prop `label` tiếng Việt thuần vào `<StatusBadge />` qua helper nhãn khách hàng riêng, không phá vỡ hiển thị hiện có của `/admin/*`.
2. **Hooks & tiện ích (`frontend/src/hooks/`, `frontend/src/utils/`):**
   - Đã có: `useApiQuery` (hỗ trợ `AbortController`), `useDebouncedValue`, `useIdempotentMutation`, `format.js` (`formatVnd`, `formatDateTimeVN`, `formatDateVN`, `formatDurationSeconds`, `generateIdempotencyKey`), `validation.js` (`isValidMoneyString`, `normalizeMoneyString`, `isPositiveIdString`, `mapApiFieldErrors`, `resolveIdempotencyKey`), `errorMessages.js`.
3. **Ba file cầu nối chờ #15 hoàn thiện (`frontend/src/integrations/`):**
   - `apiClient.js`: Đã có `ApiError`, `API_BASE_URL`, `buildQuery`, `resolveApiUrl`, `apiRequest`, `configurePlatformApi`. Chưa có timeout tự hủy, chưa có cơ chế tự động refresh 1 lần khi gặp `401 TOKEN_EXPIRED`.
   - `authBridge.jsx`: Mới là cổng đăng nhập tạm cho `STAFF`/`MANAGER` trong RAM, chưa khôi phục phiên khi reload, chưa có đăng ký, chưa có Rolling Session + Web Locks (`evride-auth`) + `BroadcastChannel`, chưa phân tách trang `/login` chung và trang `/403`, `/404`.
   - `fileBridge.js`: Đã có `validateEvidenceFile`, `uploadEvidenceFile`, `downloadPrivateFileBlob`, nhưng đang gọi `fetch` trực tiếp chưa đi qua cơ chế tự động refresh khi `access_token` hết hạn (`401 TOKEN_EXPIRED`).
4. **Services nghiệp vụ đã có một phần (`frontend/src/services/`):**
   - `accountsApi.js`, `fleetApi.js`, `rentalsApi.js`, `operationsApi.js`, `incidentsApi.js`, `analyticsApi.js`.
   - #15 sẽ bổ sung hàm còn thiếu cho `CUSTOMER` ngay trên các module tương ứng và tạo mới `walletsApi.js` (ví, yêu cầu nạp tiền, khuyến mãi cá nhân), tuyệt đối không tạo API client thứ hai.

---

## 2. Xác minh PR Backend nạp tiền chờ duyệt (Ngoại lệ đã chốt)

- **PR Backend:** [PR #40 — `feat(backend): require staff/manager approval for wallet top-up requests`](https://github.com/ronaldosiuu7/final_project-EVRide/pull/40)
- **Trạng thái hiện tại:** **ĐÃ MERGE** vào `origin/develop` tại merge commit `b52ef8f` (`2026-11-25T16:12:43Z`) — lưu ý working tree local của nhánh FE `codex/fe-customer-integration` tách từ `61b1c9c` trước thời điểm merge nên thư mục `backend/` cục bộ vẫn ở bản cũ cho tới khi đồng bộ `origin/develop` + `alembic upgrade head`.
- **Base branch:** `develop` | **Head branch:** `codex/backend-topup-approval`
- **Head SHA đã đối chiếu:** `142451c9f9631b35c1fbc6be512d12a70ad51772` (kèm migration `d7e4b2c9a105` và tài liệu `docs/topup-approval-handover.md`)
- **Quyết định tích hợp bắt buộc:**
  - Tuyệt đối **không** checkout/merge PR #40 vào nhánh FE và **không** gọi hành vi cộng tiền ngay của `develop` cũ rồi giả lập trạng thái “chờ duyệt”.
  - Tích hợp đúng contract của PR #40:
    - `POST /api/v1/wallets/me/topups` (`Idempotency-Key` bắt buộc, body `{ "amount": "150000.00" }`, `extra="forbid"`) → trả `201` `TopUpRequest` với `status: "PENDING"`, `payment_mode: "DEMO"`. Không tự cộng số dư ví trên UI; hiển thị thông báo **“Đã gửi yêu cầu nạp tiền”** và nhãn **“Tiền mô phỏng”**.
    - `GET /api/v1/wallets/me/topups?status=&page=&page_size=` → danh sách yêu cầu nạp của khách (`PENDING` → Chờ xác nhận, `APPROVED` → Đã duyệt, `REJECTED` → Bị từ chối kèm `rejection_reason`), hiển thị tách biệt với lịch sử biến động số dư `GET /api/v1/wallets/me/transactions`.
    - `GET /api/v1/wallet-topup-requests/{id}` → xem chi tiết một yêu cầu nạp của chính khách.
  - Các endpoint duyệt/từ chối/liệt kê toàn hệ thống (`GET /wallet-topup-requests`, `POST .../approve`, `POST .../reject`) thuộc quyền `STAFF`/`MANAGER` (ranh giới của #16).

---

## 3. Tổng hợp Contract kỹ thuật đã xác minh từ mã nguồn Backend

1. **Envelope & Phân trang (`backend/app/core/responses.py`, `main.py`):**
   - Đơn lẻ: `{ data: {...}, meta: { request_id, server_time } }`.
   - Danh sách: `{ data: [...], meta: { request_id, server_time, page, page_size, total } }` (`page` mặc định `1`, `page_size` mặc định `20`, tối đa `100`). Ngoại lệ: `GET /faq` trả `data` là mảng không phân trang; `GET /faq/sources/{source_id}` trả `text/plain`; `GET /health` trả `{ status: "ok" }` trực tiếp.
   - Lỗi: `{ error: { code, message, details? }, meta: { request_id, server_time } }`. Lỗi `422 VALIDATION_ERROR` có `error.details.fields = [{ field, message }]`. Luôn xử lý theo `error.code`.
2. **ID, Tiền, Thời gian & Tọa độ:**
   - **ID trong response:** luôn là chuỗi số nguyên dương (`"101"`), trừ `session_id` là UUID string và `POST /files/upload` trả tên trường là `file_id` (string).
   - **ID trong request body:** `RentalCreate` (`vehicle_id`, `pickup_station_id`), `ReturnQuoteRequest` (`return_station_id`), `TicketAttachmentCreate` (`support_ticket_id`) **bắt buộc truyền kiểu string** (`"101"`), truyền số sẽ bị `422`. Với `CreateDocumentRequest` (`front_file_id`, `back_file_id`), Pydantic khai báo `int` (chấp nhận số nguyên hoặc chuỗi số nguyên dương).
   - **Tiền tệ:** chuỗi thập phân không âm tối đa 2 chữ số lẻ (`"10000.00"`), đơn vị VND, tuyệt đối không tính toán bằng `float`.
   - **Thời gian:** API trả RFC 3339 UTC (`...Z` hoặc `+00:00`); hiển thị theo `Asia/Ho_Chi_Minh`. Đếm ngược giữ xe 30 phút và báo giá 10 phút phải bù độ lệch giữa đồng hồ trình duyệt và `meta.server_time`.
   - **Tọa độ (khác biệt thực tế trong code):** `Station` trả `latitude`/`longitude` dạng `string`, còn `GPSPoint` (`operations.py`) trả dạng `number` (`float`) → UI cần ép kiểu an toàn cho cả hai.
3. **Xác thực, Rolling Session & Phối hợp liên tab (`auth.py`, `auth_http.py`, `auth_sessions.py`, `dependencies.py`):**
   - `access_token` (JWT 1.800s) **chỉ giữ trong bộ nhớ (RAM)**; `refresh_token` nằm trong cookie `HttpOnly` (`evr_rt_<sid_hex>_<gen>`, `Path=/api/v1/auth`).
   - `localStorage` chỉ lưu metadata không nhạy cảm: `{ session_id, epoch, logging_out }`.
   - Các endpoint `/auth/login`, `/auth/refresh`, `/auth/logout`, `/users/me/change-password` bắt buộc `credentials: 'include'`, `Content-Type: application/json`, `X-EVRide-CSRF: 1` (và trình duyệt gửi `Origin` khớp `AUTH_ORIGINS`).
   - `/auth/refresh` và `/auth/logout` bắt buộc thêm header `X-Session-ID: <session_id>` và body `{}`.
   - Điều phối mọi thao tác `login` / `refresh` / `logout` / `change-password` bằng `navigator.locks.request('evride-auth', ...)` (có fallback khi môi trường test không có Web Locks) + `BroadcastChannel('evride-auth')`; chỉ nhận cập nhật phiên khi khớp `session_id`/`epoch` và `generation` không lùi.
   - Chỉ tự động gọi `/auth/refresh` và retry request gốc **tối đa 1 lần** khi gặp `401 TOKEN_EXPIRED`. Với `UNAUTHENTICATED`, `SESSION_INVALID`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `REFRESH_INVALID`, `REFRESH_EXPIRED`, `REFRESH_REUSED` hoặc `403 ACCOUNT_DISABLED`, xóa phiên ngay và không lặp refresh.
   - Sau `POST /users/me/change-password` thành công (`{ changed: true, reauthenticate: true }`), bắt buộc gọi tiếp `POST /auth/logout` kèm `X-Session-ID` để xóa cookie tại `/api/v1/auth` rồi điều hướng về `/login`.
4. **Upload/Download & Dữ liệu nhạy cảm (`files.py`, `documents.py`, `operations.py`):**
   - `POST /files/upload`: `multipart/form-data` (`file`), chỉ nhận `image/jpeg`, `image/png`, `image/webp`, từ `1B` đến `10 MiB` (`10485760` bytes), trả `201` `{ file_id, original_filename, content_type, size_bytes, sha256, status: "READY" }`.
   - `GET /files/{id}/download`: tải nhị phân kèm `Authorization: Bearer <token>`, tạo `ObjectURL` tạm thời và `URL.revokeObjectURL` khi unmount; không lưu cache bền vững ảnh hay số giấy tờ đầy đủ.
   - Khác biệt tài liệu vs code ở `POST /users/me/documents`: `back_file_id` trong code (`documents.py:81`, `schemas/document.py:51`) là **bắt buộc** (cần đủ cả ảnh mặt trước và mặt sau), và `DocumentOut` không có trường `rejection_reason` riêng.
5. **Idempotency (`services/idempotency.py`):**
   - Header `Idempotency-Key` dài `16–128` ký tự cho các POST phía khách: `POST /rentals`, `POST /rentals/{id}/cancel`, `POST /wallets/me/topups`, `POST /promotions/{id}/claim`, `POST /files/{id}/attachments`.
   - Giữ nguyên cùng `Idempotency-Key` và cùng body khi retry sau lỗi mạng/timeout hoặc `409 IDEMPOTENCY_IN_PROGRESS` / `409 CONCURRENT_STATE_CHANGED`; chỉ sinh key mới khi thao tác đã có kết quả cuối hoặc người dùng chủ động đổi dữ liệu đầu vào.

---

## 4. Điểm lệch giữa Tài liệu và Backend thực tế / Endpoint chưa sẵn sàng

| Hạng mục | Mô tả lệch / giới hạn đã xác minh | Cách xử lý trên Frontend #15 |
| --- | --- | --- |
| Phê duyệt nạp tiền ví (PR #40) | PR #40 (`142451c9f9631b35c1fbc6be512d12a70ad51772`) chưa merge vào `develop`: `develop` chưa có `GET /wallets/me/topups`, `GET /wallet-topup-requests/{id}` và `POST /wallets/me/topups` trên `develop` vẫn là bản cũ. | Viết service & UI đúng contract PR #40, kiểm thử bằng mock/contract test trước; chỉ chạy E2E nạp tiền trên backend thật sau khi PR #40 merge + `alembic upgrade head`. |
| Hồ sơ sự cố phía khách (`/rental-incidents*`) | `GET /rental-incidents`, `GET /rental-incidents/{id}`, `GET /rental-incidents/{id}/events`, `GET /rental-incidents/{id}/rent-preview` đều yêu cầu role `STAFF`/`MANAGER` (`403` với `CUSTOMER`). Chỉ `GET /rental-incidents/{id}/finance-summary` cho phép `Owner` (`CUSTOMER`), nhưng chỉ khi hồ sơ đã `CONFIRMED`/`CLOSED` và `rental_out`/`ticket` hiện **chưa trả `incident_id`** cho khách. | Trên chi tiết chuyến sự cố (`STOLEN`, `INCIDENT_PENDING`, `CLOSED_INCIDENT`): hiển thị đầy đủ trạng thái chuyến, cọc đang giữ (`deposit_held`), hóa đơn/giao dịch tiền thuê đã chốt, danh sách ticket báo cáo & thời điểm gửi; chỉ gọi `finance-summary` khi biết `incident_id` (từ dữ liệu trả về nếu backend bổ sung hoặc tham số liên kết) và xử lý êm `404`/`409 INCIDENT_NOT_CONFIRMED` mà không văng lỗi giả. |
| Nộp giấy tờ `POST /users/me/documents` | Tài liệu ghi `back_file_id?` tùy chọn, nhưng code `documents.py` + `schemas/document.py` bắt buộc cả `front_file_id` và `back_file_id`. `DocumentOut` không có trường lý do từ chối riêng; `sensitive` không có `urls_expire_at`. | Form nộp giấy tờ bắt buộc tải đủ ảnh mặt trước và mặt sau; hiển thị trạng thái xác minh thực tế từ API và hướng dẫn nộp lại bản mới khi `REJECTED`/hết hạn. |
| Mã lỗi điều kiện thuê | Tài liệu bảng 2.3 ghi `403 CUSTOMER_NOT_ELIGIBLE`, nhưng `services/rentals.py` trả `409 VERIFIED_CCCD_REQUIRED` khi thiếu CCCD `VERIFIED`/hết hạn/chưa đủ 16 tuổi. | Ánh xạ rõ `VERIFIED_CCCD_REQUIRED`, `IDEMPOTENCY_IN_PROGRESS`, `CONCURRENT_STATE_CHANGED`, `REFRESH_RETRY_UNAVAILABLE` trong `errorMessages.js` kèm liên kết sang trang Hồ sơ & Giấy tờ. |
| Presigned upload & Thanh toán/GPS thật | `/files/upload-intents`, `/files/{id}/complete`, cổng thanh toán thật, GPS phần cứng là mở rộng ngoài V1. | Không hiển thị nút/tính năng giả; dùng `/files/upload` cục bộ, gắn nhãn **“Tiền mô phỏng”** và **“GPS mô phỏng”**. |

---

## 5. Ranh giới #15 / #16, Cấu trúc Module & Định tuyến

### 5.1. Ranh giới trách nhiệm

- **Issue #15 sở hữu:**
  - Toàn bộ giao diện và luồng nghiệp vụ `CUSTOMER` + các trang công khai (`/stations`, `/faq`, `/login`, `/register`, `/403`, `/404`).
  - Nền tảng dùng chung: `apiClient` (timeout, chuẩn hóa lỗi, silent refresh 1 lần khi `401 TOKEN_EXPIRED`), `auth` (Rolling Session, Web Locks + BroadcastChannel, guard cho `CUSTOMER`/`STAFF`/`MANAGER`), và `fileBridge`/component upload-download ảnh riêng tư.
  - Phần ví khách hàng của PR #40 (`POST /wallets/me/topups`, `GET /wallets/me/topups`, `GET /wallet-topup-requests/{id}`).
- **Issue #16 sở hữu (Giữ nguyên, không làm thay):**
  - Toàn bộ khu vực `/admin` và 18 route con `/admin/*` cho `STAFF`/`MANAGER`.
  - Bộ component UI dùng chung trong `src/components/ui/` và CSS quản trị hiện có.
  - Phần duyệt/từ chối yêu cầu nạp tiền của `STAFF`/`MANAGER` (`GET /wallet-topup-requests`, `POST .../approve`, `POST .../reject`).

### 5.2. Định tuyến dự kiến (`App.jsx`)

- **Public & Auth:**
  - `/login` — Đăng nhập dùng chung (điều hướng thông minh theo vai trò `CUSTOMER` → `/` hoặc trang trước; `STAFF`/`MANAGER` → `/admin`).
  - `/register` — Đăng ký tài khoản `CUSTOMER`.
  - `/stations`, `/stations/:stationId` — Tìm trạm, xem chi tiết trạm và danh sách xe sẵn sàng (xem công khai; bấm giữ xe yêu cầu đăng nhập `CUSTOMER`).
  - `/faq` — Câu hỏi thường gặp có nguồn dẫn chứng (khung hỏi đáp chatbot bật khi đăng nhập `CUSTOMER`).
  - `/403`, `/404` và `*` — Trang từ chối quyền truy cập và trang không tìm thấy đường dẫn.
- **Khu vực `CUSTOMER` (bọc `CustomerLayout` + `<RequireRole allowedRoles={['CUSTOMER']}>`):**
  - `/` — Trang chủ khách hàng: tóm tắt trạng thái điều kiện thuê, lối tắt chuyến đang hoạt động (nếu có) và tìm nhanh trạm/xe.
  - `/rentals` — Chuyến đang hoạt động & Lịch sử chuyến thuê (lọc trạng thái, phân trang).
  - `/rentals/:rentalId` — Chi tiết chuyến (`RESERVED` đếm ngược & hủy; `IN_RENT` thời gian, tạm tính, GPS mô phỏng, ước tính trả xe; `RETURN_PENDING` báo giá 10 phút & chọn khuyến mãi; `COMPLETED` hóa đơn, giao dịch, đánh giá; `STOLEN`/`INCIDENT_PENDING`/`CLOSED_INCIDENT` tiến độ sự cố & tách bạch tài chính).
  - `/wallet` — Ví tiền mô phỏng, tạo yêu cầu nạp chờ duyệt, tab Yêu cầu nạp tiền & tab Lịch sử giao dịch ví.
  - `/promotions` — Khuyến mãi khả dụng (nhận mã) & Mã khuyến mãi của tôi.
  - `/support`, `/support/tickets/:ticketId` — Danh sách ticket, tạo ticket báo sự cố/hỗ trợ và đính kèm/xem ảnh bằng chứng.
  - `/profile` — Hồ sơ cá nhân, đổi mật khẩu, nộp/theo dõi giấy tờ eKYC và xem thông tin nhạy cảm không lưu đệm.
- **Khu vực vận hành `#16`:** Giữ nguyên toàn bộ `/admin` và `/admin/*`.

### 5.3. Interface dùng chung đã triển khai & bàn giao (Nhiệm vụ 1 → Bước 2+)

1. **`src/integrations/apiClient.js`:**
   - `API_BASE_URL`, `CONFIGURED_TIMEOUT_MS` (mặc định `15000ms` qua `VITE_API_TIMEOUT_MS`), proxy `/api` trong `vite.config.js` qua `VITE_API_PROXY_TARGET`.
   - `apiRequest(path, { method, query, body, headers, idempotencyKey, credentials, responseType, timeoutMs, skipAuthCallback, skipAuthRefresh, signal })`:
     - Trả `{ data, meta, pagination, serverTime, status, contentType, filename? }`.
     - Tự trích xuất `extractPagination(meta)` (`{ page, pageSize, total, totalPages, hasNextPage, hasPrevPage }`) và đồng bộ `meta.server_time` qua `recordServerTime`.
     - Hỗ trợ `responseType`: `'auto' | 'json' | 'text' | 'blob' | 'arrayBuffer'`, gửi `FormData` multipart không ghi đè boundary, và tuần tự hóa `BigInt` sang chuỗi qua `stringifyJsonBody`.
   - `ApiError` & `isAbortError(err)`: phân biệt `kind = 'network' | 'timeout' | 'abort' | 'business' | 'server'` (`err.isNetworkError`, `err.isTimeout`, `err.isAborted`, `err.isBusinessError`, `err.isServerError`).
   - **Interface kết nối Auth cho Bước 2:** `configurePlatformApi({ getAccessToken, getSessionContext, onTokenExpired, onAuthInvalid, onForbidden, customRequest })`, `isTerminalAuthError(err)` & `resetPlatformApi()`:
     - Chụp nguyên tử `{ sentToken, sessionId, epoch }` ngay tại thời điểm gửi request (`captureRequestAuthSnapshot`).
     - `onTokenExpired({ error, path, method, failedToken, sessionId, epoch }) => Promise<string | null>`: truyền chính xác `failedToken` thực tế đã gửi và định danh phiên gốc; chỉ kích hoạt khi gặp `401 TOKEN_EXPIRED` trên đúng phiên đang hoạt động và thử lại request gốc **tối đa 1 lần** (giữ nguyên `Idempotency-Key` và body); tuyệt đối không refresh/retry request của phiên A bằng phiên B và không tự động retry mutation khi lỗi mạng/timeout/5xx.
     - `onAuthInvalid(apiError, requestAuthContext)`: chỉ kích hoạt khi phiên gốc vẫn khớp phiên đang hoạt động và mã lỗi thuộc nhóm kết thúc phiên (`UNAUTHENTICATED`, `SESSION_INVALID`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `REFRESH_INVALID`, `REFRESH_EXPIRED`, `REFRESH_REUSED`, `403 ACCOUNT_DISABLED`, `400 SESSION_SELECTION_REQUIRED`, `400 TOO_MANY_AUTH_COOKIES`); tuyệt đối **không** xóa phiên khi `/auth/refresh` gặp `NETWORK_ERROR`, `REQUEST_TIMEOUT`, `429`, `409 REFRESH_RETRY_UNAVAILABLE` hoặc lỗi `5xx` tạm thời, và không để lỗi xác thực từ request cũ làm mất phiên mới.
2. **`src/integrations/fileBridge.js`:**
   - `validateEvidenceFile(file)`, `uploadEvidenceFile(file, { signal, timeoutMs })`, `downloadPrivateFileBlob(fileIdOrPath, { signal, timeoutMs })` — đã đi qua `apiRequest` để dùng chung timeout, hủy request, làm sạch lỗi và hook `TOKEN_EXPIRED`.
3. **`src/utils/errorMessages.js`:**
   - `getApiErrorMessage(error)`, `sanitizeUiMessage(raw, fallback)`, `sanitizeErrorDetails(details)`, `isUnsafeTechnicalMessage(text)` — chuẩn hóa thông báo tiếng Việt, loại bỏ stack trace, câu lệnh SQL, HTML thô và token/secret.
4. **`src/utils/format.js` & `src/utils/statusConfig.js`:**
   - Định dạng & tính toán tiền bằng `BigInt` không mất chính xác: `formatVnd`, `parseMoneyToCents`, `formatCentsToMoneyString`, `compareMoneyStrings`, `addMoneyStrings`, `subtractMoneyStrings`.
   - Thời gian & đếm ngược đồng bộ máy chủ: `formatDateTimeVN`, `formatDateVN`, `formatTimeRangeVN`, `formatDurationSeconds`, `formatCountdownMmSs`, `recordServerTime`, `getServerTimeOffsetMs`, `computeRemainingSeconds`.
   - Nhãn trạng thái tiếng Việt thuần cho khách hàng (không lộ mã enum): `CUSTOMER_STATUS_CONFIG`, `getCustomerStatusMeta(domain, value)` (giữ nguyên `STATUS_CONFIG` / `getStatusMeta` cho `/admin/*` của #16).
5. **`src/utils/validation.js` & `src/hooks/useIdempotentMutation.js`:**
   - Bảo toàn ID 64-bit: `toEntityIdString(value)`, `isPositiveIdString(value)`, `normalizeMoneyString(value, { requirePositive })`, `mapApiFieldErrors(error)`.
   - Vòng đời Idempotency: `createIdempotencyTracker({ keyGenerator })`, `isUncertainIdempotentOutcome(error)`, `fingerprintIdempotentPayload(payload)` (băm một chiều 128-bit, không lưu secret/số giấy tờ thô) và hook `useIdempotentMutation(mutationFn)` chống bấm đúp khi request đang chạy.
6. **`src/integrations/authSession.js` & `src/integrations/authBridge.jsx` (Nhiệm vụ 2 — Bàn giao dùng chung #15 & #16):**
   - `createAuthSessionManager` / `getDefaultAuthSessionManager()`:
     - Giữ `access_token`, `generation`, `user` chỉ trong RAM; `localStorage` (`evride_auth_session`) chỉ lưu đúng `{ session_id, epoch, logging_out }`.
     - Gửi `credentials: 'include'`, `X-EVRide-CSRF: '1'` và `X-Session-ID` đúng endpoint; không tự gán header `Origin`; không trim mật khẩu.
     - Điều phối `login`, `refreshAccessToken`, `logout`, `changePassword` bằng Web Locks (`evride-auth`) + `BroadcastChannel('evride-auth')` (kèm handshake `REQUEST_ACTIVE_SESSION` bất đồng bộ giữa các tab); kiểm tra chặt `session_id`/`epoch`/`generation` và số thứ tự thao tác để response cũ hoặc thông điệp đến trễ không phục hồi phiên đã logout, không ghi đè hoặc đăng xuất nhầm phiên mới.
     - `changePassword` điều phối 3 pha không lồng khóa (tránh deadlock khi refresh/logout), gắn kết quả với `(originSid, originEpoch)` ban đầu: nếu trong lúc chờ response đổi mật khẩu mà người dùng đã chuyển sang phiên B mới, chỉ dọn cookie của phiên A cũ theo `X-Session-ID` mà không đăng xuất tài khoản B.
     - `refreshAccessToken` chỉ thu hồi phiên khi gặp mã lỗi kết thúc phiên (`isTerminalAuthError`); giữ nguyên phiên khi lỗi mạng, timeout hoặc server tạm thời.
     - `registerPrivateCacheCleaner(fn)` & `clearAllPrivateCaches()`: xóa sạch cache riêng tư khi đăng xuất, thu hồi phiên hoặc đổi người dùng (đã kết nối sẵn `invalidateActiveEmployeesCache` của #16).
   - `AuthProvider`, `useAuth()`, `RequireAuth`, `RequireRole`, `GuestOnlyRoute`, `resolvePostLoginPath`, `evaluateRouteAccess` — đã tích hợp mượt với toàn bộ route `/admin/*` của #16.

---

## 6. Kế hoạch triển khai Bước 1–9 & Phạm vi file dự kiến

| Bước | Trạng thái | Nội dung triển khai | Phạm vi file |
| --- | --- | --- | --- |
| **Bước 1** | **Hoàn thành** | Nền tảng `apiClient`, `fileBridge`, chuẩn hóa lỗi tiếng Việt (chống lộ stack trace/secret), tiện ích VND/giờ VN/nhãn trạng thái khách, quản lý vòng đời `Idempotency-Key` & bộ unit test. | `frontend/vite.config.js`, `frontend/.env.example`, `frontend/src/integrations/apiClient.js`, `frontend/src/integrations/fileBridge.js`, `frontend/src/utils/errorMessages.js`, `frontend/src/utils/format.js`, `frontend/src/utils/statusConfig.js`, `frontend/src/utils/validation.js`, `frontend/src/hooks/useIdempotentMutation.js`, `frontend/tests/apiClient.test.mjs` |
| **Bước 2** | **Hoàn thành** | Triển khai xác thực Rolling Session & phối hợp đa tab (`authSession.js` + `authBridge.jsx`), dọn cache riêng tư, route guard `CUSTOMER`/`STAFF`/`MANAGER`, trang `/login`, `/register`, `/403`, `/404`, `CustomerLayout` (kèm đổi mật khẩu) & test đa kịch bản. | `frontend/src/integrations/authSession.js`, `frontend/src/integrations/authBridge.jsx`, `frontend/src/services/accountsApi.js`, `frontend/src/layouts/CustomerLayout.jsx`, `frontend/src/styles/customer.css`, `frontend/src/features/auth/*.jsx`, `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/tests/authSession.test.mjs`, `frontend/README.md` |
| **Bước 3** | Đã có code; chờ nghiệm thu demo | Component chọn/tải ảnh dùng chung, trang `/profile` (sửa tên, đổi mật khẩu → logout dọn cookie, nộp/nộp lại giấy tờ mặt trước + mặt sau, xem nhạy cảm không cache, hiển thị điều kiện CCCD `VERIFIED` + đủ 16 tuổi). | `frontend/src/services/accountsApi.js`, `frontend/src/features/profile/CustomerProfilePage.jsx`, `frontend/src/features/profile/DocumentUploadModal.jsx`, `frontend/src/features/profile/SensitiveDocumentModal.jsx` |
| **Bước 4** | Đã có code; chờ nghiệm thu demo | Trang chủ khách `/`, danh sách & chi tiết trạm `/stations`, `/stations/:stationId`, tìm/lọc/phân trang xe máy điện (pin, giá 30 phút đầu + phút thêm, cọc), modal xác nhận giữ xe 30 phút có `Idempotency-Key` và xử lý đủ mã lỗi nghiệp vụ. | `frontend/src/services/fleetApi.js`, `frontend/src/services/rentalsApi.js`, `frontend/src/features/customer/CustomerHomePage.jsx`, `frontend/src/features/stations/CustomerStationListPage.jsx`, `frontend/src/features/stations/CustomerStationDetailPage.jsx`, `frontend/src/features/rentals/ReserveVehicleModal.jsx` |
| **Bước 5** | Đã có code; chờ nghiệm thu demo | Danh sách chuyến `/rentals` & chi tiết chuyến đang hoạt động `/rentals/:rentalId` (`RESERVED` đếm ngược theo `server_time` + hủy giữ xe; `IN_RENT` thời gian, tiền tạm tính, GPS mô phỏng + cảnh báo cũ; `RETURN_PENDING` tìm trạm còn chỗ, tạo/làm mới `return-quote` 10 phút kèm mã khuyến mãi). | `frontend/src/features/rentals/CustomerRentalListPage.jsx`, `frontend/src/features/rentals/CustomerRentalDetailPage.jsx`, `frontend/src/features/rentals/CustomerReturnQuoteSection.jsx`, `frontend/src/features/rentals/CustomerGpsSection.jsx` |
| **Bước 6** | Đã có code; chờ nghiệm thu demo | Ví Tiền mô phỏng `/wallet` (tạo yêu cầu nạp `PENDING` theo PR #40, danh sách & chi tiết yêu cầu nạp tách biệt với lịch sử giao dịch ví) & Khuyến mãi `/promotions` (khuyến mãi khả dụng, nhận mã `Idempotency-Key`, mã của tôi). | `frontend/src/services/walletsApi.js`, `frontend/src/features/wallet/CustomerWalletPage.jsx`, `frontend/src/features/promotions/CustomerPromotionsPage.jsx` |
| **Bước 7** | Đã có code; chờ nghiệm thu demo | Hoàn thiện chi tiết chuyến đã kết thúc (`COMPLETED`, `CANCELLED`, `EXPIRED`): xem biên bản bàn giao/nhận trả, hóa đơn (`GET /invoice`), lịch sử thanh toán chuyến (`GET /transactions`) và gửi/xem đánh giá 1 lần cho chuyến `COMPLETED`. | `frontend/src/services/operationsApi.js`, `frontend/src/features/rentals/CustomerRentalDetailPage.jsx`, `frontend/src/features/rentals/CustomerReviewSection.jsx` |
| **Bước 8** | Đã có code; chờ nghiệm thu demo | Hỗ trợ & Sự cố phía khách (`/support`, `/support/tickets/:ticketId`, tạo ticket kèm ảnh bằng chứng `TICKET_EVIDENCE`, hiển thị tiến trình sự cố & tách biệt tiền thuê/cọc/bồi thường ngoài hệ thống trên chuyến sự cố) + trang `/faq` & hỏi đáp chatbot FAQ có nguồn. | `frontend/src/features/tickets/CustomerTicketListPage.jsx`, `frontend/src/features/tickets/CustomerTicketDetailPage.jsx`, `frontend/src/features/rentals/CustomerIncidentSummarySection.jsx`, `frontend/src/features/faq/CustomerFaqPage.jsx` |
| **Bước 9** | Review/test FE xong; demo chưa nghiệm thu | Sửa lỗi lifecycle auth, hồ sơ, ví, quote, query và bàn phím; PR #40 đã merge develop. | `tests/customerLifecycle.test.mjs`, `docs/issue-15-review.md` |

---

## 7. Checklist tổng thể Issue #15 & Yêu cầu Nạp tiền chờ duyệt

### 7.1. Nền tảng API và xác thực dùng chung
- [x] Cấu hình API base URL qua môi trường; thống nhất cấu trúc service, response/error, phân trang, ID và tiền dạng chuỗi, thời gian theo contract.
- [x] API client dùng chung: gửi Bearer token, xử lý lỗi tập trung, timeout & hủy request (`AbortController`), chống submit trùng và giữ nguyên `Idempotency-Key`/body khi retry thao tác chưa rõ kết quả.
- [x] Đăng ký, đăng nhập, đăng xuất, khôi phục phiên khi tải lại trang, đổi mật khẩu; auth context và route guard cho `CUSTOMER`/`STAFF`/`MANAGER`, trang `403`/`404`.
- [x] `access_token` chỉ trong bộ nhớ; `refresh_token` trong cookie `HttpOnly`; `localStorage` chỉ lưu metadata phiên được phép.
- [x] Gửi `credentials: 'include'`, `X-EVRide-CSRF: 1` và `X-Session-ID` đúng endpoint; điều phối liên tab bằng Web Locks + BroadcastChannel, kiểm tra `session_id`/`epoch`/`generation`.
- [x] Chỉ refresh và retry request gốc tối đa 1 lần khi `401 TOKEN_EXPIRED`; xóa trạng thái phiên ngay với các lỗi thu hồi/hết hạn phiên hoặc `403 ACCOUNT_DISABLED`; đổi mật khẩu xong gọi `logout` dọn cookie và yêu cầu đăng nhập lại.
- [x] Ghép mượt với khu vực `/admin/*` của #16, không tồn tại hai cơ chế đăng nhập hoặc hai API client riêng.

### 7.2. Hồ sơ và giấy tờ
- [x] Xem/sửa tên hiển thị hồ sơ cá nhân (`GET`/`PATCH /users/me`, đồng bộ tên ngay lên header & đa tab); nộp, nộp lại và theo dõi trạng thái giấy tờ, hạn hiệu lực (`GET`/`POST /users/me/documents`).
- [x] Dùng chung service `fileBridge.js` (`POST /files/upload`, `GET /files/{id}/download`, JPEG/PNG/WebP tối đa 10 MiB, không ghi đè `Content-Type` multipart, không đưa token vào URL) và component dùng chung `ImageUploadField` + `PrivateImage` (thu hồi Blob URL, hỗ trợ retry) bàn giao cho ticket và `#16`.
- [x] Dùng `file_id` bắt buộc cả mặt trước & mặt sau theo backend thực tế, giữ nguyên ảnh đã upload để thử nộp lại khi bước tạo giấy tờ lỗi; xem nội dung nhạy cảm qua `GET /user-documents/{id}/sensitive` không lưu cache bền vững.
- [x] Hiển thị rõ điều kiện thuê demo (CCCD `VERIFIED`, còn hạn, đủ 16 tuổi theo giờ Việt Nam); tuyệt đối không coi `PENDING` là `VERIFIED`.

### 7.3. Tìm xe, giữ xe và chuyến đang thuê
- [x] `CustomerLayout` responsive mobile/desktop (có skip-link, menu mobile mở/đóng bằng bàn phím & `Escape`), danh sách & chi tiết trạm (`/stations`, `/stations/:stationId`), danh sách & chi tiết xe (`/vehicles`, `/vehicles/:vehicleId`), tìm kiếm/lọc/phân trang đúng API, xử lý giờ 24/7 (`opens_at`/`closes_at` cùng `null`), giờ qua nửa đêm, giá trị `0` khác thiếu dữ liệu, không render `undefined`/`NaN`/`/ 10`, tổng số từ `meta.total` và chống response cũ ghi đè.
- [x] Hiển thị đúng thông tin xe máy điện (`model`, `battery_percent`, `first_30_minutes_price`, `extra_minute_price`, `deposit_amount`) kèm minh họa xe máy điện vector (không dùng ảnh ô tô hay đánh giá giả); không dùng `daily_price`/`type`.
- [x] Xác nhận giữ xe cụ thể kèm snapshot giá/cọc; đếm ngược 30 phút đồng bộ `expires_at`/`server_time`, tự tải lại trạng thái khi hết hạn hoặc quay lại tab (không tự quyết định quyền nhận xe chỉ bằng đồng hồ client).
- [x] Hủy giữ xe và xử lý rõ các lỗi: xe vừa bị đặt, thiếu số dư, pin thấp, chưa đủ điều kiện CCCD/tuổi (`VERIFIED_CCCD_REQUIRED`), trạm đóng cửa/đầy chỗ, khách còn chuyến chưa giải quyết, vượt giới hạn hủy/hết hạn 3 lần/ngày.
- [x] Hiển thị chi tiết chuyến qua mọi trạng thái (`RESERVED`, `IN_RENT`, `RETURN_PENDING`, `COMPLETED`, `CANCELLED`, `EXPIRED`, `STOLEN`, `INCIDENT_PENDING`, `CLOSED_INCIDENT`) kèm biên bản bàn giao/tiếp nhận thực tế; khách không tự bấm bàn giao/tiếp nhận xe.
- [x] Theo dõi thời lượng chuyến theo máy chủ (không tự tính tiền chính thức từ timer) và GPS mô phỏng (`latest` + lịch sử + cảnh báo dữ liệu cũ >60s, không mô tả vị trí cũ là hiện tại; dọn sạch poll/listener khi unmount/logout).
- [x] Tìm trạm trả còn chỗ; xem tiếp nhận trả xe và báo giá ước tính/chốt 10 phút từ máy chủ (`POST /rentals/{id}/return-quote`).

### 7.4. Ví (Nạp tiền chờ duyệt PR #40), khuyến mãi và lịch sử
- [x] Hiển thị số dư, trạng thái ví và nhãn **“Tiền mô phỏng”** rõ ràng.
- [x] **Nạp tiền chờ duyệt (theo PR #40 đã merge `origin/develop`):** gửi yêu cầu nạp `POST /wallets/me/topups` (`Idempotency-Key`, body `{ amount }`, trả `201 PENDING`), chỉ báo **“Đã gửi yêu cầu, đang chờ nhân viên xác nhận”**, không cộng giả vào số dư, không sinh giao dịch giả; khóa chức năng gửi thật nếu backend local chưa cập nhật contract mới (`404`/`405`).
- [x] **Tách biệt hai danh sách trên ví:** danh sách Yêu cầu nạp tiền (`GET /wallets/me/topups` lọc `Chờ xác nhận` / `Đã duyệt` / `Bị từ chối` + xem chi tiết/lý do từ chối qua `GET /wallet-topup-requests/{id}`) và Lịch sử giao dịch ví (`GET /wallets/me/transactions`); tự tải lại số dư & giao dịch khi yêu cầu chuyển sang `Đã duyệt`, dọn sạch polling khi ẩn tab/unmount/logout.
- [x] Danh sách khuyến mãi khả dụng, nhận mã (`claim` có `Idempotency-Key`), danh sách mã của khách và chọn mã hợp lệ khi lấy báo giá trả xe (không tiêu thụ mã phía frontend).
- [x] Hiển thị báo giá có hạn 10 phút, làm mới khi hết hạn; tách rõ tiền thuê, giảm giá, cọc cấn trừ, cần thu thêm và hoàn cọc dư (không cho khách gọi endpoint quyết toán của `STAFF`/`MANAGER`).
- [x] Lịch sử/chi tiết chuyến, hóa đơn (`GET /invoice` xử lý `404` chưa phát hành tách biệt lỗi API) và giao dịch (`GET /transactions`) lấy số liệu chính thức từ backend, tự tải lại khi nhân viên hoàn tất quyết toán `RETURN_PENDING`.

### 7.5. Hỗ trợ, sự cố phía khách, đánh giá và FAQ
- [x] Tạo/xem ticket hỗ trợ (`/support`, `/support/tickets/:ticketId`), upload & đính kèm ảnh bằng chứng (`TICKET_EVIDENCE`) bằng service/component dùng chung, xem lại ảnh qua `PrivateImage` và theo dõi trạng thái/kết quả xử lý (không gọi API nhân viên).
- [x] Hiển thị thông tin chuyến sự cố đúng quyền API thực tế (`GET /rental-incidents/{id}/finance-summary`): báo cáo không tự dừng cước hay xác định trách nhiệm; tách rõ tiền thuê (tạm tính vs đã chốt), cọc đang giữ và bồi thường ngoài hệ thống (phân biệt `null` chưa xác định với `"0.00"` không phải bồi thường).
- [x] Khi khách còn chuyến chưa giải quyết: cảnh báo chặn thuê mới nhưng vẫn cho truy cập đầy đủ `/profile`, `/support`, `/wallet`, `/faq`.
- [x] Đánh giá 1 lần duy nhất cho chuyến `COMPLETED` thuộc khách (`GET`/`POST /rentals/{id}/review`); chặn đánh giá trên `CLOSED_INCIDENT` và không coi `CLOSED_INCIDENT` là `COMPLETED`.
- [x] Trang FAQ công khai (`/faq`: accordion, tìm kiếm không dấu, xem tài liệu nguồn `text/plain` chỉ khi người dùng bấm chọn và render an toàn không đổ raw markdown/JSON lên màn chính) và giao diện hỏi đáp chatbot FAQ (`POST /chatbot/messages`) hiển thị đúng hướng dẫn backend khi không khớp.

### 7.6. Chất lượng, kiểm thử và bàn giao
- [ ] Giao diện tiếng Việt tự nhiên, không lộ HTTP method, URL endpoint, JSON, tên trường hay mã enum thô lên màn hình khách hàng.
- [ ] Đầy đủ trạng thái loading, empty, error, retry, validation form và khóa nút khi đang gửi.
- [ ] Kiểm thử unit/contract (auth nhiều tab, refresh/retry, idempotency, ví chờ duyệt PR #40, điều kiện thuê) + `vite build` thành công + kiểm thử tích hợp backend thật cho các API đã merge.
- [ ] Cập nhật `frontend/README.md` và tài liệu tiến độ.

---

## 8. Kiểm tra & Blocker hiện tại

- **Kiểm tra đã chạy thật ở Nhiệm vụ 8 (mock/contract test & build):**
  - `npm.cmd test` trong `frontend/`: **43/43 test PASS** (`8` test gốc #16 + `6` test API client/idempotency + `9` test xác thực/hồi quy + `5` test trạm/xe + `3` test hồ sơ/file + `3` test giữ xe/chuyến thuê + `3` test ví PR #40 + `3` test khuyến mãi/tài chính + `3` test mới trong `tests/customerSupportAndFaq.test.mjs` cho: quyền tạo ticket & lỗi `403`/đính kèm `409 FILE_ALREADY_ATTACHED`, tổng hợp tài chính sự cố phân biệt `null` vs `0.00` vs dương & `409 INCIDENT_NOT_CONFIRMED`, đánh giá chuyến `COMPLETED` chặn `CLOSED_INCIDENT` và `409 ALREADY_REVIEWED`, tìm kiếm FAQ & parse nguồn `text/plain`, nguồn không khả dụng `503 DEPENDENCY_UNAVAILABLE`, và chatbot trả hướng dẫn backend khi không khớp).
  - `npm.cmd run build`: **Vite production build thành công**.
- **Blocker / Phần chưa kiểm chứng:**
  - Toàn bộ 43 bài test là **unit/contract test** đối chiếu trực tiếp contract code backend; chưa chạy kiểm thử trình duyệt thực tế với FastAPI + PostgreSQL sống.
  - Workspace local `backend/` trên nhánh `codex/fe-customer-integration` vẫn ở commit nền `61b1c9c` trước merge PR #40 (`b52ef8f`), nên tích hợp thật nạp tiền chờ duyệt cần backend chạy bản `origin/develop` mới nhất + `alembic upgrade head`.
- **Nhiệm vụ tiếp theo:** Người dùng chạy checklist demo trong `issue-15-review.md`; chưa đóng issue #15.
