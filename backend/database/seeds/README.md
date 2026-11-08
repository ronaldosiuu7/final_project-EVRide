# Seeds

Lưu dữ liệu mẫu cho môi trường phát triển, kiểm thử và demo.

Dữ liệu gồm trạm, xe, tài khoản thử nghiệm, khuyến mãi và các chuyến đi mẫu.
Tài khoản `checkout.customer@evride.test` có giấy tờ đã duyệt, ví demo và mã
`DEMO-CITY-2500` (giảm cố định 2.500 VND, chỉ áp dụng xe `DEMO-CITY`) để thử
luồng thuê. Mật khẩu chung cho tài khoản demo được in sau khi seed thành công.

Chạy từ thư mục `backend/` sau khi cấu hình `.env` trỏ đến PostgreSQL local và áp dụng migration mới nhất:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m database.seeds.seed_demo --allow-demo-seed
```

Trên macOS/Linux dùng `.venv/bin/python` thay cho đường dẫn Python trên Windows.

- `seed_demo.py`: seed idempotent, chỉ chạy với cờ xác nhận và database loopback ở Alembic head.
- `demo_fixtures.py`: dữ liệu giả ổn định dùng chung bởi seed và `tests/test_demo_fixtures.py`.

Chạy lại cập nhật các fixture theo ID/key ổn định thay vì tạo bản sao. Không tự động chạy seed demo trên môi trường production; không đưa thông tin xác thực thật vào fixture.
