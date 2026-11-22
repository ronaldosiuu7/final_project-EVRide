import { apiRequest } from '../integrations/apiClient.js';

export function updateMyProfile(payload) {
  return apiRequest('/users/me', {
    method: 'PATCH',
    body: payload,
  });
}

export function changeMyPassword(payload) {
  return apiRequest('/users/me/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EVRide-CSRF': '1',
    },
    body: payload,
    credentials: 'include',
  });
}

const EMPLOYEES_CACHE_TTL_MS = 60 * 1000;
let activeEmployeesCache = null;

export function invalidateActiveEmployeesCache() {
  activeEmployeesCache = null;
}

export function listUsers(params = {}, { signal } = {}) {
  return apiRequest('/users', { query: params, signal });
}

export async function listActiveEmployees({ signal, force = false } = {}) {
  const now = Date.now();
  if (!force && activeEmployeesCache && now - activeEmployeesCache.fetchedAt < EMPLOYEES_CACHE_TTL_MS) {
    return { data: activeEmployeesCache.items, meta: null };
  }
  const [staffRes, managerRes] = await Promise.all([
    listUsers({ role: 'STAFF', status: 'ACTIVE', page: 1, page_size: 100 }, { signal }),
    listUsers({ role: 'MANAGER', status: 'ACTIVE', page: 1, page_size: 100 }, { signal }),
  ]);
  const items = [...(staffRes.data || []), ...(managerRes.data || [])];
  activeEmployeesCache = { items, fetchedAt: Date.now() };
  return { data: items, meta: null };
}

export function getUser(userId, { signal } = {}) {
  return apiRequest(`/users/${userId}`, { signal });
}

export async function createStaffUser(payload) {
  const res = await apiRequest('/users', {
    method: 'POST',
    body: payload,
  });
  invalidateActiveEmployeesCache();
  return res;
}

export async function updateUser(userId, payload) {
  const res = await apiRequest(`/users/${userId}`, {
    method: 'PATCH',
    body: payload,
  });
  invalidateActiveEmployeesCache();
  return res;
}

export function getUserWallet(userId, { signal } = {}) {
  return apiRequest(`/users/${userId}/wallet`, { signal });
}

export function updateWalletStatus(walletId, payload) {
  return apiRequest(`/wallets/${walletId}/status`, {
    method: 'PATCH',
    body: payload,
  });
}

export function getDocumentSensitive(docId, { signal } = {}) {
  return apiRequest(`/user-documents/${docId}/sensitive`, { signal });
}

export function verifyDocument(docId, payload) {
  return apiRequest(`/user-documents/${docId}/verification`, {
    method: 'PATCH',
    body: payload,
  });
}

export function listPromotions(params = {}, { signal } = {}) {
  return apiRequest('/promotions', { query: params, signal });
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
