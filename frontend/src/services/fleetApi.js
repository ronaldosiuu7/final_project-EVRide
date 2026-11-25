import { apiRequest } from '../integrations/apiClient';

export function listAdminStations(params = {}, { signal } = {}) {
  return apiRequest('/admin/stations', { query: params, signal });
}

export function createStation(payload) {
  return apiRequest('/stations', {
    method: 'POST',
    body: payload,
  });
}

export function updateStation(stationId, payload) {
  return apiRequest(`/stations/${stationId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function listVehicles(params = {}, { signal } = {}) {
  return apiRequest('/vehicles', { query: params, signal });
}

export function getVehicle(vehicleId, { signal } = {}) {
  return apiRequest(`/vehicles/${vehicleId}`, { signal });
}

export function createVehicle(payload) {
  return apiRequest('/vehicles', {
    method: 'POST',
    body: payload,
  });
}

export function updateVehicle(vehicleId, payload) {
  return apiRequest(`/vehicles/${vehicleId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function updateVehicleBattery(vehicleId, payload) {
  return apiRequest(`/vehicles/${vehicleId}/battery`, {
    method: 'PATCH',
    body: payload,
  });
}

export function updateVehicleStatus(vehicleId, payload, idempotencyKey) {
  return apiRequest(`/vehicles/${vehicleId}/status`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function moveVehicle(vehicleId, payload, idempotencyKey) {
  return apiRequest(`/vehicles/${vehicleId}/move`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function listVehicleMoveHistory(vehicleId, params = {}, { signal } = {}) {
  return apiRequest(`/vehicles/${vehicleId}/move-history`, { query: params, signal });
}

export function listPrices(params = {}, { signal } = {}) {
  return apiRequest('/prices', { query: params, signal });
}

export function getPrice(priceId, { signal } = {}) {
  return apiRequest(`/prices/${priceId}`, { signal });
}

export function createPriceVersion(payload, idempotencyKey) {
  return apiRequest('/prices', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}
