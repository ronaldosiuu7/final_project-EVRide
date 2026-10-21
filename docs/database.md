// EVRide – Hệ thống quản lý cho thuê ô tô điện theo trạm
// Cập nhật thiết kế: 21/10/2026.
// File dùng cú pháp DBML để nhập vào công cụ vẽ ERD; chưa phải migration SQL.
// Chỉ đặt xe đang có sẵn, giữ 30 phút; không đặt trước nhiều ngày.
// Hết hạn phải tạo lượt đặt mới, không gia hạn hoặc ghi đè lượt cũ.
// Các ràng buộc giao dịch/chỉ mục có điều kiện cần triển khai trong migration và backend (mục 3).
//
// ==========================================
// 1. ĐỊNH NGHĨA CÁC BẢNG (TABLES)
// ==========================================

// Bảng lưu thông tin chi tiết các trạm xe điện (vị trí, thời gian hoạt động, sức chứa)
Table stations {
  id bigint [primary key]
  name varchar(120) [not null]
  address text [not null]
  latitude numeric(9,6) [not null]
  longitude numeric(9,6) [not null]
  capacity int [not null]
  opens_at time
  closes_at time
  status varchar(20) [not null]
}

// Bảng lưu thông tin tài khoản người dùng (khách hàng, nhân viên, quản lý)
Table users {
  id bigint [primary key]
  name varchar(100) [not null]
  email varchar(100) [unique, not null]
  password varchar(255) [not null]
  role varchar(20) [note: 'CUSTOMER / STAFF / MANAGER', not null]
  status varchar(20) [note: 'ACTIVE / INACTIVE / BLOCKED / BLACKLISTED', not null]
  created_at timestamptz [not null]
}

// Bảng lưu tài liệu xác thực danh tính (eKYC) và giấy phép lái xe của người dùng
Table user_documents {
  id bigint [primary key]
  user_id bigint [not null]
  document_type varchar(30) [note: 'CCCD / PASSPORT / DRIVER_LICENSE', not null]
  document_number varchar(50) [not null]
  image_front_url text [not null]
  image_back_url text
  verified_status varchar(20) [note: 'PENDING / VERIFIED / REJECTED', not null]
  created_at timestamptz [not null]
}

// Bảng lưu thông tin ví điện tử và số dư tài khoản của từng người dùng
Table wallets {
  id bigint [primary key]
  user_id bigint [unique, not null]
  balance numeric(12,2) [not null, default: 0]
  status varchar(20) [note: 'ACTIVE / FROZEN / LOCKED', not null]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

// Xe RESERVED vẫn ở trạm và chiếm chỗ đỗ; khi bàn giao, chuyển RENTED và current_station_id = NULL.
// Khi trả xe, cập nhật trạm thực tế và chuyển AVAILABLE hoặc MAINTENANCE theo tình trạng xe.
Table vehicles {
  id bigint [primary key]
  current_station_id bigint [null]
  name varchar(100) [not null]
  type varchar(50) [not null]
  battery_percent int [not null]
  status varchar(20) [note: 'AVAILABLE / RESERVED / RENTED / MAINTENANCE / SUSPECTED_STOLEN / STOLEN', not null]
  daily_price numeric(12,2) [not null]
  deposit_amount numeric(12,2) [not null]
  created_at timestamptz [not null]
}

// Mỗi dòng là một lượt đặt; khi nhận xe, tiếp tục dùng dòng đó cho chuyến thuê.
// RESERVED -> IN_RENT -> COMPLETED; RESERVED -> CANCELLED hoặc EXPIRED.
// STOLEN giữ lại cho xử lý sự cố trong chuyến; không tự động giải phóng xe.
// Không dùng PENDING/CONFIRMED vì giữ chỗ thành công được biểu diễn bằng RESERVED.
// Chưa dùng OVERDUE vì phiên bản này chưa chốt thời hạn trả xe hoặc chính sách quá hạn.
Table rentals {
  id bigint [primary key]
  customer_id bigint [not null]
  vehicle_id bigint [not null]
  pickup_station_id bigint [not null]
  actual_return_station_id bigint [null]
  expires_at timestamptz [not null, note: 'created_at + 30 phút; backend ấn định, không gia hạn']
  actual_start_time timestamptz [null, note: 'Thời điểm nhân viên bàn giao thành công; bắt đầu thời gian thuê']
  actual_end_time timestamptz [null, note: 'Thời điểm nhân viên nhận lại xe thực tế']
  status varchar(20) [not null, default: 'RESERVED', note: 'RESERVED / IN_RENT / STOLEN / COMPLETED / CANCELLED / EXPIRED']
  total_price numeric(12,2) [null, note: 'NULL khi chưa chốt phí; 0 chỉ khi thực sự miễn phí']
  created_at timestamptz [not null, note: 'Thời điểm tạo lượt giữ chỗ do backend ấn định']

  indexes {
    (status, expires_at) [name: 'idx_rentals_status_expires_at']
    (customer_id, created_at) [name: 'idx_rentals_customer_created_at']
    vehicle_id [name: 'idx_rentals_vehicle_id']
  }
}

// Bảng lưu đánh giá số sao và nhận xét của khách hàng sau khi kết thúc chuyến đi
Table rental_reviews {
  id bigint [primary key]
  rental_id bigint [unique, not null]
  rating int [not null, note: '1 to 5 stars']
  comment text
  created_at timestamptz [not null]
}

// Bảng lưu biên bản bàn giao xe lúc bắt đầu và nhận lại xe khi kết thúc chuyến
Table handovers {
  id bigint [primary key]
  rental_id bigint [not null]
  staff_id bigint [not null]
  kind varchar(10) [note: 'PICKUP / RETURN', not null]
  time timestamptz [not null]
  battery_percent int [not null]
  note text
  created_at timestamptz [not null]

  indexes {
    (rental_id, kind) [unique, name: 'uq_handovers_rental_kind']
  }
}

// Bảng lưu hóa đơn thanh toán chi phí cho từng lượt thuê xe hoàn tất
Table invoices {
  id bigint [primary key]
  rental_id bigint [unique, not null]
  total_amount numeric(12,2) [not null]
  status varchar(20) [note: 'UNPAID / PAID / CANCELLED', not null]
  created_at timestamptz [not null]
}

// Bảng lưu lịch sử các giao dịch tài chính (đặt cọc, thanh toán, hoàn tiền, tiền phạt)
Table transactions {
  id bigint [primary key]
  rental_id bigint [not null]
  invoice_id bigint [null]
  actor_id bigint [not null]
  amount numeric(12,2) [not null]
  kind varchar(20) [note: 'PAYMENT / DEPOSIT / REFUND / FEE', not null]
  status varchar(20) [not null]
  created_at timestamptz [not null]
}

// Bảng lưu lịch sử biến động số dư ví điện tử (nạp tiền, rút tiền, trừ tiền thuê)
Table wallet_transactions {
  id bigint [primary key]
  wallet_id bigint [not null]
  rental_id bigint [null]
  amount numeric(12,2) [not null]
  type varchar(30) [note: 'TOPUP / WITHDRAW / RENTAL_PAYMENT / RENTAL_DEPOSIT / RENTAL_REFUND', not null]
  balance_before numeric(12,2) [not null]
  balance_after numeric(12,2) [not null]
  status varchar(20) [note: 'PENDING / SUCCESS / FAILED', not null]
  created_at timestamptz [not null]
}

// Bảng lưu định nghĩa các chương trình khuyến mãi và điều kiện sử dụng mã giảm giá
Table promotions {
  id bigint [primary key]
  code varchar(50) [unique, not null]
  description text
  discount_percent int [null, note: 'VD: 10%']
  max_discount_amount numeric(12,2) [null]
  min_rental_amount numeric(12,2) [null]
  start_date timestamptz [not null]
  end_date timestamptz [not null]
  status varchar(20) [note: 'ACTIVE / EXPIRED / DISABLED', not null]
  created_at timestamptz [not null]
}

// Bảng lưu kho mã giảm giá cá nhân và trạng thái đã sử dụng của từng người dùng
Table user_promotions {
  id bigint [primary key]
  user_id bigint [not null]
  promotion_id bigint [not null]
  is_used boolean [not null, default: false]
  used_at timestamptz [null]
}

// Bảng lưu các sự cố, yêu cầu trợ giúp và tiến trình xử lý hỗ trợ người dùng
Table support_tickets {
  id bigint [primary key]
  rental_id bigint [not null]
  created_by bigint [not null]
  assigned_to bigint [null]
  title varchar(200) [not null]
  description text [not null]
  status varchar(20) [note: 'OPEN / IN_PROGRESS / RESOLVED / CLOSED', not null]
  created_at timestamptz [not null]
}

// Bảng lưu dữ liệu tọa độ định vị GPS theo thời gian thực của xe trong chuyến đi
Table gps_points {
  id bigint [primary key]
  rental_id bigint [not null]
  latitude numeric(9,6) [not null]
  longitude numeric(9,6) [not null]
  recorded_at timestamptz [not null]
}

// ==========================================
// 2. MỐI QUAN HỆ (RELATIONSHIPS)
// ==========================================

// Quản lý người dùng & Giấy tờ / Ví điện tử
Ref: user_documents.user_id > users.id
Ref: wallets.user_id - users.id
Ref: wallet_transactions.wallet_id > wallets.id
Ref: wallet_transactions.rental_id > rentals.id

// Khuyến mãi / Mã giảm giá
Ref: user_promotions.user_id > users.id
Ref: user_promotions.promotion_id > promotions.id

// Quản lý Xe & Trạm
Ref: vehicles.current_station_id > stations.id

// Đơn thuê xe (Rentals) & Đánh giá
Ref: rentals.customer_id > users.id
Ref: rentals.vehicle_id > vehicles.id
Ref: rentals.pickup_station_id > stations.id
Ref: rentals.actual_return_station_id > stations.id
Ref: rental_reviews.rental_id - rentals.id

// Bàn giao xe (Handovers)
Ref: handovers.rental_id > rentals.id
Ref: handovers.staff_id > users.id

// Hóa đơn (Invoices)
Ref: invoices.rental_id - rentals.id

// Giao dịch (Transactions)
Ref: transactions.rental_id > rentals.id
Ref: transactions.invoice_id > invoices.id
Ref: transactions.actor_id > users.id

// Hỗ trợ (Support Tickets)
Ref: support_tickets.rental_id > rentals.id
Ref: support_tickets.created_by > users.id
Ref: support_tickets.assigned_to > users.id

// Tọa độ GPS (GPS Points)
Ref: gps_points.rental_id > rentals.id

// ==========================================
// 3. QUY TẮC CẦN TRIỂN KHAI TRONG MIGRATION VÀ BACKEND
// ==========================================
//
// 3.1. Thời hạn giữ xe
// - Lưu thời gian bằng timestamptz, thống nhất UTC; giao diện hiển thị giờ Việt Nam.
// - expires_at = created_at + INTERVAL '30 minutes', không cho khách tự truyền hoặc sửa.
// - Chỉ nhận xe khi status = RESERVED và thời điểm xác nhận thực tế < expires_at.
// - Tại hoặc sau expires_at, không được nhận xe dù tác vụ dọn hết hạn chưa chạy.
// - Khi hết hạn, chuyển RESERVED -> EXPIRED; chỉ giải phóng xe nếu xe vẫn RESERVED
//   cho lượt đó và không có sự cố ngăn vận hành. Không đổi xe MAINTENANCE/STOLEN thành AVAILABLE.
// - Khách muốn thuê tiếp phải tạo rentals mới với id, created_at, expires_at mới,
//   kiểm tra lại xe có sẵn. Giữ nguyên lượt EXPIRED để lưu lịch sử.
// - expires_at không phải hạn trả xe; không áp dụng hết hạn giữ chỗ cho IN_RENT.
// - Hủy chỉ áp dụng khi còn RESERVED và chưa hết hạn; không biến lượt EXPIRED thành CANCELLED.
//
// 3.2. Chống đặt trùng và tranh chấp nhận/hủy/hết hạn
// - Tạo partial unique index trong PostgreSQL cho rentals(vehicle_id)
//   WHERE status IN ('RESERVED', 'IN_RENT', 'STOLEN').
// - Không đưa thời gian hiện tại vào điều kiện index. Lượt RESERVED đã quá hạn phải được
//   chuyển EXPIRED trong giao dịch trước khi tạo lượt mới cho xe đó.
// - Khóa dòng xe và lượt thuê liên quan trong cùng giao dịch khi đặt, nhận, hủy hoặc hết hạn.
// - Sau khi lấy khóa, kiểm tra lại trạng thái và thời gian thực tế; không dùng mốc thời gian
//   cũ từ trước khi chờ khóa để cho phép nhận xe đã hết hạn.
// - Cập nhật rentals, vehicles và biên bản bàn giao nguyên tử; lỗi phải rollback toàn bộ.
// - Có tác vụ dọn giữ chỗ hết hạn; API vẫn phải kiểm tra hạn trực tiếp để đảm bảo đúng quy tắc.
//
// 3.3. Nhận/trả xe và sức chứa trạm
// - Nhận xe: nhân viên xác nhận đúng xe/trạm/lượt đặt, ghi PICKUP và actual_start_time,
//   chuyển rentals thành IN_RENT, vehicles thành RENTED và xóa current_station_id.
// - Trạm trả có thể khác trạm nhận. Chỉ xác nhận trả khi trạm hoạt động và còn chỗ.
// - Số chỗ đã dùng tính từ tất cả xe có current_station_id tại trạm, gồm xe RESERVED
//   và MAINTENANCE đang đỗ ở đó; không chỉ đếm xe AVAILABLE.
// - Khóa dòng trạm đích, kiểm tra lại sức chứa trong giao dịch trước khi nhận xe.
//   Mọi thao tác đưa xe vào trạm (trả xe, thêm xe, điều chuyển) phải dùng cùng cơ chế khóa.
// - Việc khách xem/chọn trạm không giữ trước chỗ đỗ.
// - Khi trả, ghi RETURN, actual_end_time, actual_return_station_id, cập nhật xe và phí.
// - Chỉ COMPLETED khi đã nhận xe và thanh toán thành công; không trừ ví hoặc tạo hóa đơn
//   hai lần khi gửi lại yêu cầu. Cách xử lý trả xe nhưng thiếu tiền cần chốt trước triển khai.
//
// 3.4. Ràng buộc dữ liệu
// - Migration phải giới hạn các giá trị status/role/kind theo danh sách đã khai báo;
//   note trong DBML chỉ mô tả, không tự tạo CHECK constraint.
// - expires_at = created_at + INTERVAL '30 minutes'.
// - actual_start_time nếu có phải >= created_at và < expires_at.
// - actual_end_time nếu có phải có actual_start_time và >= actual_start_time.
// - RESERVED/CANCELLED/EXPIRED: chưa có thời điểm nhận/trả và trạm trả thực tế.
// - IN_RENT/STOLEN: phải có actual_start_time.
// - COMPLETED: phải có cả thời điểm nhận/trả, trạm trả và total_price >= 0.
// - actual_end_time và actual_return_station_id phải cùng có hoặc cùng chưa có.
// - capacity > 0; battery_percent trong [0, 100]; tiền và giá không âm.
// - Mỗi lượt thuê chỉ có một biên bản PICKUP và một RETURN (unique index ở handovers).
// - Cột FK nullable dùng [null]; quan hệ DBML dùng > hoặc -, không dùng >?.
// - users.password phải chứa mật khẩu đã băm, không lưu mật khẩu nguyên văn.
//
// 3.5. Các quyết định chưa chốt
// - daily_price/deposit_amount đang giữ theo thiết kế cũ; cần chốt đơn vị giá, cách làm tròn,
//   thời điểm thu cọc, hoàn cọc và phí hủy/hết hạn. Chưa suy ra hết hạn là tự động mất cọc.
// - Khi triển khai tính phí cần lưu giá/chính sách đã áp dụng để thay đổi bảng giá không
//   làm thay đổi tiền của các chuyến cũ.
// - Luồng xử lý mất xe, trả xe thiếu tiền, bảo trì chi tiết và áp dụng khuyến mãi cần đặc tả thêm.
// - Sau khi chốt thiết kế này, cập nhật ER_diagram.pdf và tạo migration; file này không
//   tự cập nhật PDF hoặc database PostgreSQL.
