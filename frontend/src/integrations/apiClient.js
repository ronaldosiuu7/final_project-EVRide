// ADAPTER BOUNDARY FOR #15:
// Lớp giao tiếp HTTP mỏng dành cho khu vực STAFF/MANAGER.
// Khi #15 hoàn thiện API client dùng chung (kèm silent refresh khi gặp 401 TOKEN_EXPIRED),
// chỉ cần truyền qua `configurePlatformApi(...)` hoặc thay thế trực tiếp file này.

const DEFAULT_BASE_URL = 'http://localhost:8000/api/v1';

export const API_BASE_URL = String(
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || DEFAULT_BASE_URL
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, code, message, { details = null, meta = null, retryAfter = null } = {}) {
    super(message || code || 'API Error');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'HTTP_ERROR';
    this.details = details;
    this.meta = meta;
    this.retryAfter = retryAfter;
  }
}

const AUTH_INVALID_CODES = new Set([
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'SESSION_INVALID',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'REFRESH_INVALID',
  'REFRESH_EXPIRED',
  'REFRESH_REUSED',
]);

let platformHandlers = {
  getAccessToken: () => null,
  onAuthInvalid: null,
  onForbidden: null,
  customRequest: null,
};

export function configurePlatformApi(handlers = {}) {
  platformHandlers = {
    ...platformHandlers,
    ...handlers,
  };
}

export function getAccessToken() {
  return platformHandlers.getAccessToken ? platformHandlers.getAccessToken() : null;
}

export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'boolean') {
      search.set(key, value ? 'true' : 'false');
      return;
    }
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function resolveApiUrl(pathOrUrl, query) {
  const queryStr = query ? buildQuery(query) : '';
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return `${pathOrUrl}${queryStr}`;
  }
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  // Hỗ trợ path đã chứa /api/v1 (ví dụ link trả về từ /user-documents/{id}/sensitive)
  if (normalized.startsWith('/api/v1/') && API_BASE_URL.endsWith('/api/v1')) {
    return `${API_BASE_URL.slice(0, -'/api/v1'.length)}${normalized}${queryStr}`;
  }
  return `${API_BASE_URL}${normalized}${queryStr}`;
}

export async function apiRequest(
  path,
  {
    method = 'GET',
    query,
    body,
    headers = {},
    idempotencyKey,
    credentials = 'include',
    skipAuthCallback = false,
    signal,
  } = {}
) {
  if (platformHandlers.customRequest) {
    return platformHandlers.customRequest(path, {
      method,
      query,
      body,
      headers,
      idempotencyKey,
      credentials,
      skipAuthCallback,
      signal,
    });
  }

  const url = resolveApiUrl(path, query);
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  const token = getAccessToken();
  if (token && !requestHeaders.Authorization) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }
  if (idempotencyKey) {
    requestHeaders['Idempotency-Key'] = idempotencyKey;
  }

  let requestBody = body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== 'string') {
    if (!requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    requestBody = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      credentials,
      signal,
    });
  } catch (networkErr) {
    if (networkErr?.name === 'AbortError') {
      throw networkErr;
    }
    throw new ApiError(0, 'DEPENDENCY_UNAVAILABLE', 'Không thể kết nối tới máy chủ API EVRide.', {
      details: { cause: networkErr?.message || 'Network error' },
    });
  }

  const retryAfter = response.headers.get('Retry-After');
  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errObj = payload?.error || {};
    const code = errObj.code || (response.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR');
    const message = errObj.message || `Yêu cầu thất bại (HTTP ${response.status}).`;
    const apiError = new ApiError(response.status, code, message, {
      details: errObj.details || null,
      meta: payload?.meta || null,
      retryAfter,
    });

    if (!skipAuthCallback) {
      if (
        (response.status === 401 && AUTH_INVALID_CODES.has(code)) ||
        (response.status === 403 && code === 'ACCOUNT_DISABLED')
      ) {
        platformHandlers.onAuthInvalid?.(apiError);
      } else if (response.status === 403) {
        platformHandlers.onForbidden?.(apiError);
      }
    }
    throw apiError;
  }

  return {
    data: payload?.data ?? payload,
    meta: payload?.meta ?? null,
  };
}
