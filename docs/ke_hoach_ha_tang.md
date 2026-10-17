# Kế hoạch hạ tầng: 3 máy ảo

Tài liệu mô tả cách triển khai hệ thống EVRide trên 3 máy ảo theo mục V của thông báo học phần: phân bổ tài nguyên, địa chỉ mạng, luồng kết nối và firewall, các bước dựng, cách kiểm tra nghiệm thu và phương án dự phòng.

## 1. Phương án đã chọn

Dựng 3 máy ảo bằng **VirtualBox** trên một laptop RAM 16 GB, mỗi VM chạy **Ubuntu Server 24.04** với hệ điều hành và IP riêng. Thông báo học phần cho phép dựng 3 VM trên cùng một máy vật lý, miễn mỗi VM tách biệt.

Lý do: chủ động khi bảo vệ (không phụ thuộc mạng trường), không tốn phí. Tên miền và HTTPS (điểm cộng) chỉ làm nếu dựng thêm bản trên cloud.

## 2. Phân bổ tài nguyên

| VM | Chạy | RAM | CPU | Ổ đĩa (cấp phát động) | IP Host-only |
| --- | --- | --- | --- | --- | --- |
| VM1 – Frontend | Nginx (React build + reverse proxy) trong Docker | 1,5 GB | 1 | 12 GB | 192.168.56.11 |
| VM2 – Backend | FastAPI trong Docker | 2 GB | 1 | 12 GB | 192.168.56.12 |
| VM3 – DB + Storage | PostgreSQL 17 + MinIO trong Docker, dữ liệu trên ổ đĩa VM | 3 GB | 2 | 20 GB | 192.168.56.13 |

Mỗi VM có 2 card mạng: **NAT** (ra Internet tải phần mềm) và **Host-only** `192.168.56.0/24` (3 VM kết nối với nhau, laptop truy cập VM1).

Yêu cầu dung lượng: ổ cứng máy chủ còn khoảng 60 GB trống; ổ ảo cấp phát động nên dung lượng thực tế khoảng 15–20 GB. File sao lưu `.ova` lưu ra ổ ngoài.

## 3. Luồng kết nối và firewall

```
Trình duyệt ──HTTP 80──► VM1 Nginx ──/api ──► VM2 FastAPI :8000 ──SQL──► VM3 PostgreSQL :5432
                                                                └──S3───► VM3 MinIO :9000
```

| Máy | Cổng mở | Chỉ nhận từ | Ghi chú |
| --- | --- | --- | --- |
| VM1 | 80, 443 | Mọi nơi | Cửa vào duy nhất của người dùng |
| VM1 | 22 | Mạng nội bộ | SSH quản trị |
| VM2 | 8000 | **Chỉ VM1** | Backend không mở công khai |
| VM3 | 5432 | **Chỉ VM2** | Frontend không kết nối thẳng CSDL |
| VM3 | 9000 | **Chỉ VM2** | Lưu ảnh báo hỏng |
| VM3 | 9001 | Chỉ 127.0.0.1 | Giao diện quản trị MinIO, không mở công khai |

Chặn bằng `ufw` và thêm luật chuỗi `DOCKER-USER` (Docker tự mở cổng và bỏ qua ufw). Script đặt ở `deploy/scripts/`, cấu hình Docker Compose cho từng VM ở `deploy/docker/`, cấu hình Nginx ở `deploy/nginx/` (theo cấu trúc thư mục `deploy/` của repo).

## 4. Các bước dựng

1. Cài VirtualBox, tạo mạng Host-only `192.168.56.1/24`, tắt DHCP.
2. Tạo VM3, cài Ubuntu Server (tích OpenSSH), cài Docker; clone ra VM2, VM1 (tạo MAC mới); đặt `hostname` và IP tĩnh bằng netplan.
3. VM3: chạy PostgreSQL + MinIO, tạo bucket và tài khoản ứng dụng, bật firewall.
4. VM2: build Backend, chạy migration, nạp dữ liệu, bật firewall.
5. VM1: build Frontend, bật firewall; mở `http://192.168.56.11` trên laptop.
6. Chụp snapshot sau mỗi bước chạy được; xuất `.ova` ra ổ ngoài khi xong.

## 5. Kiểm tra nghiệm thu (minh chứng cho báo cáo)

| Kiểm tra | Lệnh | Mong đợi |
| --- | --- | --- |
| 3 máy, 3 IP | `hostname; ip -4 addr` trên từng VM | 3 tên, 3 IP khác nhau |
| Đúng thành phần | `docker ps` trên từng VM | VM1: frontend · VM2: backend · VM3: postgres, minio |
| CSDL không lộ | Trên VM1: `pg_isready -h 192.168.56.13` | Không kết nối được |
| CSDL nhận từ VM2 | Trên VM2: `pg_isready -h 192.168.56.13` | `accepting connections` |
| Dữ liệu bền vững | Khởi động lại VM3 | Dữ liệu và ảnh còn nguyên |
| Toàn hệ thống | Thuê rồi trả xe trên giao diện | Thành công, sao kê ví cập nhật |

## 6. Đầu vào cần có trước khi triển khai

| Thành phần | Cần có |
| --- | --- |
| Backend | Dockerfile, `backend/.env.example`, lệnh chạy migration |
| Cơ sở dữ liệu | Script sinh dữ liệu, script sao lưu/khôi phục chạy được trên VM3 |
| Frontend | Dockerfile, `frontend/.env.example`, gọi API bằng đường dẫn tương đối `/api` |

## 7. Rủi ro và phương án dự phòng

| Rủi ro | Phương án |
| --- | --- |
| Laptop triển khai hỏng hoặc thiếu RAM/ổ đĩa trước buổi bảo vệ | Có file `.ova` trên ổ ngoài, import vào laptop khác |
| Docker Hub chậm hoặc bị chặn khi build | Build sớm, không để sát ngày nộp |
| Quên bật firewall sau khi khởi động lại VM | Chạy lại script firewall trong danh sách việc trước giờ bảo vệ |