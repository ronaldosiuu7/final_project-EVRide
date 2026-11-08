# EVRide V1 — Sổ quyết định và cấu hình dùng chung

Tài liệu này tổng hợp các quy tắc và đề xuất trong [hợp đồng API](./api-contract.md) để backend, frontend, database và kiểm thử cùng tham chiếu. Đây là bản ghi trạng thái, không tự phê duyệt thay cho nhóm.

- **Nguồn:** `docs/api-contract.md`, soạn ngày 21/10/2026; cập nhật chính sách KH01 (mục 1–7) theo phiên bản `EVRIDE_DEMO_V1_20261102_R2` ngày 02/11/2026.
- **Người duyệt:** `Nguyễn Đức Anh`, duyệt lần đầu ngày 01/11/2026; chốt cập nhật mục 1–7 (R2) theo yêu cầu của trưởng nhóm ngày 02/11/2026.Chốt phạm vi demo tại mục 9, quyền nhân viên tại mục 11 và xử lý sự cố/mất xe tại mục 12. Mục 8 và 10 tiếp tục chờ ý kiến các thành viên.
- **Phạm vi cập nhật R2:** Cho thuê **xe máy điện theo trạm**, giữ xe 30 phút, nhân viên bàn giao/nhận lại, trả tại trạm bất kỳ còn chỗ. Tiền trong các ví dụ là tiền demo. Các mục 8 trở đi chỉ được điều chỉnh ở phần liên quan trực tiếp (báo giá có hiệu lực 10 phút và khóa cước khi kiểm tra trả xe); các chính sách còn lại chưa được coi là đã chốt.
- **Nguyên tắc:** Không suy đoán giá thuê, cọc, ngưỡng điều kiện hoặc chính sách chưa có. API phụ thuộc chính sách chưa cấu hình phải trả `503 POLICY_NOT_CONFIGURED`, không âm thầm dùng số 0 hay giá mặc định.

## 1. Giá trị trong hợp đồng và cấu hình chung

Các giá trị dưới đây bao gồm quy ước từ hợp đồng API và phần điều chỉnh trực tiếp từ quyết định R2 (hiệu lực báo giá, làm tròn tiền thuê).

| Cấu hình/quy tắc | Giá trị áp dụng | Ghi chú |
| --- | --- | --- |
| Thời gian giữ xe | 30 phút (`expires_at = created_at + 30 phút`) | Quy tắc nghiệp vụ đã chốt trong hợp đồng; không gia hạn. Hết hạn phải đặt lượt mới. |
| Thời hạn access token & phiên | Access JWT: 1.800 giây (30 phút); Refresh token & Session: 30 ngày (rolling) | Bắt buộc `sub`/`sid` trong JWT; mỗi login tạo phiên riêng, có refresh token rotation (cookie HttpOnly có version), grace 15 giây và thu hồi phiên phía server khi logout/đổi mật khẩu/khóa tài khoản. |
| Hiệu lực báo giá | 10 phút (`quote_expires_at = quote_created_at + 10 phút`) | **Đã chốt (R2):** Thay đề xuất 120 giây trước đây trong luồng trả xe; quote gắn với chuyến, trạm thực tế, khuyến mãi, phiên bản chính sách và trạng thái các nguồn liên quan. |
| Phân trang | `page = 1`, `page_size = 20`, tối đa 100 | Giá trị mặc định/giới hạn theo hợp đồng. |
| Đơn vị tiền | VND; Decimal/NUMERIC, chuỗi số thập phân không âm, tối đa 2 chữ số lẻ (ví dụ `"10000.00"`) | Không dùng float để tính tiền. Tổng tiền thuê sau giảm giá làm tròn đến 1 đồng bằng `HALF_UP` (đã chốt ở mục 1 R2); quy tắc riêng của khuyến mãi vẫn chờ duyệt. |
| Khuyến mãi phần trăm | Số nguyên 1–100; mỗi lượt tối đa một mã | Là đề xuất. Giảm trên tiền thuê, không giảm cọc/phí sự cố; giới hạn mức giảm tối đa nếu có và không vượt tiền thuê. |
| Mã khuyến mãi | Viết hoa, tối đa 50 ký tự, duy nhất | Đề xuất; thời gian hiệu lực `start_date <= thời điểm thanh toán < end_date`. |
| Ghi GPS demo | Dữ liệu không được trước lúc nhận xe hoặc quá giờ server hơn 30 giây | Chỉ demo; endpoint phải tắt khi chạy thật nếu chưa có tích hợp thiết bị được duyệt. |
| Dữ liệu GPS cũ | Cảnh báo stale sau 60 giây | Đề xuất; giao diện cần hiển thị thời điểm cập nhật. |
| Thanh toán demo | Chỉ bật rõ ràng qua `DEMO_PAYMENTS_ENABLED` | Chưa có giá trị mặc định quy định trong hợp đồng. Không dùng luồng demo để nhận tiền thật. |

## 2. Bảng trạng thái quyết định V1

Mỗi dòng chỉ được chuyển sang **Đã duyệt** sau khi ghi rõ giá trị cuối cùng, người duyệt và ngày duyệt. Hiện tại các mục 1–7 đã được chốt theo phiên bản `EVRIDE_DEMO_V1_20261102_R2`; các mục từ 8 trở đi vẫn chờ nhóm xác nhận.

