import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  apiRequest,
  configurePlatformApi,
  resetPlatformApi,
} from '../src/integrations/apiClient.js';
import {
  AUTH_STORAGE_KEY,
  createAuthSessionManager,
  evaluateRouteAccess,
  readStoredSessionMeta,
  registerPrivateCacheCleaner,
  resolvePostLoginPath,
} from '../src/integrations/authSession.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dumpRaw: () => Object.fromEntries(map.entries()),
  };
}

/**
 * Mô phỏng BroadcastChannel chuẩn trình duyệt:
 * Mọi thông điệp postMessage luôn được chuyển giao BẤT ĐỒNG BỘ qua event loop (setTimeout),
 * đồng thời hỗ trợ postDelayedMessage để kiểm thử các thông điệp liên tab đến trễ / đảo thứ tự.
 */
function createAsyncBroadcastHub({ defaultDelayMs = 0 } = {}) {
  const channelsByName = new Map();
  const pendingTimers = new Set();

  function createChannel(name) {
    if (!channelsByName.has(name)) {
      channelsByName.set(name, new Set());
    }
    const peers = channelsByName.get(name);
    const listeners = new Set();
    let closed = false;

    const scheduleDelivery = (data, customDelayMs = defaultDelayMs) => {
      if (closed) return;
      const cloned = structuredClone(data);
      // Theo chuẩn trình duyệt, chỉ những peer đang mở tại thời điểm gọi postMessage mới nhận được bản tin đó.
      const recipientsAtPostTime = Array.from(peers).filter((peer) => peer !== channel && !peer._isClosed());
      if (recipientsAtPostTime.length === 0) return;

      const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        for (const peer of recipientsAtPostTime) {
          if (!peer._isClosed()) {
            peer._deliver({ data: structuredClone(cloned) });
          }
        }
      }, customDelayMs);
      pendingTimers.add(timer);
    };

    const channel = {
      postMessage(data) {
        scheduleDelivery(data, defaultDelayMs);
      },
      postDelayedMessage(data, delayMs) {
        scheduleDelivery(data, delayMs);
      },
      addEventListener(type, fn) {
        if (type === 'message') listeners.add(fn);
      },
      removeEventListener(type, fn) {
        if (type === 'message') listeners.delete(fn);
      },
      close() {
        closed = true;
        peers.delete(channel);
        listeners.clear();
      },
      _isClosed: () => closed,
      _deliver(event) {
        if (closed) return;
        for (const fn of Array.from(listeners)) {
          fn(event);
        }
      },
    };

    peers.add(channel);
    return channel;
  }

  createChannel.cleanupAll = () => {
    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }
    pendingTimers.clear();
    channelsByName.clear();
  };

  return createChannel;
}

function createSharedWebLocks() {
  const chains = new Map();
  return {
    async request(name, _options, callback) {
      const fn = typeof _options === 'function' ? _options : callback;
      const prev = chains.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const current = prev.then(() => gate);
      chains.set(name, current);
      await prev;
      try {
        return await fn();
      } finally {
        release();
        if (chains.get(name) === current) {
          chains.delete(name);
        }
      }
    },
  };
}

function wireApiClientToManager(manager) {
  configurePlatformApi({
    getAccessToken: () => manager.getAccessToken(),
    getSessionContext: () => manager.getSessionContext(),
    onTokenExpired: ({ failedToken, sessionId, epoch }) =>
      manager.refreshAccessToken({
        failedToken,
        expectedSessionId: sessionId,
        expectedEpoch: epoch,
      }),
    onAuthInvalid: (err, requestAuthContext) =>
      manager.handleAuthInvalid(err, requestAuthContext),
  });
}

const SESSION_UUID_A = 'a1348af3-05a0-4a12-8bc8-657bc97703c0';
const SESSION_UUID_B = 'b2459bf4-16b1-4b23-9cd9-768cd08814d1';

const DEMO_CUSTOMER_A = {
  id: '990001',
  name: 'Nguyen An Demo',
  email: 'an.customer@evride.test',
  role: 'CUSTOMER',
  status: 'ACTIVE',
};

const DEMO_STAFF_B = {
  id: '990006',
  name: 'Demo Staff',
  email: 'staff@evride.test',
  role: 'STAFF',
  status: 'ACTIVE',
};

