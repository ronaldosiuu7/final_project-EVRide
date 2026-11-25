import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFilterPatch,
  buildStationQueryParams,
  buildVehicleQueryParams,
  createLatestRequestGuard,
  formatBatteryPercent,
  formatCoordinatesDisplay,
  formatCountDisplay,
  formatMoneyDisplay,
  formatStationHours,
  getBatteryLevelInfo,
  getStationCapacityCount,
  getStationOpenStatus,
  getStationRentableCount,
  getStationReturnSpaceCount,
  getSystemTotalFromMeta,
} from '../src/utils/fleetDisplay.js';
import { apiRequest, ApiError, resetPlatformApi } from '../src/integrations/apiClient.js';
import {
  getStation,
  getVehicle,
  listStations,
  listStationVehicles,
  listVehicles,
} from '../src/services/fleetApi.js';

function makeJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('station hours handle 24/7 (both null), normal hours, overnight hours, and missing/invalid data safely', () => {
  assert.equal(formatStationHours(null, null), 'Mở cửa 24/7');
  assert.equal(formatStationHours(undefined, undefined), 'Mở cửa 24/7');

  const status247 = getStationOpenStatus(
    { status: 'ACTIVE', opens_at: null, closes_at: null },
    Date.parse('2026-11-25T17:00:00Z') // 00:00 VN
  );
  assert.equal(status247.isOpen, true);
  assert.equal(status247.is247, true);
  assert.equal(status247.label, 'Mở cửa 24/7');

  assert.equal(formatStationHours('06:00:00', '22:00:00'), '06:00 – 22:00');
  assert.equal(formatStationHours('22:00:00', '06:00:00'), '22:00 – 06:00 (qua đêm)');

  // Overnight station: 22:00 -> 06:00 (Asia/Ho_Chi_Minh = UTC+7)
  const overnightStation = { status: 'ACTIVE', opens_at: '22:00:00', closes_at: '06:00:00' };
  // 23:30 VN = 16:30 UTC -> OPEN
  assert.equal(
    getStationOpenStatus(overnightStation, Date.parse('2026-11-25T16:30:00Z')).isOpen,
    true
  );
  // 02:15 VN = 19:15 UTC -> OPEN
  assert.equal(
    getStationOpenStatus(overnightStation, Date.parse('2026-11-25T19:15:00Z')).isOpen,
    true
  );
  // 22:00 VN exact = 15:00 UTC -> OPEN
  assert.equal(
    getStationOpenStatus(overnightStation, Date.parse('2026-11-25T15:00:00Z')).isOpen,
    true
  );
  // 06:00 VN exact = 23:00 UTC -> CLOSED (backend uses local_time < closes_at)
  assert.equal(
    getStationOpenStatus(overnightStation, Date.parse('2026-11-25T23:00:00Z')).isOpen,
    false
  );
  // 14:00 VN = 07:00 UTC -> CLOSED
  const closedMidday = getStationOpenStatus(overnightStation, Date.parse('2026-11-25T07:00:00Z'));
  assert.equal(closedMidday.isOpen, false);
  assert.equal(closedMidday.isOvernight, true);
  assert.equal(closedMidday.label, 'Ngoài giờ hoạt động');

  // Partial or malformed hours never produce "undefined" or "NaN"
  const malformed = formatStationHours('06:00:00', null);
  assert.equal(malformed, 'Chưa cập nhật');
  assert.equal(malformed.includes('undefined'), false);
  assert.equal(malformed.includes('NaN'), false);
});

