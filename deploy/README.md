# Hướng dẫn Triển khai Hệ thống EVRide (Deploy)

Tài liệu này hướng dẫn chi tiết cách đóng gói và triển khai hệ thống **EVRide** lên kiến trúc **3 máy ảo (3 VMs) trên Azure** với tên miền `thuexedien.me`, chứng chỉ HTTPS Let's Encrypt, cơ sở dữ liệu PostgreSQL 16 và cơ chế xác thực **Rolling Session & Refresh Token Rotation**.

---

## 1. Cấu trúc thư mục `deploy/`

| Thư mục | Nội dung |
| --- | --- |
| `docker/` | Chứa các mẫu cấu hình `compose.yaml` cho từng máy ảo (VM1 Edge, VM2 Backend, VM3 Database). |
| `nginx/` | Chứa cấu hình Reverse Proxy (`default.conf.template`) cho bước khởi tạo HTTP-01 và bước chạy HTTPS chính thức. |
| `scripts/` | Chứa script gia hạn chứng chỉ TLS (`renew-tls.sh`), systemd timer, script sao lưu/khôi phục PostgreSQL và dọn dẹp phiên (`cleanup_auth`). |

> **Nguyên tắc bảo mật:** Tuyệt đối không lưu khóa bí mật (`JWT_SECRET_KEY`, `REFRESH_REPLAY_KEYS`, mật khẩu DB) hoặc thư mục chứng chỉ `letsencrypt/` vào Git. Các giá trị nhạy cảm phải được nạp qua biến môi trường hoặc file `.env` có quyền `chmod 600` trực tiếp trên máy chủ.

---

## 2. Kiến trúc mạng, DNS và Tường lửa (Azure NSG)

### 2.1. Sơ đồ kết nối 3 VM trên Azure

```text
Internet (HTTPS 443 / HTTP 80)
  ├── thuexedien.me
  ├── www.thuexedien.me  --(308 Redirect)--> https://thuexedien.me
  └── api.thuexedien.me
        │
        ▼
  [Azure VM1 - Edge / Frontend] (Public IPv4 tĩnh + VM1_PRIVATE_IP)
    - Nginx Docker (:80, :443), phục vụ React build tĩnh & Reverse Proxy
    - Certbot (Let's Encrypt HTTP-01)
        │
        │  HTTP nội bộ VNet (/api/v1/ -> VM2_PRIVATE_IP:8000)
        ▼
  [Azure VM2 - Backend API] (Chỉ có VM2_PRIVATE_IP, không mở Public IP)
    - FastAPI / Uvicorn Docker (:8000)
    - Cron/Timer chạy python -m app.cleanup_auth mỗi phút
        │
        │  TCP 5432 nội bộ VNet (VM3_PRIVATE_IP:5432)
        ▼
  [Azure VM3 - Database & Storage] (Chỉ có VM3_PRIVATE_IP, không mở Public IP)
    - PostgreSQL 16 Docker (:5432) và dịch vụ lưu trữ file
```

- Các địa chỉ `VM1_PRIVATE_IP`, `VM2_PRIVATE_IP`, `VM3_PRIVATE_IP` phải được đặt **Static** tại phần Network Interface (NIC) trên Azure Portal (không dùng dải IP demo `192.168.56.x`).

### 2.2. Cấu hình DNS (Namecheap)

Tại bảng điều khiển DNS của tên miền `thuexedien.me`:

| Loại bản ghi | Host | Giá trị | Ghi chú |
| --- | --- | --- | --- |
| `A` | `@` | `<Public IPv4 của VM1>` | Trỏ `thuexedien.me` về VM1 |
| `A` | `api` | `<Public IPv4 của VM1>` | Trỏ `api.thuexedien.me` về VM1 |
| `CNAME` | `www` | `thuexedien.me` | Để Nginx trên VM1 chuyển hướng 308 về domain chính |

