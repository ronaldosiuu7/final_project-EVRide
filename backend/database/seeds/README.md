# Seeds

Lưu dữ liệu mẫu cho môi trường phát triển, kiểm thử và demo.

Dữ liệu mô phỏng dịch vụ EVRide tại nội thành Hà Nội gồm 7 trạm xe, 30 xe máy điện
thuộc 5 mẫu xe thật (`VinFast Feliz S`, `VinFast Evo200`, `VinFast Klara S`,
`Dat Bike Quantum S2`, `YADEA Ossy`), 10 tài khoản thử nghiệm, 6 mã khuyến mãi,
24 chuyến lịch sử (tháng 3–11/2026) cùng các chuyến đang mở, phiếu bảo trì và lịch sử điều chuyển.
Tài khoản `checkout.customer@example.com` có giấy tờ đã duyệt, ví demo hoạt động,
không vướng chuyến đang mở và đã nhận mã `FELIZ2500` (giảm cố định 2.500 VND,
áp dụng cho dòng xe `VinFast Feliz S`) để thử ngay luồng thuê xe. Mật khẩu chung
cho tài khoản demo được in sau khi seed thành công.

Chạy từ thư mục `backend/` sau khi cấu hình `.env` trỏ đến PostgreSQL local và áp dụng migration mới nhất:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m database.seeds.seed_demo --allow-demo-seed
```

Trên macOS/Linux dùng `.venv/bin/python` thay cho đường dẫn Python trên Windows.

- `seed_demo.py`: seed idempotent, chỉ chạy với cờ xác nhận và database loopback ở Alembic head.
- `demo_fixtures.py`: dữ liệu giả ổn định dùng chung bởi seed và `tests/test_demo_fixtures.py`.

Chạy lại cập nhật các fixture theo ID/key ổn định thay vì tạo bản sao. Không tự động chạy seed demo trên môi trường production; không đưa thông tin xác thực thật vào fixture.
