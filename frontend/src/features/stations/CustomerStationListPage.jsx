import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { listStations } from '../../services/fleetApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  Pagination,
  SelectField,
  TextField,
} from '../../components/ui/index.js';
import StationCard, { StationGridSkeleton } from '../../components/customer/StationCard.jsx';
import {
  MapPinIcon,
  RefreshIcon,
  ScooterIcon,
} from '../../components/customer/CustomerIcons.jsx';
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

  const toggleAvailableOnly = () => {
    setFilters((prev) =>
      applyFilterPatch(prev, {
        hasAvailableVehicles: prev.hasAvailableVehicles === 'true' ? '' : 'true',
      })
    );
  };

  const toggleReturnSpaceOnly = () => {
    setFilters((prev) =>
      applyFilterPatch(prev, {
        hasReturnSpace: prev.hasReturnSpace === 'true' ? '' : 'true',
      })
    );
  };

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <span className="customer-page-eyebrow">
            <MapPinIcon size={14} />
            <span>Mạng lưới trạm hoạt động</span>
          </span>
          <h1 className="customer-page-title">Danh sách trạm xe máy điện</h1>
          <p className="customer-page-subtitle">
            Tra cứu theo tên trạm hoặc địa chỉ, kiểm tra khung giờ mở cửa, số xe đủ điều kiện đặt và số chỗ trả còn trống tại từng điểm.
          </p>
        </div>
        <Link to="/vehicles" className="btn btn-secondary">
          <ScooterIcon size={17} />
          <span>Tìm theo mẫu xe</span>
        </Link>
      </div>

      <form
        className="station-filter-panel"
        role="search"
        aria-label="Bộ lọc danh sách trạm"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="station-filter-grid">
          <TextField
            id="station-search-q"
            label="Tên trạm hoặc địa chỉ"
            type="search"
            placeholder="Ví dụ: Hoàn Kiếm, Hồ Tây, Cầu Giấy..."
            value={filters.q}
            onChange={(e) => setFilters((prev) => applyFilterPatch(prev, { q: e.target.value }))}
          />

          <SelectField
            id="station-filter-available"
            label="Xe có thể thuê"
            value={filters.hasAvailableVehicles}
            onChange={(e) =>
              setFilters((prev) =>
                applyFilterPatch(prev, { hasAvailableVehicles: e.target.value })
              )
            }
            options={[
              { value: '', label: 'Tất cả trạm' },
              { value: 'true', label: 'Đang có xe sẵn sàng' },
              { value: 'false', label: 'Tạm hết xe sẵn sàng' },
            ]}
          />

          <SelectField
            id="station-filter-return"
            label="Chỗ trả xe"
            value={filters.hasReturnSpace}
            onChange={(e) =>
              setFilters((prev) =>
                applyFilterPatch(prev, { hasReturnSpace: e.target.value })
              )
            }
            options={[
              { value: '', label: 'Tất cả trạm' },
              { value: 'true', label: 'Còn chỗ trả trống' },
              { value: 'false', label: 'Đã đầy chỗ đỗ' },
            ]}
          />

          <div className="station-filter-actions">
            {hasActiveFilters && (
              <Button type="button" variant="secondary" onClick={handleResetFilters}>
                Xóa bộ lọc
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={reload} disabled={loading}>
              <RefreshIcon size={15} />
              <span>Làm mới</span>
            </Button>
          </div>
        </div>

        <div className="station-quick-toggles">
          <div className="station-chip-group" role="group" aria-label="Bộ lọc nhanh tình trạng trạm">
            <span className="station-chip-label">Lọc nhanh:</span>
            <button
              type="button"
              className="station-filter-chip"
              aria-pressed={filters.hasAvailableVehicles === 'true'}
              onClick={toggleAvailableOnly}
            >
              Đang có xe sẵn sàng
            </button>
            <button
              type="button"
              className="station-filter-chip"
              aria-pressed={filters.hasReturnSpace === 'true'}
              onClick={toggleReturnSpaceOnly}
            >
              Còn chỗ trả trống
            </button>
          </div>

          {!loading && !error && (
            <div className="customer-results-bar">
              <span>
                {totalStations !== null ? (
                  <>
                    Tìm thấy <strong>{totalStations}</strong> trạm phù hợp
                    {stations.length > 0 && totalStations > stations.length
                      ? ` · Hiển thị ${stations.length} trạm ở trang ${filters.page}`
                      : ''}
                  </>
                ) : (
                  'Đã tải danh sách trạm'
                )}
              </span>
            </div>
          )}
        </div>
      </form>

      {loading && <StationGridSkeleton count={6} label="Đang tìm trạm xe phù hợp..." />}

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
          title={
            hasActiveFilters
              ? 'Không tìm thấy trạm nào khớp điều kiện lọc'
              : 'Chưa có trạm nào đang hoạt động'
          }
          hint={
            hasActiveFilters
              ? 'Hãy thử bỏ bớt điều kiện lọc hoặc tìm với tên khu vực khác.'
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
