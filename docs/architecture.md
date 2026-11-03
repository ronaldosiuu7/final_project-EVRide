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
