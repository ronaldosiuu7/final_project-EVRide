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

// Bảng lưu thông tin danh mục xe điện, vị trí trạm hiện tại và trạng thái vận hành
Table vehicles {
  id bigint [primary key]
  current_station_id bigint [null]
  name varchar(100) [not null]
  type varchar(50) [not null]
  battery_percent int [not null]
  status varchar(20) [note: 'AVAILABLE / RENTED / MAINTENANCE / SUSPECTED_STOLEN / STOLEN', not null]
  daily_price numeric(12,2) [not null]
  deposit_amount numeric(12,2) [not null]
  created_at timestamptz [not null]
}

// Bảng lưu thông tin các đơn thuê xe, thời gian đặt chỗ và thời gian sử dụng thực tế
Table rentals {
  id bigint [primary key]
  customer_id bigint [not null]
  vehicle_id bigint [not null]
  pickup_station_id bigint [not null]
  actual_return_station_id bigint [null]
  planned_start_time timestamptz [not null]
  planned_end_time timestamptz [not null]
  actual_start_time timestamptz [null]
  actual_end_time timestamptz [null]
  status varchar(20) [note: 'PENDING / CONFIRMED / IN_RENT / OVERDUE / STOLEN / COMPLETED / CANCELLED', not null]
  total_price numeric(12,2) [not null]
  created_at timestamptz [not null]
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
Ref: wallet_transactions.rental_id >? rentals.id

// Khuyến mãi / Mã giảm giá
Ref: user_promotions.user_id > users.id
Ref: user_promotions.promotion_id > promotions.id

// Quản lý Xe & Trạm
Ref: vehicles.current_station_id >? stations.id

// Đơn thuê xe (Rentals) & Đánh giá
Ref: rentals.customer_id > users.id
Ref: rentals.vehicle_id > vehicles.id
Ref: rentals.pickup_station_id > stations.id
Ref: rentals.actual_return_station_id >? stations.id
Ref: rental_reviews.rental_id - rentals.id

// Bàn giao xe (Handovers)
Ref: handovers.rental_id > rentals.id
Ref: handovers.staff_id > users.id

// Hóa đơn (Invoices)
Ref: invoices.rental_id - rentals.id

// Giao dịch (Transactions)
Ref: transactions.rental_id > rentals.id
Ref: transactions.invoice_id >? invoices.id
Ref: transactions.actor_id > users.id

// Hỗ trợ (Support Tickets)
Ref: support_tickets.rental_id > rentals.id
Ref: support_tickets.created_by > users.id
Ref: support_tickets.assigned_to >? users.id

// Tọa độ GPS (GPS Points)
Ref: gps_points.rental_id > rentals.id