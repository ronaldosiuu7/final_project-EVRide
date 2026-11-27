// Ánh xạ mã lỗi chuẩn hóa từ backend (api-contract.md mục 2.3 & các module nghiệp vụ).
// Frontend luôn xử lý theo error.code, chuẩn hóa thông báo tiếng Việt và chặn rò rỉ stack trace / secret.

export const ERROR_MESSAGES_BY_CODE = {
  // Client / Transport
  NETWORK_ERROR: 'Không thể kết nối tới máy chủ EVRide. Vui lòng kiểm tra mạng và thử lại.',
  REQUEST_TIMEOUT: 'Yêu cầu phản hồi quá thời gian chờ. Vui lòng kiểm tra kết nối và thử lại.',
  REQUEST_ABORTED: 'Yêu cầu đã được hủy.',
  HTTP_ERROR: 'Yêu cầu không thể hoàn tất. Vui lòng thử lại sau.',
  INTERNAL_ERROR: 'Hệ thống tạm thời gián đoạn. Vui lòng thử lại sau.',

  // 400
  INVALID_DATE_RANGE: 'Khoảng ngày không hợp lệ (từ ngày phải nhỏ hơn hoặc bằng đến ngày).',
  DATE_RANGE_REQUIRED: 'Cần truyền cả từ ngày và đến ngày cùng nhau.',
  INVALID_REQUEST: 'Yêu cầu không hợp lệ.',
  IDEMPOTENCY_KEY_REQUIRED: 'Phiên xử lý chưa hợp lệ. Vui lòng tải lại trang và thử lại.',
  SESSION_SELECTION_REQUIRED: 'Phiên làm việc chưa hợp lệ. Vui lòng đăng nhập lại.',
  TOO_MANY_AUTH_COOKIES: 'Trình duyệt đang lưu quá nhiều phiên cũ. Vui lòng đăng xuất hoặc làm mới trình duyệt rồi đăng nhập lại.',

  // 401
  UNAUTHENTICATED: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  TOKEN_EXPIRED: 'Phiên truy cập đã hết hạn. Vui lòng đăng nhập lại.',
  SESSION_INVALID: 'Phiên đăng nhập không hợp lệ.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn.',
  SESSION_REVOKED: 'Phiên đăng nhập đã bị thu hồi.',
  REFRESH_INVALID: 'Không thể làm mới phiên đăng nhập.',
  REFRESH_EXPIRED: 'Phiên làm mới đã hết hạn.',
  REFRESH_REUSED: 'Phiên làm mới không còn hợp lệ. Vui lòng đăng nhập lại.',

  // 403
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác hoặc truy cập nội dung này.',
  MANAGER_REQUIRED: 'Chỉ tài khoản quản lý mới có quyền thực hiện thao tác này.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị khóa hoặc ngừng hoạt động.',
  CUSTOMER_NOT_ELIGIBLE: 'Tài khoản chưa đủ điều kiện thuê xe.',
  CSRF_REJECTED: 'Yêu cầu bị từ chối do kiểm tra bảo mật nguồn gốc. Vui lòng tải lại trang.',

  // 404
  NOT_FOUND: 'Không tìm thấy dữ liệu hoặc không thuộc phạm vi được phép xem.',
  TICKET_NOT_FOUND: 'Yêu cầu hỗ trợ không tồn tại hoặc không thuộc chuyến thuê này.',
  EVIDENCE_NOT_FOUND: 'Bằng chứng không thuộc chuyến thuê này.',
  WALLET_NOT_FOUND: 'Không tìm thấy ví của khách hàng.',
  MAINTENANCE_NOT_FOUND: 'Không tìm thấy phiếu bảo trì của xe này.',

  // 409
  EMAIL_EXISTS: 'Email này đã được sử dụng trong hệ thống.',
  PROMOTION_CODE_EXISTS: 'Mã khuyến mãi đã tồn tại.',
  PROMOTION_EXHAUSTED: 'Mã khuyến mãi đã hết lượt sử dụng.',
  VEHICLE_UNAVAILABLE: 'Xe hiện không sẵn sàng cho thao tác này.',
  STATION_FULL: 'Trạm đã đầy sức chứa, không thể nhận thêm xe.',
  STATION_UNAVAILABLE: 'Trạm đang ngừng hoạt động hoặc ngoài giờ mở cửa.',
  STATION_NOT_EMPTY: 'Không thể ngừng hoạt động trạm khi vẫn còn xe đang đỗ hoặc lượt giữ chỗ.',
  STATION_CAPACITY_INCONSISTENT: 'Sức chứa trạm không thể nhỏ hơn số xe đang đỗ.',
  RESERVATION_EXPIRED: 'Lượt giữ xe đã hết hạn. Vui lòng chọn xe và đặt lại.',
  INVALID_RENTAL_STATE: 'Trạng thái chuyến thuê hiện tại không cho phép thao tác này.',
  INVALID_VEHICLE_STATE: 'Trạng thái xe hiện tại không cho phép thao tác này.',
  PICKUP_STATION_MISMATCH: 'Trạm nhận xe không khớp với trạm đã giữ chỗ.',
  WALLET_UNAVAILABLE: 'Ví đang bị đóng băng hoặc tạm khóa, chưa thể thực hiện giao dịch.',
  INSUFFICIENT_BALANCE: 'Số dư ví không đủ để thực hiện giao dịch.',
  WALLET_LIMIT_EXCEEDED: 'Số dư sau giao dịch vượt hạn mức tối đa cho phép.',
  PROMOTION_INVALID: 'Mã khuyến mãi không hợp lệ hoặc chưa đủ điều kiện áp dụng.',
  VERIFIED_CCCD_REQUIRED: 'Cần có CCCD đã xác minh, còn hiệu lực và đủ từ 16 tuổi để giữ xe.',
  REFRESH_RETRY_UNAVAILABLE: 'Không thể khôi phục kết quả làm mới phiên. Vui lòng đăng nhập lại.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu lặp lại bị xung đột nội dung với lần gửi trước.',
  IDEMPOTENCY_IN_PROGRESS: 'Yêu cầu đang được xử lý, vui lòng đợi giây lát rồi thử lại.',
  REQUEST_IN_PROGRESS: 'Yêu cầu đang được xử lý, vui lòng thử lại sau giây lát.',
  CONCURRENT_STATE_CHANGED: 'Dữ liệu vừa thay đổi đồng thời. Vui lòng thử lại.',
  STALE_QUOTE: 'Báo giá đã hết hạn (10 phút) hoặc dữ liệu đã thay đổi. Vui lòng tạo báo giá mới.',
  INVALID_STATE_TRANSITION: 'Chuyển đổi trạng thái không hợp lệ theo quy định nghiệp vụ.',
  ACTIVE_RENTAL_EXISTS: 'Bạn hoặc chiếc xe này đang có lượt giữ chỗ / chuyến thuê chưa giải quyết.',
  DAILY_CANCELLATION_LIMIT_REACHED: 'Bạn đã đạt giới hạn tối đa 3 lần hủy hoặc để hết hạn giữ xe trong ngày.',
  ACTIVE_MAINTENANCE_ORDER: 'Xe đã có phiếu bảo trì đang hoạt động.',
  FILE_ALREADY_ATTACHED: 'Ảnh này đã được đính kèm vào một tài nguyên khác.',
  FILE_NOT_READY: 'Tệp tải lên chưa sẵn sàng.',
  ALERT_WORKFLOW_REQUIRED: 'Cảnh báo chuyến thuê phải được xử lý qua luồng kiểm tra 24 giờ.',
  CHECK_IN_NOT_DUE_YET: 'Chuyến thuê chưa đến thời điểm cần kiểm tra.',
  INCIDENT_ALREADY_EXISTS: 'Chuyến thuê đã có hồ sơ sự cố đang được xử lý.',
  INCIDENT_INTAKE_NOT_ALLOWED: 'Chỉ tiếp nhận nghi mất với chuyến đang thuê và chưa tiếp nhận trả xe.',
  INVALID_INCIDENT_STATE: 'Trạng thái hồ sơ sự cố không cho phép thực hiện bước này.',
  INVALID_INCIDENT_VEHICLE: 'Xe không khớp với hồ sơ sự cố.',
  INCIDENT_NOT_CONFIRMED: 'Hồ sơ chưa được xác nhận xử lý theo luồng sự cố.',
  INCIDENT_RENTAL_STATE_MISMATCH: 'Trạng thái chuyến thuê không khớp với hồ sơ sự cố.',
  INCIDENT_REOPEN_NOT_ALLOWED: 'Hồ sơ đã có dữ liệu không thể mở lại từ trạng thái bác bỏ.',
  NEW_REPORT_REQUIRED: 'Cần gửi yêu cầu báo cáo mới sau quyết định báo nhầm trước đó.',
  RECOVERY_ALREADY_RECORDED: 'Hồ sơ đã ghi nhận thu hồi ngoài hiện trường.',
  INVALID_RECOVERY_STATE: 'Trạng thái hoặc vị trí xe không phù hợp để ghi nhận thu hồi.',
  INVALID_ARRIVAL_STATE: 'Xe phải đã thu hồi ngoài hiện trường và chưa về trạm trước khi tiếp nhận.',
  VEHICLE_NOT_AT_RECEIVED_STATION: 'Xe chưa được tiếp nhận tại trạm của hồ sơ sự cố.',
  VEHICLE_ALREADY_RELEASED: 'Xe đã được giải phóng khỏi hồ sơ sự cố này.',
  VEHICLE_NOT_RELEASABLE: 'Xe chưa đủ điều kiện hoặc ở tình trạng không thể giải phóng cho thuê lại.',
  VEHICLE_USED_BY_ANOTHER_RENTAL: 'Xe đang thuộc quyền sử dụng của một chuyến thuê khác.',
  VEHICLE_LOCATION_CHANGED: 'Vị trí xe đã thay đổi trong lúc thao tác. Vui lòng tải lại và thử lại.',
  INSPECTION_REQUIRED: 'Cần kết quả kiểm tra ban đầu hợp lệ để tiếp tục.',
  MAINTENANCE_REQUIRED: 'Cần có phiếu bảo trì sự cố đã hoàn tất để giải phóng xe.',
  MAINTENANCE_NOT_LINKED: 'Phải chọn đúng phiếu bảo trì gần nhất gắn với hồ sơ sự cố này.',
  MAINTENANCE_NOT_COMPLETED: 'Phiếu bảo trì sự cố chưa ở trạng thái hoàn tất hợp lệ.',
  BATTERY_TOO_LOW: 'Cần sạc pin đạt ít nhất 30% trước khi giải phóng xe cho thuê lại.',
  PENDING_FINANCIAL_TRANSACTION: 'Chuyến còn giao dịch tài chính đang xử lý.',
  LEGACY_FINANCE_REVIEW_REQUIRED: 'Hồ sơ có giao dịch ngoài sổ sự cố hiện hành cần đối chiếu riêng.',
  AMOUNT_CHANGED: 'Số tiền cọc còn giữ đã thay đổi, vui lòng tải lại số liệu.',
  RENT_AMOUNT_CHANGED: 'Số tiền thuê dự kiến không khớp với tính toán hiện tại, vui lòng xem lại.',
  RENT_SETTLEMENT_REQUIRED: 'Phải quyết toán tiền thuê sự cố trước khi hoàn cọc dư.',
  BILLING_CUTOFF_REQUIRED: 'Chưa có mốc dừng cước để quyết toán tiền thuê sự cố.',
  RENT_ALREADY_SETTLED: 'Tiền thuê của hồ sơ sự cố này đã được quyết toán trước đó.',
  INVOICE_ALREADY_EXISTS: 'Chuyến thuê đã có hóa đơn được phát hành.',
  COMPENSATION_NOT_APPROVED: 'Nghĩa vụ bồi thường ngoài hệ thống chưa được ghi nhận hợp lệ.',
  COMPENSATION_ALREADY_SETTLED: 'Kết quả bồi thường đã được chốt trước đó.',
  INCIDENT_NOT_READY_TO_CLOSE: 'Chưa đủ điều kiện đóng hồ sơ (cần quyết toán thuê, hoàn hết cọc và ghi nhận bồi thường).',
  REVENUE_DATA_INCONSISTENT: 'Dữ liệu doanh thu không khớp trạng thái hóa đơn hoặc sổ giao dịch sự cố.',
  INVALID_POSTING_AMOUNT: 'Số tiền hạch toán phải lớn hơn 0.',
  RENTAL_NOT_COMPLETED: 'Chỉ xem hoặc gửi đánh giá cho chuyến đã hoàn tất.',
  ALREADY_REVIEWED: 'Chuyến này đã được đánh giá.',

  // 413 / 415 / 422 / 429 / 503
  FILE_TOO_LARGE: 'Kích thước tệp vượt quá giới hạn cho phép (tối đa 10 MiB).',
  UNSUPPORTED_MEDIA_TYPE: 'Định dạng tệp không hợp lệ (chỉ chấp nhận ảnh JPEG, PNG hoặc WebP).',
  VALIDATION_ERROR: 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại các trường nhập.',
  INVALID_AMOUNT: 'Số tiền nạp phải lớn hơn 0 và đúng định dạng cho phép.',
  TOPUP_BACKEND_INCOMPATIBLE:
    'Chức năng gửi yêu cầu nạp tiền hiện tạm thời bảo trì. Vui lòng thử lại sau hoặc liên hệ quầy trạm.',
  INVALID_ASSIGNEE: 'Người phụ trách phải là nhân viên hoặc quản lý đang hoạt động.',
  ASSIGNEE_REQUIRED: 'Cần phân công nhân viên phụ trách trước khi xử lý.',
  RESOLUTION_REQUIRED: 'Bắt buộc nhập kết quả xử lý.',
  HUMAN_REPORT_REQUIRED: 'Cần chọn báo cáo hợp lệ của khách hàng hoặc nhân viên.',
  STALE_VALID_REPORT: 'Không thể dùng lại báo cáo cũ trước quyết định báo nhầm.',
  INVALID_NEXT_CHECK_TIME: 'Thời điểm kiểm tra tiếp theo phải lớn hơn thời gian máy chủ.',
  INVALID_TIME_RANGE: 'Khoảng thời gian tìm kiếm không hợp lệ.',
  INVALID_GPS_TIME: 'Thời điểm ghi nhận GPS không hợp lệ với thời gian chuyến thuê.',
  INVALID_EVENT_TIME: 'Thời điểm sự kiện không hợp lệ với trình tự nghiệp vụ.',
  INVALID_PAYMENT_TIME: 'Thời điểm thanh toán bồi thường ngoài hệ thống không hợp lệ.',
  RELEASE_EVIDENCE_TOO_EARLY: 'Cần bằng chứng nghiệm thu được lập sau khi phiếu bảo trì hoàn tất.',
  EVIDENCE_REQUIRED: 'Thiếu bằng chứng xác nhận cho thao tác.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng đợi một lát trước khi thử lại.',
  POLICY_NOT_CONFIGURED: 'Chính sách hệ thống chưa được cấu hình.',
  FEATURE_NOT_ENABLED: 'Chức năng này hiện chưa được bật trên máy chủ.',
  DEPENDENCY_UNAVAILABLE: 'Máy chủ hoặc dịch vụ phụ thuộc tạm thời không sẵn sàng.',
};

