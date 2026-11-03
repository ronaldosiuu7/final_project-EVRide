# Migrations

Lưu lịch sử thay đổi schema PostgreSQL.

- Alembic được cấu hình tại `backend/alembic.ini`; scripts và revisions nằm trong `alembic/`.
- Chạy lệnh Alembic từ thư mục `backend/`.
- Không chỉnh sửa migration đã được áp dụng trên môi trường dùng chung; tạo migration mới.
- Mô tả cách khôi phục hoặc tác động mất dữ liệu cho các thay đổi có liên quan.
- Revision `888ad91e139e` yêu cầu xử lý tường minh dữ liệu legacy trước khi chạy; migration tự từ chối nếu phát hiện giá/ảnh/xác minh giấy tờ không thể chuyển đổi an toàn.
- Tạo revision mới bằng `python -m alembic revision --autogenerate -m "description"` rồi review và chạy thử trước khi áp dụng; không chạy `upgrade head` ngoài môi trường đã được xác nhận.
