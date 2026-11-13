# Đặc tả màn hình quản trị và 2 báo cáo

Tài liệu mô tả các màn hình dành cho nhân viên vận hành của hệ thống EVRide: mỗi màn hình hiển thị dữ liệu gì, lấy từ truy vấn nào, lọc ra sao và điều kiện để coi là hoàn thành. Đây là căn cứ để xây dựng API báo cáo, giao diện quản trị và kiểm thử phần thống kê.

API báo cáo thuộc `/api/v1/analytics/…` (`backend/app/api/v1/analytics.py`). Hiện tại backend đã triển khai 3 API báo cáo doanh thu và tổng hợp tài chính (`GET /api/v1/analytics/revenue`, `GET /api/v1/analytics/financial-summary`, `GET /api/v1/analytics/revenue-details`); 5 API thống kê vận hành còn lại (`overview`, `peak-hours`, `top-routes`, `idle-time`, `inactive-customers`) là đặc tả dự kiến. Giao diện quản trị dự kiến trong `frontend/src/features/admin/`.
Contract ở [api-contract.md](api-contract.md); chính sách nghiệp vụ tại [v1-decisions.md](v1-decisions.md).

## 1. Người dùng và quyền

- Các màn hình quản trị/báo cáo dành cho tài khoản `STAFF` hoặc `MANAGER` đang `ACTIVE`; `CUSTOMER` không có quyền truy cập.
- `nhan_vien` trong tài liệu cũ là cách gọi giao diện, không phải giá trị role. Backend chỉ dùng enum `CUSTOMER`, `STAFF`, `MANAGER` như contract/database.
- Quyền được kiểm tra **ở Backend** (khách gọi API báo cáo nhận lỗi `403 FORBIDDEN`), không chỉ ẩn menu trên giao diện.

## 2. Danh sách màn hình

| # | Màn hình | Mục đích | Dữ liệu chính | Truy vấn / API dự kiến |
| --- | --- | --- | --- | --- |
| M1 | Tổng quan | Nhìn nhanh tình hình vận hành | Số chuyến, doanh thu, phút trung bình, số khách, số xe theo trạng thái; 5 báo hỏng mới; trạm sắp đầy | `GET /api/v1/analytics/overview`, view `v_tinh_trang_tram` |
| M2 | **Báo cáo 1 – Mức sử dụng trạm** | Biết trạm nào đông vào giờ nào, trạm nào thừa xe | Lượt thuê theo trạm × giờ; thời gian xe nằm chờ trung bình theo trạm | **Q3** (`/api/v1/analytics/peak-hours`), Q8 (`/api/v1/analytics/idle-time`) |
| M3 | **Báo cáo 2 – Doanh thu** | Theo dõi doanh thu theo tháng và mẫu xe | Doanh thu theo tháng × mẫu xe, lũy kế, tỷ trọng; top 3 tuyến mỗi tháng | **Q4** (`/api/v1/analytics/revenue`), Q5 (`/api/v1/analytics/top-routes`) |
| M4 | Xe và trạm | Tra cứu xe, điều chuyển xe, ngừng hoạt động xe | Danh sách xe có lọc theo trạm, trạng thái, mã xe; phân trang | `GET /api/v1/vehicles`, `POST /api/v1/vehicles/{id}/move`, `POST /api/v1/vehicles/{id}/status` |
| M5 | Bảng giá | Xem lịch sử giá, áp dụng giá mới | Các phiên bản giá theo từng xe, gồm giá 30 phút đầu, giá phút thêm và cọc | `GET/POST /api/v1/prices` |
| M6 | Khách lâu không đi | Chăm sóc khách còn tiền trong ví nhưng không đi xe | Khách không có chuyến trong N ngày, sắp theo số dư | **Q6** (`/api/v1/analytics/inactive-customers`) |

Màn hình Báo hỏng và Bảo trì thuộc luồng nghiệp vụ báo hỏng – bảo trì; giao diện quản trị của hai màn hình này được xây dựng sau khi API của luồng đó hoàn thành.

## 3. Đặc tả Báo cáo 1 – Mức sử dụng trạm (M2)

**Câu hỏi nghiệp vụ trả lời được:** giờ cao điểm của từng trạm là giờ nào; trạm nào xe nằm chờ lâu (thừa xe, nên điều chuyển đi).

