# Backend — FastAPI

Nền tảng REST API bằng Python/FastAPI. Backend có health/auth/users/documents/files cùng các luồng trạm, xe, bảng giá, ví demo, khuyến mãi và thuê/nhận/trả/quyết toán. PostgreSQL được cấu hình cho Alembic, ORM và seed tiện ích; health endpoint vẫn không cần kết nối database.

## Cài đặt và chạy

Yêu cầu Python 3.10 trở lên (đã kiểm tra với Python 3.13) và pip. Chạy các lệnh từ thư mục gốc của repo.

### Windows PowerShell

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --env-file .env
```

### macOS / Linux

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --env-file .env
```

Các lệnh gọi trực tiếp Python trong môi trường ảo nên không cần activate. Chỉ tạo `.venv`, cài dependency và sao chép `.env` khi thiết lập lần đầu; giữ `.env` đã chỉnh sửa khi chạy lại. Dừng server bằng `Ctrl+C`. Nếu cổng 8000 đang được dùng, đổi `--port` và cổng trong URL tương ứng.

## Kiểm tra

- Health: <http://127.0.0.1:8000/api/v1/health> trả HTTP **200** với JSON `{"status":"ok"}`.
- Swagger UI: <http://127.0.0.1:8000/docs>, chọn `GET /api/v1/health` → **Try it out** → **Execute**.
- OpenAPI: <http://127.0.0.1:8000/openapi.json>.

Kiểm tra bằng PowerShell trong terminal khác:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/v1/health -UseBasicParsing
```

Hoặc bằng macOS/Linux:

```bash
curl -i http://127.0.0.1:8000/api/v1/health
```

Health chỉ kiểm tra ứng dụng đang hoạt động, chưa kiểm tra cơ sở dữ liệu. Swagger UI cần mạng để tải JavaScript/CSS từ CDN mặc định của FastAPI.

## Cấu hình

Tạo file `backend/.env` từ `backend/.env.example` (xem lệnh ở phần Cài đặt và chạy), rồi thay các giá trị mẫu bằng cấu hình của môi trường bạn. Uvicorn đọc `.env` nhờ tùy chọn `--env-file`; biến đã được đặt trong môi trường hệ thống sẽ được ưu tiên.

| Biến | Ý nghĩa | Giá trị mẫu / lưu ý |
| --- | --- | --- |
| `APP_NAME` | Tên ứng dụng hiển thị trên Swagger UI. | `EVRide`; mặc định trong ứng dụng cũng là `EVRide`. |
| `APP_ENV` | Môi trường chạy (`development`, `test`, `production`). | `development` ở local; `production` bắt buộc HTTPS origin và cookie `Secure`. |
| `DB_HOST` | Địa chỉ máy chủ PostgreSQL. | `127.0.0.1` nếu database chạy trên máy đang chạy backend. |
| `DB_PORT` | Cổng PostgreSQL. | `5432`, cổng mặc định của PostgreSQL. |
| `DB_NAME` | Tên database PostgreSQL cần kết nối. | Thay `database_name` bằng tên database đã tạo. |
| `DB_USER` | Tài khoản PostgreSQL dùng để kết nối. | Thay `username` bằng tài khoản có quyền truy cập database. |
| `DB_PASSWORD` | Mật khẩu của tài khoản PostgreSQL. | Thay giá trị hướng dẫn trong file mẫu bằng mật khẩu của bạn; không commit mật khẩu thật. |
| `JWT_SECRET_KEY` | Khóa bí mật ký Access JWT (HS256, tối thiểu 32 byte ngẫu nhiên). | Sinh bằng `python -c "import secrets; print(secrets.token_urlsafe(48))"`. |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Định danh issuer và audience của Access JWT. | `evride-api` / `evride-web`. |
| `REFRESH_REPLAY_KEYS` | Khóa Fernet (hỗ trợ danh sách phân tách dấu phẩy khi xoay khóa) mã hóa kết quả replay trong grace. | Sinh bằng `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. |
| `REFRESH_GRACE_SECONDS` | Thời gian ân hạn (1..60 giây) cho phép replay kết quả refresh khi mất gói tin mạng. | `15` |
| `AUTH_ORIGINS` | Danh sách Origin được phép gọi auth và CORS (phân tách dấu phẩy, không dùng `*`). | Local: `http://localhost:5173`; Production: `https://thuexedien.me`. |
| `AUTH_COOKIE_SECURE` | Cờ `Secure` cho refresh cookie (`true` hoặc `false`). | Local HTTP: `false`; Production HTTPS: `true`. |
| `DEMO_PAYMENTS_ENABLED` | Bật nạp ví mô phỏng; không kết nối cổng thanh toán thật. | Mặc định `false`; chỉ bật cho môi trường demo được kiểm soát. |

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` và `DB_PASSWORD` được dùng để tạo kết nối trong `app/database.py`; khi thiếu biến bắt buộc, module này báo lỗi. Health endpoint hiện tại chỉ kiểm tra ứng dụng hoạt động, không kiểm tra kết nối database. Prefix `/api/v1` được khai báo tại `app/api/v1/router.py`; `/docs` và `/openapi.json` nằm ngoài prefix này.

`.gitignore` ở gốc repo đã loại trừ `.venv/`, `.env`, các biến thể `.env.*`, cache Python và log, đồng thời giữ `.env.example` trong Git. Chỉ lưu cấu hình/mật khẩu thật trong `.env` ở máy của bạn, không đưa chúng vào file mẫu hoặc commit lên Git.

## Migration, dữ liệu demo và fixture dùng chung

Chỉ chạy seed trên PostgreSQL local đã được cấu hình trong `backend/.env`. Revision mới nhất phải được áp dụng trước; migration sẽ dừng nếu dữ liệu legacy cần chuyển đổi chưa được xử lý. Seed chỉ chạy khi có cờ xác nhận và host là loopback; tất cả tài khoản, giấy tờ, trạm, xe, giá, giao dịch thuê và mã giảm giá đều là dữ liệu giả. Không dùng chung mật khẩu demo với môi trường thật.

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m database.seeds.seed_demo --allow-demo-seed
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Kiểm thử tự động cho cơ chế Rolling Session & Refresh Token Rotation (yêu cầu cài `requirements-dev.txt` và một database PostgreSQL riêng có tên kết thúc bằng `_test`):

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:TEST_DATABASE_URL = 'postgresql+psycopg://test_user:YOUR_TEST_PASSWORD@localhost:5432/evride_test'
.\.venv\Scripts\python.exe -m pytest tests/test_auth_sessions.py -q
```

