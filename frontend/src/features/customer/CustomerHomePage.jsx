import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import useApiQuery from '../../hooks/useApiQuery.js';
import { listStations } from '../../services/fleetApi.js';
import { listRentals } from '../../services/rentalsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '../../components/ui/index.js';
import ElectricScooterIllustration from '../../components/customer/ElectricScooterIllustration.jsx';
import StationCard from '../../components/customer/StationCard.jsx';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { getSystemTotalFromMeta } from '../../utils/fleetDisplay.js';
import { findUnresolvedRental } from '../../utils/rentalHelpers.js';

export default function CustomerHomePage() {
  const { isBootstrapping, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');

  const shouldRedirectAdmin =
    !isBootstrapping && isAuthenticated && (user?.role === 'STAFF' || user?.role === 'MANAGER');
  const isCustomer = !isBootstrapping && isAuthenticated && user?.role === 'CUSTOMER';

  const { data, meta, loading, error, reload } = useApiQuery(
    ({ signal }) => listStations({ page: 1, page_size: 4 }, { signal }),
    [],
    { enabled: !isBootstrapping && !shouldRedirectAdmin }
  );

  const activeRentalQuery = useApiQuery(
    ({ signal }) => listRentals({ page: 1, page_size: 5 }, { signal }),
    [user?.id || ''],
    { enabled: isCustomer }
  );

  const unresolvedRental = useMemo(
    () => findUnresolvedRental(activeRentalQuery.data || []),
    [activeRentalQuery.data]
  );

  if (isBootstrapping) {
    return <LoadingState message="Đang khôi phục phiên đăng nhập..." />;
  }

  if (shouldRedirectAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const stations = Array.isArray(data) ? data : [];
  const totalStations = getSystemTotalFromMeta(meta);

  const handleQuickSearch = (event) => {
    event.preventDefault();
    const trimmed = searchText.trim();
    if (trimmed) {
      navigate(`/stations?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/stations');
    }
  };

  return (
    <div className="customer-page">
      {unresolvedRental && (
        <section className="active-rental-highlight" aria-label="Chuyến đang hoạt động">
          <div className="station-detail-top">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <strong>Chuyến hiện tại của bạn:</strong>
                <StatusBadge
                  label={getCustomerStatusMeta('rentalStatus', unresolvedRental.status).label}
                  tone={getCustomerStatusMeta('rentalStatus', unresolvedRental.status).tone}
                />
              </div>
              <p className="station-card-address" style={{ marginTop: 0 }}>
                Xe: <strong>{unresolvedRental.vehicle_name || 'Xe máy điện EVRide'}</strong> (
                {unresolvedRental.vehicle_model_snapshot || 'Dòng xe tiêu chuẩn'})
              </p>
            </div>
            <Link
              to={`/rentals/${encodeURIComponent(String(unresolvedRental.id))}`}
              className="btn btn-primary btn-sm"
            >
              Mở chuyến hiện tại →
            </Link>
          </div>
        </section>
      )}

      <section className="customer-hero-banner" aria-labelledby="customer-home-heading">
        <div>
          <span className="customer-hero-eyebrow">Di chuyển xanh · Linh hoạt theo trạm</span>
          <h1 id="customer-home-heading">
            {user?.name ? `Xin chào ${user.name}, chọn xe máy điện gần bạn` : 'Thuê xe máy điện nhanh gọn tại các trạm EVRide'}
          </h1>
          <p className="customer-hero-desc">
            Tra cứu trạm đang mở cửa, xem số xe sẵn sàng, mức pin thực tế và biểu giá minh bạch theo từng 30 phút đầu và mỗi phút thêm.
          </p>

          <form className="customer-hero-search" onSubmit={handleQuickSearch} role="search" aria-label="Tìm nhanh trạm xe">
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Nhập tên trạm hoặc địa chỉ cần tìm..."
              aria-label="Tên trạm hoặc địa chỉ"
            />
            <Button type="submit" variant="primary">
              Tìm trạm
            </Button>
          </form>

          <div className="customer-hero-actions">
            <Link to="/stations" className="btn btn-primary">
              Xem danh sách trạm
            </Link>
            <Link to="/vehicles" className="btn btn-secondary">
              Xem xe có thể thuê
            </Link>
            {isCustomer && (
              <Link to="/rentals" className="btn btn-secondary">
                Chuyến của tôi
              </Link>
            )}
          </div>
        </div>

        <ElectricScooterIllustration model="EVRide Urban" />
      </section>

      <section aria-labelledby="featured-stations-heading">
        <div className="customer-section-head">
          <div>
            <h2 id="featured-stations-heading">Trạm xe đang hoạt động</h2>
            {!loading && !error && totalStations !== null && (
              <p className="customer-page-subtitle">
                Hiển thị {stations.length} trạm tiêu biểu trong tổng số {totalStations} trạm đang hoạt động.
              </p>
            )}
          </div>
          <Link to="/stations" className="btn btn-sm btn-secondary">
            Xem tất cả trạm →
          </Link>
        </div>

        {loading && <LoadingState message="Đang tải danh sách trạm..." />}

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
            title="Hiện chưa có trạm đang hoạt động"
            hint="Vui lòng thử lại sau hoặc kiểm tra lại kết nối."
            action={
              <Button variant="secondary" onClick={reload}>
                Tải lại
              </Button>
            }
          />
        )}

        {!loading && !error && stations.length > 0 && (
          <div className="customer-card-grid">
            {stations.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
