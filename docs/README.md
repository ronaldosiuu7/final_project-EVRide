# Tài liệu dự án EVRide

Bộ tài liệu kỹ thuật và nghiệp vụ của hệ thống cho thuê xe máy điện theo trạm **EVRide V1**:

| Tài liệu | Vai trò chính |
| --- | --- |
| [Phạm vi chức năng (`requirements.md`)](requirements.md) | Tóm tắt chức năng theo vai trò (`CUSTOMER`, `STAFF`, `MANAGER`) và giới hạn phạm vi V1. |
| [Sổ quyết định V1 (`v1-decisions.md`)](v1-decisions.md) | Nguồn chính sách nghiệp vụ và cấu hình dùng chung (đồng thời là nguồn dữ liệu runtime `decisions` cho API `/api/v1/faq`). |
| [Kiến trúc hệ thống (`architecture.md`)](architecture.md) | Các thành phần hệ thống, bất biến giao dịch, thứ tự khóa (`Global Lock Order`), ranh giới xử lý sự cố và phiên đăng nhập. |
| [API bàn giao Frontend (`api.md`)](api.md) | Tra cứu ngắn các endpoint đã có, quyền truy cập, dữ liệu chính và thứ tự gọi API. |
| [Hợp đồng API (`api-contract.md`)](api-contract.md) | Hợp đồng chi tiết và các đặc tả mở rộng; đồng thời là nguồn runtime `contract` cho API `/api/v1/faq`. Xem `api.md` để tra nhanh endpoint hiện hành. |
| [Thiết kế CSDL (`database.md`)](database.md) | Định nghĩa 27 bảng ORM PostgreSQL, partial unique indexes, ràng buộc toàn vẹn và lịch sử Alembic migration (tới `f4c2a1b8e901`). |
| [Sơ đồ ERD (`ER_diagram.pdf`)](ER_diagram.pdf) | Sơ đồ thực thể – liên kết phục vụ báo cáo đồ án (bản thiết kế các bảng cốt lõi ban đầu; xem chi tiết đầy đủ 27 bảng tại `database.md`). |
| [Đặc tả quản trị & báo cáo (`dac_ta_quan_tri_bao_cao.md`)](dac_ta_quan_tri_bao_cao.md) | Đặc tả các màn hình vận hành và báo cáo thống kê (phân biệt 3 API báo cáo doanh thu/tài chính đã triển khai và các truy vấn mở rộng). |
| [Kế hoạch kiểm thử (`ke_hoach_kiem_thu.md`)](ke_hoach_kiem_thu.md) | Phạm vi kiểm thử, bộ test tự động (`pytest` trong `backend/tests/`) và ma trận ca kiểm thử nghiệp vụ. |
| [Kế hoạch hạ tầng (`ke_hoach_ha_tang.md`)](ke_hoach_ha_tang.md) | Mô hình triển khai 3 máy ảo (Demo nội bộ trên VirtualBox và Production trên Azure; xem hướng dẫn lệnh chi tiết tại [deploy/README.md](../deploy/README.md)). |

## Hướng dẫn theo phân hệ mã nguồn

- **Tổng quan & cấu trúc repo:** [../README.md](../README.md)
- **Cài đặt, chạy server, migration, seed & test Backend:** [../backend/README.md](../backend/README.md)
- **Quản lý migration, dữ liệu mẫu & truy vấn DB:** [../backend/database/README.md](../backend/database/README.md)
- **Frontend:** [../frontend/README.md](../frontend/README.md)
- **Đóng gói Docker, Nginx, TLS & vận hành 3 VM:** [../deploy/README.md](../deploy/README.md)
- **Nhật ký sử dụng AI:** [../AI_USAGE.md](../AI_USAGE.md)
