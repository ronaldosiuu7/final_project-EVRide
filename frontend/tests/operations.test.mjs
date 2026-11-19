import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDateTimeVN,
  formatDateVN,
  formatDurationSeconds,
  formatVnd,
  toIsoWithVietnamOffset,
} from '../src/utils/format.js';
import {
  isPositiveIdString,
  isValidMoneyString,
  mapApiFieldErrors,
  normalizeMoneyString,
  resolveIdempotencyKey,
  validateDateRange,
  validateOperatingHours,
} from '../src/utils/validation.js';
import { getApiErrorMessage } from '../src/utils/errorMessages.js';
import { buildQuery } from '../src/integrations/apiClient.js';
import {
  getIdleTimeAnalytics,
  getInactiveCustomersAnalytics,
  getPeakHoursAnalytics,
} from '../src/services/analyticsApi.js';
import {
  IDLE_TIME_FIXTURE,
  INACTIVE_CUSTOMERS_FIXTURE,
  PEAK_HOURS_FIXTURE,
} from '../src/fixtures/analyticsFixtures.js';

test('formatVnd formats money strings accurately without float rounding loss', () => {
  assert.equal(formatVnd('10000.00'), '10.000đ');
  assert.equal(formatVnd('1234567.50'), '1.234.567,50đ');
  assert.equal(formatVnd('9999999999.99'), '9.999.999.999,99đ');
  assert.equal(formatVnd('0.00'), '0đ');
  assert.equal(formatVnd(null), '—');
  assert.equal(formatVnd(undefined), '—');
});

test('formatDateTimeVN, formatDateVN, and toIsoWithVietnamOffset convert Vietnam timezone', () => {
  assert.equal(formatDateVN('2026-11-19'), '19/11/2026');
  assert.equal(toIsoWithVietnamOffset('2026-11-19T14:30'), '2026-11-19T14:30:00+07:00');
  assert.equal(
    toIsoWithVietnamOffset('2026-11-19T14:30:15+07:00'),
    '2026-11-19T14:30:15+07:00'
  );
  const formatted = formatDateTimeVN('2026-11-19T07:30:00Z');
  assert.match(formatted, /19\/11\/2026/);
  assert.match(formatted, /14:30/);
  assert.equal(formatDurationSeconds(4800), '1 giờ 20 phút');
});

test('money, ID, date range, and operating hours validators match backend rules', () => {
  assert.equal(isValidMoneyString('10000.00'), true);
  assert.equal(isValidMoneyString('10000.5'), true);
  assert.equal(isValidMoneyString('-10.00'), false);
  assert.equal(isValidMoneyString('10.123'), false);

  assert.equal(normalizeMoneyString(' 10000 '), '10000.00');
  assert.equal(normalizeMoneyString('00350.5'), '350.50');
  assert.equal(normalizeMoneyString('abc'), null);

  assert.equal(isPositiveIdString('101'), true);
  assert.equal(isPositiveIdString('0'), false);
  assert.equal(isPositiveIdString('-5'), false);

  assert.equal(validateDateRange('', ''), '');
  assert.notEqual(validateDateRange('2026-11-01', ''), '');
  assert.notEqual(validateDateRange('2026-11-10', '2026-11-01'), '');
  assert.equal(validateDateRange('2026-11-01', '2026-11-10'), '');

  assert.deepEqual(validateOperatingHours('', ''), {
    error: '',
    opens_at: null,
    closes_at: null,
  });
  assert.notEqual(validateOperatingHours('06:00', '').error, '');
  assert.notEqual(validateOperatingHours('06:00', '06:00').error, '');
  assert.deepEqual(validateOperatingHours('22:00', '06:00'), {
    error: '',
    opens_at: '22:00:00',
    closes_at: '06:00:00',
  });

  assert.deepEqual(
    mapApiFieldErrors({
      details: {
        fields: [
          { field: 'battery_percent', message: 'Phải từ 0 đến 100' },
          { field: 'battery_percent', message: 'Duplicate' },
          { field: 'note', message: 'Bắt buộc' },
        ],
      },
    }),
    { battery_percent: 'Phải từ 0 đến 100', note: 'Bắt buộc' }
  );
});

