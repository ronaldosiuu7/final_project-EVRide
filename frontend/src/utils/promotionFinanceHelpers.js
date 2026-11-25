// Các hàm nghiệp vụ thuần túy cho Khuyến mãi & Thông tin tài chính chuyến thuê (#15).
// - Đọc hoàn toàn từ dữ liệu API trả về; tuyệt đối không hard-code giá hoặc chính sách giảm giá từ seed.
// - Không hiển thị enum thô (PERCENTAGE, FIXED_AMOUNT, ACTIVE...) hay JSON điều kiện ra giao diện.
// - Không tiêu thụ mã khuyến mãi trên frontend khi chỉ gọi báo giá (return-quote).
// - Xử lý rõ ràng hóa đơn chưa phát hành (404) khác lỗi API, và số tiền "0.00" (0đ) khác null/thiếu.

import {
  computeRemainingSeconds,
  formatCountdownMmSs,
  formatDateTimeVN,
  getEstimatedServerNowMs,
} from './format.js';
import { formatMoneyDisplay } from './fleetDisplay.js';

/**
 * Định dạng mức giảm giá của khuyến mãi sang tiếng Việt tự nhiên (không lộ enum).
 */
export function formatPromotionDiscountSummary(promotion) {
  if (!promotion || typeof promotion !== 'object') {
    return 'Chưa cập nhật mức giảm';
  }

  if (promotion.discount_type === 'PERCENTAGE') {
    const rawVal = Number(promotion.discount_value);
    const pctText = Number.isFinite(rawVal) ? `${Math.round(rawVal)}%` : 'Chưa cập nhật';
    if (promotion.max_discount_amount !== null && promotion.max_discount_amount !== undefined) {
      return `Giảm ${pctText} (tối đa ${formatMoneyDisplay(promotion.max_discount_amount)})`;
    }
    return `Giảm ${pctText}`;
  }

  if (promotion.discount_type === 'FIXED_AMOUNT') {
    return `Giảm ${formatMoneyDisplay(promotion.discount_value)}`;
  }

  return 'Ưu đãi chuyến thuê';
}

/**
 * Chuyển các điều kiện áp dụng khuyến mãi sang danh sách câu tiếng Việt dễ hiểu (không lộ JSON/field).
 */
export function buildPromotionConditionLines(promotion) {
  if (!promotion || typeof promotion !== 'object') return [];
  const lines = [];

  if (promotion.min_rental_amount !== null && promotion.min_rental_amount !== undefined) {
    lines.push(
      `Áp dụng cho chuyến có tiền thuê từ ${formatMoneyDisplay(promotion.min_rental_amount)} trở lên.`
    );
  } else {
    lines.push('Không yêu cầu giá trị tiền thuê tối thiểu.');
  }

  if (promotion.vehicle_model) {
    lines.push(`Chỉ áp dụng cho dòng xe ${promotion.vehicle_model}.`);
  } else {
    lines.push('Áp dụng cho tất cả các dòng xe máy điện.');
  }

  if (
    promotion.usage_limit !== null &&
    promotion.usage_limit !== undefined &&
    Number.isFinite(Number(promotion.usage_limit))
  ) {
    const limit = Math.max(0, Math.floor(Number(promotion.usage_limit)));
    const used = Number.isFinite(Number(promotion.used_count))
      ? Math.max(0, Math.floor(Number(promotion.used_count)))
      : 0;
    const remaining = Math.max(0, limit - used);
    if (remaining === 0) {
      lines.push('Chương trình đã hết lượt sử dụng.');
    } else {
      lines.push(`Còn ${remaining} lượt sử dụng trên tổng ${limit} lượt.`);
    }
  }

  if (promotion.start_date && promotion.end_date) {
    lines.push(
      `Hiệu lực từ ${formatDateTimeVN(promotion.start_date)} đến ${formatDateTimeVN(promotion.end_date)}.`
    );
  }

  return lines;
}

/**
 * Đánh giá trạng thái hiển thị của một chương trình khuyến mãi hoặc mã đã nhận.
 */
