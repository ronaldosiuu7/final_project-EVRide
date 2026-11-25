import { apiRequest } from '../integrations/apiClient.js';

export function createRental(payload, idempotencyKey) {
  return apiRequest('/rentals', {
    method: 'POST',
    body: {
      vehicle_id: String(payload.vehicle_id),
      pickup_station_id: String(payload.pickup_station_id),
    },
    idempotencyKey,
  });
}

export function cancelRental(rentalId, idempotencyKey) {
  return apiRequest(`/rentals/${encodeURIComponent(String(rentalId))}/cancel`, {
    method: 'POST',
    body: {},
    idempotencyKey,
  });
}

export function listRentals(params = {}, { signal } = {}) {
  return apiRequest('/rentals', { query: params, signal });
}

export function getRental(rentalId, { signal } = {}) {
  return apiRequest(`/rentals/${rentalId}`, { signal });
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

export function listRentalHandovers(rentalId, params = {}, { signal } = {}) {
  return apiRequest(`/rentals/${rentalId}/handovers`, { query: params, signal });
}

export function getRentalInvoice(rentalId, { signal } = {}) {
  return apiRequest(`/rentals/${rentalId}/invoice`, { signal });
}

export function listRentalTransactions(rentalId, params = {}, { signal } = {}) {
  return apiRequest(`/rentals/${rentalId}/transactions`, { query: params, signal });
}

export function getLatestRentalGps(rentalId, { signal } = {}) {
  return apiRequest(`/rentals/${rentalId}/gps/latest`, { signal });
}

export function listRentalGpsHistory(rentalId, params = {}, { signal } = {}) {
  return apiRequest(`/rentals/${rentalId}/gps`, { query: params, signal });
}

export function postDemoRentalGps(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rentals/${rentalId}/gps`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function getRentalReview(rentalId, { signal } = {}) {
  return apiRequest(`/rentals/${rentalId}/review`, { signal });
}

export function listDueCheckIns(params = {}, { signal } = {}) {
  return apiRequest('/rental-check-ins', { query: params, signal });
}

export function recordCheckIn(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rental-check-ins/${rentalId}`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}
