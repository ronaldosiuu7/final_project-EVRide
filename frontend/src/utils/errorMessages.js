// Ánh xạ mã lỗi chuẩn hóa từ backend (api-contract.md mục 2.3 & các module nghiệp vụ).
// Frontend luôn xử lý theo error.code, không so sánh chuỗi message.

export const ERROR_MESSAGES_BY_CODE = {
  // 400
  INVALID_DATE_RANGE: 'Khoảng ngày không hợp lệ (từ ngày phải nhỏ hơn hoặc bằng đến ngày).',
  DATE_RANGE_REQUIRED: 'Cần truyền cả từ ngày và đến ngày cùng nhau.',
  INVALID_REQUEST: 'Yêu cầu không hợp lệ.',
  SESSION_SELECTION_REQUIRED: 'Thiếu mã phiên làm việc hợp lệ.',
  TOO_MANY_AUTH_COOKIES: 'Quá giới hạn cookie phiên đăng nhập.',

  // 401
  UNAUTHENTICATED: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  TOKEN_EXPIRED: 'Phiên truy cập đã hết hạn. Vui lòng đăng nhập lại.',
  SESSION_INVALID: 'Phiên đăng nhập không hợp lệ.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn.',
  SESSION_REVOKED: 'Phiên đăng nhập đã bị thu hồi.',
  REFRESH_INVALID: 'Không thể làm mới phiên đăng nhập.',
  REFRESH_EXPIRED: 'Phiên làm mới đã hết hạn.',
  REFRESH_REUSED: 'Phiên làm mới đã được sử dụng trước đó. Vui lòng đăng nhập lại.',

  // 403
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác hoặc truy cập nội dung này.',
  MANAGER_REQUIRED: 'Chỉ tài khoản MANAGER mới có quyền duyệt thao tác này.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị khóa hoặc ngừng hoạt động.',
  CUSTOMER_NOT_ELIGIBLE: 'Khách hàng chưa đủ điều kiện thuê xe.',
  CSRF_REJECTED: 'Yêu cầu bị từ chối do kiểm tra bảo mật nguồn gốc (CSRF).',

  // 404
  NOT_FOUND: 'Không tìm thấy dữ liệu hoặc không thuộc phạm vi được phép xem.',
  TICKET_NOT_FOUND: 'Ticket không tồn tại hoặc không thuộc chuyến thuê này.',
  EVIDENCE_NOT_FOUND: 'Ticket bằng chứng không thuộc chuyến thuê này.',
  WALLET_NOT_FOUND: 'Không tìm thấy ví của khách hàng.',
  MAINTENANCE_NOT_FOUND: 'Không tìm thấy phiếu bảo trì của xe này.',

  // 409
  EMAIL_EXISTS: 'Email này đã được sử dụng trong hệ thống.',
  PROMOTION_CODE_EXISTS: 'Mã khuyến mãi đã tồn tại.',
  VEHICLE_UNAVAILABLE: 'Xe hiện không sẵn sàng cho thao tác này.',
  STATION_FULL: 'Trạm đã đầy sức chứa, không thể nhận thêm xe.',
  STATION_UNAVAILABLE: 'Trạm đang ngừng hoạt động hoặc ngoài giờ mở cửa.',
  STATION_NOT_EMPTY: 'Không thể ngừng hoạt động trạm khi vẫn còn xe đang đỗ hoặc lượt giữ chỗ.',
  STATION_CAPACITY_INCONSISTENT: 'Sức chứa trạm không thể nhỏ hơn số xe đang đỗ.',
  RESERVATION_EXPIRED: 'Lượt giữ xe đã hết hạn.',
  INVALID_RENTAL_STATE: 'Trạng thái chuyến thuê hiện tại không cho phép thao tác này.',
  INVALID_VEHICLE_STATE: 'Trạng thái xe hiện tại không cho phép thao tác này.',
  PICKUP_STATION_MISMATCH: 'Trạm nhận xe không khớp với trạm đã giữ chỗ.',
  WALLET_UNAVAILABLE: 'Ví khách hàng đang bị đóng băng hoặc khóa (không ở trạng thái ACTIVE).',
  INSUFFICIENT_BALANCE: 'Số dư ví khách hàng không đủ để thực hiện thanh toán.',
  WALLET_LIMIT_EXCEEDED: 'Số dư sau giao dịch vượt hạn mức tối đa cho phép.',
  PROMOTION_INVALID: 'Mã khuyến mãi không hợp lệ hoặc không đủ điều kiện áp dụng.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu lặp lại bị xung đột nội dung với lần gửi trước.',
  REQUEST_IN_PROGRESS: 'Yêu cầu đang được xử lý, vui lòng thử lại sau giây lát.',
  STALE_QUOTE: 'Báo giá đã hết hạn (10 phút) hoặc dữ liệu đã thay đổi. Vui lòng tạo báo giá mới.',
  INVALID_STATE_TRANSITION: 'Chuyển đổi trạng thái không hợp lệ theo quy định nghiệp vụ.',
  ACTIVE_RENTAL_EXISTS: 'Xe hoặc khách hàng đang có lượt giữ/chuyến thuê chưa giải quyết.',
  DAILY_CANCELLATION_LIMIT_REACHED: 'Khách hàng đã đạt giới hạn hủy/hết hạn 3 lần trong ngày.',
  ACTIVE_MAINTENANCE_ORDER: 'Xe đã có phiếu bảo trì đang hoạt động (OPEN/IN_PROGRESS).',
  FILE_ALREADY_ATTACHED: 'Ảnh này đã được đính kèm vào một tài nguyên khác.',
  FILE_NOT_READY: 'Tệp tải lên chưa sẵn sàng.',
  ALERT_WORKFLOW_REQUIRED: 'Ticket cảnh báo chuyến thuê phải được xử lý qua luồng kiểm tra 24 giờ.',
  CHECK_IN_NOT_DUE_YET: 'Chuyến thuê chưa đến thời điểm cần kiểm tra.',
  INCIDENT_ALREADY_EXISTS: 'Chuyến thuê đã có hồ sơ sự cố đang được xử lý.',
  INCIDENT_INTAKE_NOT_ALLOWED: 'Chỉ tiếp nhận nghi mất với chuyến đang IN_RENT và chưa tiếp nhận trả xe.',
  INVALID_INCIDENT_STATE: 'Trạng thái hồ sơ sự cố không cho phép thực hiện bước này.',
  INCIDENT_NOT_CONFIRMED: 'Hồ sơ chưa được xác nhận xử lý theo luồng sự cố.',
  INCIDENT_RENTAL_STATE_MISMATCH: 'Trạng thái chuyến thuê không khớp với hồ sơ sự cố.',
  INCIDENT_REOPEN_NOT_ALLOWED: 'Hồ sơ đã có dữ liệu không thể mở lại từ trạng thái bác bỏ.',
  NEW_REPORT_REQUIRED: 'Cần ticket báo cáo mới được tiếp nhận sau quyết định báo nhầm trước đó.',
  RECOVERY_ALREADY_RECORDED: 'Hồ sơ đã ghi nhận thu hồi ngoài hiện trường.',
  INVALID_RECOVERY_STATE: 'Trạng thái hoặc vị trí xe không phù hợp để ghi nhận thu hồi.',
  VEHICLE_NOT_AT_RECEIVED_STATION: 'Xe chưa được tiếp nhận tại trạm của hồ sơ sự cố.',
  VEHICLE_ALREADY_RELEASED: 'Xe đã được giải phóng khỏi hồ sơ sự cố này.',
  VEHICLE_USED_BY_ANOTHER_RENTAL: 'Xe đang thuộc quyền sử dụng của một chuyến thuê khác.',
  VEHICLE_LOCATION_CHANGED: 'Vị trí xe đã thay đổi trong lúc thao tác. Vui lòng tải lại và thử lại.',
  INSPECTION_REQUIRED: 'Cần kết quả kiểm tra ban đầu INTACT hoặc REPAIRABLE.',
  MAINTENANCE_REQUIRED: 'Cần có phiếu bảo trì sự cố đã hoàn tất (COMPLETED) để giải phóng xe.',
  BATTERY_TOO_LOW: 'Cần sạc pin đạt ít nhất 30% trước khi giải phóng xe cho thuê lại.',
  AMOUNT_CHANGED: 'Số tiền cọc còn giữ đã thay đổi, vui lòng tải lại số liệu.',
  RENT_AMOUNT_CHANGED: 'Số tiền thuê dự kiến không khớp với tính toán hiện tại, vui lòng xem lại.',
  RENT_SETTLEMENT_REQUIRED: 'Phải quyết toán tiền thuê sự cố trước khi hoàn cọc dư.',
  BILLING_CUTOFF_REQUIRED: 'Chưa có mốc dừng cước để quyết toán tiền thuê sự cố.',
  RENT_ALREADY_SETTLED: 'Tiền thuê của hồ sơ sự cố này đã được quyết toán trước đó.',
  INVOICE_ALREADY_EXISTS: 'Chuyến thuê đã có hóa đơn được phát hành.',
  COMPENSATION_NOT_APPROVED: 'Nghĩa vụ bồi thường ngoài hệ thống chưa được ghi nhận hợp lệ.',
  COMPENSATION_ALREADY_SETTLED: 'Kết quả bồi thường đã được chốt trước đó.',
  INCIDENT_NOT_READY_TO_CLOSE: 'Chưa đủ điều kiện đóng hồ sơ (cần quyết toán thuê, hoàn hết cọc và ghi nhận bồi thường).',
  REVENUE_DATA_INCONSISTENT: 'Dữ liệu doanh thu không khớp trạng thái hóa đơn hoặc ledger sự cố.',
  RENTAL_NOT_COMPLETED: 'Chỉ xem/đánh giá với chuyến đã hoàn tất (COMPLETED).',
  ALREADY_REVIEWED: 'Chuyến này đã được đánh giá.',

  // 413 / 415 / 422 / 429 / 503
  FILE_TOO_LARGE: 'Kích thước tệp vượt quá giới hạn cho phép (tối đa 10 MiB).',
  UNSUPPORTED_MEDIA_TYPE: 'Định dạng tệp không hợp lệ (chỉ chấp nhận JPEG, PNG, WebP).',
  VALIDATION_ERROR: 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại các trường nhập.',
  INVALID_ASSIGNEE: 'Người phụ trách phải là nhân viên STAFF hoặc MANAGER đang hoạt động.',
  ASSIGNEE_REQUIRED: 'Cần phân công nhân viên phụ trách trước khi xử lý.',
  RESOLUTION_REQUIRED: 'Bắt buộc nhập kết quả xử lý.',
  HUMAN_REPORT_REQUIRED: 'Cần chọn ticket báo cáo của khách hàng hoặc nhân viên hợp lệ.',
  STALE_VALID_REPORT: 'Không thể dùng lại báo cáo cũ trước quyết định báo nhầm.',
  INVALID_NEXT_CHECK_TIME: 'Thời điểm kiểm tra tiếp theo phải lớn hơn thời gian máy chủ.',
  INVALID_TIME_RANGE: 'Khoảng thời gian tìm kiếm không hợp lệ.',
  INVALID_GPS_TIME: 'Thời điểm ghi nhận GPS không hợp lệ với thời gian chuyến thuê.',
  INVALID_EVENT_TIME: 'Thời điểm sự kiện không hợp lệ với trình tự nghiệp vụ.',
  INVALID_PAYMENT_TIME: 'Thời điểm thanh toán bồi thường ngoài hệ thống không hợp lệ.',
  EVIDENCE_REQUIRED: 'Thiếu ticket bằng chứng cho thao tác.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng đợi một lát trước khi thử lại.',
  POLICY_NOT_CONFIGURED: 'Chính sách hệ thống chưa được cấu hình.',
  FEATURE_NOT_ENABLED: 'Chức năng mô phỏng này chưa được bật trên môi trường máy chủ.',
  DEPENDENCY_UNAVAILABLE: 'Máy chủ hoặc dịch vụ phụ thuộc tạm thời không sẵn sàng.',
};

export function getApiErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const code = error.code;
  const baseMessage = error.message || ERROR_MESSAGES_BY_CODE[code] || 'Đã xảy ra lỗi không xác định.';
  if (code === 'RATE_LIMITED' && error.retryAfter) {
    return `${baseMessage} (Thử lại sau ${error.retryAfter} giây)`;
  }
  return baseMessage;
}
