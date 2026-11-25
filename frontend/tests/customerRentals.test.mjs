import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  configurePlatformApi,
  resetPlatformApi,
} from '../src/integrations/apiClient.js';
import {
  cancelRental,
  createRental,
  createReturnQuote,
  getLatestRentalGps,
  getRental,
  listRentalHandovers,
} from '../src/services/rentalsApi.js';
import { recordServerTime, resetServerTimeOffset } from '../src/utils/format.js';
import { createIdempotencyTracker } from '../src/utils/validation.js';
import {
  buildCreateRentalPayload,
  computeUpfrontReservationRequirement,
  describeReservationError,
  evaluateGpsStatus,
  findUnresolvedRental,
  getCancellationReasonLabel,
  getHandoverKindLabel,
  getReservationCountdownState,
  getVehicleConditionLabel,
} from '../src/utils/rentalHelpers.js';

function makeJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('reserve vehicle enforces string IDs, exact upfront deposit+block math, reuses Idempotency-Key on uncertain retry, and maps all business conflicts', async () => {
  // 1. Upfront requirement uses exact BigInt math (deposit + first_30_minutes_price)
  const req = computeUpfrontReservationRequirement({
    deposit_amount: '500000.00',
    first_30_minutes_price: '15000.00',
  });
  assert.equal(req.totalRequired, '515000.00');
  assert.equal(req.formattedTotal, '515.000đ');

  const payload = buildCreateRentalPayload({
    vehicleId: 9007199254740993n,
    pickupStationId: 12,
  });
  assert.deepEqual(payload, {
    vehicle_id: '9007199254740993',
    pickup_station_id: '12',
  });

  // 2. Retry on CONCURRENT_STATE_CHANGED / network failure preserves exact Idempotency-Key;
  //    terminal conflict (VEHICLE_UNAVAILABLE) rotates key on next vehicle selection
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  const tracker = createIdempotencyTracker();
  const seenRequests = [];
  let attempt = 0;

  globalThis.fetch = async (_url, init) => {
    attempt += 1;
    const headers = new Headers(init.headers);
    seenRequests.push({
      idempotencyKey: headers.get('idempotency-key'),
      body: JSON.parse(init.body),
    });

    if (attempt === 1) {
      return makeJsonResponse(
        {
          error: {
            code: 'CONCURRENT_STATE_CHANGED',
            message: 'Dữ liệu giữ xe vừa thay đổi; hãy thử lại cùng Idempotency-Key.',
          },
        },
        409
      );
    }
    if (attempt === 2) {
      return makeJsonResponse(
        {
          data: {
            id: '801',
            status: 'RESERVED',
            vehicle_id: '9007199254740993',
            pickup_station_id: '12',
            expires_at: '2026-11-25T10:30:00Z',
          },
          meta: { server_time: '2026-11-25T10:00:00Z' },
        },
        201
      );
    }
    return makeJsonResponse(
      { error: { code: 'VEHICLE_UNAVAILABLE', message: 'Xe vừa được khách khác đặt trước.' } },
      409
    );
  };

  try {
    // Attempt 1 -> 409 CONCURRENT_STATE_CHANGED (uncertain/retryable with same key)
    const begin1 = tracker.begin('reserve:9007199254740993:12', payload);
    let caughtErr = null;
    try {
      await createRental(payload, begin1.key);
    } catch (err) {
      caughtErr = err;
      const kept = tracker.fail(err);
      assert.equal(kept, true, 'Must keep Idempotency-Key for CONCURRENT_STATE_CHANGED retry');
    }
    assert.equal(describeReservationError(caughtErr).canRetrySameKey, true);

    // Attempt 2 -> Retry with SAME action & payload reuses EXACT same Idempotency-Key and succeeds
    const begin2 = tracker.begin('reserve:9007199254740993:12', payload);
    assert.equal(begin2.key, begin1.key);
    const created = await createRental(payload, begin2.key);
    tracker.succeed();
    assert.equal(created.data.id, '801');
    assert.equal(seenRequests[0].idempotencyKey, seenRequests[1].idempotencyKey);
    assert.equal(typeof seenRequests[0].body.vehicle_id, 'string');
    assert.equal(typeof seenRequests[0].body.pickup_station_id, 'string');

    // Attempt 3 -> Terminal conflict (VEHICLE_UNAVAILABLE) clears key & provides recovery route
    const begin3 = tracker.begin('reserve:9007199254740993:12', payload);
    assert.notEqual(begin3.key, begin1.key);
    await assert.rejects(
      async () => {
        try {
          await createRental(payload, begin3.key);
        } catch (err) {
          assert.equal(tracker.fail(err), false);
          throw err;
        }
      },
      (err) => err instanceof ApiError && err.code === 'VEHICLE_UNAVAILABLE'
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }

  // 3. Verify all required business error classifications & recovery CTAs
  assert.equal(
    describeReservationError(new ApiError(409, 'VERIFIED_CCCD_REQUIRED', 'Thiếu CCCD')).actionTo,
    '/profile'
  );
  assert.equal(
    describeReservationError(new ApiError(409, 'ACTIVE_RENTAL_EXISTS', 'Còn chuyến')).actionTo,
    '/rentals'
  );
  assert.equal(
    describeReservationError(new ApiError(409, 'DAILY_CANCELLATION_LIMIT_REACHED', 'Quá 3 lần')).actionTo,
    '/rentals'
  );
  assert.equal(
    describeReservationError(new ApiError(409, 'VEHICLE_UNAVAILABLE', 'Xe bận')).actionTo,
    '/vehicles'
  );
  assert.equal(
    describeReservationError(new ApiError(409, 'STATION_UNAVAILABLE', 'Trạm đóng')).actionTo,
    '/stations'
  );
  assert.equal(
    describeReservationError(new ApiError(409, 'STATION_FULL', 'Trạm đầy')).actionTo,
    '/stations'
  );
  assert.equal(
    describeReservationError(new ApiError(409, 'INSUFFICIENT_BALANCE', 'Thiếu tiền')).canRetrySameKey,
    false
  );
});

test('reservation countdown uses server_time offset, never mutates status client-side on expiry, and reloads authoritative state on expiry or cancel conflict', async () => {
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  resetServerTimeOffset();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  // Simulate client clock being 10 MINUTES AHEAD of server clock!
  const realServerMs = Date.parse('2026-11-25T10:00:00Z');
  const skewedClientMs = Date.parse('2026-11-25T10:10:00Z');
  recordServerTime('2026-11-25T10:00:00Z', skewedClientMs);

  const reservedRental = {
    id: '802',
    status: 'RESERVED',
    expires_at: '2026-11-25T10:05:00Z', // 5 minutes remaining according to SERVER (even though skewed client clock is already 10:10!)
  };

  // Despite client clock being 10:10, server-synced countdown accurately knows 300s (05:00) remain!
  const activeHold = getReservationCountdownState(reservedRental, {
    clientNowMs: skewedClientMs,
  });
  assert.equal(activeHold.remainingSeconds, 300);
  assert.equal(activeHold.formattedCountdown, '05:00');
  assert.equal(activeHold.needsServerRefresh, false);

  // 5 minutes + 1 second later on client -> countdown hits 0 -> sets needsServerRefresh=true WITHOUT mutating rental.status!
  const atZero = getReservationCountdownState(reservedRental, {
    clientNowMs: skewedClientMs + 301 * 1000,
  });
  assert.equal(atZero.remainingSeconds, 0);
  assert.equal(atZero.needsServerRefresh, true);
  assert.equal(reservedRental.status, 'RESERVED', 'Client timer must never mutate rental status directly');

  // Simulate cancel attempt right after server expired it -> 409 RESERVATION_EXPIRED -> reload GET /rentals/802 returns EXPIRED
  let getCount = 0;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith('/rentals/802/cancel') && init.method === 'POST') {
      return makeJsonResponse(
        { error: { code: 'RESERVATION_EXPIRED', message: 'Lượt giữ xe đã hết hạn.' } },
        409
      );
    }
    if (target.endsWith('/rentals/802')) {
      getCount += 1;
      return makeJsonResponse({
        data: {
          id: '802',
          status: 'EXPIRED',
          expires_at: '2026-11-25T10:05:00Z',
        },
        meta: { server_time: new Date(realServerMs + 305 * 1000).toISOString() },
      });
    }
    return makeJsonResponse({ data: [] });
  };

  try {
    await assert.rejects(
      () => cancelRental('802', 'cancel-key-1234567890'),
      (err) => err instanceof ApiError && err.code === 'RESERVATION_EXPIRED'
    );

    const reloaded = await getRental('802');
    assert.equal(getCount, 1);
    assert.equal(reloaded.data.status, 'EXPIRED');
  } finally {
    globalThis.fetch = originalFetch;
    resetServerTimeOffset();
    resetPlatformApi();
  }
});