| Hạng mục | Trạng thái hiện tại / giá trị đã chốt hoặc cần chốt | Người duyệt / Ngày duyệt |
| --- | --- | --- |
| 1. Cách tính giá thuê | **Đã duyệt (R2):** Tối thiểu 10.000đ cho 30 phút đầu (`1.800` giây); sau đó 350đ/phút, phần phút lẻ làm tròn lên. Tính từ `actual_start_time` đến `return_initiated_at`. Làm tròn tổng tiền sau giảm giá đến 1 đồng bằng `HALF_UP`. | Nguyễn Đức Anh — 02/11/2026 |
| 2. Bảng giá & Snapshot | **Đã duyệt (R2):** Lưu bản chụp `first_30_minutes_price_snapshot`, `extra_minute_price_snapshot`, `deposit_amount_snapshot`, `vehicle_type_snapshot`, `pricing_policy_version` và đơn vị tính phí khi giữ xe thành công. Giữ nguyên cho chuyến đó; lưu lịch sử đổi giá. | Nguyễn Đức Anh — 02/11/2026 |
| 3. Tiền cọc & Hủy | **Đã duyệt (R2):** Cọc demo 100.000đ/xe, kiểm tra số dư `>= cọc + giá 1 block` khi giữ xe, thu cọc từ ví khi pickup. Hủy/hết hạn trước pickup miễn phí. Khi trả, cấn trừ và hoàn phần thừa. | Nguyễn Đức Anh — 02/11/2026 |
| 4. Điều kiện khách & Giấy tờ | **Đã duyệt (R2):** Chính sách demo: khách từ đủ 16 tuổi (theo giờ `Asia/Ho_Chi_Minh`), tài khoản `CUSTOMER` `ACTIVE`, chỉ cần `CCCD` còn hiệu lực và `VERIFIED`; không yêu cầu `DRIVER_LICENSE` hoặc `PASSPORT`. | Nguyễn Đức Anh — 02/11/2026 |
| 5. Ngưỡng pin & Đếm xe/chỗ | **Đã duyệt (R2):** Pin tối thiểu 30% khi cho đặt và khi bàn giao. Pin dưới 30% sau trả không được cho thuê tiếp đến khi đủ pin. Truy vấn động `rentable_vehicles` và `free_slots`, không lưu cột đếm vật lý trong `stations`. | Nguyễn Đức Anh — 02/11/2026 |
| 6. Số chuyến & Giới hạn hủy | **Đã duyệt (R2):** Tối đa 1 lượt giữ/chuyến chưa giải quyết (`RESERVED`/`IN_RENT`/`RETURN_PENDING`/`STOLEN`); tối đa 3 lượt hủy/hết hạn/ngày (`CANCELLED` + `EXPIRED`). Lazy Expiration trước khi kiểm tra đặt xe; Global Lock Order `station → customer → wallet → vehicle → rental`. | Nguyễn Đức Anh  — 02/11/2026 |
| 7. Trả xe khi thiếu tiền / ví khóa | **Đã duyệt (R2):** Đóng băng cước tại `return_initiated_at` khi nhân viên kiểm tra nhận xe thực tế (`POST /rentals/{id}/initiate-return`); trạng thái `RETURN_PENDING`, quote hiệu lực 10 phút. Chờ thanh toán không tính thêm cước và không cho thuê lại xe đang chờ. | Nguyễn Đức Anh  — 02/11/2026 |
| 8. Khuyến mãi | Chờ duyệt: Cần chốt quy tắc làm tròn riêng của khuyến mãi, điều kiện claim/thanh toán, min_rental_amount và max_discount_amount có bắt buộc hay không. | Chưa xác định |
| 9. Thanh toán thật | Đã duyệt về phạm vi V1: Chỉ sử dụng tiền mô phỏng qua DEMO_PAYMENTS_ENABLED; không triển khai hoặc bật thanh toán thật. Provider, webhook xác nhận từ server và đối soát nằm ngoài phạm vi V1; chưa chốt phương án tích hợp production. | Nguyễn Đức Anh — 02/11/2026 |
| 10. GPS và upload giấy tờ | Chờ duyệt: GPS hiện chỉ có đề xuất demo do nhân viên nhập; kho ảnh, thiết bị và dữ liệu thật cần hợp đồng tích hợp riêng. | Chưa xác định |
| 11. Phạm vi quyền nhân viên | Đã duyệt: STAFF được thực hiện pickup/return/move tại bất kỳ trạm nào, tuân thủ điều kiện nghiệp vụ của từng thao tác. MANAGER quản trị toàn hệ thống. Phân công và giới hạn quyền theo trạm nằm ngoài phạm vi V1. | Nguyễn Đức Anh — 02/11/2026 |
| 12. Sự cố/mất xe | **Chờ bổ sung/chưa duyệt:** Chưa chốt quy trình xử lý sự cố/mất xe, quyền thao tác, chuyển trạng thái khi tìm lại xe và cách xử lý cọc, hóa đơn, bồi thường. Ticket không tự kết thúc chuyến hay hoàn tiền; cần bổ sung quy trình vận hành và tài chính riêng. | Chưa xác định |

---

## 1. Tính tiền thuê

- Đơn vị thanh toán: VND. Dùng Decimal/NUMERIC, không dùng float.
- Thu tối thiểu một block 1.800 giây (30 phút) đầu tiên. Chỉ phần vượt 30 phút được tính theo phút, làm tròn lên.
- Giá cấu hình theo xe: `first_30_minutes_price = 10000.00`, `extra_minute_price = 350.00` trong seed.
- Tính từ pickup thành công đến `return_initiated_at`, thời điểm server ghi nhận nhân viên kiểm tra trả xe thực tế tại trạm theo mục 7. Thời gian giữ xe chưa bàn giao không tính tiền; thời gian chờ thanh toán sau mốc này không tính thêm. Tạm dừng di chuyển trước mốc này vẫn tính tiền.
- Tối thiểu một block, kể cả nhận rồi trả ngay. Không thêm phí mở khóa, không phụ thu trả khác trạm, không có trần ngày hoặc gói ngày/tháng trong V1 này.
- Làm tròn tổng tiền sau giảm giá đến 1 đồng bằng HALF_UP; API vẫn biểu diễn tiền bằng chuỗi, ví dụ `"10000.00"`.
- Backend tính theo thời gian UTC với độ chính xác lưu trữ; không bỏ giây lẻ trước khi làm tròn. Đúng 30 phút chỉ thu 10.000đ; vượt 30 phút dù nhỏ hơn một giây tính thêm một phút. Timestamp ngược thứ tự phải bị từ chối.

