// Bản đồ enum -> nhãn tiếng Việt và màu sắc hiển thị theo contract V1.
// Các badge luôn hiển thị cả nhãn chữ lẫn tông màu rõ ràng để thân thiện với người mù màu.

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
  promotionStatus: {
    ACTIVE: { label: 'Đang bật (ACTIVE)', tone: 'success' },
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
