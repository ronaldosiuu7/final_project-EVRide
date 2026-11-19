# Khai báo sử dụng AI

- **Công cụ sử dụng:** Google Gemini / trợ lý lập trình AI trong IDE.
- **Phạm vi áp dụng:**
  - Hỗ trợ khởi tạo khung dự án React/Vite, CSS responsive và bộ component UI dùng chung (`src/components/ui/`).
  - Hỗ trợ triển khai các màn hình vận hành STAFF/MANAGER (`fleet`, `prices`, `users`, `documents`, `promotions`, `rentals`, `check-ins`, `tickets`, `maintenance`, `incidents`), tích hợp 3 API báo cáo doanh thu/tài chính thật (`analytics`) và giao diện/fixture theo đặc tả cho 5 báo cáo mở rộng.
  - Hỗ trợ viết unit/contract tests (`tests/operations.test.mjs`) và tài liệu hướng dẫn tích hợp/kiểm thử trong `frontend/README.md`.
- **Kiểm tra lại bởi người thực hiện:** Đã đối chiếu trực tiếp từng endpoint và Pydantic schema trong `backend/app/api/v1/` và `backend/app/schemas/`, kiểm tra bằng `npm.cmd test` và `npm.cmd run build`.
