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
import StationCard, { StationGridSkeleton } from '../../components/customer/StationCard.jsx';
import {
  ArrowRightIcon,
  BoltIcon,
  MapPinIcon,
  ScooterIcon,
  SearchIcon,
} from '../../components/customer/CustomerIcons.jsx';
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
    ({ signal }) => listStations({ page: 1, page_size: 6 }, { signal }),
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
          <div className="active-rental-bar">
            <div className="active-rental-info">
              <span className="active-rental-icon" aria-hidden="true">
                <ScooterIcon size={20} />
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                  <strong style={{ color: 'var(--cust-ink)' }}>Chuyến thuê đang mở của bạn</strong>
                  <StatusBadge
                    label={getCustomerStatusMeta('rentalStatus', unresolvedRental.status).label}
                    tone={getCustomerStatusMeta('rentalStatus', unresolvedRental.status).tone}
                  />
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--cust-muted)' }}>
                  Xe: <strong style={{ color: 'var(--cust-body)' }}>{unresolvedRental.vehicle_name || 'Xe máy điện EVRide'}</strong>{' '}
                  ({unresolvedRental.vehicle_model_snapshot || 'Dòng xe tiêu chuẩn'})
                </p>
              </div>
            </div>
            <Link
              to={`/rentals/${encodeURIComponent(String(unresolvedRental.id))}`}
              className="btn btn-primary btn-sm"
            >
              <span>Theo dõi chuyến thuê</span>
              <ArrowRightIcon size={15} />
            </Link>
          </div>
        </section>
      )}

      <section className="customer-hero-banner" aria-labelledby="customer-home-heading">
        <div>
          <span className="customer-hero-eyebrow">
            <BoltIcon size={14} />
            <span>Dịch vụ xe máy điện theo trạm</span>
          </span>
          <h1 id="customer-home-heading">
            {user?.name
              ? `Xin chào ${user.name}, tìm trạm và giữ xe sẵn sàng gần bạn`
              : 'Chủ động thuê xe máy điện theo trạm với biểu giá minh bạch'}
          </h1>
          <p className="customer-hero-desc">
            Tra cứu trạm đang mở cửa, kiểm tra số xe đủ điều kiện thuê, phần trăm pin thực tế và giữ trước xe cụ thể trong 30 phút để nhận xe trực tiếp tại trạm.
          </p>

          <form
            className="customer-hero-search"
            onSubmit={handleQuickSearch}
            role="search"
            aria-label="Tìm nhanh trạm xe"
          >
            <div className="customer-search-input-wrap">
              <span className="customer-search-icon" aria-hidden="true">
                <SearchIcon size={18} />
              </span>
              <input
                id="home-station-search-input"
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Nhập tên trạm hoặc địa chỉ (VD: Hoàn Kiếm, Hồ Tây, Cầu Giấy)..."
                aria-label="Tên trạm hoặc địa chỉ"
              />
            </div>
            <Button type="submit" variant="primary">
              Tìm trạm
            </Button>
          </form>

          <div className="customer-hero-quick-links" aria-label="Lối tắt tra cứu nhanh">
            <span>Tra cứu nhanh:</span>
            <Link to="/stations?has_available_vehicles=true" className="customer-quick-pill">
              <MapPinIcon size={14} />
              <span>Trạm đang có xe</span>
            </Link>
            <Link to="/stations?has_return_space=true" className="customer-quick-pill">
              <span>Trạm còn chỗ trả</span>
            </Link>
            <Link to="/vehicles" className="customer-quick-pill">
              <ScooterIcon size={14} />
              <span>Xem xe có thể thuê</span>
            </Link>
          </div>
        </div>

        <div className="customer-hero-showcase">
          <ElectricScooterIllustration model="EVRide Urban" />
          <dl className="customer-hero-facts">
            <div className="customer-hero-fact">
              <dt>Thời gian giữ chỗ</dt>
              <dd>Tối đa 30 phút tại trạm</dd>
            </div>
            <div className="customer-hero-fact">
              <dt>Cách tính cước</dt>
              <dd>30 phút đầu + mỗi phút thêm</dd>
            </div>
            <div className="customer-hero-fact">
              <dt>Bàn giao &amp; trả xe</dt>
              <dd>Nhân viên xác nhận tại trạm</dd>
            </div>
            <div className="customer-hero-fact">
              <dt>Điều kiện mở khóa</dt>
              <dd>CCCD đã duyệt &amp; ví đủ cọc</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="customer-workflow-strip" aria-label="Quy trình thuê xe tại trạm">
        <div className="customer-workflow-step">
          <span className="customer-workflow-num" aria-hidden="true">1</span>
          <div className="customer-workflow-body">
            <h3>Xác minh giấy tờ &amp; chuẩn bị ví</h3>
            <p>
              Hoàn tất xác minh CCCD còn hạn và chuẩn bị số dư ví đủ khoản cọc cùng 30 phút đầu.
            </p>
            {isAuthenticated ? (
              <Link to="/profile" className="customer-workflow-link">
                <span>Kiểm tra hồ sơ</span>
                <ArrowRightIcon size={14} />
              </Link>
            ) : (
              <Link to="/register" className="customer-workflow-link">
                <span>Tạo tài khoản khách hàng</span>
                <ArrowRightIcon size={14} />
              </Link>
            )}
          </div>
        </div>

        <div className="customer-workflow-step">
          <span className="customer-workflow-num" aria-hidden="true">2</span>
          <div className="customer-workflow-body">
            <h3>Chọn xe cụ thể &amp; giữ chỗ 30 phút</h3>
            <p>
              Xem mức pin và bảng giá niêm yết của từng chiếc xe tại trạm đang mở, sau đó giữ xe và đến quầy nhận xe.
            </p>
            <Link to="/vehicles" className="customer-workflow-link">
              <span>Khám phá xe sẵn sàng</span>
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        </div>

        <div className="customer-workflow-step">
          <span className="customer-workflow-num" aria-hidden="true">3</span>
          <div className="customer-workflow-body">
            <h3>Trả xe tại trạm còn chỗ &amp; quyết toán</h3>
            <p>
              Đưa xe về bất kỳ trạm đang hoạt động còn chỗ trống để nhân viên tiếp nhận, áp mã ưu đãi và quyết toán.
            </p>
            <Link to="/faq" className="customer-workflow-link">
              <span>Xem quy định chi tiết</span>
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="featured-stations-heading">
        <div className="customer-section-head">
          <div>
            <h2 id="featured-stations-heading">Trạm xe đang hoạt động</h2>
            {!loading && !error && totalStations !== null && (
              <p className="customer-page-subtitle">
                Đang hiển thị {stations.length} trạm trong tổng số {totalStations} trạm hoạt động trên hệ thống.
              </p>
            )}
          </div>
          <Link to="/stations" className="btn btn-sm btn-secondary">
            <span>Xem toàn bộ danh sách trạm</span>
            <ArrowRightIcon size={15} />
          </Link>
        </div>

        {loading && <StationGridSkeleton count={6} label="Đang tải danh sách trạm đang hoạt động..." />}

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
            hint="Vui lòng tải lại sau ít phút hoặc kiểm tra lại kết nối mạng."
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
