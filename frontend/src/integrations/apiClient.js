// Nền tảng giao tiếp HTTP dùng chung cho toàn bộ ứng dụng EVRide (#15 & #16).
// - Đọc VITE_API_BASE_URL và VITE_API_TIMEOUT_MS từ môi trường.
// - Parse chuẩn envelope { data, meta }, phân trang và đồng bộ meta.server_time.
// - Hỗ trợ đầy đủ JSON, text/plain, binary (Blob/ArrayBuffer) và multipart/form-data.
// - Phân biệt rõ lỗi mạng (network), quá hạn chờ (timeout), hủy chủ động (abort), lỗi nghiệp vụ (business) và lỗi máy chủ (server).
// - Chụp nguyên tử token & định danh phiên (sessionId, epoch) ngay tại thời điểm gửi request:
//   không bao giờ refresh/retry request của phiên A bằng phiên B, và không để lỗi từ request cũ hay lỗi mạng tạm thời xóa phiên mới.

import {
  ERROR_MESSAGES_BY_CODE,
  getApiErrorMessage,
  sanitizeErrorDetails,
} from '../utils/errorMessages.js';
import { recordServerTime } from '../utils/format.js';

export const DEFAULT_BASE_URL = 'http://localhost:8000/api/v1';
export const DEFAULT_TIMEOUT_MS = 15000;

function readEnvValue(key) {
  if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
    return import.meta.env[key];
  }
  if (typeof globalThis.process !== 'undefined' && globalThis.process?.env && key in globalThis.process.env) {
    return globalThis.process.env[key];
  }
  return undefined;
}

export const API_BASE_URL = String(readEnvValue('VITE_API_BASE_URL') || DEFAULT_BASE_URL)
  .trim()
  .replace(/\/+$/, '');

const parsedTimeout = Number(readEnvValue('VITE_API_TIMEOUT_MS'));
export const CONFIGURED_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) && parsedTimeout >= 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS;

export class ApiError extends Error {
  constructor(
    status,
    code,
    rawMessage,
    {
      kind = null,
      details = null,
      meta = null,
      retryAfter = null,
    } = {}
  ) {
    const resolvedCode = code || (status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR');
    const resolvedKind =
      kind ||
      (status === 0
        ? 'network'
        : status >= 500 &&
            resolvedCode !== 'POLICY_NOT_CONFIGURED' &&
            resolvedCode !== 'FEATURE_NOT_ENABLED'
          ? 'server'
          : 'business');

    const safeDetails = sanitizeErrorDetails(details);
    const safeMessage = getApiErrorMessage({
      status,
      code: resolvedCode,
      message: rawMessage,
      retryAfter,
    });

    super(safeMessage);
    this.name = 'ApiError';
    this.status = status;
    this.code = resolvedCode;
    this.kind = resolvedKind;
    this.details = safeDetails;
    this.meta = meta && typeof meta === 'object' ? meta : null;
    this.pagination = extractPagination(this.meta);
    this.serverTime = this.meta?.server_time || null;
    this.retryAfter = retryAfter || null;
  }

  get isNetworkError() {
    return this.kind === 'network';
  }

  get isTimeout() {
    return this.kind === 'timeout';
  }

  get isAborted() {
    return this.kind === 'abort';
  }

  get isBusinessError() {
    return this.kind === 'business';
  }

  get isServerError() {
    return this.kind === 'server';
  }
}

export function isAbortError(error) {
  return Boolean(
    error &&
      (error.name === 'AbortError' || error.kind === 'abort' || error.code === 'REQUEST_ABORTED')
  );
}

export function extractPagination(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const page = Number(meta.page);
  const pageSize = Number(meta.page_size);
  const total = Number(meta.total);
  if (!Number.isInteger(page) || !Number.isInteger(pageSize) || !Number.isInteger(total) || pageSize <= 0) {
    return null;
  }
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1 && totalPages > 0,
  };
}

const AUTH_TERMINAL_401_CODES = new Set([
  'UNAUTHENTICATED',
  'SESSION_INVALID',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'REFRESH_INVALID',
  'REFRESH_EXPIRED',
  'REFRESH_REUSED',
]);

