import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import useApiQuery from '../../hooks/useApiQuery.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { listStations, listVehicles } from '../../services/fleetApi.js';
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
import VehicleCard from '../../components/customer/VehicleCard.jsx';
import ReserveVehicleModal from '../rentals/ReserveVehicleModal.jsx';
import {
  applyFilterPatch,
  buildVehicleQueryParams,
  getSystemTotalFromMeta,
} from '../../utils/fleetDisplay.js';

const PAGE_SIZE_OPTIONS = [12, 24, 48];

function readInitialFilters(searchParams) {
  const pageNum = Number(searchParams.get('page'));
  return {
    stationId: searchParams.get('station_id') || '',
    model: searchParams.get('model') || '',
    page: Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1,
    pageSize: 12,
  };
}

export default function CustomerVehicleListPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => readInitialFilters(searchParams));
  const [reserveVehicleTarget, setReserveVehicleTarget] = useState(null);
  const debouncedModel = useDebouncedValue(filters.model, 300);

  // Tải danh sách trạm để hiển thị bộ lọc chọn trạm và tên trạm trên thẻ xe (lỗi trạm không chặn danh sách xe).
  const stationsQuery = useApiQuery(
    ({ signal }) => listStations({ page: 1, page_size: 100 }, { signal }),
    []
  );

  const stationList = Array.isArray(stationsQuery.data) ? stationsQuery.data : [];
  const stationNameById = useMemo(() => {
    const map = new Map();
    for (const st of stationList) {
      if (st?.id) {
        map.set(String(st.id), st.name || `Trạm #${st.id}`);
      }
    }
    return map;
  }, [stationList]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.stationId) next.set('station_id', filters.stationId);
    if (debouncedModel.trim()) next.set('model', debouncedModel.trim());
    if (filters.page > 1) next.set('page', String(filters.page));

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters.stationId, debouncedModel, filters.page, searchParams, setSearchParams]);

  const queryParams = buildVehicleQueryParams({
    stationId: filters.stationId,
    model: debouncedModel,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  const { data, meta, loading, error, reload } = useApiQuery(
    ({ signal }) => listVehicles(queryParams, { signal }),
    [
      queryParams.station_id || '',
      queryParams.model || '',
      queryParams.page,
      queryParams.page_size,
    ]
  );

  const vehicles = Array.isArray(data) ? data : [];
  const totalVehicles = getSystemTotalFromMeta(meta);
  const hasActiveFilters = Boolean(filters.stationId || filters.model.trim());

  const stationOptions = useMemo(() => {
    const base = [{ value: '', label: 'Tất cả trạm đang mở' }];
    for (const st of stationList) {
      base.push({ value: String(st.id), label: st.name || `Trạm #${st.id}` });
    }
    if (filters.stationId && !stationNameById.has(filters.stationId)) {
      base.push({ value: filters.stationId, label: `Trạm #${filters.stationId}` });
    }
    return base;
  }, [stationList, filters.stationId, stationNameById]);

  const handleResetFilters = () => {
    setFilters((prev) => ({
      ...prev,
      stationId: '',
      model: '',
      page: 1,
    }));
  };

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <h1 className="customer-page-title">Tìm xe máy điện</h1>
          <p className="customer-page-subtitle">
            Xem toàn bộ xe máy điện đủ điều kiện thuê (pin từ 30% trở lên, tại trạm đang mở cửa) kèm giá 30 phút đầu, giá phút thêm và tiền cọc.
          </p>
        </div>
        <Link to="/stations" className="btn btn-secondary btn-sm">
          Xem theo trạm →
        </Link>
      </div>

      <FilterBar onReset={hasActiveFilters ? handleResetFilters : undefined} resetLabel="Xóa bộ lọc">
        <SelectField
          label="Trạm nhận xe"
          value={filters.stationId}
          onChange={(e) =>
            setFilters((prev) => applyFilterPatch(prev, { stationId: e.target.value }))
          }
          options={stationOptions}
        />

        <TextField
          label="Dòng xe (nhập chính xác tên dòng xe)"
          type="search"
          placeholder="Ví dụ: Klara S, Feliz S, Evo200..."
          value={filters.model}
          onChange={(e) =>
            setFilters((prev) => applyFilterPatch(prev, { model: e.target.value }))
          }
        />
      </FilterBar>

      {!loading && !error && (
        <div className="customer-results-bar">
          <span>
            {totalVehicles !== null ? (
              <>
                Tìm thấy <strong>{totalVehicles}</strong> xe máy điện có thể thuê
                {vehicles.length > 0 && totalVehicles > vehicles.length
                  ? ` (đang hiển thị ${vehicles.length} xe ở trang này)`
                  : ''}
              </>
            ) : (
              'Đã tải danh sách xe máy điện'
            )}
          </span>
          <Button size="sm" variant="ghost" onClick={reload}>
            Làm mới
          </Button>
        </div>
      )}

      {loading && <LoadingState message="Đang tìm xe máy điện..." />}

      {!loading && error && (
        <ErrorState
          error={error}
          onRetry={reload}
          title="Không tải được danh sách xe"
          hideCode
        />
      )}

      {!loading && !error && vehicles.length === 0 && (
        <EmptyState
          title={
            hasActiveFilters
              ? 'Không tìm thấy xe máy điện khớp bộ lọc'
              : 'Hiện chưa có xe máy điện nào sẵn sàng cho thuê'
          }
          hint={
            hasActiveFilters
              ? 'Hãy thử chọn lại tất cả trạm hoặc kiểm tra lại tên dòng xe đã nhập.'
              : 'Các xe có thể đang được thuê, sạc pin hoặc trạm đang ngoài giờ mở cửa.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="primary" onClick={handleResetFilters}>
                Xóa bộ lọc
              </Button>
            ) : (
              <Link to="/stations" className="btn btn-secondary">
                Xem danh sách trạm
              </Link>
            )
          }
        />
      )}

      {!loading && !error && vehicles.length > 0 && (
        <>
          <div className="customer-card-grid">
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                stationName={
                  vehicle.current_station_id
                    ? stationNameById.get(String(vehicle.current_station_id)) || null
                    : null
                }
                onReserve={
                  isAuthenticated && (user?.role === 'STAFF' || user?.role === 'MANAGER')
                    ? null
                    : (selected) => {
                        if (!isAuthenticated) {
                          navigate('/login', { state: { from: location } });
                          return;
                        }
                        setReserveVehicleTarget(selected);
                      }
                }
              />
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

      {reserveVehicleTarget && (
        <ReserveVehicleModal
          vehicle={reserveVehicleTarget}
          station={
            stationList.find(
              (st) => String(st.id) === String(reserveVehicleTarget.current_station_id)
            ) || null
          }
          onClose={() => setReserveVehicleTarget(null)}
        />
      )}
    </div>
  );
}
