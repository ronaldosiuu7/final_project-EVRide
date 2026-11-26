# Quyết định Hệ thống Thiết kế — EVRide Customer Portal Refresh

Cập nhật: **26/11/2026** · Nhánh: `codex/evride-ui-refresh` (tách từ `develop`)  
Công cụ tra cứu thiết kế: `.agents/skills/ui-ux-pro-max/SKILL.md` (`search.py` với `--design-system`, `--domain typography`, `--domain color`, `--domain ux`, `--domain icons`, `--stack react`).

---

## 1. Định hướng thẩm mỹ & Kiến trúc thông tin

- **Phong cách chủ đạo:** *Modern Urban Mobility — Minimalism & Clean Functional Grid* (`variance: 4`, `motion: 2`, `density: 5`), ưu tiên **desktop-first** (`1366×768`, `1440×900`, `1920×1080`) nhưng vẫn thích ứng mượt xuống tablet và mobile (`375px–390px`).
- **Nguyên tắc thị giác:**
  - Tổ chức nội dung theo luồng công việc thực tế của khách thuê xe máy điện (Theo dõi chuyến đang mở → Tìm nhanh trạm/xe → Quy trình 3 bước tại trạm → Danh sách trạm đang hoạt động), thay vì xếp mọi khối thành các card giống hệt nhau.
  - Không dùng emoji làm icon điều hướng/chức năng; dùng bộ icon SVG nét mảnh (`stroke-width: 1.75–2`) đồng nhất kèm `aria-hidden="true"` khi đi cùng nhãn văn bản.
  - Không thêm số liệu marketing, đánh giá sao giả, đối tác hoặc khoảng cách giả lập khi chưa có dữ liệu thật từ API.

---

## 2. Semantic Design Tokens (Mở rộng trên `.customer-shell`, tương thích `#16`)