**Bộ lọc:** từ ngày – đến ngày. Mặc định là toàn bộ khoảng có dữ liệu.

**Phần 1 – Bản đồ nhiệt lượt thuê (Q3)**

- Hàng: tối đa 20 trạm đông nhất (có thể lọc một trạm). Cột: 24 giờ trong ngày, giờ Việt Nam.
- Ô càng đậm càng nhiều lượt thuê; một thang màu duy nhất, nhạt → đậm; có chú giải.
- Di chuột vào ô: hiện tên trạm, khung giờ, số lượt.
- Q3 cần trả về theo envelope API: `station_id, station_name, hour (0–23), rental_count`, lọc theo `actual_start_time` trong khoảng ngày; top 20 sắp theo lượt giảm dần, hòa lượt thì `station_id` tăng dần. Tổng lượt có thể gồm nhiều hơn 20 trạm nên API tách `filtered_trip_count` và `included_trip_count`.

**Phần 2 – Thời gian xe nằm chờ (Q8)**

- Thanh ngang theo trạm, sắp giảm dần, hiển thị 15 trạm; nhãn số phút ở cuối thanh.

**Điều kiện hoàn thành**

- [ ] Tổng lượt hiển thị trên heatmap bằng `included_trip_count`; `filtered_trip_count` được đối chiếu bằng `COUNT(*)` độc lập trước khi giới hạn top 20.
- [ ] Đổi khoảng ngày thì cả hai phần cập nhật.
- [ ] Khoảng ngày không có chuyến: hiện "Không có chuyến nào trong khoảng ngày này", không vỡ giao diện.
- [ ] Ngày kết thúc trước ngày bắt đầu: API trả lỗi 400, giao diện hiện thông báo.

## 4. Đặc tả Báo cáo 2 – Doanh thu (M3)

**Câu hỏi nghiệp vụ trả lời được:** doanh thu từng tháng bao nhiêu, mẫu xe nào đóng góp nhiều nhất, xu hướng tăng hay giảm, tuyến nào phổ biến.

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

**Phần 3 – Top 3 tuyến mỗi tháng (Q5):** tháng, hạng, trạm đi, trạm đến, số chuyến; các tuyến bằng số chuyến cùng hạng (`RANK`).

**Điều kiện hoàn thành**

- [ ] Tháng doanh thu > 0: tổng tỷ trọng mẫu xe bằng 100% (sai số làm tròn ≤ 0,5); tháng tổng 0: tỷ trọng 0, không chia 0.
- [ ] Lũy kế tháng cuối bằng tổng doanh thu của mẫu xe đó trong cả khoảng.
- [ ] Biểu đồ luôn có bảng số liệu đi kèm (người mù màu vẫn đọc được).
- [ ] Tiền thuê sự cố quyết toán tháng A, đóng hồ sơ tháng B chỉ được tính một lần ở tháng A; thu hồi/hoàn bồi thường tháng C không sửa doanh thu thuê đó.
- [ ] Top tuyến và thời gian chuyến hoàn tất thường không tự kéo CLOSED_INCIDENT vào hoặc dựng trạm trả/thời điểm kết thúc giả.

## 5. Đặc tả Q6 – Khách lâu không đi (M6)

- Đầu vào: số ngày N (14 / 30 / 60 / 90), mốc ngày (mặc định ngày có chuyến mới nhất trong dữ liệu), trang, kích thước trang.
- Điều kiện: `CUSTOMER` `ACTIVE`, `balance > 0`, **không tồn tại** chuyến có `actual_start_time` trong N ngày trước mốc → dùng `NOT EXISTS`.
- Kết quả theo contract: `user_id`, `name`, `email`, `balance`; sắp `balance DESC, user_id ASC`; phân trang.
- Kiểm tra: mỗi khách trả về, đếm lại số chuyến trong N ngày phải bằng 0.

## 6. Quy ước giao diện chung

- Mọi màn hình có 3 trạng thái: **đang tải**, **rỗng** (kèm hướng dẫn việc tiếp theo), **lỗi** (kèm nút tải lại).
- Tiền hiển thị dạng `1.234.000đ`; ngày giờ theo múi giờ Việt Nam.
- Bộ lọc khoảng ngày đặt cùng một hàng phía trên biểu đồ, dùng chung cho các báo cáo.
- Dùng được trên màn hình 1280px và điện thoại 390px (bảng cuộn ngang khi hẹp).

