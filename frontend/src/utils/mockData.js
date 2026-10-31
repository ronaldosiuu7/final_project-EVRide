export const mockStations = [
  {
    id: "1",
    name: "Trạm Cầu Giấy",
    address: "144 Xuân Thủy, Cầu Giấy, Hà Nội",
    latitude: 21.0368,
    longitude: 105.7826,
    capacity: 3,
    opens_at: null,
    closes_at: null,
    status: "ACTIVE",
    occupied_spaces: 2,
    available_spaces: 1,
    available_vehicle_count: 1
  },
  {
    id: "2",
    name: "Trạm Thanh Xuân",
    address: "334 Nguyễn Trãi, Thanh Xuân, Hà Nội",
    latitude: 20.9958,
    longitude: 105.8085,
    capacity: 12,
    opens_at: "06:00:00",
    closes_at: "22:00:00",
    status: "ACTIVE",
    occupied_spaces: 2,
    available_spaces: 10,
    available_vehicle_count: 1
  },
  {
    id: "3",
    name: "Trạm Hoàn Kiếm",
    address: "19 Lê Thánh Tông, Hoàn Kiếm, Hà Nội",
    latitude: 21.0245,
    longitude: 105.8589,
    capacity: 8,
    opens_at: "06:30:00",
    closes_at: "21:30:00",
    status: "INACTIVE",
    occupied_spaces: 0,
    available_spaces: 8,
    available_vehicle_count: 0
  }
];

export const mockVehicles = [
  {
    id: "101",
    current_station_id: "1",
    name: "VinFast VF 3 - 30K-102.34",
    type: "MINI_SUV",
    battery_percent: 92,
    status: "AVAILABLE",
    daily_price: "600000.00",
    deposit_amount: "3000000.00",
    created_at: "2026-10-15T08:00:00Z"
  },
  {
    id: "102",
    current_station_id: "1",
    name: "VinFast VF 5 Plus - 30K-554.12",
    type: "A_SUV",
    battery_percent: 85,
    status: "RESERVED",
    daily_price: "800000.00",
    deposit_amount: "5000000.00",
    created_at: "2026-10-16T09:15:00Z"
  },
  {
    id: "103",
    current_station_id: null,
    name: "VinFast VF e34 - 30K-889.01",
    type: "C_SUV",
    battery_percent: 64,
    status: "RENTED",
    daily_price: "1100000.00",
    deposit_amount: "7000000.00",
    created_at: "2026-10-17T10:30:00Z"
  },
  {
    id: "104",
    current_station_id: "2",
    name: "VinFast VF 8 Eco - 30K-332.79",
    type: "D_SUV",
    battery_percent: 18,
    status: "MAINTENANCE",
    daily_price: "1500000.00",
    deposit_amount: "10000000.00",
    created_at: "2026-10-18T14:20:00Z"
  },
  {
    id: "105",
    current_station_id: "2",
    name: "VinFast VF 5 Plus - 30K-991.56",
    type: "A_SUV",
    battery_percent: 98,
    status: "AVAILABLE",
    daily_price: "800000.00",
    deposit_amount: "5000000.00",
    created_at: "2026-10-19T07:45:00Z"
  }
];

export const mockRecentTickets = [
  {
    id: "701",
    rental_id: "501",
    created_by: "20",
    assigned_to: "5",
    title: "Cảnh báo áp suất lốp trước bên phụ",
    description: "Xe báo đèn cảnh báo áp suất lốp khi đang di chuyển trên đường vành đai.",
    status: "IN_PROGRESS",
    created_at: "2026-10-21T02:15:00Z"
  },
  {
    id: "702",
    rental_id: "500",
    created_by: "21",
    assigned_to: null,
    title: "Cổng sạc tại xe nhận diện chậm",
    description: "Cắm sạc tại trạm mất khoảng 2 phút mới bắt đầu nhận điện.",
    status: "OPEN",
    created_at: "2026-10-20T16:40:00Z"
  }
];

const statusOrder = ["AVAILABLE", "RESERVED", "RENTED", "MAINTENANCE"];

export const mockAnalyticsOverviewResponse = {
  data: {
    trip_count: 14,
    revenue: "12400000.00",
    average_trip_minutes: 185,
    customer_count: 11,
    vehicles_by_status: statusOrder.map((st) => ({
      status: st,
      count: mockVehicles.filter((v) => v.status === st).length
    })),
    recent_tickets: mockRecentTickets,
    near_full_stations: mockStations
      .filter((s) => s.status === "ACTIVE" && s.available_spaces <= 1)
      .sort((a, b) => a.available_spaces - b.available_spaces || Number(a.id) - Number(b.id))
      .slice(0, 10)
  },
  meta: {
    request_id: "req_overview_mock_01",
    server_time: "2026-10-21T03:00:00Z"
  }
};

export const formatVndCurrency = (decimalString) => {
  if (decimalString === null || decimalString === undefined) return "—";
  const numericValue = Number(decimalString);
  return `${numericValue.toLocaleString("vi-VN")} ₫`;
};