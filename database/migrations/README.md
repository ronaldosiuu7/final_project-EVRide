# Migrations

Lưu lịch sử thay đổi schema PostgreSQL.

- Chọn một công cụ migration trước khi thêm migration đầu tiên.
- Nếu dùng Alembic, đặt cấu hình và thư mục revisions dưới đây.
- Nếu dùng SQL thuần, đặt tên tăng dần, ví dụ `0001_create_users.sql`, và bổ sung cơ chế ghi nhận migration đã chạy.
- Không chỉnh sửa migration đã được áp dụng trên môi trường dùng chung; tạo migration mới.
- Mô tả cách khôi phục hoặc tác động mất dữ liệu cho các thay đổi có liên quan.

