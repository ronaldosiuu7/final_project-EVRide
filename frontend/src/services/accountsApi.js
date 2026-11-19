import { apiRequest } from '../integrations/apiClient';

export function listUsers(params = {}) {
  return apiRequest('/users', { query: params });
}

export function getUser(userId) {
  return apiRequest(`/users/${userId}`);
}

export function createStaffUser(payload) {
  return apiRequest('/users', {
    method: 'POST',
    body: payload,
  });
}

export function updateUser(userId, payload) {
  return apiRequest(`/users/${userId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function getUserWallet(userId) {
  return apiRequest(`/users/${userId}/wallet`);
}

export function updateWalletStatus(walletId, payload) {
  return apiRequest(`/wallets/${walletId}/status`, {
    method: 'PATCH',
    body: payload,
  });
}

export function getDocumentSensitive(docId) {
  return apiRequest(`/user-documents/${docId}/sensitive`);
}

export function verifyDocument(docId, payload) {
  return apiRequest(`/user-documents/${docId}/verification`, {
    method: 'PATCH',
    body: payload,
  });
}

export function listPromotions(params = {}) {
  return apiRequest('/promotions', { query: params });
}

export function createPromotion(payload) {
  return apiRequest('/promotions', {
    method: 'POST',
    body: payload,
  });
}

export function updatePromotionStatus(promotionId, payload) {
  return apiRequest(`/promotions/${promotionId}`, {
    method: 'PATCH',
    body: payload,
  });
}
