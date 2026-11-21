import { apiRequest } from '../integrations/apiClient';

export function listRentals(params = {}) {
  return apiRequest('/rentals', { query: params });
}

export function getRental(rentalId) {
  return apiRequest(`/rentals/${rentalId}`);
}

export function pickupRental(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rentals/${rentalId}/pickup`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function cancelOperationalRental(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rentals/${rentalId}/cancel-operational`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function initiateReturn(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rentals/${rentalId}/initiate-return`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function createReturnQuote(rentalId, payload) {
  return apiRequest(`/rentals/${rentalId}/return-quote`, {
    method: 'POST',
    body: payload,
  });
}

export function settleReturn(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rentals/${rentalId}/return`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function listRentalHandovers(rentalId, params = {}) {
  return apiRequest(`/rentals/${rentalId}/handovers`, { query: params });
}

export function getRentalInvoice(rentalId) {
  return apiRequest(`/rentals/${rentalId}/invoice`);
}

export function listRentalTransactions(rentalId, params = {}) {
  return apiRequest(`/rentals/${rentalId}/transactions`, { query: params });
}

export function getLatestRentalGps(rentalId) {
  return apiRequest(`/rentals/${rentalId}/gps/latest`);
}

export function listRentalGpsHistory(rentalId, params = {}) {
  return apiRequest(`/rentals/${rentalId}/gps`, { query: params });
}

export function postDemoRentalGps(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rentals/${rentalId}/gps`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function getRentalReview(rentalId) {
  return apiRequest(`/rentals/${rentalId}/review`);
}

export function listDueCheckIns(params = {}) {
  return apiRequest('/rental-check-ins', { query: params });
}

export function recordCheckIn(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rental-check-ins/${rentalId}`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}
