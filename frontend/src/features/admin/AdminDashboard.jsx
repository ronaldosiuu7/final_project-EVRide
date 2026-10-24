import React from 'react';
import {
  mockAnalyticsOverviewResponse,
  mockVehicles,
  mockStations,
  formatVndCurrency
} from '../../utils/mockData';

const AdminDashboard = () => {
  const overview = mockAnalyticsOverviewResponse.data;
  const activeStationCount = mockStations.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div>
      <h2>Tổng quan hệ thống</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <h4>Tổng số xe</h4>
          <p>{mockVehicles.length}</p>
        </div>
        <div className="stat-card">
          <h4>Tổng số trạm (Đang hoạt động)</h4>
          <p>{mockStations.length} ({activeStationCount})</p>
        </div>
        <div className="stat-card">
          <h4>Số chuyến đã bắt đầu</h4>
          <p>{overview.trip_count}</p>
        </div>
        <div className="stat-card">
          <h4>Doanh thu</h4>
          <p>{formatVndCurrency(overview.revenue)}</p>
        </div>
        <div className="stat-card">
          <h4>Thời lượng chuyến trung bình</h4>
          <p>{overview.average_trip_minutes} phút</p>
        </div>
        <div className="stat-card">
          <h4>Số khách thuê</h4>
          <p>{overview.customer_count}</p>
        </div>
      </div>

      <h3 style={{ marginTop: '28px' }}>Thống kê xe theo trạng thái</h3>
      <div className="stats-grid">
        {overview.vehicles_by_status.map((item) => (
          <div className="stat-card" key={item.status}>
            <h4>{item.status}</h4>
            <p>{item.count} xe</p>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: '28px' }}>Trạm sắp đầy chỗ đỗ</h3>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID Trạm</th>
              <th>Tên trạm</th>
              <th>Sức chứa</th>
              <th>Đang đỗ</th>
              <th>Chỗ trống</th>
            </tr>
          </thead>
          <tbody>
            {overview.near_full_stations.map((station) => (
              <tr key={station.id}>
                <td>#{station.id}</td>
                <td>{station.name}</td>
                <td>{station.capacity}</td>
                <td>{station.occupied_spaces}</td>
                <td>
                  <span className="badge badge-warning">{station.available_spaces} chỗ</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: '28px' }}>Sự cố gần đây</h3>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã phiếu</th>
              <th>Mã chuyến thuê</th>
              <th>Tiêu đề</th>
              <th>Trạng thái</th>
              <th>Thời gian tạo</th>
            </tr>
          </thead>
          <tbody>
            {overview.recent_tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>#{ticket.id}</td>
                <td>#{ticket.rental_id}</td>
                <td>{ticket.title}</td>
                <td>
                  <span className="badge badge-warning">{ticket.status}</span>
                </td>
                <td>{ticket.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;