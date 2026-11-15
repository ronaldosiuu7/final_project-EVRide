# Queries

Nơi dự kiến lưu SQL tham khảo/báo cáo. Các tên dưới là ví dụ, chưa phải file có sẵn:

- `available_vehicles.sql`: xe có thể thuê theo trạm.
- `station_utilization.sql`: mức sử dụng xe theo trạm.
- `revenue_by_day.sql`: doanh thu theo ngày.

Theo chính sách sự cố ngày 12/11/2026:

- Xe rentable cần xét quyền sử dụng xe, pin, trạm và phiếu bảo trì; khách cũ còn nợ không chặn xe đã được giải phóng hợp lệ.
- Doanh thu thường: COMPLETED + PAID theo actual_end_time. Thuê sự cố: theo sự kiện quyết toán tiền thuê thành công, kể cả chưa CLOSED_INCIDENT.
- Tổng thuê gồm cọc cấn + thu thêm; không cộng cọc đang giữ, topup, bồi thường/hoàn bồi thường; đóng hồ sơ không ghi lần hai.
- Không JOIN nhiều giao dịch làm nhân bản tổng; công bố hai cơ sở thời gian thay vì âm thầm đổi lịch sử báo cáo.

Xem [đặc tả báo cáo](../../../docs/dac_ta_quan_tri_bao_cao.md) và
[hợp đồng API mục 11](../../../docs/api-contract.md).