test('login/register obey CSRF/cookie/Origin rules and keep access_token strictly in memory', async () => {
  const storage = createMemoryStorage();
  const hub = createAsyncBroadcastHub();
  const locks = createSharedWebLocks();
  const capturedCalls = [];

  const mockRequest = async (path, options) => {
    capturedCalls.push({ path, options });
    if (path === '/auth/register') {
      return {
        data: { user: DEMO_CUSTOMER_A, wallet: { id: '5', balance: '0.00', status: 'ACTIVE' } },
      };
    }
    if (path === '/auth/login') {
      return {
        data: {
          access_token: 'ram_only_jwt_gen_0',
          token_type: 'bearer',
          expires_in: 1800,
          access_expires_at: '2026-11-25T12:30:00Z',
          session_id: SESSION_UUID_A,
          generation: 0,
          session_expires_at: '2026-12-25T12:00:00Z',
          user: DEMO_CUSTOMER_A,
        },
      };
    }
    throw new Error(`Unexpected path: ${path}`);
  };

  const manager = createAuthSessionManager({
    request: mockRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });

  try {
    await manager.register({
      name: '  Nguyen An Demo  ',
      email: '  an.customer@evride.test ',
      password: '   SpacePass12345!  ',
    });
    assert.equal(capturedCalls[0].options.body.name, 'Nguyen An Demo');
    assert.equal(capturedCalls[0].options.body.password, '   SpacePass12345!  ');
    assert.equal(capturedCalls[0].options.headers?.Origin, undefined);
    assert.equal(capturedCalls[0].options.headers?.origin, undefined);

    const user = await manager.login(' an.customer@evride.test ', '   SpacePass12345!  ');
    assert.equal(user.id, '990001');
    assert.equal(manager.getAccessToken(), 'ram_only_jwt_gen_0');

    const loginCall = capturedCalls[1];
    assert.equal(loginCall.options.credentials, 'include');
    assert.equal(loginCall.options.headers['X-EVRide-CSRF'], '1');
    assert.equal(loginCall.options.headers['X-Session-ID'], undefined);
    assert.equal(loginCall.options.headers.Origin, undefined);
    assert.equal(loginCall.options.body.password, '   SpacePass12345!  ');

    const rawStorageDump = JSON.stringify(storage.dumpRaw());
    assert.equal(rawStorageDump.includes('ram_only_jwt_gen_0'), false);
    assert.equal(rawStorageDump.includes('an.customer@evride.test'), false);

    const parsedMeta = JSON.parse(storage.getItem(AUTH_STORAGE_KEY));
    assert.deepEqual(Object.keys(parsedMeta).sort(), ['epoch', 'logging_out', 'session_id']);
    assert.equal(parsedMeta.session_id, SESSION_UUID_A);
    assert.equal(parsedMeta.logging_out, false);
  } finally {
    manager.destroy();
    hub.cleanupAll();
  }
});