```text
elapsed_seconds = return_initiated_at - actual_start_time
extra_minutes = ceil(max(elapsed_seconds - 1800, 0) / 60)
rental_fee = first_30_minutes_price_snapshot + extra_minutes × extra_minute_price_snapshot
total_due = HALF_UP(rental_fee - valid_discount, đến 1 đồng)
```

`valid_discount` chỉ nhận kết quả từ chính sách khuyến mãi đã được chốt riêng; các ví dụ trong file dùng 0, không tự phê duyệt mục khuyến mãi. Thiếu cấu hình bắt buộc phải trả POLICY_NOT_CONFIGURED, không âm thầm dùng giá 0.

| Thời gian thuê | Phút tính thêm | Phí với giá demo |
| --- | ---: | ---: |
| 1 phút | 0 | 10.000đ |
| Đúng 30 phút | 0 | 10.000đ |
| 30 phút 1 giây | 1 | 10.350đ |
| Đúng 31 phút | 1 | 10.350đ |
| 31 phút 1 giây | 2 | 10.700đ |
| Đúng 2 giờ | 90 | 41.500đ |
| 5 giờ 30 phút | 300 | 115.000đ |

Lý do: phù hợp chuyến ngắn giữa các trạm; dễ hiển thị và kiểm thử hơn việc bắt chuyến ngắn trả tối thiểu một ngày. Đây là thay đổi so với đề xuất tính theo ngày trong kế hoạch cũ.

## 2. Chốt giá tại thời điểm giữ xe

- Khi tạo rental thành công, lưu `first_30_minutes_price_snapshot`, `extra_minute_price_snapshot`, `deposit_amount_snapshot`, `vehicle_type_snapshot`, `pricing_policy_version` và đơn vị tính phí.
- Frontend hiển thị giá 30 phút đầu, giá mỗi phút thêm, cọc và cách làm tròn trước khi khách xác nhận giữ xe.
- Giá/cọc mới do MANAGER cập nhật chỉ áp dụng cho rental tạo sau thay đổi. Rental đang giữ hoặc đang thuê vẫn dùng snapshot cũ.
- Hết hạn/hủy rồi đặt lại là rental mới, dùng giá/cọc hiện hành.
- Lưu lịch sử thay đổi giá gồm giá cũ/mới, người sửa và thời điểm. Không sửa lịch sử hóa đơn.
- Quote, return và báo cáo đều đọc snapshot; không tính lại tiền chuyến cũ bằng giá hiện tại trong bảng vehicles.

Ví dụ: khách giữ lúc giá 10.000đ/30 phút đầu + 350đ/phút thêm, sau đó quản lý đổi thành 12.000đ + 400đ/phút. Khách nhận trong hạn vẫn dùng cả hai mức cũ; đặt lại sau hết hạn dùng cả hai mức mới.

## 3. Cọc, số dư và hủy

- Cọc cấu hình theo xe qua `deposit_amount`; seed ban đầu: `100000.00`.
- Khi giữ xe: ví phải ACTIVE và số dư ít nhất bằng cọc snapshot cộng giá một block snapshot. Chỉ kiểm tra, chưa trừ/khóa tiền.
- Khi pickup: kiểm tra lại cùng điều kiện; thu cọc và ghi biên bản, chuyển trạng thái chuyến/xe trong cùng transaction. Với seed, cần số dư ít nhất 110.000đ, trừ cọc 100.000đ, còn 10.000đ trong ví.
- Cọc được ghi riêng theo rental; không còn là số dư có thể chi tiêu và không được tính là doanh thu thuê.
- Hủy giữ chỗ hoặc hết 30 phút trước pickup: không thu phí, không mất cọc vì chưa thu cọc. Sau pickup không dùng API cancel để kết thúc chuyến; phải return.
- Trả xe: dùng cọc để thanh toán, thu thêm nếu thiếu, hoàn phần dư vào ví nếu thừa. Không coi thiếu phần thu thêm là được phép trừ hết cọc và ghi thanh toán dở.
- Không giữ giấy tờ bản gốc làm cọc. Không tự động khấu trừ phí hỏng/mất xe chưa được chốt.

```text
additional_payment = max(total_due - deposit_held, 0)
deposit_refund = max(deposit_held - total_due, 0)
wallet_after_return = wallet_before_return - additional_payment + deposit_refund
```

| Tình huống (không giảm giá) | Kết quả |
| --- | --- |
| Ví 150.000đ trước pickup | Sau thu cọc: ví 50.000đ, cọc đang giữ 100.000đ |
| Cùng chuyến trên kiểm tra trả sau 2 giờ, phí 41.500đ | Hoàn cọc dư 58.500đ; ví cuối 108.500đ |
| Cùng số dư ban đầu, kiểm tra trả sau 5 giờ 30 phút, phí 115.000đ | Thu thêm 15.000đ; ví cuối 35.000đ |
| Hủy trước pickup | Ví không thay đổi, không phát sinh thu/hoàn cọc |

Sổ giao dịch phải giải thích được phần cọc đã dùng, phần hoàn và phần thu thêm; không ghi khoản tiền 0 hoặc cộng tiền thuê hai lần. Retry chỉ ghi một lần.

## 4. Điều kiện khách và giấy tờ