Tác vụ dọn dẹp (`app.cleanup_auth`) xóa `replay_ciphertext` đã qua thời gian grace và xóa các phiên đã kết thúc (revoked/expired) quá 30 ngày:

```powershell
.\.venv\Scripts\python.exe -m app.cleanup_auth
```

Trên macOS/Linux, thay Python executable bằng `.venv/bin/python`. Chạy lại seed cập nhật các bản ghi có ID/email/mã fixture ổn định, không thêm bản sao; lịch sử giá và audit điều chuyển được insert một lần. Toàn bộ script và fixture seed nằm trong `database/seeds/`; fixture chung được script seed và `tests/test_demo_fixtures.py` dùng.

Seed tạo CUSTOMER có CCCD `PENDING`, đã `VERIFIED` và chưa nộp giấy tờ; STAFF/MANAGER, ví và mã giảm giá; ba trạm (một trạm đầy, một trạm còn đúng một chỗ); xe nhiều trạng thái; các chuyến/hóa đơn từ tháng 3 đến tháng 10 năm 2026. Tài khoản demo dùng email `@evride.test`; mật khẩu giả chung được lệnh seed in ra sau khi chạy. Các hash mật khẩu fixture chỉ phục vụ demo, không dùng làm thông tin xác thực production.

## Cấu trúc

| Thư mục | Trách nhiệm |
| --- | --- |
| `app/main.py` | Khởi tạo ứng dụng FastAPI và đăng ký router. |
| `app/api/v1/` | Router dưới tiền tố `/api/v1`: auth, users, documents/files, fleet, wallets và rentals. |
| `app/core/` | Cấu hình môi trường, bảo mật, logging và xử lý lỗi chung. |
| `app/database.py` | Cấu hình kết nối PostgreSQL. |
| `app/models.py` | SQLAlchemy ORM cho bảng nghiệp vụ và bảng hạ tầng; migration nằm ở `../database/migrations/`. |
| `app/schemas/` | Pydantic request/response cho API. |
| `app/services/` | Quy tắc nghiệp vụ, tính giá/khuyến mãi, idempotency và giao dịch ví/thuê. |
| `database/seeds/` | Script seed idempotent, fixture dữ liệu demo và hướng dẫn; chỉ cho phép PostgreSQL loopback đã ở Alembic head. |
| `tests/` | Unit test fixture, khuyến mãi và quy tắc tính giá; kiểm thử DB cần PostgreSQL riêng. |

## Các luồng nghiệp vụ

| Luồng | Endpoint chính |
| --- | --- |
| Trạm/xe/bảng giá/điều chuyển | `/stations`, `/vehicles`, `/prices` |
| Ví và khuyến mãi | `/wallets`, `/promotions`, `/users/me/promotions` |
| Giữ xe và vòng đời thuê | `/rentals`, pickup, initiate-return, return-quote, return |
| Tệp và bảo trì | Một số schema/contract đã có; xem `docs/api-contract.md` để biết phần chưa tích hợp. |

Mọi thay đổi tài chính được xử lý trong transaction PostgreSQL; các endpoint ghi được contract gắn `I` yêu cầu `Idempotency-Key`. Top-up chỉ là mô phỏng và trả `503 FEATURE_NOT_ENABLED` nếu `DEMO_PAYMENTS_ENABLED` không bật.

Các thư mục nghiệp vụ còn lại là khung dự kiến, chưa có mã triển khai.
