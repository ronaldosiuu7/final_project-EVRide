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

- Kiểm thử tích hợp chạy trên **PostgreSQL thật**, sử dụng database riêng có tên kết thúc bằng `_test` (`evride_test`); không tác động vào database chính (`evride_db`).
- Các bộ kiểm thử tự động hiện có trong `backend/tests/`:
  - `test_auth_sessions.py`: Rolling Session, Refresh Token Rotation, grace replay, thu hồi phiên và tranh chấp đồng thời trên PostgreSQL.
  - `test_rental_flow.py`: Giữ xe 30 phút, tranh chấp đồng thời 2 khách đặt cùng 1 xe, kiểm tra số dư, idempotency, hết hạn/hủy giữ chỗ và thu cọc khi pickup trên PostgreSQL.
  - `test_incident_checkin_flow.py`: Danh sách kiểm tra 24 giờ (`/rental-check-ins`), `NO_ANSWER`, `ESCALATE` nguyên tử, `FALSE_ALARM`, vòng đời sự cố `LOSS_THEFT`, quyết toán thuê/hoàn cọc dư, bồi thường ngoài hệ thống, đóng hồ sơ, thu hồi sau đóng, bảo trì dùng chung (`incident_id`), `MANAGER` giải phóng xe và phân quyền HTTP trên PostgreSQL.
  - `test_external_compensation.py`: Kiểm thử schema, quy tắc nghiệp vụ, RBAC và idempotency cho luồng bồi thường ngoài hệ thống và hoàn tất sự cố.
  - `test_rental_pricing.py`, `test_promotions.py`, `test_business_schemas.py`, `test_demo_fixtures.py`: Unit test cho tính giá thuê/cọc, khuyến mãi, ràng buộc schema tiền tệ và dữ liệu seed demo.
- Kiểm thử giao diện (thủ công): trình duyệt Chrome ở kích thước 1280px và 390px.

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
| QT-02 | Gọi API doanh thu (`/api/v1/analytics/revenue`) cho 6 tháng | Tháng doanh thu dương tỷ trọng tổng 100% theo sai số quy định; tháng 0 trả tỷ trọng 0; tách thu thuê sự cố và bồi thường |
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

## 6. Ma trận sự cố theo phạm vi thu gọn 13/11/2026

Nguồn: [quyết định mục 12](v1-decisions.md), [hợp đồng API mục 9.1](api-contract.md) và [kiến trúc hệ thống](architecture.md).
Các ca tự động tương ứng được triển khai tại `backend/tests/test_incident_checkin_flow.py` và `backend/tests/test_external_compensation.py`.
Các ca định giá/hoàn bồi thường qua ví nội bộ ngày 12/11/2026 đã được thay thế bởi quy trình bồi thường ngoài hệ thống (1 bước `POST /compensation/external-settlement`).

