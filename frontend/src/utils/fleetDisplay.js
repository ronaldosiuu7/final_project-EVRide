// Các hàm chuẩn hóa hiển thị trạm và xe máy điện cho giao diện Khách hàng (#15).
// Đảm bảo:
// - Hai giờ mở/đóng cùng null -> "Mở cửa 24/7".
// - Xử lý chính xác khung giờ hoạt động qua nửa đêm theo múi giờ Asia/Ho_Chi_Minh.
// - Phân biệt rạch ròi giá trị 0 với dữ liệu thiếu (null/undefined/NaN).
// - Không bao giờ sinh chuỗi "undefined", "NaN" hoặc "/ 10" giả định.
// - Tổng số lượng luôn đọc từ meta.total, không dùng độ dài một trang làm tổng hệ thống.

import { formatVnd, getEstimatedServerNowMs } from './format.js';

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const TIME_PARTS_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parse chuỗi giờ HH:MM hoặc HH:MM:SS thành tổng số giây trong ngày (0..86399).
 * Trả về null nếu thiếu hoặc không hợp lệ.
 */
export function parseTimeOfDaySeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).trim().match(TIME_PARTS_PATTERN);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] !== undefined ? Number(match[3]) : 0;
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function formatShortTime(value) {
  const match = String(value || '').trim().match(TIME_PARTS_PATTERN);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${match[1]}:${match[2]}`;
}

/**
 * Lấy số giây hiện tại trong ngày theo múi giờ Asia/Ho_Chi_Minh.
 */
export function getVietnamSecondsOfDay(referenceNowMs = getEstimatedServerNowMs()) {
  const date = new Date(referenceNowMs);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hours = map.hour === '24' ? 0 : Number(map.hour || 0);
  const minutes = Number(map.minute || 0);
  const seconds = Number(map.second || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Định dạng khung giờ hoạt động trạm an toàn theo contract:
 * - opens_at == null && closes_at == null -> "Mở cửa 24/7"
 * - opens_at > closes_at -> "22:00 – 06:00 (qua đêm)"
 * - Một trong hai thiếu hoặc sai định dạng -> "Chưa cập nhật"
 */
export function formatStationHours(opensAt, closesAt) {
  const openEmpty = opensAt === null || opensAt === undefined || String(opensAt).trim() === '';
  const closeEmpty = closesAt === null || closesAt === undefined || String(closesAt).trim() === '';
  if (openEmpty && closeEmpty) {
    return 'Mở cửa 24/7';
  }
  const openShort = formatShortTime(opensAt);
  const closeShort = formatShortTime(closesAt);
  const openSec = parseTimeOfDaySeconds(opensAt);
  const closeSec = parseTimeOfDaySeconds(closesAt);
  if (!openShort || !closeShort || openSec === null || closeSec === null) {
    return 'Chưa cập nhật';
  }
  if (openSec > closeSec) {
    return `${openShort} – ${closeShort} (qua đêm)`;
  }
  return `${openShort} – ${closeShort}`;
}

/**
 * Xác định trạng thái mở/đóng cửa thực tế của trạm khớp đúng logic `station_is_open` của backend
 * (bao gồm trạm 24/7 và trạm hoạt động qua nửa đêm theo giờ Việt Nam).
 */
export function getStationOpenStatus(station, referenceNowMs = getEstimatedServerNowMs()) {
  if (!station || typeof station !== 'object') {
    return {
      isOpen: null,
      is247: false,
      isOvernight: false,
      label: 'Chưa rõ trạng thái',
      tone: 'neutral',
    };
  }
  if (station.status && station.status !== 'ACTIVE') {
    return {
      isOpen: false,
      is247: false,
      isOvernight: false,
      label: 'Tạm ngưng hoạt động',
      tone: 'neutral',
    };
  }

  const openEmpty =
    station.opens_at === null ||
    station.opens_at === undefined ||
    String(station.opens_at).trim() === '';
  const closeEmpty =
    station.closes_at === null ||
    station.closes_at === undefined ||
    String(station.closes_at).trim() === '';

  if (openEmpty && closeEmpty) {
    return {
      isOpen: true,
      is247: true,
      isOvernight: false,
      label: 'Mở cửa 24/7',
      tone: 'success',
    };
  }

  const openSec = parseTimeOfDaySeconds(station.opens_at);
  const closeSec = parseTimeOfDaySeconds(station.closes_at);
  if (openSec === null || closeSec === null) {
    return {
      isOpen: null,
      is247: false,
      isOvernight: false,
      label: 'Chưa rõ giờ mở cửa',
      tone: 'neutral',
    };
  }

  const nowSec = getVietnamSecondsOfDay(referenceNowMs);
  const isOvernight = openSec > closeSec;
  const isOpen = isOvernight
    ? nowSec >= openSec || nowSec < closeSec
    : nowSec >= openSec && nowSec < closeSec;

  return {
    isOpen,
    is247: false,
    isOvernight,
    label: isOpen ? 'Đang mở cửa' : 'Ngoài giờ hoạt động',
    tone: isOpen ? 'success' : 'warning',
  };
}

/**
 * Parse số nguyên không âm an toàn, phân biệt rạch ròi 0 với dữ liệu thiếu.
 */
export function parseSafeCount(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

/**
 * Lấy số xe có thể thuê của trạm (giữ nguyên giá trị 0, không bị falsy fallback nuốt mất).
 */
export function getStationRentableCount(station) {
  if (!station || typeof station !== 'object') return null;
  const raw =
    station.available_vehicle_count !== undefined && station.available_vehicle_count !== null
      ? station.available_vehicle_count
      : station.rentable_vehicles;
  return parseSafeCount(raw);
}

/**
 * Lấy số chỗ trả trống của trạm (giữ nguyên giá trị 0, phân biệt với dữ liệu thiếu).
 */
export function getStationReturnSpaceCount(station) {
  if (!station || typeof station !== 'object') return null;
  return parseSafeCount(station.available_spaces);
}

/**
 * Lấy tổng sức chứa của trạm nếu hợp lệ (không mặc định / 10).
 */
export function getStationCapacityCount(station) {
  if (!station || typeof station !== 'object') return null;
  const cap = parseSafeCount(station.capacity);
  return cap !== null && cap > 0 ? cap : null;
}

/**
 * Định dạng số đếm kèm đơn vị: 0 -> "0 xe", thiếu -> "Chưa cập nhật".
 */
export function formatCountDisplay(count, unit = '') {
  const safe = parseSafeCount(count);
  if (safe === null) {
    return 'Chưa cập nhật';
  }
  return unit ? `${safe} ${unit}` : String(safe);
}

/**
 * Định dạng phần trăm pin: 0 -> "0%", thiếu/NaN -> "Chưa cập nhật".
 */
export function formatBatteryPercent(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return 'Chưa cập nhật';
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    return 'Chưa cập nhật';
  }
  return `${Math.round(num)}%`;
}

export function getBatteryLevelInfo(value) {
  const text = formatBatteryPercent(value);
  if (text === 'Chưa cập nhật') {
    return { percent: null, text, tone: 'neutral', label: 'Chưa cập nhật pin' };
  }
  const percent = Math.round(Number(value));
  if (percent >= 60) {
    return { percent, text, tone: 'success', label: 'Pin cao' };
  }
  if (percent >= 30) {
    return { percent, text, tone: 'warning', label: 'Đủ pin' };
  }
  return { percent, text, tone: 'danger', label: 'Pin thấp' };
}

/**
 * Định dạng tiền VND an toàn: "0.00" -> "0đ", thiếu/không hợp lệ -> "Chưa cập nhật".
 */
export function formatMoneyDisplay(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'Chưa cập nhật';
  }
  const raw = String(value).trim();
  if (!/^-?[0-9]+(?:\.[0-9]+)?$/.test(raw)) {
    return 'Chưa cập nhật';
  }
  return formatVnd(raw);
}

/**
 * Định dạng tọa độ an toàn cho cả string (Station) và number (GPS).
 */
export function formatCoordinatesDisplay(latitude, longitude) {
  if (
    latitude === null ||
    latitude === undefined ||
    latitude === '' ||
    longitude === null ||
    longitude === undefined ||
    longitude === ''
  ) {
    return 'Chưa cập nhật';
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Chưa cập nhật';
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Đọc tổng số mục toàn hệ thống từ meta/pagination (KHÔNG bao giờ lấy items.length thay thế).
 */
export function getSystemTotalFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  return parseSafeCount(meta.total);
}

/**
 * Tạo query object cho GET /stations đúng contract backend.
 */
export function buildStationQueryParams({
  q = '',
  hasAvailableVehicles = '',
  hasReturnSpace = '',
  page = 1,
  pageSize = 12,
} = {}) {
  const params = {
    page: Math.max(1, parseSafeCount(page) || 1),
    page_size: Math.min(100, Math.max(1, parseSafeCount(pageSize) || 12)),
  };
  const trimmedQ = String(q || '').trim();
  if (trimmedQ) {
    params.q = trimmedQ;
  }
  if (hasAvailableVehicles === 'true' || hasAvailableVehicles === true) {
    params.has_available_vehicles = 'true';
  } else if (hasAvailableVehicles === 'false' || hasAvailableVehicles === false) {
    params.has_available_vehicles = 'false';
  }
  if (hasReturnSpace === 'true' || hasReturnSpace === true) {
    params.has_return_space = 'true';
  } else if (hasReturnSpace === 'false' || hasReturnSpace === false) {
    params.has_return_space = 'false';
  }
  return params;
}

/**
 * Tạo query object cho GET /vehicles hoặc GET /stations/{id}/vehicles đúng contract backend.
 */
export function buildVehicleQueryParams({
  stationId = '',
  model = '',
  page = 1,
  pageSize = 12,
} = {}) {
  const params = {
    page: Math.max(1, parseSafeCount(page) || 1),
    page_size: Math.min(100, Math.max(1, parseSafeCount(pageSize) || 12)),
  };
  const trimmedStation = String(stationId || '').trim();
  if (trimmedStation) {
    params.station_id = trimmedStation;
  }
  const trimmedModel = String(model || '').trim();
  if (trimmedModel) {
    params.model = trimmedModel;
  }
  return params;
}

/**
 * Helper cập nhật bộ lọc nguyên tử: mọi thay đổi bộ lọc đều tự động đặt lại page = 1 ngay lập tức.
 */
export function applyFilterPatch(currentState, patch) {
  return {
    ...currentState,
    ...patch,
    page: 1,
  };
}

/**
 * Bộ điều phối truy vấn chống ghi đè kết quả bởi response cũ (stale response guard).
 * Dùng chung nguyên lý với useApiQuery để kiểm thử độc lập trên Node.
 */
export function createLatestRequestGuard() {
  let latestSeq = 0;
  let activeController = null;

  return {
    begin() {
      activeController?.abort();
      activeController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      latestSeq += 1;
      const seq = latestSeq;
      return {
        seq,
        signal: activeController?.signal,
        isCurrent: () => seq === latestSeq,
      };
    },
    cancelAll() {
      latestSeq += 1;
      activeController?.abort();
      activeController = null;
    },
  };
}
