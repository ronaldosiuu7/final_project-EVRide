import React, { useState } from 'react';
import { listVehicles, listAdminStations } from '../../services/mockApi';
import useApiQuery from '../../hooks/useApiQuery';
import { formatVndCurrency, VEHICLE_STATUSES } from '../../utils/mockData';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Pagination from '../../components/common/Pagination';
import VehicleMoveModal from './VehicleMoveModal';
import VehicleStatusModal from './VehicleStatusModal';

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

// Chỉ xe đang ở trạm và có trạng thái AVAILABLE hoặc MAINTENANCE mới được điều chuyển hoặc đổi trạng thái.
const canOperateVehicle = (vehicle) =>
  vehicle.current_station_id !== null && ['AVAILABLE', 'MAINTENANCE'].includes(vehicle.status);

const AdminVehicleList = () => {
  const [stationId, setStationId] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const [movingVehicle, setMovingVehicle] = useState(null);
  const [togglingVehicle, setTogglingVehicle] = useState(null);

  const stationsQuery = useApiQuery(() => listAdminStations({ page: 1, page_size: 100 }), []);
  const vehiclesQuery = useApiQuery(
    () =>
      listVehicles({
        station_id: stationId || undefined,
        status: status || undefined,
        type: type || undefined,
        q: query || undefined,
        page,
        page_size: pageSize
      }),
    [stationId, status, type, query, page, pageSize]
  );

  const loading = vehiclesQuery.loading || stationsQuery.loading;
  const error = vehiclesQuery.error || stationsQuery.error;
  const vehicles = vehiclesQuery.data;

  const reloadAll = () => {
    vehiclesQuery.reload();
    stationsQuery.reload();
  };

  const resetFilters = () => {
    setStationId('');
    setStatus('');
    setType('');
    setQuery('');
    setPage(1);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Danh sách ô tô điện (M4)</h2>
        {vehiclesQuery.meta && <span className="muted">Tổng: {vehiclesQuery.meta.total} xe</span>}
      </div>

      <div className="filter-bar">
        <label className="form-field">
          <span>Tìm mã hoặc tên xe</span>
          <input
            type="search"
            placeholder="Ví dụ: 101 hoặc VF 5..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="form-field">
          <span>Trạm hiện tại</span>
          <select
            value={stationId}
            onChange={(e) => {
              setStationId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạm</option>
            {(stationsQuery.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} - {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Trạng thái</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            {VEHICLE_STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Phân khúc</span>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            <option value="CITY">CITY</option>
            <option value="LONG_RANGE">LONG_RANGE</option>
          </select>
        </label>
        <div className="filter-actions">
          <button type="button" className="btn" onClick={resetFilters}>
            Xóa lọc
          </button>
        </div>
      </div>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState error={error} onRetry={reloadAll} />}
      {!loading && !error && vehicles && vehicles.length === 0 && (
        <EmptyState
          title="Không tìm thấy xe phù hợp"
          hint="Thử xóa bộ lọc hoặc đổi từ khóa tìm kiếm."
          action={<button type="button" className="btn" onClick={resetFilters}>Xóa bộ lọc</button>}
        />
      )}
      {!loading && !error && vehicles && vehicles.length > 0 && (
        <>
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
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => {
                  const operable = canOperateVehicle(vehicle);
                  const lowBattery = vehicle.battery_percent < 30;
                  return (
                    <tr key={vehicle.id}>
                      <td>#{vehicle.id}</td>
                      <td>{vehicle.name}</td>
                      <td>{vehicle.type}</td>
                      <td>
                        <span className={lowBattery ? 'battery-low' : ''}>
                          {vehicle.battery_percent}%
                        </span>
                        {lowBattery && (
                          <div className="muted" title="Xe dưới 30% pin không đủ điều kiện đặt hoặc nhận xe">
                            &lt; 30% (chặn thuê)
                          </div>
                        )}
                      </td>
                      <td>{getVehicleStatusBadge(vehicle.status)}</td>
                      <td>{getStationDisplay(vehicle.current_station_id, stationsQuery.data)}</td>
                      <td>{formatVndCurrency(vehicle.first_30_minutes_price)}</td>
                      <td>{formatVndCurrency(vehicle.extra_minute_price)}</td>
                      <td>{formatVndCurrency(vehicle.deposit_amount)}</td>
                      <td>
                        <div className="action-group">
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={!operable}
                            title={
                              operable
                                ? 'Điều chuyển xe sang trạm khác'
                                : 'Chỉ điều chuyển được xe AVAILABLE/MAINTENANCE đang ở trạm'
                            }
                            onClick={() => setMovingVehicle(vehicle)}
                          >
                            Điều chuyển
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={!operable}
                            title={
                              operable
                                ? 'Chuyển đổi giữa AVAILABLE và MAINTENANCE'
                                : 'Chỉ đổi trạng thái khi xe đang ở trạm và không có lượt thuê/giữ chỗ'
                            }
                            onClick={() => setTogglingVehicle(vehicle)}
                          >
                            {vehicle.status === 'MAINTENANCE' ? 'Mở lại xe' : 'Đưa bảo trì'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            meta={vehiclesQuery.meta}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      {movingVehicle && (
        <VehicleMoveModal
          vehicle={movingVehicle}
          stations={stationsQuery.data}
          onClose={() => setMovingVehicle(null)}
          onSuccess={() => {
            setMovingVehicle(null);
            reloadAll();
          }}
        />
      )}

      {togglingVehicle && (
        <VehicleStatusModal
          vehicle={togglingVehicle}
          onClose={() => setTogglingVehicle(null)}
          onSuccess={() => {
            setTogglingVehicle(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
};

export default AdminVehicleList;