- Chính sách nội bộ demo V1 theo yêu cầu trưởng nhóm: khách đủ 16 tuổi tại ngày giữ xe và ngày nhận xe; tài khoản CUSTOMER ACTIVE. Tuổi tính theo ngày sinh đã xác minh và ngày hiện tại tại Asia/Ho_Chi_Minh, không chia số ngày cho 365.
- Chỉ yêu cầu CCCD còn hiệu lực và VERIFIED. Không yêu cầu GPLX; không dùng PASSPORT thay CCCD trong điều kiện thuê V1.
- Đây là quy tắc sản phẩm demo, không phải kết luận pháp lý rằng người đủ 16 tuổi được vận hành mọi loại xe máy điện. Danh mục vận hành thực tế cần được đối chiếu riêng với điều kiện sử dụng từng loại xe.
- Có thể đăng ký, xem trạm/xe trước khi được duyệt; chỉ được giữ xe khi đủ điều kiện trên. Kiểm tra lại lúc pickup; nhân viên đối chiếu khách với hồ sơ.
- Nộp lại giấy tờ tạo bản PENDING mới; bản VERIFIED cũ còn hiệu lực vẫn dùng được nếu chưa bị thu hồi. Bản mới PENDING không tự thay thế bản đã duyệt; hết hạn/thu hồi bản cũ thì phải chờ bản mới được duyệt.
- Không cho tự duyệt hồ sơ; không lưu ảnh hoặc số giấy tờ đầy đủ trong API danh sách/log.

Schema cần bổ sung ngày sinh đã xác minh, hạn CCCD, thông tin người/thời điểm xác minh và trạng thái thu hồi. Nghiệp vụ phải kiểm đúng loại CCCD, hạn giấy tờ và tuổi. Enum cũ có thể giữ PASSPORT/DRIVER_LICENSE để bảo toàn lịch sử, nhưng chúng không được dùng làm điều kiện bắt buộc hoặc thay CCCD trong V1.

## 5. Pin tối thiểu

- `MIN_RENTAL_BATTERY_PERCENT = 30` tại thời điểm giữ xe và pickup; đúng 30% được phép, 29% không được phép.
- Xe có thể giữ phải AVAILABLE, ở trạm hoạt động/đang mở và không có lỗi/phiếu bảo trì chặn vận hành, ngoài điều kiện pin.
- Pin giảm dưới 30% sau khi giữ: không được pickup; cho khách hủy miễn phí rồi đặt xe khác, không âm thầm đổi vehicle_id trong rental.
- Không từ chối nhận lại xe chỉ vì pin dưới 30%; không tự thu phí pin thấp. Nhân viên ghi pin thực tế lúc trả.
- Xe trả còn thấp pin nhưng không hỏng có thể có trạng thái AVAILABLE về mặt vòng đời; bộ lọc `rentable` và available_vehicle_count phải loại xe dưới ngưỡng. Xe vẫn chiếm chỗ trạm.
- Nhân viên ghi nhận pin sau khi sạc bằng thao tác có quyền/audit; chỉ mở lại khả năng thuê khi đạt ngưỡng và không còn lỗi chặn.
- Pin 30% không được quảng cáo thành số km bảo đảm. Đây là ngưỡng demo do EVRide chọn, không phải tiêu chuẩn được các nguồn tham khảo xác nhận.

### Đếm xe và sức chứa bằng truy vấn động

- Tuyệt đối không lưu cột đếm vật lý `available_vehicle_count`, `rentable_vehicles`, `occupied_spaces` hoặc `free_slots` trong bảng `stations`. Về sức chứa, bảng chỉ lưu `capacity`; các trường thông tin trạm khác vẫn giữ nguyên.
- `rentable_vehicles = COUNT(*)` xe tại trạm có `status = 'AVAILABLE' AND battery_percent >= 30` và không có phiếu bảo trì đang hoạt động (`NOT EXISTS` phiếu OPEN/IN_PROGRESS). Chỉ hiển thị khả năng đặt khi trạm hoạt động và đang mở.
- `free_slots = capacity - COUNT(*)` tất cả xe có `current_station_id = station.id`, bất kể pin/trạng thái, gồm xe RESERVED, MAINTENANCE và đang chờ thanh toán tại trạm.
- Dùng truy vấn tổng hợp hoặc View thông thường; không dùng bộ đếm lưu sẵn làm nguồn quyết định. Không JOIN phiếu bảo trì theo cách nhân đôi số xe.
- Để giữ tương thích contract: `available_vehicle_count` trong response là alias tính động của `rentable_vehicles`; `available_spaces` là alias của `free_slots`, không phải cột DB.
- Khi thêm xe, điều chuyển hoặc bắt đầu nhận trả, khóa dòng station rồi đếm lại trong transaction; mọi luồng đưa xe vào trạm phải theo cùng quy tắc. Không che số âm bằng max(0, ...); dữ liệu sai phải báo lỗi và chặn nhận thêm.

## 6. Một khách chỉ có một lượt đang hoạt động

- Mỗi customer chỉ có tối đa một rental RESERVED, IN_RENT hoặc RETURN_PENDING. Rental STOLEN chưa giải quyết cũng chặn đặt xe mới.
- Một xe chỉ có tối đa một rental RESERVED/IN_RENT/RETURN_PENDING/STOLEN.
- RESERVED hết hạn phải chuyển EXPIRED trong transaction trước khi cho đặt mới. Không dùng thời gian hiện tại trong điều kiện partial unique index.
- Thêm partial unique index cho customer_id và vehicle_id với trạng thái RESERVED/IN_RENT/RETURN_PENDING/STOLEN. RETURN_PENDING là xe đã được nhân viên giữ tại trạm nhưng còn chờ quyết toán theo mục 7.
- Hai request đồng thời của cùng khách đặt hai xe: chỉ một request được thành công. Không hỗ trợ thuê hộ/thuê nhóm trong V1.
- Hủy/hết hạn/trả hoàn tất mới cho đặt lượt tiếp theo, nếu tài khoản và ví vẫn đủ điều kiện. Không tự giải phóng rental STOLEN theo timeout 30 phút.

### Giới hạn hủy/hết hạn theo ngày

