# Kế hoạch kiểm thử

Tài liệu xác định phạm vi kiểm thử của hệ thống EVRide, công cụ và môi trường kiểm thử, mẫu ghi kết quả, các ca kiểm thử dự kiến cho phần quản trị – báo cáo – triển khai và lịch thực hiện. Kết quả kiểm thử thực tế được tổng hợp vào `docs/kiem_thu.md`.

## 1. Phạm vi (theo mục IV.1 của thông báo học phần)

| Nhóm kiểm thử | Nội dung | Tự động / thủ công |
| --- | --- | --- |
| Thành công | Thuê xe, trả xe, nạp ví, báo hỏng, lập và đóng phiếu bảo trì chạy đúng | Tự động (pytest) |
| Dữ liệu sai | Mã xe không tồn tại, số tiền âm, mô tả quá ngắn, tệp không phải ảnh | Tự động |
| Giá trị biên | Số dư 19.999đ / 20.000đ; pin 19% / 20%; trạm còn đúng 1 chỗ | Tự động |
| Phân quyền | Chưa đăng nhập (401); khách gọi API nhân viên (403); khách xem dữ liệu khách khác | Tự động |
| Bảo mật | Chuỗi SQL injection ở ô tìm kiếm; mật khẩu lưu dạng băm | Tự động |
| Rollback | Lỗi giữa chừng khi thuê, trả xe, đóng phiếu → không bảng nào bị ghi dở | Tự động |
| Đồng thời | Hai khách thuê cùng một xe cùng lúc (2 kết nối thật) | Tự động |
| Truy vấn | Kết quả các truy vấn nghiệp vụ khớp với phép tính lại độc lập | Tự động |
| Migration | Chạy migration trên dữ liệu có sẵn; downgrade rồi upgrade lại | Tự động |
| Khôi phục | Sao lưu, khôi phục sang CSDL thử, so sánh với bản gốc | Script + ghi kết quả |
| Giao diện | Các màn hình hiển thị đúng; trạng thái rỗng, lỗi; điện thoại | Thủ công, có ảnh chụp |
| Triển khai 3 VM | Đúng thành phần trên từng VM; cổng CSDL không lộ; khởi động lại không mất dữ liệu | Thủ công, có ảnh chụp |

## 2. Công cụ và môi trường

- Kiểm thử tự động: **pytest** chạy trên **PostgreSQL thật**, CSDL riêng `evride_test` (không dùng mock, không đụng dữ liệu chính). Đặt trong `backend/tests/unit/` (hàm xử lý riêng lẻ) và `backend/tests/integration/` (API + CSDL) theo cấu trúc repo.
- Mỗi Pull Request chạy lại toàn bộ kiểm thử trên GitHub Actions.
- Kiểm thử giao diện: trình duyệt Chrome, kích thước 1280px và 390px.

## 3. Mẫu ghi một ca kiểm thử

| Mã | Nhóm | Thao tác | Kết quả mong đợi | Kết quả thực tế | Người chạy | Ngày | Minh chứng |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-01 | Giá trị biên | Khách có số dư 19.999đ bấm thuê xe | Từ chối, mã 402, thông báo "Số dư cần tối thiểu 20.000đ" | | | | tên test hoặc ảnh |

Quy ước: mỗi ca kiểm thử tự động có tên hàm mô tả rõ (ví dụ `test_bien_so_du_toi_thieu`); ca thủ công có ảnh chụp lưu ở `docs/screenshots/`; kết quả tổng hợp ghi vào `docs/kiem_thu.md`.

## 4. Ca kiểm thử dự kiến cho phần quản trị, báo cáo và triển khai

| Mã | Thao tác | Kết quả mong đợi |
| --- | --- | --- |
| QT-01 | Gọi API giờ cao điểm (`/api/v1/analytics/peak-hours`) cho tháng 6 | Tổng `so_luot_thue` = số chuyến bắt đầu trong tháng 6 |
| QT-02 | Gọi API doanh thu (`/api/v1/analytics/revenue`) cho 6 tháng | Tỷ trọng mỗi tháng cộng lại = 100% |
| QT-03 | Gọi API khách lâu không đi với `so_ngay=30` | Mọi khách trả về đều có số dư > 0 và 0 chuyến trong 30 ngày |
| QT-04 | Khách gọi bất kỳ API báo cáo | 403 |
| QT-05 | Báo cáo với ngày kết thúc trước ngày bắt đầu | 400, giao diện hiện thông báo |
| QT-06 | Điều chuyển xe vào trạm đã đầy | 409 "Trạm đích đã đầy" |
| QT-07 | Ngừng hoạt động xe đang được thuê | 409 "Xe đang được thuê" |
| QT-08 | Mở các màn hình quản trị ở 390px | Không tràn ngang, bảng cuộn được |
| QT-09 | Trên VM1 chạy `pg_isready -h <IP VM3>` | Không kết nối được (firewall chặn) |
| QT-10 | Khởi động lại VM3 | Đăng nhập lại, dữ liệu và ảnh vẫn còn |

## 5. Lịch

| Tuần | Việc kiểm thử |
| --- | --- |
| 1 | Chốt kế hoạch kiểm thử |
| 4–6 | Viết kiểm thử cùng lúc với code của từng chức năng; Pull Request không có kiểm thử thì yêu cầu bổ sung khi review |
| 7 | Viết kiểm thử cho các truy vấn báo cáo và API báo cáo |
| 8 | Chạy kiểm thử triển khai trên 3 VM |
| 9 | Chạy kiểm thử tổng hợp, cập nhật `docs/kiem_thu.md`, mở Issue cho lỗi tìm thấy |
| 10 | Dựng lại hệ thống từ README trên máy khác để kiểm chứng |