// Các hàm nghiệp vụ thuần túy cho màn hình Ví Khách hàng theo contract phê duyệt nạp tiền (PR #40 trên `origin/develop`).
// Đảm bảo:
// - Validate số tiền nạp khớp đúng MONEY_PATTERN `^[0-9]{1,10}(?:\.[0-9]{1,2})?$` và `0 < amount <= 9999999999.99`.
// - Kiểm tra tương thích backend qua GET /wallets/me/topups: nếu 404/405 (backend cũ chưa có PR #40) thì khóa gửi thật.
// - Không bao giờ tự cộng số dư ví trên frontend khi gửi yêu cầu nạp (PENDING) hay khi bị từ chối (REJECTED).
// - Theo dõi chuyển trạng thái PENDING -> APPROVED / REJECTED để tự tải lại số dư và lịch sử giao dịch từ máy chủ.

import { parseMoneyToCents, formatCentsToMoneyString } from './format.js';

export const TOPUP_MONEY_PATTERN = /^[0-9]{1,10}(?:\.[0-9]{1,2})?$/;
export const MAX_WALLET_CENTS = 999999999999n; // 9,999,999,999.99 VND (Numeric(12,2))

export const SUGGESTED_TOPUP_AMOUNTS = [
  { value: '50000.00', label: '50.000đ' },
  { value: '100000.00', label: '100.000đ' },
  { value: '200000.00', label: '200.000đ' },
  { value: '500000.00', label: '500.000đ' },
  { value: '1000000.00', label: '1.000.000đ' },
];

export const TOPUP_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Tất cả yêu cầu' },
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Bị từ chối' },
];

export const WALLET_TX_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'Tất cả loại giao dịch' },
  { value: 'TOPUP', label: 'Nạp tiền vào ví' },
  { value: 'RENTAL_DEPOSIT', label: 'Thu tiền cọc chuyến' },
  { value: 'RENTAL_PAYMENT', label: 'Thanh toán tiền thuê' },
  { value: 'RENTAL_REFUND', label: 'Hoàn tiền cọc dư' },
];

/**
 * Chuẩn hóa và kiểm tra số tiền nạp nhập từ bàn phím hoặc nút gợi ý.
 * Cho phép người dùng gõ "150000" hoặc "150000.00" (hoặc có dấu cách đầu/cuối),
 * từ chối số âm, bằng 0, quá 10 chữ số nguyên, quá 2 chữ số thập phân hoặc ký tự lạ.
 */
export function validateTopupAmountInput(rawInput) {
  if (rawInput === null || rawInput === undefined) {
    return { valid: false, normalizedAmount: null, error: 'Vui lòng nhập số tiền cần nạp.' };
  }
  const cleaned = String(rawInput).trim();
  if (!cleaned) {
    return { valid: false, normalizedAmount: null, error: 'Vui lòng nhập số tiền cần nạp.' };
  }
  if (!TOPUP_MONEY_PATTERN.test(cleaned)) {
    return {
      valid: false,
      normalizedAmount: null,
      error: 'Số tiền phải là số dương hợp lệ (tối đa 10 chữ số nguyên và tối đa 2 chữ số thập phân, ví dụ 150000).',
    };
  }
  const cents = parseMoneyToCents(cleaned);
  if (cents === null || cents <= 0n) {
    return {
      valid: false,
      normalizedAmount: null,
      error: 'Số tiền yêu cầu nạp phải lớn hơn 0đ.',
    };
  }
  if (cents > MAX_WALLET_CENTS) {
    return {
      valid: false,
      normalizedAmount: null,
      error: 'Số tiền vượt giới hạn tối đa cho phép của ví.',
    };
  }
  return {
    valid: true,
    normalizedAmount: formatCentsToMoneyString(cents),
    error: '',
  };
}

/**
 * Xác định máy chủ backend hiện tại có hỗ trợ luồng nạp tiền chờ duyệt (GET /wallets/me/topups) hay chưa.
 * Trên backend cũ (trước PR #40), đường dẫn `/wallets/me/topups` chỉ có POST nên GET trả 405 (hoặc 404).
 */
export function evaluateTopupBackendCompatibility({
  hasVerifiedOnce = false,
  topupsError = null,
  topupsLoading = false,
} = {}) {
  const errStatus = Number(topupsError?.status) || 0;
  if (errStatus === 404 || errStatus === 405 || topupsError?.code === 'TOPUP_BACKEND_INCOMPATIBLE') {
    return {
      status: 'incompatible',
      canSubmit: false,
      message:
        'Dịch vụ nạp tiền đang tạm thời không khả dụng. Vui lòng thử lại sau.',
    };
  }

  if (hasVerifiedOnce) {
    return {
      status: 'compatible',
      canSubmit: true,
      message: null,
    };
  }

  if (topupsLoading) {
    return {
      status: 'checking',
      canSubmit: false,
      message: 'Đang kiểm tra trạng thái dịch vụ nạp tiền...',
    };
  }

  return {
    status: 'unverified',
    canSubmit: false,
    message:
      'Chưa xác minh được kết nối tới danh sách yêu cầu nạp tiền. Vui lòng bấm Làm mới trước khi gửi yêu cầu.',
  };
}

