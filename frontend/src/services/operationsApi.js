import { apiRequest } from '../integrations/apiClient';

// --- Support Tickets ---
export function listTickets(params = {}, { signal } = {}) {
  return apiRequest('/support-tickets', { query: params, signal });
}

export function getTicket(ticketId, { signal } = {}) {
  return apiRequest(`/support-tickets/${ticketId}`, { signal });
}

export function createTicket(rentalId, payload) {
  return apiRequest(`/rentals/${rentalId}/support-tickets`, {
    method: 'POST',
    body: payload,
  });
}

export function updateTicket(ticketId, payload) {
  return apiRequest(`/support-tickets/${ticketId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function listTicketAttachments(ticketId, params = {}, { signal } = {}) {
  return apiRequest('/files/attachments', {
    query: {
      owner_type: 'SUPPORT_TICKET',
      owner_id: ticketId,
      ...params,
    },
    signal,
  });
}

export function attachFileToTicket(fileId, supportTicketId, idempotencyKey) {
  return apiRequest(`/files/${fileId}/attachments`, {
    method: 'POST',
    body: {
      purpose: 'TICKET_EVIDENCE',
      support_ticket_id: String(supportTicketId),
    },
    idempotencyKey,
  });
}

// --- Maintenance Orders ---
export function listMaintenanceOrders(params = {}, { signal } = {}) {
  return apiRequest('/maintenance-orders', { query: params, signal });
}

export function getMaintenanceOrder(orderId, { signal } = {}) {
  return apiRequest(`/maintenance-orders/${orderId}`, { signal });
}

export function createMaintenanceOrder(payload, idempotencyKey) {
  return apiRequest('/maintenance-orders', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function startMaintenanceOrder(orderId, payload, idempotencyKey) {
  return apiRequest(`/maintenance-orders/${orderId}/start`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function completeMaintenanceOrder(orderId, payload, idempotencyKey) {
  return apiRequest(`/maintenance-orders/${orderId}/complete`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function cancelMaintenanceOrder(orderId, payload, idempotencyKey) {
  return apiRequest(`/maintenance-orders/${orderId}/cancel`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}
