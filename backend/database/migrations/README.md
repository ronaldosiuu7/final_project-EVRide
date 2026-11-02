# Migrations

Lưu lịch sử thay đổi schema PostgreSQL.

- Alembic được cấu hình tại `backend/alembic.ini`; scripts và revisions nằm trong `alembic/`.
- Chạy lệnh Alembic từ thư mục `backend/`.
- Không chỉnh sửa migration đã được áp dụng trên môi trường dùng chung; tạo migration mới.
- Mô tả cách khôi phục hoặc tác động mất dữ liệu cho các thay đổi có liên quan.
