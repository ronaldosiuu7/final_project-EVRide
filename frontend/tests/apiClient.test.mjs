import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  apiRequest,
  configurePlatformApi,
  extractPagination,
  isAbortError,
  resetPlatformApi,
  resolveApiUrl,
  stringifyJsonBody,
} from '../src/integrations/apiClient.js';
import { downloadPrivateFileBlob, uploadEvidenceFile } from '../src/integrations/fileBridge.js';
import {
  addMoneyStrings,
  compareMoneyStrings,
  computeRemainingSeconds,
  formatCountdownMmSs,
  formatTimeRangeVN,
  getServerTimeOffsetMs,
  resetServerTimeOffset,
  subtractMoneyStrings,
} from '../src/utils/format.js';
import { getCustomerStatusMeta } from '../src/utils/statusConfig.js';
import {
  createIdempotencyTracker,
  fingerprintIdempotentPayload,
  isUncertainIdempotentOutcome,
  mapApiFieldErrors,
  normalizeMoneyString,
  resolveIdempotencyKey,
  toEntityIdString,
} from '../src/utils/validation.js';
import { getApiErrorMessage } from '../src/utils/errorMessages.js';

test('apiRequest parses JSON envelope, pagination, null data, direct JSON, and syncs server_time', async () => {
  const originalFetch = globalThis.fetch;
  resetServerTimeOffset();

  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (target.includes('/empty-envelope')) {
      return new Response(
        JSON.stringify({
          data: null,
          meta: { request_id: 'req_nil', server_time: '2026-11-25T12:00:00Z' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        data: [
          {
            id: '9007199254740993',
            amount: '150000.00',
          },
        ],
        meta: {
          request_id: 'req_list_01',
          server_time: '2026-11-25T12:05:00Z',
          page: 2,
          page_size: 20,
          total: 45,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  };

  try {
    const healthRes = await apiRequest('/health');
    assert.deepEqual(healthRes.data, { status: 'ok' });
    assert.equal(healthRes.meta, null);
    assert.equal(healthRes.pagination, null);

    const nilRes = await apiRequest('/empty-envelope');
    assert.equal(nilRes.data, null);
    assert.equal(nilRes.serverTime, '2026-11-25T12:00:00Z');

    const listRes = await apiRequest('/wallets/me/transactions', {
      query: { page: 2, page_size: 20 },
    });
    assert.equal(typeof listRes.data[0].id, 'string');
    assert.equal(listRes.data[0].id, '9007199254740993');
    assert.equal(listRes.data[0].amount, '150000.00');
    assert.deepEqual(listRes.pagination, {
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
    assert.notEqual(getServerTimeOffsetMs(), 0);

    const remaining = computeRemainingSeconds('2026-11-25T12:35:00Z', {
      serverTimeIso: listRes.serverTime,
    });
    assert.equal(remaining, 1800);
    assert.equal(formatCountdownMmSs(remaining), '30:00');
  } finally {
    globalThis.fetch = originalFetch;
    resetServerTimeOffset();
    resetPlatformApi();
  }
});

test('apiRequest and fileBridge support text/plain, binary Blob, and multipart FormData without forcing Content-Type', async () => {
  const originalFetch = globalThis.fetch;
  let uploadedHeaders = null;
  let uploadedBody = null;

  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes('/faq/sources/decisions')) {
      return new Response('# EVRide V1 — Sổ quyết định\nThời gian giữ xe: 30 phút.', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    if (target.endsWith('/files/upload')) {
      uploadedHeaders = options.headers;
      uploadedBody = options.body;
      return new Response(
        JSON.stringify({
          data: {
            file_id: '9007199254740999',
            original_filename: 'cccd_front.webp',
            content_type: 'image/webp',
            size_bytes: 4,
            sha256: 'a'.repeat(64),
            status: 'READY',
          },
          meta: { request_id: 'req_up', server_time: '2026-11-25T12:00:00Z' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      );
    }
    if (target.includes('/files/9007199254740999/download')) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-disposition': 'inline; filename="cccd_front.png"',
        },
      });
    }
    if (target.includes('/files/404/download')) {
      return new Response(
        JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'File không tồn tại.' },
          meta: { request_id: 'req_nf', server_time: '2026-11-25T12:00:00Z' },
        }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  try {
    const faqTextRes = await apiRequest('/faq/sources/decisions');
    assert.equal(typeof faqTextRes.data, 'string');
    assert.match(faqTextRes.data, /30 phút/);

    const fakeFile = new File([new Uint8Array([1, 2, 3, 4])], 'cccd_front.webp', {
      type: 'image/webp',
    });
    const uploaded = await uploadEvidenceFile(fakeFile);
    assert.equal(uploaded.file_id, '9007199254740999');
    assert.ok(uploadedBody instanceof FormData);
    assert.equal(uploadedHeaders['Content-Type'], undefined);
    assert.equal(uploadedHeaders['content-type'], undefined);

    const downloaded = await downloadPrivateFileBlob('/api/v1/files/9007199254740999/download');
    assert.equal(downloaded.contentType, 'image/png');
    assert.equal(downloaded.filename, 'cccd_front.png');
    assert.equal(downloaded.blob.size, 4);
    URL.revokeObjectURL(downloaded.objectUrl);

    await assert.rejects(
      () => downloadPrivateFileBlob('404'),
      (err) => err instanceof ApiError && err.status === 404 && err.code === 'NOT_FOUND'
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('apiRequest distinguishes network error, timeout, caller AbortSignal, and sanitizes stack traces/secrets', async () => {
  const originalFetch = globalThis.fetch;

  try {
    // 1. Network error
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch http://internal-secret-host/api');
    };
    await assert.rejects(
      () => apiRequest('/stations'),
      (err) =>
        err instanceof ApiError &&
        err.isNetworkError === true &&
        err.isTimeout === false &&
        err.code === 'NETWORK_ERROR' &&
        !err.message.includes('internal-secret-host')
    );

    // 2. Timeout error
    globalThis.fetch = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });

    await assert.rejects(
      () => apiRequest('/stations', { timeoutMs: 25 }),
      (err) =>
        err instanceof ApiError &&
        err.isTimeout === true &&
        err.isAborted === false &&
        err.code === 'REQUEST_TIMEOUT'
    );

    // 3. Caller AbortSignal (cancels before timeout)
    const callerController = new AbortController();
    setTimeout(() => callerController.abort(), 10);
    await assert.rejects(
      () => apiRequest('/stations', { signal: callerController.signal, timeoutMs: 500 }),
      (err) => isAbortError(err) && err.name === 'AbortError'
    );

    // 4. Server 500 with Python traceback / SQL / JWT leak is sanitized
    const leakedJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5OTAwMDEifQ.secretSignature123';
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: `Traceback (most recent call last): sqlalchemy SELECT * FROM users token=${leakedJwt}`,
            details: {
              stack: 'File "/app/main.py", line 42',
              access_token: leakedJwt,
              fields: [
                { field: 'email', message: 'Input should be a valid email address' },
              ],
            },
          },
          meta: { request_id: 'req_500', server_time: '2026-11-25T12:00:00Z' },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );

    await assert.rejects(
      () => apiRequest('/rentals'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.isServerError, true);
        assert.doesNotMatch(err.message, /Traceback|sqlalchemy|SELECT|eyJ/i);
        assert.equal(err.details?.stack, undefined);
        assert.equal(err.details?.access_token, undefined);
        assert.deepEqual(mapApiFieldErrors(err), { email: 'Giá trị không hợp lệ.' });
        return true;
      }
    );

    // 5. Business 409 VERIFIED_CCCD_REQUIRED keeps clean Vietnamese message
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'VERIFIED_CCCD_REQUIRED',
            message: 'Cần CCCD đã xác minh, còn hạn và đủ điều kiện tuổi.',
          },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      );

    await assert.rejects(
      () => apiRequest('/rentals', { method: 'POST', body: { vehicle_id: '1', pickup_station_id: '2' } }),
      (err) =>
        err instanceof ApiError &&
        err.isBusinessError === true &&
        err.code === 'VERIFIED_CCCD_REQUIRED' &&
        /CCCD/.test(getApiErrorMessage(err))
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('apiClient prepares Step 2 TOKEN_EXPIRED single-retry hook and never auto-retries mutations on timeout/500', async () => {
  const originalFetch = globalThis.fetch;

  try {
    let tokenState = 'expired_jwt';
    let refreshCalls = 0;
    let authInvalidCalls = 0;
    const seenHeaders = [];

    configurePlatformApi({
      getAccessToken: () => tokenState,
      onTokenExpired: async () => {
        refreshCalls += 1;
        tokenState = 'fresh_jwt_gen_1';
        return tokenState;
      },
      onAuthInvalid: () => {
        authInvalidCalls += 1;
      },
    });

    globalThis.fetch = async (_url, options) => {
      seenHeaders.push({
        auth: options.headers.Authorization,
        idem: options.headers['Idempotency-Key'],
      });
      if (options.headers.Authorization === 'Bearer expired_jwt') {
        return new Response(
          JSON.stringify({
            error: { code: 'TOKEN_EXPIRED', message: 'Access token đã hết hạn.' },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ data: { id: '12', status: 'PENDING' }, meta: null }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      );
    };

    const res = await apiRequest('/wallets/me/topups', {
      method: 'POST',
      body: { amount: '150000.00' },
      idempotencyKey: 'idem-topup-token-expired-0001',
    });

    assert.equal(res.data.status, 'PENDING');
    assert.equal(refreshCalls, 1);
    assert.equal(authInvalidCalls, 0);
    assert.equal(seenHeaders.length, 2);
    assert.equal(seenHeaders[0].idem, 'idem-topup-token-expired-0001');
    assert.equal(seenHeaders[1].idem, 'idem-topup-token-expired-0001');
    assert.equal(seenHeaders[1].auth, 'Bearer fresh_jwt_gen_1');

    // If retry STILL returns TOKEN_EXPIRED, must stop after 1 retry (no infinite loop) and call onAuthInvalid
    refreshCalls = 0;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Expired again' } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );

    await assert.rejects(
      () => apiRequest('/wallets/me'),
      (err) => err instanceof ApiError && err.code === 'TOKEN_EXPIRED'
    );
    assert.equal(refreshCalls, 1);
    assert.equal(authInvalidCalls, 1);

    // Non-recoverable 401 SESSION_REVOKED must NOT call onTokenExpired
    refreshCalls = 0;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: 'SESSION_REVOKED', message: 'Phiên đã thu hồi.' } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );

    await assert.rejects(
      () => apiRequest('/wallets/me'),
      (err) => err instanceof ApiError && err.code === 'SESSION_REVOKED'
    );
    assert.equal(refreshCalls, 0);
    assert.equal(authInvalidCalls, 2);

    // Mutation on 500 or network error must NEVER auto-retry
    let mutationCalls = 0;
    globalThis.fetch = async () => {
      mutationCalls += 1;
      return new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'DB error' } }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    };
    await assert.rejects(() =>
      apiRequest('/rentals', {
        method: 'POST',
        body: { vehicle_id: '1', pickup_station_id: '1' },
        idempotencyKey: 'idem-rental-no-auto-retry-01',
      })
    );
    assert.equal(mutationCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('idempotency tracker enforces fresh keys per new action, preserves key on uncertain retry, rotates on body change, and stores no secrets', () => {
  const tracker = createIdempotencyTracker();

  // 1. First top-up action of 150000.00 -> random key 1
  const first = tracker.begin('wallet_topup', { amount: '150000.00' });
  assert.equal(first.reused, false);
  assert.ok(first.key.length >= 16 && first.key.length <= 128);
  assert.doesNotMatch(first.key, /150000/);

  // 2. Network timeout (uncertain outcome) -> retry with same body keeps exact same key!
  const timeoutErr = new ApiError(0, 'REQUEST_TIMEOUT', 'Timeout', { kind: 'timeout' });
  assert.equal(isUncertainIdempotentOutcome(timeoutErr), true);
  assert.equal(tracker.fail(timeoutErr), true);

  const retrySameBody = tracker.begin('wallet_topup', { amount: '150000.00' });
  assert.equal(retrySameBody.reused, true);
  assert.equal(retrySameBody.key, first.key);

  // 3. User changes amount from 150000.00 to 200000.00 before retrying -> MUST generate brand-new key!
  const changedBody = tracker.begin('wallet_topup', { amount: '200000.00' });
  assert.equal(changedBody.reused, false);
  assert.notEqual(changedBody.key, first.key);

  // 4. Request succeeds -> next top-up with exact same 200000.00 MUST get a brand-new key!
  tracker.succeed();
  const nextSeparateTopup = tracker.begin('wallet_topup', { amount: '200000.00' });
  assert.equal(nextSeparateTopup.reused, false);
  assert.notEqual(nextSeparateTopup.key, changedBody.key);

  // 5. Definite business error (e.g., 409 WALLET_UNAVAILABLE or 422 VALIDATION_ERROR) -> clears key
  const businessErr = new ApiError(409, 'WALLET_UNAVAILABLE', 'Ví bị khóa');
  assert.equal(isUncertainIdempotentOutcome(businessErr), false);
  assert.equal(tracker.fail(businessErr), false);
  const afterBusinessError = tracker.begin('wallet_topup', { amount: '200000.00' });
  assert.equal(afterBusinessError.reused, false);
  assert.notEqual(afterBusinessError.key, nextSeparateTopup.key);

  // 6. Sensitive fields are hashed one-way, never stored in tracker or stateRef
  const ref = { current: null };
  const sensitiveDocNumber = '079203012345';
  resolveIdempotencyKey(ref, 'doc_submit', { document_number: sensitiveDocNumber });
  const serializedRef = JSON.stringify(ref.current);
  assert.equal(serializedRef.includes(sensitiveDocNumber), false);
  assert.equal(
    fingerprintIdempotentPayload({ a: 1, b: 2 }),
    fingerprintIdempotentPayload({ b: 2, a: 1 })
  );
});

test('ID/money helpers preserve large 64-bit IDs, exact BigInt VND math, and pure Vietnamese customer labels', () => {
  // Large 64-bit PostgreSQL BIGINT (> Number.MAX_SAFE_INTEGER)
  const hugeId = '9007199254740993';
  assert.equal(toEntityIdString(hugeId), '9007199254740993');
  assert.equal(toEntityIdString(9007199254740993n), '9007199254740993');
  // Unsafe JS Number must be rejected rather than silently corrupting last digits
  assert.equal(toEntityIdString(9007199254740993), null);
  assert.equal(toEntityIdString(101), '101');
  assert.equal(toEntityIdString(0), null);

  assert.equal(
    stringifyJsonBody({ vehicle_id: 9007199254740993n, pickup_station_id: '991003' }),
    '{"vehicle_id":"9007199254740993","pickup_station_id":"991003"}'
  );

  // Money helpers
  assert.equal(normalizeMoneyString('150000', { requirePositive: true }), '150000.00');
  assert.equal(normalizeMoneyString('0.00', { requirePositive: true }), null);
  assert.equal(addMoneyStrings('100000.00', '10000.00'), '110000.00');
  assert.equal(subtractMoneyStrings('9999999999.99', '0.01'), '9999999999.98');
  assert.equal(compareMoneyStrings('110000.00', '100000.00'), 1);

  // URL resolution & pagination helpers
  assert.equal(
    resolveApiUrl('/api/v1/files/12/download', { preview: true }, 'http://localhost:8000/api/v1'),
    'http://localhost:8000/api/v1/files/12/download?preview=true'
  );
  assert.deepEqual(extractPagination({ page: 1, page_size: 20, total: 0 }), {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Station hours & pure Vietnamese customer status labels (no enum codes exposed)
  assert.equal(formatTimeRangeVN(null, null), 'Mở cửa 24/7');
  assert.equal(formatTimeRangeVN('06:00:00', '22:00:00'), '06:00 – 22:00');
  assert.equal(formatTimeRangeVN('22:00:00', '05:30:00'), '22:00 – 05:30 (qua đêm)');

  for (const [domain, code] of [
    ['rentalStatus', 'RESERVED'],
    ['rentalStatus', 'RETURN_PENDING'],
    ['rentalStatus', 'CLOSED_INCIDENT'],
    ['topupStatus', 'PENDING'],
    ['topupStatus', 'APPROVED'],
    ['topupStatus', 'REJECTED'],
    ['documentStatus', 'VERIFIED'],
    ['walletStatus', 'FROZEN'],
  ]) {
    const meta = getCustomerStatusMeta(domain, code);
    assert.equal(meta.label.includes(code), false, `Label "${meta.label}" must not expose enum "${code}"`);
  }
  assert.equal(getCustomerStatusMeta('rentalStatus', 'UNKNOWN_ENUM_VALUE').label, 'Không xác định');
});


test('authenticated client rejects foreign absolute URLs before sending bearer credentials', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'private-token' });
  globalThis.fetch = async () => { calls++; throw new Error('Must not send'); };
  try {
    await assert.rejects(() => apiRequest('https://untrusted.example/files/1/download'), (error) => error.code === 'INVALID_REQUEST');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; resetPlatformApi(); }
});
