# Đặc tả màn hình quản trị và 2 báo cáo

Tài liệu mô tả các màn hình dành cho nhân viên vận hành của hệ thống EVRide: mỗi màn hình hiển thị dữ liệu gì, lấy từ truy vấn nào, lọc ra sao và điều kiện để coi là hoàn thành. Đây là căn cứ để xây dựng API báo cáo, giao diện quản trị và kiểm thử phần thống kê.

Đường dẫn API theo quy ước của dự án (`/api/v1/…`, module `analytics` trong `backend/app/modules/`); giao diện đặt trong `frontend/src/features/admin/`. Đường dẫn cụ thể được chốt trong `docs/api.md` khi xây dựng API.

## 1. Người dùng và quyền

- Chỉ tài khoản vai trò `nhan_vien` truy cập được các màn hình dưới đây.
- Quyền được kiểm tra **ở Backend** (khách gọi API báo cáo nhận lỗi 403), không chỉ ẩn menu trên giao diện.

## 2. Danh sách màn hình

| # | Màn hình | Mục đích | Dữ liệu chính | Truy vấn / API dự kiến |
| --- | --- | --- | --- | --- |
| M1 | Tổng quan | Nhìn nhanh tình hình vận hành | Số chuyến, doanh thu, phút trung bình, số khách, số xe theo trạng thái; 5 báo hỏng mới; trạm sắp đầy | `GET /api/v1/analytics/overview`, view `v_tinh_trang_tram` |
| M2 | **Báo cáo 1 – Mức sử dụng trạm** | Biết trạm nào đông vào giờ nào, trạm nào thừa xe | Lượt thuê theo trạm × giờ; thời gian xe nằm chờ trung bình theo trạm | **Q3** (`/api/v1/analytics/peak-hours`), Q8 (`/api/v1/analytics/idle-time`) |
| M3 | **Báo cáo 2 – Doanh thu** | Theo dõi doanh thu theo tháng và loại xe | Doanh thu theo tháng × loại xe, lũy kế, tỷ trọng; top 3 tuyến mỗi tháng | **Q4** (`/api/v1/analytics/revenue`), Q5 (`/api/v1/analytics/top-routes`) |
| M4 | Xe và trạm | Tra cứu xe, điều chuyển xe, ngừng hoạt động xe | Danh sách xe có lọc theo trạm, trạng thái, mã xe; phân trang | `GET /api/v1/vehicles`, `POST /api/v1/vehicles/{id}/move`, `POST /api/v1/vehicles/{id}/status` |
| M5 | Bảng giá | Xem lịch sử giá, áp dụng giá mới | Các phiên bản giá theo loại xe | `GET/POST /api/v1/prices` |
| M6 | Khách lâu không đi | Chăm sóc khách còn tiền trong ví nhưng không đi xe | Khách không có chuyến trong N ngày, sắp theo số dư | **Q6** (`/api/v1/analytics/inactive-customers`) |

Màn hình Báo hỏng và Bảo trì thuộc luồng nghiệp vụ báo hỏng – bảo trì; giao diện quản trị của hai màn hình này được xây dựng sau khi API của luồng đó hoàn thành.

## 3. Đặc tả Báo cáo 1 – Mức sử dụng trạm (M2)

**Câu hỏi nghiệp vụ trả lời được:** giờ cao điểm của từng trạm là giờ nào; trạm nào xe nằm chờ lâu (thừa xe, nên điều chuyển đi).

**Bộ lọc:** từ ngày – đến ngày. Mặc định là toàn bộ khoảng có dữ liệu.

**Phần 1 – Bản đồ nhiệt lượt thuê (Q3)**

- Hàng: trạm (hiển thị 20 trạm đông nhất). Cột: 24 giờ trong ngày, giờ Việt Nam.
- Ô càng đậm càng nhiều lượt thuê; một thang màu duy nhất, nhạt → đậm; có chú giải.
- Di chuột vào ô: hiện tên trạm, khung giờ, số lượt.
- Q3 cần trả về: `tram_id, ten_tram, gio (0–23), so_luot_thue`, lọc theo `bat_dau` trong khoảng ngày.

**Phần 2 – Thời gian xe nằm chờ (Q8)**

