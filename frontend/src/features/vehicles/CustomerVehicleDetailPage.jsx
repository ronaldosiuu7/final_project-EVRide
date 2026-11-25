import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import useApiQuery from '../../hooks/useApiQuery.js';
import { getStation, getVehicle } from '../../services/fleetApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '../../components/ui/index.js';
import ElectricScooterIllustration from '../../components/customer/ElectricScooterIllustration.jsx';
import ReserveVehicleModal from '../rentals/ReserveVehicleModal.jsx';
import {
  formatCountDisplay,
  formatMoneyDisplay,
  formatStationHours,
  getBatteryLevelInfo,
  getStationOpenStatus,
  getStationReturnSpaceCount,
} from '../../utils/fleetDisplay.js';

export default function CustomerVehicleDetailPage() {
  const { vehicleId } = useParams();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [reserveModalOpen, setReserveModalOpen] = useState(false);

  const vehicleQuery = useApiQuery(
    ({ signal }) => getVehicle(vehicleId, { signal }),
    [vehicleId],
    { enabled: Boolean(vehicleId) }
  );

  const stationId = vehicleQuery.data?.current_station_id
    ? String(vehicleQuery.data.current_station_id)
    : '';

  const stationQuery = useApiQuery(
    ({ signal }) => getStation(stationId, { signal }),
    [stationId],
    { enabled: Boolean(stationId) }
  );

  if (vehicleQuery.loading) {
    return <LoadingState message="Đang tải thông tin xe máy điện..." />;
  }

  if (vehicleQuery.error) {
    const isNotFound = vehicleQuery.error.status === 404;
    return (
      <div className="customer-page">
        <nav className="customer-breadcrumb" aria-label="Đường dẫn">
          <Link to="/vehicles">Tìm xe</Link>
          <span aria-hidden="true">/</span>
          <span>Chi tiết xe</span>
        </nav>

        {isNotFound ? (
          <EmptyState
            title="Xe máy điện này hiện không khả dụng"
            hint="Xe có thể vừa được giữ chỗ, đang trong chuyến thuê, mức pin dưới 30% hoặc trạm đang ngoài giờ hoạt động."
            action={
              <div className="customer-card-actions" style={{ justifyContent: 'center' }}>
                <Link to="/vehicles" className="btn btn-primary">
                  Tìm xe khác
                </Link>
                <Link to="/stations" className="btn btn-secondary">
                  Xem danh sách trạm
                </Link>
              </div>
            }
          />
        ) : (
          <ErrorState
            error={vehicleQuery.error}
            onRetry={vehicleQuery.reload}
            title="Không tải được thông tin xe"
            hideCode
          />
        )}
      </div>
    );
  }

  const vehicle = vehicleQuery.data;
  if (!vehicle) {
    return (
      <EmptyState
        title="Không có dữ liệu xe máy điện"
        action={
          <Link to="/vehicles" className="btn btn-primary">
            Quay lại danh sách xe
          </Link>
        }
      />
    );
  }

  const battery = getBatteryLevelInfo(vehicle.battery_percent);
  const first30Price = formatMoneyDisplay(vehicle.first_30_minutes_price);
  const extraMinPrice = formatMoneyDisplay(vehicle.extra_minute_price);
  const depositAmount = formatMoneyDisplay(vehicle.deposit_amount);

  const station = stationQuery.data;
  const stationOpenStatus = station ? getStationOpenStatus(station) : null;
  const stationHours = station ? formatStationHours(station.opens_at, station.closes_at) : null;
  const returnSpaces = station ? getStationReturnSpaceCount(station) : null;
  const isStaffOrManager = isAuthenticated && (user?.role === 'STAFF' || user?.role === 'MANAGER');

  const handleOpenReserve = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setReserveModalOpen(true);
  };

  return (
    <div className="customer-page">
      <nav className="customer-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <Link to="/vehicles">Tìm xe</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{vehicle.name || 'Chi tiết xe'}</span>
      </nav>

      <div className="vehicle-detail-layout">
        <section className="vehicle-detail-card" aria-labelledby="vehicle-detail-title">
          <ElectricScooterIllustration model={vehicle.model} />

          <div>
            <p className="vehicle-model-tag">{vehicle.model || 'Chưa cập nhật dòng xe'}</p>
            <h1 id="vehicle-detail-title" className="customer-page-title">
              {vehicle.name || 'Xe máy điện EVRide'}
            </h1>
          </div>

          <div className="battery-meter-wrap">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="customer-meta-label">Mức pin hiện tại</span>
              <StatusBadge label={`Pin ${battery.text}`} tone={battery.tone} />
            </div>
            <div className="battery-meter-track">
              <div
                className={`battery-meter-fill tone-${battery.tone}`}
                style={{ width: battery.percent !== null ? `${battery.percent}%` : '0%' }}
              />
            </div>
            <span className="battery-meter-caption">
              {battery.percent !== null ? `${battery.text} · ${battery.label}` : battery.text}
            </span>
          </div>
        </section>

        <section className="vehicle-detail-card" aria-labelledby="vehicle-pricing-heading">
          <h2 id="vehicle-pricing-heading" className="customer-card-title">
            Biểu giá &amp; điều kiện thuê (Tiền mô phỏng)
          </h2>

          <dl className="vehicle-pricing-list">
            <div className="vehicle-pricing-row">
              <dt>Giá 30 phút đầu</dt>
              <dd className="price-highlight">{first30Price}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Giá mỗi phút thêm</dt>
              <dd>{extraMinPrice}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Tiền cọc giữ xe</dt>
              <dd>{depositAmount}</dd>
            </div>
          </dl>

          {isStaffOrManager ? (
            <div className="vehicle-reserve-note" role="note">
              Tính năng giữ xe 30 phút dành cho tài khoản Khách hàng. Bạn đang đăng nhập tài khoản vận hành.
            </div>
          ) : stationId ? (
            <div className="stack-sm">
              <Button variant="primary" onClick={handleOpenReserve}>
                {isAuthenticated ? 'Giữ xe này trong 30 phút' : 'Đăng nhập để giữ xe 30 phút'}
              </Button>
              <p className="customer-meta-label">
                Biểu giá và tiền cọc sẽ được hiển thị lại để bạn xác nhận trước khi gửi yêu cầu giữ chỗ.
              </p>
            </div>
          ) : (
            <div className="vehicle-reserve-note" role="note">
              Xe hiện không gắn với trạm mở cửa nên tạm thời chưa thể đặt giữ chỗ.
            </div>
          )}

          {stationId && (
            <div className="station-metric-box" style={{ gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span className="customer-meta-label">Trạm hiện tại</span>
                {stationOpenStatus && (
                  <StatusBadge label={stationOpenStatus.label} tone={stationOpenStatus.tone} />
                )}
              </div>

              {stationQuery.loading ? (
                <p className="customer-meta-label">Đang tải thông tin trạm...</p>
              ) : station ? (
                <>
                  <strong className="customer-meta-value">{station.name}</strong>
                  <p className="station-card-address" style={{ marginTop: 0 }}>
                    {station.address || 'Chưa cập nhật địa chỉ'}
                  </p>
                  <p className="station-card-address" style={{ marginTop: 0 }}>
                    Giờ hoạt động: <strong>{stationHours}</strong> · Chỗ trả trống:{' '}
                    <strong>{formatCountDisplay(returnSpaces, 'chỗ')}</strong>
                  </p>
                  <div>
                    <Link
                      to={`/stations/${encodeURIComponent(String(station.id))}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Xem chi tiết trạm
                    </Link>
                  </div>
                </>
              ) : (
                <div>
                  <Link
                    to={`/stations/${encodeURIComponent(stationId)}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Xem thông tin trạm
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="customer-card-actions">
            <Link to="/vehicles" className="btn btn-secondary btn-sm">
              ← Quay lại tìm xe
            </Link>
            <Link to="/stations" className="btn btn-ghost btn-sm">
              Xem tất cả trạm
            </Link>
          </div>
        </section>
      </div>

      {reserveModalOpen && (
        <ReserveVehicleModal
          vehicle={vehicle}
          station={station}
          onClose={() => setReserveModalOpen(false)}
        />
      )}
    </div>
  );
}
