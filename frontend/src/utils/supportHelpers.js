// Các hàm nghiệp vụ thuần túy cho Hỗ trợ khách hàng: Ticket, Sự cố (theo quyền CUSTOMER), Đánh giá & FAQ (#15).
// - Không lộ mã enum, JSON hay markdown kỹ thuật lên màn hình chính.
// - Phân biệt chặt chẽ:
//   + compensation_amount === null ("Chưa xác định") vs "0.00" ("0đ — Không phát sinh bồi thường") vs > 0 (ngoài hệ thống).
//   + Đánh giá CHỈ áp dụng cho chuyến COMPLETED (tuyệt đối không coi CLOSED_INCIDENT là COMPLETED).
//   + Ticket chỉ tạo được cho chuyến IN_RENT, RETURN_PENDING, STOLEN, INCIDENT_PENDING, COMPLETED.

import { parseMoneyToCents } from './format.js';
import { formatMoneyDisplay } from './fleetDisplay.js';

export const TICKET_ELIGIBLE_RENTAL_STATUSES = new Set([
  'IN_RENT',
  'RETURN_PENDING',
  'STOLEN',
  'INCIDENT_PENDING',
  'COMPLETED',
]);

export const CUSTOMER_TICKET_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'OPEN', label: 'Đã tiếp nhận' },
  { value: 'IN_PROGRESS', label: 'Đang xử lý' },
  { value: 'RESOLVED', label: 'Đã giải quyết' },
  { value: 'CLOSED', label: 'Đã đóng' },
];

export function canCreateTicketForRental(rental) {
  if (!rental || !rental.status) return false;
  return TICKET_ELIGIBLE_RENTAL_STATUSES.has(String(rental.status).toUpperCase());
}

export function validateCustomerTicketForm({ rentalId, title, description }) {
  const errors = {};
  if (!String(rentalId || '').trim()) {
    errors.rental_id = 'Vui lòng chọn chuyến thuê liên quan.';
  }
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || cleanTitle.length > 200) {
    errors.title = 'Tiêu đề cần từ 1 đến 200 ký tự.';
  }
  const cleanDesc = String(description || '').trim();
  if (!cleanDesc || cleanDesc.length > 5000) {
    errors.description = 'Mô tả chi tiết cần từ 1 đến 5.000 ký tự.';
  }
  return errors;
}

/**
 * Kiểm tra chuyến có được phép gửi đánh giá hay không.
 * Theo contract backend: CHỈ chuyến COMPLETED thuộc khách; tuyệt đối KHÔNG coi CLOSED_INCIDENT là COMPLETED.
 */
export function canCustomerReviewRental(rental, userRole) {
  if (!rental || userRole !== 'CUSTOMER') return false;
  return rental.status === 'COMPLETED';
}

export function validateReviewForm({ rating, comment }) {
  const errors = {};
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    errors.rating = 'Vui lòng chọn mức đánh giá từ 1 đến 5 sao.';
  }
  if (comment !== null && comment !== undefined && String(comment).length > 2000) {
    errors.comment = 'Nhận xét tối đa 2.000 ký tự.';
  }
  return errors;
}

/**
 * Chuẩn hóa hiển thị bồi thường ngoài hệ thống từ GET /rental-incidents/{id}/finance-summary:
 * - null / undefined -> "Chưa xác định"
 * - "0.00" -> "0đ (Không phải bồi thường)"
 * - > 0 -> "<số tiền> (Xử lý ngoài hệ thống)"
 */
export function describeExternalCompensation(compensationAmount, settled = false) {
  if (compensationAmount === null || compensationAmount === undefined || String(compensationAmount).trim() === '') {
    return {
      kind: 'unknown',
      valueText: 'Chưa xác định',
      statusLabel: 'Chưa có mức bồi thường được xác nhận',
      tone: 'neutral',
    };
  }

  const cents = parseMoneyToCents(String(compensationAmount));
  if (cents === 0n) {
    return {
      kind: 'zero',
      valueText: '0đ',
      statusLabel: 'Không phải bồi thường',
      tone: 'success',
    };
  }

  return {
    kind: 'positive',
    valueText: formatMoneyDisplay(compensationAmount),
    statusLabel: settled
      ? 'Đã ghi nhận hoàn tất bồi thường ngoài hệ thống'
      : 'Nghĩa vụ bồi thường ngoài hệ thống (chưa chốt hoàn tất)',
    tone: settled ? 'success' : 'warning',
  };
}

/**
 * Chuẩn hóa tìm kiếm FAQ không phân biệt dấu tiếng Việt (khớp chuẩn normalize backend).
 */
export function normalizeVietnameseSearch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function filterFaqsByQuery(faqs = [], query = '') {
  const list = Array.isArray(faqs) ? faqs : [];
  const needle = normalizeVietnameseSearch(query);
  if (!needle) return list;
  return list.filter((item) => {
    const haystack = normalizeVietnameseSearch(`${item?.question || ''} ${item?.answer || ''}`);
    return haystack.includes(needle);
  });
}

/**
 * Làm sạch nhẹ văn bản nguồn text/plain khi hiển thị trong hộp thoại xem nguồn:
 * vẫn giữ nguyên nội dung an toàn dưới dạng text thuần (không render HTML/dangerouslySetInnerHTML).
 */
export function formatSafePlainSourceText(rawText) {
  if (typeof rawText !== 'string') return '';
  return rawText.replace(/\r\n/g, '\n').trim();
}