- Thanh ngang theo trạm, sắp giảm dần, hiển thị 15 trạm; nhãn số phút ở cuối thanh.

**Điều kiện hoàn thành**

- [ ] Tổng số lượt trên bản đồ nhiệt bằng số chuyến trong khoảng ngày (đối chiếu bằng một câu `COUNT(*)` độc lập).
- [ ] Đổi khoảng ngày thì cả hai phần cập nhật.
- [ ] Khoảng ngày không có chuyến: hiện "Không có chuyến nào trong khoảng ngày này", không vỡ giao diện.
- [ ] Ngày kết thúc trước ngày bắt đầu: API trả lỗi 400, giao diện hiện thông báo.

## 4. Đặc tả Báo cáo 2 – Doanh thu (M3)

**Câu hỏi nghiệp vụ trả lời được:** doanh thu từng tháng bao nhiêu, loại xe nào đóng góp nhiều nhất, xu hướng tăng hay giảm, tuyến nào phổ biến.

**Quy tắc tính:** chỉ cộng chuyến `hoan_thanh`; chuyến kết thúc do sự cố đã được hoàn tiền nên không tính.

**Bộ lọc:** từ ngày – đến ngày.

**Phần 1 – Biểu đồ cột chồng theo tháng (Q4)**

- Trục ngang: tháng. Mỗi cột chia 3 đoạn theo loại xe, **màu cố định theo loại xe** (không đổi khi lọc). Có chú giải; tổng doanh thu ghi trên đỉnh cột.
- Di chuột vào đoạn: tháng, loại xe, doanh thu, số chuyến, tỷ trọng.

**Phần 2 – Bảng chi tiết (Q4):** tháng, loại xe, số chuyến, doanh thu, **lũy kế** theo loại xe, **tỷ trọng** trong tháng. Q4 dùng hàm cửa sổ `SUM() OVER (PARTITION BY …)`.

**Phần 3 – Top 3 tuyến mỗi tháng (Q5):** tháng, hạng, trạm đi, trạm đến, số chuyến; các tuyến bằng số chuyến cùng hạng (`RANK`).

**Điều kiện hoàn thành**

- [ ] Tổng tỷ trọng các loại xe trong mỗi tháng bằng 100% (sai số làm tròn ≤ 0,5).
- [ ] Lũy kế tháng cuối bằng tổng doanh thu của loại xe đó trong cả khoảng.
- [ ] Biểu đồ luôn có bảng số liệu đi kèm (người mù màu vẫn đọc được).

## 5. Đặc tả Q6 – Khách lâu không đi (M6)

- Đầu vào: số ngày N (14 / 30 / 60 / 90), mốc ngày (mặc định ngày có chuyến mới nhất trong dữ liệu), trang, kích thước trang.
- Điều kiện: khách `hoat_dong`, số dư > 0, **không tồn tại** chuyến nào có `bat_dau` trong N ngày trước mốc → dùng `NOT EXISTS`.
- Kết quả: mã khách, họ tên, email, số dư; sắp số dư giảm dần; phân trang.
- Kiểm tra: mỗi khách trả về, đếm lại số chuyến trong N ngày phải bằng 0.

## 6. Quy ước giao diện chung

- Mọi màn hình có 3 trạng thái: **đang tải**, **rỗng** (kèm hướng dẫn việc tiếp theo), **lỗi** (kèm nút tải lại).
- Tiền hiển thị dạng `1.234.000đ`; ngày giờ theo múi giờ Việt Nam.
- Bộ lọc khoảng ngày đặt cùng một hàng phía trên biểu đồ, dùng chung cho các báo cáo.
- Dùng được trên màn hình 1280px và điện thoại 390px (bảng cuộn ngang khi hẹp).

## 7. Vấn đề cần thống nhất

1. Số trạm hiển thị trên bản đồ nhiệt: 20 trạm đông nhất có đủ không, hay cho phép chọn trạm?
2. Báo cáo doanh thu có cần xuất file (CSV) không?
3. `docs/requirements.md` hiện có chức năng **đặt xe trước và hủy** (module `bookings`), trong khi phạm vi đăng ký gồm 3 luồng thuê xe – trả xe – báo hỏng. Cần thống nhất có làm đặt xe trước hay không, vì ảnh hưởng tới số liệu của 2 báo cáo.