test('zero values are strictly distinguished from missing data and never render undefined, NaN, or / 10', () => {
  // 0 rentable vehicles must stay 0 even if fallback field is non-zero
  const zeroStation = {
    available_vehicle_count: 0,
    rentable_vehicles: 5,
    available_spaces: 0,
    capacity: null,
    latitude: null,
    longitude: undefined,
  };
  assert.equal(getStationRentableCount(zeroStation), 0);
  assert.equal(formatCountDisplay(getStationRentableCount(zeroStation), 'xe'), '0 xe');
  assert.equal(getStationReturnSpaceCount(zeroStation), 0);
  assert.equal(formatCountDisplay(getStationReturnSpaceCount(zeroStation), 'chỗ'), '0 chỗ');
  assert.equal(getStationCapacityCount(zeroStation), null);
  assert.equal(formatCoordinatesDisplay(zeroStation.latitude, zeroStation.longitude), 'Chưa cập nhật');

  // Missing values must display "Chưa cập nhật", never 0, undefined, NaN, or "/ 10"
  const missingStation = {};
  assert.equal(getStationRentableCount(missingStation), null);
  assert.equal(formatCountDisplay(getStationRentableCount(missingStation), 'xe'), 'Chưa cập nhật');
  assert.equal(formatCountDisplay(getStationReturnSpaceCount(missingStation), 'chỗ'), 'Chưa cập nhật');
  assert.equal(formatCountDisplay(NaN, 'xe'), 'Chưa cập nhật');

  // Battery & money: 0 vs missing/invalid
  assert.equal(formatBatteryPercent(0), '0%');
  assert.equal(getBatteryLevelInfo(0).percent, 0);
  assert.equal(formatBatteryPercent(null), 'Chưa cập nhật');
  assert.equal(formatBatteryPercent(undefined), 'Chưa cập nhật');
  assert.equal(formatBatteryPercent(NaN), 'Chưa cập nhật');

  assert.equal(formatMoneyDisplay('0.00'), '0đ');
  assert.equal(formatMoneyDisplay('15000.00'), '15.000đ');
  assert.equal(formatMoneyDisplay(null), 'Chưa cập nhật');
  assert.equal(formatMoneyDisplay(undefined), 'Chưa cập nhật');
  assert.equal(formatMoneyDisplay('NaN'), 'Chưa cập nhật');

  const renderedSummary = [
    formatStationHours(undefined, '22:00:00'),
    formatCountDisplay(missingStation.available_spaces, 'chỗ'),
    formatBatteryPercent(undefined),
    formatMoneyDisplay(undefined),
    formatCoordinatesDisplay(undefined, NaN),
  ].join(' | ');
  assert.equal(renderedSummary.includes('undefined'), false);
  assert.equal(renderedSummary.includes('NaN'), false);
  assert.equal(renderedSummary.includes('/ 10'), false);
});

test('filter changes reset page to 1 atomically and system total comes strictly from meta.total', () => {
  const page3State = {
    q: 'Quận 1',
    hasAvailableVehicles: 'true',
    hasReturnSpace: '',
    page: 3,
    pageSize: 12,
  };

  const afterQueryChange = applyFilterPatch(page3State, { q: 'Thủ Đức' });
  assert.equal(afterQueryChange.page, 1);
  assert.equal(afterQueryChange.q, 'Thủ Đức');
  assert.equal(afterQueryChange.hasAvailableVehicles, 'true');

  const stationParams = buildStationQueryParams(afterQueryChange);
  assert.deepEqual(stationParams, {
    page: 1,
    page_size: 12,
    q: 'Thủ Đức',
    has_available_vehicles: 'true',
  });

  const vehicleParams = buildVehicleQueryParams({
    stationId: '9007199254740993',
    model: '  Klara S  ',
    page: 2,
    pageSize: 12,
  });
  assert.deepEqual(vehicleParams, {
    page: 2,
    page_size: 12,
    station_id: '9007199254740993',
    model: 'Klara S',
  });

  // System total must read meta.total (e.g. 47) even when page only contains 12 items
  assert.equal(getSystemTotalFromMeta({ page: 1, page_size: 12, total: 47 }), 47);
  assert.equal(getSystemTotalFromMeta({ page: 1, page_size: 12, total: 0 }), 0);
  assert.equal(getSystemTotalFromMeta(null), null);
});

