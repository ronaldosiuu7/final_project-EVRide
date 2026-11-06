# Kế hoạch kiểm thử

Tài liệu xác định phạm vi kiểm thử của hệ thống EVRide, công cụ và môi trường kiểm thử, mẫu ghi kết quả, các ca kiểm thử dự kiến cho phần quản trị – báo cáo – triển khai và lịch thực hiện. Kết quả kiểm thử thực tế được tổng hợp vào `docs/kiem_thu.md`.

## 1. Phạm vi (theo mục IV.1 của thông báo học phần)

| Nhóm kiểm thử | Nội dung | Tự động / thủ công |
| --- | --- | --- |
| Thành công | Thuê xe, trả xe, nạp ví, báo hỏng, lập và đóng phiếu bảo trì chạy đúng | Tự động (pytest) |
| Dữ liệu sai | Mã xe không tồn tại, số tiền âm, mô tả quá ngắn, tệp không phải ảnh | Tự động |
| Giá trị biên | Số dư 109.999đ / 110.000đ với xe seed (cọc 100.000đ + block đầu 10.000đ); pin 29% / 30%; trạm còn đúng 1 chỗ | Tự động |
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
| TC-01 | Giá trị biên | Khách có 109.999đ bấm giữ xe seed (cọc 100.000đ + block đầu 10.000đ) | Từ chối, HTTP 409 `INSUFFICIENT_BALANCE`; không ghi rental, ví hoặc giao dịch dở dang | | | | tên test hoặc ảnh |
| TC-02 | Giá trị biên | Khách có đúng 110.000đ và xe seed đủ điều kiện | Giữ xe thành công; yêu cầu tối thiểu tính từ snapshot cọc + giá block đầu | | | | tên test hoặc ảnh |
| TC-03 | Giá trị biên | Xe pin 29% / đúng 30% lúc giữ và pickup | 29% bị từ chối, 30% được phép nếu mọi điều kiện khác đạt | | | | tên test hoặc ảnh |

Quy ước: mỗi ca kiểm thử tự động có tên hàm mô tả rõ (ví dụ `test_bien_so_du_toi_thieu`); ca thủ công có ảnh chụp lưu ở `docs/screenshots/`; kết quả tổng hợp ghi vào `docs/kiem_thu.md`.

## 4. Ca kiểm thử dự kiến cho phần quản trị, báo cáo và triển khai

