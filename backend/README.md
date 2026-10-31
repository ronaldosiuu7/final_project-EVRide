# Backend — FastAPI

Nền tảng REST API bằng Python/FastAPI. Hiện có health endpoint và Swagger; chưa triển khai đăng nhập hoặc nghiệp vụ thuê xe. PostgreSQL sẽ được tích hợp ở bước sau, không cần cài để chạy backend hiện tại.

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

`.env.example` chứa `APP_NAME`, tên ứng dụng hiển thị trên Swagger (mặc định `EVRide`). Uvicorn nạp `.env` qua `--env-file`; biến môi trường đã có được ưu tiên. Prefix `/api/v1` được khai báo tại `app/api/v1/router.py`; `/docs` và `/openapi.json` nằm ngoài prefix này.

`.gitignore` ở gốc repo đã loại trừ `.venv/`, `.env`, các biến thể `.env.*`, cache Python và log, đồng thời giữ `.env.example` trong Git. Không đưa thông tin bí mật vào file mẫu.

## Cấu trúc

| Thư mục | Trách nhiệm |
| --- | --- |
| `app/main.py` | Khởi tạo ứng dụng FastAPI và đăng ký router. |
| `app/api/v1/` | Tập hợp router dưới tiền tố `/api/v1`, hiện có `health.py`. |
| `app/core/` | Cấu hình môi trường, bảo mật, logging và xử lý lỗi chung. |
| `app/db/` | Kết nối, session và lớp cơ sở cho ORM; migration nằm ở `../database/migrations/`. |
| `app/modules/` | Mã nghiệp vụ, tổ chức theo từng chức năng. |
| `app/shared/` | Tiện ích và kiểu dữ liệu dùng chung, không gắn với một nghiệp vụ cụ thể. |
| `tests/unit/` | Kiểm thử quy tắc nghiệp vụ độc lập. |
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