test('stale response from older filter never overwrites newer filter result and aborts prior signal', async () => {
  const guard = createLatestRequestGuard();
  let displayedResult = null;
  let abortedFirstSignal = false;

  const req1 = guard.begin();
  req1.signal?.addEventListener('abort', () => {
    abortedFirstSignal = true;
  });

  // User changes filter immediately -> begins req2 before req1 resolves
  const req2 = guard.begin();
  assert.equal(abortedFirstSignal, true);
  assert.equal(req1.isCurrent(), false);
  assert.equal(req2.isCurrent(), true);

  // Newer request resolves first
  const p2 = Promise.resolve(['Station B (new filter)']).then((items) => {
    if (req2.isCurrent()) {
      displayedResult = items;
    }
  });
  // Older request resolves late -> MUST NOT overwrite displayedResult
  const p1 = new Promise((resolve) => setTimeout(resolve, 15)).then(() => {
    if (req1.isCurrent()) {
      displayedResult = ['Station A (stale filter)'];
    }
  });

  await Promise.all([p1, p2]);
  assert.deepEqual(displayedResult, ['Station B (new filter)']);
});

test('fleetApi public endpoints hit exact backend paths and propagate API errors instead of returning empty list', async () => {
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  const seenUrls = [];

  globalThis.fetch = async (url) => {
    seenUrls.push(String(url));
    if (String(url).includes('/stations/10/vehicles')) {
      return makeJsonResponse({
        data: [{ id: '201', model: 'Klara S', battery_percent: 85 }],
        meta: { page: 1, page_size: 12, total: 15, server_time: '2026-11-25T10:00:00Z' },
      });
    }
    if (String(url).includes('/stations/10')) {
      return makeJsonResponse({
        data: { id: '10', name: 'Trạm Bến Thành', opens_at: null, closes_at: null },
        meta: { server_time: '2026-11-25T10:00:00Z' },
      });
    }
    if (String(url).includes('/stations?')) {
      return makeJsonResponse(
        { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Hệ thống đang bận.' } },
        503
      );
    }
    if (String(url).includes('/vehicles/201')) {
      return makeJsonResponse({
        data: { id: '201', name: 'EV-201', model: 'Klara S', battery_percent: 85 },
        meta: { server_time: '2026-11-25T10:00:00Z' },
      });
    }
    return makeJsonResponse({
      data: [{ id: '201', name: 'EV-201', model: 'Klara S', battery_percent: 85 }],
      meta: { page: 1, page_size: 12, total: 28, server_time: '2026-11-25T10:00:00Z' },
    });
  };

  try {
    // 1. API error on listStations MUST reject with ApiError (never silently become [])
    await assert.rejects(
      () => listStations({ q: 'Bến Thành', page: 1, page_size: 12 }),
      (err) => err instanceof ApiError && err.status === 503 && err.code === 'DEPENDENCY_UNAVAILABLE'
    );

    // 2. getStation, listStationVehicles, listVehicles, getVehicle hit exact paths and preserve meta.total
    const st = await getStation('10');
    assert.equal(st.data.id, '10');

    const stVehicles = await listStationVehicles('10', { model: 'Klara S', page: 1, page_size: 12 });
    assert.equal(stVehicles.meta.total, 15);
    assert.equal(stVehicles.data.length, 1);

    const allVehicles = await listVehicles({ station_id: '10', page: 1, page_size: 12 });
    assert.equal(allVehicles.meta.total, 28);

    const singleVehicle = await getVehicle('201');
    assert.equal(singleVehicle.data.id, '201');

    assert.ok(seenUrls.some((u) => u.includes('/stations?q=B%E1%BA%BFn+Th%C3%A0nh&page=1&page_size=12')));
    assert.ok(seenUrls.some((u) => u.includes('/stations/10/vehicles?model=Klara+S&page=1&page_size=12')));
    assert.ok(seenUrls.some((u) => u.includes('/vehicles?station_id=10&page=1&page_size=12')));
    assert.ok(seenUrls.some((u) => u.includes('/vehicles/201')));
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});
