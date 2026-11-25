import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { listStations } from '../../services/fleetApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  Pagination,
  SelectField,
  TextField,
} from '../../components/ui/index.js';
import StationCard from '../../components/customer/StationCard.jsx';
import {
  applyFilterPatch,
  buildStationQueryParams,
  getSystemTotalFromMeta,
} from '../../utils/fleetDisplay.js';

const PAGE_SIZE_OPTIONS = [12, 24, 48];

function readInitialFilters(searchParams) {
  const pageNum = Number(searchParams.get('page'));
  return {
    q: searchParams.get('q') || '',
    hasAvailableVehicles: searchParams.get('has_available_vehicles') || '',
    hasReturnSpace: searchParams.get('has_return_space') || '',
    page: Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1,
    pageSize: 12,
  };
}

export default function CustomerStationListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => readInitialFilters(searchParams));
  const debouncedQ = useDebouncedValue(filters.q, 300);

  // Đồng bộ URL khi người dùng tìm hoặc đổi trang (tránh ghi đè state nếu URL không đổi).
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedQ.trim()) next.set('q', debouncedQ.trim());
    if (filters.hasAvailableVehicles) next.set('has_available_vehicles', filters.hasAvailableVehicles);
    if (filters.hasReturnSpace) next.set('has_return_space', filters.hasReturnSpace);
    if (filters.page > 1) next.set('page', String(filters.page));

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    debouncedQ,
    filters.hasAvailableVehicles,
    filters.hasReturnSpace,
    filters.page,
    searchParams,
    setSearchParams,
  ]);

  const queryParams = buildStationQueryParams({
    q: debouncedQ,
    hasAvailableVehicles: filters.hasAvailableVehicles,
    hasReturnSpace: filters.hasReturnSpace,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  const { data, meta, loading, error, reload } = useApiQuery(
    ({ signal }) => listStations(queryParams, { signal }),
    [
      queryParams.q || '',
      queryParams.has_available_vehicles || '',
      queryParams.has_return_space || '',
      queryParams.page,
      queryParams.page_size,
    ]
  );

  const stations = Array.isArray(data) ? data : [];
  const totalStations = getSystemTotalFromMeta(meta);
  const hasActiveFilters = Boolean(
    filters.q.trim() || filters.hasAvailableVehicles || filters.hasReturnSpace
  );

  const handleResetFilters = () => {
    setFilters((prev) => ({
      ...prev,
      q: '',
      hasAvailableVehicles: '',
      hasReturnSpace: '',
      page: 1,
    }));
  };

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <h1 className="customer-page-title">Danh sách trạm xe máy điện</h1>
          <p className="customer-page-subtitle">
            Tra cứu trạm theo tên hoặc địa chỉ, lọc nhanh trạm đang có xe sẵn sàng hoặc còn chỗ trả trống.
          </p>
        </div>
        <Link to="/vehicles" className="btn btn-secondary btn-sm">
          Tìm theo xe máy điện →
        </Link>
      </div>

      <FilterBar onReset={hasActiveFilters ? handleResetFilters : undefined} resetLabel="Xóa bộ lọc">
        <TextField
          label="Tìm trạm"
          type="search"
          placeholder="Tên trạm hoặc địa chỉ..."
          value={filters.q}
          onChange={(e) => setFilters((prev) => applyFilterPatch(prev, { q: e.target.value }))}
        />

        <SelectField
          label="Xe có thể thuê"
          value={filters.hasAvailableVehicles}
          onChange={(e) =>
            setFilters((prev) => applyFilterPatch(prev, { hasAvailableVehicles: e.target.value }))
          }
          options={[
            { value: '', label: 'Tất cả trạm' },
            { value: 'true', label: 'Có xe sẵn sàng' },
            { value: 'false', label: 'Chưa có xe sẵn sàng' },
          ]}
        />

        <SelectField
          label="Chỗ trả xe"
          value={filters.hasReturnSpace}
          onChange={(e) =>
            setFilters((prev) => applyFilterPatch(prev, { hasReturnSpace: e.target.value }))
          }
          options={[
            { value: '', label: 'Tất cả trạm' },
            { value: 'true', label: 'Còn chỗ trả trống' },
            { value: 'false', label: 'Đã hết chỗ trả' },
          ]}
        />
      </FilterBar>

      {!loading && !error && (
        <div className="customer-results-bar">
          <span>
            {totalStations !== null ? (
              <>
                Tìm thấy <strong>{totalStations}</strong> trạm phù hợp
                {stations.length > 0 && totalStations > stations.length
                  ? ` (đang hiển thị ${stations.length} trạm ở trang này)`
                  : ''}
              </>
            ) : (
              'Đã tải danh sách trạm'
            )}
          </span>
          <Button size="sm" variant="ghost" onClick={reload}>
            Làm mới
          </Button>
        </div>
      )}

      {loading && <LoadingState message="Đang tìm trạm xe..." />}

      {!loading && error && (
        <ErrorState
          error={error}
          onRetry={reload}
          title="Không tải được danh sách trạm"
          hideCode
        />
      )}

      {!loading && !error && stations.length === 0 && (
        <EmptyState
          title={hasActiveFilters ? 'Không tìm thấy trạm nào khớp bộ lọc' : 'Chưa có trạm nào đang hoạt động'}
          hint={
            hasActiveFilters
              ? 'Hãy thử bỏ bớt điều kiện lọc hoặc tìm với từ khóa khác.'
              : 'Vui lòng tải lại sau ít phút.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="primary" onClick={handleResetFilters}>
                Xóa bộ lọc
              </Button>
            ) : (
              <Button variant="secondary" onClick={reload}>
                Tải lại
              </Button>
            )
          }
        />
      )}

      {!loading && !error && stations.length > 0 && (
        <>
          <div className="customer-card-grid">
            {stations.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </div>

          <Pagination
            meta={meta}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={(nextPage) => setFilters((prev) => ({ ...prev, page: nextPage }))}
            onPageSizeChange={(nextSize) =>
              setFilters((prev) => ({ ...prev, pageSize: nextSize, page: 1 }))
            }
          />
        </>
      )}
    </div>
  );
}