Kiểm tra trước khi chạy Certbot:
```bash
dig +short thuexedien.me A
dig +short api.thuexedien.me A
dig +short www.thuexedien.me
```

### 2.3. Cấu hình Azure NSG và Docker Firewall

Do Azure NSG mặc định có rule `AllowVNetInBound`, bạn phải tạo **rule Allow cho IP nguồn cụ thể trước**, và đặt **rule Deny cổng đó từ mọi nguồn khác ngay phía sau** (trước `AllowVNetInBound`):

| Máy | Rule Allow Inbound | Rule Deny Inbound (đặt trước AllowVNetInBound) |
| --- | --- | --- |
| **VM1** | TCP `80`, `443` từ `Internet`; TCP `22` từ IP quản trị / Bastion | TCP `22` từ mọi nguồn khác |
| **VM2** | TCP `8000` từ `VM1_PRIVATE_IP/32`; TCP `22` từ mạng quản trị | TCP `8000` từ `Any` (chặn VM3 và các máy khác trong VNet) |
| **VM3** | TCP `5432` từ `VM2_PRIVATE_IP/32`; cổng storage từ `VM2_PRIVATE_IP/32` | TCP `5432` và cổng storage từ `Any` (chặn VM1 gọi thẳng DB) |

> **Lưu ý Docker:** Docker tự thêm rule vào `iptables` và có thể đi vòng qua `ufw`. Vì vậy trong mọi file `compose.yaml` của VM2 và VM3, bắt buộc phải **bind rõ Private IP** vào cấu hình `ports` (ví dụ `"${VM2_PRIVATE_IP}:8000:8000"`).

---

## 3. Triển khai trên từng Máy ảo

### 3.1. Máy ảo VM3 — PostgreSQL 16 và Sao lưu

**1. Tạo file `compose.yaml` trên VM3:**
```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: "${POSTGRES_ADMIN_PASSWORD:?set admin password}"
    ports:
      - "${VM3_PRIVATE_IP:?set VM3_PRIVATE_IP}:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

**2. Khởi chạy và tạo tài khoản riêng cho ứng dụng (không dùng `postgres` superuser cho FastAPI):**
```bash
docker compose up -d postgres
docker compose exec postgres psql -U postgres
```
Trong giao diện `psql`:
```sql
CREATE ROLE evride_app LOGIN;
\password evride_app
CREATE DATABASE evride OWNER evride_app;
```

**3. Sao lưu (Backup) và Kiểm tra Khôi phục (Restore test):**
- Tạo bản sao lưu định kỳ:
  ```bash
  mkdir -p backups && chmod 700 backups
  umask 077
  docker compose exec -T postgres pg_dump -U postgres -Fc evride > "backups/evride-$(date -u +%Y%m%dT%H%M%SZ).dump"
  ```
- Kiểm tra khôi phục vào một database thử nghiệm riêng (tuyệt đối không chạy `database.sql` hay `docker compose down -v` vào DB đang chạy):
  ```bash
  docker compose exec postgres createdb -U postgres evride_restore_test
  docker compose exec -T postgres pg_restore -U postgres -d evride_restore_test --no-owner --exit-on-error < backups/BACKUP_FILE.dump
  ```

---

### 3.2. Máy ảo VM2 — FastAPI Backend, Migration và Cleanup

**1. Đảm bảo có `backend/Dockerfile` và `backend/.dockerignore`:**

`backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /srv/evride/backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --uid 10001 --create-home evride
COPY app ./app
COPY alembic.ini ./
COPY database/migrations ./database/migrations
RUN mkdir -p uploads && chown -R evride:evride /srv/evride
USER evride
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
```

`backend/.dockerignore`:
```text
.env
.env.*
.venv
__pycache__
uploads
tests
*.pyc
```

**2. Tạo file biến môi trường `backend.env` (`chmod 600 backend.env`) trên VM2:**
Sinh 2 khóa độc lập cho `JWT_SECRET_KEY` và `REFRESH_REPLAY_KEYS`, sau đó cấu hình:
```dotenv
APP_NAME=EVRide
APP_ENV=production
JWT_SECRET_KEY=<chuỗi_ngẫu_nhiên_tối_thiểu_32_byte>
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