- **Mỗi khách tối đa hủy/để hết hạn 3 lần/ngày**, tính tổng CANCELLED + EXPIRED, không phải 3 lần mỗi loại. Sau lần thứ ba, chặn tạo lượt giữ mới đến 00:00 ngày tiếp theo tại Asia/Ho_Chi_Minh.
- Trước khi tạo rental, kiểm tra số lần trong ngày nhỏ hơn 3; khi đã bằng 3 trả 409 `DAILY_CANCELLATION_LIMIT_REACHED`. Không cấm hủy để ép khách phải nhận xe.
- Ngày ghi nhận: hủy dùng `cancelled_at`; hết hạn dùng `expires_at`, không dùng giờ job/Lazy Expiration chạy. Biên ngày quy đổi từ giờ Việt Nam sang UTC để truy vấn.
- Mỗi rental chỉ tính một lần, kể cả request retry hoặc job và API chạy đồng thời. Hủy sau hạn phải được xử lý thành EXPIRED trước, không tạo thêm lần CANCELLED.
- Hủy do khách hoặc hết hạn đều tính hạn mức. Hủy do lỗi xe/hệ thống được nhân viên xác nhận (ví dụ pin tụt dưới ngưỡng sau giữ) không tính; lưu reason, người xác nhận và audit, khách không tự chọn lý do miễn trừ.
- Kiểm hạn mức sau Lazy Expiration dưới khóa customer; dùng dữ liệu rental/audit làm nguồn, không reset bộ đếm bằng cron.

### Lazy Expiration trước khi kiểm tra đặt xe

- Trong transaction đặt xe, trước kiểm tra các điều kiện đặt, tìm **mọi** rental RESERVED có `expires_at <= thời điểm kiểm tra` thỏa `customer_id = khách đang gọi OR vehicle_id = xe đang chọn`. Phải xử lý cả hai phía, không chỉ lượt giữ trên xe đang chọn.
- Chuyển các rental đó sang EXPIRED; chỉ giải phóng xe nếu còn RESERVED cho chính lượt đó và không có lỗi/bảo trì chặn. Giữ lịch sử, hạn gốc và ngày tính hạn mức; không sửa lượt IN_RENT/RETURN_PENDING/STOLEN.
- Ý nghĩa nghiệp vụ là `expires_at <= NOW()`. Với PostgreSQL, `NOW()` cố định từ đầu transaction: sau khi chờ lấy khóa phải lấy giờ thực tế mới bằng `clock_timestamp()` và dùng một mốc chung cho kiểm tra này. Không dùng thời gian cũ trước khi chờ khóa để nhận/đặt xe quá hạn.
- Sau khi dọn, kiểm tra lại số lượt, hạn mức, tài khoản, ví, xe và trạm; chỉ tạo created_at/expires_at mới khi đủ điều kiện. Nếu từ chối đặt do điều kiện nghiệp vụ, vẫn commit việc dọn hết hạn đã hợp lệ rồi trả lỗi; lỗi hệ thống thì rollback. Không raise lỗi làm vô tình rollback việc dọn khi cần lưu kết quả.
- Job định kỳ chỉ giúp dọn sớm. Tính đúng ở mỗi thao tác không phụ thuộc job; đây không phải cam kết mọi dòng DB tự đổi trạng thái đúng từng giây khi không có request/job.

### Thứ tự khóa toàn cục (Global Lock Order)

**`station → customer → wallet → vehicle → rental`**. `customer` là dòng trong bảng `users` có vai trò CUSTOMER. Trong cùng một nhóm, khóa theo ID tăng dần; chỉ bỏ qua nhóm không cần dùng, tuyệt đối không khóa ngược thứ tự.

- Chọn **customer làm khóa điều phối bắt buộc** cho mọi thao tác của khách có thay đổi giữ xe, chuyến, ví, cọc hoặc hạn mức, kể cả nạp tiền và MANAGER đổi trạng thái ví. Vì customer–wallet là 1–1, đọc ví dưới khóa customer không cần thêm SELECT FOR UPDATE ví chỉ để tuần tự hóa. Không được tùy luồng chọn customer hoặc wallet làm khóa thay thế.
- UPDATE ví vẫn tạo khóa dòng thực tế. Nếu luồng sẽ cập nhật ví sau khi đã khóa vehicle/rental, phải khóa wallet trước vehicle/rental theo thứ tự trên (hoặc thực hiện cập nhật ví đúng thứ tự). Không được hiểu quan hệ 1–1 là loại bỏ mọi nhu cầu khóa ví. Khóa ẩn do UPDATE/FK cũng cần được review.
- Khóa tất cả trạm liên quan (điều chuyển: cả trạm nguồn/đích), sau đó tất cả customer liên quan, wallet cần ghi, vehicle và rental. Bản ghi quote/promotion/idempotency dùng thêm phải có thứ tự ổn định sau các nhóm trên; không giữ khóa phụ rồi quay lại khóa station/customer.
- Lazy Expiration có thể chạm xe khác của cùng khách hoặc khách khác đang giữ xe được chọn. Đọc sơ bộ để thu thập đầy đủ tập trạm/customer/xe/rental, khóa theo thứ tự, rồi đọc lại xác minh. Nếu phát hiện thêm tài nguyên hoặc quan hệ thay đổi, rollback và retry với tập đầy đủ; không khóa bổ sung một nhóm đứng trước khi đã giữ nhóm sau.
- Dùng cùng cơ chế cho reserve/cancel/expiry/pickup/return/move và giao dịch ví. Retry deadlock có giới hạn, kết hợp idempotency và unique index; thứ tự khóa không thay thế kiểm tra trạng thái sau khóa.

## 7. Thiếu tiền hoặc ví bị khóa khi trả xe

- Chốt kết hợp: **đóng băng thời gian cước bằng `return_initiated_at` và giữ báo giá 10 phút bằng `quote_expires_at`**. Thay đề xuất quote 120 giây trước đây trong luồng trả xe này.
- Tách hai hành động: xem báo giá ước tính không dừng cước; chỉ STAFF/MANAGER bấm kiểm tra trả xe sau khi xác nhận xe thực tế đã ở trạm và được nhân viên giữ mới được đóng băng cước. Khách không tự ghi timestamp hoặc tự dừng cước.
- Bổ sung hành động `POST /rentals/{id}/initiate-return` có Idempotency-Key. Dưới khóa theo thứ tự mục 6, kiểm tra rental IN_RENT, đúng xe, trạm hoạt động/còn chỗ và pin/tình trạng xe thực tế; server lấy giờ sau khi có khóa, lưu `return_initiated_at` bất biến, `actual_end_time` bằng mốc nhận xe này, `actual_return_station_id`, biên bản RETURN, xe tại trạm với trạng thái RETURN_PENDING và rental RETURN_PENDING trong một transaction.
- Ghi `settled_at` riêng khi quyết toán thành công. Thời điểm kết thúc sử dụng/nhận lại xe khác thời điểm trả tiền; không thay `actual_end_time` bằng thời điểm thanh toán.
- RETURN_PENDING chiếm một chỗ trạm, chặn khách đặt mới, chặn xe cho thuê/điều chuyển và không tự thành AVAILABLE. Nhân viên giữ xe trong thời gian chờ, khách không tiếp tục sử dụng. Gọi lại initiate-return chỉ trả phiên đã có, không đổi trạm hoặc mốc dừng cước. V1 không có resume/hủy đóng băng cước.
- Phạm vi thanh toán: không trả một phần, không ví âm. Có trạng thái chờ quyết toán tại trạm nhưng chưa có hệ thống công nợ/thu hồi nợ riêng; MANAGER theo dõi các lượt RETURN_PENDING chưa giải quyết.
- Từ lúc bắt đầu kiểm tra trả hợp lệ, phí thuê cố định theo snapshot và `return_initiated_at`. Kiểm tra đủ tiền bằng `wallet.balance >= additional_payment`, không yêu cầu ví đủ toàn bộ hóa đơn khi đang có cọc.
- Quote chốt tổng tiền và các khoản cọc/giảm giá hợp lệ; gắn với rental, trạm thực tế, phiên bản chính sách và trạng thái các nguồn liên quan. `quote_expires_at = quote_created_at + 10 phút`; hợp lệ khi giờ thực tế sau khóa < hạn. Quote không trừ tiền hoặc tiêu thụ mã. Điều kiện khuyến mãi vẫn theo chính sách riêng; thay đổi điều kiện/mã làm quote cũ không còn hợp lệ thì trả STALE_QUOTE trước khi quyết toán.
- Với quote còn hợp lệ và các điều kiện khác không thay đổi, tổng tiền không tăng do chờ thanh toán. Hết hạn quote hoặc đổi mã thì lấy quote mới, nhưng **không đổi mốc dừng cước**. Các khoản giảm có thể thay đổi theo chính sách khuyến mãi riêng; cước thuê gốc không tăng.
- Return quyết toán chỉ thành công khi rental RETURN_PENDING, xe vẫn ở trạm đã ghi nhận, ví ACTIVE, quote hợp lệ và đủ phần thu thêm. Không kiểm tra "còn một chỗ trống" thêm lần nữa: xe đã chiếm chỗ khi initiate-return, tránh từ chối sai khi chính nó làm trạm đầy.
- Thiếu tiền: trả INSUFFICIENT_BALANCE, giữ rental/xe RETURN_PENDING và biên bản RETURN đã ghi; không phát hành hóa đơn PAID, không tiêu thụ mã, không trừ thêm/cấn trừ cọc dở. Không rollback lần tiếp nhận vật lý đã commit trước đó và không khởi động lại đồng hồ phí.
- Ví FROZEN/LOCKED: từ chối quyết toán với lỗi ví theo contract, kể cả cọc đủ; MANAGER xử lý trạng thái ví trước khi thử lại. Không ngăn tiếp nhận xe thực tế/đóng băng cước chỉ vì ví khóa hoặc thiếu tiền.
- Khách nạp bổ sung qua luồng demo được bật riêng. Nếu quote còn hiệu lực thì dùng lại, nếu hết hạn thì lấy mới; phí thuê vẫn theo mốc cố định.
- Khi quyết toán thành công, ghi hóa đơn PAID, bút toán cấn trừ/hoàn cọc/thu thêm, tiêu thụ mã, rental COMPLETED, settled_at và xe AVAILABLE/MAINTENANCE theo tình trạng trong cùng transaction. Không tạo biên bản RETURN thứ hai; xe AVAILABLE pin thấp vẫn bị bộ lọc thuê loại. Retry không ghi sổ hai lần; lỗi giữa transaction quyết toán rollback phần quyết toán, giữ nguyên phiên tiếp nhận đã commit.

Ví dụ: nhân viên tiếp nhận sau 5 giờ 30 phút, phí cố định 115.000đ; cọc 100.000đ, ví còn 10.000đ thì cần thu thêm 15.000đ, thiếu 5.000đ. Xe ở trạm và rental RETURN_PENDING. Khách nạp thêm 5.000đ sau 12 phút: quote đầu đã hết hạn, lấy quote mới vẫn có phí thuê 115.000đ nếu không thay khuyến mãi; quyết toán xong ví còn 0đ. Không cộng 12 phút chờ vào cước.

Thay đổi này cần bổ sung RETURN_PENDING cho rental và vehicle, cùng các trường timestamp, endpoint và test trong schema/contract. Không chỉ thêm quote_expires_at vào response rồi coi như đã xử lý việc nhận xe khi thiếu tiền. Báo cáo thời lượng dùng actual_start_time/actual_end_time; doanh thu vẫn chỉ tính COMPLETED + hóa đơn PAID theo định nghĩa contract, không tính RETURN_PENDING là doanh thu đã thu.

## 8. Khuyến mãi

**Chờ duyệt:** Cần chốt quy tắc làm tròn riêng của khuyến mãi, điều kiện claim/thanh toán, `min_rental_amount` và `max_discount_amount` có bắt buộc hay không.

Giữ nguyên để hỏi ý kiến các thành viên; lần cập nhật này không chốt thêm chính sách khuyến mãi.

