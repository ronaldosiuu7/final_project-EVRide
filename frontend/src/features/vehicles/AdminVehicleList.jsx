import React from 'react';
import { listVehicles, listAdminStations } from '../../services/mockApi';
import useApiQuery from '../../hooks/useApiQuery';
import { formatVndCurrency } from '../../utils/mockData';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

const getVehicleStatusBadge = (status) => {
  if (status === 'AVAILABLE') return <span className="badge badge-success">AVAILABLE</span>;
  if (status === 'RESERVED') return <span className="badge badge-warning">RESERVED</span>;
  if (status === 'RENTED') return <span className="badge badge-warning">RENTED</span>;
  if (status === 'RETURN_PENDING') return <span className="badge badge-warning">RETURN_PENDING</span>;
  return <span className="badge badge-danger">{status}</span>;
};

const getStationDisplay = (currentStationId, stations) => {
  if (currentStationId === null) return 'Không ở trạm';
  const found = (stations || []).find((s) => s.id === currentStationId);
  return found ? `${found.name} (#${found.id})` : `#${currentStationId}`;
};

const AdminVehicleList = () => {
  const vehiclesQuery = useApiQuery(() => listVehicles({ page: 1, page_size: 100 }), []);
  const stationsQuery = useApiQuery(() => listAdminStations({ page: 1, page_size: 100 }), []);

  const loading = vehiclesQuery.loading || stationsQuery.loading;
  const error = vehiclesQuery.error || stationsQuery.error;
  const vehicles = vehiclesQuery.data;
  const reload = () => {
    vehiclesQuery.reload();
    stationsQuery.reload();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Danh sách ô tô điện</h2>
        {vehiclesQuery.meta && <span className="muted">Tổng: {vehiclesQuery.meta.total} xe</span>}
      </div>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && vehicles && vehicles.length === 0 && (
        <EmptyState
          title="Chưa có xe nào"
          hint="Quản lý (MANAGER) thêm xe mới để xe xuất hiện trong danh sách."
        />
      )}
      {!loading && !error && vehicles && vehicles.length > 0 && (
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
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td>#{vehicle.id}</td>
                  <td>{vehicle.name}</td>
                  <td>{vehicle.type}</td>
                  <td>{vehicle.battery_percent}%</td>
                  <td>{getVehicleStatusBadge(vehicle.status)}</td>
                  <td>{getStationDisplay(vehicle.current_station_id, stationsQuery.data)}</td>
                  <td>{formatVndCurrency(vehicle.first_30_minutes_price)}</td>
                  <td>{formatVndCurrency(vehicle.extra_minute_price)}</td>
                  <td>{formatVndCurrency(vehicle.deposit_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminVehicleList;