/**
 * Danh sách mã lỗi xác nhận phiên hoặc tài khoản đã thực sự chấm dứt hiệu lực.
 * Các lỗi mạng (NETWORK_ERROR), timeout (REQUEST_TIMEOUT), 5xx, 429 hoặc 409 tạm thời KHÔNG nằm trong tập này.
 */
export const TERMINAL_AUTH_ERROR_CODES = new Set([
  ...AUTH_TERMINAL_401_CODES,
  'ACCOUNT_DISABLED',
  'SESSION_SELECTION_REQUIRED',
  'TOO_MANY_AUTH_COOKIES',
]);

export function isTerminalAuthError(error) {
  if (!error || isAbortError(error)) return false;
  if (error.kind === 'network' || error.kind === 'timeout' || error.kind === 'server') {
    return false;
  }
  const status = Number(error.status) || 0;
  if (status === 0 || status >= 500 || status === 429) {
    return false;
  }
  const code = error.code || '';
  if (status === 401 && AUTH_TERMINAL_401_CODES.has(code)) {
    return true;
  }
  if (status === 403 && code === 'ACCOUNT_DISABLED') {
    return true;
  }
  if (status === 400 && (code === 'SESSION_SELECTION_REQUIRED' || code === 'TOO_MANY_AUTH_COOKIES')) {
    return true;
  }
  return false;
}

const AUTH_ENDPOINT_PATTERNS = [
  /^\/?(?:api\/v1\/)?auth\/(login|register|refresh|logout)(?:$|\?)/i,
];

function createDefaultHandlers() {
  return {
    getAccessToken: () => null,
    getSessionContext: null, // () => { accessToken, sessionId, epoch, isLoggingOut }
    onTokenExpired: null,    // async ({ error, path, method, failedToken, sessionId, epoch }) => string | null
    onAuthInvalid: null,     // (apiError, requestAuthContext) => void
    onForbidden: null,       // (apiError) => void
    customRequest: null,
  };
}

let platformHandlers = createDefaultHandlers();

export function configurePlatformApi(handlers = {}) {
  platformHandlers = {
    ...platformHandlers,
    ...handlers,
  };
}

export function resetPlatformApi() {
  platformHandlers = createDefaultHandlers();
}

export function getAccessToken() {
  if (typeof platformHandlers.getSessionContext === 'function') {
    const ctx = platformHandlers.getSessionContext();
    if (ctx && 'accessToken' in ctx) {
      return ctx.accessToken || null;
    }
  }
  return typeof platformHandlers.getAccessToken === 'function'
    ? platformHandlers.getAccessToken()
    : null;
}

export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'boolean') {
      search.set(key, value ? 'true' : 'false');
      return;
    }
    if (typeof value === 'bigint') {
      search.set(key, value.toString());
      return;
    }
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function resolveApiUrl(pathOrUrl, query, baseUrl = API_BASE_URL) {
  const queryStr = query ? buildQuery(query) : '';
  const appendQuery = (base) => {
    if (!queryStr) return base;
    return base.includes('?') ? `${base}&${queryStr.slice(1)}` : `${base}${queryStr}`;
  };

  const rawPath = String(pathOrUrl || '').trim();
  if (/^https?:\/\//i.test(rawPath)) {
    const expectedOrigin = new URL(baseUrl || DEFAULT_BASE_URL, globalThis.location?.origin || DEFAULT_BASE_URL).origin;
    const target = new URL(rawPath);
    if (target.origin !== expectedOrigin || target.username || target.password) {
      throw new ApiError(400, 'INVALID_REQUEST', 'Đường dẫn dữ liệu không thuộc dịch vụ EVRide.');
    }
    return appendQuery(rawPath);
  }

  const normalizedBase = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  if (normalizedPath.startsWith('/api/v1/') && normalizedBase.endsWith('/api/v1')) {
    return appendQuery(`${normalizedBase.slice(0, -'/api/v1'.length)}${normalizedPath}`);
  }
  return appendQuery(`${normalizedBase}${normalizedPath}`);
}

