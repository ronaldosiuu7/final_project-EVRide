# Kế hoạch hạ tầng: 3 máy ảo (Demo VirtualBox & Production Azure)

Cập nhật phạm vi sự cố 13/11/2026: kiến trúc triển khai dưới đây không đồng
nghĩa cho phép tiền thật/GPS thật. V1 tiếp tục tiền mô phỏng; GPS demo có cờ
riêng và không ghi trong production. Không cần chạy worker cảnh báo 24 giờ
(đã thay bằng truy vấn danh sách động `GET /api/v1/rental-check-ins` và lịch
`rentals.next_check_at`). Cần đưa docs nguồn FAQ vào gói triển khai để các
link nguồn nội bộ không bị thiếu.

Tài liệu mô tả cách triển khai hệ thống EVRide trên kiến trúc 3 máy ảo theo mục V của thông báo học phần, gồm hai phần tách biệt rõ ràng:
- **Phần I:** Môi trường **Demo nội bộ trên VirtualBox** (dải IP `192.168.56.x`, dùng khi bảo vệ offline).
- **Phần II:** Môi trường **Production trên 3 VM Azure với tên miền `thuexedien.me` và HTTPS Let's Encrypt** (PostgreSQL 16, Rolling Session Auth, NSG/Firewall). Tuyệt đối không dùng IP demo `192.168.56.x` cho cấu hình Production.

---

## Phần I. Môi trường Demo nội bộ trên VirtualBox

### 1. Phương án Demo nội bộ

Dựng 3 máy ảo bằng **VirtualBox** trên một laptop RAM 16 GB, mỗi VM chạy **Ubuntu Server 24.04** với hệ điều hành và IP riêng trong mạng Host-only `192.168.56.0/24`.

| VM | Chạy | RAM | CPU | Ổ đĩa (cấp phát động) | IP Host-only (Chỉ dùng cho Demo) |
| --- | --- | --- | --- | --- | --- |
| VM1 – Frontend | Nginx (React build + reverse proxy) trong Docker | 1,5 GB | 1 | 12 GB | `192.168.56.11` |
| VM2 – Backend | FastAPI trong Docker | 2 GB | 1 | 12 GB | `192.168.56.12` |
| VM3 – DB + Storage | PostgreSQL 16 + Storage trong Docker, dữ liệu trên ổ đĩa VM | 3 GB | 2 | 20 GB | `192.168.56.13` |

- Mỗi VM có 2 card mạng: **NAT** (ra Internet tải phần mềm) và **Host-only** `192.168.56.0/24` (3 VM kết nối với nhau, laptop truy cập VM1).
- Lưu ý: HTTP trên IP VM demo không thay thế được bài kiểm tra `Secure` cookie và Web Locks (yêu cầu secure context HTTPS hoặc `localhost`).

### 2. Luồng kết nối và firewall trong mạng Demo

```text
Trình duyệt ──HTTP 80──► VM1 Nginx ──/api/v1/──► VM2 FastAPI :8000 ──SQL──► VM3 PostgreSQL :5432
```

| Máy | Cổng mở | Chỉ nhận từ | Ghi chú |
| --- | --- | --- | --- |
| VM1 | 80, 443 | Mọi nơi | Cửa vào duy nhất của người dùng |
| VM1 | 22 | Mạng quản trị | SSH quản trị |
| VM2 | 8000 | **Chỉ VM1** | Backend không mở công khai |
| VM3 | 5432 | **Chỉ VM2** | Frontend/VM1 không kết nối thẳng CSDL |
| VM3 | Cổng storage | **Chỉ VM2** | Không mở công khai cổng quản trị storage |

---

## Phần II. Triển khai Production trên 3 VM Azure và HTTPS

### 1. Kiến trúc tổng thể (Topology)

