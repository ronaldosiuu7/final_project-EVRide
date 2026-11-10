import React, { useState } from 'react';
import { listAdminStations } from '../../services/mockApi';
import useApiQuery from '../../hooks/useApiQuery';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Pagination from '../../components/common/Pagination';

const formatOperatingHours = (opensAt, closesAt) => {
  if (!opensAt && !closesAt) return '24/7';
  return `${opensAt} – ${closesAt}`;
};

const AdminStationList = () => {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const { data: stations, meta, loading, error, reload } = useApiQuery(
    () =>
      listAdminStations({
        status: status || undefined,
        q: query || undefined,
        page,
        page_size: pageSize
      }),
    [status, query, page, pageSize]
  );

  const resetFilters = () => {
    setStatus('');
    setQuery('');
    setPage(1);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Danh sách trạm (M4)</h2>
        {meta && <span className="muted">Tổng: {meta.total} trạm</span>}
      </div>

      <div className="filter-bar">
        <label className="form-field">
          <span>Tìm tên hoặc địa chỉ trạm</span>
          <input
            type="search"
            placeholder="Ví dụ: Cầu Giấy, Xuân Thủy..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
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
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
        <div className="filter-actions">
          <button type="button" className="btn" onClick={resetFilters}>
            Xóa lọc
          </button>
        </div>
      </div>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && stations && stations.length === 0 && (
        <EmptyState
          title="Không có trạm phù hợp"
          hint="Thử xóa bộ lọc hoặc đổi từ khóa tìm kiếm."
          action={<button type="button" className="btn" onClick={resetFilters}>Xóa bộ lọc</button>}
        />
      )}
      {!loading && !error && stations && stations.length > 0 && (
        <>
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

          <Pagination
            meta={meta}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
};

export default AdminStationList;
