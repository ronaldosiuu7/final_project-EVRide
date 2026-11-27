// Lõi quản lý phiên xác thực dùng chung (Rolling Session & Refresh Token Rotation) cho EVRide (#15 & #16).
// Tuân thủ nghiêm ngặt docs/api-contract.md mục 2.4 & frontend/README.md mục 8:
// - access_token CHỈ nằm trong bộ nhớ (RAM), tuyệt đối không lưu storage/cookie đọc được từ JS.
// - refresh_token nằm hoàn toàn trong cookie HttpOnly (Path=/api/v1/auth) do trình duyệt quản lý.
// - localStorage CHỈ lưu đúng 3 trường không nhạy cảm: { session_id, epoch, logging_out }.
// - Không tự gán header Origin; gửi credentials: 'include', X-EVRide-CSRF: '1' và X-Session-ID đúng endpoint.
// - Điều phối login / refresh / logout / changePassword qua Web Locks ('evride-auth') + BroadcastChannel('evride-auth')
//   mà KHÔNG bao giờ gọi khóa lồng nhau (tránh deadlock), gắn chặt kết quả với (session_id, epoch) gốc.

import { ApiError, apiRequest, isTerminalAuthError } from './apiClient.js';
import { getApiErrorMessage } from '../utils/errorMessages.js';

export const AUTH_STORAGE_KEY = 'evride_auth_session';
export const AUTH_LOCK_NAME = 'evride-auth';
export const AUTH_CHANNEL_NAME = 'evride-auth';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Quản lý xóa bộ nhớ đệm riêng tư khi đăng xuất hoặc đổi người dùng ---
const privateCacheCleaners = new Set();

export function registerPrivateCacheCleaner(cleanerFn) {
  if (typeof cleanerFn !== 'function') {
    return () => {};
  }
  privateCacheCleaners.add(cleanerFn);
  return () => {
    privateCacheCleaners.delete(cleanerFn);
  };
}

export function clearAllPrivateCaches() {
  for (const cleaner of privateCacheCleaners) {
    try {
      cleaner();
    } catch {
      // Đảm bảo một hàm dọn cache lỗi không chặn việc xóa các cache còn lại.
    }
  }
}

function generateRandomEpoch() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getDefaultStorage() {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Đọc metadata phiên hợp lệ từ localStorage.
 * Chỉ chấp nhận đúng { session_id (UUID), epoch (string), logging_out (boolean) }.
 */
export function readStoredSessionMeta(storage = getDefaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    const keys = Object.keys(parsed);
    const allowedKeys = new Set(['session_id', 'epoch', 'logging_out']);
    if (keys.some((k) => !allowedKeys.has(k))) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    const sessionId = typeof parsed.session_id === 'string' ? parsed.session_id.trim() : '';
    const epoch = typeof parsed.epoch === 'string' ? parsed.epoch.trim() : '';
    const loggingOut = Boolean(parsed.logging_out);
    if (!UUID_PATTERN.test(sessionId) || !epoch) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return {
      session_id: sessionId,
      epoch,
      logging_out: loggingOut,
    };
  } catch {
    try {
      storage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Bỏ qua lỗi storage bị chặn.
    }
    return null;
  }
}

export function writeStoredSessionMeta(storage, { session_id, epoch, logging_out = false }) {
  if (!storage) return;
  if (!UUID_PATTERN.test(String(session_id || '')) || !epoch) return;
  const strictPayload = {
    session_id: String(session_id),
    epoch: String(epoch),
    logging_out: Boolean(logging_out),
  };
  try {
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(strictPayload));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage.
  }
}

export function clearStoredSessionMeta(storage = getDefaultStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Bỏ qua lỗi storage.
  }
}

// --- Điều hướng theo vai trò & Đánh giá quyền truy cập route ---

export function resolveDefaultHomeForRole(role) {
  if (role === 'STAFF' || role === 'MANAGER') {
    return '/admin';
  }
  return '/';
}

const CUSTOMER_ONLY_PREFIXES = ['/wallet', '/rentals', '/promotions', '/support', '/profile'];
const AUTH_PUBLIC_PATHS = new Set(['/login', '/register', '/403', '/404']);