**3. Tạo file `compose.yaml` trên VM2:**
```yaml
services:
  api:
    build:
      context: ./source/backend
    restart: unless-stopped
    env_file: ./backend.env
    ports:
      - "${VM2_PRIVATE_IP:?set VM2_PRIVATE_IP}:8000:8000"
    command:
      - uvicorn
      - app.main:app
      - --host
      - 0.0.0.0
      - --port
      - "8000"
      - --workers
      - "1"
      - --proxy-headers
      - --forwarded-allow-ips
      - "${VM1_PRIVATE_IP:?set VM1_PRIVATE_IP}"
      - --no-access-log
    volumes:
      - uploads_compat:/srv/evride/backend/uploads
volumes:
  uploads_compat:
```

**4. Build, chạy Migration và khởi động API:**
```bash
docker compose build api
docker compose run --rm api python -m alembic current
docker compose run --rm api python -m alembic upgrade head
docker compose up -d api
```

**5. Thiết lập tác vụ dọn dẹp phiên (`cleanup_auth`) mỗi phút:**
Thêm vào crontab hoặc systemd timer trên host VM2 để xóa `replay_ciphertext` đã qua grace (15 giây) và xóa các phiên đã kết thúc quá 30 ngày:
```bash
* * * * * cd /opt/evride-backend && docker compose exec -T api python -m app.cleanup_auth >/dev/null 2>&1
```

---

### 3.3. Máy ảo VM1 — Nginx Reverse Proxy, Frontend và HTTPS Let's Encrypt

Chuẩn bị thư mục `/opt/evride-edge` trên VM1 gồm: `compose.yaml`, `templates/`, `frontend-dist/` (chứa bản `npm run build` của React), `acme/` và `letsencrypt/`.

**1. Tạo file `/opt/evride-edge/compose.yaml`:**
```yaml
services:
  nginx:
    image: nginx:stable-alpine
    restart: unless-stopped
    environment:
      VM2_PRIVATE_IP: "${VM2_PRIVATE_IP:?set VM2_PRIVATE_IP}"
      NGINX_ENVSUBST_FILTER: "^VM2_PRIVATE_IP$"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./templates:/etc/nginx/templates:ro
      - ./frontend-dist:/usr/share/nginx/html:ro
      - ./acme:/var/www/certbot:ro
      - ./letsencrypt:/etc/letsencrypt:ro
  certbot:
    image: certbot/certbot:latest
    profiles: [tools]
    volumes:
      - ./acme:/var/www/certbot
      - ./letsencrypt:/etc/letsencrypt
```

**2. Bước A — Bootstrap HTTP (Cổng 80) để lấy chứng chỉ Let's Encrypt:**
Tạo `templates/default.conf.template` tạm thời:
```nginx
server {
    listen 80;
    server_name thuexedien.me www.thuexedien.me api.thuexedien.me;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
    }
    location / { return 503; }
}
```
Khởi chạy Nginx và xin chứng chỉ cho cả 3 tên miền:
```bash
docker compose up -d nginx
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  --cert-name thuexedien.me \
  -d thuexedien.me -d www.thuexedien.me -d api.thuexedien.me \
  --email YOUR_OPERATIONS_EMAIL --agree-tos --non-interactive
```