| Mã | Thao tác | Kết quả mong đợi |
| --- | --- | --- |
| QT-01 | Gọi API giờ cao điểm (`/api/v1/analytics/peak-hours`) cho tháng 6 | `filtered_trip_count` = số chuyến có `actual_start_time` trong tháng 6; `included_trip_count` = tổng `rental_count` của tối đa 20 trạm hiển thị |
| QT-02 | Gọi API doanh thu (`/api/v1/analytics/revenue`) cho 6 tháng | Tỷ trọng mỗi tháng cộng lại = 100% |
| QT-03 | Gọi API khách lâu không đi với `days=30` | Mọi khách trả về đều ACTIVE, `balance > 0` và có 0 chuyến bắt đầu trong 30 ngày |
| QT-04 | CUSTOMER gọi bất kỳ API báo cáo | 403 `FORBIDDEN`; STAFF/MANAGER ACTIVE được phép |
| QT-05 | Báo cáo với ngày kết thúc trước ngày bắt đầu | 400 `INVALID_DATE_RANGE`, giao diện hiện thông báo |
| QT-06 | Điều chuyển xe vào trạm đã đầy | 409 "Trạm đích đã đầy" |
| QT-07 | Ngừng hoạt động xe đang được thuê | 409 "Xe đang được thuê" |
| QT-08 | Mở các màn hình quản trị ở 390px | Không tràn ngang, bảng cuộn được |
| QT-09 | Trên VM1 chạy `pg_isready -h <IP VM3>` | Không kết nối được (firewall chặn) |
| QT-10 | Khởi động lại VM3 | Đăng nhập lại, dữ liệu và ảnh vẫn còn |
| QT-11 | Hai giao dịch cùng CUSTOMER giữ hai xe khác nhau đồng thời | Một rental active thành công; request còn lại 409 `ACTIVE_RENTAL_EXISTS`; xác minh khóa customer, unique partial index và không có dữ liệu dở |
| QT-12 | Replay cùng Idempotency-Key/body cho move, tạo giá hoặc phiếu bảo trì | Cùng HTTP status/body; không nhân đôi lịch sử giá, audit điều chuyển hoặc phiếu |
| QT-13 | Gây lỗi sau cập nhật xe nhưng trước khi ghi move audit | Toàn transaction rollback; vị trí xe và audit đều không đổi |
| QT-14 | Upload ảnh sai MIME/kích thước/hash; download file chưa READY | Upload bị từ chối/REJECTED; không tạo attachment hoặc URL download |
| AUTH-01 | Login tạo phiên mới và refresh rotation (`test_login_and_rolling`) | Mỗi login sinh `session_id` riêng; refresh tăng `generation`, đánh dấu `used_at` token cũ, gia hạn rolling 30 ngày và không lưu raw token trong DB |
| AUTH-02 | Mất response refresh và retry trong grace 15 giây (`test_lost_response_replay_does_not_extend_grace`) | Trả lại nguyên kết quả đã mã hóa, không tạo token thứ 3 và không kéo dài `replay_until` |
| AUTH-03 | Dùng lại refresh token cũ ngoài grace (`test_many_generations_and_reuse_committed`, `test_http_reuse_is_committed_without_set_cookie`) | Trả 401 `REFRESH_REUSED`, commit thu hồi phiên (`REFRESH_REUSE`) mà không bị rollback bởi `HTTPException`, không gửi `Set-Cookie` |
| AUTH-04 | Rollback nguyên tử khi lỗi giữa lúc xoay vòng token hoặc đổi mật khẩu (`test_atomic_rollback`, `test_password_rollback`) | Token cũ vẫn `used_at = NULL` / mật khẩu và trạng thái các phiên giữ nguyên nếu lỗi xảy ra trước khi commit |
| AUTH-05 | Tranh chấp đồng thời: 2 luồng cùng refresh, hoặc refresh đua với logout / đổi mật khẩu / khóa tài khoản (`test_concurrent_refresh_rotates_once`, `test_refresh_races_revocation`, `test_refresh_races_account_lock`) | Chỉ xoay vòng 1 lần; sau khi logout/đổi mật khẩu/khóa tài khoản thì phiên bị thu hồi nhất quán; mở khóa lại không hồi sinh phiên cũ (`test_disable_reenable_does_not_resurrect`) |
| AUTH-06 | Kiểm tra Cookie versioned, CSRF, CORS và JWT claims (`test_http_cookie_csrf_and_cors`, `test_access_expired_and_invalid_claims`, `test_late_cookie_cannot_overwrite_new_generation`) | Cookie `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`; chặn thiếu `Origin`/`X-EVRide-CSRF`; cookie thế hệ cũ không ghi đè thế hệ mới |

## 5. Lịch

| Tuần | Việc kiểm thử |
| --- | --- |
| 1 | Chốt kế hoạch kiểm thử |
| 4–6 | Viết kiểm thử cùng lúc với code của từng chức năng; Pull Request không có kiểm thử thì yêu cầu bổ sung khi review |
| 7 | Viết kiểm thử cho các truy vấn báo cáo và API báo cáo |
| 8 | Chạy kiểm thử triển khai trên 3 VM |
| 9 | Chạy kiểm thử tổng hợp, cập nhật `docs/kiem_thu.md`, mở Issue cho lỗi tìm thấy |
| 10 | Dựng lại hệ thống từ README trên máy khác để kiểm chứng |