## 9. Thanh toán thật

**Đã chốt về phạm vi:** V1 là đồ án demo, chỉ sử dụng tiền mô phỏng. Không triển khai thanh toán thật và không chốt nhà cung cấp hoặc cấu hình production trong lần cập nhật này.

- Luồng nạp tiền demo chỉ hoạt động khi được bật rõ ràng qua `DEMO_PAYMENTS_ENABLED`.
- Giao diện ví, nạp tiền và thanh toán phải có nhãn **“Tiền mô phỏng”** để tránh nhầm với giao dịch tiền thật.
- Không sử dụng luồng demo để nhận tiền thật. Không coi dữ liệu xác nhận do client tự gửi là bằng chứng đã thanh toán thật.
- Tài liệu đồ án phải ghi rõ: thanh toán thật cần tích hợp nhà cung cấp như VNPay/MoMo/ZaloPay, xác minh webhook tại backend và cơ chế đối soát giao dịch (reconciliation). Toàn bộ phần tích hợp này nằm ngoài phạm vi V1.
- Thiết kế thể hiện điểm mở rộng bằng interface `PaymentProvider`, tách xử lý thanh toán khỏi nghiệp vụ thuê xe. V1 chỉ sử dụng phần triển khai mô phỏng.
- Khi trình bày với giám khảo, giải thích cách bổ sung nhà cung cấp thật qua interface này; không bật production hoặc sử dụng giao dịch tiền thật để minh họa.

## 10. GPS và upload giấy tờ

**Chờ duyệt:** GPS hiện chỉ có đề xuất demo do nhân viên nhập; kho ảnh, thiết bị và dữ liệu thật cần hợp đồng tích hợp riêng.

Giữ nguyên để hỏi ý kiến các thành viên; lần cập nhật này không chốt thêm phương án GPS hoặc lưu trữ giấy tờ.

## 11. Phạm vi quyền nhân viên

**Đã chốt:** STAFF vận hành toàn hệ thống trong V1 demo; MANAGER quản trị toàn hệ thống.

- STAFF được thực hiện bàn giao xe (`pickup`), tiếp nhận/quyết toán trả xe (`return`) và điều chuyển xe (`move`) tại bất kỳ trạm nào.
- Quyền thao tác tại mọi trạm không bỏ qua các điều kiện nghiệp vụ: trạng thái chuyến/xe, pin, sức chứa, ví, báo giá và thứ tự khóa vẫn phải được kiểm tra theo các mục tương ứng.
- STAFF không được thực hiện các hành động chỉ dành cho MANAGER, bao gồm xác nhận mất xe và xử lý khôi phục sau mất xe theo mục 12.
- V1 không bổ sung bảng `staff_station_assignments` chỉ để giới hạn quyền theo trạm. Việc này sẽ kéo theo thay đổi migration, API, giao diện và kiểm thử, vượt nhu cầu demo hiện tại.
- Các thao tác vận hành phải ghi nhận người thực hiện và thời điểm để phục vụ kiểm tra lịch sử.
- Khi triển khai production, cần thiết kế bổ sung cơ chế phân công nhân viên và giới hạn quyền theo trạm. Quyền toàn hệ thống của STAFF là lựa chọn riêng cho V1 demo.

## 12. Sự cố/mất xe

**Trạng thái: Chờ bổ sung/chưa duyệt.**

- Quy trình xử lý sự cố/mất xe sẽ được bổ sung và lấy ý kiến các thành viên trước khi triển khai.
- Các nội dung cần chốt: vòng đời ticket, quyền xác nhận mất xe, chuyển trạng thái rental/vehicle, xử lý khi tìm lại xe, điều kiện cho khách đặt chuyến mới và cách xử lý cọc, hóa đơn, bồi thường.
- Các phương án đã trao đổi, bao gồm trạng thái `CLOSED_INCIDENT`, chỉ là đề xuất; chưa được coi là quyết định triển khai V1.
- Giữ nguyên ràng buộc đã chốt tại mục 6: rental `STOLEN` chưa giải quyết chặn khách đặt mới và chặn xe tham gia chuyến khác; không tự giải phóng theo timeout.
- Ticket không tự kết thúc chuyến hoặc hoàn tiền. Không tự suy diễn chính sách tài chính hay chuyển trạng thái khi chưa được duyệt.

## 13. Thiết kế kỹ thuật xác thực: Rolling Session và Refresh Token Rotation

> Thiết kế xác thực theo yêu cầu ngày 06/11/2026. Access JWT sống 1.800 giây, bắt buộc `sub`/`sid`. Refresh token ngẫu nhiên sống 30 ngày, rolling cùng phiên sau mỗi rotation thành công; không có absolute lifetime. Mỗi login tạo phiên riêng, các tab chia sẻ phiên. Grace 15 giây cấu hình được, replay kết quả mã hóa nếu token kế tiếp còn hiện hành; ngoài grace thu hồi phiên bị reuse. Logout thu hồi phiên hiện tại, đổi mật khẩu/khóa tài khoản thu hồi mọi phiên nguyên tử. Tài khoản phải ACTIVE trên mỗi request. Không hủy được request đã qua xác thực trước lúc thu hồi commit. Giữ lịch sử hash toàn bộ vòng đời phiên. Frontend có trách nhiệm phối hợp liên tab và không lưu access token bền vững.

## Thay đổi cần đưa vào issue #14 và hai issue backend

- [ ] Đồng bộ các quyết định đã chốt tại mục 1–7, 9 và 11 vào `docs/v1-decisions.md`, API contract, tài liệu yêu cầu và checklist issue #14/hai issue backend. Giữ mục 8 và 10 chờ ý kiến các thành viên; mục 12 chờ bổ sung và duyệt sau.

