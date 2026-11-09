import React, { useState } from 'react';
import { listAdminStations } from '../../services/mockApi';
import useApiQuery from '../../hooks/useApiQuery';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

const formatOperatingHours = (opensAt, closesAt) => {
  if (!opensAt && !closesAt) return '24/7';
  return `${opensAt} – ${closesAt}`;
};

const AdminStationList = () => {
  const [status, setStatus] = useState('');
  const { data: stations, meta, loading, error, reload } = useApiQuery(
    () => listAdminStations({ status: status || undefined, page: 1, page_size: 100 }),
    [status]
  );

  return (
    <div>
      <div className="page-header">
        <h2>Danh sách trạm</h2>
        {meta && <span className="muted">Tổng: {meta.total} trạm</span>}
      </div>

      <div className="filter-bar">
        <label className="form-field">
          <span>Trạng thái</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
      </div>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && stations && stations.length === 0 && (
        <EmptyState
          title="Không có trạm phù hợp"
          hint="Thử chọn trạng thái khác hoặc chọn 'Tất cả'."
          action={<button type="button" className="btn" onClick={() => setStatus('')}>Xem tất cả</button>}
        />
      )}
      {!loading && !error && stations && stations.length > 0 && (
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
              {stations.map((station) => (
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
      )}
    </div>
  );
};

export default AdminStationList;