const UNSAFE_TECHNICAL_PATTERNS = [
  /traceback\s*\(most recent call last\)/i,
  /\bFile\s+"[^"]+",\s+line\s+\d+/i,
  /\bat\s+[A-Za-z0-9_$.<>]+\s*\([^)]*:\d+:\d+\)/,
  /\b(sqlalchemy|psycopg|pydantic_core|starlette|fastapi|uvicorn)\b/i,
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b/i,
  /<!doctype\s+html|<html[\s>]|<body[\s>]/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
  /\bevr_rt_[0-9a-f]+_\d+\b/i,
  /\b(password_hash|refresh_token|secret_key|replay_ciphertext)\b/i,
  /^(Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout|Not Found|Forbidden|Unauthorized|Failed to fetch|NetworkError.*|Load failed)$/i,
  /^(Input should be|Field required|Extra inputs are not permitted|String should have|Value error,\s*[A-Za-z])/i,
];

const SENSITIVE_DETAIL_KEYS = new Set([
  'stack',
  'traceback',
  'sql',
  'query',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'password',
  'secret',
]);

export function isUnsafeTechnicalMessage(text) {
  if (typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 500) return true;
  return UNSAFE_TECHNICAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const ENUM_HUMAN_REPLACEMENTS = [
  [/\bIN_RENT\b/g, 'Đang thuê'],
  [/\bRESERVED\b/g, 'Đang giữ chỗ'],
  [/\bRETURN_PENDING\b/g, 'Chờ quyết toán'],
  [/\bCOMPLETED\b/g, 'Đã hoàn tất'],
  [/\bCANCELLED\b/g, 'Đã hủy'],
  [/\bEXPIRED\b/g, 'Đã hết hạn'],
  [/\bAVAILABLE\b/g, 'Sẵn sàng'],
  [/\bMAINTENANCE\b/g, 'Đang bảo trì'],
  [/\bSUSPECTED_STOLEN\b/g, 'Nghi mất / trộm'],
  [/\bSTOLEN\b/g, 'Mất xe'],
  [/\bINCIDENT_PENDING\b/g, 'Đang xử lý sự cố'],
  [/\bCLOSED_INCIDENT\b/g, 'Đã đóng sự cố'],
  [/\bPENDING\b/g, 'Chờ duyệt'],
  [/\bVERIFIED\b/g, 'Đã xác minh'],
  [/\bREJECTED\b/g, 'Đã từ chối'],
  [/\bACTIVE\b/g, 'Đang hoạt động'],
  [/\bINACTIVE\b/g, 'Ngừng hoạt động'],
];

function humanizeStatusEnums(text) {
  let out = text;
  for (const [pattern, replacement] of ENUM_HUMAN_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function sanitizeUiMessage(rawMessage, fallbackMessage = 'Đã xảy ra lỗi không xác định.') {
  if (typeof rawMessage !== 'string') {
    return fallbackMessage;
  }
  const cleaned = rawMessage.replace(/^Value error,\s*/i, '').trim();
  if (!cleaned || isUnsafeTechnicalMessage(cleaned)) {
    return fallbackMessage;
  }
  return humanizeStatusEnums(cleaned);
}

export function sanitizeErrorDetails(details) {
  if (!details || typeof details !== 'object') {
    return null;
  }
  if (Array.isArray(details)) {
    return null;
  }

  const safeDetails = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_DETAIL_KEYS.has(key.toLowerCase())) {
      continue;
    }
    if (key === 'fields' && Array.isArray(value)) {
      safeDetails.fields = value
        .filter((item) => item && typeof item.field === 'string')
        .map((item) => ({
          field: item.field,
          message: sanitizeUiMessage(item.message, 'Giá trị không hợp lệ.'),
        }));
      continue;
    }
    if (typeof value === 'string') {
      if (!isUnsafeTechnicalMessage(value)) {
        safeDetails[key] = value;
      }
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safeDetails[key] = value;
    }
  }

  return Object.keys(safeDetails).length > 0 ? safeDetails : null;
}

export function getStatusFallbackMessage(status) {
  if (status === 400) return ERROR_MESSAGES_BY_CODE.INVALID_REQUEST;
  if (status === 401) return ERROR_MESSAGES_BY_CODE.UNAUTHENTICATED;
  if (status === 403) return ERROR_MESSAGES_BY_CODE.FORBIDDEN;
  if (status === 404) return ERROR_MESSAGES_BY_CODE.NOT_FOUND;
  if (status === 413) return ERROR_MESSAGES_BY_CODE.FILE_TOO_LARGE;
  if (status === 415) return ERROR_MESSAGES_BY_CODE.UNSUPPORTED_MEDIA_TYPE;
  if (status === 422) return ERROR_MESSAGES_BY_CODE.VALIDATION_ERROR;
  if (status === 429) return ERROR_MESSAGES_BY_CODE.RATE_LIMITED;
  if (status >= 500) return ERROR_MESSAGES_BY_CODE.INTERNAL_ERROR;
  return 'Đã xảy ra lỗi không xác định.';
}

export function getApiErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') {
    return sanitizeUiMessage(error, 'Đã xảy ra lỗi không xác định.');
  }
  if (error.name === 'AbortError' || error.code === 'REQUEST_ABORTED') {
    return ERROR_MESSAGES_BY_CODE.REQUEST_ABORTED;
  }

  const code = error.code;
  const status = Number(error.status) || 0;
  const mappedByCode = code ? ERROR_MESSAGES_BY_CODE[code] : '';
  const fallback = mappedByCode || getStatusFallbackMessage(status);

  // Lỗi 5xx nội bộ luôn dùng thông báo tiếng Việt an toàn, không hiển thị chuỗi thô từ máy chủ.
  const isInternal5xx =
    status >= 500 &&
    code !== 'POLICY_NOT_CONFIGURED' &&
    code !== 'FEATURE_NOT_ENABLED' &&
    code !== 'DEPENDENCY_UNAVAILABLE';

  const baseMessage = isInternal5xx
    ? fallback
    : sanitizeUiMessage(error.message, fallback);

  if (code === 'RATE_LIMITED' && error.retryAfter) {
    const safeRetry = String(error.retryAfter).replace(/[^0-9]/g, '');
    if (safeRetry) {
      return `${baseMessage} (Thử lại sau ${safeRetry} giây)`;
    }
  }
  return baseMessage;
}