- [ ] Thay `daily_price`/`price_per_30_minutes` bằng hai mức `first_30_minutes_price` và `extra_minute_price` cùng snapshot trong ORM/migration/API/fixture/UI. Không chỉ đổi nhãn hoặc tự chia giá ngày cũ để suy ra giá mới.
- [ ] Nếu đã có dữ liệu, migration phải giữ được lịch sử giá/nghĩa của dữ liệu cũ; dữ liệu chưa có đơn vị rõ cần xử lý tường minh. Giá seed mới 10.000đ/block chỉ áp dụng cho dữ liệu demo mới.
- [ ] Bổ sung snapshot và phiên bản chính sách; lưu lịch sử giá, cọc theo rental và liên kết bút toán chống trùng.
- [ ] Bổ sung xác minh ngày sinh/CCCD; điều kiện đủ 16 tuổi, không yêu cầu GPLX/PASSPORT; dùng dữ liệu giả trong seed.
- [ ] Thêm RETURN_PENDING, return_initiated_at, quote_expires_at, settled_at và initiate-return; actual_end_time là thời điểm tiếp nhận thực tế. Đồng bộ quote TTL thành 10 phút, quyền và cơ chế thanh toán hai giai đoạn.
- [ ] Thêm ràng buộc một lượt chưa giải quyết/khách; giới hạn 3 lần hủy/hết hạn/ngày, timestamp/lý do miễn trừ và audit; Lazy Expiration cho cả customer lẫn vehicle.
- [ ] Áp dụng Global Lock Order station → customer → wallet → vehicle → rental và ID tăng dần; review cả khóa ẩn khi UPDATE/FK. Customer là khóa điều phối chung, không tùy luồng thay bằng wallet.
- [ ] API cập nhật pin có quyền/audit; dùng COUNT/View cho rentable_vehicles và free_slots, không lưu bộ đếm trong stations; xử lý cả xe RETURN_PENDING.
- [ ] Test phí: 30 phút, 30 phút + giây lẻ, 31 phút, 31 phút + giây lẻ; đổi cả hai mức giá sau giữ; pin 29/30; đúng sinh nhật 16 tuổi/CCCD hết hạn.
- [ ] Test hai xe/một khách, hai khách/một xe; Lazy Expiration cả hai phía, thời điểm sau chờ khóa; lần hủy thứ ba/thứ tư, qua nửa đêm Việt Nam và hủy do lỗi xe miễn trừ.
- [ ] Test hai xe tranh chỗ cuối khi initiate-return; ví khóa/thiếu tiền vẫn dừng cước khi đã nhận xe; quote đúng 10 phút hết hạn, retry không đổi return_initiated_at/không tạo RETURN thứ hai; quyết toán khi trạm đã đầy do xe vừa nhận.
- [ ] Test cọc thiếu/thừa, nạp ví đồng thời, thứ tự khóa và rollback riêng từng giai đoạn tiếp nhận/quyết toán trên PostgreSQL thật.
- [ ] Mục 9 — Chỉ bật thanh toán mô phỏng qua `DEMO_PAYMENTS_ENABLED`; hiển thị nhãn “Tiền mô phỏng” tại giao diện ví/nạp tiền/thanh toán. Khi cờ tắt, backend phải từ chối thao tác nạp tiền demo.
- [ ] Mục 9 — Mô tả interface `PaymentProvider` và cách tách phần thanh toán mô phỏng khỏi nghiệp vụ thuê xe. Ghi rõ provider thật, webhook xác nhận tại backend và đối soát nằm ngoài V1; không triển khai hoặc bật thanh toán production.
- [ ] Mục 11 — Đồng bộ ma trận quyền: STAFF được pickup/return/move tại mọi trạm; MANAGER quản trị toàn hệ thống. Không bổ sung `staff_station_assignments` trong V1; ghi chú phân quyền theo trạm là phần mở rộng production.
- [ ] Mục 11 — Các thao tác STAFF vẫn phải kiểm tra đầy đủ điều kiện nghiệp vụ và ghi audit người thực hiện/thời điểm; quyền toàn hệ thống không cho phép bỏ qua giới hạn trạng thái xe/chuyến hoặc sức chứa trạm.
- [ ] Mục 12 — Bổ sung đề xuất quy trình sự cố/mất xe và lấy ý kiến duyệt trước khi triển khai, bao gồm trạng thái rental/vehicle, quyền thao tác, xử lý khi tìm lại xe và chính sách tài chính. Tiếp tục giữ các ràng buộc STOLEN đã chốt tại mục 6.
## Nguồn tham khảo và cách áp dụng

Kiểm tra nguồn ngày 02/11/2026. Chỉ tham khảo mô hình; không coi chính sách của một nước/dòng xe là điều kiện pháp lý áp dụng cho toàn bộ xe máy điện tại Việt Nam.

1. [TNGo — Bảng giá dịch vụ](https://tngo.vn/price): công bố nhiều gói theo thời lượng, trong đó xe đạp điện có vé 15 phút và 30 phút. EVRide tham khảo cách công khai thời lượng/giá cho chuyến ngắn; không sao chép gói vé, mức giá hoặc cơ chế điểm. TNGo phục vụ cả xe đạp, nên không dùng làm căn cứ GPLX cho xe máy điện.
2. [Yulu — Long Term Rental, FAQ](https://rentals.yulu.bike/): trang FAQ nêu tối đa một xe mỗi tài khoản và đề cập cọc. EVRide tham khảo giới hạn một xe và tách cọc; trang có nội dung chương trình cũ nên không dùng để khẳng định mức cước hiện hành.
3. [Cooltra — FAQ](https://cooltra.com/en/faqs/): nội dung FAQ được lập chỉ mục nêu giấy tờ định danh, GPLX hợp lệ phù hợp quốc gia và cọc cho thuê scooter/motorbike. EVRide tham khảo quy trình xác minh/cọc, không sao chép số tiền EUR hoặc hạng GPLX. Trang trực tiếp trả lỗi khi mở trong lần kiểm tra, nên nguồn này chỉ là tham khảo bổ trợ.