/**
 * Kiểm tra ví khách hàng có đủ điều kiện bấm gửi yêu cầu nạp tiền hay không.
 */
export function evaluateWalletSubmissionGate({ wallet, compatibility }) {
  if (!compatibility || !compatibility.canSubmit) {
    return {
      allowed: false,
      reason: compatibility?.message || 'Chưa thể gửi yêu cầu nạp tiền lúc này.',
    };
  }
  if (!wallet) {
    return {
      allowed: false,
      reason: 'Đang tải thông tin ví của bạn...',
    };
  }
  if (wallet.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason:
        wallet.status === 'FROZEN'
          ? 'Ví của bạn đang tạm đóng băng nên không thể gửi yêu cầu nạp tiền mới.'
          : 'Ví của bạn đang bị khóa giao dịch nên không thể gửi yêu cầu nạp tiền mới.',
    };
  }
  return {
    allowed: true,
    reason: null,
  };
}

/**
 * So sánh danh sách yêu cầu nạp mới tải về với bản đồ trạng thái trước đó (`Map<id, status>`)
 * để phát hiện yêu cầu vừa chuyển từ `PENDING` sang `APPROVED` hoặc `REJECTED`.
 */
export function detectTopupStatusTransitions(previousStatusById, incomingRequests = []) {
  const list = Array.isArray(incomingRequests) ? incomingRequests : [];
  const nextStatusById = new Map(previousStatusById instanceof Map ? previousStatusById : []);
  const newlyApproved = [];
  const newlyRejected = [];
  let hasPending = false;

  for (const item of list) {
    if (!item || !item.id) continue;
    const id = String(item.id);
    const nextStatus = item.status;
    const prevStatus = nextStatusById.get(id);

    if (nextStatus === 'PENDING') {
      hasPending = true;
    }
    if (prevStatus === 'PENDING' && nextStatus === 'APPROVED') {
      newlyApproved.push(item);
    } else if (prevStatus === 'PENDING' && nextStatus === 'REJECTED') {
      newlyRejected.push(item);
    }
    nextStatusById.set(id, nextStatus);
  }

  return {
    nextStatusById,
    newlyApproved,
    newlyRejected,
    hasPending,
  };
}

/**
 * Bộ điều khiển polling có dọn dẹp sạch timer & visibility listener (dùng cho cả UI và unit test).
 * Chỉ poll khi `shouldPoll === true` và tab đang hiển thị (`isVisible()`).
 */
export function createTopupPollingController({
  onTick,
  intervalMs = 12000,
  isVisible = () => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'),
  setIntervalFn = (fn, ms) => globalThis.setInterval(fn, ms),
  clearIntervalFn = (id) => globalThis.clearInterval(id),
  subscribeVisibility = null,
} = {}) {
  let timerId = null;
  let unsubscribeVisibility = null;
  let stopped = false;

  const stopTimerOnly = () => {
    if (timerId !== null) {
      clearIntervalFn(timerId);
      timerId = null;
    }
  };

  const startTimerIfEligible = () => {
    if (stopped) return;
    if (!isVisible()) {
      stopTimerOnly();
      return;
    }
    if (timerId === null) {
      timerId = setIntervalFn(() => {
        if (!stopped && isVisible()) {
          onTick?.();
        }
      }, intervalMs);
    }
  };

  const start = () => {
    stopped = false;
    startTimerIfEligible();

    const attach =
      subscribeVisibility ||
      (typeof document !== 'undefined' && typeof document.addEventListener === 'function'
        ? (handler) => {
            document.addEventListener('visibilitychange', handler);
            return () => document.removeEventListener('visibilitychange', handler);
          }
        : null);

    if (attach && !unsubscribeVisibility) {
      unsubscribeVisibility = attach(() => {
        if (stopped) return;
        if (isVisible()) {
          onTick?.();
          startTimerIfEligible();
        } else {
          stopTimerOnly();
        }
      });
    }
  };

  const stop = () => {
    stopped = true;
    stopTimerOnly();
    if (unsubscribeVisibility) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
  };

  return {
    start,
    stop,
    isActive: () => timerId !== null && !stopped,
  };
}
