# Database — PostgreSQL

Mã quản lý cấu trúc và dữ liệu của EVRide được tập trung tại đây.

| Thư mục | Nội dung |
| --- | --- |
| [migrations](migrations/README.md) | Các thay đổi cấu trúc cơ sở dữ liệu theo phiên bản. |
| [seeds](seeds/README.md) | Dữ liệu mẫu phục vụ phát triển và demo. |
| [queries](queries/README.md) | Truy vấn tham khảo, kiểm tra dữ liệu và báo cáo. |
| [SQL lưu sẵn](stored_database/database.sql) | Bản xuất tham khảo; không thay thế lịch sử Alembic |

Đã có SQLAlchemy models (27 bảng), Alembic revisions và seed demo. Các nhóm gồm người
dùng/phiên đăng nhập, trạm/xe, rental, ví/giao dịch, khuyến mãi, ticket,
bảo trì, ảnh, audit, GPS và hồ sơ sự cố (`rental_incidents`).

Kết nối/ORM ở `backend/app/database.py` và `models.py`; Alembic dùng
`backend/alembic.ini`, revisions ở `backend/database/migrations/alembic/versions/`.
Chạy lệnh từ `backend/`, không tạo nguồn migration thứ hai. Head trong source
hiện tại là `f4c2a1b8e901` (cha `e8a412c9f603`); kiểm tra `heads`/`current` trước khi nâng cấp.

Quy ước: `snake_case`, `timestamptz` UTC, `NUMERIC`/`Decimal` cho tiền; một hành động
nghiệp vụ ghi các thay đổi liên quan trong cùng transaction. Xem chi tiết thiết kế bảng
tại [docs/database.md](../../docs/database.md).
