# EVRide V1 — Sổ quyết định và cấu hình dùng chung

Tài liệu này tổng hợp các quy tắc và đề xuất trong [hợp đồng API](./api-contract.md) để backend, frontend, database và kiểm thử cùng tham chiếu. Đây là bản ghi trạng thái, không tự phê duyệt thay cho nhóm.

- **Nguồn:** `docs/api-contract.md`, soạn ngày 21/10/2026.
- **Người duyệt:** `Nguyễn Đức Anh` , duyệt ngày 1/11/2026.
- **Nguyên tắc:** Không suy đoán giá thuê, cọc, ngưỡng điều kiện hoặc chính sách chưa có. API phụ thuộc chính sách chưa cấu hình phải trả `503 POLICY_NOT_CONFIGURED`, không âm thầm dùng số 0 hay giá mặc định.

## 1. Giá trị đã nêu trong hợp đồng

Các giá trị này là quy ước/đề xuất có trong hợp đồng API, không phải bằng chứng rằng một người cụ thể đã duyệt.

| Cấu hình/quy tắc | Giá trị trong hợp đồng | Ghi chú |
| --- | --- | --- |
| Thời gian giữ xe | 30 phút (`expires_at = created_at + 30 phút`) | Quy tắc nghiệp vụ đã chốt trong hợp đồng; không gia hạn. Hết hạn phải đặt lượt mới. |
| Thời hạn access token | 1.800 giây (30 phút) | Đề xuất kỹ thuật; V1 chưa có refresh token/logout phía server. |
| Hiệu lực báo giá | 120 giây | Đề xuất; quote gắn với chuyến, trạm, khuyến mãi, phiên bản chính sách và tổng tiền. |
| Phân trang | `page = 1`, `page_size = 20`, tối đa 100 | Giá trị mặc định/giới hạn theo hợp đồng. |
| Đơn vị tiền | VND; chuỗi số thập phân không âm, tối đa 2 chữ số lẻ | Không dùng float để tính tiền. Quy tắc làm tròn theo chính sách giá/khuyến mãi vẫn cần duyệt. |
| Khuyến mãi phần trăm | Số nguyên 1–100; mỗi lượt tối đa một mã | Là đề xuất. Giảm trên tiền thuê, không giảm cọc/phí sự cố; giới hạn mức giảm tối đa nếu có và không vượt tiền thuê. |
| Mã khuyến mãi | Viết hoa, tối đa 50 ký tự, duy nhất | Đề xuất; thời gian hiệu lực `start_date <= thời điểm thanh toán < end_date`. |
| Ghi GPS demo | Dữ liệu không được trước lúc nhận xe hoặc quá giờ server hơn 30 giây | Chỉ demo; endpoint phải tắt khi chạy thật nếu chưa có tích hợp thiết bị được duyệt. |
| Dữ liệu GPS cũ | Cảnh báo stale sau 60 giây | Đề xuất; giao diện cần hiển thị thời điểm cập nhật. |
| Thanh toán demo | Chỉ bật rõ ràng qua `DEMO_PAYMENTS_ENABLED` | Chưa có giá trị mặc định quy định trong hợp đồng. Không dùng luồng demo để nhận tiền thật. |

## 2. Quyết định còn chờ nhóm xác nhận

Mỗi dòng chỉ được chuyển sang **Đã duyệt** sau khi ghi rõ giá trị cuối cùng, người duyệt và ngày duyệt. Hiện tại người duyệt chưa được nêu trong nguồn.