export function stringifyJsonBody(body) {
  return JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
}

function isBinaryBody(body) {
  if (!body || typeof body !== 'object') return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
  if (typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) {
    return true;
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return true;
  return false;
}

function isAuthEndpointPath(path) {
  const target = String(path || '');
  return AUTH_ENDPOINT_PATTERNS.some((re) => re.test(target));
}

function extractFilenameFromDisposition(disposition) {
  if (!disposition) return null;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return utf8Match[1].trim();
    }
  }
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1].trim() : null;
}

function createCallerAbortError() {
  const abortErr = new Error(ERROR_MESSAGES_BY_CODE.REQUEST_ABORTED);
  abortErr.name = 'AbortError';
  abortErr.code = 'REQUEST_ABORTED';
  abortErr.kind = 'abort';
  abortErr.isAborted = true;
  return abortErr;
}

function createExecutionSignal(callerSignal, timeoutMs) {
  const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  if (!callerSignal && !hasTimeout) {
    return { signal: undefined, didTimeout: () => false, cleanup: () => {} };
  }

  if (callerSignal?.aborted) {
    return {
      signal: callerSignal,
      didTimeout: () => false,
      cleanup: () => {},
      abortedBeforeStart: true,
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  let timerId = null;

  const onCallerAbort = () => {
    controller.abort();
  };

  if (callerSignal) {
    callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  if (hasTimeout) {
    timerId = setTimeout(() => {
      if (!callerSignal?.aborted) {
        timedOut = true;
        controller.abort();
      }
    }, timeoutMs);
  }

  const cleanup = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  };

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup,
    abortedBeforeStart: false,
  };
}

function resolveDefaultAcceptHeader(responseType) {
  if (responseType === 'text') return 'text/plain, application/json;q=0.8';
  if (responseType === 'blob' || responseType === 'arrayBuffer') return '*/*';
  return 'application/json, text/plain;q=0.9, */*;q=0.8';
}

function shouldReadAsBinary(responseType, contentType) {
  if (responseType === 'blob' || responseType === 'arrayBuffer') return true;
  if (responseType !== 'auto') return false;
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith('image/') ||
    ct.startsWith('application/octet-stream') ||
    ct.startsWith('application/pdf') ||
    ct.startsWith('audio/') ||
    ct.startsWith('video/')
  );
}

function shouldReadAsText(responseType, contentType) {
  if (responseType === 'text') return true;
  if (responseType !== 'auto') return false;
  const ct = contentType.toLowerCase();
  return ct.startsWith('text/');
}

function captureRequestAuthSnapshot({
  requestHeaders,
  overrideAccessToken,
  explicitSessionContext,
}) {
  const hasSessionProvider = typeof platformHandlers.getSessionContext === 'function';
  const liveCtx = hasSessionProvider ? platformHandlers.getSessionContext() : null;

  const rawExplicitHeader = requestHeaders.Authorization || requestHeaders.authorization || null;
  const explicitBearer =
    typeof rawExplicitHeader === 'string' && /^Bearer\s+/i.test(rawExplicitHeader)
      ? rawExplicitHeader.replace(/^Bearer\s+/i, '').trim()
      : null;

  const sentToken =
    overrideAccessToken ||
    explicitBearer ||
    (liveCtx && 'accessToken' in liveCtx ? liveCtx.accessToken : getAccessToken()) ||
    null;

  const sessionId = explicitSessionContext
    ? explicitSessionContext.sessionId || null
    : liveCtx?.sessionId || null;
  const epoch = explicitSessionContext
    ? explicitSessionContext.epoch || null
    : liveCtx?.epoch || null;

  return {
    sentToken,
    sessionId,
    epoch,
    hasSessionProvider,
    hadExplicitAuthHeader: Boolean(rawExplicitHeader && !overrideAccessToken),
  };
}