**3. Bước B — Bật cấu hình HTTPS chính thức:**
Sau khi có chứng chỉ trong `./letsencrypt/live/thuexedien.me/`, thay nội dung `templates/default.conf.template` bằng:
```nginx
log_format evride_safe '$remote_addr $request_method $uri $status $request_time';
access_log /var/log/nginx/access.log evride_safe;

server {
    listen 80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    server_name thuexedien.me www.thuexedien.me api.thuexedien.me;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
    }
    location / { return 308 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name www.thuexedien.me;
    ssl_certificate /etc/letsencrypt/live/thuexedien.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/thuexedien.me/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 308 https://thuexedien.me$request_uri;
}

server {
    listen 443 ssl;
    server_name thuexedien.me;
    ssl_certificate /etc/letsencrypt/live/thuexedien.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/thuexedien.me/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root /usr/share/nginx/html;
    location / { try_files $uri $uri/ /index.html; }
    location = /index.html { add_header Cache-Control "no-cache"; }
}

server {
    listen 443 ssl;
    server_name api.thuexedien.me;
    ssl_certificate /etc/letsencrypt/live/thuexedien.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/thuexedien.me/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 12m;
    location /api/v1/ {
        proxy_pass http://${VM2_PRIVATE_IP}:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection "";
        proxy_cache off;
        proxy_next_upstream off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
    location / { return 404; }
}
```
Kiểm tra cú pháp và nạp lại container Nginx:
```bash
docker compose run --rm --no-deps nginx nginx -t
docker compose up -d --force-recreate nginx
```

**4. Bước C — Tự động gia hạn chứng chỉ TLS (`systemd timer`):**
- Tạo script `/opt/evride-edge/renew-tls.sh` (`chmod 700`):
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  cd /opt/evride-edge
  docker compose run --rm certbot renew --quiet
  docker compose exec -T nginx nginx -t
  docker compose exec -T nginx nginx -s reload
  ```
- Tạo `/etc/systemd/system/evride-tls-renew.service` và `/etc/systemd/system/evride-tls-renew.timer` (chạy lúc `00:00` và `12:00` mỗi ngày), sau đó kích hoạt:
  ```bash
  sudo systemctl daemon-reload
  sudo systemctl enable --now evride-tls-renew.timer
  ```

---

## 4. Kiểm tra sau triển khai, Chuyển đổi (Cutover) và Rollback

### 4.1. Lệnh kiểm tra nhanh

```bash
curl -I https://thuexedien.me
curl -I https://www.thuexedien.me
curl -i https://api.thuexedien.me/api/v1/health
```

- `https://www.thuexedien.me` phải trả về `HTTP/2 308` chuyển hướng sang `https://thuexedien.me`.
- `https://api.thuexedien.me/api/v1/health` phải trả về `HTTP/2 200` với `{"status":"ok"}`.
- Khi đăng nhập thử trên trình duyệt, response của `POST /api/v1/auth/login` phải có header `Set-Cookie: evr_rt_<sid>_0=...; Path=/api/v1/auth; HttpOnly; Secure; SameSite=lax` và `Cache-Control: no-store`.

### 4.2. Quy trình Cutover & Rollback an toàn

1. **Đồng bộ thời gian (NTP):** Đảm bảo cả 3 VM đều bật đồng bộ thời gian chuẩn UTC trước khi mở dịch vụ để không lệch thời hạn `expires_at` và `replay_until`.
2. **Cutover:** Sao lưu DB trên VM3 $\rightarrow$ Chạy `alembic upgrade head` trên VM2 $\rightarrow$ Khởi động lại container API trên VM2 và cập nhật bản build Frontend trên VM1. Các JWT cũ không có `sid` sẽ tự động bị từ chối và yêu cầu người dùng đăng nhập lại.
3. **Rollback:** Không chạy `alembic downgrade` làm xóa bảng `user_sessions` và `refresh_tokens`. Nếu cần quay lại phiên bản code trước đó, giữ nguyên 2 bảng mới trong DB; nếu quay về bản không kiểm tra bảng phiên thì phải đổi `JWT_SECRET_KEY` trong thời gian bảo trì để vô hiệu hóa toàn bộ token đang lưu hành.