export function resolvePostLoginPath(user, requestedFrom = null) {
  const role = user?.role;
  const fallback = resolveDefaultHomeForRole(role);
  const rawPath =
    typeof requestedFrom === 'string'
      ? requestedFrom
      : requestedFrom && typeof requestedFrom === 'object' && typeof requestedFrom.pathname === 'string'
        ? `${requestedFrom.pathname}${requestedFrom.search || ''}${requestedFrom.hash || ''}`
        : null;
  if (!rawPath) {
    return fallback;
  }

  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }
  const pathOnly = trimmed.split('?')[0].split('#')[0];
  if (AUTH_PUBLIC_PATHS.has(pathOnly)) {
    return fallback;
  }

  if (role === 'CUSTOMER') {
    if (pathOnly === '/admin' || pathOnly.startsWith('/admin/')) {
      return '/';
    }
    return trimmed;
  }

  if (role === 'STAFF' || role === 'MANAGER') {
    if (pathOnly === '/') {
      return '/admin';
    }
    if (CUSTOMER_ONLY_PREFIXES.some((prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`))) {
      return '/admin';
    }
    if (role === 'STAFF' && (pathOnly === '/admin/promotions' || pathOnly.startsWith('/admin/promotions/'))) {
      return '/admin';
    }
    return trimmed;
  }

  return fallback;
}

export function evaluateRouteAccess({ isBootstrapping, isAuthenticated, user, allowedRoles }) {
  if (isBootstrapping) {
    return { status: 'bootstrapping' };
  }
  if (!isAuthenticated || !user) {
    return { status: 'unauthenticated', redirectTo: '/login' };
  }
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return { status: 'forbidden' };
  }
  return { status: 'allowed' };
}

function createInProcessLockRunner() {
  const queues = new Map();
  return async function runLock(name, callback) {
    const prev = queues.get(name) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const next = prev.then(() => gate);
    queues.set(name, next);
    await prev;
    try {
      return await callback();
    } finally {
      release();
      if (queues.get(name) === next) {
        queues.delete(name);
      }
    }
  };
}

const defaultFallbackLock = createInProcessLockRunner();

function createEmptyMemoryState(isBootstrapping = false) {
  return {
    accessToken: null,
    sessionId: null,
    epoch: null,
    generation: -1,
    accessExpiresAt: null,
    sessionExpiresAt: null,
    user: null,
    isBootstrapping,
    authNotice: null,
  };
}

function waitForSignalOrTimeout(subscribeWakeup, timeoutMs = 20) {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    unsubscribe = subscribeWakeup(finish);
  });
}

/**
 * Khởi tạo bộ quản lý phiên Rolling Session (có thể tạo nhiều instance trong test để mô phỏng nhiều tab).
 */
export function createAuthSessionManager({
  request = apiRequest,
  storage = getDefaultStorage(),
  locks = typeof globalThis.navigator !== 'undefined' ? globalThis.navigator?.locks : null,
  createBroadcastChannel = (name) =>
    typeof globalThis.BroadcastChannel === 'function' ? new globalThis.BroadcastChannel(name) : null,
  onClearCaches = clearAllPrivateCaches,
} = {}) {
  const initialStored = readStoredSessionMeta(storage);
  let state = createEmptyMemoryState(Boolean(initialStored));
  let operationSeq = 0;
  let inFlightRefresh = null; // { sessionId, epoch, promise }
  let bootstrapPromise = null;
  let destroyed = false;

  const instanceId = generateRandomEpoch();
  const listeners = new Set();
  const peerWakeups = new Set();
  const channel = createBroadcastChannel ? createBroadcastChannel(AUTH_CHANNEL_NAME) : null;
  channel?.unref?.();

  function notifyPeerWakeups() {
    for (const wake of Array.from(peerWakeups)) {
      try {
        wake();
      } catch {
        // Bỏ qua lỗi callback.
      }
    }
  }

  function emit() {
    const snapshot = getState();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // Không để lỗi listener làm gãy luồng auth.
      }
    }
  }

  function getState() {
    return {
      ...state,
      isAuthenticated: Boolean(state.accessToken && state.user && state.sessionId),
    };
  }

  /**
   * Trả về định danh phiên hiện tại để apiClient gắn vào từng request ngay lúc gửi.
   * Đối chiếu chéo với localStorage để phát hiện tức thì nếu một tab khác vừa đăng xuất / đổi sang phiên mới
   * ngay cả trước khi thông điệp BroadcastChannel bất đồng bộ kịp tới!
   */
  function getSessionContext() {
    const stored = readStoredSessionMeta(storage);
    const ramSid = state.sessionId || null;
    const ramEpoch = state.epoch || null;

    if (!ramSid) {
      return {
        accessToken: null,
        sessionId: null,
        epoch: null,
        generation: -1,
        isLoggingOut: Boolean(stored?.logging_out),
      };
    }

    if (!stored || stored.session_id !== ramSid || (ramEpoch && stored.epoch !== ramEpoch)) {
      return {
        accessToken: null,
        sessionId: null,
        epoch: null,
        generation: -1,
        isLoggingOut: true,
      };
    }

    return {
      accessToken: stored.logging_out ? null : state.accessToken,
      sessionId: ramSid,
      epoch: ramEpoch,
      generation: state.generation,
      isLoggingOut: Boolean(stored.logging_out),
    };
  }

  async function withAuthLock(fn) {
    if (locks && typeof locks.request === 'function') {
      return locks.request(AUTH_LOCK_NAME, { mode: 'exclusive' }, () => fn());
    }
    return defaultFallbackLock(AUTH_LOCK_NAME, fn);
  }

  function postChannelMessage(payload) {
    if (!channel || destroyed) return;
    try {
      channel.postMessage({
        ...payload,
        senderId: instanceId,
      });
    } catch {
      // Bỏ qua nếu kênh đã đóng.
    }
  }

  function wipeMemoryAndCaches({ nextNotice = undefined, keepBootstrapping = false } = {}) {
    const resolvedNotice = nextNotice === undefined ? state.authNotice : nextNotice;
    state = {
      ...createEmptyMemoryState(keepBootstrapping),
      authNotice: resolvedNotice || null,
    };
    onClearCaches?.();
  }

  function applyGrantToMemory(grant, epoch, { clearNotice = true } = {}) {
    const previousUserId = state.user?.id ? String(state.user.id) : null;
    const incomingUserId = grant.user?.id ? String(grant.user.id) : null;
    if (previousUserId && incomingUserId && previousUserId !== incomingUserId) {
      onClearCaches?.();
    }

    state = {
      accessToken: grant.access_token,
      sessionId: String(grant.session_id),
      epoch: String(epoch),
      generation: Number.isInteger(grant.generation) ? grant.generation : 0,
      accessExpiresAt: grant.access_expires_at || null,
      sessionExpiresAt: grant.session_expires_at || null,
      user: grant.user,
      isBootstrapping: false,
      authNotice: clearNotice ? null : state.authNotice,
    };
  }

  function doesTargetMatchCurrentSession(targetSid, targetEpoch) {
    if (!targetSid) return false;
    const stored = readStoredSessionMeta(storage);
    const matchesRam =
      state.sessionId === String(targetSid) &&
      (!targetEpoch || !state.epoch || state.epoch === String(targetEpoch));
    const matchesStorage =
      Boolean(stored) &&
      stored.session_id === String(targetSid) &&
      (!targetEpoch || stored.epoch === String(targetEpoch));
    return matchesRam || matchesStorage;
  }

  function canAcceptIncomingSessionUpdate(msg) {
    if (!msg || !msg.access_token || !msg.user || !UUID_PATTERN.test(String(msg.session_id || '')) || !msg.epoch) {
      return false;
    }
    const stored = readStoredSessionMeta(storage);
    if (!stored || stored.logging_out) {
      return false;
    }
    if (stored.session_id !== String(msg.session_id) || stored.epoch !== String(msg.epoch)) {
      return false;
    }
    const incomingGen = Number(msg.generation);
    if (!Number.isInteger(incomingGen) || incomingGen < 0) {
      return false;
    }
    if (
      state.sessionId === stored.session_id &&
      state.epoch === stored.epoch &&
      incomingGen < state.generation
    ) {
      return false;
    }
    return true;
  }

  function shouldApplyIncomingLogoutMessage(msg) {
    const stored = readStoredSessionMeta(storage);

    // Nếu tab này đang giữ một phiên cụ thể trong RAM, chỉ cho phép xóa khi thông điệp đến từ ĐÚNG phiên đó
    // (hoặc phiên đó đã bị xóa/đánh dấu logging_out trong localStorage). Không bao giờ để tin nhắn trễ của phiên A xóa phiên B!
    if (state.sessionId) {
      const msgMatchesRam =
        Boolean(msg.session_id) &&
        String(msg.session_id) === state.sessionId &&
        (!msg.epoch || !state.epoch || String(msg.epoch) === state.epoch);

      if (msgMatchesRam) {
        return true;
      }

      // Nếu localStorage hiện đang giữ phiên B (khác với msg.session_id của phiên A đến trễ), bỏ qua!
      if (
        stored &&
        !stored.logging_out &&
        stored.session_id === state.sessionId &&
        (!state.epoch || stored.epoch === state.epoch)
      ) {
        return false;
      }

      // Nếu localStorage của chính phiên RAM hiện tại đã mất hoặc đang logging_out -> xóa RAM.
      if (!stored || (stored.session_id === state.sessionId && stored.logging_out)) {
        return true;
      }

      return false;
    }

    // Khi tab này chưa có phiên trong RAM (ví dụ đang ở màn hình login), chỉ cập nhật notice nếu storage trống.
    return !stored || Boolean(stored.logging_out);
  }

  function handleChannelMessage(event) {
    if (destroyed) return;
    const msg = event?.data ?? event;
    if (!msg || typeof msg !== 'object' || msg.senderId === instanceId) {
      return;
    }

    if (msg.type === 'SESSION_UPDATED') {
      if (!canAcceptIncomingSessionUpdate(msg)) {
        return;
      }
      applyGrantToMemory(
        {
          access_token: msg.access_token,
          session_id: msg.session_id,
          generation: Number(msg.generation),
          access_expires_at: msg.access_expires_at || null,
          session_expires_at: msg.session_expires_at || null,
          user: msg.user,
        },
        msg.epoch,
        { clearNotice: true }
      );
      notifyPeerWakeups();
      emit();
      return;
    }

    if (msg.type === 'REQUEST_ACTIVE_SESSION') {
      const stored = readStoredSessionMeta(storage);
      if (
        !stored ||
        stored.logging_out ||
        !state.accessToken ||
        !state.user ||
        state.sessionId !== stored.session_id ||
        state.epoch !== stored.epoch ||
        String(msg.session_id || '') !== state.sessionId ||
        String(msg.epoch || '') !== state.epoch
      ) {
        return;
      }
      if (msg.failed_token && state.accessToken === msg.failed_token) {
        return;
      }
      if (state.accessExpiresAt) {
        const expMs = Date.parse(state.accessExpiresAt);
        if (!Number.isNaN(expMs) && expMs <= Date.now() + 5000) {
          return;
        }
      }
      postChannelMessage({
        type: 'SESSION_UPDATED',
        session_id: state.sessionId,
        epoch: state.epoch,
        generation: state.generation,
        access_token: state.accessToken,
        access_expires_at: state.accessExpiresAt,
        session_expires_at: state.sessionExpiresAt,
        user: state.user,
      });
      return;
    }

    if (msg.type === 'LOGOUT_STARTED' || msg.type === 'SESSION_CLEARED') {
      if (!shouldApplyIncomingLogoutMessage(msg)) {
        return;
      }
      operationSeq += 1;
      wipeMemoryAndCaches({
        nextNotice: msg.notice !== undefined ? msg.notice : state.authNotice,
        keepBootstrapping: false,
      });
      notifyPeerWakeups();
      emit();
      return;
    }

    if (msg.type === 'USER_PROFILE_UPDATED') {
      if (
        msg.user &&
        state.sessionId &&
        msg.session_id === state.sessionId &&
        msg.epoch === state.epoch
      ) {
        state = {
          ...state,
          user: { ...state.user, ...msg.user },
        };
        emit();
      }
    }
  }

  if (channel) {
    if (typeof channel.addEventListener === 'function') {
      channel.addEventListener('message', handleChannelMessage);
    } else {
      channel.onmessage = handleChannelMessage;
    }
  }

  /**
   * Gọi POST /auth/logout trực tiếp (KHÔNG lấy thêm khóa để tránh deadlock khi đang ở trong withAuthLock).
   * Cookie phía backend được đặt tên riêng theo từng session_id (evr_rt_<sid_hex>_<gen>),
   * nên dọn cookie của sid cũ không bao giờ ảnh hưởng cookie của phiên mới khác sid.
   */
  async function callLogoutEndpointBestEffort(sessionId) {
    if (!sessionId || !UUID_PATTERN.test(String(sessionId))) return;
    try {
      await request('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EVRide-CSRF': '1',
          'X-Session-ID': String(sessionId),
        },
        body: {},
        credentials: 'include',
        skipAuthCallback: true,
        skipAuthRefresh: true,
      });
    } catch {
      // Bỏ qua lỗi mạng/phiên đã thu hồi khi dọn cookie best-effort.
    }
  }

  /**
   * Đăng ký tài khoản CUSTOMER mới (POST /auth/register). Không trim mật khẩu.
   */
  async function register({ name, email, password }) {
    const { data } = await request('/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        name: String(name || '').trim(),
        email: String(email || '').trim(),
        password: String(password ?? ''),
      },
      credentials: 'include',
      skipAuthCallback: true,
      skipAuthRefresh: true,
    });
    return data;
  }

  /**
   * Đăng nhập dùng chung cho CUSTOMER / STAFF / MANAGER (POST /auth/login).
   */
  async function login(email, password) {
    return withAuthLock(async () => {
      operationSeq += 1;
      const loginSeq = operationSeq;

      const { data } = await request('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EVRide-CSRF': '1',
        },
        body: {
          email: String(email || '').trim(),
          password: String(password ?? ''),
        },
        credentials: 'include',
        skipAuthCallback: true,
        skipAuthRefresh: true,
      });

      if (loginSeq !== operationSeq) {
        if (data?.session_id) {
          await callLogoutEndpointBestEffort(data.session_id);
        }
        throw new ApiError(401, 'SESSION_REVOKED', 'Phiên đăng nhập đã bị hủy.');
      }

      const newEpoch = generateRandomEpoch();
      writeStoredSessionMeta(storage, {
        session_id: data.session_id,
        epoch: newEpoch,
        logging_out: false,
      });

      onClearCaches?.();
      applyGrantToMemory(data, newEpoch, { clearNotice: true });

      postChannelMessage({
        type: 'SESSION_UPDATED',
        session_id: state.sessionId,
        epoch: state.epoch,
        generation: state.generation,
        access_token: state.accessToken,
        access_expires_at: state.accessExpiresAt,
        session_expires_at: state.sessionExpiresAt,
        user: state.user,
      });

      emit();
      return state.user;
    });
  }

  /**
   * Thu hồi trạng thái đăng nhập của ĐÚNG phiên mục tiêu (targetSid, targetEpoch).
   * Nếu ứng dụng đã chuyển sang phiên khác, tuyệt đối không xóa phiên mới!
   */
  function invalidateMatchingSession(
    errorOrNotice,
    { targetSid = null, targetEpoch = null, cleanServerCookie = false } = {}
  ) {
    const stored = readStoredSessionMeta(storage);
    const activeSid = state.sessionId || stored?.session_id || null;
    const activeEpoch = state.epoch || stored?.epoch || null;

    if (targetSid && !doesTargetMatchCurrentSession(targetSid, targetEpoch)) {
      if (cleanServerCookie && String(targetSid) !== activeSid) {
        void callLogoutEndpointBestEffort(targetSid);
      }
      return false;
    }

    const sidToClean = targetSid || activeSid;
    const epochToClean = targetEpoch || activeEpoch;

    operationSeq += 1;
    if (
      !stored ||
      !sidToClean ||
      (stored.session_id === String(sidToClean) &&
        (!epochToClean || stored.epoch === String(epochToClean)))
    ) {
      clearStoredSessionMeta(storage);
    }

    const noticeText =
      typeof errorOrNotice === 'string'
        ? errorOrNotice
        : errorOrNotice
          ? getApiErrorMessage(errorOrNotice)
          : null;

    wipeMemoryAndCaches({ nextNotice: noticeText, keepBootstrapping: false });

    postChannelMessage({
      type: 'SESSION_CLEARED',
      session_id: sidToClean,
      epoch: epochToClean,
      notice: noticeText,
    });

    emit();

    if (cleanServerCookie && sidToClean) {
      void callLogoutEndpointBestEffort(sidToClean);
    }
    return true;
  }

  /**
   * Làm mới access_token qua POST /auth/refresh:
   * - Gắn chặt với (expectedSessionId, expectedEpoch) của request bị TOKEN_EXPIRED (nếu có).
   * - So sánh đúng failedToken thực tế đã gửi để không gọi refresh thừa.
   * - KHÔNG bao giờ xóa phiên khi gặp lỗi mạng, timeout, 429 hay lỗi server tạm thời.
   */
  async function refreshAccessToken({
    failedToken = null,
    expectedSessionId = null,
    expectedEpoch = null,
  } = {}) {
    const preCheckMeta = readStoredSessionMeta(storage);
    const requestedSid = expectedSessionId || preCheckMeta?.session_id || null;
    const requestedEpoch = expectedEpoch || preCheckMeta?.epoch || null;

    if (!preCheckMeta || preCheckMeta.logging_out) {
      if (preCheckMeta?.logging_out) {
        invalidateMatchingSession(null, {
          targetSid: preCheckMeta.session_id,
          targetEpoch: preCheckMeta.epoch,
          cleanServerCookie: true,
        });
      }
      return null;
    }

    // Nếu request gốc thuộc phiên A nhưng storage hiện tại đã sang phiên B -> tuyệt đối không refresh bằng phiên B!
    if (
      (expectedSessionId && preCheckMeta.session_id !== String(expectedSessionId)) ||
      (expectedEpoch && preCheckMeta.epoch !== String(expectedEpoch))
    ) {
      return null;
    }

    // Gộp các request cùng phiên trong cùng một tab vào chung một promise đang chạy.
    if (
      inFlightRefresh &&
      inFlightRefresh.sessionId === requestedSid &&
      inFlightRefresh.epoch === requestedEpoch
    ) {
      return inFlightRefresh.promise;
    }

    const capturedSeq = operationSeq;

    const refreshPromise = withAuthLock(async () => {
      // Nếu tab này chưa có token mới khác failedToken trong RAM và có kênh BroadcastChannel,
      // hỏi nhanh các tab cùng phiên (hoặc nhận thông điệp SESSION_UPDATED bất đồng bộ đang tới từ tab vừa giữ khóa)
      // để tránh gọi /auth/refresh trùng lặp giữa các tab.
      if (
        channel &&
        (!state.accessToken ||
          (failedToken && state.accessToken === failedToken) ||
          state.sessionId !== requestedSid)
      ) {
        postChannelMessage({
          type: 'REQUEST_ACTIVE_SESSION',
          session_id: requestedSid,
          epoch: requestedEpoch,
          failed_token: failedToken || null,
        });
        await waitForSignalOrTimeout((wake) => {
          peerWakeups.add(wake);
          return () => peerWakeups.delete(wake);
        }, 20);
      }

      const activeMeta = readStoredSessionMeta(storage);
      if (!activeMeta || activeMeta.logging_out) {
        if (!activeMeta && state.sessionId === requestedSid) {
          wipeMemoryAndCaches({ keepBootstrapping: false });
          emit();
        }
        return null;
      }

      // Kiểm tra lại phiên sau khi giành được khóa: không bao giờ refresh hộ phiên khác!
      if (
        activeMeta.session_id !== requestedSid ||
        (requestedEpoch && activeMeta.epoch !== requestedEpoch) ||
        (capturedSeq !== operationSeq &&
          (activeMeta.session_id !== preCheckMeta.session_id ||
            activeMeta.epoch !== preCheckMeta.epoch))
      ) {
        return null;
      }

      const targetSid = activeMeta.session_id;
      const targetEpoch = activeMeta.epoch;

      // Nếu một request/tab khác đã xoay sang token mới khác với failedToken thực tế đã gửi -> tái sử dụng ngay!
      if (
        state.accessToken &&
        state.sessionId === targetSid &&
        state.epoch === targetEpoch &&
        (!failedToken || state.accessToken !== failedToken)
      ) {
        if (state.isBootstrapping) {
          state = { ...state, isBootstrapping: false };
          emit();
        }
        return state.accessToken;
      }

      const seqBeforeNetwork = operationSeq;
      let response;
      try {
        response = await request('/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EVRide-CSRF': '1',
            'X-Session-ID': targetSid,
          },
          body: {},
          credentials: 'include',
          skipAuthCallback: true,
          skipAuthRefresh: true,
        });
      } catch (refreshErr) {
        const postErrMeta = readStoredSessionMeta(storage);
        if (
          seqBeforeNetwork !== operationSeq ||
          !postErrMeta ||
          postErrMeta.logging_out ||
          postErrMeta.session_id !== targetSid ||
          postErrMeta.epoch !== targetEpoch
        ) {
          return null;
        }

        // CHỈ xóa phiên khi mã lỗi xác nhận phiên/tài khoản đã kết thúc thực sự!
        // Các lỗi NETWORK_ERROR, REQUEST_TIMEOUT, 429, 409 tạm thời hay 5xx giữ nguyên phiên để thử lại sau.
        if (isTerminalAuthError(refreshErr)) {
          const errCode = refreshErr?.code || '';
          const shouldCleanCookie =
            errCode === 'TOO_MANY_AUTH_COOKIES' || errCode === 'REFRESH_REUSED';
          invalidateMatchingSession(refreshErr, {
            targetSid,
            targetEpoch,
            cleanServerCookie: shouldCleanCookie,
          });
          throw refreshErr;
        }

        if (state.isBootstrapping) {
          state = { ...state, isBootstrapping: false };
          emit();
        }
        throw refreshErr;
      }

      const grant = response?.data;
      const postNetMeta = readStoredSessionMeta(storage);

      if (
        !grant ||
        !grant.access_token ||
        seqBeforeNetwork !== operationSeq ||
        !postNetMeta ||
        postNetMeta.logging_out ||
        postNetMeta.session_id !== targetSid ||
        postNetMeta.epoch !== targetEpoch ||
        String(grant.session_id) !== targetSid
      ) {
        return null;
      }

      const nextGeneration = Number(grant.generation);
      if (
        state.sessionId === targetSid &&
        state.epoch === targetEpoch &&
        Number.isInteger(nextGeneration) &&
        nextGeneration < state.generation
      ) {
        return state.accessToken;
      }

      applyGrantToMemory(grant, targetEpoch, { clearNotice: true });

      postChannelMessage({
        type: 'SESSION_UPDATED',
        session_id: state.sessionId,
        epoch: state.epoch,
        generation: state.generation,
        access_token: state.accessToken,
        access_expires_at: state.accessExpiresAt,
        session_expires_at: state.sessionExpiresAt,
        user: state.user,
      });

      emit();
      return state.accessToken;
    });

    const tracker = {
      sessionId: requestedSid,
      epoch: requestedEpoch,
      promise: refreshPromise,
    };
    inFlightRefresh = tracker;

    try {
      return await refreshPromise;
    } finally {
      if (inFlightRefresh === tracker) {
        inFlightRefresh = null;
      }
    }
  }

  /**
   * Đăng xuất phiên hiện tại (hoặc phiên mục tiêu nếu truyền expectedSessionId / expectedEpoch).
   * Không bao giờ gọi khóa lồng nhau.
   */
  async function logout({ notice = null, expectedSessionId = null, expectedEpoch = null } = {}) {
    const stored = readStoredSessionMeta(storage);

    if (expectedSessionId && !doesTargetMatchCurrentSession(expectedSessionId, expectedEpoch)) {
      const currentSid = state.sessionId || stored?.session_id || null;
      if (String(expectedSessionId) !== currentSid) {
        await callLogoutEndpointBestEffort(expectedSessionId);
      }
      return { logged_out: false, skipped_stale_session: true };
    }

    const sid = expectedSessionId || state.sessionId || stored?.session_id || null;
    const epoch = expectedEpoch || state.epoch || stored?.epoch || generateRandomEpoch();

    if (!sid) {
      if (!stored) {
        wipeMemoryAndCaches({
          nextNotice: notice !== null ? notice : null,
          keepBootstrapping: false,
        });
        emit();
      }
      return { logged_out: true };
    }

    operationSeq += 1;
    const logoutSeq = operationSeq;

    if (!stored || (stored.session_id === String(sid) && stored.epoch === String(epoch))) {
      writeStoredSessionMeta(storage, {
        session_id: sid,
        epoch,
        logging_out: true,
      });
    }

    if (!state.sessionId || (state.sessionId === String(sid) && (!state.epoch || state.epoch === String(epoch)))) {
      wipeMemoryAndCaches({
        nextNotice: notice !== null ? notice : null,
        keepBootstrapping: false,
      });
    }

    postChannelMessage({
      type: 'LOGOUT_STARTED',
      session_id: sid,
      epoch,
      notice: notice || null,
    });
    emit();

    return withAuthLock(async () => {
      await callLogoutEndpointBestEffort(sid);

      const currentMeta = readStoredSessionMeta(storage);
      if (
        currentMeta &&
        currentMeta.session_id === String(sid) &&
        currentMeta.epoch === String(epoch) &&
        (logoutSeq === operationSeq || currentMeta.logging_out)
      ) {
        clearStoredSessionMeta(storage);
        postChannelMessage({
          type: 'SESSION_CLEARED',
          session_id: sid,
          epoch,
          notice: notice || null,
        });
      }
      return { logged_out: true };
    });
  }

  /**
   * Đổi mật khẩu chuẩn contract, an toàn đồng thời và KHÔNG deadlock:
   * 1. Dưới khóa chung 'evride-auth': chụp và xác nhận phiên gốc (originSessionId, originEpoch), sau đó NHẢ KHÓA.
   * 2. Gọi POST /users/me/change-password ngoài khóa (gắn chặt sessionContext gốc) -> nếu 401 TOKEN_EXPIRED,
   *    apiClient gọi refreshAccessToken lấy khóa bình thường, tuyệt đối không deadlock khóa lồng nhau!
   * 3. Dưới khóa chung 'evride-auth': chỉ thu hồi RAM/localStorage/cache nếu ứng dụng VẪN đang ở đúng
   *    (originSessionId, originEpoch). Nếu trong lúc chờ mạng người dùng đã chuyển sang tài khoản mới (phiên B),
   *    tuyệt đối KHÔNG logout tài khoản mới (chỉ dọn cookie của phiên cũ nếu khác sid)!
   */
  async function changePassword({ currentPassword, newPassword }) {
    const originSession = await withAuthLock(async () => {
      const stored = readStoredSessionMeta(storage);
      const sid = state.sessionId || stored?.session_id || null;
      const epoch = state.epoch || stored?.epoch || null;
      if (!sid || !epoch || !stored || stored.logging_out || stored.session_id !== sid || stored.epoch !== epoch) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã kết thúc.');
      }
      return { sessionId: sid, epoch };
    });

    const result = await request('/users/me/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EVRide-CSRF': '1',
      },
      body: {
        current_password: String(currentPassword ?? ''),
        new_password: String(newPassword ?? ''),
      },
      credentials: 'include',
      sessionContext: originSession,
    });

    const reauthNotice =
      'Đã đổi mật khẩu thành công. Toàn bộ phiên đã được thu hồi, vui lòng đăng nhập lại.';

    await withAuthLock(async () => {
      const currentStored = readStoredSessionMeta(storage);
      const currentSid = state.sessionId || currentStored?.session_id || null;
      const isStillOriginInStorage =
        Boolean(currentStored) &&
        currentStored.session_id === originSession.sessionId &&
        currentStored.epoch === originSession.epoch;
      const isStillOriginInRam =
        state.sessionId === originSession.sessionId &&
        state.epoch === originSession.epoch;

      if (!isStillOriginInStorage && !isStillOriginInRam) {
        // Phiên gốc đã bị đăng xuất hoặc thay thế bằng tài khoản mới trong lúc chờ response đổi mật khẩu:
        // KHÔNG được đụng tới phiên của tài khoản mới, chỉ dọn cookie cũ nếu khác session_id.
        if (originSession.sessionId !== currentSid) {
          await callLogoutEndpointBestEffort(originSession.sessionId);
        }
        return;
      }

      operationSeq += 1;
      if (isStillOriginInStorage) {
        writeStoredSessionMeta(storage, {
          session_id: originSession.sessionId,
          epoch: originSession.epoch,
          logging_out: true,
        });
      }

      if (isStillOriginInRam || !state.sessionId) {
        wipeMemoryAndCaches({
          nextNotice: reauthNotice,
          keepBootstrapping: false,
        });
      }

      postChannelMessage({
        type: 'LOGOUT_STARTED',
        session_id: originSession.sessionId,
        epoch: originSession.epoch,
        notice: reauthNotice,
      });
      emit();

      await callLogoutEndpointBestEffort(originSession.sessionId);

      const afterLogoutMeta = readStoredSessionMeta(storage);
      if (
        afterLogoutMeta &&
        afterLogoutMeta.session_id === originSession.sessionId &&
        afterLogoutMeta.epoch === originSession.epoch
      ) {
        clearStoredSessionMeta(storage);
        postChannelMessage({
          type: 'SESSION_CLEARED',
          session_id: originSession.sessionId,
          epoch: originSession.epoch,
          notice: reauthNotice,
        });
      }
    });

    return result?.data ?? { changed: true, reauthenticate: true };
  }

  /**
   * Khôi phục phiên đăng nhập khi tải lại trang (reload) hoặc mở tab mới.
   */
  async function bootstrap() {
    if (bootstrapPromise) {
      return bootstrapPromise;
    }

    bootstrapPromise = (async () => {
      const stored = readStoredSessionMeta(storage);
      if (!stored) {
        if (state.isBootstrapping) {
          state = { ...state, isBootstrapping: false };
          emit();
        }
        return null;
      }

      if (stored.logging_out) {
        await withAuthLock(async () => {
          const latest = readStoredSessionMeta(storage);
          if (latest && latest.logging_out && latest.session_id === stored.session_id) {
            await callLogoutEndpointBestEffort(latest.session_id);
            const postClean = readStoredSessionMeta(storage);
            if (postClean && postClean.session_id === stored.session_id && postClean.logging_out) {
              clearStoredSessionMeta(storage);
            }
          }
        });
        if (!state.sessionId || state.sessionId === stored.session_id) {
          wipeMemoryAndCaches({ keepBootstrapping: false });
          emit();
        }
        return null;
      }

      if (
        state.accessToken &&
        state.user &&
        state.sessionId === stored.session_id &&
        state.epoch === stored.epoch
      ) {
        if (state.isBootstrapping) {
          state = { ...state, isBootstrapping: false };
          emit();
        }
        return state.user;
      }

      if (!state.isBootstrapping) {
        state = { ...state, isBootstrapping: true };
        emit();
      }

      try {
        await refreshAccessToken({
          expectedSessionId: stored.session_id,
          expectedEpoch: stored.epoch,
        });
        return state.user;
      } catch {
        if (state.isBootstrapping) {
          state = { ...state, isBootstrapping: false };
          emit();
        }
        return null;
      }
    })();

    try {
      return await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  }

  /**
   * Callback cho apiClient khi nhận lỗi xác thực kết thúc phiên.
   * Chặn kép:
   * 1. Bỏ qua mọi lỗi tạm thời (NETWORK_ERROR, REQUEST_TIMEOUT, 5xx, 429).
   * 2. Bỏ qua nếu requestAuthContext thuộc về phiên cũ khác phiên đang hoạt động.
   */
  function handleAuthInvalid(apiError, requestAuthContext = null) {
    const code = apiError?.code || '';
    if (!isTerminalAuthError(apiError) && code !== 'TOKEN_EXPIRED') {
      return false;
    }

    const targetSid = requestAuthContext?.sessionId || null;
    const targetEpoch = requestAuthContext?.epoch || null;
    if (requestAuthContext?.hasSessionProvider && !targetSid) {
      return false;
    }

    const shouldCleanCookie =
      code === 'SESSION_REVOKED' ||
      code === 'SESSION_EXPIRED' ||
      code === 'REFRESH_REUSED' ||
      code === 'ACCOUNT_DISABLED' ||
      code === 'TOO_MANY_AUTH_COOKIES';

    return invalidateMatchingSession(apiError, {
      targetSid,
      targetEpoch,
      cleanServerCookie: shouldCleanCookie,
    });
  }

  function updateUserProfile(partialUser) {
    if (!state.user || !partialUser || typeof partialUser !== 'object') return;
    state = {
      ...state,
      user: {
        ...state.user,
        ...partialUser,
      },
    };
    postChannelMessage({
      type: 'USER_PROFILE_UPDATED',
      session_id: state.sessionId,
      epoch: state.epoch,
      user: state.user,
    });
    emit();
  }

  function clearAuthNotice() {
    if (!state.authNotice) return;
    state = { ...state, authNotice: null };
    emit();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function destroy() {
    destroyed = true;
    listeners.clear();
    if (channel) {
      try {
        if (typeof channel.removeEventListener === 'function') {
          channel.removeEventListener('message', handleChannelMessage);
        } else {
          channel.onmessage = null;
        }
        channel.close?.();
      } catch {
        // Bỏ qua lỗi khi đóng kênh.
      }
    }
  }

  return {
    getState,
    getAccessToken: () => getSessionContext().accessToken,
    getSessionContext,
    bootstrap,
    register,
    login,
    logout,
    changePassword,
    refreshAccessToken,
    handleAuthInvalid,
    updateUserProfile,
    clearAuthNotice,
    subscribe,
    destroy,
  };
}

let sharedDefaultManager = null;

export function getDefaultAuthSessionManager() {
  if (!sharedDefaultManager) {
    sharedDefaultManager = createAuthSessionManager();
  }
  return sharedDefaultManager;
}