test('reload restores session via /auth/refresh and finishes interrupted logout when logging_out=true', async () => {
  const storage = createMemoryStorage();
  const hub = createAsyncBroadcastHub();
  const locks = createSharedWebLocks();
  let refreshHeaders = null;
  let logoutHeaders = null;

  const mockRequest = async (path, options) => {
    if (path === '/auth/login') {
      return {
        data: {
          access_token: 'jwt_before_reload',
          session_id: SESSION_UUID_A,
          generation: 0,
          user: DEMO_CUSTOMER_A,
        },
      };
    }
    if (path === '/auth/refresh') {
      refreshHeaders = options.headers;
      assert.deepEqual(options.body, {});
      assert.equal(options.credentials, 'include');
      return {
        data: {
          access_token: 'jwt_after_reload_gen_1',
          session_id: SESSION_UUID_A,
          generation: 1,
          user: DEMO_CUSTOMER_A,
        },
      };
    }
    if (path === '/auth/logout') {
      logoutHeaders = options.headers;
      return { data: { logged_out: true } };
    }
    throw new Error(`Unexpected path: ${path}`);
  };

  const beforeReload = createAuthSessionManager({
    request: mockRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  await beforeReload.login('an.customer@evride.test', 'EVRide-Demo-Only-2026!');
  beforeReload.destroy();

  const afterReload = createAuthSessionManager({
    request: mockRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  assert.equal(afterReload.getAccessToken(), null);
  assert.equal(afterReload.getState().isBootstrapping, true);

  const restoredUser = await afterReload.bootstrap();
  assert.equal(restoredUser.email, 'an.customer@evride.test');
  assert.equal(afterReload.getAccessToken(), 'jwt_after_reload_gen_1');
  assert.equal(afterReload.getState().generation, 1);
  assert.equal(afterReload.getState().isBootstrapping, false);
  assert.equal(refreshHeaders['X-EVRide-CSRF'], '1');
  assert.equal(refreshHeaders['X-Session-ID'], SESSION_UUID_A);
  afterReload.destroy();

  storage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ session_id: SESSION_UUID_A, epoch: 'interrupted-epoch', logging_out: true })
  );
  const afterInterruptedLogout = createAuthSessionManager({
    request: mockRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  const shouldBeNull = await afterInterruptedLogout.bootstrap();
  assert.equal(shouldBeNull, null);
  assert.equal(afterInterruptedLogout.getState().isAuthenticated, false);
  assert.equal(logoutHeaders['X-Session-ID'], SESSION_UUID_A);
  assert.equal(readStoredSessionMeta(storage), null);
  afterInterruptedLogout.destroy();
  hub.cleanupAll();
});

test('concurrent 401 TOKEN_EXPIRED requests pass exact sent failedToken, refresh ONCE, and reuse rotated token for delayed 401', async () => {
  const originalFetch = globalThis.fetch;
  const storage = createMemoryStorage();
  const hub = createAsyncBroadcastHub();
  const locks = createSharedWebLocks();

  let refreshCount = 0;
  let releaseDelayedRequest;
  const delayedGate = new Promise((resolve) => {
    releaseDelayedRequest = resolve;
  });
  const seenProtectedAttempts = [];

  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.endsWith('/auth/login')) {
      return new Response(
        JSON.stringify({
          data: {
            access_token: 'expired_token_gen_0',
            session_id: SESSION_UUID_A,
            generation: 0,
            user: DEMO_CUSTOMER_A,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (target.endsWith('/auth/refresh')) {
      refreshCount += 1;
      await delay(10);
      return new Response(
        JSON.stringify({
          data: {
            access_token: `fresh_token_gen_${refreshCount}`,
            session_id: SESSION_UUID_A,
            generation: refreshCount,
            user: DEMO_CUSTOMER_A,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    seenProtectedAttempts.push({
      url: target,
      auth: options.headers.Authorization,
      idem: options.headers['Idempotency-Key'] || null,
    });

    if (target.endsWith('/slow-old-token') && options.headers.Authorization === 'Bearer expired_token_gen_0') {
      await delayedGate;
    }

    if (options.headers.Authorization === 'Bearer expired_token_gen_0') {
      return new Response(
        JSON.stringify({
          error: { code: 'TOKEN_EXPIRED', message: 'Access token đã hết hạn.' },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ data: { ok: true, path: target }, meta: null }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const authManager = createAuthSessionManager({
    request: apiRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  wireApiClientToManager(authManager);

  try {
    await authManager.login('an.customer@evride.test', 'EVRide-Demo-Only-2026!');

    // Start a slow request carrying expired_token_gen_0 BEFORE the stampede finishes!
    const slowReqPromise = apiRequest('/slow-old-token');

    // Fire 5 simultaneous protected requests while holding expired_token_gen_0
    const results = await Promise.all([
      apiRequest('/wallets/me'),
      apiRequest('/rentals'),
      apiRequest('/users/me'),
      apiRequest('/promotions'),
      apiRequest('/wallets/me/topups', {
        method: 'POST',
        body: { amount: '150000.00' },
        idempotencyKey: 'idem-concurrent-stampede-001',
      }),
    ]);

    assert.equal(results.length, 5);
    assert.equal(refreshCount, 1);
    assert.equal(authManager.getAccessToken(), 'fresh_token_gen_1');

    // Now let the slow request return 401 TOKEN_EXPIRED AFTER activeManager already holds fresh_token_gen_1!
    // Because apiClient captured sentToken = 'expired_token_gen_0' at send time (NOT activeManager.getAccessToken()),
    // refreshAccessToken sees state.accessToken ('fresh_token_gen_1') !== failedToken ('expired_token_gen_0')
    // and reuses 'fresh_token_gen_1' WITHOUT calling /auth/refresh a second time!
    releaseDelayedRequest();
    const slowResult = await slowReqPromise;
    assert.equal(slowResult.data.ok, true);
    assert.equal(refreshCount, 1, 'Delayed 401 with old sentToken must NOT trigger a second /auth/refresh');

    const topupCalls = seenProtectedAttempts.filter((item) => item.url.endsWith('/wallets/me/topups'));
    assert.equal(topupCalls.length, 2);
    assert.equal(topupCalls[0].idem, 'idem-concurrent-stampede-001');
    assert.equal(topupCalls[1].idem, 'idem-concurrent-stampede-001');
    assert.equal(topupCalls[1].auth, 'Bearer fresh_token_gen_1');
  } finally {
    authManager.destroy();
    hub.cleanupAll();
    resetPlatformApi();
    globalThis.fetch = originalFetch;
  }
});

test('REGRESSION #1: in-flight requests from Session A never refresh/retry with Session B and never wipe Session B', async () => {
  const originalFetch = globalThis.fetch;
  const storage = createMemoryStorage();
  const hub = createAsyncBroadcastHub();
  const locks = createSharedWebLocks();

  let resolveStaleExpired;
  let resolveStaleRevoked;
  let refreshCount = 0;
  const retryAttemptsWithSessionB = [];

  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.endsWith('/auth/login')) {
      const email = JSON.parse(options.body).email;
      const isB = email === DEMO_STAFF_B.email;
      return new Response(
        JSON.stringify({
          data: {
            access_token: isB ? 'token_session_B_gen_0' : 'token_session_A_gen_0',
            session_id: isB ? SESSION_UUID_B : SESSION_UUID_A,
            generation: 0,
            user: isB ? DEMO_STAFF_B : DEMO_CUSTOMER_A,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (target.endsWith('/auth/logout')) {
      return new Response(JSON.stringify({ data: { logged_out: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (target.endsWith('/auth/refresh')) {
      refreshCount += 1;
      return new Response(
        JSON.stringify({
          data: {
            access_token: 'token_session_B_gen_1',
            session_id: SESSION_UUID_B,
            generation: 1,
            user: DEMO_STAFF_B,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (options.headers.Authorization?.includes('token_session_B')) {
      retryAttemptsWithSessionB.push(target);
    }

    if (target.endsWith('/session-a-expired-mutation')) {
      return new Promise((resolve) => {
        resolveStaleExpired = () =>
          resolve(
            new Response(
              JSON.stringify({
                error: { code: 'TOKEN_EXPIRED', message: 'Token của phiên A đã hết hạn.' },
              }),
              { status: 401, headers: { 'content-type': 'application/json' } }
            )
          );
      });
    }

    if (target.endsWith('/session-a-revoked-query')) {
      return new Promise((resolve) => {
        resolveStaleRevoked = () =>
          resolve(
            new Response(
              JSON.stringify({
                error: { code: 'SESSION_REVOKED', message: 'Phiên A đã bị thu hồi.' },
              }),
              { status: 401, headers: { 'content-type': 'application/json' } }
            )
          );
      });
    }

    throw new Error(`Unexpected URL: ${target}`);
  };

  const manager = createAuthSessionManager({
    request: apiRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  wireApiClientToManager(manager);

  try {
    // 1. Login as Customer A (Session A) and fire two slow requests
    await manager.login(DEMO_CUSTOMER_A.email, 'EVRide-Demo-Only-2026!');
    const reqExpiredA = apiRequest('/session-a-expired-mutation', {
      method: 'POST',
      body: { amount: '150000.00' },
      idempotencyKey: 'idem-session-a-only-0001',
    });
    const reqRevokedA = apiRequest('/session-a-revoked-query');
    await delay(5);

    // 2. While both Session A requests are in-flight, user logs out and logs in as Staff B (Session B)!
    await manager.logout();
    await manager.login(DEMO_STAFF_B.email, 'EVRide-Demo-Only-2026!');
    assert.equal(manager.getAccessToken(), 'token_session_B_gen_0');
    assert.equal(manager.getState().sessionId, SESSION_UUID_B);

    // 3. Now Session A's 401 TOKEN_EXPIRED and 401 SESSION_REVOKED responses arrive late!
    resolveStaleExpired();
    resolveStaleRevoked();

    await assert.rejects(() => reqExpiredA, (err) => err instanceof ApiError && err.code === 'TOKEN_EXPIRED');
    await assert.rejects(() => reqRevokedA, (err) => err instanceof ApiError && err.code === 'SESSION_REVOKED');

    // Must NOT have refreshed Session B, must NOT have retried Session A's mutation under Session B,
    // and must NOT have wiped Session B!
    assert.equal(refreshCount, 0);
    assert.deepEqual(retryAttemptsWithSessionB, []);
    assert.equal(manager.getState().isAuthenticated, true);
    assert.equal(manager.getAccessToken(), 'token_session_B_gen_0');
    assert.equal(manager.getState().user.id, DEMO_STAFF_B.id);
    assert.equal(readStoredSessionMeta(storage)?.session_id, SESSION_UUID_B);
  } finally {
    manager.destroy();
    hub.cleanupAll();
    resetPlatformApi();
    globalThis.fetch = originalFetch;
  }
});

test('REGRESSION #2: changePassword refreshes expired token without lock deadlock and late changePassword from Session A never logs out Session B', async () => {
  const originalFetch = globalThis.fetch;
  const storage = createMemoryStorage();
  const hub = createAsyncBroadcastHub();
  const locks = createSharedWebLocks();

  let privateCacheClears = 0;
  const unregisterCleaner = registerPrivateCacheCleaner(() => {
    privateCacheClears += 1;
  });

  // Part A: Token expired right before changePassword -> refreshes via shared lock with ZERO deadlock!
  let refreshedOnce = false;
  const logoutSids = [];

  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.endsWith('/auth/login')) {
      return new Response(
        JSON.stringify({
          data: {
            access_token: 'expired_pwd_jwt_gen_0',
            session_id: SESSION_UUID_A,
            generation: 0,
            user: DEMO_CUSTOMER_A,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (target.endsWith('/auth/refresh')) {
      refreshedOnce = true;
      return new Response(
        JSON.stringify({
          data: {
            access_token: 'fresh_pwd_jwt_gen_1',
            session_id: SESSION_UUID_A,
            generation: 1,
            user: DEMO_CUSTOMER_A,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (target.endsWith('/users/me/change-password')) {
      if (options.headers.Authorization === 'Bearer expired_pwd_jwt_gen_0') {
        return new Response(
          JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        );
      }
      assert.equal(options.headers.Authorization, 'Bearer fresh_pwd_jwt_gen_1');
      return new Response(
        JSON.stringify({ data: { changed: true, reauthenticate: true } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (target.endsWith('/auth/logout')) {
      logoutSids.push(options.headers['X-Session-ID']);
      return new Response(JSON.stringify({ data: { logged_out: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  const manager = createAuthSessionManager({
    request: apiRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  wireApiClientToManager(manager);

  try {
    await manager.login(DEMO_CUSTOMER_A.email, 'OldPassword123!');
    await manager.changePassword({
      currentPassword: 'OldPassword123!',
      newPassword: '  NewPassword456!  ',
    });

    assert.equal(refreshedOnce, true);
    assert.deepEqual(logoutSids, [SESSION_UUID_A]);
    assert.equal(manager.getState().isAuthenticated, false);
    assert.match(manager.getState().authNotice, /đăng nhập lại/i);

    // Part B: Slow changePassword from Session A resolves AFTER user switched to Session B!
    let resolveSlowPwdChange;
    logoutSids.length = 0;

    globalThis.fetch = async (url, options) => {
      const target = String(url);
      if (target.endsWith('/auth/login')) {
        const email = JSON.parse(options.body).email;
        const isB = email === DEMO_STAFF_B.email;
        return new Response(
          JSON.stringify({
            data: {
              access_token: isB ? 'staff_B_jwt' : 'customer_A_jwt',
              session_id: isB ? SESSION_UUID_B : SESSION_UUID_A,
              generation: 0,
              user: isB ? DEMO_STAFF_B : DEMO_CUSTOMER_A,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (target.endsWith('/users/me/change-password')) {
        return new Promise((resolve) => {
          resolveSlowPwdChange = () =>
            resolve(
              new Response(
                JSON.stringify({ data: { changed: true, reauthenticate: true } }),
                { status: 200, headers: { 'content-type': 'application/json' } }
              )
            );
        });
      }
      if (target.endsWith('/auth/logout')) {
        logoutSids.push(options.headers['X-Session-ID']);
        return new Response(JSON.stringify({ data: { logged_out: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected URL: ${target}`);
    };

    await manager.login(DEMO_CUSTOMER_A.email, '  NewPassword456!  ');
    const slowPwdPromise = manager.changePassword({
      currentPassword: '  NewPassword456!  ',
      newPassword: 'AnotherPassword789!',
    });
    await delay(5);

    // User switches to Account B while Account A's changePassword response is still in transit
    await manager.logout();
    await manager.login(DEMO_STAFF_B.email, 'EVRide-Demo-Only-2026!');
    await delay(5); // allow async BroadcastChannel to settle
    const clearsBeforeLatePwd = privateCacheClears;

    // Now Account A's changePassword 200 OK finally arrives!
    resolveSlowPwdChange();
    await slowPwdPromise;
    await delay(5);

    // Account B MUST remain logged in, with its caches and localStorage untouched!
    assert.equal(manager.getState().isAuthenticated, true);
    assert.equal(manager.getState().user.id, DEMO_STAFF_B.id);
    assert.equal(manager.getAccessToken(), 'staff_B_jwt');
    assert.equal(readStoredSessionMeta(storage)?.session_id, SESSION_UUID_B);
    assert.equal(privateCacheClears, clearsBeforeLatePwd);
    assert.equal(logoutSids.includes(SESSION_UUID_B), false);
  } finally {
    unregisterCleaner();
    manager.destroy();
    hub.cleanupAll();
    resetPlatformApi();
    globalThis.fetch = originalFetch;
  }
});

test('REGRESSION #3: transient refresh errors (NETWORK_ERROR, timeout, 5xx) do NOT call onAuthInvalid or wipe session; terminal codes DO wipe session', async () => {
  const originalFetch = globalThis.fetch;
  const storage = createMemoryStorage();
  const hub = createAsyncBroadcastHub();
  const locks = createSharedWebLocks();

  let refreshMode = 'NETWORK_ERROR';

  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.endsWith('/auth/login')) {
      return new Response(
        JSON.stringify({
          data: {
            access_token: 'expired_jwt_0',
            session_id: SESSION_UUID_A,
            generation: 0,
            user: DEMO_CUSTOMER_A,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (target.endsWith('/auth/refresh')) {
      if (refreshMode === 'NETWORK_ERROR') {
        throw new TypeError('Failed to fetch');
      }
      if (refreshMode === 'TIMEOUT') {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      }
      if (refreshMode === 'SERVER_503') {
        return new Response(
          JSON.stringify({
            error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'DB tạm thời bận.' },
          }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        );
      }
      if (refreshMode === 'OK') {
        return new Response(
          JSON.stringify({
            data: {
              access_token: 'recovered_jwt_gen_1',
              session_id: SESSION_UUID_A,
              generation: 1,
              user: DEMO_CUSTOMER_A,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (refreshMode === 'REFRESH_REUSED') {
        return new Response(
          JSON.stringify({
            error: { code: 'REFRESH_REUSED', message: 'Phát hiện reuse; phiên đã thu hồi.' },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    if (target.endsWith('/auth/logout')) {
      return new Response(JSON.stringify({ data: { logged_out: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (target.endsWith('/wallets/me')) {
      if (options.headers.Authorization === 'Bearer recovered_jwt_gen_1') {
        return new Response(
          JSON.stringify({ data: { id: '5', balance: '250000.00', status: 'ACTIVE' } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Access token đã hết hạn.' } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    throw new Error(`Unexpected URL: ${target}`);
  };

  const manager = createAuthSessionManager({
    request: (path, opts) => apiRequest(path, { timeoutMs: refreshMode === 'TIMEOUT' ? 20 : 2000, ...opts }),
    storage,
    locks,
    createBroadcastChannel: hub,
  });

  let authInvalidSpyCount = 0;
  configurePlatformApi({
    getAccessToken: () => manager.getAccessToken(),
    getSessionContext: () => manager.getSessionContext(),
    onTokenExpired: ({ failedToken, sessionId, epoch }) =>
      manager.refreshAccessToken({
        failedToken,
        expectedSessionId: sessionId,
        expectedEpoch: epoch,
      }),
    onAuthInvalid: (err, ctx) => {
      authInvalidSpyCount += 1;
      manager.handleAuthInvalid(err, ctx);
    },
  });

  try {
    await manager.login(DEMO_CUSTOMER_A.email, 'EVRide-Demo-Only-2026!');

    // 1. Refresh fails with NETWORK_ERROR -> must NOT wipe session or call onAuthInvalid
    refreshMode = 'NETWORK_ERROR';
    await assert.rejects(
      () => apiRequest('/wallets/me'),
      (err) => err instanceof ApiError && err.code === 'NETWORK_ERROR'
    );
    assert.equal(authInvalidSpyCount, 0);
    assert.equal(manager.getState().sessionId, SESSION_UUID_A);
    assert.equal(readStoredSessionMeta(storage)?.session_id, SESSION_UUID_A);

    // 2. Refresh fails with REQUEST_TIMEOUT -> must NOT wipe session or call onAuthInvalid
    refreshMode = 'TIMEOUT';
    await assert.rejects(
      () => apiRequest('/wallets/me', { timeoutMs: 500 }),
      (err) => err instanceof ApiError && err.code === 'REQUEST_TIMEOUT'
    );
    assert.equal(authInvalidSpyCount, 0);
    assert.equal(manager.getState().sessionId, SESSION_UUID_A);
    assert.equal(readStoredSessionMeta(storage)?.session_id, SESSION_UUID_A);

    // 3. Refresh fails with temporary 503 DEPENDENCY_UNAVAILABLE -> must NOT wipe session
    refreshMode = 'SERVER_503';
    await assert.rejects(
      () => apiRequest('/wallets/me'),
      (err) => err instanceof ApiError && err.status === 503
    );
    assert.equal(authInvalidSpyCount, 0);
    assert.equal(manager.getState().sessionId, SESSION_UUID_A);

    // 4. Network recovers -> next request refreshes and succeeds seamlessly!
    refreshMode = 'OK';
    const walletRes = await apiRequest('/wallets/me');
    assert.equal(walletRes.data.balance, '250000.00');
    assert.equal(manager.getAccessToken(), 'recovered_jwt_gen_1');

    // 5. Now force TOKEN_EXPIRED again and make refresh return terminal 401 REFRESH_REUSED -> MUST wipe session!
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/wallets/me')) {
        return new Response(
          JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        );
      }
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(
          JSON.stringify({ error: { code: 'REFRESH_REUSED', message: 'Reuse detected' } }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ data: { logged_out: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await assert.rejects(
      () => apiRequest('/wallets/me'),
      (err) => err instanceof ApiError && err.code === 'REFRESH_REUSED'
    );
    assert.equal(manager.getState().isAuthenticated, false);
    assert.equal(readStoredSessionMeta(storage), null);
  } finally {
    manager.destroy();
    hub.cleanupAll();
    resetPlatformApi();
    globalThis.fetch = originalFetch;
  }
});

test('REGRESSION #4: async BroadcastChannel shares login/refresh across tabs, handles mid-flight logout, and ignores delayed messages from older sessions/generations', async () => {
  const storage = createMemoryStorage();
  const hub = createAsyncBroadcastHub({ defaultDelayMs: 2 });
  const locks = createSharedWebLocks();
  let networkRefreshCount = 0;
  let holdRefreshOpen = false;
  let resolveSlowRefresh = null;
  let notifySlowRefreshEntered = null;
  const slowRefreshEntered = new Promise((resolve) => {
    notifySlowRefreshEntered = resolve;
  });

  const mockRequest = async (path, options) => {
    if (path === '/auth/login') {
      const email = options.body.email;
      const isB = email === DEMO_STAFF_B.email;
      return {
        data: {
          access_token: isB ? 'session_B_gen_0' : 'session_A_gen_0',
          session_id: isB ? SESSION_UUID_B : SESSION_UUID_A,
          generation: 0,
          user: isB ? DEMO_STAFF_B : DEMO_CUSTOMER_A,
        },
      };
    }
    if (path === '/auth/refresh') {
      if (holdRefreshOpen) {
        return new Promise((resolve) => {
          resolveSlowRefresh = () =>
            resolve({
              data: {
                access_token: 'zombie_token_after_logout',
                session_id: SESSION_UUID_A,
                generation: 9,
                user: DEMO_CUSTOMER_A,
              },
            });
          notifySlowRefreshEntered?.();
        });
      }
      networkRefreshCount += 1;
      await delay(8);
      return {
        data: {
          access_token: `session_A_gen_${networkRefreshCount}`,
          session_id: SESSION_UUID_A,
          generation: networkRefreshCount,
          user: DEMO_CUSTOMER_A,
        },
      };
    }
    return { data: { logged_out: true } };
  };

  const tabA = createAuthSessionManager({
    request: mockRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  const tabB = createAuthSessionManager({
    request: mockRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  const delayedInjector = hub('evride-auth');

  try {
    // 1. Tab A logs in -> message is NOT synchronous, arrives asynchronously in Tab B
    await tabA.login(DEMO_CUSTOMER_A.email, 'EVRide-Demo-Only-2026!');
    assert.equal(tabB.getAccessToken(), null, 'Async BroadcastChannel must not deliver synchronously');
    await delay(10);
    assert.equal(tabB.getAccessToken(), 'session_A_gen_0');
    const epochA = readStoredSessionMeta(storage).epoch;

    // 2. Both Tab A and Tab B call refreshAccessToken simultaneously -> serialized via Web Lock + async channel yield
    const [tokA, tokB] = await Promise.all([
      tabA.refreshAccessToken({ failedToken: 'session_A_gen_0' }),
      tabB.refreshAccessToken({ failedToken: 'session_A_gen_0' }),
    ]);
    await delay(10);
    assert.equal(networkRefreshCount, 1);
    assert.equal(tokA, 'session_A_gen_1');
    assert.equal(tokB, 'session_A_gen_1');

    // 3. Queue DELAYED stale messages (35ms late) for Session A:
    //    - A delayed SESSION_UPDATED with lower generation (0 < 1)
    //    - A delayed SESSION_CLEARED / LOGOUT_STARTED from Session A that will arrive AFTER switching to Session B!
    delayedInjector.postDelayedMessage(
      {
        type: 'SESSION_UPDATED',
        senderId: 'delayed-peer',
        session_id: SESSION_UUID_A,
        epoch: epochA,
        generation: 0,
        access_token: 'late_gen_0_token',
        user: DEMO_CUSTOMER_A,
      },
      12
    );
    await delay(20);
    assert.equal(tabA.getAccessToken(), 'session_A_gen_1');
    assert.equal(tabB.getAccessToken(), 'session_A_gen_1');

    // 4. Logout mid-flight during slow refresh in Tab A
    holdRefreshOpen = true;
    const slowRefresh = tabA.refreshAccessToken({ failedToken: 'session_A_gen_1' });
    await slowRefreshEntered;
    const logoutPromise = tabB.logout();
    // Even BEFORE async BroadcastChannel arrives in Tab A, getSessionContext()/getAccessToken() sees logging_out in storage!
    assert.equal(tabA.getAccessToken(), null);
    resolveSlowRefresh();
    assert.equal(await slowRefresh, null);
    await logoutPromise;
    await delay(10);
    assert.equal(tabA.getState().isAuthenticated, false);
    assert.equal(tabB.getState().isAuthenticated, false);

    // 5. Queue a very late LOGOUT_STARTED & SESSION_CLEARED & SESSION_UPDATED from old Session A,
    //    then immediately log in to Session B! When those delayed Session A messages arrive 30ms later,
    //    Session B MUST NOT be logged out or overwritten!
    delayedInjector.postDelayedMessage(
      {
        type: 'LOGOUT_STARTED',
        senderId: 'very-slow-tab',
        session_id: SESSION_UUID_A,
        epoch: epochA,
        notice: 'Stale logout notice',
      },
      25
    );
    delayedInjector.postDelayedMessage(
      {
        type: 'SESSION_CLEARED',
        senderId: 'very-slow-tab',
        session_id: SESSION_UUID_A,
        epoch: epochA,
        notice: 'Stale clear notice',
      },
      30
    );
    delayedInjector.postDelayedMessage(
      {
        type: 'SESSION_UPDATED',
        senderId: 'very-slow-tab',
        session_id: SESSION_UUID_A,
        epoch: epochA,
        generation: 99,
        access_token: 'stale_session_A_token',
        user: DEMO_CUSTOMER_A,
      },
      35
    );

    holdRefreshOpen = false;
    await tabA.login(DEMO_STAFF_B.email, 'EVRide-Demo-Only-2026!');
    await delay(50); // Wait past 25ms, 30ms, and 35ms delayed messages!

    assert.equal(tabA.getState().isAuthenticated, true);
    assert.equal(tabB.getState().isAuthenticated, true);
    assert.equal(tabA.getAccessToken(), 'session_B_gen_0');
    assert.equal(tabB.getAccessToken(), 'session_B_gen_0');
    assert.equal(tabA.getState().user.id, DEMO_STAFF_B.id);
    assert.equal(tabB.getState().user.id, DEMO_STAFF_B.id);
  } finally {
    delayedInjector.close();
    tabA.destroy();
    tabB.destroy();
    hub.cleanupAll();
  }
});

test('SESSION_REVOKED and ACCOUNT_DISABLED on active session wipe state across async tabs and never loop refresh', async () => {
  const originalFetch = globalThis.fetch;
  const storage = createMemoryStorage();
  const hub = createAsyncBroadcastHub({ defaultDelayMs: 2 });
  const locks = createSharedWebLocks();

  let simulatedError = 'SESSION_REVOKED';
  let refreshCalled = false;

  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/auth/login')) {
      return new Response(
        JSON.stringify({
          data: {
            access_token: 'active_jwt',
            session_id: SESSION_UUID_A,
            generation: 0,
            user: DEMO_CUSTOMER_A,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (target.endsWith('/auth/refresh')) {
      refreshCalled = true;
      throw new Error('Must not call /auth/refresh');
    }
    if (target.endsWith('/auth/logout')) {
      return new Response(JSON.stringify({ data: { logged_out: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (simulatedError === 'SESSION_REVOKED') {
      return new Response(
        JSON.stringify({ error: { code: 'SESSION_REVOKED', message: 'Phiên đã thu hồi.' } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ error: { code: 'ACCOUNT_DISABLED', message: 'Tài khoản đã bị khóa.' } }),
      { status: 403, headers: { 'content-type': 'application/json' } }
    );
  };

  const tabA = createAuthSessionManager({
    request: apiRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  const tabB = createAuthSessionManager({
    request: apiRequest,
    storage,
    locks,
    createBroadcastChannel: hub,
  });
  wireApiClientToManager(tabA);

  try {
    await tabA.login(DEMO_CUSTOMER_A.email, 'EVRide-Demo-Only-2026!');
    await delay(10);
    assert.equal(tabB.getState().isAuthenticated, true);

    await assert.rejects(
      () => apiRequest('/wallets/me'),
      (err) => err instanceof ApiError && err.code === 'SESSION_REVOKED'
    );
    await delay(10);
    assert.equal(refreshCalled, false);
    assert.equal(tabA.getState().isAuthenticated, false);
    assert.equal(tabB.getState().isAuthenticated, false);
    assert.match(tabB.getState().authNotice, /thu hồi/i);

    simulatedError = 'ACCOUNT_DISABLED';
    await tabA.login(DEMO_CUSTOMER_A.email, 'EVRide-Demo-Only-2026!');
    await delay(10);
    await assert.rejects(
      () => apiRequest('/wallets/me'),
      (err) => err instanceof ApiError && err.code === 'ACCOUNT_DISABLED'
    );
    await delay(10);
    assert.equal(refreshCalled, false);
    assert.equal(tabA.getState().isAuthenticated, false);
    assert.equal(tabB.getState().isAuthenticated, false);
    assert.match(tabA.getState().authNotice, /khóa/i);
  } finally {
    tabA.destroy();
    tabB.destroy();
    hub.cleanupAll();
    resetPlatformApi();
    globalThis.fetch = originalFetch;
  }
});

test('route guards and post-login role redirects block unauthorized routes and open redirects', () => {
  assert.deepEqual(
    evaluateRouteAccess({
      isBootstrapping: true,
      isAuthenticated: false,
      user: null,
      allowedRoles: ['CUSTOMER'],
    }),
    { status: 'bootstrapping' }
  );

  assert.deepEqual(
    evaluateRouteAccess({
      isBootstrapping: false,
      isAuthenticated: false,
      user: null,
      allowedRoles: ['STAFF', 'MANAGER'],
    }),
    { status: 'unauthenticated', redirectTo: '/login' }
  );

  assert.deepEqual(
    evaluateRouteAccess({
      isBootstrapping: false,
      isAuthenticated: true,
      user: DEMO_CUSTOMER_A,
      allowedRoles: ['STAFF', 'MANAGER'],
    }),
    { status: 'forbidden' }
  );

  const staffUser = { id: '990006', role: 'STAFF', status: 'ACTIVE' };
  const managerUser = { id: '990007', role: 'MANAGER', status: 'ACTIVE' };
  assert.deepEqual(
    evaluateRouteAccess({
      isBootstrapping: false,
      isAuthenticated: true,
      user: staffUser,
      allowedRoles: ['MANAGER'],
    }),
    { status: 'forbidden' }
  );
  assert.deepEqual(
    evaluateRouteAccess({
      isBootstrapping: false,
      isAuthenticated: true,
      user: managerUser,
      allowedRoles: ['MANAGER'],
    }),
    { status: 'allowed' }
  );

  assert.equal(resolvePostLoginPath(DEMO_CUSTOMER_A, null), '/');
  assert.equal(resolvePostLoginPath(DEMO_CUSTOMER_A, '/admin/vehicles'), '/');
  assert.equal(resolvePostLoginPath(DEMO_CUSTOMER_A, '/wallet?tab=topups'), '/wallet?tab=topups');
  assert.equal(resolvePostLoginPath(DEMO_CUSTOMER_A, '//malicious.example.com'), '/');

  assert.equal(resolvePostLoginPath(staffUser, null), '/admin');
  assert.equal(resolvePostLoginPath(staffUser, '/'), '/admin');
  assert.equal(resolvePostLoginPath(staffUser, '/wallet'), '/admin');
  assert.equal(resolvePostLoginPath(staffUser, '/admin/promotions'), '/admin');
  assert.equal(resolvePostLoginPath(staffUser, '/admin/rentals/501'), '/admin/rentals/501');
  assert.equal(resolvePostLoginPath(managerUser, '/admin/promotions'), '/admin/promotions');
});
