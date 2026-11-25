// Bản đồ enum -> nhãn tiếng Việt và màu sắc hiển thị theo contract V1.
// - STATUS_CONFIG & getStatusMeta: giữ tương thích hoàn toàn cho khu vực vận hành (#16).
// - CUSTOMER_STATUS_CONFIG & getCustomerStatusMeta: nhãn tiếng Việt tự nhiên cho khách hàng (#15),
//   tuyệt đối không hiển thị mã enum thô trên giao diện khách hàng.

export const STATUS_CONFIG = {
  userRole: {
    CUSTOMER: { label: 'Khách hàng (CUSTOMER)', tone: 'neutral' },
    STAFF: { label: 'Nhân viên (STAFF)', tone: 'info' },
    MANAGER: { label: 'Quản lý (MANAGER)', tone: 'success' },
  },
  userStatus: {
    ACTIVE: { label: 'Đang hoạt động (ACTIVE)', tone: 'success' },
    INACTIVE: { label: 'Ngừng hoạt động (INACTIVE)', tone: 'neutral' },
    BLOCKED: { label: 'Bị khóa (BLOCKED)', tone: 'danger' },
    BLACKLISTED: { label: 'Danh sách đen (BLACKLISTED)', tone: 'danger' },
  },
  documentType: {
    CCCD: { label: 'CCCD', tone: 'info' },
    PASSPORT: { label: 'Hộ chiếu', tone: 'info' },
    DRIVER_LICENSE: { label: 'GPLX', tone: 'info' },
  },
  documentStatus: {
    PENDING: { label: 'Chờ duyệt (PENDING)', tone: 'warning' },
    VERIFIED: { label: 'Đã xác minh (VERIFIED)', tone: 'success' },
    REJECTED: { label: 'Từ chối (REJECTED)', tone: 'danger' },
    REVOKED: { label: 'Đã thu hồi (REVOKED)', tone: 'danger' },
  },
  stationStatus: {
    ACTIVE: { label: 'Hoạt động (ACTIVE)', tone: 'success' },
    INACTIVE: { label: 'Ngừng hoạt động (INACTIVE)', tone: 'danger' },
  },
  vehicleStatus: {
    AVAILABLE: { label: 'Sẵn sàng (AVAILABLE)', tone: 'success' },
    RESERVED: { label: 'Đang giữ chỗ (RESERVED)', tone: 'warning' },
    RENTED: { label: 'Đang cho thuê (RENTED)', tone: 'info' },
    RETURN_PENDING: { label: 'Chờ quyết toán (RETURN_PENDING)', tone: 'warning' },
    MAINTENANCE: { label: 'Bảo trì (MAINTENANCE)', tone: 'danger' },
    SUSPECTED_STOLEN: { label: 'Nghi mất/trộm (SUSPECTED_STOLEN)', tone: 'danger' },
    STOLEN: { label: 'Mất xe (STOLEN)', tone: 'danger' },
  },
  walletStatus: {
    ACTIVE: { label: 'Hoạt động (ACTIVE)', tone: 'success' },
    FROZEN: { label: 'Đóng băng (FROZEN)', tone: 'warning' },
    LOCKED: { label: 'Đã khóa (LOCKED)', tone: 'danger' },
  },
  topupStatus: {
    PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
    APPROVED: { label: 'Đã duyệt', tone: 'success' },
    REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  },
  walletTransactionType: {
    TOPUP: { label: 'Nạp tiền vào ví', tone: 'success' },
    WITHDRAW: { label: 'Rút tiền', tone: 'neutral' },
    RENTAL_DEPOSIT: { label: 'Thu tiền cọc chuyến', tone: 'warning' },
    RENTAL_PAYMENT: { label: 'Thanh toán tiền thuê', tone: 'info' },
    RENTAL_REFUND: { label: 'Hoàn tiền cọc dư', tone: 'success' },
    COMPENSATION_PAYMENT: { label: 'Thu bồi thường', tone: 'danger' },
    COMPENSATION_REFUND: { label: 'Hoàn tiền bồi thường', tone: 'success' },
  },
  promotionStatus: {
    ACTIVE: { label: 'Đang bật (ACTIVE)', tone: 'success' },
    EXPIRED: { label: 'Hết hạn (EXPIRED)', tone: 'neutral' },
    DISABLED: { label: 'Đã tắt (DISABLED)', tone: 'neutral' },
  },
  promotionType: {
    PERCENTAGE: { label: 'Giảm theo %', tone: 'info' },
    FIXED_AMOUNT: { label: 'Giảm số tiền cố định', tone: 'info' },
  },
  rentalStatus: {
    RESERVED: { label: 'Đang giữ chỗ (RESERVED)', tone: 'warning' },
    IN_RENT: { label: 'Đang thuê (IN_RENT)', tone: 'info' },
    RETURN_PENDING: { label: 'Chờ quyết toán (RETURN_PENDING)', tone: 'warning' },
    COMPLETED: { label: 'Hoàn tất (COMPLETED)', tone: 'success' },
    CANCELLED: { label: 'Đã hủy (CANCELLED)', tone: 'neutral' },
    EXPIRED: { label: 'Hết hạn giữ (EXPIRED)', tone: 'neutral' },
    STOLEN: { label: 'Mất xe (STOLEN)', tone: 'danger' },
    INCIDENT_PENDING: { label: 'Đang xử lý sự cố (INCIDENT_PENDING)', tone: 'danger' },
    CLOSED_INCIDENT: { label: 'Đã đóng sự cố (CLOSED_INCIDENT)', tone: 'neutral' },
  },
  rentalTransactionKind: {
    DEPOSIT: { label: 'Thu tiền cọc', tone: 'warning' },
    PAYMENT: { label: 'Thanh toán tiền thuê', tone: 'info' },
    REFUND: { label: 'Hoàn tiền cọc dư', tone: 'success' },
    FEE: { label: 'Phí dịch vụ', tone: 'neutral' },
    ADJUSTMENT: { label: 'Điều chỉnh', tone: 'neutral' },
  },
  invoiceStatus: {
    PAID: { label: 'Đã thanh toán', tone: 'success' },
    UNPAID: { label: 'Chưa thanh toán', tone: 'warning' },
    CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  },
  handoverKind: {
    PICKUP: { label: 'Bàn giao nhận xe', tone: 'info' },
    RETURN: { label: 'Tiếp nhận trả xe', tone: 'success' },
  },
  vehicleCondition: {
    OK: { label: 'Bình thường', tone: 'success' },
    NEEDS_MAINTENANCE: { label: 'Cần kiểm tra kỹ thuật', tone: 'warning' },
  },
  ticketStatus: {
    OPEN: { label: 'Mới mở (OPEN)', tone: 'warning' },
    IN_PROGRESS: { label: 'Đang xử lý (IN_PROGRESS)', tone: 'info' },
    RESOLVED: { label: 'Đã giải quyết (RESOLVED)', tone: 'success' },
    CLOSED: { label: 'Đã đóng (CLOSED)', tone: 'neutral' },
  },
  maintenanceStatus: {
    OPEN: { label: 'Chờ xử lý (OPEN)', tone: 'warning' },
    IN_PROGRESS: { label: 'Đang sửa chữa (IN_PROGRESS)', tone: 'info' },
    COMPLETED: { label: 'Hoàn tất (COMPLETED)', tone: 'success' },
    CANCELLED: { label: 'Đã hủy (CANCELLED)', tone: 'neutral' },
  },
  incidentStatus: {
    OPEN: { label: 'Mới tạo (OPEN)', tone: 'warning' },
    INVESTIGATING: { label: 'Đang điều tra (INVESTIGATING)', tone: 'info' },
    CONFIRMED: { label: 'Đã xác nhận (CONFIRMED)', tone: 'danger' },
    DISMISSED: { label: 'Báo nhầm (DISMISSED)', tone: 'neutral' },
    CLOSED: { label: 'Đã đóng hồ sơ (CLOSED)', tone: 'success' },
  },
  incidentOutcome: {
    FALSE_ALARM: { label: 'Báo nhầm (FALSE_ALARM)', tone: 'neutral' },
    LOSS_THEFT: { label: 'Mất / Trộm (LOSS_THEFT)', tone: 'danger' },
    ABANDONMENT: { label: 'Bỏ xe (ABANDONMENT)', tone: 'warning' },
  },
  recoveryCondition: {
    INTACT: { label: 'Nguyên vẹn (INTACT)', tone: 'success' },
    REPAIRABLE: { label: 'Hư hỏng sửa được (REPAIRABLE)', tone: 'warning' },
    UNREPAIRABLE: { label: 'Hư hỏng không sửa được (UNREPAIRABLE)', tone: 'danger' },
  },
  agreementStatus: {
    PENDING: { label: 'Chưa xác định (PENDING)', tone: 'neutral' },
    DISPUTED: { label: 'Đang trao đổi (DISPUTED)', tone: 'warning' },
    AGREED: { label: 'Đã thỏa thuận (AGREED)', tone: 'success' },
    AUTHORITY_DECISION: { label: 'Quyết định cơ quan thẩm quyền (AUTHORITY_DECISION)', tone: 'info' },
    NOT_REQUIRED: { label: 'Không yêu cầu bồi thường (NOT_REQUIRED)', tone: 'success' },
  },
  revenueType: {
    NORMAL: { label: 'Chuyến thường', tone: 'success' },
    INCIDENT: { label: 'Thuê sự cố', tone: 'warning' },
  },
  transactionStatus: {
    PENDING: { label: 'Đang xử lý', tone: 'warning' },
    SUCCESS: { label: 'Thành công', tone: 'success' },
    FAILED: { label: 'Thất bại', tone: 'danger' },
  },
};

