# Backend — FastAPI

Nơi phát triển REST API bằng Python/FastAPI, sử dụng PostgreSQL. Hiện tại chỉ có bộ khung thư mục; chưa có ứng dụng, dependency hay lệnh chạy.

## Cấu trúc

| Thư mục | Trách nhiệm |
| --- | --- |
| `app/api/v1/` | Tập hợp router dưới tiền tố dự kiến `/api/v1`. |
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
| `bookings` | Đặt xe, thời hạn giữ chỗ và hủy đặt xe. |
| `trips` | Nhận xe, trả xe, thời gian thuê và tính phí. |
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

`.env.example` mô tả các biến cấu hình dự kiến. Cần triển khai bộ đọc cấu hình trước khi những biến này có hiệu lực.
