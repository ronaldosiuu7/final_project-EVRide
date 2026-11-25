import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  configurePlatformApi,
  resetPlatformApi,
} from '../src/integrations/apiClient.js';
import {
  createCustomerTopupRequest,
  getMyWallet,
  getTopupRequestDetail,
  listMyTopupRequests,
  listMyWalletTransactions,
} from '../src/services/walletsApi.js';
import { getCustomerStatusMeta } from '../src/utils/statusConfig.js';
import { createIdempotencyTracker } from '../src/utils/validation.js';
import {
  createTopupPollingController,
  detectTopupStatusTransitions,
  evaluateTopupBackendCompatibility,
  evaluateWalletSubmissionGate,
  validateTopupAmountInput,
} from '../src/utils/walletHelpers.js';

function makeJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('creating PENDING top-up never increases wallet balance or fakes TOPUP SUCCESS; APPROVED reloads balance/tx; REJECTED exposes reason only', async () => {
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  // Simulate authoritative backend state per merged PR #40 (b52ef8f / 142451c9f9631b35c1fbc6be512d12a70ad51772)
  let serverBalance = '50000.00';
  let serverTransactions = [];
  let serverTopups = [];

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const method = init?.method || 'GET';

    if (target.endsWith('/wallets/me') && method === 'GET') {
      return makeJsonResponse({
        data: {
          id: '5',
          user_id: '990001',
          balance: serverBalance,
          status: 'ACTIVE',
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-25T10:30:00Z',
        },
        meta: { server_time: '2026-11-25T10:30:00Z' },
      });
    }

    if (target.includes('/wallets/me/topups') && method === 'GET') {
      return makeJsonResponse({
        data: serverTopups,
        meta: {
          page: 1,
          page_size: 10,
          total: serverTopups.length,
          server_time: '2026-11-25T10:30:00Z',
        },
      });
    }

    if (target.endsWith('/wallets/me/topups') && method === 'POST') {
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body), ['amount'], 'StrictRequest extra=forbid allows only amount');
      const created = {
        id: String(12 + serverTopups.length),
        wallet_id: '5',
        requested_by: '990001',
        amount: body.amount,
        status: 'PENDING',
        payment_mode: 'DEMO',
        created_at: '2026-11-25T10:30:00Z',
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        wallet_transaction_id: null,
      };
      serverTopups = [created, ...serverTopups];
      return makeJsonResponse(
        {
          data: created,
          meta: { request_id: 'req_01', server_time: '2026-11-25T10:30:00Z' },
        },
        201
      );
    }

    if (target.includes('/wallets/me/transactions') && method === 'GET') {
      return makeJsonResponse({
        data: serverTransactions,
        meta: {
          page: 1,
          page_size: 10,
          total: serverTransactions.length,
          server_time: '2026-11-25T10:35:00Z',
        },
      });
    }

    if (target.includes('/wallet-topup-requests/')) {
      const reqId = target.split('/').pop();
      const found = serverTopups.find((r) => r.id === reqId);
      if (!found) {
        return makeJsonResponse({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy.' } }, 404);
      }
      return makeJsonResponse({
        data: found,
        meta: { server_time: '2026-11-25T10:36:00Z' },
      });
    }

    return makeJsonResponse({ data: null });
  };

  try {
    // 1. Initial load & friendly status labels check
    assert.equal(getCustomerStatusMeta('topupStatus', 'PENDING').label, 'Chờ xác nhận');
    assert.equal(getCustomerStatusMeta('topupStatus', 'APPROVED').label, 'Đã duyệt');
    assert.equal(getCustomerStatusMeta('topupStatus', 'REJECTED').label, 'Bị từ chối');

    const initialWallet = (await getMyWallet()).data;
    assert.equal(initialWallet.balance, '50000.00');

    // 2. Customer creates top-up request #12 (150,000.00) -> PENDING, balance stays 50,000.00, no fake tx!
    const createdRes = await createCustomerTopupRequest(
      { amount: '150000.00' },
      'idem-topup-key-0001',
      { backendCompatible: true }
    );
    assert.equal(createdRes.data.status, 'PENDING');
    assert.equal(createdRes.data.payment_mode, 'DEMO');
    assert.equal(createdRes.data.wallet_transaction_id, null);

    let knownMap = new Map();
    const step1 = detectTopupStatusTransitions(knownMap, (await listMyTopupRequests()).data);
    knownMap = step1.nextStatusById;
    assert.equal(step1.hasPending, true);
    assert.equal(step1.newlyApproved.length, 0);
    assert.equal((await getMyWallet()).data.balance, '50000.00');
    assert.equal((await listMyWalletTransactions()).data.length, 0);

    // 3. Staff approves request #12 on backend -> poll detects PENDING -> APPROVED -> reloads wallet & tx
    serverBalance = '200000.00';
    serverTransactions = [
      {
        id: '88',
        wallet_id: '5',
        rental_id: null,
        transaction_id: null,
        amount: '150000.00',
        type: 'TOPUP',
        balance_before: '50000.00',
        balance_after: '200000.00',
        status: 'SUCCESS',
        created_at: '2026-11-25T10:35:00Z',
      },
    ];
    serverTopups = [
      {
        ...serverTopups[0],
        status: 'APPROVED',
        reviewed_by: '990006',
        reviewed_at: '2026-11-25T10:35:00Z',
        wallet_transaction_id: '88',
      },
    ];

    const step2 = detectTopupStatusTransitions(knownMap, (await listMyTopupRequests()).data);
    knownMap = step2.nextStatusById;
    assert.equal(step2.newlyApproved.length, 1);
    assert.equal(step2.hasPending, false);

    const updatedWallet = (await getMyWallet()).data;
    const updatedTx = (await listMyWalletTransactions()).data;
    assert.equal(updatedWallet.balance, '200000.00');
    assert.equal(updatedTx.length, 1);
    assert.equal(updatedTx[0].type, 'TOPUP');

    // 4. Customer creates request #13 (100,000.00) -> Staff rejects with reason -> balance stays 200,000.00
    await createCustomerTopupRequest({ amount: '100000.00' }, 'idem-topup-key-0002', {
      backendCompatible: true,
    });
    const step3 = detectTopupStatusTransitions(knownMap, (await listMyTopupRequests()).data);
    knownMap = step3.nextStatusById;
    assert.equal(step3.hasPending, true);

    serverTopups[0] = {
      ...serverTopups[0],
      status: 'REJECTED',
      reviewed_by: '990006',
      reviewed_at: '2026-11-25T10:36:00Z',
      rejection_reason: 'Chưa xác nhận được yêu cầu nạp demo',
    };

    const step4 = detectTopupStatusTransitions(knownMap, (await listMyTopupRequests()).data);
    assert.equal(step4.newlyApproved.length, 0);
    assert.equal(step4.newlyRejected.length, 1);
    assert.equal(step4.newlyRejected[0].rejection_reason, 'Chưa xác nhận được yêu cầu nạp demo');

    const detail = await getTopupRequestDetail(serverTopups[0].id);
    assert.equal(detail.data.status, 'REJECTED');
    assert.equal(detail.data.rejection_reason, 'Chưa xác nhận được yêu cầu nạp demo');
    assert.equal((await getMyWallet()).data.balance, '200000.00');
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('amount validation, frozen/locked wallet gate, and incompatible pre-PR-40 backend guard prevent legacy immediate-credit calls', async () => {
  // 1. Schema validation matches MONEY_PATTERN ^[0-9]{1,10}(?:\.[0-9]{1,2})?$ and > 0
  assert.equal(validateTopupAmountInput('').valid, false);
  assert.equal(validateTopupAmountInput('0').valid, false);
  assert.equal(validateTopupAmountInput('0.00').valid, false);
  assert.equal(validateTopupAmountInput('-50000').valid, false);
  assert.equal(validateTopupAmountInput('150,000').valid, false);
  assert.equal(validateTopupAmountInput('150000.555').valid, false);
  assert.equal(validateTopupAmountInput('10000000000.00').valid, false); // 11 integer digits > 9,999,999,999.99

  const validInt = validateTopupAmountInput(' 150000 ');
  assert.equal(validInt.valid, true);
  assert.equal(validInt.normalizedAmount, '150000.00');

  const validDec = validateTopupAmountInput('9999999999.99');
  assert.equal(validDec.valid, true);
  assert.equal(validDec.normalizedAmount, '9999999999.99');

  // 2. Frozen / Locked wallet blocks submission on UI
  const compatible = evaluateTopupBackendCompatibility({ hasVerifiedOnce: true });
  assert.equal(compatible.canSubmit, true);
  assert.equal(
    evaluateWalletSubmissionGate({
      wallet: { id: '5', status: 'FROZEN', balance: '50000.00' },
      compatibility: compatible,
    }).allowed,
    false
  );
  assert.equal(
    evaluateWalletSubmissionGate({
      wallet: { id: '5', status: 'LOCKED', balance: '50000.00' },
      compatibility: compatible,
    }).allowed,
    false
  );
  assert.equal(
    evaluateWalletSubmissionGate({
      wallet: { id: '5', status: 'ACTIVE', balance: '50000.00' },
      compatibility: compatible,
    }).allowed,
    true
  );

  // 3. Incompatible old backend (GET /wallets/me/topups returns 405 Method Not Allowed) disables submission
  const incompatible405 = evaluateTopupBackendCompatibility({
    hasVerifiedOnce: false,
    topupsError: new ApiError(405, 'HTTP_ERROR', 'Method Not Allowed'),
    topupsLoading: false,
  });
  assert.equal(incompatible405.status, 'incompatible');
  assert.equal(incompatible405.canSubmit, false);

  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  let postCalled = false;

  globalThis.fetch = async () => {
    postCalled = true;
    // Simulate legacy immediate-credit response just in case
    return makeJsonResponse(
      {
        data: {
          wallet_transaction: { id: '1', type: 'TOPUP', status: 'SUCCESS' },
          wallet: { id: '5', balance: '200000.00' },
          payment_mode: 'DEMO',
        },
      },
      201
    );
  };

  try {
    await assert.rejects(
      () => createCustomerTopupRequest({ amount: '150000.00' }, 'missing-explicit-compatibility'),
      (err) => err.code === 'TOPUP_BACKEND_INCOMPATIBLE'
    );
    assert.equal(postCalled, false, 'Omitting compatibility must fail closed');
    // Guard #1: backendCompatible=false blocks BEFORE network call!
    await assert.rejects(
      () =>
        createCustomerTopupRequest({ amount: '150000.00' }, 'idem-legacy-block-1', {
          backendCompatible: incompatible405.canSubmit,
        }),
      (err) => err instanceof ApiError && err.code === 'TOPUP_BACKEND_INCOMPATIBLE'
    );
    assert.equal(postCalled, false, 'Must NEVER hit legacy POST endpoint when backend is incompatible');

    // Guard #2: Even if backendCompatible=true, a legacy immediate-credit payload is rejected!
    await assert.rejects(
      () =>
        createCustomerTopupRequest({ amount: '150000.00' }, 'idem-legacy-block-2', {
          backendCompatible: true,
        }),
      (err) => err instanceof ApiError && err.code === 'TOPUP_BACKEND_INCOMPATIBLE'
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('idempotency preserves key on timeout retry, rotates key for new request with identical amount after success, supports pagination, and cleans up polling', async () => {
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  const tracker = createIdempotencyTracker();
  const seenKeys = [];
  const seenUrls = [];
  let postAttempt = 0;

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    seenUrls.push(target);
    if (target.endsWith('/wallets/me/topups') && init?.method === 'POST') {
      postAttempt += 1;
      seenKeys.push(new Headers(init.headers).get('idempotency-key'));
      if (postAttempt === 1) {
        // Simulate network/timeout failure
        throw new TypeError('Failed to fetch');
      }
      return makeJsonResponse(
        {
          data: {
            id: String(100 + postAttempt),
            wallet_id: '5',
            requested_by: '990001',
            amount: '150000.00',
            status: 'PENDING',
            payment_mode: 'DEMO',
            created_at: '2026-11-25T11:00:00Z',
            reviewed_by: null,
            reviewed_at: null,
            rejection_reason: null,
            wallet_transaction_id: null,
          },
          meta: { server_time: '2026-11-25T11:00:00Z' },
        },
        201
      );
    }
    return makeJsonResponse({
      data: [],
      meta: { page: 2, page_size: 10, total: 25, server_time: '2026-11-25T11:00:00Z' },
    });
  };

  try {
    const payload = { amount: '150000.00' };

    // 1. Double-click before failure/completion returns identical key & fingerprint
    const click1 = tracker.begin('customer-wallet-topup', payload);
    const click2SameInFlight = tracker.begin('customer-wallet-topup', payload);
    assert.equal(click1.key, click2SameInFlight.key);

    // 2. First attempt fails with NETWORK_ERROR -> tracker keeps key for retry
    await assert.rejects(async () => {
      try {
        await createCustomerTopupRequest(payload, click1.key, { backendCompatible: true });
      } catch (err) {
        assert.equal(tracker.fail(err), true);
        throw err;
      }
    });

    // 3. Retry after network error reuses EXACT same Idempotency-Key and succeeds
    const retryBegin = tracker.begin('customer-wallet-topup', payload);
    assert.equal(retryBegin.key, click1.key);
    const res1 = await createCustomerTopupRequest(payload, retryBegin.key, {
      backendCompatible: true,
    });
    tracker.succeed();
    assert.equal(res1.data.status, 'PENDING');
    assert.equal(seenKeys[0], seenKeys[1]);

    // 4. Subsequent NEW request with the EXACT SAME amount ("150000.00") MUST generate a brand-new key!
    const secondTopupBegin = tracker.begin('customer-wallet-topup', payload);
    assert.notEqual(secondTopupBegin.key, click1.key);
    await createCustomerTopupRequest(payload, secondTopupBegin.key, { backendCompatible: true });
    tracker.succeed();
    assert.notEqual(seenKeys[2], seenKeys[1]);

    // 5. Pagination query params for topup requests & wallet transactions
    const page2Topups = await listMyTopupRequests({ status: 'PENDING', page: 2, page_size: 10 });
    assert.equal(page2Topups.meta.total, 25);
    const page2Tx = await listMyWalletTransactions({ type: 'TOPUP', page: 2, page_size: 10 });
    assert.equal(page2Tx.meta.total, 25);
    assert.ok(seenUrls.some((u) => u.includes('/wallets/me/topups?status=PENDING&page=2&page_size=10')));
    assert.ok(seenUrls.some((u) => u.includes('/wallets/me/transactions?type=TOPUP&page=2&page_size=10')));
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }

  // 6. Polling controller pauses on hidden tab, resumes on visible, and cleans up timers/listeners on stop()
  let visible = true;
  let tickCount = 0;
  let activeIntervals = 0;
  let intervalCallback = null;
  let visibilityListener = null;
  let unsubscribedVisibility = false;

  const controller = createTopupPollingController({
    intervalMs: 12000,
    isVisible: () => visible,
    onTick: () => {
      tickCount += 1;
    },
    setIntervalFn: (fn) => {
      activeIntervals += 1;
      intervalCallback = fn;
      return 42;
    },
    clearIntervalFn: () => {
      activeIntervals -= 1;
      intervalCallback = null;
    },
    subscribeVisibility: (handler) => {
      visibilityListener = handler;
      return () => {
        unsubscribedVisibility = true;
        visibilityListener = null;
      };
    },
  });

  controller.start();
  assert.equal(controller.isActive(), true);
  assert.equal(activeIntervals, 1);

  intervalCallback();
  assert.equal(tickCount, 1);

  // Hide tab -> stops interval immediately
  visible = false;
  visibilityListener();
  assert.equal(activeIntervals, 0);
  assert.equal(controller.isActive(), false);

  // Show tab -> triggers immediate tick + restarts interval
  visible = true;
  visibilityListener();
  assert.equal(tickCount, 2);
  assert.equal(activeIntervals, 1);

  // Unmount / logout -> stops interval and unsubscribes visibility listener
  controller.stop();
  assert.equal(activeIntervals, 0);
  assert.equal(unsubscribedVisibility, true);
  assert.equal(controller.isActive(), false);
});
