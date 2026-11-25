// Các hàm kiểm tra dữ liệu đầu vào, bảo toàn kiểu ID/tiền chuỗi và quản lý vòng đời Idempotency-Key.
import { generateIdempotencyKey } from './format.js';
import { sanitizeUiMessage } from './errorMessages.js';

const MONEY_PATTERN = /^[0-9]{1,10}(?:\.[0-9]{1,2})?$/;
const POSITIVE_ID_PATTERN = /^[1-9][0-9]*$/;
const MAX_PG_BIGINT = 9223372036854775807n;
const TIME_PATTERN = /^([01][0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;

export function isValidMoneyString(value) {
  if (value === null || value === undefined || typeof value === 'number') return false;
  return MONEY_PATTERN.test(String(value).trim());
}

/**
 * Chuẩn hóa chuỗi tiền về dạng "0.00" (2 chữ số lẻ). Trả về null nếu không hợp lệ hoặc bằng 0 khi requirePositive=true.
 */
export function normalizeMoneyString(value, { requirePositive = false } = {}) {
  if (value === null || value === undefined || typeof value === 'number') return null;
  const trimmed = String(value).trim();
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const [intPart, fracPart = ''] = trimmed.split('.');
  const cleanInt = intPart.replace(/^0+(?=\d)/, '');
  const normalizedFrac = fracPart.padEnd(2, '0');
  if (requirePositive && cleanInt === '0' && normalizedFrac === '00') {
    return null;
  }
  return `${cleanInt}.${normalizedFrac}`;
}

export function isPositiveIdString(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0;
  }
  if (typeof value === 'bigint') {
    return value > 0n && value <= MAX_PG_BIGINT;
  }
  const str = String(value).trim();
  if (!POSITIVE_ID_PATTERN.test(str)) return false;
  try {
    const big = BigInt(str);
    return big > 0n && big <= MAX_PG_BIGINT;
  } catch {
    return false;
  }
}

/**
 * Chuẩn hóa ID thực thể sang chuỗi số nguyên dương an toàn (bảo toàn ID 64-bit lớn hơn MAX_SAFE_INTEGER,
 * từ chối Number không an toàn để tránh mất chữ số cuối).
 */
export function toEntityIdString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') {
    return value > 0n && value <= MAX_PG_BIGINT ? value.toString() : null;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return null;
    }
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!POSITIVE_ID_PATTERN.test(trimmed)) return null;
    try {
      const big = BigInt(trimmed);
      return big > 0n && big <= MAX_PG_BIGINT ? big.toString() : null;
    } catch {
      return null;
    }
  }
  return null;
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
 * Trích xuất lỗi theo từng trường từ FastAPI VALIDATION_ERROR ({ error: { details: { fields } } })
 * kèm làm sạch thông báo tiếng Việt an toàn.
 */
export function mapApiFieldErrors(error) {
  const fields = error?.details?.fields;
  if (!Array.isArray(fields)) return {};
  const mapped = {};
  for (const item of fields) {
    if (item && item.field && !mapped[item.field]) {
      mapped[item.field] = sanitizeUiMessage(item.message, 'Giá trị không hợp lệ.');
    }
  }
  return mapped;
}

