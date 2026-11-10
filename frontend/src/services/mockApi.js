// Lớp API giả lập cho khu vực Admin/Staff.
// Các hàm trả Promise theo envelope của docs/api-contract.md mục 2.2/2.3:
//   thành công: { data, meta: { request_id, server_time, page?, page_size?, total? } }
//   lỗi: ném ApiError có status, code, message, details (frontend xử lý theo code).
// Khi backend có API thật, chỉ cần thay phần thân các hàm bằng fetch tới /api/v1/...

import {
  mockStations,
  mockVehicles,
  mockRecentTickets,
  VEHICLE_STATUSES
} from '../utils/mockData';

const MOCK_DELAY_MS = 400;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Bản sao trong bộ nhớ để các thao tác ghi (điều chuyển, đổi trạng thái) giữ được trong phiên.
export const db = {
  stations: mockStations.map((s) => ({ ...s })),
  vehicles: mockVehicles.map((v) => ({ ...v })),
  tickets: mockRecentTickets.map((t) => ({ ...t }))
};

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let requestCounter = 0;

const buildMeta = (extra = {}) => {
  requestCounter += 1;
  return {
    request_id: `req_mock_${String(requestCounter).padStart(4, '0')}`,
    server_time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ...extra
  };
};

// Thêm ?mock_error=1 vào URL để xem trạng thái lỗi của giao diện.
const shouldSimulateError = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mock_error') === '1';

export const respond = (factory) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (shouldSimulateError()) {
          throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Không kết nối được máy chủ (giả lập).');
        }
        resolve(factory());
      } catch (err) {
        reject(err);
      }
    }, MOCK_DELAY_MS);
  });

const parsePaging = ({ page = 1, page_size = DEFAULT_PAGE_SIZE } = {}) => {
  const p = Number(page);
  const size = Number(page_size);
  if (!Number.isInteger(p) || p < 1 || !Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Tham số phân trang không hợp lệ.', {
      fields: [{ field: 'page/page_size', message: `page >= 1, 1 <= page_size <= ${MAX_PAGE_SIZE}` }]
    });
  }
  return { page: p, page_size: size };
};

export const paginate = (items, params) => {
  const { page, page_size } = parsePaging(params);
  const start = (page - 1) * page_size;
  return {
    data: items.slice(start, start + page_size),
    meta: buildMeta({ page, page_size, total: items.length })
  };
};

export const single = (data) => ({ data, meta: buildMeta() });

// Sắp mặc định theo contract: created_at DESC, id DESC; không có created_at thì id DESC.
const byCreatedDesc = (a, b) =>
  (b.created_at || '').localeCompare(a.created_at || '') || Number(b.id) - Number(a.id);
const byIdAsc = (a, b) => Number(a.id) - Number(b.id);

const validateDateRange = ({ from_date, to_date } = {}) => {
  if (!from_date && !to_date) return;
  if (!from_date || !to_date) {
    throw new ApiError(400, 'INVALID_DATE_RANGE', 'Cần chọn cả ngày bắt đầu và ngày kết thúc.');
  }
  if (from_date > to_date) {
    throw new ApiError(400, 'INVALID_DATE_RANGE', 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  }
};

// Tính lại các trường dẫn xuất của trạm từ danh sách xe (contract mục 3).
export const recomputeStationCounters = () => {
  db.stations.forEach((station) => {
    const parked = db.vehicles.filter((v) => v.current_station_id === station.id);
    station.occupied_spaces = parked.length;
    station.available_spaces = station.capacity - parked.length;
    station.available_vehicle_count = parked.filter(
      (v) => v.status === 'AVAILABLE' && v.battery_percent >= 30
    ).length;
  });
};

// GET /analytics/overview?from_date&to_date
export const getAnalyticsOverview = (params = {}) =>
  respond(() => {
    validateDateRange(params);
    recomputeStationCounters();
    return single({
      trip_count: 14,
      revenue: '1250000.00',
      average_trip_minutes: 48,
      customer_count: 11,
      vehicles_by_status: VEHICLE_STATUSES.map((status) => ({
        status,
        count: db.vehicles.filter((v) => v.status === status).length
      })),
      recent_tickets: [...db.tickets].sort(byCreatedDesc).slice(0, 5),
      near_full_stations: db.stations
        .filter((s) => s.status === 'ACTIVE' && s.available_spaces <= 1)
        .sort((a, b) => a.available_spaces - b.available_spaces || byIdAsc(a, b))
        .slice(0, 10)
    });
  });

// GET /admin/stations?status&q&page&page_size
export const listAdminStations = (params = {}) =>
  respond(() => {
    recomputeStationCounters();
    const q = (params.q || '').trim().toLowerCase();
    const items = db.stations
      .filter((s) => !params.status || s.status === params.status)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))
      .sort((a, b) => Number(b.id) - Number(a.id));
    return paginate(items, params);
  });

// GET /vehicles?station_id&type&status&page&page_size (quyền S/M: xem tất cả xe)
// `q` là bộ lọc mã/tên xe theo đặc tả màn hình M4.
export const listVehicles = (params = {}) =>
  respond(() => {
    const q = (params.q || '').trim().toLowerCase();
    const items = db.vehicles
      .filter((v) => !params.station_id || v.current_station_id === params.station_id)
      .filter((v) => !params.type || v.type === params.type)
      .filter((v) => !params.status || v.status === params.status)
      .filter((v) => !q || v.id === q || v.name.toLowerCase().includes(q))
      .sort(byCreatedDesc);
    return paginate(items, params);
  });

