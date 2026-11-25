// Dịch vụ API Ví Tiền mô phỏng & Khuyến mãi phía Khách hàng (#15).
// Đối chiếu trực tiếp contract trên `origin/develop` (sau merge PR #40 — commit `b52ef8f`, SHA `142451c9f9631b35c1fbc6be512d12a70ad51772`):
// - GET /wallets/me
// - GET /wallets/me/transactions
// - POST /wallets/me/topups (Idempotency-Key bắt buộc, body chỉ gồm { amount }, trả 201 status: "PENDING")
// - GET /wallets/me/topups
// - GET /wallet-topup-requests/{id}
// Chốt bảo vệ an toàn: Nếu backend local chưa cập nhật contract chờ duyệt (chưa xác minh được GET /wallets/me/topups),
// tuyệt đối KHÔNG cho phép gọi POST /wallets/me/topups để tránh gọi nhầm endpoint cộng tiền ngay cũ.

import { ApiError, apiRequest } from '../integrations/apiClient.js';

export function getMyWallet({ signal } = {}) {
  return apiRequest('/wallets/me', { signal });
}

export function listMyWalletTransactions(params = {}, { signal } = {}) {
  return apiRequest('/wallets/me/transactions', { query: params, signal });
}

export function listMyTopupRequests(params = {}, { signal } = {}) {
  return apiRequest('/wallets/me/topups', { query: params, signal });
}

export function getTopupRequestDetail(requestId, { signal } = {}) {
  return apiRequest(`/wallet-topup-requests/${encodeURIComponent(String(requestId))}`, {
    signal,
  });
}

/**
 * Gửi yêu cầu nạp tiền chờ nhân viên xác nhận (POST /wallets/me/topups).
 * - Yêu cầu `backendCompatible === true` (đã xác minh máy chủ hỗ trợ GET /wallets/me/topups).
 * - Chỉ gửi đúng `{ amount: "150000.00" }` theo StrictRequest (`extra="forbid"`).
 * - Kiểm tra phản hồi phải là bản ghi yêu cầu nạp (`status === 'PENDING'`), không chấp nhận cấu trúc cộng ngay cũ.
 */
export async function createCustomerTopupRequest(
  payload,
  idempotencyKey,
  { backendCompatible = false } = {}
) {
  if (backendCompatible !== true) {
    throw new ApiError(
      503,
      'TOPUP_BACKEND_INCOMPATIBLE',
      'Máy chủ hiện tại chưa hỗ trợ luồng phê duyệt yêu cầu nạp tiền.'
    );
  }

  const res = await apiRequest('/wallets/me/topups', {
    method: 'POST',
    body: {
      amount: String(payload.amount),
    },
    idempotencyKey,
  });

  const data = res?.data;
  if (!data || typeof data !== 'object' || typeof data.id !== 'string' || data.status !== 'PENDING' || data.payment_mode !== 'DEMO' || 'wallet_transaction' in data) {
    throw new ApiError(
      503,
      'TOPUP_BACKEND_INCOMPATIBLE',
      'Phản hồi máy chủ không khớp chuẩn yêu cầu nạp chờ duyệt. Vui lòng tải lại lịch sử yêu cầu trước khi thử lại.'
    );
  }

  return res;
}

export function listAvailablePromotions(params = {}, { signal } = {}) {
  return apiRequest('/promotions', { query: params, signal });
}

export function claimPromotion(promotionId, idempotencyKey) {
  return apiRequest(`/promotions/${encodeURIComponent(String(promotionId))}/claim`, {
    method: 'POST',
    body: {},
    idempotencyKey,
  });
}

export function listMyPromotions(params = {}, { signal } = {}) {
  return apiRequest('/users/me/promotions', { query: params, signal });
}