| Hạng mục | Trạng thái hiện tại / giá trị cần chốt | Người duyệt |
| --- | --- | --- |
| Cách tính giá thuê | DBML có `daily_price`; chưa rõ tính theo ngày lịch hay mỗi 24 giờ, đơn vị làm tròn thời lượng, mức tối thiểu và quy tắc làm tròn tiền. | Chưa xác định |
| Bảng giá | `daily_price` được lưu theo xe; chưa có lịch sử giá. Cần xác định giá áp dụng được snapshot thế nào khi giá xe thay đổi. | Chưa xác định |
| Tiền cọc | DBML có `deposit_amount`; chưa chốt thu lúc giữ xe hay nhận xe, cách cấn trừ/hoàn cọc, hoặc xử lý hủy/hết hạn. | Chưa xác định |
| Điều kiện khách | Chưa chốt loại giấy tờ nào là bắt buộc và cách đánh giá đủ điều kiện thuê. Các loại được contract hỗ trợ là `CCCD`, `PASSPORT`, `DRIVER_LICENSE`. | Chưa xác định |
| Ngưỡng pin | Chưa có ngưỡng pin tối thiểu để hiển thị/cho đặt/cho nhận xe. Không tự lấy số minh họa cũ. | Chưa xác định |
| Số chuyến đang hoạt động | Chưa chốt một khách có thể có một hay nhiều lượt giữ/chuyến đồng thời. | Chưa xác định |
| Trả xe khi thiếu tiền | Demo đề xuất từ chối hoàn tất; vận hành thật cần quy trình nhận xe và xử lý công nợ. | Chưa xác định |
| Khuyến mãi | Cần chốt quy tắc làm tròn, điều kiện claim/thanh toán, `min_rental_amount` và `max_discount_amount` có bắt buộc hay không. | Chưa xác định |
| Thanh toán thật | Chưa có provider/webhook được duyệt. Top-up demo phải được nhận diện rõ là mô phỏng; không nhận tiền thật qua xác nhận do client tự gửi. | Chưa xác định |
| GPS và upload giấy tờ | GPS hiện chỉ có đề xuất demo do nhân viên nhập; kho ảnh, thiết bị và dữ liệu thật cần hợp đồng tích hợp riêng. | Chưa xác định |
| Phạm vi quyền nhân viên | Đề xuất STAFF vận hành toàn hệ thống do DBML chưa có phân công theo trạm. Cần xác nhận trước khi giới hạn hoặc cấp quyền thật. | Chưa xác định |
| Sự cố/mất xe | Ticket không tự kết thúc chuyến hay hoàn tiền; cần quy trình vận hành và tài chính riêng. | Chưa xác định |

## 3. Ví dụ tính tiền — chỉ minh họa cấu trúc quote

Contract có ví dụ quote với `elapsed_seconds = 6600`, `rental_fee = 200000.00`, giảm giá `20000.00`, `total_amount = 180000.00` và `deposit_applied = 0.00`. Các con số này **không phải giá hoặc chính sách đã duyệt**. Contract chưa định nghĩa cách suy ra `rental_fee` từ 6.600 giây hoặc từ `daily_price`.

### Ví dụ A: giảm phần trăm, không có mức trần

Giả sử để minh họa rằng tiền thuê đã được backend tính là **200.000 VND**, mã giảm **10%**, không có cọc được cấn trừ và chưa tính phí khác:

```text
Tiền thuê                 = 200.000 VND
Giảm giá                  = min(200.000 × 10%, tiền thuê) = 20.000 VND
Tổng sau giảm             = 200.000 - 20.000 = 180.000 VND
Cọc được cấn trừ          = 0 VND
Khách cần thanh toán      = 180.000 - 0 = 180.000 VND
```

Giá thuê 200.000 VND và mức giảm 10% ở đây chỉ là số giả định để minh họa phép tính; không được dùng làm cấu hình production.

### Ví dụ B: áp dụng mức giảm tối đa

Giả sử tiền thuê là **200.000 VND**, mã giảm **10%**, `max_discount_amount = 15.000 VND`, không có cọc được cấn trừ:

```text
Giảm theo phần trăm        = 200.000 × 10% = 20.000 VND
Giảm thực tế               = min(20.000, 15.000, 200.000) = 15.000 VND
Tổng sau giảm              = 200.000 - 15.000 = 185.000 VND
Khách cần thanh toán       = 185.000 VND
```

`max_discount_amount` cũng là giả định minh họa. Thứ tự cấn trừ cọc, quy tắc làm tròn, tiền tối thiểu và công thức phí theo thời lượng phải được duyệt trước khi backend triển khai. Backend là bên tính quote; client không gửi số tiền tự tính để quyết định khoản thu.

## 4. Cách cập nhật quyết định

Khi nhóm duyệt một mục, cập nhật dòng tương ứng trong mục 2 với giá trị cuối cùng, trạng thái **Đã duyệt**, tên người duyệt và ngày duyệt. Đồng thời cập nhật [hợp đồng API](./api-contract.md), DBML/migration, cấu hình backend, giao diện và test liên quan. Nếu chưa thống nhất, giữ trạng thái chờ duyệt và không triển khai bằng giá trị mặc định tự suy đoán.
