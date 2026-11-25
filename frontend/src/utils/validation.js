// Các hàm kiểm tra dữ liệu đầu vào bám sát Pydantic schemas và docs/api-contract.md.
import { generateIdempotencyKey } from './format.js';

const MONEY_PATTERN = /^[0-9]{1,10}(?:\.[0-9]{1,2})?$/;
const POSITIVE_ID_PATTERN = /^[1-9][0-9]*$/;
const TIME_PATTERN = /^([01][0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;

export function isValidMoneyString(value) {
  if (value === null || value === undefined) return false;
  return MONEY_PATTERN.test(String(value).trim());
}

/**
 * Chuẩn hóa chuỗi tiền về dạng "0.00" (2 chữ số lẻ). Trả về null nếu không hợp lệ.
 */
export function normalizeMoneyString(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const [intPart, fracPart = ''] = trimmed.split('.');
  const cleanInt = intPart.replace(/^0+(?=\d)/, '');
  return `${cleanInt}.${fracPart.padEnd(2, '0')}`;
}

export function isPositiveIdString(value) {
  if (value === null || value === undefined) return false;
  return POSITIVE_ID_PATTERN.test(String(value).trim());
}

export function validateDateRange(fromDate, toDate) {
  const from = String(fromDate || '').trim();
  const to = String(toDate || '').trim();
  if (!from && !to) return '';
  if (!from || !to) return 'Cần chọn cả từ ngày và đến ngày.';
  if (from > to) return 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.';
  return '';
}

/**
 * Kiểm tra cặp giờ mở/đóng cửa trạm theo backend StationCreate / StationUpdate.
 * - Cả hai rỗng => 24/7 (opens_at: null, closes_at: null)
 * - Chỉ nhập 1 bên => lỗi
 * - Hai giờ trùng nhau => lỗi
 */
export function validateOperatingHours(opensAt, closesAt) {
  const open = String(opensAt || '').trim();
  const close = String(closesAt || '').trim();
  if (!open && !close) {
    return { error: '', opens_at: null, closes_at: null };
  }
  if (!open || !close) {
    return {
      error: 'Giờ mở và giờ đóng phải cùng nhập hoặc cùng để trống (24/7).',
      opens_at: null,
      closes_at: null,
    };
  }
  const openMatch = open.match(TIME_PATTERN);
  const closeMatch = close.match(TIME_PATTERN);
  if (!openMatch || !closeMatch) {
    return {
      error: 'Giờ mở/đóng phải có định dạng HH:mm hoặc HH:mm:ss.',
      opens_at: null,
      closes_at: null,
    };
  }
  const normOpen = `${openMatch[1]}:${openMatch[2]}:${openMatch[3] || '00'}`;
  const normClose = `${closeMatch[1]}:${closeMatch[2]}:${closeMatch[3] || '00'}`;
  if (normOpen === normClose) {
    return {
      error: 'Giờ mở và giờ đóng không được giống nhau (để trống cả hai nếu mở 24/7).',
      opens_at: null,
      closes_at: null,
    };
  }
  return { error: '', opens_at: normOpen, closes_at: normClose };
}

/**
 * Trích xuất lỗi theo từng trường từ FastAPI VALIDATION_ERROR ({ error: { details: { fields } } }).
 */
export function mapApiFieldErrors(error) {
  const fields = error?.details?.fields;
  if (!Array.isArray(fields)) return {};
  const mapped = {};
  for (const item of fields) {
    if (item && item.field && !mapped[item.field]) {
      mapped[item.field] = item.message || 'Giá trị không hợp lệ.';
    }
  }
  return mapped;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Quản lý khóa Idempotency-Key cho retry an toàn:
 * Cùng actionKey + payload giống nhau -> giữ nguyên key đã dùng để tránh ghi trùng;
 * Đổi payload hoặc action -> sinh key mới.
 */
export function resolveIdempotencyKey(stateRef, actionKey, payload, keyGenerator = generateIdempotencyKey) {
  const payloadHash = stableStringify(payload ?? {});
  const current = stateRef.current;
  if (current && current.actionKey === actionKey && current.payloadHash === payloadHash && current.key) {
    return current.key;
  }
  const key = keyGenerator();
  stateRef.current = { actionKey, payloadHash, key };
  return key;
}
