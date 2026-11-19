import { apiRequest } from '../integrations/apiClient';

export function listAdminStations(params = {}) {
  return apiRequest('/admin/stations', { query: params });
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

export function listVehicles(params = {}) {
  return apiRequest('/vehicles', { query: params });
}

export function getVehicle(vehicleId) {
  return apiRequest(`/vehicles/${vehicleId}`);
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

export function listVehicleMoveHistory(vehicleId, params = {}) {
  return apiRequest(`/vehicles/${vehicleId}/move-history`, { query: params });
}

export function listPrices(params = {}) {
  return apiRequest('/prices', { query: params });
}

export function getPrice(priceId) {
  return apiRequest(`/prices/${priceId}`);
}

export function createPriceVersion(payload, idempotencyKey) {
  return apiRequest('/prices', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}
