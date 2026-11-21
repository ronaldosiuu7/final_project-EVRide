# EVRide Frontend

Giao diện người dùng của hệ thống cho thuê xe máy điện theo trạm **EVRide**, được xây dựng bằng React và Vite.

## 1. Công nghệ sử dụng

- **React 18** & **React Router v6**
- **Vite 5**: Máy chủ phát triển và đóng gói sản phẩm
- **Node.js built-in test runner** (`node --test`) cho kiểm thử unit & contract frontend

## 2. Yêu cầu trước khi chạy

- [Node.js](https://nodejs.org/) LTS (khuyến nghị Node 20+ / 24+) và `npm`
- Backend FastAPI chạy tại `http://localhost:8000` (cấu hình trong `frontend/.env` dựa theo `.env.example`: `VITE_API_BASE_URL=http://localhost:8000/api/v1`)

> **Lưu ý trên Windows PowerShell:** Nếu gặp lỗi `npm.ps1 cannot be loaded because running scripts is disabled`, hãy dùng `npm.cmd` thay cho `npm` (ví dụ `npm.cmd install`, `npm.cmd run dev`, `npm.cmd test`, `npm.cmd run build`).

## 3. Cài đặt, chạy thử và kiểm thử

```bash
cd frontend
cp .env.example .env
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Mở trình duyệt tại **http://localhost:5173/admin** (tài khoản demo vận hành trên backend: `staff@evride.test` / `manager@evride.test`).

---

## 4. Ma trận đường dẫn & phân quyền khu vực vận hành (#16)

Hệ thống chỉ dùng 3 vai trò theo API: `CUSTOMER`, `STAFF`, `MANAGER` (không có role `ADMIN`; `/admin/*` chỉ là tiền tố URL khu vực vận hành).

| Đường dẫn | Màn hình | Quyền tối thiểu | Trạng thái API |
|---|---|---|---|
| `/admin` | Tổng quan vận hành | `STAFF`, `MANAGER` | API thật (`/analytics/financial-summary`, `/admin/stations`, `/vehicles`, `/support-tickets`, `/rental-check-ins`) |
| `/admin/reports` | Báo cáo doanh thu & tổng hợp tài chính | `STAFF`, `MANAGER` | API thật (`/analytics/revenue`, `/analytics/financial-summary`, `/analytics/revenue-details`) |
| `/admin/reports/operations` | Phân tích mở rộng (Tổng quan, Q3 Heatmap, Q8 Chờ, Q5 Top tuyến, Q6 Khách lâu không đi) | `STAFF`, `MANAGER` | Interface + Fixture chuẩn contract (Backend chưa triển khai) |
| `/admin/vehicles` | Danh sách, tìm/lọc, tạo/sửa xe máy điện, cập nhật pin, điều chuyển, đổi trạng thái | `STAFF`, `MANAGER` *(tạo/sửa/mở lại từ MAINTENANCE chỉ `MANAGER`)* | API thật (`/vehicles/*`) |
| `/admin/vehicles/:vehicleId` | Chi tiết xe, lịch sử giá (chỉ đọc), lịch sử điều chuyển | `STAFF`, `MANAGER` | API thật (`/vehicles/{id}`, `/move-history`, `/prices`) |
| `/admin/stations` | Danh sách trạm (gồm `INACTIVE`), tạo/sửa trạm | `STAFF`, `MANAGER` *(tạo/sửa chỉ `MANAGER`)* | API thật (`/admin/stations`, `/stations`) |
| `/admin/prices` | Bảng giá theo xe & áp dụng phiên bản giá/cọc mới | `STAFF`, `MANAGER` *(tạo giá mới chỉ `MANAGER`)* | API thật (`/prices`) |
| `/admin/rentals` | Danh sách lượt giữ & chuyến thuê | `STAFF`, `MANAGER` | API thật (`/rentals`) |
| `/admin/rentals/:rentalId` | Chi tiết chuyến: pickup, hủy vận hành, initiate-return, return-quote 10p & settle, handovers, invoice, transactions, GPS mô phỏng, review | `STAFF`, `MANAGER` | API thật (`/rentals/{id}/*`) |
| `/admin/check-ins` | Danh sách kiểm tra sau 24 giờ từ pickup (`CONTINUE_RENTAL` / `NO_ANSWER` / `ESCALATE`) | `STAFF`, `MANAGER` | API thật (`/rental-check-ins/*`) |
| `/admin/tickets` | Danh sách & tạo ticket hỗ trợ | `STAFF`, `MANAGER` | API thật (`/support-tickets`, `/rentals/{id}/support-tickets`) |
| `/admin/tickets/:ticketId` | Xử lý ticket tuần tự + upload/gắn/tải ảnh bằng chứng | `STAFF`, `MANAGER` | API thật (`/support-tickets/{id}`, `/files/upload`, `/files/{id}/attachments`, `/files/{id}/download`) |
| `/admin/maintenance` | Phiếu bảo trì xe thường & xe sự cố (`incident_id`) | `STAFF`, `MANAGER` | API thật (`/maintenance-orders/*`) |
| `/admin/incidents` | Danh sách & tiếp nhận nghi mất/sự cố | `STAFF`, `MANAGER` | API thật (`/rental-incidents`, `/rentals/{id}/incident/intake`) |
| `/admin/incidents/:incidentId` | Chi tiết sự cố: bằng chứng, xác minh, thu hồi, về trạm, bảo trì, giải phóng xe, quyết toán thuê, bồi thường ngoài hệ thống, hoàn cọc, đóng hồ sơ, audit log | `STAFF`, `MANAGER` *(verify, release-vehicle, settle-rent, compensation, refund, close chỉ `MANAGER`)* | API thật (`/rental-incidents/{id}/*`) |
| `/admin/users` | Danh sách tài khoản, tạo `STAFF`/`MANAGER`, cập nhật/khóa tài khoản | `STAFF`, `MANAGER` *(tạo/sửa chỉ `MANAGER`)* | API thật (`/users/*`) |
| `/admin/users/:userId` | Chi tiết tài khoản & quản lý trạng thái ví khách hàng | `STAFF`, `MANAGER` *(xem & đổi trạng thái ví chỉ `MANAGER`)* | API thật (`/users/{id}`, `/users/{id}/wallet`, `/wallets/{id}/status`) |
| `/admin/documents` | Tra cứu dữ liệu nhạy cảm theo ID giấy tờ & duyệt/từ chối eKYC | `STAFF`, `MANAGER` | API thật (`/user-documents/{id}/sensitive`, `/verification`) |
| `/admin/promotions` | Tạo mã khuyến mãi & bật/tắt `ACTIVE ↔ DISABLED` | **`MANAGER` only** | API thật (`/promotions/*`) |

---

## 5. Bàn giao Bộ UI dùng chung & Tích hợp với #15

### 5.1. Bộ component UI dùng chung (`src/components/ui/` & `src/utils/`)
#15 (giao diện khách hàng) có thể import trực tiếp từ `src/components/ui/index.js`:
- `Button` (`variant`: `primary | secondary | danger | ghost`, `size`: `sm | md`, `loading`)
- `TextField`, `SelectField`, `TextareaField` (tự sinh `htmlFor`, `aria-invalid`, `aria-describedby`, nhãn bắt buộc và lỗi inline)
- `StatusBadge` (kết hợp `src/utils/statusConfig.js`, hiển thị chấm màu + nhãn tiếng Việt)
- `LoadingState`, `EmptyState`, `ErrorState` (hiển thị thông báo theo `error.code` qua `src/utils/errorMessages.js`)
- `Pagination`, `FilterBar`, `DateRangeFilter`, `DataTable`, `Modal`, `ConfirmDialog`, `ToastProvider` (`useToast`), `Tabs`, `PrivateImage`
- Tiện ích: `src/utils/format.js` (`formatVnd`, `formatDateTimeVN`, `formatDateVN`, `formatDurationSeconds`, `toIsoWithVietnamOffset`, `generateIdempotencyKey`), `src/utils/validation.js`, `src/hooks/useApiQuery.js`, `src/hooks/useIdempotentMutation.js`.

### 5.2. Lớp cầu nối cần ghép khi #15 hoàn thành (`src/integrations/`)
#16 cô lập 3 phần thuộc phạm vi #15 sau đúng 3 file adapter để có thể thay thế không cần sửa các màn hình vận hành:
1. `src/integrations/apiClient.js`: dùng `configurePlatformApi({ getAccessToken, customRequest, onAuthInvalid })` để cắm wrapper tự động refresh khi gặp `401 TOKEN_EXPIRED` từ #15.
2. `src/integrations/authBridge.jsx`: giữ `accessToken` trong bộ nhớ React; hỗ trợ truyền prop `externalAuth` vào `<AuthProvider>` để thay bằng cơ chế Rolling Session / Web Locks / BroadcastChannel và trang `/login` chung của #15.
3. `src/integrations/fileBridge.js`: đóng gói `uploadEvidenceFile` (`POST /files/upload`) và `downloadPrivateFileBlob` (`GET /files/{id}/download`).

---

## 6. Danh sách API Backend còn thiếu / ngoài phạm vi V1

1. **Danh sách giấy tờ chờ duyệt (`GET /user-documents`)** và **Thu hồi giấy tờ đã duyệt (`POST /user-documents/{id}/revoke`)**: chưa triển khai ở backend — màn hình `/admin/documents` đang tra cứu trực tiếp theo `document_id` và ghi rõ giới hạn này.
2. **Lịch sử ví khách hàng cho vận hành (`GET /users/{user_id}/wallet/transactions`)**: backend mới có `/wallets/me/transactions` cho khách — màn hình chi tiết người dùng liên kết sang giao dịch theo từng chuyến thuê của khách.
3. **5 API báo cáo mở rộng** (`/analytics/overview`, `/analytics/peak-hours`, `/analytics/top-routes`, `/analytics/idle-time`, `/analytics/inactive-customers`): backend chưa triển khai (mới có 3 API doanh thu/tài chính); frontend đã chuẩn bị đầy đủ giao diện, bộ lọc, service interface và fixture chuẩn contract tại `/admin/reports/operations`.
4. **Object storage presigned URL** (`/files/upload-intents`, `/files/{id}/complete`) và đính kèm ảnh qua API cho owner ngoài ticket/eKYC: chưa triển khai ở backend V1; hệ thống dùng `POST /files/upload` và `GET /files/{id}/download` cục bộ.

---

## 7. Danh sách kiểm thử E2E với Backend thật & Dữ liệu demo

1. **Phân quyền & Phiên đăng nhập:**
   - Đăng nhập bằng tài khoản `CUSTOMER` → bị chặn truy cập khu vực `/admin` (`403`).
   - Đăng nhập `STAFF` → bị chặn truy cập `/admin/promotions`, không thấy nút `MANAGER` (tạo/sửa xe/trạm, tạo giá, tạo/khóa user, duyệt ví, verify/release/settle/close sự cố); gọi trực tiếp API nhận `403`.
   - `MANAGER` khóa tài khoản nhân viên đang mở → phiên bị thu hồi (`ACCOUNT_DISABLED`).
2. **Xe, Trạm, Giá & Điều chuyển:**
   - Sửa giảm `capacity` nhỏ hơn `occupied_spaces` → hiển thị lỗi trạm đầy; ngừng trạm còn xe → báo `STATION_NOT_EMPTY`.
   - Điều chuyển xe sang trạm đầy → báo `STATION_FULL`; đổi trạng thái `MAINTENANCE ↔ AVAILABLE` có bắt buộc `note`.
   - Áp dụng giá mới (`POST /prices`) → kiểm tra lịch sử chỉ đọc tăng version, snapshot của rental đã giữ không đổi.
3. **Luồng Nhận – Trả – Quyết toán – Kiểm tra 24h:**
   - Pickup thành công trừ cọc ví, hủy vận hành miễn hạn mức 3 lần/ngày.
   - `initiate-return` đưa xe và chuyến về `RETURN_PENDING`; thử quyết toán với ví thiếu tiền (`INSUFFICIENT_BALANCE`) hoặc ví bị khóa (`WALLET_UNAVAILABLE`) → kiểm tra `RETURN_PENDING` vẫn giữ nguyên, nạp tiền/mở ví và retry dùng cùng `Idempotency-Key` không tạo thanh toán trùng; thử quote hết hạn 10 phút (`STALE_QUOTE`) → tạo báo giá mới và quyết toán.
   - Kiểm tra 24 giờ (`/admin/check-ins`): ghi `CONTINUE_RENTAL`, `NO_ANSWER` (có `next_check_at`) và `ESCALATE` sang hồ sơ sự cố.
4. **Ticket, Bảo trì & Sự cố:**
   - Ticket: chuyển trạng thái tuần tự, upload và tải lại ảnh bằng chứng (`PrivateImage`).
   - Bảo trì: tạo phiếu mở chặn thuê xe; hoàn tất phiếu không tự đặt xe `AVAILABLE`.
   - Sự cố: thử `FALSE_ALARM`, `LOSS_THEFT`, `ABANDONMENT`; thử thu hồi + về trạm + bảo trì `COMPLETED` + giải phóng xe khi khách cũ chưa quyết toán; thử quyết toán thuê, hoàn cọc dư, ghi bồi thường ngoài hệ thống (`0.00 + NOT_REQUIRED` và số dương + chứng từ), kiểm tra checklist đủ 3 điều kiện mới cho đóng hồ sơ (`CLOSED_INCIDENT`); thử thu hồi sau `CLOSED_INCIDENT` trên hồ sơ cũ.
5. **Báo cáo Doanh thu & Tài chính:**
   - Đối chiếu số liệu `GET /analytics/financial-summary`, `GET /analytics/revenue`, `GET /analytics/revenue-details` theo khoảng ngày, kiểm tra lỗi ngày đảo ngược (`INVALID_DATE_RANGE`), xử lý tổng bằng 0 và bảng số liệu đi kèm biểu đồ.

---

## 8. Yêu cầu bàn giao tích hợp xác thực (Rolling Session & Refresh Token Rotation)

> **Lưu ý:** Backend đã triển khai cơ chế Rolling Session & Refresh Token Rotation; phần tích hợp chi tiết (#15 phụ trách triển khai lõi) gồm:

1. **Lưu trữ Token:**
   - `access_token` chỉ được lưu trong bộ nhớ (React state / module memory), tuyệt đối không lưu vào `localStorage`/`sessionStorage`/cookie.
   - `refresh_token` nằm hoàn toàn trong cookie `HttpOnly` (`evr_rt_<session_uuid_hex>_<generation>`, `Path=/api/v1/auth`) do trình duyệt tự quản lý.
   - `localStorage` chỉ được lưu `session_id` (UUID), `epoch` ngẫu nhiên và cờ trạng thái đang logout (không lưu thông tin bí mật).
2. **Header & Request bắt buộc:**
   - Khi gọi `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout` và `/api/v1/users/me/change-password`: luôn dùng `credentials: 'include'`, `Content-Type: application/json` và gửi kèm header `X-EVRide-CSRF: 1`.
   - Khi gọi `/api/v1/auth/refresh` và `/api/v1/auth/logout`: gửi thêm header `X-Session-ID: <session_id>` và body JSON rỗng `{}`.
   - Khi đổi mật khẩu thành công (`POST /api/v1/users/me/change-password`), tiếp tục gọi `POST /api/v1/auth/logout` với `X-Session-ID` hiện tại để xóa cookie ở đường dẫn `/api/v1/auth`, sau đó chuyển về màn hình đăng nhập.
3. **Phối hợp liên tab (Cross-tab Coordination):**
   - Sử dụng **Web Locks API** (`navigator.locks.request('evride-auth', ...)`) kết hợp **BroadcastChannel** cho mọi thao tác login/refresh/logout/đổi mật khẩu để các tab cùng chia sẻ một phiên, không gọi refresh trùng lặp và chỉ cập nhật bộ nhớ nếu `session_id`/`epoch` khớp và `generation` không thấp hơn bản đang giữ.
   - Chỉ tự động gọi `/api/v1/auth/refresh` và thử lại request gốc tối đa 1 lần khi protected API trả về `401 TOKEN_EXPIRED`. Với các mã `UNAUTHENTICATED`, `SESSION_INVALID`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `REFRESH_INVALID`, `REFRESH_EXPIRED`, `REFRESH_REUSED` hoặc `403 ACCOUNT_DISABLED`, xóa trạng thái đăng nhập ngay và không lặp refresh.
   - Chi tiết bảng mã lỗi và kịch bản kiểm thử trình duyệt xem tại mục 6 trong `docs/api-contract.md`.

---

**EVRide Frontend** — Giao diện quản lý hệ thống cho thuê xe máy điện theo trạm.
