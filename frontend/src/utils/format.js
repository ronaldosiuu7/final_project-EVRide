// Các hàm định dạng dùng chung cho EVRide (tiền VND, ngày giờ Asia/Ho_Chi_Minh, thời lượng, idempotency).

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Định dạng chuỗi tiền thập phân ("10000.00", "1234567.50") thành "10.000đ" hoặc "1.234.567,50đ".
 * Xử lý bằng chuỗi để tránh sai số dấu phẩy động với số tiền lớn.
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
 * Sinh Idempotency-Key hợp lệ (16–128 ký tự) cho các endpoint POST có đánh dấu I.
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