test('GPS staleness warning, handover labels, server return-quote, and unresolved rental detection follow backend contract', async () => {
  // 1. GPS staleness never describes old coordinates as current position
  const missingGps = evaluateGpsStatus({ point: null, stale_after_seconds: 60, is_stale: true });
  assert.equal(missingGps.hasPoint, false);
  assert.equal(missingGps.isStale, true);
  assert.ok(missingGps.warningText);

  const staleGps = evaluateGpsStatus({
    point: { id: '1', latitude: 10.7769, longitude: 106.7009, recorded_at: '2026-11-25T09:50:00Z' },
    stale_after_seconds: 60,
    is_stale: true,
  });
  assert.equal(staleGps.hasPoint, true);
  assert.equal(staleGps.isStale, true);
  assert.ok(staleGps.warningText.includes('60 giây'));

  const freshGps = evaluateGpsStatus({
    point: { id: '2', latitude: 10.7771, longitude: 106.7012, recorded_at: '2026-11-25T10:00:00Z' },
    stale_after_seconds: 60,
    is_stale: false,
  });
  assert.equal(freshGps.isStale, false);
  assert.equal(freshGps.warningText, null);

  // 2. Unresolved rental detection & pure Vietnamese handover/cancellation labels
  assert.equal(
    findUnresolvedRental([
      { id: '1', status: 'COMPLETED' },
      { id: '2', status: 'EXPIRED' },
      { id: '3', status: 'INCIDENT_PENDING' },
    ])?.id,
    '3'
  );
  assert.equal(findUnresolvedRental([{ id: '4', status: 'CLOSED_INCIDENT' }]), null);

  assert.equal(getHandoverKindLabel('PICKUP'), 'Bàn giao nhận xe');
  assert.equal(getHandoverKindLabel('RETURN'), 'Tiếp nhận trả xe');
  assert.equal(getVehicleConditionLabel('OK'), 'Tình trạng bình thường');
  assert.equal(getVehicleConditionLabel('NEEDS_MAINTENANCE'), 'Cần kiểm tra bảo trì');
  assert.ok(getCancellationReasonLabel('VEHICLE_FAULT', true).includes('không tính'));

  // 3. Server return-quote & handovers/gps endpoints
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  let quoteRequestBody = null;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith('/rentals/900/return-quote') && init.method === 'POST') {
      quoteRequestBody = JSON.parse(init.body);
      return makeJsonResponse({
        data: {
          id: '55',
          rental_id: '900',
          return_station_id: '15',
          is_estimate: false,
          quote_expires_at: '2026-11-25T10:10:00Z',
          elapsed_seconds: 2100,
          rental_fee: '17500.00',
          discount_amount: '2500.00',
          total_amount: '15000.00',
          deposit_held: '500000.00',
          deposit_applied: '15000.00',
          additional_payment: '0.00',
          deposit_refund: '485000.00',
          promotion_code: 'EV2500',
          quote_token: 'qtok_demo_123456789012345678901234567890',
        },
        meta: { server_time: '2026-11-25T10:00:00Z' },
      });
    }
    if (target.includes('/rentals/900/handovers')) {
      return makeJsonResponse({
        data: [
          {
            id: '1',
            rental_id: '900',
            kind: 'PICKUP',
            time: '2026-11-25T09:25:00Z',
            battery_percent: 88,
            vehicle_condition: null,
            note: 'Xe sạch đẹp',
          },
        ],
        meta: { page: 1, page_size: 20, total: 1, server_time: '2026-11-25T10:00:00Z' },
      });
    }
    return makeJsonResponse({
      data: {
        point: { id: '9', latitude: 10.78, longitude: 106.7, recorded_at: '2026-11-25T09:59:50Z' },
        stale_after_seconds: 60,
        is_stale: false,
      },
      meta: { server_time: '2026-11-25T10:00:00Z' },
    });
  };

  try {
    const quoteRes = await createReturnQuote('900', {
      return_station_id: '15',
      promotion_code: 'EV2500',
    });
    assert.deepEqual(quoteRequestBody, {
      return_station_id: '15',
      promotion_code: 'EV2500',
    });
    assert.equal(quoteRes.data.total_amount, '15000.00');
    assert.equal(quoteRes.data.deposit_refund, '485000.00');

    const handoversRes = await listRentalHandovers('900', { page: 1, page_size: 20 });
    assert.equal(handoversRes.data[0].kind, 'PICKUP');

    const gpsRes = await getLatestRentalGps('900');
    assert.equal(gpsRes.data.is_stale, false);
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});
