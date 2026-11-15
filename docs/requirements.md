# Phạm vi chức năng EVRide V1

Phương tiện cho thuê trong EVRide là xe máy điện.

Cập nhật 13/11/2026. Nguồn chính sách: [quyết định V1](v1-decisions.md).
Danh sách dưới là yêu cầu sản phẩm; backend đã triển khai các luồng thuê/trả
thường, ví demo, khuyến mãi, ticket/ảnh, bảo trì dùng chung (`incident_id`),
GPS demo, review, FAQ, danh sách kiểm tra 24 giờ (`/rental-check-ins`) và phân
hệ sự cố thu gọn với bồi thường xử lý ngoài hệ thống.



## Khách hàng

- Đăng ký, đăng nhập và cập nhật hồ sơ.
- Xem trạm, danh sách xe, mức pin và giá thuê.
- Đặt xe, xem trạng thái và hủy theo điều kiện cho phép.
- Nhận/trả xe tại trạm và xem lịch sử chuyến đi.
- Xem số dư ví, nạp tiền và xem lịch sử giao dịch.
- Báo sự cố kèm ảnh, xem tiến độ tiếp nhận/xử lý; báo cáo không tự dừng cước hoặc xác định trách nhiệm.
- Xem tiền thuê, kết quả bồi thường ngoài hệ thống đã xác nhận (`0.00` hoặc số tiền & trạng thái giải quyết), cọc đã dùng cho tiền thuê/còn giữ/đã hoàn riêng; tiền đang xác minh hiển thị tạm tính.
- Khách còn chuyến chưa giải quyết bị chặn thuê mới, vẫn được xem hồ sơ, trao đổi và nạp tiền theo điều kiện tài khoản/ví.
- Xem GPS mô phỏng, thời điểm cập nhật và cảnh báo dữ liệu cũ; không coi vị trí cũ là vị trí hiện thời.
- Chỉ đánh giá chuyến COMPLETED do mình sở hữu, mỗi chuyến một lần; CLOSED_INCIDENT không tự được coi là COMPLETED.
- FAQ trả lời ít nhất 10 câu hỏi thường gặp có nguồn; code hiện có 12 câu và nguồn tài liệu nội bộ.

## Nhân viên và quản trị

- Quản lý trạm, xe, giá thuê và tài khoản.
- Phê duyệt, xác thực thông tin khách hàng.
- Theo dõi lượt đặt xe và chuyến đi.
- Ghi nhận lỗi xe, tạo/theo dõi phiếu bảo trì và đính kèm ảnh bằng chứng.
- Xem lịch sử giá theo xe, áp dụng phiên bản giá mới; xem lịch sử điều chuyển xe.
- Xem doanh thu và thống kê sử dụng xe.
- Tiếp nhận/giải quyết ticket; tạo, bắt đầu, hoàn tất/hủy phiếu bảo trì (`/maintenance-orders`, hỗ trợ `incident_id` cho xe sự cố). Xe có phiếu `OPEN`/`IN_PROGRESS` không được thuê, hoàn tất không tự `AVAILABLE`.
- Theo dõi danh sách chuyến đến lịch kiểm tra sau 24 giờ từ pickup (`GET /rental-check-ins` chỉ đọc) và ghi kết quả kiểm tra (`CONTINUE_RENTAL`, `NO_ANSWER`, `ESCALATE` qua `POST /rental-check-ins/{rental_id}`). Không tự phạt hoặc kết luận trộm.
- MANAGER duyệt xác minh (`FALSE_ALARM`/`LOSS_THEFT`/`ABANDONMENT`), ghi nhận một bước kết quả & giải quyết bồi thường ngoài hệ thống (kèm lý do và ticket bằng chứng) và giải phóng xe sau khi phiếu bảo trì sự cố `COMPLETED`.
- Thu hồi ngoài hiện trường (`recovery`) và tiếp nhận xe về trạm kèm trạng thái ban đầu (`arrival` + `condition`); chỉ gán trạm khi thực sự về trạm và còn sức chứa.
- Xe thu hồi/kiểm tra/giải phóng hợp lệ được thuê lại dù khách cũ còn nợ. Quyết toán/đóng hồ sơ cũ không sửa xe hoặc chuyến mới.

## Quyết toán và giới hạn sự cố

- Mất/trộm xác nhận dừng cước tại thời điểm server nhận báo cáo hợp lệ được MANAGER chọn; không nhập lùi, không dùng ngưỡng 24 giờ làm mốc báo mất.
- Bỏ xe tính cước theo snapshot đến mốc thu hồi thực tế (`recovered_at`), không thêm phí thu hồi riêng trong V1.
- Tiền thuê và bồi thường tách biệt hoàn toàn: cọc trong hệ thống chỉ dùng cấn tiền thuê (`settle-rent`) và hoàn phần dư về ví (`deposit/refund`). Không trừ/cấn/hoàn bồi thường qua ví hoặc cọc nội bộ.
- Định giá tài sản, thương lượng, tranh chấp và thanh toán/hoàn trả bồi thường diễn ra **ngoài hệ thống**; backend chỉ ghi nhận kết quả xác nhận qua `POST /compensation/external-settlement` (`0.00` = xác nhận không phải bồi thường với `NOT_REQUIRED`; `> 0` bắt buộc `AGREED`/`AUTHORITY_DECISION` và thông tin thanh toán ngoài).
- Rental chỉ `CLOSED_INCIDENT` khi đã `settle-rent`, đã hoàn hết `deposit_held = 0.00`, và đã ghi nhận đầy đủ kết quả + thanh toán bồi thường ngoài hệ thống (không coi giá trị `null` là `0`). Thu hồi sau khi đóng vẫn ghi trên hồ sơ cũ, không mở lại rental; xe chưa tìm thấy vẫn `STOLEN`.
- Phản ánh mới sau `COMPLETED` chỉ ticket/bằng chứng; không thu thêm, sửa hóa đơn, mở lại rental hoặc thu hồi khuyến mãi; vẫn kiểm tra/bảo trì xe.
- Sự cố đã xác nhận không apply/consume khuyến mãi. Báo nhầm bác bỏ (`FALSE_ALARM`) và chuyến tiếp tục bình thường thì cập nhật `next_check_at` nhất quán và theo chính sách thường.
- Doanh thu thuê sự cố ghi khi quyết toán tiền thuê thành công, không chờ đóng hồ sơ và không ghi hai lần; bồi thường ngoài hệ thống/cọc đang giữ theo dõi riêng. Toàn bộ tiền ví trong hệ thống là mô phỏng.

Đối chiếu chi tiết endpoint, schema và kiến trúc tại [API contract](api-contract.md), [thiết kế database](database.md) và [kiến trúc hệ thống](architecture.md).