function canonicalSerializeForHash(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (typeof value !== 'object') return JSON.stringify(value);
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    const entries = [];
    for (const [k, v] of value.entries()) {
      if (v && typeof v === 'object' && 'name' in v && 'size' in v) {
        entries.push(`${JSON.stringify(k)}:file(${v.name},${v.size},${v.type || ''})`);
      } else {
        entries.push(`${JSON.stringify(k)}:${JSON.stringify(String(v))}`);
      }
    }
    entries.sort();
    return `formdata:{${entries.join(',')}}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerializeForHash(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalSerializeForHash(value[k])}`).join(',')}}`;
}

/**
 * Băm một chiều (128-bit hex) trên cấu trúc dữ liệu chuẩn hóa.
 * Giúp nhận biết body có thay đổi hay không mà KHÔNG lưu trữ mật khẩu, token hay số giấy tờ nhạy cảm trong bộ nhớ.
 */
export function fingerprintIdempotentPayload(payload) {
  const serialized = canonicalSerializeForHash(payload ?? {});
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x84222325cbf29ce4n;
  const prime1 = 0x100000001b3n;
  const prime2 = 0x100000001b5n;
  const mask = 0xffffffffffffffffn;

  for (let i = 0; i < serialized.length; i += 1) {
    const code = BigInt(serialized.charCodeAt(i));
    h1 = ((h1 ^ code) * prime1) & mask;
    h2 = ((h2 ^ (code + BigInt(i & 0xff))) * prime2) & mask;
  }
  return `${h1.toString(16).padStart(16, '0')}${h2.toString(16).padStart(16, '0')}`;
}

const UNCERTAIN_CONFLICT_CODES = new Set([
  'IDEMPOTENCY_IN_PROGRESS',
  'REQUEST_IN_PROGRESS',
  'CONCURRENT_STATE_CHANGED',
]);

const DETERMINISTIC_503_CODES = new Set([
  'FEATURE_NOT_ENABLED',
  'POLICY_NOT_CONFIGURED',
]);

/**
 * Xác định xem lỗi nhận được có thuộc nhóm "chưa rõ kết quả trên máy chủ" (cần giữ nguyên Idempotency-Key khi retry) hay không.
 * - Lỗi mạng, timeout, hủy giữa chừng, 409 đang xử lý, 429 hoặc 5xx hạ tầng => true (giữ key).
 * - Lỗi nghiệp vụ/validation/quyền đã xác định (400, 401, 403, 404, 422, 409 xung đột trạng thái, 503 tắt tính năng) => false (hủy key để lần sau tạo hành động mới).
 */
export function isUncertainIdempotentOutcome(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  if (error.kind === 'network' || error.kind === 'timeout' || error.kind === 'abort') {
    return true;
  }
  const status = Number(error.status) || 0;
  const code = error.code || '';

  if (status === 0) return true;
  if (
    code === 'NETWORK_ERROR' ||
    code === 'REQUEST_TIMEOUT' ||
    code === 'REQUEST_ABORTED' ||
    code === 'DEPENDENCY_UNAVAILABLE'
  ) {
    return true;
  }
  if (status === 409 && UNCERTAIN_CONFLICT_CODES.has(code)) {
    return true;
  }
  if (status === 429) {
    return true;
  }
  if (status >= 500 && !DETERMINISTIC_503_CODES.has(code)) {
    return true;
  }
  return false;
}

/**
 * Bộ quản lý vòng đời Idempotency-Key chỉ nằm trong bộ nhớ (không lưu secret / dữ liệu nhạy cảm):
 * - Mỗi hành động nghiệp vụ mới luôn sinh key ngẫu nhiên mới (không cố định theo số tiền hay ID tài nguyên).
 * - Retry khi kết quả chưa rõ (mạng đứt, timeout, đang xử lý...) với cùng action + body giữ nguyên key cũ.
 * - Khi đổi action hoặc đổi body -> lập tức sinh key mới.
 * - Khi thành công hoặc thất bại nghiệp vụ đã rõ kết quả -> giải phóng key để thao tác tiếp theo tạo key mới.
 */
export function createIdempotencyTracker({ keyGenerator = generateIdempotencyKey } = {}) {
  let state = null;

  return {
    begin(actionKey, payload = {}) {
      const normalizedAction = fingerprintIdempotentPayload(String(actionKey ?? 'default'));
      const fingerprint = fingerprintIdempotentPayload(payload ?? {});

      if (
        state &&
        state.actionHash === normalizedAction &&
        state.fingerprint === fingerprint &&
        (state.status === 'pending' || state.status === 'uncertain')
      ) {
        state = { ...state, status: 'pending' };
        return { key: state.key, reused: true, fingerprint };
      }

      const key = keyGenerator();
      if (typeof key !== 'string' || key.length < 1 || key.length > 128) {
        throw new Error('Khóa Idempotency-Key sinh ra không hợp lệ.');
      }
      state = {
        actionHash: normalizedAction,
        fingerprint,
        key,
        status: 'pending',
      };
      return { key, reused: false, fingerprint };
    },

    succeed() {
      state = null;
    },

    fail(error) {
      if (!state) return false;
      if (isUncertainIdempotentOutcome(error)) {
        state = { ...state, status: 'uncertain' };
        return true;
      }
      state = null;
      return false;
    },

    reset() {
      state = null;
    },

    getSnapshot() {
      if (!state) {
        return { hasActiveKey: false, status: 'idle', key: null };
      }
      return {
        hasActiveKey: true,
        status: state.status,
        key: state.key,
      };
    },
  };
}

/**
 * Quản lý khóa Idempotency-Key qua stateRef (giữ tương thích với các màn hình #16).
 * Không lưu chuỗi payload gốc trong stateRef để bảo vệ dữ liệu nhạy cảm.
 */
export function resolveIdempotencyKey(
  stateRef,
  actionKey,
  payload,
  keyGenerator = generateIdempotencyKey
) {
  const actionHash = fingerprintIdempotentPayload(String(actionKey ?? 'default'));
  const fingerprint = fingerprintIdempotentPayload(payload ?? {});
  const current = stateRef.current;
  if (
    current &&
    current.actionHash === actionHash &&
    current.fingerprint === fingerprint &&
    current.key
  ) {
    return current.key;
  }
  const key = keyGenerator();
  stateRef.current = { actionHash, fingerprint, key };
  return key;
}
