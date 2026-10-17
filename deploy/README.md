# Deploy

Bộ khung dành cho cấu hình triển khai sau khi backend và frontend có thể chạy.

| Thư mục | Nội dung dự kiến |
| --- | --- |
| `docker/` | Dockerfile và cấu hình Compose cho các dịch vụ. |
| `nginx/` | Reverse proxy, phục vụ frontend và chuyển tiếp request API. |
| `scripts/` | Script triển khai, kiểm tra dịch vụ và sao lưu/khôi phục. |

Hiện chưa có Dockerfile, Compose, Nginx config hay script triển khai. Chỉ bổ sung sau khi xác định entrypoint, dependency và môi trường chạy.

Khi triển khai, nạp bí mật từ môi trường hoặc secret store; giữ dữ liệu PostgreSQL trên volume riêng. Tài liệu triển khai cần ghi rõ cách chạy migration, kiểm tra dịch vụ và khôi phục khi lỗi.
