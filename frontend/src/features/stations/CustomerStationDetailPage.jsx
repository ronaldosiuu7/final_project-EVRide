import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import useApiQuery from '../../hooks/useApiQuery.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { getStation, listStationVehicles } from '../../services/fleetApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  Pagination,
  StatusBadge,
  TextField,
} from '../../components/ui/index.js';
import VehicleCard from '../../components/customer/VehicleCard.jsx';
import ReserveVehicleModal from '../rentals/ReserveVehicleModal.jsx';
import {
  applyFilterPatch,
  buildVehicleQueryParams,
  formatCoordinatesDisplay,
  formatCountDisplay,
  formatStationHours,
  getStationCapacityCount,
  getStationOpenStatus,
  getStationRentableCount,
  getStationReturnSpaceCount,
  getSystemTotalFromMeta,
} from '../../utils/fleetDisplay.js';

const PAGE_SIZE_OPTIONS = [12, 24, 48];

export default function CustomerStationDetailPage() {
  const { stationId } = useParams();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [reserveVehicleTarget, setReserveVehicleTarget] = useState(null);
  const [vehicleFilters, setVehicleFilters] = useState({
    model: '',
    page: 1,
    pageSize: 12,
  });
  const debouncedModel = useDebouncedValue(vehicleFilters.model, 300);

  const stationQuery = useApiQuery(
    ({ signal }) => getStation(stationId, { signal }),
    [stationId],
    { enabled: Boolean(stationId) }
  );

  const vehicleQueryParams = buildVehicleQueryParams({
    model: debouncedModel,
    page: vehicleFilters.page,
    pageSize: vehicleFilters.pageSize,
  });

  const vehiclesQuery = useApiQuery(
    ({ signal }) => listStationVehicles(stationId, vehicleQueryParams, { signal }),
    [stationId, vehicleQueryParams.model || '', vehicleQueryParams.page, vehicleQueryParams.page_size],
    { enabled: Boolean(stationId) && Boolean(stationQuery.data) }
  );

  if (stationQuery.loading) {
    return <LoadingState message="Đang tải thông tin trạm..." />;
  }

  if (stationQuery.error) {
    const isNotFound = stationQuery.error.status === 404;
    return (
      <div className="customer-page">
        <nav className="customer-breadcrumb" aria-label="Đường dẫn">
          <Link to="/stations">Trạm xe</Link>
          <span aria-hidden="true">/</span>
          <span>Chi tiết trạm</span>
        </nav>

        {isNotFound ? (
          <EmptyState
            title="Không tìm thấy trạm xe này"
            hint="Trạm có thể đã tạm ngưng hoạt động hoặc đường dẫn không còn hợp lệ."
            action={
              <Link to="/stations" className="btn btn-primary">
                Quay lại danh sách trạm
              </Link>
            }
          />
        ) : (
          <ErrorState
            error={stationQuery.error}
            onRetry={stationQuery.reload}
            title="Không tải được thông tin trạm"
            hideCode
          />
        )}
      </div>
    );
  }

  const station = stationQuery.data;
  if (!station) {
    return (
      <EmptyState
        title="Không có dữ liệu trạm"
        action={
          <Link to="/stations" className="btn btn-primary">
            Quay lại danh sách trạm
          </Link>
        }
      />
    );
  }

  const openStatus = getStationOpenStatus(station);
  const hoursText = formatStationHours(station.opens_at, station.closes_at);
  const rentableCount = getStationRentableCount(station);
  const returnSpaceCount = getStationReturnSpaceCount(station);
  const capacityCount = getStationCapacityCount(station);
  const coordinatesText = formatCoordinatesDisplay(station.latitude, station.longitude);

  const vehicles = Array.isArray(vehiclesQuery.data) ? vehiclesQuery.data : [];
  const totalVehicles = getSystemTotalFromMeta(vehiclesQuery.meta);
  const hasModelFilter = Boolean(vehicleFilters.model.trim());

  const handleResetModel = () => {
    setVehicleFilters((prev) => ({ ...prev, model: '', page: 1 }));
  };

  return (
    <div className="customer-page">
      <nav className="customer-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <Link to="/stations">Trạm xe</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{station.name || 'Chi tiết trạm'}</span>
      </nav>

      <section className="station-detail-panel" aria-labelledby="station-detail-title">
        <div className="station-detail-top">
          <div>
            <h1 id="station-detail-title" className="customer-page-title">
              {station.name || 'Trạm xe EVRide'}
            </h1>
            <p className="customer-page-subtitle">
              {station.address || 'Chưa cập nhật địa chỉ'}
            </p>
          </div>
          <StatusBadge label={openStatus.label} tone={openStatus.tone} />
        </div>

        <div className="station-detail-stats">
          <div className="station-metric-box">
            <span className="customer-meta-label">Giờ hoạt động</span>
            <strong className="customer-meta-value">{hoursText}</strong>
          </div>

          <div className="station-metric-box">
            <span className="customer-meta-label">Xe có thể thuê</span>
            <strong className={`station-metric-number ${rentableCount === 0 ? 'is-zero' : ''}`}>
              {formatCountDisplay(rentableCount, 'xe')}
            </strong>
          </div>

          <div className="station-metric-box">
            <span className="customer-meta-label">Chỗ trả trống</span>
            <strong className={`station-metric-number ${returnSpaceCount === 0 ? 'is-zero' : ''}`}>
              {formatCountDisplay(returnSpaceCount, 'chỗ')}
            </strong>
          </div>

          {capacityCount !== null && (
            <div className="station-metric-box">
              <span className="customer-meta-label">Sức chứa trạm</span>
              <strong className="customer-meta-value">{formatCountDisplay(capacityCount, 'chỗ')}</strong>
            </div>
          )}

          <div className="station-metric-box">
            <span className="customer-meta-label">Tọa độ</span>
            <strong className="customer-meta-value">{coordinatesText}</strong>
          </div>
        </div>

        {openStatus.isOpen === false && (
          <div className="alert alert-warning" role="status">
            Trạm hiện đang ngoài khung giờ hoạt động ({hoursText}). Bạn có thể xem thông tin trạm và quay lại đặt xe khi trạm mở cửa.
          </div>
        )}
      </section>

      <section id="station-vehicles" className="customer-page" aria-labelledby="station-vehicles-heading">
        <div className="customer-section-head">
          <div>
            <h2 id="station-vehicles-heading">Xe máy điện sẵn sàng tại trạm</h2>
            <p className="customer-page-subtitle">
              Chỉ hiển thị xe sẵn sàng cho thuê có mức pin từ 30% trở lên và không trong lịch bảo trì.
            </p>
          </div>
          <Link to={`/vehicles?station_id=${encodeURIComponent(String(station.id))}`} className="btn btn-sm btn-secondary">
            Mở ở trang Tìm xe →
          </Link>
        </div>

        <FilterBar onReset={hasModelFilter ? handleResetModel : undefined} resetLabel="Xóa lọc">
          <TextField
            label="Lọc theo dòng xe (nhập chính xác tên dòng xe)"
            type="search"
            placeholder="Ví dụ: Klara S, Evo200..."
            value={vehicleFilters.model}
            onChange={(e) =>
              setVehicleFilters((prev) => applyFilterPatch(prev, { model: e.target.value }))
            }
          />
        </FilterBar>

        {!vehiclesQuery.loading && !vehiclesQuery.error && (
          <div className="customer-results-bar">
            <span>
              {totalVehicles !== null ? (
                <>
                  Có <strong>{totalVehicles}</strong> xe phù hợp tại trạm này
                </>
              ) : (
                'Đã tải danh sách xe tại trạm'
              )}
            </span>
            <Button size="sm" variant="ghost" onClick={vehiclesQuery.reload}>
              Làm mới
            </Button>
          </div>
        )}

        {vehiclesQuery.loading && <LoadingState message="Đang tải danh sách xe tại trạm..." />}

        {!vehiclesQuery.loading && vehiclesQuery.error && (
          <ErrorState
            error={vehiclesQuery.error}
            onRetry={vehiclesQuery.reload}
            title="Không tải được danh sách xe tại trạm"
            hideCode
          />
        )}

        {!vehiclesQuery.loading && !vehiclesQuery.error && vehicles.length === 0 && (
          <EmptyState
            title={
              hasModelFilter
                ? 'Không có xe nào khớp dòng xe đã nhập tại trạm này'
                : 'Hiện chưa có xe sẵn sàng cho thuê tại trạm này'
            }
            hint={
              hasModelFilter
                ? 'Hãy xóa bộ lọc dòng xe để xem toàn bộ xe hiện có tại trạm.'
                : 'Bạn có thể kiểm tra lại sau hoặc chọn một trạm khác đang mở cửa.'
            }
            action={
              hasModelFilter ? (
                <Button variant="primary" onClick={handleResetModel}>
                  Xóa lọc dòng xe
                </Button>
              ) : (
                <Link to="/stations" className="btn btn-secondary">
                  Xem trạm khác
                </Link>
              )
            }
          />
        )}

        {!vehiclesQuery.loading && !vehiclesQuery.error && vehicles.length > 0 && (
          <>
            <div className="customer-card-grid">
              {vehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  stationName={station.name}
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
              meta={vehiclesQuery.meta}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={(nextPage) =>
                setVehicleFilters((prev) => ({ ...prev, page: nextPage }))
              }
              onPageSizeChange={(nextSize) =>
                setVehicleFilters((prev) => ({ ...prev, pageSize: nextSize, page: 1 }))
              }
            />
          </>
        )}
      </section>

      {reserveVehicleTarget && (
        <ReserveVehicleModal
          vehicle={reserveVehicleTarget}
          station={station}
          onClose={() => setReserveVehicleTarget(null)}
        />
      )}
    </div>
  );
}
