# Backend — FastAPI

Nền tảng REST API bằng Python/FastAPI. Hiện có health endpoint và Swagger; chưa triển khai đăng nhập hoặc nghiệp vụ thuê xe. PostgreSQL được cấu hình cho Alembic, ORM và seed tiện ích; health endpoint vẫn không cần kết nối database.

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
| `DB_HOST` | Địa chỉ máy chủ PostgreSQL. | `127.0.0.1` nếu database chạy trên máy đang chạy backend. |
| `DB_PORT` | Cổng PostgreSQL. | `5432`, cổng mặc định của PostgreSQL. |
| `DB_NAME` | Tên database PostgreSQL cần kết nối. | Thay `database_name` bằng tên database đã tạo. |
| `DB_USER` | Tài khoản PostgreSQL dùng để kết nối. | Thay `username` bằng tài khoản có quyền truy cập database. |
| `DB_PASSWORD` | Mật khẩu của tài khoản PostgreSQL. | Thay giá trị hướng dẫn trong file mẫu bằng mật khẩu của bạn; không commit mật khẩu thật. |

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` và `DB_PASSWORD` được dùng để tạo kết nối trong `app/database.py`; khi thiếu biến bắt buộc, module này báo lỗi. Health endpoint hiện tại chỉ kiểm tra ứng dụng hoạt động, không kiểm tra kết nối database. Prefix `/api/v1` được khai báo tại `app/api/v1/router.py`; `/docs` và `/openapi.json` nằm ngoài prefix này.

`.gitignore` ở gốc repo đã loại trừ `.venv/`, `.env`, các biến thể `.env.*`, cache Python và log, đồng thời giữ `.env.example` trong Git. Chỉ lưu cấu hình/mật khẩu thật trong `.env` ở máy của bạn, không đưa chúng vào file mẫu hoặc commit lên Git.

## Migration, dữ liệu demo và fixture dùng chung

Chỉ chạy seed trên PostgreSQL local đã được cấu hình trong `backend/.env`. Revision mới nhất phải được áp dụng trước; migration sẽ dừng nếu dữ liệu legacy cần chuyển đổi chưa được xử lý. Seed chỉ chạy khi có cờ xác nhận và host là loopback; tất cả tài khoản, giấy tờ, trạm, xe, giá, giao dịch thuê và mã giảm giá đều là dữ liệu giả. Không dùng chung mật khẩu demo với môi trường thật.

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.seed_demo --allow-demo-seed
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Trên macOS/Linux, thay Python executable bằng `.venv/bin/python`. Chạy lại seed cập nhật các bản ghi có ID/email/mã fixture ổn định, không thêm bản sao; lịch sử giá và audit điều chuyển được insert một lần. Fixture chung nằm trong `app/demo_fixtures.py`, được cả `app/seed_demo.py` và `tests/test_demo_fixtures.py` dùng.

Seed tạo CUSTOMER có CCCD `PENDING`, đã `VERIFIED` và chưa nộp giấy tờ; STAFF/MANAGER, ví và mã giảm giá; ba trạm (một trạm đầy, một trạm còn đúng một chỗ); xe nhiều trạng thái; các chuyến/hóa đơn từ tháng 3 đến tháng 10 năm 2026. Tài khoản demo dùng email `@evride.test`; mật khẩu giả chung được lệnh seed in ra sau khi chạy. Các hash mật khẩu fixture chỉ phục vụ demo, không dùng làm thông tin xác thực production.

## Cấu trúc

| Thư mục | Trách nhiệm |
| --- | --- |
| `app/main.py` | Khởi tạo ứng dụng FastAPI và đăng ký router. |
| `app/api/v1/` | Tập hợp router dưới tiền tố `/api/v1`, hiện có `health.py`. |
| `app/core/` | Cấu hình môi trường, bảo mật, logging và xử lý lỗi chung. |
| `app/database.py` | Cấu hình kết nối PostgreSQL. |
| `app/models.py` | SQLAlchemy ORM cho bảng nghiệp vụ và bảng hạ tầng; migration nằm ở `../database/migrations/`. |
| `app/demo_fixtures.py` | Dữ liệu demo giả dùng chung cho seed và unit tests. |
| `app/seed_demo.py` | Seed idempotent, chỉ cho phép database PostgreSQL loopback đã ở Alembic head. |
| `app/modules/` | Mã nghiệp vụ, tổ chức theo từng chức năng. |
| `app/shared/` | Tiện ích và kiểu dữ liệu dùng chung, không gắn với một nghiệp vụ cụ thể. |
| `tests/` | Unit test fixture/seed; kiểm thử nghiệp vụ có thể mở rộng sau. |
| `tests/integration/` | Kiểm thử API và tương tác cơ sở dữ liệu. |

## Các module

| Module | Phạm vi dự kiến |
| --- | --- |
| `auth` | Đăng ký, đăng nhập, xác thực và phân quyền. |
| `users` | Tài khoản và hồ sơ khách hàng/nhân viên. |
| `stations` | Trạm nhận/trả xe, vị trí và sức chứa. |
| `vehicles` | Danh mục xe, trạng thái, mức pin và giá thuê. |
| `bookings` | Giữ xe có sẵn trong 30 phút, hủy và hết hạn; không đặt trước nhiều ngày. |
| `trips` | Nhân viên bàn giao/nhận lại xe, trả khác trạm còn chỗ, thời gian thuê thực tế và tính phí. |
| `wallets` | Ví trả trước, nạp tiền và lịch sử giao dịch. |
| `maintenance` | Báo lỗi, lịch bảo trì và tình trạng sửa chữa. |
| `analytics` | Báo cáo doanh thu, chuyến đi và mức sử dụng xe. |

Khi triển khai một module, có thể thêm các file sau theo nhu cầu:

```text
vehicles/
├── router.py       # Nhận request, gọi service, trả response
├── schemas.py      # Dữ liệu đầu vào/đầu ra
├── service.py      # Quy tắc nghiệp vụ
├── repository.py   # Truy vấn dữ liệu
└── models.py       # Mô hình ORM
```

Các file ví dụ trên chưa được tạo. Router gọi service; service dùng repository để truy cập dữ liệu. Tránh đặt logic tính phí hoặc cập nhật ví trực tiếp trong router.

Các thư mục nghiệp vụ còn lại là khung dự kiến, chưa có mã triển khai.
