# Đặc tả màn hình quản trị và báo cáo doanh thu

Tài liệu mô tả các màn hình dành cho nhân viên vận hành của hệ thống EVRide: mỗi màn hình hiển thị dữ liệu gì, lấy từ truy vấn nào, lọc ra sao và điều kiện để coi là hoàn thành. Đây là căn cứ để xây dựng API báo cáo, giao diện quản trị và kiểm thử phần thống kê.

API báo cáo thuộc `/api/v1/analytics/…` (`backend/app/api/v1/analytics.py`). Backend đã triển khai 3 API báo cáo doanh thu và tổng hợp tài chính (`GET /api/v1/analytics/revenue`, `GET /api/v1/analytics/financial-summary`, `GET /api/v1/analytics/revenue-details`). Giao diện quản trị nằm trong `frontend/src/features/admin/`.
Contract ở [api-contract.md](api-contract.md); chính sách nghiệp vụ tại [v1-decisions.md](v1-decisions.md).

## 1. Người dùng và quyền

- Các màn hình quản trị/báo cáo dành cho tài khoản `STAFF` hoặc `MANAGER` đang `ACTIVE`; `CUSTOMER` không có quyền truy cập.
- `nhan_vien` trong tài liệu cũ là cách gọi giao diện, không phải giá trị role. Backend chỉ dùng enum `CUSTOMER`, `STAFF`, `MANAGER` như contract/database.
- Quyền được kiểm tra **ở Backend** (khách gọi API báo cáo nhận lỗi `403 FORBIDDEN`), không chỉ ẩn menu trên giao diện.

## 2. Danh sách màn hình

| # | Màn hình | Mục đích | Dữ liệu chính | Truy vấn / API dự kiến |
| --- | --- | --- | --- | --- |
| M1 | **Báo cáo doanh thu** | Theo dõi doanh thu theo tháng và mẫu xe | Doanh thu theo tháng × mẫu xe, lũy kế, tỷ trọng; chi tiết giao dịch và tổng hợp tài chính | `/api/v1/analytics/revenue`, `/api/v1/analytics/financial-summary`, `/api/v1/analytics/revenue-details` |
| M4 | Xe và trạm | Tra cứu xe, điều chuyển xe, ngừng hoạt động xe | Danh sách xe có lọc theo trạm, trạng thái, mã xe; phân trang | `GET /api/v1/vehicles`, `POST /api/v1/vehicles/{id}/move`, `POST /api/v1/vehicles/{id}/status` |
| M5 | Bảng giá | Xem lịch sử giá, áp dụng giá mới | Các phiên bản giá theo từng xe, gồm giá 30 phút đầu, giá phút thêm và cọc | `GET/POST /api/v1/prices` |

Màn hình Báo hỏng và Bảo trì thuộc luồng nghiệp vụ báo hỏng – bảo trì; giao diện quản trị của hai màn hình này được xây dựng sau khi API của luồng đó hoàn thành.

## 3. Đặc tả Báo cáo doanh thu

**Câu hỏi nghiệp vụ trả lời được:** doanh thu từng tháng bao nhiêu, mẫu xe nào đóng góp nhiều nhất và xu hướng tăng hay giảm.

**Quy tắc tính:** tách hai tập loại trừ nhau:

- Chuyến thường: giữ quy ước COMPLETED + hóa đơn PAID, theo actual_end_time.
- Hồ sơ sự cố: ghi doanh thu khi khoản tiền thuê quyết toán SUCCESS, theo
  thời điểm quyết toán tiền thuê, kể cả chưa CLOSED_INCIDENT. Đóng hồ sơ
  sau đó không tạo doanh thu lần nữa.

Tiền thuê đã thu gồm cọc cấn vào thuê và phần thu thêm; không chỉ cộng tiền
mới trừ ví. Không cộng topup, cọc còn giữ, bồi thường hoặc hoàn bồi thường.
Các khoản này có thống kê riêng, không trừ hoàn bồi thường khỏi doanh thu thuê.
Không nhân bản số tiền khi JOIN nhiều transaction/attachment/audit.

UI/API phải ghi rõ hai cơ sở thời gian; chưa có quyết định đổi toàn bộ báo
cáo thường sang settled_at. Không ghi giả actual_end_time/RETURN cho sự cố.
Mẫu xe lấy vehicle_model_snapshot, không lấy mẫu xe hiện tại.

**Bộ lọc:** từ ngày – đến ngày.

**Phần 1 – Biểu đồ cột chồng theo tháng (Q4)**

- Trục ngang: tháng. Mỗi cột chia theo mẫu xe thực sự có trong snapshot; màu cố định theo mẫu xe, không hard-code ba loại. Có chú giải và tổng trên đỉnh cột.
- Di chuột vào đoạn: tháng, mẫu xe, doanh thu, số chuyến, tỷ trọng.

**Phần 2 – Bảng chi tiết (Q4):** tháng, mẫu xe, số chuyến, doanh thu, **lũy kế** theo mẫu xe, **tỷ trọng** trong tháng. Q4 dùng hàm cửa sổ `SUM() OVER (PARTITION BY …)`.


**Điều kiện hoàn thành**

