import React from 'react';
import { mockVehicles, mockStations, formatVndCurrency } from '../../utils/mockData';

const getVehicleStatusBadge = (status) => {
  if (status === 'AVAILABLE') return <span className="badge badge-success">AVAILABLE</span>;
  if (status === 'RESERVED') return <span className="badge badge-warning">RESERVED</span>;
  if (status === 'RENTED') return <span className="badge badge-warning">RENTED</span>;
  if (status === 'RETURN_PENDING') return <span className="badge badge-warning">RETURN_PENDING</span>;
  return <span className="badge badge-danger">{status}</span>;
};

const getStationDisplay = (currentStationId) => {
  if (currentStationId === null) return 'Không ở trạm';
  const found = mockStations.find((s) => s.id === currentStationId);
  return found ? `${found.name} (#${found.id})` : `#${currentStationId}`;
};

const AdminVehicleList = () => {
  return (
    <div>
      <h2>Danh sách ô tô điện</h2>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên xe</th>
              <th>Phân khúc</th>
              <th>Pin</th>
              <th>Trạng thái</th>
              <th>Trạm hiện tại</th>
              <th>Giá 30 phút đầu</th>
              <th>Giá mỗi phút thêm</th>
              <th>Tiền cọc</th>
            </tr>
          </thead>
          <tbody>
            {mockVehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>#{vehicle.id}</td>
                <td>{vehicle.name}</td>
                <td>{vehicle.type}</td>
                <td>{vehicle.battery_percent}%</td>
                <td>{getVehicleStatusBadge(vehicle.status)}</td>
                <td>{getStationDisplay(vehicle.current_station_id)}</td>
                <td>{formatVndCurrency(vehicle.first_30_minutes_price)}</td>
                <td>{formatVndCurrency(vehicle.extra_minute_price)}</td>
                <td>{formatVndCurrency(vehicle.deposit_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminVehicleList;