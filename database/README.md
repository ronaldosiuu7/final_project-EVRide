# Database — PostgreSQL

Mã quản lý cấu trúc và dữ liệu của EVRide được tập trung tại đây.

| Thư mục | Nội dung |
| --- | --- |
| [migrations](migrations/README.md) | Các thay đổi cấu trúc cơ sở dữ liệu theo phiên bản. |
| [seeds](seeds/README.md) | Dữ liệu mẫu phục vụ phát triển và demo. |
| [queries](queries/README.md) | Truy vấn tham khảo, kiểm tra dữ liệu và báo cáo. |

Các nhóm dữ liệu dự kiến: người dùng, trạm, xe, lượt đặt xe, chuyến đi, ví, giao dịch ví và phiếu bảo trì. Chưa có schema, migration hoặc dữ liệu mẫu được triển khai.

Kết nối và ORM sẽ nằm trong `backend/app/`; không tạo thêm một nguồn migration độc lập trong backend. Chọn công cụ migration trước khi bắt đầu tạo schema. Alembic là một phương án nếu backend dùng SQLAlchemy.

Quy ước đề xuất: tên bảng/cột dạng `snake_case`, lưu thời gian thống nhất theo UTC, dùng kiểu số chính xác cho tiền. Khi triển khai ví và nhận/trả xe, cần xử lý các cập nhật liên quan trong cùng giao dịch dữ liệu.