## 7. Các quyết định đã thống nhất

1. Heatmap hiển thị tối đa 20 trạm đông nhất; có thể lọc riêng một trạm. Bộ lọc và thứ tự được định nghĩa trong API contract.
2. Role quản trị là `STAFF`/`MANAGER`; `nhan_vien` chỉ là nhãn tiếng Việt, không phải role wire/DB.
3. Bảng giá là theo từng xe, lịch sử append-only; `model` là mẫu xe duy nhất, doanh thu nhóm theo `vehicle_model_snapshot` đã lưu ở rental, không dùng mẫu xe hiện tại để viết lại lịch sử.
4. Thay đổi chính sách giá hiện tại: 10.000đ cho 30 phút đầu, 350đ/phút thêm; seed chỉ dành cho dữ liệu demo. Xe chỉ được đặt/pickup khi pin từ 30% trở lên.
5. Thiếu số dư trả `409 INSUFFICIENT_BALANCE`, không dùng HTTP 402. Ngưỡng đặt xe phụ thuộc `deposit_amount_snapshot + first_30_minutes_price_snapshot`, không phải một con số cố định 20.000đ.
6. Bảng giá, bảo trì (hỗ trợ `incident_id`), file upload/download cục bộ, danh sách kiểm tra 24 giờ (`/rental-check-ins`), hồ sơ sự cố thu gọn (`rental_incidents` với bồi thường ngoài hệ thống) và 3 API báo cáo doanh thu/tài chính đã có code trong backend.

## 8. Màn hình kiểm tra 24 giờ và hồ sơ sự cố (theo phạm vi thu gọn 13/11/2026)

- **Danh sách cần kiểm tra (`GET/POST /api/v1/rental-check-ins`):** Hiển thị các chuyến `IN_RENT` đến lịch kiểm tra (`>= 24h` từ `actual_start_time` hoặc đến mốc `next_check_at`) và chưa có hồ sơ sự cố đang mở. Nhân viên ghi kết quả `CONTINUE_RENTAL` (đặt `next_check_at`), `NO_ANSWER` (đặt lịch thử lại `next_check_at`), hoặc `ESCALATE` (tạo ticket + mở hồ sơ sự cố nguyên tử).
- **Hồ sơ sự cố (`/api/v1/rental-incidents`):** Hiển thị báo cáo hợp lệ server nhận, bằng chứng (`evidence-tickets`), kết luận `MANAGER` duyệt (`FALSE_ALARM`, `LOSS_THEFT`, `ABANDONMENT`), mốc dừng cước (`billing_cutoff_at`), thu hồi thực địa (`recovery`), tiếp nhận về trạm kèm đánh giá ban đầu (`arrival` + `condition`), giải phóng xe (`release-vehicle`) và quyết toán.
- **Tài chính sự cố & bồi thường ngoài hệ thống:** Tiền thuê (`settle-rent`) và hoàn cọc dư (`deposit/refund`) tách biệt hoàn toàn với bồi thường ngoài hệ thống (`POST /compensation/external-settlement`). `compensation_assessed_amount = null` hiển thị là chưa xác định; `0.00` (`NOT_REQUIRED`) là xác nhận không phải bồi thường; `> 0` (`AGREED` / `AUTHORITY_DECISION`) hiển thị kèm thông tin thanh toán ngoài hệ thống.
- **Tách công nợ khách và quyền sử dụng xe:** `MANAGER` chỉ giải phóng xe (`release-vehicle`) sau khi phiếu bảo trì gắn `incident_id` hoàn tất (`COMPLETED`); không đóng nợ giả để mở xe.
- **Giới hạn sau khi kết thúc chuyến:** Chuyến `COMPLETED` nhận phản ánh mới chỉ tạo ticket/bằng chứng, không mở hồ sơ tài chính sự cố mới. Chuyến `CLOSED_INCIDENT` tìm lại xe sau khi đóng vẫn ghi nhận `recovery`/`arrival` trên hồ sơ cũ mà không mở lại `rental`.
- **GPS demo:** Hiển thị nhãn mô phỏng, thời điểm cập nhật và cảnh báo dữ liệu cũ (`is_stale`); mất tín hiệu hoặc không liên lạc được không tự kết luận gian lận.