export function evaluatePromotionState(
  promotion,
  {
    claimed = false,
    isUsed = false,
    referenceNowMs = getEstimatedServerNowMs(),
  } = {}
) {
  if (isUsed) {
    return {
      key: 'USED',
      label: 'Đã sử dụng',
      tone: 'neutral',
      canClaim: false,
      canUseInQuote: false,
    };
  }

  if (!promotion || typeof promotion !== 'object') {
    return {
      key: 'UNKNOWN',
      label: 'Không xác định',
      tone: 'neutral',
      canClaim: false,
      canUseInQuote: false,
    };
  }

  if (promotion.status && promotion.status !== 'ACTIVE') {
    return {
      key: 'DISABLED',
      label: 'Ngừng áp dụng',
      tone: 'neutral',
      canClaim: false,
      canUseInQuote: false,
    };
  }

  const endMs = promotion.end_date ? Date.parse(promotion.end_date) : NaN;
  if (!Number.isNaN(endMs) && endMs <= referenceNowMs) {
    return {
      key: 'EXPIRED',
      label: 'Đã hết hạn',
      tone: 'neutral',
      canClaim: false,
      canUseInQuote: false,
    };
  }

  const startMs = promotion.start_date ? Date.parse(promotion.start_date) : NaN;
  if (!Number.isNaN(startMs) && startMs > referenceNowMs) {
    return {
      key: 'UPCOMING',
      label: 'Chưa đến giờ áp dụng',
      tone: 'info',
      canClaim: false,
      canUseInQuote: false,
    };
  }

  if (
    promotion.usage_limit !== null &&
    promotion.usage_limit !== undefined &&
    Number.isFinite(Number(promotion.usage_limit)) &&
    Number.isFinite(Number(promotion.used_count)) &&
    Number(promotion.used_count) >= Number(promotion.usage_limit)
  ) {
    return {
      key: 'EXHAUSTED',
      label: 'Đã hết lượt',
      tone: 'warning',
      canClaim: false,
      canUseInQuote: false,
    };
  }

  if (claimed) {
    return {
      key: 'CLAIMED',
      label: 'Đã nhận — Sẵn sàng dùng',
      tone: 'success',
      canClaim: false,
      canUseInQuote: true,
    };
  }

  return {
    key: 'AVAILABLE',
    label: 'Có thể nhận',
    tone: 'success',
    canClaim: true,
    canUseInQuote: false,
  };
}

/**
 * Kiểm tra thời hạn 10 phút của báo giá trả xe (return-quote) đồng bộ theo server_time.
 */
export function evaluateQuoteExpiry(
  quoteData,
  { serverTimeIso = null, clientNowMs = Date.now() } = {}
) {
  if (!quoteData || !quoteData.quote_expires_at) {
    return {
      hasQuote: false,
      remainingSeconds: 0,
      isExpired: true,
      formattedCountdown: '00:00',
    };
  }
  const remainingSeconds = computeRemainingSeconds(quoteData.quote_expires_at, {
    serverTimeIso,
    clientNowMs,
  });
  return {
    hasQuote: true,
    remainingSeconds,
    isExpired: remainingSeconds <= 0,
    formattedCountdown: formatCountdownMmSs(remainingSeconds),
  };
}

/**
 * Phân tách rõ trạng thái tải hóa đơn:
 * - 404 NOT_FOUND -> chuyến chưa phát hành hóa đơn (KHÔNG phải lỗi hệ thống).
 * - Lỗi khác (500, mất mạng, 403...) -> hiển thị trạng thái lỗi kèm nút tải lại.
 */
export function classifyInvoiceFetchResult({ invoice = null, error = null } = {}) {
  if (error) {
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return {
        state: 'not_issued',
        invoice: null,
        error: null,
        message: 'Hóa đơn chưa được phát hành cho chuyến thuê này.',
      };
    }
    return {
      state: 'error',
      invoice: null,
      error,
      message: null,
    };
  }

  if (!invoice) {
    return {
      state: 'not_issued',
      invoice: null,
      error: null,
      message: 'Hóa đơn chưa được phát hành cho chuyến thuê này.',
    };
  }

  return {
    state: 'issued',
    invoice,
    error: null,
    message: null,
  };
}

/**
 * Định dạng giá trị tiền chính thức, phân biệt rõ "0.00" (0đ) với null/undefined (Chưa phát sinh / Chưa cập nhật).
 */
export function formatOfficialMoneyOrNull(value, emptyLabel = 'Chưa cập nhật') {
  if (value === null || value === undefined || String(value).trim() === '') {
    return emptyLabel;
  }
  return formatMoneyDisplay(value);
}
