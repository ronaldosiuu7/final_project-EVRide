import { apiRequest } from '../integrations/apiClient';

export function intakeIncident(rentalId, payload, idempotencyKey) {
  return apiRequest(`/rentals/${rentalId}/incident/intake`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function listIncidents(params = {}, { signal } = {}) {
  return apiRequest('/rental-incidents', { query: params, signal });
}

export function getIncident(incidentId, { signal } = {}) {
  return apiRequest(`/rental-incidents/${incidentId}`, { signal });
}

export function listIncidentEvents(incidentId, params = {}, { signal } = {}) {
  return apiRequest(`/rental-incidents/${incidentId}/events`, { query: params, signal });
}

export function createIncidentEvidenceTicket(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/evidence-tickets`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function verifyIncident(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/verify`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function recordIncidentRecovery(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/recovery`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function recordIncidentArrival(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/arrival`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function releaseIncidentVehicle(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/release-vehicle`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function getIncidentRentPreview(incidentId, { signal } = {}) {
  return apiRequest(`/rental-incidents/${incidentId}/rent-preview`, { signal });
}

export function settleIncidentRent(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/settle-rent`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function settleExternalCompensation(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/compensation/external-settlement`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function getIncidentFinanceSummary(incidentId, { signal } = {}) {
  return apiRequest(`/rental-incidents/${incidentId}/finance-summary`, { signal });
}

export function refundIncidentDeposit(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/deposit/refund`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function closeIncident(incidentId, payload, idempotencyKey) {
  return apiRequest(`/rental-incidents/${incidentId}/close`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}