/**
 * Kiểm tra xem request vừa nhận kết quả có còn thuộc đúng phiên đăng nhập đang hoạt động hay không.
 * - Request không mang phiên (ẩn danh) KHÔNG được tác động lên phiên vừa đăng nhập mới.
 * - Request của phiên A (sessionId_A / epoch_A) KHÔNG được refresh/retry bằng phiên B hoặc xóa phiên B.
 */
function doesRequestMatchActiveSession(requestAuthContext) {
  if (!requestAuthContext) return false;

  if (typeof platformHandlers.getSessionContext === 'function') {
    const live = platformHandlers.getSessionContext();
    if (!live || live.isLoggingOut) {
      return false;
    }
    // Request lúc gửi không thuộc phiên nào -> không được xóa hay refresh phiên hiện tại.
    if (!requestAuthContext.sessionId) {
      return false;
    }
    if (!live.sessionId || live.sessionId !== requestAuthContext.sessionId) {
      return false;
    }
    if (requestAuthContext.epoch && live.epoch && live.epoch !== requestAuthContext.epoch) {
      return false;
    }
    return true;
  }

  // Chế độ fallback cho các unit test độc lập chỉ cấu hình getAccessToken mà không cấu hình getSessionContext.
  if (!requestAuthContext.sentToken) {
    const currentToken = getAccessToken();
    return !currentToken;
  }
  const currentToken = getAccessToken();
  return Boolean(currentToken);
}