```text
Browser HTTPS
  thuexedien.me / www.thuexedien.me / api.thuexedien.me
      → Azure VM1: Public IPv4 tĩnh, Nginx Docker, TLS Let's Encrypt
      → Azure VM2: Private IP tĩnh (VM2_PRIVATE_IP), FastAPI Docker :8000
      → Azure VM3: Private IP tĩnh (VM3_PRIVATE_IP), PostgreSQL 16 Docker :5432 và file storage
```

- Các biến `VM1_PRIVATE_IP`, `VM2_PRIVATE_IP`, `VM3_PRIVATE_IP` lấy từ địa chỉ NIC thực tế trong Azure Portal (đặt Private IP allocation = **Static** trên Azure NIC, không tự gán IP tĩnh tùy ý trong Ubuntu và không dùng `192.168.56.x`).
- VM2 và VM3 không mở dịch vụ ra Public IP; quản trị qua Azure Bastion, VPN hoặc jump host được giới hạn IP.

### 2. Tên miền Namecheap và DNS

Tên miền `thuexedien.me` đăng ký tại Namecheap. Tại một thời điểm chỉ một hệ thống DNS giữ quyền authoritative (Namecheap BasicDNS hoặc Cloudflare DNS-only). Việc mua tên miền chỉ cấp quyền phân giải tên sang IP, **không tự động bật HTTPS** — HTTPS do Nginx + Let's Encrypt trên VM1 đảm nhiệm.

| Loại bản ghi | Host | Giá trị | Ghi chú |
| --- | --- | --- | --- |
| `A` | `@` | Public IPv4 tĩnh của VM1 | Domain chính `thuexedien.me` |
| `A` | `api` | Cùng Public IPv4 tĩnh của VM1 | Subdomain `api.thuexedien.me` |
| `CNAME` | `www` | `thuexedien.me` | Nginx trên VM1 redirect `308` sang `https://thuexedien.me` |

- Không tạo bản ghi `AAAA` nếu VM1 chưa cấu hình IPv6 và rule firewall tương ứng.
- Kiểm tra phân giải DNS từ bên ngoài trước khi xin chứng chỉ:
  ```bash
  dig +short thuexedien.me A
  dig +short api.thuexedien.me A
  dig +short www.thuexedien.me
  ```

### 3. Azure NSG (Network Security Group) và Firewall

Vì Azure NSG mặc định có rule `AllowVNetInBound` cho phép toàn bộ máy trong cùng VNet gọi nhau, mỗi VM phải cấu hình **rule Allow nguồn cụ thể có độ ưu tiên cao hơn (số priority nhỏ hơn)**, theo sau ngay bởi **rule Deny cổng đó từ mọi nguồn khác** trước khi tới rule mặc định:

| Máy | Allow Inbound | Deny Inbound (đặt ngay sau Allow, trước AllowVNetInBound) |
| --- | --- | --- |
| **VM1** | TCP `80`, `443` từ Internet; SSH `22` chỉ từ IP quản trị / Bastion | SSH `22` từ mọi nguồn khác; không publish cổng phụ của container |
| **VM2** | TCP `8000` chỉ từ `VM1_PRIVATE_IP/32`; SSH từ mạng quản trị | TCP `8000` từ mọi nguồn khác (kể cả VM3 hoặc máy khác trong VNet) |
| **VM3** | TCP `5432` chỉ từ `VM2_PRIVATE_IP/32`; cổng storage data chỉ từ `VM2_PRIVATE_IP/32` | TCP `5432` và cổng storage từ mọi nguồn khác (kể cả VM1) |

- Trên từng máy chủ chạy Docker: không chỉ dựa vào `ufw` (vì Docker publish port có thể đi vòng qua chuỗi `INPUT` của UFW). Luôn **bind rõ địa chỉ Private IP** khi khai báo `ports` trong `compose.yaml` (ví dụ `"${VM2_PRIVATE_IP}:8000:8000"`, `"${VM3_PRIVATE_IP}:5432:5432"`) kết hợp kiểm tra chuỗi `DOCKER-USER` và Azure NSG ở cả cấp Subnet lẫn NIC.

