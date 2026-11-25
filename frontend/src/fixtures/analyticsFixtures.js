// Fixture đúng theo hợp đồng API & đặc tả cho 5 API báo cáo phân tích chưa triển khai ở Backend V1.
// LƯU Ý: 3 API doanh thu/tài chính (/analytics/revenue, /financial-summary, /revenue-details)
// luôn gọi dữ liệu thật từ backend, KHÔNG sử dụng file fixture này.

export const OVERVIEW_FIXTURE = {
  trip_count: 28,
  revenue: '1845000.00',
  average_trip_minutes: 42,
  customer_count: 19,
  vehicles_by_status: [
    { status: 'AVAILABLE', count: 12 },
    { status: 'RESERVED', count: 2 },
    { status: 'RENTED', count: 4 },
    { status: 'RETURN_PENDING', count: 1 },
    { status: 'MAINTENANCE', count: 2 },
    { status: 'SUSPECTED_STOLEN', count: 1 },
    { status: 'STOLEN', count: 0 },
  ],
  recent_tickets: [
    {
      id: '705',
      rental_id: '512',
      created_by: '990001',
      assigned_to: '990006',
      title: 'Phanh đĩa trước phát tiếng kêu nhẹ',
      description: 'Khách phản ánh tiếng kêu khi bóp phanh trước tại tốc độ thấp.',
      status: 'IN_PROGRESS',
      created_at: '2026-11-18T08:15:00Z',
    },
    {
      id: '704',
      rental_id: '509',
      created_by: '990002',
      assigned_to: null,
      title: 'Đèn báo xi-nhan sau nhấp nháy nhanh',
      description: 'Bóng xi-nhan sau bên phải nhấp nháy nhanh hơn bình thường.',
      status: 'OPEN',
      created_at: '2026-11-17T14:20:00Z',
    },
  ],
  near_full_stations: [
    {
      id: '991001',
      name: '[DEMO] Hoàn Kiếm',
      address: '1 Demo Street, Hoàn Kiếm, Hà Nội',
      capacity: 3,
      occupied_spaces: 3,
      available_spaces: 0,
      available_vehicle_count: 1,
      status: 'ACTIVE',
    },
    {
      id: '991002',
      name: '[DEMO] Ba Đình',
      address: '2 Demo Street, Ba Đình, Hà Nội',
      capacity: 4,
      occupied_spaces: 3,
      available_spaces: 1,
      available_vehicle_count: 2,
      status: 'ACTIVE',
    },
  ],
};

function build24HourItems(stations) {
  const items = [];
  for (const station of stations) {
    for (let hour = 0; hour < 24; hour += 1) {
      items.push({
        station_id: station.station_id,
        station_name: station.station_name,
        hour,
        rental_count: station.hourlyCounts[hour] || 0,
      });
    }
  }
  return items;
}

const PEAK_HOUR_STATIONS = [
  {
    station_id: '991001',
    station_name: '[DEMO] Hoàn Kiếm',
    hourlyCounts: { 7: 2, 8: 5, 9: 3, 12: 2, 17: 6, 18: 4, 19: 2 },
  },
  {
    station_id: '991002',
    station_name: '[DEMO] Ba Đình',
    hourlyCounts: { 8: 4, 9: 2, 11: 1, 17: 5, 18: 3 },
  },
  {
    station_id: '991003',
    station_name: '[DEMO] Cầu Giấy',
    hourlyCounts: { 7: 3, 8: 3, 13: 2, 16: 2, 17: 4, 20: 1 },
  },
];

const PEAK_ITEMS = build24HourItems(PEAK_HOUR_STATIONS);
const INCLUDED_PEAK_SUM = PEAK_ITEMS.reduce((acc, item) => acc + item.rental_count, 0);

// filtered_trip_count lớn hơn included_trip_count để minh họa trường hợp tổng phạm vi lọc > top 20 trạm.
export const PEAK_HOURS_FIXTURE = {
  items: PEAK_ITEMS,
  included_trip_count: INCLUDED_PEAK_SUM,
  filtered_trip_count: INCLUDED_PEAK_SUM + 6,
};

export const TOP_ROUTES_FIXTURE = {
  items: [
    {
      month: '2026-11',
      rank: 1,
      pickup_station_id: '991001',
      pickup_station_name: '[DEMO] Hoàn Kiếm',
      return_station_id: '991002',
      return_station_name: '[DEMO] Ba Đình',
      rental_count: 11,
    },
    {
      month: '2026-11',
      rank: 2,
      pickup_station_id: '991002',
      pickup_station_name: '[DEMO] Ba Đình',
      return_station_id: '991003',
      return_station_name: '[DEMO] Cầu Giấy',
      rental_count: 8,
    },
    {
      month: '2026-11',
      rank: 2,
      pickup_station_id: '991003',
      pickup_station_name: '[DEMO] Cầu Giấy',
      return_station_id: '991001',
      return_station_name: '[DEMO] Hoàn Kiếm',
      rental_count: 8,
    },
  ],
};

export const IDLE_TIME_FIXTURE = {
  items: [
    { station_id: '991003', station_name: '[DEMO] Cầu Giấy', average_idle_minutes: 215 },
    { station_id: '991002', station_name: '[DEMO] Ba Đình', average_idle_minutes: 142 },
    { station_id: '991001', station_name: '[DEMO] Hoàn Kiếm', average_idle_minutes: 68 },
  ],
  coverage: 'OBSERVED_RETURN_PICKUP_PAIRS',
};

export const INACTIVE_CUSTOMERS_FIXTURE = {
  as_of_date: '2026-11-19',
  days: 30,
  items: [
    {
      user_id: '990004',
      name: 'Pham Dung Demo',
      email: 'dung.customer@evride.test',
      balance: '450000.00',
    },
    {
      user_id: '990001',
      name: 'Nguyen An Demo',
      email: 'an.customer@evride.test',
      balance: '210000.00',
    },
    {
      user_id: '990003',
      name: 'Le Chi Demo',
      email: 'chi.customer@evride.test',
      balance: '210000.00',
    },
  ],
};
