# Kiến trúc dự kiến

EVRide là website cho thuê xe điện theo trạm, sử dụng React, FastAPI và PostgreSQL.

```text
Trình duyệt (React)
        |
        | HTTP / JSON
        v
API (FastAPI)
        |
        | Router -> Service -> Repository
        v
PostgreSQL
```

## Ranh giới module trước khi tách luồng chuyến

Đây là ranh giới kiến trúc đề xuất, không xác nhận các module/service đã được tạo:

- `trips` sở hữu các chuyển trạng thái rental: reserve, lazy expiration, cancel, pickup, initiate-return và settle. Các module khác không tự cập nhật `rentals`, `vehicles`, `wallets`, `handovers` hoặc ledger để mô phỏng lại luồng này.
- Mọi thao tác dùng chung thứ tự khóa `station → customer(users) → wallet → vehicle → rental`; khóa nhiều dòng cùng nhóm theo ID tăng dần. Sau khi lấy khóa phải đọc lại và xác minh điều kiện nghiệp vụ.
- Mỗi thao tác nguyên tử có một chủ sở hữu transaction. Lỗi trước commit rollback toàn bộ thay đổi của thao tác; tiếp nhận xe và quyết toán trả xe là hai commit độc lập theo contract.
- Write endpoint được đánh dấu `I` dùng cùng idempotency store: cùng key/body replay nguyên status/payload, cùng key khác body là `409 IDEMPOTENCY_CONFLICT`; retry không được tạo thêm rental, handover, giao dịch hoặc audit.
- Bộ test PostgreSQL phải chứng minh tranh chấp hai xe cho cùng một khách, tranh chấp cùng xe/chỗ trạm, rollback giữa các bước ghi và retry sau timeout trước khi tách/nhân bản các luồng trong `trips`.
- `pricing`, `maintenance`, `files` và `stations` chỉ sửa tài nguyên do module đó sở hữu; điều chuyển xe ghi audit cùng transaction với cập nhật vị trí. Không module nào được bỏ qua invariant của `trips`.

## Xác thực, quản lý phiên và thứ tự khóa Auth

- `app/core/auth_sessions.py` là service duy nhất sở hữu transaction tạo/xoay vòng/thu hồi phiên (`user_sessions`, `refresh_tokens`), đổi mật khẩu và cập nhật quản trị tài khoản. Service tự mở `SessionLocal.begin()`, không gọi `db.begin()` trên session do dependency `get_db` đã `SELECT` và autobegin.
- **Thứ tự khóa thao tác Auth:** `users (theo id tăng dần) → user_sessions (theo id tăng dần) → refresh_tokens (theo generation tăng dần)`. Khóa dòng `users` giúp tuần tự hóa hoàn toàn các thao tác login, refresh, logout, đổi mật khẩu và khóa tài khoản của cùng một người dùng.
- **Khóa cho PATCH quản trị tài khoản (`update_account`):** Lấy `pg_advisory_xact_lock(67401, 1)` trước, sau đó khóa `actor` và `target` trong `users` theo ID tăng dần, rồi khóa `user_sessions`. Nhờ đó hai `MANAGER` không thể đồng thời tự hạ quyền/khóa nhau và làm mất `MANAGER` hoạt động cuối cùng.
- Dependency xác thực (`get_current_user`) chỉ đọc (`SELECT` với `populate_existing=True`), kiểm tra tài khoản `ACTIVE` và phiên còn hiệu lực, không giữ row lock trước khi đi vào luồng nghiệp vụ thuê xe (`station → customer → wallet → vehicle → rental`).
- Sau khi giành khóa phải đọc lại dữ liệu mới nhất (`populate_existing=True`) và lấy thời gian thực tế sau khi chờ khóa để xét hạn token/grace window. Nhánh phát hiện reuse (`REFRESH_REUSED`) trả về đối tượng lỗi từ hàm operation để context manager commit việc thu hồi phiên trước khi raise `HTTPException`.
