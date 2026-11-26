import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import { listStations } from '../../services/fleetApi.js';
import { listRentals } from '../../services/rentalsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SelectField,
  StatusBadge,
} from '../../components/ui/index.js';
import {
  ArrowRightIcon,
  BoltIcon,
  ClockIcon,
  MapPinIcon,
  RefreshIcon,
} from '../../components/customer/CustomerIcons.jsx';
import { formatDateTimeVN, formatDurationSeconds } from '../../utils/format.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import {
  applyFilterPatch,
  formatMoneyDisplay,
  getSystemTotalFromMeta,
} from '../../utils/fleetDisplay.js';
import {
  CUSTOMER_RENTAL_FILTER_OPTIONS,
  findUnresolvedRental,
  isUnresolvedRentalStatus,
} from '../../utils/rentalHelpers.js';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function CustomerRentalListPage() {
  const [filters, setFilters] = useState({
    status: '',
    page: 1,
    pageSize: 10,
  });

  // Tải riêng 1 trang nhỏ không lọc để phát hiện chuyến đang hoạt động / chưa giải quyết (nếu người dùng đang lọc trạng thái khác).
  const activeCheckQuery = useApiQuery(
    ({ signal }) => listRentals({ page: 1, page_size: 10 }, { signal }),
    []
  );

  const stationsQuery = useApiQuery(
    ({ signal }) => listStations({ page: 1, page_size: 100 }, { signal }),
    []
  );

  const stationNameById = useMemo(() => {
    const map = new Map();
    const items = Array.isArray(stationsQuery.data) ? stationsQuery.data : [];
    for (const st of items) {
      if (st?.id) {
        map.set(String(st.id), st.name || 'Trạm EVRide');
      }
    }
    return map;
  }, [stationsQuery.data]);

  const rentalsQuery = useApiQuery(
    ({ signal }) =>
      listRentals(
        {
          status: filters.status || undefined,
          page: filters.page,
          page_size: filters.pageSize,
        },
        { signal }
      ),
    [filters.status, filters.page, filters.pageSize]
  );

  const rentals = Array.isArray(rentalsQuery.data) ? rentalsQuery.data : [];
  const totalRentals = getSystemTotalFromMeta(rentalsQuery.meta);
  const unresolvedRental = useMemo(
    () => findUnresolvedRental(activeCheckQuery.data || rentals),
    [activeCheckQuery.data, rentals]
  );

  const handleRefreshAll = () => {
    activeCheckQuery.reload();
    rentalsQuery.reload();
  };

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <span className="customer-page-eyebrow">Hành trình của bạn</span>
          <h1 className="customer-page-title">Chuyến thuê của tôi</h1>
          <p className="customer-page-subtitle">
            Theo dõi lượt giữ chỗ, chuyến đang di chuyển, báo giá chờ quyết toán và toàn bộ lịch sử chuyến thuê.
          </p>
        </div>
        <Link to="/vehicles" className="btn btn-primary btn-sm">
          <span>Tìm xe máy điện</span>
          <ArrowRightIcon size={15} />
        </Link>
      </div>

      {unresolvedRental && (
        <section className="active-rental-highlight" aria-label="Chuyến đang hoạt động">
          <div className="active-rental-bar">
            <div className="active-rental-info">
              <span className="active-rental-icon">
                <BoltIcon size={20} />
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <strong>Chuyến hiện tại cần theo dõi</strong>
                  <StatusBadge
                    label={getCustomerStatusMeta('rentalStatus', unresolvedRental.status).label}
                    tone={getCustomerStatusMeta('rentalStatus', unresolvedRental.status).tone}
                  />
                </div>
                <p className="station-card-address" style={{ marginTop: 0 }}>
                  Xe: <strong>{unresolvedRental.vehicle_name || 'Xe máy điện EVRide'}</strong> (
                  {unresolvedRental.vehicle_model_snapshot || 'Dòng xe tiêu chuẩn'}) · Lưu ý: Bạn chỉ có thể đặt xe mới sau khi chuyến hiện tại đã kết thúc hoặc được giải quyết.
                </p>
              </div>
            </div>
            <Link
              to={`/rentals/${encodeURIComponent(String(unresolvedRental.id))}`}
              className="btn btn-primary btn-sm"
            >
              <span>Mở chi tiết chuyến</span>
              <ArrowRightIcon size={15} />
            </Link>
          </div>
        </section>
      )}

      <section className="vehicle-filter-panel" aria-label="Bộ lọc danh sách chuyến thuê">
        <div className="inline-filter-row">
          <SelectField
            id="rental-status-filter"
            label="Trạng thái chuyến"
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => applyFilterPatch(prev, { status: e.target.value }))
            }
            options={CUSTOMER_RENTAL_FILTER_OPTIONS}
          />
          {filters.status && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFilters((prev) => applyFilterPatch(prev, { status: '' }))}
            >
              Xem tất cả trạng thái
            </Button>
          )}
        </div>
      </section>

      {!rentalsQuery.loading && !rentalsQuery.error && (
        <div className="customer-results-bar">
          <span>
            {totalRentals !== null ? (
              <>
                Tổng cộng <strong>{totalRentals}</strong> chuyến phù hợp
              </>
            ) : (
              'Danh sách chuyến thuê'
            )}
          </span>
          <Button size="sm" variant="ghost" onClick={handleRefreshAll}>
            <RefreshIcon size={15} />
            <span>Làm mới</span>
          </Button>
        </div>
      )}

      {rentalsQuery.loading && <LoadingState message="Đang tải danh sách chuyến thuê..." />}

      {!rentalsQuery.loading && rentalsQuery.error && (
        <ErrorState
          error={rentalsQuery.error}
          onRetry={handleRefreshAll}
          title="Không tải được danh sách chuyến thuê"
          hideCode
        />
      )}

      {!rentalsQuery.loading && !rentalsQuery.error && rentals.length === 0 && (
        <EmptyState
          title={
            filters.status
              ? 'Không có chuyến nào ở trạng thái đã chọn'
              : 'Bạn chưa có chuyến thuê nào'
          }
          hint={
            filters.status
              ? 'Hãy chọn lại Tất cả trạng thái để xem toàn bộ lịch sử chuyến của bạn.'
              : 'Chọn một trạm gần bạn để giữ xe máy điện trong 30 phút và bắt đầu hành trình.'
          }
          action={
            filters.status ? (
              <Button
                variant="primary"
                onClick={() => setFilters((prev) => applyFilterPatch(prev, { status: '' }))}
              >
                Xem tất cả trạng thái
              </Button>
            ) : (
              <Link to="/stations" className="btn btn-primary">
                Khám phá trạm xe
              </Link>
            )
          }
        />
      )}

      {!rentalsQuery.loading && !rentalsQuery.error && rentals.length > 0 && (
        <>
          <div className="document-list">
            {rentals.map((item) => {
              const statusMeta = getCustomerStatusMeta('rentalStatus', item.status);
              const isLive = isUnresolvedRentalStatus(item.status);
              const detailPath = `/rentals/${encodeURIComponent(String(item.id))}`;
              const pickupName = item.pickup_station_id
                ? stationNameById.get(String(item.pickup_station_id)) || 'Trạm đã chọn'
                : 'Chưa cập nhật';

              return (
                <article
                  key={item.id}
                  className={`document-item-card ${isLive ? 'is-live-rental' : ''}`}
                >
                  <div className="document-item-head">
                    <div>
                      <p className="vehicle-model-tag">
                        {item.vehicle_model_snapshot || 'Xe máy điện'}
                      </p>
                      <h2 className="customer-card-title">
                        <Link to={detailPath} className="customer-card-title-link">
                          {item.vehicle_name || 'Xe máy điện EVRide'}
                        </Link>
                      </h2>
                      <div className="station-detail-meta-row" style={{ marginTop: 4 }}>
                        <span className="station-detail-meta-item">
                          <MapPinIcon size={15} className="station-meta-icon" />
                          <span>
                            Trạm nhận: <strong style={{ color: 'var(--cust-ink)' }}>{pickupName}</strong>
                          </span>
                        </span>
                        <span className="station-detail-meta-item">
                          <ClockIcon size={15} className="station-meta-icon" />
                          <span>
                            Đặt lúc <strong style={{ color: 'var(--cust-ink)' }}>{formatDateTimeVN(item.created_at)}</strong>
                          </span>
                        </span>
                      </div>
                    </div>
                    <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                  </div>

                  <div className="station-detail-stats-strip">
                    <div className="station-detail-stat">
                      <span className="customer-meta-label">Giá 30 phút đầu</span>
                      <strong className="customer-meta-value">
                        {formatMoneyDisplay(item.first_30_minutes_price_snapshot)}
                      </strong>
                    </div>
                    <div className="station-detail-stat">
                      <span className="customer-meta-label">Cọc đang giữ</span>
                      <strong className="customer-meta-value">
                        {formatMoneyDisplay(item.deposit_held)}
                      </strong>
                    </div>
                    <div className="station-detail-stat">
                      <span className="customer-meta-label">Thời lượng sử dụng</span>
                      <strong className="customer-meta-value">
                        {item.elapsed_seconds !== null && item.elapsed_seconds !== undefined
                          ? formatDurationSeconds(item.elapsed_seconds)
                          : 'Chưa nhận xe'}
                      </strong>
                    </div>
                    <div className="station-detail-stat">
                      <span className="customer-meta-label">Tổng cước đã chốt</span>
                      <strong className="customer-meta-value">
                        {item.total_price !== null && item.total_price !== undefined
                          ? formatMoneyDisplay(item.total_price)
                          : 'Chưa quyết toán'}
                      </strong>
                    </div>
                  </div>

                  <div className="customer-card-actions">
                    <Link
                      to={detailPath}
                      className={isLive ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    >
                      <span>Xem chi tiết chuyến</span>
                      <ArrowRightIcon size={15} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <Pagination
            meta={rentalsQuery.meta}
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