| Mã | Tình huống | Kết quả bắt buộc |
| --- | --- | --- |
| INC-01 | Chuyến trước/đúng ngưỡng 24 giờ | Chưa đến ngưỡng không có trong `GET /rental-check-ins`; đến ngưỡng xuất hiện, không phạt, không STOLEN, không tự dừng cước |
| INC-02 | `GET /rental-check-ins` chỉ đọc & `NO_ANSWER` / `CONTINUE_RENTAL` | `GET` nhiều lần không tự đánh dấu đã xử lý; `NO_ANSWER`/`CONTINUE_RENTAL` lưu `next_check_at`; `ESCALATE` tạo ticket + hồ sơ sự cố trước khi ẩn khỏi danh sách |
| INC-03 | Khách báo và nhân viên tiếp nhận nghi mất (`intake`) | Báo không đổi trạng thái; tiếp nhận mở hồ sơ `INVESTIGATING` (không cần `assigned_to`), xe `SUSPECTED_STOLEN`, rental `IN_RENT`; tiền tạm tính |
| INC-04 | M xác nhận mất tại T2, báo cáo server nhận T1, khách khai T0 | Cutoff = T1, không T0/T2; kiểm tra 24h không phải báo cáo hợp lệ; snapshot giá giữ nguyên |
| INC-05 | Báo nhầm bị bác (`FALSE_ALARM`) và tiếp tục dùng | Xe `RENTED`/rental `IN_RENT`, đồng bộ `next_check_at` nhất quán; cước thường và khuyến mãi thường tiếp tục |
| INC-06 | Chưa đủ căn cứ, GPS stale hoặc không liên lạc được | Giữ trạng thái xác minh và lịch `next_check_at`; không tự kết luận lỗi/trộm hoặc trừ tiền |
| INC-07 | Khách khác đọc hồ sơ/ảnh; STAFF gọi endpoint của M | Không rò dữ liệu; sai role bị 403; M hợp lệ vẫn phải đáp ứng điều kiện nghiệp vụ |
| INC-08 | Bỏ xe: thu hồi T1 (`recovery`), về trạm T2 (`arrival` + `condition`), thanh toán T3 | Cước snapshot đến T1; không tính vận chuyển/sửa/chờ, không phí thu hồi, không trần tự đặt |
| INC-09..14 | Ghi nhận bồi thường ngoài hệ thống (`POST /compensation/external-settlement`) | `0.00` (`NOT_REQUIRED`) xác nhận không phải bồi thường; `> 0` bắt buộc `AGREED`/`AUTHORITY_DECISION` và thông tin thanh toán ngoài; không sửa ví, cọc hay doanh thu thuê |
| INC-15 | Cọc 100.000, tiền thuê 41.500 | `settle-rent` cấn 41.500 (không trừ ví 2 lần, ghi doanh thu 41.500), giữ 58.500 chờ `deposit/refund`; không cấn cọc vào bồi thường |
| INC-16 | Thiếu tiền/ví khóa khi quyết toán tiền thuê | Rollback `settle-rent`, không cấn dở; không trả góp |
| INC-17 | Chưa ghi nhận bồi thường ngoài hệ thống (`compensation_assessed_amount = null`) | `close` từ chối (không coi `null` là `0`); chưa hoàn `deposit_held` cũng từ chối đóng |
| INC-18 | Thu hồi ngoài trạm rồi tranh chỗ cuối cùng khi về trạm (`arrival`) | Ngoài trạm chưa gán station; `arrival` kiểm tra chỗ và đánh dấu `condition`; retry không chiếm hai chỗ |
| INC-19 | Xe thu hồi, khách cũ còn nợ, mở `/maintenance-orders` với `incident_id` hoàn tất & M `release-vehicle` | Xe cho khách mới thuê nếu điều kiện khác đạt; khách cũ vẫn bị chặn; không đóng rental cũ để mở xe |
| INC-20 | Hai khách mới tranh xe đã giải phóng | Chỉ một rental giữ quyền xe; unique customer vẫn chặn khách cũ còn chuyến chưa giải quyết |
| INC-21 | Quyết toán/hoàn cọc/đóng hồ sơ cũ khi xe đang `RESERVED`/`RENTED` bởi khách mới | Xe, snapshot, cọc và rental mới không thay đổi; không gọi `settle_return` thường cho hồ sơ cũ |
| INC-22 | Đóng hồ sơ còn nợ thuê / còn `deposit_held` / chưa ghi bồi thường ngoài | Từ chối; đủ điều kiện mới `CLOSED_INCIDENT`; xe chưa tìm thấy vẫn `STOLEN` |
| INC-23 | Thu hồi (`recovery`/`arrival`) sau khi đã `CLOSED_INCIDENT` | Ghi nhận trên hồ sơ cũ, không mở lại rental, không tính lại tiền thuê hoặc doanh thu thuê lần nữa |
| INC-24 | Phản ánh mới sau `COMPLETED` có invoice/mã đã dùng | Chỉ ticket/bằng chứng; không hồ sơ tài chính mới, thu thêm, sửa invoice hoặc phục hồi mã; bảo trì vẫn theo quy trình |
| INC-25..26 | Retry `settle-rent`/`deposit/refund`/`external-settlement` | Cùng key replay; bồi thường ngoài đã settled trả lỗi khi ghi đè; số dư/sổ giao dịch/audit nhất quán |
| INC-27 | Sự cố dùng promotion còn lượt | Không giảm thuê, không consume claim/`used_count`; báo nhầm bác bỏ vẫn theo luồng thường |
| INC-28 | Thuê sự cố quyết toán tháng A, đóng B | Doanh thu thuê một lần tháng A gồm cọc cấn + thu thêm; bồi thường ngoài không vào doanh thu |
| INC-29 | Migration với dữ liệu lịch sử (`e8a412c9f603` -> `f4c2a1b8e901`) | Bảo toàn snapshot/ledger/CHECK thường; upgrade/downgrade/`alembic check` sạch trên `evride_test` |
| INC-30 | Nhiều báo cáo, báo nhầm rồi báo mới, kiểm tra lại | Lịch sử không bị ghi đè, đúng báo cáo chọn làm cutoff, đúng `next_check_at` và owner |

Ca concurrency dùng kết nối/transaction độc lập và điểm đồng bộ để bảo đảm
thực sự tranh chấp, không chỉ gọi nối tiếp. Kiểm tra cả khóa FK/idempotency
với thứ tự station → customer → wallet → vehicle → rental và phần bổ sung.
Upgrade/downgrade chỉ trên DB thử; downgrade có dữ liệu sự cố mới phải từ
chối khi chưa có phương án bảo toàn, không drop mất lịch sử tiền.

## 7. Ticket, ảnh, bảo trì, GPS, review và FAQ

| Mã | Kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| OPS-01 | Ticket có ảnh và người tiếp nhận, resolve/close | Ảnh đúng owner/READY; IN_PROGRESS có assignee; RESOLVED có resolution_note; không tự đổi rental/tiền |
| OPS-02 | Hai phiếu bảo trì active cùng xe; thuê xe đang bảo trì | Unique chặn phiếu active trùng; reserve/pickup từ chối; complete/cancel không tự AVAILABLE |
| OPS-03 | GPS demo tắt, sai role/timestamp/tọa độ | Từ chối theo contract; không ghi điểm; không giả định thiết bị thật |
| OPS-04 | GPS không điểm, tuổi điểm đúng 60 giây và quá 60 giây | Không điểm stale; code hiện dùng quá 60 giây; trả recorded_at/ngưỡng để UI hiển thị, không kết luận mất xe |
| OPS-05 | Review owner COMPLETED, lần hai/đồng thời; trạng thái khác | Chỉ một review bằng unique; lần hai ALREADY_REVIEWED; không cho IN_RENT/CLOSED_INCIDENT hoặc khách khác |
| OPS-06 | Ít nhất 10 FAQ chuẩn, link nguồn, câu mơ hồ/ngoài phạm vi | Hiện có 12 câu; mỗi đáp án khớp có nguồn truy cập được; không bịa khi không khớp/khớp nhiều; thiếu nguồn báo lỗi phụ thuộc |