test('resolveIdempotencyKey reuses same key for retries with identical payload and rotates on change', () => {
  let seq = 0;
  const fakeGen = () => `key-${++seq}`;
  const ref = { current: null };

  const k1 = resolveIdempotencyKey(ref, 'settle_501', { a: '1', b: '2' }, fakeGen);
  const k2 = resolveIdempotencyKey(ref, 'settle_501', { b: '2', a: '1' }, fakeGen);
  assert.equal(k1, 'key-1');
  assert.equal(k2, 'key-1');

  const k3 = resolveIdempotencyKey(ref, 'settle_501', { a: '1', b: '3' }, fakeGen);
  assert.equal(k3, 'key-2');

  ref.current = null;
  const k4 = resolveIdempotencyKey(ref, 'settle_501', { a: '1', b: '3' }, fakeGen);
  assert.equal(k4, 'key-3');
});

test('getApiErrorMessage and buildQuery handle backend error codes and query parameters', () => {
  assert.match(getApiErrorMessage({ code: 'FORBIDDEN' }), /quyền/i);
  assert.match(getApiErrorMessage({ code: 'INSUFFICIENT_BALANCE' }), /số dư/i);
  assert.match(getApiErrorMessage({ code: 'STALE_QUOTE' }), /hết hạn/i);
  assert.match(getApiErrorMessage({ code: 'ACCOUNT_DISABLED' }), /khóa/i);
  assert.match(getApiErrorMessage({ code: 'BILLING_CUTOFF_REQUIRED' }), /dừng cước/i);
  assert.match(getApiErrorMessage({ code: 'RATE_LIMITED', retryAfter: '12' }), /12 giây/);

  const qs = buildQuery({
    status: 'ACTIVE',
    empty: '',
    ignored: undefined,
    nil: null,
    has_space: true,
    page: 2,
  });
  assert.equal(qs, '?status=ACTIVE&has_space=true&page=2');
});

test('extended analytics fixtures and service adapters respect contract invariants', async () => {
  // Peak hours: 24 hours per station, included_trip_count matches sum, <= filtered_trip_count
  const cellSum = PEAK_HOURS_FIXTURE.items.reduce((acc, item) => acc + item.rental_count, 0);
  assert.equal(PEAK_HOURS_FIXTURE.included_trip_count, cellSum);
  assert.ok(PEAK_HOURS_FIXTURE.included_trip_count <= PEAK_HOURS_FIXTURE.filtered_trip_count);

  const byStation = new Map();
  for (const item of PEAK_HOURS_FIXTURE.items) {
    if (!byStation.has(item.station_id)) byStation.set(item.station_id, new Set());
    byStation.get(item.station_id).add(item.hour);
  }
  assert.ok(byStation.size <= 20);
  for (const hoursSet of byStation.values()) {
    assert.equal(hoursSet.size, 24);
  }

  // Idle time sorted descending + coverage constant
  assert.equal(IDLE_TIME_FIXTURE.coverage, 'OBSERVED_RETURN_PICKUP_PAIRS');
  for (let i = 1; i < IDLE_TIME_FIXTURE.items.length; i += 1) {
    assert.ok(
      IDLE_TIME_FIXTURE.items[i - 1].average_idle_minutes >=
        IDLE_TIME_FIXTURE.items[i].average_idle_minutes
    );
  }

  // Inactive customers sorted balance DESC, user_id ASC with positive balance
  const inactiveItems = INACTIVE_CUSTOMERS_FIXTURE.items;
  for (let i = 0; i < inactiveItems.length; i += 1) {
    assert.ok(Number(inactiveItems[i].balance) > 0);
    if (i > 0) {
      const prevBal = Number(inactiveItems[i - 1].balance);
      const curBal = Number(inactiveItems[i].balance);
      assert.ok(
        prevBal > curBal ||
          (prevBal === curBal && Number(inactiveItems[i - 1].user_id) < Number(inactiveItems[i].user_id))
      );
    }
  }

  // Date range validation throws 400 matching backend
  await assert.rejects(
    () => getPeakHoursAnalytics({ from_date: '2026-11-10', to_date: '2026-11-01' }),
    (err) => err.status === 400 && err.code === 'INVALID_DATE_RANGE'
  );
  await assert.rejects(
    () => getIdleTimeAnalytics({ from_date: '2026-11-01' }),
    (err) => err.status === 400 && err.code === 'DATE_RANGE_REQUIRED'
  );

  // Inactive customers accepts days in 14/30/60/90 and rejects invalid days
  const res30 = await getInactiveCustomersAnalytics({ days: 30, page: 1, page_size: 2 });
  assert.equal(res30.data.items.length, 2);
  assert.equal(res30.meta.total, inactiveItems.length);
  await assert.rejects(
    () => getInactiveCustomersAnalytics({ days: 7 }),
    (err) => err.status === 422 && err.code === 'VALIDATION_ERROR'
  );
});
