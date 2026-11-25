import { ApiError, apiRequest } from '../integrations/apiClient.js';
import {
  IDLE_TIME_FIXTURE,
  INACTIVE_CUSTOMERS_FIXTURE,
  OVERVIEW_FIXTURE,
  PEAK_HOURS_FIXTURE,
  TOP_ROUTES_FIXTURE,
} from '../fixtures/analyticsFixtures.js';
import { validateDateRange } from '../utils/validation.js';

// ===== 1. Ba API phân tích doanh thu & tài chính THẬT từ backend =====

export function getRevenueReport({ from_date, to_date } = {}, { signal } = {}) {
  return apiRequest('/analytics/revenue', {
    query: { from_date, to_date },
    signal,
  });
}

export function getFinancialSummary({ from_date, to_date } = {}, { signal } = {}) {
  return apiRequest('/analytics/financial-summary', {
    query: { from_date, to_date },
    signal,
  });
}

export function getRevenueDetails({ from_date, to_date, page = 1, page_size = 20 } = {}, { signal } = {}) {
  return apiRequest('/analytics/revenue-details', {
    query: { from_date, to_date, page, page_size },
    signal,
  });
}

// ===== 2. Năm API phân tích mở rộng theo đặc tả (Backend V1 chưa triển khai -> dùng fixture đúng contract) =====

export const EXTENDED_ANALYTICS_ENDPOINTS = {
  overview: '/analytics/overview',
  peakHours: '/analytics/peak-hours',
  topRoutes: '/analytics/top-routes',
  idleTime: '/analytics/idle-time',
  inactiveCustomers: '/analytics/inactive-customers',
};

const VALID_INACTIVE_DAYS = new Set([14, 30, 60, 90]);

function assertContractDateRange(from_date, to_date) {
  const errMsg = validateDateRange(from_date, to_date);
  if (errMsg) {
    const isMissingPair = (Boolean(from_date) !== Boolean(to_date));
    throw new ApiError(
      400,
      isMissingPair ? 'DATE_RANGE_REQUIRED' : 'INVALID_DATE_RANGE',
      errMsg
    );
  }
}

function buildFixtureMeta(extra = {}) {
  return {
    request_id: 'req_fixture_analytics',
    server_time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ...extra,
  };
}

export async function getOverviewAnalytics({ from_date, to_date } = {}) {
  assertContractDateRange(from_date, to_date);
  return {
    data: OVERVIEW_FIXTURE,
    meta: buildFixtureMeta(),
    isFixture: true,
  };
}

export async function getPeakHoursAnalytics({ from_date, to_date, station_id } = {}) {
  assertContractDateRange(from_date, to_date);
  const allItems = PEAK_HOURS_FIXTURE.items;
  const filteredItems = station_id
    ? allItems.filter((item) => item.station_id === String(station_id))
    : allItems;
  const includedTripCount = filteredItems.reduce((sum, item) => sum + item.rental_count, 0);

  return {
    data: {
      items: filteredItems,
      included_trip_count: includedTripCount,
      filtered_trip_count: station_id ? includedTripCount : PEAK_HOURS_FIXTURE.filtered_trip_count,
    },
    meta: buildFixtureMeta(),
    isFixture: true,
  };
}

export async function getTopRoutesAnalytics({ from_date, to_date } = {}) {
  assertContractDateRange(from_date, to_date);
  return {
    data: TOP_ROUTES_FIXTURE,
    meta: buildFixtureMeta(),
    isFixture: true,
  };
}

export async function getIdleTimeAnalytics({ from_date, to_date, limit = 15 } = {}) {
  assertContractDateRange(from_date, to_date);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15));
  return {
    data: {
      items: IDLE_TIME_FIXTURE.items.slice(0, safeLimit),
      coverage: IDLE_TIME_FIXTURE.coverage,
    },
    meta: buildFixtureMeta(),
    isFixture: true,
  };
}

export async function getInactiveCustomersAnalytics({
  days = 30,
  as_of_date,
  page = 1,
  page_size = 20,
} = {}) {
  const numDays = Number(days);
  if (!VALID_INACTIVE_DAYS.has(numDays)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Tham số days phải nằm trong 14, 30, 60 hoặc 90.');
  }
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(100, Math.max(1, Number(page_size) || 20));
  const items = INACTIVE_CUSTOMERS_FIXTURE.items;
  const start = (p - 1) * ps;

  return {
    data: {
      items: items.slice(start, start + ps),
      as_of_date: as_of_date || INACTIVE_CUSTOMERS_FIXTURE.as_of_date,
      days: numDays,
    },
    meta: buildFixtureMeta({ page: p, page_size: ps, total: items.length }),
    isFixture: true,
  };
}