### 4. Cấu hình VM3 — PostgreSQL 16 và Sao lưu

- Chạy image `postgres:16` trong Docker Compose, gắn volume bền vững `pgdata:/var/lib/postgresql/data` và chỉ bind cổng vào `${VM3_PRIVATE_IP}:5432:5432`.
- Không dùng tài khoản superuser `postgres` cho ứng dụng FastAPI. Tạo role riêng có mật khẩu mạnh:
  ```sql
  CREATE ROLE evride_app LOGIN;
  \password evride_app
  CREATE DATABASE evride OWNER evride_app;
  ```
- **Sao lưu & Khôi phục:**
  - Chạy `pg_dump -U postgres -Fc evride` định kỳ ra thư mục có quyền `700` và sao lưu ra ngoài VM.
  - Khi kiểm tra khôi phục, selalu restore vào database thử nghiệm mới (`evride_restore_test`) bằng `pg_restore --no-owner --exit-on-error`; tuyệt đối không chạy `database.sql` (có lệnh `DROP TABLE`) hoặc `docker compose down -v` trên database đang có dữ liệu.

### 5. Cấu hình VM2 — FastAPI Backend, Migration và Cleanup

- **Biến môi trường Production (`backend.env`, `chmod 600`):**
  ```dotenv
  APP_ENV=production
  JWT_SECRET_KEY=<khóa_ngẫu_nhiên_tối_thiểu_32_byte>
  JWT_ISSUER=evride-api
  JWT_AUDIENCE=evride-web
  REFRESH_REPLAY_KEYS=<khóa_fernet_base64>
  REFRESH_GRACE_SECONDS=15
  AUTH_ORIGINS=https://thuexedien.me
  AUTH_COOKIE_SECURE=true
  DB_HOST=<VM3_PRIVATE_IP>
  DB_PORT=5432
  DB_NAME=evride
  DB_USER=evride_app
  DB_PASSWORD=<mật_khẩu_evride_app>
  ```
- **Chạy Uvicorn sau Reverse Proxy:** Sử dụng `--proxy-headers --forwarded-allow-ips "${VM1_PRIVATE_IP}" --no-access-log` (không dùng `'*'`).
- **Quy trình Build & Migration:**
  ```bash
  docker compose build api
  docker compose run --rm api python -m alembic current
  docker compose run --rm api python -m alembic upgrade head
  docker compose up -d api
  ```
- **Tác vụ Cleanup phiên và replay cache:** Thiết lập cron/systemd timer trên host VM2 chạy mỗi phút một lần:
  ```bash
  docker compose exec -T api python -m app.cleanup_auth
  ```

### 6. Cấu hình VM1 — Nginx Reverse Proxy và HTTPS Let's Encrypt

Đặt cấu hình tại `/opt/evride-edge` gồm container `nginx:stable-alpine` và `certbot/certbot:latest`:

1. **Bước A — Bootstrap HTTP (Cổng 80):**
   - Cấu hình Nginx mở đường dẫn `/.well-known/acme-challenge/` trỏ vào `/var/www/certbot` cho cả 3 tên miền `thuexedien.me`, `www.thuexedien.me`, `api.thuexedien.me`.
   - Chạy Certbot lấy chứng chỉ miễn phí:
     ```bash
     docker compose up -d nginx
     docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
       --cert-name thuexedien.me \
       -d thuexedien.me -d www.thuexedien.me -d api.thuexedien.me \
       --email YOUR_OPERATIONS_EMAIL --agree-tos --non-interactive
     ```