export const CUSTOMER_STATUS_CONFIG = {
  userRole: {
    CUSTOMER: { label: 'Khách hàng', tone: 'neutral' },
    STAFF: { label: 'Nhân viên vận hành', tone: 'info' },
    MANAGER: { label: 'Quản lý hệ thống', tone: 'success' },
  },
  userStatus: {
    ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
    INACTIVE: { label: 'Ngừng hoạt động', tone: 'neutral' },
    BLOCKED: { label: 'Đang bị khóa', tone: 'danger' },
    BLACKLISTED: { label: 'Hạn chế sử dụng', tone: 'danger' },
  },
  documentType: {
    CCCD: { label: 'Căn cước công dân', tone: 'info' },
    PASSPORT: { label: 'Hộ chiếu', tone: 'info' },
    DRIVER_LICENSE: { label: 'Giấy phép lái xe', tone: 'info' },
  },
  documentStatus: {
    PENDING: { label: 'Chờ xác minh', tone: 'warning' },
    VERIFIED: { label: 'Đã xác minh', tone: 'success' },
    REJECTED: { label: 'Cần nộp lại', tone: 'danger' },
    REVOKED: { label: 'Đã thu hồi hiệu lực', tone: 'danger' },
  },
  stationStatus: {
    ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
    INACTIVE: { label: 'Tạm ngưng phục vụ', tone: 'danger' },
  },
  vehicleStatus: {
    AVAILABLE: { label: 'Sẵn sàng đặt xe', tone: 'success' },
    RESERVED: { label: 'Đang được giữ chỗ', tone: 'warning' },
    RENTED: { label: 'Đang cho thuê', tone: 'info' },
    RETURN_PENDING: { label: 'Đang chờ quyết toán', tone: 'warning' },
    MAINTENANCE: { label: 'Đang bảo trì', tone: 'danger' },
    SUSPECTED_STOLEN: { label: 'Đang kiểm tra sự cố', tone: 'danger' },
    STOLEN: { label: 'Đang xử lý mất xe', tone: 'danger' },
  },
  walletStatus: {
    ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
    FROZEN: { label: 'Tạm đóng băng', tone: 'warning' },
    LOCKED: { label: 'Đã khóa giao dịch', tone: 'danger' },
  },
  topupStatus: STATUS_CONFIG.topupStatus,
  walletTransactionType: STATUS_CONFIG.walletTransactionType,
  promotionStatus: {
    ACTIVE: { label: 'Đang áp dụng', tone: 'success' },
    EXPIRED: { label: 'Đã hết hạn', tone: 'neutral' },
    DISABLED: { label: 'Tạm ngưng', tone: 'neutral' },
  },
  promotionType: STATUS_CONFIG.promotionType,
  rentalStatus: {
    RESERVED: { label: 'Đang giữ chỗ', tone: 'warning' },
    IN_RENT: { label: 'Đang thuê xe', tone: 'info' },
    RETURN_PENDING: { label: 'Chờ quyết toán trả xe', tone: 'warning' },
    COMPLETED: { label: 'Đã hoàn tất', tone: 'success' },
    CANCELLED: { label: 'Đã hủy giữ chỗ', tone: 'neutral' },
    EXPIRED: { label: 'Hết hạn giữ chỗ', tone: 'neutral' },
    STOLEN: { label: 'Sự cố mất xe', tone: 'danger' },
    INCIDENT_PENDING: { label: 'Đang xử lý sự cố', tone: 'danger' },
    CLOSED_INCIDENT: { label: 'Đã đóng hồ sơ sự cố', tone: 'neutral' },
  },
  rentalTransactionKind: STATUS_CONFIG.rentalTransactionKind,
  invoiceStatus: STATUS_CONFIG.invoiceStatus,
  handoverKind: STATUS_CONFIG.handoverKind,
  vehicleCondition: STATUS_CONFIG.vehicleCondition,
  ticketStatus: {
    OPEN: { label: 'Đã tiếp nhận', tone: 'warning' },
    IN_PROGRESS: { label: 'Đang xử lý', tone: 'info' },
    RESOLVED: { label: 'Đã giải quyết', tone: 'success' },
    CLOSED: { label: 'Đã đóng', tone: 'neutral' },
  },
  incidentStatus: {
    OPEN: { label: 'Mới tiếp nhận', tone: 'warning' },
    INVESTIGATING: { label: 'Đang xác minh', tone: 'info' },
    CONFIRMED: { label: 'Đã xác nhận sự cố', tone: 'danger' },
    DISMISSED: { label: 'Báo nhầm (tiếp tục chuyến)', tone: 'neutral' },
    CLOSED: { label: 'Đã đóng hồ sơ', tone: 'success' },
  },
  incidentOutcome: {
    FALSE_ALARM: { label: 'Báo nhầm', tone: 'neutral' },
    LOSS_THEFT: { label: 'Mất hoặc trộm xe', tone: 'danger' },
    ABANDONMENT: { label: 'Bỏ xe ngoài trạm', tone: 'warning' },
  },
  agreementStatus: {
    PENDING: { label: 'Chưa xác định', tone: 'neutral' },
    DISPUTED: { label: 'Đang trao đổi', tone: 'warning' },
    AGREED: { label: 'Đã thống nhất bên ngoài', tone: 'success' },
    AUTHORITY_DECISION: { label: 'Theo quyết định cơ quan thẩm quyền', tone: 'info' },
    NOT_REQUIRED: { label: 'Không phải bồi thường', tone: 'success' },
  },
  transactionStatus: STATUS_CONFIG.transactionStatus,
};

export function getStatusMeta(domain, value) {
  if (value === null || value === undefined || value === '') {
    return { label: '—', tone: 'neutral' };
  }
  const map = domain ? STATUS_CONFIG[domain] : null;
  if (map && map[value]) {
    return map[value];
  }
  return { label: String(value), tone: 'neutral' };
}

/**
 * Lấy nhãn tiếng Việt thuần túy và màu hiển thị cho giao diện CUSTOMER (không bao giờ lộ enum thô).
 */
export function getCustomerStatusMeta(domain, value) {
  if (value === null || value === undefined || value === '') {
    return { label: '—', tone: 'neutral' };
  }
  const map = domain ? CUSTOMER_STATUS_CONFIG[domain] : null;
  if (map && map[value]) {
    return map[value];
  }
  return { label: 'Không xác định', tone: 'neutral' };
}
