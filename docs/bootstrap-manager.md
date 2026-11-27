# Khởi tạo Manager đầu tiên

Script: `backend/app/bootstrap_manager.py`, chạy bằng `python -m app.bootstrap_manager` từ thư mục `backend`.

Script tạo duy nhất một user MANAGER/ACTIVE bằng hàm băm mật khẩu của backend. Không tạo ví, trạm, xe hoặc dữ liệu demo. Nếu đã có bất kỳ MANAGER nào (kể cả bị khóa), hoặc email đã được dùng, script từ chối và không sửa dữ liệu cũ. Đây không phải công cụ reset mật khẩu/khôi phục tài khoản. Chạy lại sau khi tạo thành công sẽ bị từ chối.

## 1. Chạy trên VM2 (Backend)

Chạy trên VM2; script kết nối PostgreSQL ở VM3 bằng cấu hình của backend. Không cần chạy Python trên VM3 hoặc mở cổng database ra Internet.

1. SSH/Bastion vào VM2 bằng cách bạn vẫn dùng để triển khai. Đi tới checkout mã nguồn EVRide. Kiểm tra nhánh và các thay đổi chưa commit trước khi cập nhật:

   ```bash
   git status
   git branch --show-current
   git switch develop
   git pull --ff-only origin develop
   ```

   Nếu Git báo thay đổi local hoặc xung đột, xử lý trước; không reset/ghi đè để chạy script. Kiểm tra checkout mới có `backend/app/bootstrap_manager.py`.

2. Đi tới thư mục chứa Compose của backend trên VM2. Theo mẫu `deploy/README.md`, thư mục là `/opt/evride-backend` và service là `api`; thay bằng thư mục/service thực tế của bạn nếu khác:

   ```bash
   cd /opt/evride-backend
   docker compose config --services
   ```

3. Đảm bảo source vừa cập nhật đúng thư mục `build.context` của service. Mẫu dự án dùng `./source/backend`, Dockerfile có `COPY app ./app`, nên script trong `app/` được đưa vào image khi build lại:

   ```bash
   docker compose build api
   ```

   Nếu triển khai bằng image từ registry thay vì build trên VM2, cần build/push image chứa code mới theo quy trình của bạn, cập nhật tag image, rồi `docker compose pull api`. Chỉ `git pull` không cập nhật code trong image/container cũ.

4. Đảm bảo `backend.env` của Compose đã cấu hình DB_HOST là IP nội bộ VM3, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD và các biến auth của backend (JWT_SECRET_KEY, REFRESH_REPLAY_KEYS, AUTH_ORIGINS...). Không gửi các giá trị bí mật vào chat/Git. Kiểm tra migration:

   ```bash
   docker compose run --rm --no-deps api python -m alembic current
   docker compose run --rm --no-deps api python -m alembic heads
   ```

   Database phải được nâng cấp theo quy trình triển khai trước khi bootstrap. Với DB đang có dữ liệu, sao lưu trước migration. Nếu chưa ở head, chạy:

   ```bash
   docker compose run --rm --no-deps api python -m alembic upgrade head
   ```

   Nếu migration báo lỗi, dừng và xử lý; không dùng `stamp head` để bỏ qua.

5. Chạy bằng container tạm từ image mới, không cần restart API đang chạy:

   ```bash
   docker compose run --rm --no-deps api python -m app.bootstrap_manager
   ```

   Container tạm dùng cùng biến môi trường/mạng của service `api`. Không dùng `-T` hoặc pipe mật khẩu. Nếu đang dùng container đã được cập nhật code, có thể thay bằng `docker compose exec api python -m app.bootstrap_manager`.

6. Kiểm tra dòng `Database đích`, nhập tên, email, mật khẩu và nhập lại mật khẩu. Khi nhập mật khẩu màn hình không hiện dấu sao/ký tự — đây là bình thường. Mật khẩu tối thiểu 12 ký tự, tối đa 72 byte UTF-8 do bcrypt; dùng mật khẩu riêng từ trình quản lý mật khẩu. Không tự bỏ khoảng trắng trong mật khẩu.

7. Nhập chính xác `CREATE MANAGER` để xác nhận. Chỉ khi commit thành công, chương trình mới báo ID/email của tài khoản được tạo. Không in mật khẩu hoặc hash.

8. Mở website EVRide, đăng nhập bằng tài khoản vừa tạo, vào `/admin` → Tài khoản để tạo Staff/Manager tiếp theo. Bạn không đăng ký lại tài khoản này qua trang đăng ký Customer.

## 2. Chạy trên Windows local (PowerShell)

Trong checkout nhánh develop đã cập nhật:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic heads
.\.venv\Scripts\python.exe -m app.bootstrap_manager
```

Nếu chưa có virtualenv, tạo bằng `python -m venv .venv` trong `backend` trước. Cấu hình `backend/.env` theo `.env.example` cho database local và auth. Nếu migration chưa áp dụng, chạy `.\.venv\Scripts\python.exe -m alembic upgrade head` trước script. Biến môi trường có sẵn trong terminal được ưu tiên hơn `.env`; luôn kiểm tra database đích.

Trên Linux/macOS local, thay `.\.venv\Scripts\python.exe` bằng `.venv/bin/python`. Tài khoản tạo trong DB local không tự xuất hiện trong DB VM3.

## 3. Lỗi thường gặp

| Thông báo | Xử lý |
| --- | --- |
| No module named app.bootstrap_manager | Kiểm tra code develop đã cập nhật, chạy từ backend và build/pull image mới. |
| Đã tồn tại MANAGER | Dùng Manager hiện có. Nếu đã seed demo thì không thể bootstrap thêm. Không xóa/hạ quyền Manager chỉ để chạy lại script. |
| Email đã được sử dụng | Chọn email chưa dùng. Script không nâng quyền Customer. |
| Cần terminal tương tác | Chạy trực tiếp trong terminal SSH; bỏ -T, không pipe input. |
| Không thể khởi tạo / cấu hình | Kiểm tra dependencies và cấu hình DB/auth giống backend đang chạy. |
| Lỗi database | Kiểm tra VM3, mạng nội bộ, cấu hình kết nối và migration. Chi tiết SQL được ẩn để tránh lộ dữ liệu. |

## 4. Kiểm thử

```bash
cd backend
python -m pytest tests/test_bootstrap_manager.py -q
```

Các unit test kiểm tra validation, hash mật khẩu, từ chối Manager/email có sẵn và lỗi commit. Transaction được mô phỏng trong unit test; chưa thay thế kiểm thử kết nối, khóa đồng thời và commit trên PostgreSQL thật.
