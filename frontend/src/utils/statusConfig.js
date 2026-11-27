// Bản đồ enum -> nhãn tiếng Việt tự nhiên và màu sắc hiển thị thống nhất toàn hệ thống EVRide.

export const STATUS_CONFIG = {
  userRole: {
    CUSTOMER: { label: 'Khách hàng', tone: 'neutral' },
    STAFF: { label: 'Nhân viên vận hành', tone: 'info' },
    MANAGER: { label: 'Quản lý', tone: 'success' },
  },
  userStatus: {
    ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
    INACTIVE: { label: 'Ngừng hoạt động', tone: 'neutral' },
    BLOCKED: { label: 'Đang bị khóa', tone: 'danger' },
    BLACKLISTED: { label: 'Hạn chế sử dụng', tone: 'danger' },
  },
  documentType: {
    CCCD: { label: 'CCCD', tone: 'info' },
    PASSPORT: { label: 'Hộ chiếu', tone: 'info' },
    DRIVER_LICENSE: { label: 'GPLX', tone: 'info' },
  },
  documentStatus: {
    PENDING: { label: 'Chờ duyệt', tone: 'warning' },
    VERIFIED: { label: 'Đã xác minh', tone: 'success' },
    REJECTED: { label: 'Đã từ chối', tone: 'danger' },
    REVOKED: { label: 'Đã thu hồi', tone: 'danger' },
  },
  stationStatus: {
    ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
    INACTIVE: { label: 'Ngừng hoạt động', tone: 'danger' },
  },
  vehicleStatus: {
    AVAILABLE: { label: 'Sẵn sàng', tone: 'success' },
    RESERVED: { label: 'Đang giữ chỗ', tone: 'warning' },
    RENTED: { label: 'Đang cho thuê', tone: 'info' },
    RETURN_PENDING: { label: 'Chờ quyết toán', tone: 'warning' },
    MAINTENANCE: { label: 'Đang bảo trì', tone: 'danger' },
    SUSPECTED_STOLEN: { label: 'Nghi mất / trộm', tone: 'danger' },
    STOLEN: { label: 'Mất xe', tone: 'danger' },
  },
  walletStatus: {
    ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
    FROZEN: { label: 'Tạm đóng băng', tone: 'warning' },
    LOCKED: { label: 'Đã khóa', tone: 'danger' },
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
    ACTIVE: { label: 'Đang áp dụng', tone: 'success' },
    EXPIRED: { label: 'Đã hết hạn', tone: 'neutral' },
    DISABLED: { label: 'Đã tạm tắt', tone: 'neutral' },
  },
  promotionType: {
    PERCENTAGE: { label: 'Giảm theo %', tone: 'info' },
    FIXED_AMOUNT: { label: 'Giảm số tiền cố định', tone: 'info' },
  },
  rentalStatus: {
    RESERVED: { label: 'Đang giữ chỗ', tone: 'warning' },
    IN_RENT: { label: 'Đang thuê', tone: 'info' },
    RETURN_PENDING: { label: 'Chờ quyết toán', tone: 'warning' },
    COMPLETED: { label: 'Hoàn tất', tone: 'success' },
    CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
    EXPIRED: { label: 'Hết hạn giữ', tone: 'neutral' },
    STOLEN: { label: 'Mất xe', tone: 'danger' },
    INCIDENT_PENDING: { label: 'Đang xử lý sự cố', tone: 'danger' },
    CLOSED_INCIDENT: { label: 'Đã đóng sự cố', tone: 'neutral' },
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
    OPEN: { label: 'Mới mở', tone: 'warning' },
    IN_PROGRESS: { label: 'Đang xử lý', tone: 'info' },
    RESOLVED: { label: 'Đã giải quyết', tone: 'success' },
    CLOSED: { label: 'Đã đóng', tone: 'neutral' },
  },
  maintenanceStatus: {
    OPEN: { label: 'Chờ xử lý', tone: 'warning' },
    IN_PROGRESS: { label: 'Đang sửa chữa', tone: 'info' },
    COMPLETED: { label: 'Hoàn tất', tone: 'success' },
    CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  },
  incidentStatus: {
    OPEN: { label: 'Mới tạo', tone: 'warning' },
    INVESTIGATING: { label: 'Đang điều tra', tone: 'info' },
    CONFIRMED: { label: 'Đã xác nhận', tone: 'danger' },
    DISMISSED: { label: 'Báo nhầm', tone: 'neutral' },
    CLOSED: { label: 'Đã đóng hồ sơ', tone: 'success' },
  },
  incidentOutcome: {
    FALSE_ALARM: { label: 'Báo nhầm', tone: 'neutral' },
    LOSS_THEFT: { label: 'Mất / Trộm', tone: 'danger' },
    ABANDONMENT: { label: 'Bỏ xe', tone: 'warning' },
  },
  recoveryCondition: {
    INTACT: { label: 'Nguyên vẹn', tone: 'success' },
    REPAIRABLE: { label: 'Hư hỏng sửa được', tone: 'warning' },
    UNREPAIRABLE: { label: 'Hư hỏng không sửa được', tone: 'danger' },
  },
  agreementStatus: {
    PENDING: { label: 'Chưa xác định', tone: 'neutral' },
    DISPUTED: { label: 'Đang trao đổi', tone: 'warning' },
    AGREED: { label: 'Đã thỏa thuận', tone: 'success' },
    AUTHORITY_DECISION: { label: 'Quyết định cơ quan thẩm quyền', tone: 'info' },
    NOT_REQUIRED: { label: 'Không yêu cầu bồi thường', tone: 'success' },
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
  reportSource: {
    CUSTOMER: { label: 'Khách hàng báo', tone: 'info' },
    STAFF: { label: 'Nhân viên ghi nhận', tone: 'neutral' },
    SYSTEM: { label: 'Cảnh báo hệ thống', tone: 'warning' },
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
 * Lấy nhãn tiếng Việt thuần túy và màu hiển thị cho giao diện khách hàng (không lộ mã nội bộ).
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