2. **Bước B — Bật HTTPS (Cổng 443) và Redirect:**
   - Mọi request HTTP cổng 80 (ngoài đường dẫn ACME challenge) được redirect `308` sang `https://$host$request_uri`.
   - `https://www.thuexedien.me` redirect `308` sang `https://thuexedien.me$request_uri` để đảm bảo mọi tab trình duyệt dùng chung một Origin (chung vùng `localStorage` và `Web Locks`).
   - `https://thuexedien.me` phục vụ bản build tĩnh của React (`try_files $uri $uri/ /index.html;`, `index.html` đặt `Cache-Control: no-cache`).
   - `https://api.thuexedien.me` chuyển tiếp `/api/v1/` sang `http://${VM2_PRIVATE_IP}:8000` với `proxy_cache off;`, `proxy_next_upstream off;`, giữ nguyên header `Set-Cookie` (cookie host-only trên `api.thuexedien.me`, `SameSite=Lax`, `Secure`, `HttpOnly`, `Path=/api/v1/auth`).
3. **Bước C — Gia hạn chứng chỉ tự động:**
   - Thiết lập systemd service & timer `evride-tls-renew.timer` chạy 2 lần/ngày (`00:00` và `12:00` kèm `RandomizedDelaySec=3600`), thực thi `certbot renew --quiet`, kiểm tra `nginx -t` và `nginx -s reload`.

---

## Phần III. Kiểm tra nghiệm thu và kế hoạch Cutover / Rollback

### 1. Bảng kiểm tra nghiệm thu hạ tầng

| Hạng mục | Lệnh kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| 3 VM tách biệt | `hostname; ip -4 addr` trên từng VM | 3 hostname và 3 Private IP độc lập |
| Đúng dịch vụ trên từng VM | `docker compose ps` trên VM1, VM2, VM3 | VM1: `nginx` · VM2: `api` · VM3: `postgres` (+ storage) |
| CSDL bị chặn từ VM1 | Từ VM1: `nc -zv <VM3_PRIVATE_IP> 5432` | Timeout / bị từ chối bởi NSG & firewall |
| Backend bị chặn từ VM3 | Từ VM3: `nc -zv <VM2_PRIVATE_IP> 8000` | Timeout / bị từ chối bởi NSG & firewall |
| HTTPS & Redirect chuẩn | `curl -I https://thuexedien.me` và `curl -I https://www.thuexedien.me` | Chứng chỉ hợp lệ (không cần `-k`), `www` trả `308` về `https://thuexedien.me` |
| API Health qua HTTPS | `curl -i https://api.thuexedien.me/api/v1/health` | HTTP `200 OK` |
| Cookie & Bảo mật Auth | Đăng nhập qua `https://thuexedien.me` | `Set-Cookie` có `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`, không lộ `refresh_token` trong JSON body |
| Bền vững dữ liệu | Khởi động lại VM3 (`sudo reboot`) | Database, phiên đăng nhập và dữ liệu nghiệp vụ vẫn còn nguyên |

### 2. Quy trình chuyển đổi (Cutover) và Rollback

1. **Trước khi nâng cấp:** Sao lưu đầy đủ database trên VM3; kiểm tra đồng bộ thời gian NTP trên cả 3 VM để tránh lệch hạn `expires_at` và `replay_until`.
2. **Chạy Migration:** Thực hiện migration bổ sung bảng `user_sessions` và `refresh_tokens` (`alembic upgrade head`) trước khi bật code backend mới.
3. **Triển khai đồng bộ:** Đưa backend mới (VM2) và bản build frontend mới (VM1) lên cùng đợt bảo trì. Tất cả JWT cũ không có claim `sid` sẽ bị từ chối (`401 UNAUTHENTICATED`) và người dùng đăng nhập lại.
4. **Nguyên tắc Rollback:** Không chạy `alembic downgrade` xóa hai bảng `user_sessions` / `refresh_tokens` nhằm giữ lại lịch sử phát hiện reuse và phiên đã thu hồi. Nếu buộc phải quay về bản ứng dụng trước đó, thực hiện trong chế độ bảo trì và xoay khóa `JWT_SECRET_KEY` để vô hiệu hóa toàn bộ token cũ.