- [ ] Tháng doanh thu > 0: tổng tỷ trọng mẫu xe bằng 100% (sai số làm tròn ≤ 0,5); tháng tổng 0: tỷ trọng 0, không chia 0.
- [ ] Lũy kế tháng cuối bằng tổng doanh thu của mẫu xe đó trong cả khoảng.
- [ ] Biểu đồ luôn có bảng số liệu đi kèm (người mù màu vẫn đọc được).
- [ ] Tiền thuê sự cố quyết toán tháng A, đóng hồ sơ tháng B chỉ được tính một lần ở tháng A; thu hồi/hoàn bồi thường tháng C không sửa doanh thu thuê đó.
## 4. Quy ước giao diện chung

- Mọi màn hình có 3 trạng thái: **đang tải**, **rỗng** (kèm hướng dẫn việc tiếp theo), **lỗi** (kèm nút tải lại).
- Tiền hiển thị dạng `1.234.000đ`; ngày giờ theo múi giờ Việt Nam.
- Bộ lọc khoảng ngày đặt cùng một hàng phía trên biểu đồ doanh thu.
- Dùng được trên màn hình 1280px và điện thoại 390px (bảng cuộn ngang khi hẹp).

## 5. Các quyết định đã thống nhất

1. Role quản trị là `STAFF`/`MANAGER`; `nhan_vien` chỉ là nhãn tiếng Việt, không phải role wire/DB.
2. Bảng giá là theo từng xe, lịch sử append-only; `model` là mẫu xe duy nhất, doanh thu nhóm theo `vehicle_model_snapshot` đã lưu ở rental, không dùng mẫu xe hiện tại để viết lại lịch sử.
3. Thay đổi chính sách giá hiện tại: 10.000đ cho 30 phút đầu, 350đ/phút thêm; seed chỉ dành cho dữ liệu demo. Xe chỉ được đặt/pickup khi pin từ 30% trở lên.
4. Thiếu số dư trả `409 INSUFFICIENT_BALANCE`, không dùng HTTP 402. Ngưỡng đặt xe phụ thuộc `deposit_amount_snapshot + first_30_minutes_price_snapshot`, không phải một con số cố định 20.000đ.
5. Bảng giá, bảo trì (hỗ trợ `incident_id`), file upload/download cục bộ, danh sách kiểm tra 24 giờ (`/rental-check-ins`), hồ sơ sự cố thu gọn (`rental_incidents` với bồi thường ngoài hệ thống) và 3 API báo cáo doanh thu/tài chính đã có code trong backend.

## 6. Màn hình kiểm tra 24 giờ và hồ sơ sự cố (theo phạm vi thu gọn 13/11/2026)

- **Danh sách cần kiểm tra (`GET/POST /api/v1/rental-check-ins`):** Hiển thị các chuyến `IN_RENT` đến lịch kiểm tra (`>= 24h` từ `actual_start_time` hoặc đến mốc `next_check_at`) và chưa có hồ sơ sự cố đang mở. Nhân viên ghi kết quả `CONTINUE_RENTAL` (đặt `next_check_at`), `NO_ANSWER` (đặt lịch thử lại `next_check_at`), hoặc `ESCALATE` (tạo ticket + mở hồ sơ sự cố nguyên tử).
- **Hồ sơ sự cố (`/api/v1/rental-incidents`):** Hiển thị báo cáo hợp lệ server nhận, bằng chứng (`evidence-tickets`), kết luận `MANAGER` duyệt (`FALSE_ALARM`, `LOSS_THEFT`, `ABANDONMENT`), mốc dừng cước (`billing_cutoff_at`), thu hồi thực địa (`recovery`), tiếp nhận về trạm kèm đánh giá ban đầu (`arrival` + `condition`), giải phóng xe (`release-vehicle`) và quyết toán.
- **Tài chính sự cố & bồi thường ngoài hệ thống:** Tiền thuê (`settle-rent`) và hoàn cọc dư (`deposit/refund`) tách biệt hoàn toàn với bồi thường ngoài hệ thống (`POST /compensation/external-settlement`). `compensation_assessed_amount = null` hiển thị là chưa xác định; `0.00` (`NOT_REQUIRED`) là xác nhận không phải bồi thường; `> 0` (`AGREED` / `AUTHORITY_DECISION`) hiển thị kèm thông tin thanh toán ngoài hệ thống.
- **Tách công nợ khách và quyền sử dụng xe:** `MANAGER` chỉ giải phóng xe (`release-vehicle`) sau khi phiếu bảo trì gắn `incident_id` hoàn tất (`COMPLETED`); không đóng nợ giả để mở xe.
- **Giới hạn sau khi kết thúc chuyến:** Chuyến `COMPLETED` nhận phản ánh mới chỉ tạo ticket/bằng chứng, không mở hồ sơ tài chính sự cố mới. Chuyến `CLOSED_INCIDENT` tìm lại xe sau khi đóng vẫn ghi nhận `recovery`/`arrival` trên hồ sơ cũ mà không mở lại `rental`.
- **GPS demo:** Hiển thị nhãn mô phỏng, thời điểm cập nhật và cảnh báo dữ liệu cũ (`is_stale`); mất tín hiệu hoặc không liên lạc được không tự kết luận gian lận.
