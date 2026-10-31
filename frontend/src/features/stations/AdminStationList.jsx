import React from 'react';
import { mockStations } from '../../utils/mockData';

const formatOperatingHours = (opensAt, closesAt) => {
  if (!opensAt && !closesAt) return '24/7';
  return `${opensAt} – ${closesAt}`;
};

const AdminStationList = () => {
  return (
    <div>
      <h2>Danh sách trạm</h2>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên trạm</th>
              <th>Địa chỉ</th>
              <th>Tọa độ</th>
              <th>Giờ mở cửa</th>
              <th>Đang đỗ / Sức chứa</th>
              <th>Chỗ trống</th>
              <th>Xe có thể đặt</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {mockStations.map((station) => (
              <tr key={station.id}>
                <td>#{station.id}</td>
                <td>{station.name}</td>
                <td>{station.address}</td>
                <td>{station.latitude}, {station.longitude}</td>
                <td>{formatOperatingHours(station.opens_at, station.closes_at)}</td>
                <td>{station.occupied_spaces} / {station.capacity}</td>
                <td>{station.available_spaces}</td>
                <td>{station.available_vehicle_count}</td>
                <td>
                  <span className={station.status === 'ACTIVE' ? 'badge badge-success' : 'badge badge-danger'}>
                    {station.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminStationList;