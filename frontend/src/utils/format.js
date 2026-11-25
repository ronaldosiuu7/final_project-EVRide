// Các hàm định dạng dùng chung cho EVRide (tiền VND, ngày giờ Asia/Ho_Chi_Minh, thời lượng, đồng bộ server_time, idempotency).

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MONEY_PARSE_PATTERN = /^(-)?([0-9]+)(?:\.([0-9]{1,2}))?$/;

let serverTimeOffsetMs = 0;

/**
 * Định dạng chuỗi tiền thập phân ("10000.00", "1234567.50") thành "10.000đ" hoặc "1.234.567,50đ".
 * Xử lý thuần bằng chuỗi để tránh sai số dấu phẩy động với số tiền lớn.
 */
export function formatVnd(decimalString) {
  if (decimalString === null || decimalString === undefined || decimalString === '') {
    return '—';
  }
  const raw = String(decimalString).trim();
  const match = raw.match(/^(-)?([0-9]+)(?:\.([0-9]+))?$/);
  if (!match) {
    return String(decimalString);
  }
  const sign = match[1] ? '-' : '';
  const intPart = match[2].replace(/^0+(?=\d)/, '');
  const fracRaw = (match[3] || '').padEnd(2, '0').slice(0, 2);
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (!fracRaw || fracRaw === '00') {
    return `${sign}${groupedInt}đ`;
  }
  return `${sign}${groupedInt},${fracRaw}đ`;
}

/**
 * Chuyển chuỗi tiền thập phân sang đơn vị xu (BigInt * 100) để so sánh/cộng/trừ chính xác,
 * tránh hoàn toàn sai số Number float. Trả về null nếu không hợp lệ.
 */
export function parseMoneyToCents(decimalString) {
  if (decimalString === null || decimalString === undefined || typeof decimalString === 'number') {
    return null;
  }
  const raw = String(decimalString).trim();
  const match = raw.match(MONEY_PARSE_PATTERN);
  if (!match) return null;
  const sign = match[1] ? -1n : 1n;
  const whole = BigInt(match[2]);
  const frac = BigInt((match[3] || '').padEnd(2, '0'));
  return sign * (whole * 100n + frac);
}

/**
 * Chuyển đơn vị xu (BigInt * 100) về lại chuỗi tiền chuẩn contract ("150000.00").
 */
export function formatCentsToMoneyString(cents) {
  const big = typeof cents === 'bigint' ? cents : BigInt(cents);
  const sign = big < 0n ? '-' : '';
  const abs = big < 0n ? -big : big;
  const whole = abs / 100n;
  const frac = String(abs % 100n).padStart(2, '0');
  return `${sign}${whole.toString()}.${frac}`;
}

/**
 * So sánh hai chuỗi tiền thập phân: trả về -1 nếu a < b, 0 nếu bằng nhau, 1 nếu a > b.
 */
export function compareMoneyStrings(a, b) {
  const centsA = parseMoneyToCents(a);
  const centsB = parseMoneyToCents(b);
  if (centsA === null || centsB === null) {
    throw new Error('Giá trị tiền tệ không hợp lệ để so sánh.');
  }
  if (centsA < centsB) return -1;
  if (centsA > centsB) return 1;
  return 0;
}

/**
 * Cộng nhiều chuỗi tiền thập phân bằng BigInt và trả về chuỗi "0.00".
 */
export function addMoneyStrings(...values) {
  let sum = 0n;
  for (const val of values) {
    const cents = parseMoneyToCents(val);
    if (cents === null) {
      throw new Error('Giá trị tiền tệ không hợp lệ để cộng.');
    }
    sum += cents;
  }
  return formatCentsToMoneyString(sum);
}

/**
 * Trừ hai chuỗi tiền thập phân (a - b) bằng BigInt và trả về chuỗi "0.00".
 */
export function subtractMoneyStrings(a, b) {
  const centsA = parseMoneyToCents(a);
  const centsB = parseMoneyToCents(b);
  if (centsA === null || centsB === null) {
    throw new Error('Giá trị tiền tệ không hợp lệ để trừ.');
  }
  return formatCentsToMoneyString(centsA - centsB);
}

/**
 * Định dạng mốc thời gian RFC 3339 / ISO sang giờ Việt Nam (Asia/Ho_Chi_Minh).
 */
export function formatDateTimeVN(isoString, { withSeconds = false } = {}) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date);
}

/**
 * Định dạng chuỗi ngày YYYY-MM-DD sang dd/MM/yyyy.
 */
export function formatDateVN(dateStr) {
  if (!dateStr) return '—';
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(dateStr);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Định dạng khung giờ hoạt động của trạm ("06:00:00", "22:00:00") sang tiếng Việt.
 */
export function formatTimeRangeVN(opensAt, closesAt) {
  if (!opensAt && !closesAt) {
    return 'Mở cửa 24/7';
  }
  const shortTime = (val) => {
    const trimmed = String(val || '').trim();
    const match = trimmed.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    return match ? `${match[1]}:${match[2]}` : trimmed;
  };
  const openStr = shortTime(opensAt);
  const closeStr = shortTime(closesAt);
  if (openStr && closeStr && openStr > closeStr) {
    return `${openStr} – ${closeStr} (qua đêm)`;
  }
  return `${openStr} – ${closeStr}`;
}

/**
 * Định dạng số giây thành chuỗi dễ đọc ("1 giờ 20 phút", "45 phút", "30 giây").
 */
export function formatDurationSeconds(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const total = Math.max(0, Math.floor(Number(seconds)));
  if (Number.isNaN(total)) return '—';
  if (total < 60) return `${total} giây`;
  const totalMinutes = Math.floor(total / 60);
  if (totalMinutes < 60) return `${totalMinutes} phút`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
}

/**
 * Định dạng bộ đếm ngược giây sang "MM:SS" (hoặc "HH:MM:SS" nếu >= 1 giờ).
 */
export function formatCountdownMmSs(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Định dạng số phút ("48 phút", "1 giờ 15 phút").
 */
export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const total = Math.max(0, Math.round(Number(minutes)));
  if (Number.isNaN(total)) return '—';
  if (total < 60) return `${total} phút`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
}

/**
 * Chuyển giá trị từ <input type="datetime-local"> ("YYYY-MM-DDTHH:mm" hoặc có giây)
 * sang chuỗi RFC 3339 kèm múi giờ +07:00 theo yêu cầu AwareDatetime của FastAPI.
 */
export function toIsoWithVietnamOffset(datetimeLocalValue) {
  if (!datetimeLocalValue) return null;
  const trimmed = String(datetimeLocalValue).trim();
  if (!trimmed) return null;
  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    return trimmed;
  }
  const normalized = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  return `${normalized}+07:00`;
}

/**
 * Trả về chuỗi "YYYY-MM-DDTHH:mm" theo giờ Việt Nam để gán giá trị mặc định cho datetime-local.
 */
export function nowLocalInput(offsetMinutes = 0) {
  const target = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(target);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

/**
 * Ghi nhận độ lệch đồng hồ giữa server_time trong meta response và đồng hồ máy khách.
 */
export function recordServerTime(serverTimeIso, clientNowMs = Date.now()) {
  if (!serverTimeIso) return serverTimeOffsetMs;
  const parsedMs = Date.parse(serverTimeIso);
  if (!Number.isNaN(parsedMs)) {
    serverTimeOffsetMs = parsedMs - clientNowMs;
  }
  return serverTimeOffsetMs;
}

export function getServerTimeOffsetMs() {
  return serverTimeOffsetMs;
}

export function resetServerTimeOffset() {
  serverTimeOffsetMs = 0;
}

export function getEstimatedServerNowMs(clientNowMs = Date.now()) {
  return clientNowMs + serverTimeOffsetMs;
}

/**
 * Tính số giây còn lại đến mốc hết hạn (expires_at / quote_expires_at) đồng bộ theo server_time.
 */
export function computeRemainingSeconds(
  expiresAtIso,
  { serverTimeIso = null, clientNowMs = Date.now() } = {}
) {
  if (!expiresAtIso) return 0;
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) return 0;

  let referenceMs = getEstimatedServerNowMs(clientNowMs);
  if (serverTimeIso) {
    const explicitServerMs = Date.parse(serverTimeIso);
    if (!Number.isNaN(explicitServerMs)) {
      referenceMs = explicitServerMs;
    }
  }
  return Math.max(0, Math.floor((expiresMs - referenceMs) / 1000));
}

/**
 * Sinh Idempotency-Key ngẫu nhiên hợp lệ (16–128 ký tự) cho các endpoint POST có đánh dấu I.
 */
export function generateIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