async function executeSingleRequest(path, options, _retriedAfterRefresh = false) {
  const {
    method = 'GET',
    query,
    body,
    headers = {},
    idempotencyKey,
    credentials = 'include',
    responseType = 'auto',
    timeoutMs = CONFIGURED_TIMEOUT_MS,
    skipAuthCallback = false,
    skipAuthRefresh = false,
    signal: callerSignal,
    sessionContext: explicitSessionContext = null,
    overrideAccessToken = null,
  } = options;

  const url = resolveApiUrl(path, query);
  const requestHeaders = {
    Accept: resolveDefaultAcceptHeader(responseType),
    ...headers,
  };

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (isFormData) {
    delete requestHeaders['Content-Type'];
    delete requestHeaders['content-type'];
  }

  // Chụp nguyên tử token & định danh phiên (sessionId, epoch) ngay tại thời điểm chuẩn bị gửi request!
  const requestAuthContext = captureRequestAuthSnapshot({
    requestHeaders,
    overrideAccessToken,
    explicitSessionContext,
  });

  if (
    requestAuthContext.sentToken &&
    !requestHeaders.Authorization &&
    !requestHeaders.authorization
  ) {
    requestHeaders.Authorization = `Bearer ${requestAuthContext.sentToken}`;
  }
  if (idempotencyKey) {
    requestHeaders['Idempotency-Key'] = idempotencyKey;
  }

  let requestBody = body;
  if (body !== undefined && body !== null && typeof body !== 'string' && !isBinaryBody(body)) {
    if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    requestBody = stringifyJsonBody(body);
  }

  const execSignal = createExecutionSignal(callerSignal, timeoutMs);
  if (execSignal.abortedBeforeStart) {
    throw createCallerAbortError();
  }

  let response;
  try {
    response = await fetch(url, {
      method: method.toUpperCase(),
      headers: requestHeaders,
      body: requestBody,
      credentials,
      signal: execSignal.signal,
    });
  } catch (transportErr) {
    const timedOut = execSignal.didTimeout();
    execSignal.cleanup();

    if (callerSignal?.aborted || (!timedOut && transportErr?.name === 'AbortError')) {
      throw createCallerAbortError();
    }
    if (timedOut) {
      throw new ApiError(0, 'REQUEST_TIMEOUT', ERROR_MESSAGES_BY_CODE.REQUEST_TIMEOUT, {
        kind: 'timeout',
      });
    }
    throw new ApiError(0, 'NETWORK_ERROR', ERROR_MESSAGES_BY_CODE.NETWORK_ERROR, {
      kind: 'network',
    });
  }

  const retryAfter = response.headers.get('Retry-After');
  const contentType = response.headers.get('content-type') || '';
  const isJsonContent = contentType.toLowerCase().includes('application/json');

  if (!response.ok) {
    let errorPayload = null;
    let rawTextError = '';

    try {
      if (isJsonContent) {
        errorPayload = await response.json().catch(() => null);
      } else {
        rawTextError = await response.text().catch(() => '');
      }
    } finally {
      execSignal.cleanup();
    }

    const meta = errorPayload?.meta && typeof errorPayload.meta === 'object' ? errorPayload.meta : null;
    if (meta?.server_time) {
      recordServerTime(meta.server_time);
    }

    const errObj =
      errorPayload?.error && typeof errorPayload.error === 'object' ? errorPayload.error : {};
    const code = errObj.code || (response.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR');
    const rawMessage = errObj.message || rawTextError || '';

    const apiError = new ApiError(response.status, code, rawMessage, {
      details: errObj.details || null,
      meta,
      retryAfter,
    });

    const matchesCurrentSession = doesRequestMatchActiveSession(requestAuthContext);

    // Chỉ thử refresh & retry tối đa 1 lần khi:
    // 1. Lỗi là 401 TOKEN_EXPIRED trên endpoint nghiệp vụ,
    // 2. Request lúc gửi có mang Bearer token (sentToken),
    // 3. Phiên hiện tại VẪN là đúng phiên (sessionId, epoch) đã gửi request này!
    const canSilentRefresh =
      response.status === 401 &&
      code === 'TOKEN_EXPIRED' &&
      Boolean(requestAuthContext.sentToken) &&
      !requestAuthContext.hadExplicitAuthHeader &&
      matchesCurrentSession &&
      !_retriedAfterRefresh &&
      !skipAuthRefresh &&
      !skipAuthCallback &&
      !isAuthEndpointPath(path) &&
      typeof platformHandlers.onTokenExpired === 'function';

    if (canSilentRefresh) {
      let refreshedToken = null;
      try {
        refreshedToken = await platformHandlers.onTokenExpired({
          error: apiError,
          path,
          method: method.toUpperCase(),
          failedToken: requestAuthContext.sentToken,
          sessionId: requestAuthContext.sessionId,
          epoch: requestAuthContext.epoch,
        });
      } catch (refreshErr) {
        const finalErr = refreshErr instanceof ApiError ? refreshErr : apiError;
        // CHỈ gọi onAuthInvalid nếu lỗi refresh là mã lỗi kết thúc phiên thực sự VÀ phiên vẫn khớp!
        // Tuyệt đối KHÔNG xóa phiên khi refresh gặp NETWORK_ERROR, REQUEST_TIMEOUT, 429 hay lỗi server 5xx tạm thời.
        if (
          !skipAuthCallback &&
          isTerminalAuthError(finalErr) &&
          doesRequestMatchActiveSession(requestAuthContext)
        ) {
          platformHandlers.onAuthInvalid?.(finalErr, requestAuthContext);
        }
        throw finalErr;
      }

      if (callerSignal?.aborted) {
        throw createCallerAbortError();
      }

      // Kiểm tra lại lần nữa sau khi chờ refresh: nếu người dùng vừa logout hoặc chuyển sang phiên B thì KHÔNG retry!
      if (refreshedToken && doesRequestMatchActiveSession(requestAuthContext)) {
        return executeSingleRequest(
          path,
          {
            ...options,
            sessionContext: {
              sessionId: requestAuthContext.sessionId,
              epoch: requestAuthContext.epoch,
            },
            overrideAccessToken: refreshedToken,
          },
          true
        );
      }

      if (!skipAuthCallback && doesRequestMatchActiveSession(requestAuthContext)) {
        platformHandlers.onAuthInvalid?.(apiError, requestAuthContext);
      }
      throw apiError;
    }

    if (!skipAuthCallback) {
      const isAuthFailureOnRequest =
        Boolean(requestAuthContext.sentToken) &&
        ((response.status === 401 && code === 'TOKEN_EXPIRED') || isTerminalAuthError(apiError));

      if (isAuthFailureOnRequest && matchesCurrentSession) {
        platformHandlers.onAuthInvalid?.(apiError, requestAuthContext);
      } else if (response.status === 403 && code !== 'ACCOUNT_DISABLED' && matchesCurrentSession) {
        platformHandlers.onForbidden?.(apiError);
      }
    }

    throw apiError;
  }

  // Nhánh thành công (2xx)
  try {
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {
        data: null,
        meta: null,
        pagination: null,
        serverTime: null,
        status: response.status,
        contentType,
      };
    }

    if (shouldReadAsBinary(responseType, contentType)) {
      const filename = extractFilenameFromDisposition(response.headers.get('content-disposition'));
      if (responseType === 'arrayBuffer') {
        const buffer = await response.arrayBuffer();
        return {
          data: buffer,
          meta: null,
          pagination: null,
          serverTime: null,
          status: response.status,
          contentType,
          filename,
        };
      }
      const blob = await response.blob();
      return {
        data: blob,
        meta: null,
        pagination: null,
        serverTime: null,
        status: response.status,
        contentType: contentType || blob.type,
        filename,
      };
    }

    if (shouldReadAsText(responseType, contentType) && !isJsonContent) {
      const text = await response.text();
      return {
        data: text,
        meta: null,
        pagination: null,
        serverTime: null,
        status: response.status,
        contentType,
      };
    }

    const rawText = await response.text();
    if (!rawText) {
      return {
        data: null,
        meta: null,
        pagination: null,
        serverTime: null,
        status: response.status,
        contentType,
      };
    }

    if (!isJsonContent && responseType === 'auto') {
      try {
        const parsedFallback = JSON.parse(rawText);
        const hasEnvelope =
          parsedFallback !== null &&
          typeof parsedFallback === 'object' &&
          Object.prototype.hasOwnProperty.call(parsedFallback, 'data');
        const meta = hasEnvelope && parsedFallback.meta ? parsedFallback.meta : null;
        if (meta?.server_time) recordServerTime(meta.server_time);
        return {
          data: hasEnvelope ? parsedFallback.data : parsedFallback,
          meta,
          pagination: extractPagination(meta),
          serverTime: meta?.server_time || null,
          status: response.status,
          contentType,
        };
      } catch {
        return {
          data: rawText,
          meta: null,
          pagination: null,
          serverTime: null,
          status: response.status,
          contentType,
        };
      }
    }

    let payload = null;
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new ApiError(502, 'DEPENDENCY_UNAVAILABLE', ERROR_MESSAGES_BY_CODE.DEPENDENCY_UNAVAILABLE, {
        kind: 'server',
      });
    }

    const isEnvelopeObject =
      payload !== null &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      Object.prototype.hasOwnProperty.call(payload, 'data');

    const meta =
      isEnvelopeObject && payload.meta && typeof payload.meta === 'object' ? payload.meta : null;

    if (meta?.server_time) {
      recordServerTime(meta.server_time);
    }

    return {
      data: isEnvelopeObject ? payload.data : payload,
      meta,
      pagination: extractPagination(meta),
      serverTime: meta?.server_time || null,
      status: response.status,
      contentType,
    };
  } catch (readErr) {
    if (readErr instanceof ApiError || isAbortError(readErr)) {
      throw readErr;
    }
    if (callerSignal?.aborted || (!execSignal.didTimeout() && readErr?.name === 'AbortError')) {
      throw createCallerAbortError();
    }
    if (execSignal.didTimeout()) {
      throw new ApiError(0, 'REQUEST_TIMEOUT', ERROR_MESSAGES_BY_CODE.REQUEST_TIMEOUT, {
        kind: 'timeout',
      });
    }
    throw new ApiError(0, 'NETWORK_ERROR', ERROR_MESSAGES_BY_CODE.NETWORK_ERROR, {
      kind: 'network',
    });
  } finally {
    execSignal.cleanup();
  }
}

export async function apiRequest(path, options = {}) {
  if (typeof platformHandlers.customRequest === 'function') {
    return platformHandlers.customRequest(path, options);
  }
  return executeSingleRequest(path, options, false);
}