Toàn bộ token mới được đóng gói trong phạm vi `.customer-shell` tại `src/styles/customer.css` (kế thừa và tương thích với `:root` của `src/styles/admin.css` để không ảnh hưởng 18 màn hình `/admin/*` của Issue #16 và các trang khách hàng chưa redesign):

| Nhóm Token | Biến CSS | Giá trị | Lý do & Kiểm chứng tương phản |
| --- | --- | --- | --- |
| **Brand Primary (CTA)** | `--cust-primary` | `#0f766e` (Teal 700) | Đạt tương phản **5.44:1** với chữ trắng `#ffffff` (vượt chuẩn WCAG AA 4.5:1; khắc phục mức 2.54:1 của `#10b981` trên nền nút). |
| **Brand Hover / Active** | `--cust-primary-hover` | `#115e59` (Teal 800) | Đạt tương phản **7.46:1** với `#ffffff`, phản hồi hover rõ ràng. |
| **Brand Accent / Highlight** | `--cust-emerald` / `--cust-teal` | `#059669` / `#0d9488` | Dùng cho điểm nhấn đồ họa, thanh mức pin cao, viền trạng thái. |
| **Nền & Bề mặt** | `--cust-page` / `--cust-surface` / `--cust-subtle` | `#f5f8f7` / `#ffffff` / `#f8fafc` | Nền sáng trung tính pha sắc xanh rất nhẹ, tách bạch rõ với bề mặt trắng mà không cần bóng đổ nặng. |
| **Chữ (Typography Ink)** | `--cust-ink` / `--cust-body` / `--cust-muted` | `#0f172a` / `#334155` / `#475569` | Đều đạt tương phản >= **7:1** (`ink`/`body`) và >= **4.6:1** (`muted`) trên cả `#ffffff` lẫn `#f5f8f7`. |
| **Viền & Chia tách** | `--cust-border` / `--cust-border-strong` | `#e2e8f0` / `#cbd5e1` | Đường kẻ mảnh 1px phân tách rõ vùng dữ liệu trên màn hình laptop. |
| **Container & Nhịp điệu** | `--cust-container-max` | `1320px` (gutter `32px` desktop) | Tận dụng tốt chiều ngang `1366×768` – `1920×1080` (3 cột thẻ trạm thoáng, thanh công cụ lọc trên 1 hàng) trong khi giữ độ rộng đoạn văn `<= 65ch`. |
| **Bo góc & Đổ bóng** | `--cust-radius-sm/md/lg` / `--cust-shadow-sm/md` | `8px` / `12px` / `16px` | Đổ bóng tinh tế (`0 1px 3px`, hover `0 8px 20px`), không dùng gradient hay glow dày đặc. |

---

## 3. Typography Tiếng Việt

- Kết quả từ `ui-ux-pro-max` (`--domain typography` cho tiếng Việt hiện đại, dễ đọc): **`Be Vietnam Pro`** (Google Fonts `400, 500, 600, 700, 800`, `display=swap`) kết hợp fallback hệ thống `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- Số liệu vận hành (số xe, chỗ trống, đồng hồ đếm ngược, giá tiền) dùng `font-variant-numeric: tabular-nums` để căn thẳng hàng khi quét mắt nhanh trên màn hình desktop.

---

## 4. Tương tác, Bàn phím & Trợ năng (WCAG 2.2 AA)

- **Focus Not Obscured:** Bổ sung `scroll-padding-top: 84px` để thanh điều hướng cố định (`sticky`) không che khuất phần tử đang nhận focus bàn phím.
- **Điều hướng Desktop gọn gàng:** Gom các tác vụ tài khoản phụ (`Hồ sơ & Giấy tờ`, `Hỗ trợ của tôi`, `Đổi mật khẩu`, `Đăng xuất`, `Cổng vận hành`) vào menu tài khoản hỗ trợ đầy đủ chuột và bàn phím (`aria-expanded`, `aria-haspopup`, đóng bằng `Escape` hoặc click ngoài), giúp thanh điều hướng chính không bị tràn trên màn hình `1366×768`.
- **Reduced Motion:** Tôn trọng `@media (prefers-reduced-motion: reduce)` — tắt hiệu ứng dịch chuyển hover và hiệu ứng nhấp nháy của khung xương tải dữ liệu (`skeleton`).

## 6. Mở rộng Đợt 2 (Chi tiết trạm, Tìm xe, Chi tiết xe & Modal giữ xe 30 phút)

- **Chi tiết trạm (`/stations/:stationId`)**: Thay lưới hộp metric lồng nhau bằng dải thông số ngang có đường chia mảnh (`.station-detail-stats-strip`), bổ sung thanh lọc dòng xe desktop-first (`.vehicle-filter-panel`) có `label htmlFor` chuẩn và skeleton tải thẻ xe (`VehicleGridSkeleton`).
- **Tìm xe (`/vehicles`) & Thẻ xe (`VehicleCard`)**: Giữ nguyên bộ lọc trạm + dòng xe đồng bộ URL (`station_id`, `model`, `page`), nâng cấp trực quan thẻ xe với nền minh họa xe máy điện, thanh pin rõ mức độ, biểu giá `tabular-nums` nổi bật mức giá 30 phút đầu và footer 2 nút cân đối.
- **Chi tiết xe (`/vehicles/:vehicleId`)**: Bố cục 2 cột desktop-first (cột trái: hình minh họa + thanh pin + thẻ trạm đang đỗ; cột phải: thẻ biểu giá & đặt giữ xe dạng `sticky`, hiển thị luôn số dư ví tối thiểu cần có và điều kiện giữ xe).
- **Hộp thoại giữ xe (`ReserveVehicleModal`)**: Tinh gọn cấu trúc tóm tắt xe/trạm, biểu giá khóa tại thời điểm đặt chỗ và hộp điều kiện giữ xe để hiển thị gọn trên màn hình laptop `1366×768`, giữ nguyên hoàn toàn cơ chế `useIdempotentMutation` + `Idempotency-Key`.

## 7. Mở rộng Đợt 3 (Chuyến thuê, Ví điện tử & Khuyến mãi)

- **Chuyến thuê (`/rentals`, `/rentals/:rentalId`)**: Đồng bộ banner chuyến đang mở (`.active-rental-highlight`), thanh lọc trạng thái có `<label htmlFor="rental-status-filter">`, thẻ chuyến dùng dải thông số 4 cột có đường chia mảnh và viền trái emerald cho chuyến chưa kết thúc. Trang chi tiết nổi bật đồng hồ đếm ngược `server_time` (`.rental-countdown-value`), giữ nguyên toàn bộ luồng báo giá, hóa đơn, sự cố, đánh giá, biên bản bàn giao và GPS mô phỏng.
- **Ví điện tử (`/wallet`)**: Làm nổi bật thẻ số dư khả dụng kèm icon ví (`WalletIcon`) và nhãn `Tiền mô phỏng`, giữ nguyên 100% quy trình nạp tiền PR #40 (`PENDING` chờ nhân viên duyệt, không tự cộng số dư phía frontend), chuẩn hóa nhãn form `wallet-topup-amount`, `wallet-topup-status-filter`, `wallet-tx-type-filter`.
- **Khuyến mãi (`/promotions`)**: Thẻ mã ưu đãi phong cách voucher có viền nhấn emerald trên đầu, đường cắt nét đứt giữa phần mã/mức giảm và điều kiện áp dụng, giữ nguyên `Idempotency-Key` khi bấm **Nhận mã**.

## 8. Hoàn thiện Đợt 4 (Hồ sơ & CCCD, Hỗ trợ, FAQ & Đăng nhập/Đăng ký)

- **Hồ sơ & Giấy tờ (`/profile`)**: Đồng bộ nhãn `profile-display-name`, biểu ngữ điều kiện thuê xe có `ShieldCheckIcon` và dải thông số 4 cột cho từng hồ sơ giấy tờ; giữ nguyên cơ chế che số CCCD và xem ảnh bảo mật qua `SensitiveDocumentModal`.
- **Hỗ trợ & Báo cáo sự cố (`/support`, `/support/tickets/:ticketId`)**: Thanh lọc trạng thái chuẩn hóa (`ticket-status-filter`), tiêu đề bấm được sang chi tiết, khung mô tả giới hạn độ rộng dòng đọc (`76ch`), giữ nguyên luồng tải ảnh bằng chứng riêng tư (`PrivateImage`) và `Idempotency-Key`.
- **FAQ & Trợ lý FAQ (`/faq`)**: Giữ nguyên bố cục 2 cột (cột trợ lý `sticky` trên desktop), chuẩn hóa nhãn `faq-search-input`, `faq-chat-input` và icon mở/đóng `ChevronDownIcon` xoay mượt.
- **Đăng nhập & Đăng ký (`/login`, `/register`)**: Bố cục 2 cột desktop-first (`.auth-split-shell`) với minh họa xe máy điện + 3 điểm thông tin thực tế bên trái và form đăng nhập/đăng ký bên phải; tự thu gọn thành 1 cột trên tablet/mobile, giữ nguyên toàn bộ quy tắc xác thực mật khẩu 12–128 ký tự (không trim) và chuyển hướng theo vai trò.
