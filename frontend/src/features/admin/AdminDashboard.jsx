import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DataTable,
  DateRangeFilter,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import { getFinancialSummary } from '../../services/analyticsApi';
import { listAdminStations, listVehicles } from '../../services/fleetApi';
import { listTickets } from '../../services/operationsApi';
import { listDueCheckIns } from '../../services/rentalsApi';
import { formatDateTimeVN, formatVnd } from '../../utils/format';
import { STATUS_CONFIG } from '../../utils/statusConfig';

const VEHICLE_STATUS_KEYS = Object.keys(STATUS_CONFIG.vehicleStatus);

export default function AdminDashboard() {
  const [range, setRange] = useState({});

  const summaryQuery = useApiQuery(
    ({ signal }) => getFinancialSummary(range, { signal }),
    [range.from_date, range.to_date]
  );
  const stationsQuery = useApiQuery(
    ({ signal }) => listAdminStations({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const vehiclesQuery = useApiQuery(
    ({ signal }) => listVehicles({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const ticketsQuery = useApiQuery(
    ({ signal }) => listTickets({ page: 1, page_size: 5 }, { signal }),
    []
  );
  const checkInsQuery = useApiQuery(
    ({ signal }) => listDueCheckIns({ page: 1, page_size: 10 }, { signal }),
    []
  );

  const summary = summaryQuery.data;
  const stations = stationsQuery.data || [];
  const vehicles = vehiclesQuery.data || [];
  const tickets = ticketsQuery.data || [];
  const checkInsTotal = checkInsQuery.meta?.total ?? 0;

  const activeStationsCount = stations.filter((s) => s.status === 'ACTIVE').length;
  const nearFullStations = stations
    .filter((s) => s.status === 'ACTIVE' && s.available_spaces <= 1)
    .sort((a, b) => a.available_spaces - b.available_spaces || Number(a.id) - Number(b.id))
    .slice(0, 10);

  const vehicleCountsByStatus = VEHICLE_STATUS_KEYS.map((status) => ({
    status,
    count: vehicles.filter((v) => v.status === status).length,
  }));

  const stationColumns = [
    { key: 'id', header: 'Mã trạm', render: (s) => `#${s.id}` },
    { key: 'name', header: 'Tên trạm' },
    { key: 'capacity', header: 'Sức chứa' },
    { key: 'occupied_spaces', header: 'Đang đỗ' },
    {
      key: 'available_spaces',
      header: 'Chỗ trống',
      render: (s) => (
        <StatusBadge
          label={s.available_spaces <= 0 ? 'Đã đầy' : `${s.available_spaces} chỗ`}
          tone={s.available_spaces <= 0 ? 'danger' : 'warning'}
        />
      ),
    },
    {
      key: 'available_vehicle_count',
      header: 'Xe sẵn sàng',
      render: (s) => <Link to={`/admin/vehicles?station_id=${s.id}`}>{s.available_vehicle_count} xe</Link>,
    },
  ];

  const ticketColumns = [
    {
      key: 'title',
      header: 'Yêu cầu hỗ trợ',
      render: (t) => (
        <div>
          <Link to={`/admin/tickets/${t.id}`}>
            <strong>{t.title}</strong>
          </Link>
          <div className="muted">Yêu cầu #{t.id}</div>
        </div>
      ),
    },
    {
      key: 'rental_id',
      header: 'Chuyến thuê',
      render: (t) => <Link to={`/admin/rentals/${t.rental_id}`}>Chuyến #{t.rental_id}</Link>,
    },
    { key: 'status', header: 'Trạng thái', render: (t) => <StatusBadge domain="ticketStatus" value={t.status} /> },
    { key: 'created_at', header: 'Thời điểm tạo', render: (t) => formatDateTimeVN(t.created_at) },
  ];

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <h2>Tổng quan vận hành</h2>
          <p className="muted">
            Theo dõi nhanh đội xe, tình trạng chỗ đỗ tại trạm, chuyến đến hạn kiểm tra 24 giờ, yêu cầu hỗ trợ và doanh thu theo kỳ.
          </p>
        </div>
        <div className="page-header-actions">
          <Link to="/admin/rentals" className="btn">
            Xử lý bàn giao / trả xe
          </Link>
          <Link to="/admin/reports" className="btn btn-primary">
            Báo cáo doanh thu
          </Link>
        </div>
      </div>

      {/* Lối tắt tác vụ ưu tiên trong ca làm việc */}
      <div className="ops-quick-actions" aria-label="Tác vụ vận hành nhanh">
        <Link to="/admin/rentals?status=RESERVED" className="ops-quick-card">
          <strong>Lượt giữ xe chờ bàn giao</strong>
          <span>Kiểm tra giấy tờ và giao xe cho khách trong hạn 30 phút</span>
        </Link>
        <Link to="/admin/rentals?status=RETURN_PENDING" className="ops-quick-card">
          <strong>Chuyến chờ quyết toán</strong>
          <span>Tạo báo giá và hoàn tất thanh toán sau khi tiếp nhận xe</span>
        </Link>
        <Link to="/admin/check-ins" className="ops-quick-card">
          <strong>Kiểm tra chuyến 24 giờ ({checkInsQuery.loading ? '…' : checkInsTotal})</strong>
          <span>Liên hệ xác nhận tình trạng các chuyến thuê dài giờ</span>
        </Link>
        <Link to="/admin/documents" className="ops-quick-card">
          <strong>Xác minh giấy tờ khách hàng</strong>
          <span>Tra cứu và thẩm định hồ sơ CCCD theo mã giấy tờ</span>
        </Link>
      </div>

      <DateRangeFilter
        label="Khoảng ngày tài chính"
        value={range}
        onChange={setRange}
      />

      {summaryQuery.loading && <LoadingState message="Đang tải tổng hợp tài chính..." />}
      {!summaryQuery.loading && summaryQuery.error && (
        <ErrorState error={summaryQuery.error} onRetry={summaryQuery.reload} />
      )}

      {!summaryQuery.loading && summary && (
        <div className="stats-grid">
          <div className="stat-card">
            <h4>Tổng doanh thu thuê</h4>
            <p>{formatVnd(summary.rental_revenue)}</p>
            <small>
              Chuyến thường: {formatVnd(summary.normal_rental_revenue)} ({summary.normal_rental_count} chuyến) · Sự cố:{' '}
              {formatVnd(summary.incident_rental_revenue)} ({summary.incident_rental_count} hồ sơ)
            </small>
          </div>
          <div className="stat-card">
            <h4>Tiền cọc đang tạm giữ</h4>
            <p>{formatVnd(summary.deposit_held_current?.all_rentals)}</p>
            <small>
              Không tính vào doanh thu · Hồ sơ sự cố: {formatVnd(summary.deposit_held_current?.confirmed_incidents)}
            </small>
          </div>
          <div className="stat-card">
            <h4>Tổng xe máy điện</h4>
            <p>{vehiclesQuery.meta?.total ?? vehicles.length}</p>
            <small>
              <Link to="/admin/vehicles">Quản lý đội xe →</Link>
            </small>
          </div>
          <div className="stat-card">
            <h4>Trạm đang hoạt động</h4>
            <p>
              {activeStationsCount} / {stationsQuery.meta?.total ?? stations.length}
            </p>
            <small>
              <Link to="/admin/stations">Quản lý trạm →</Link>
            </small>
          </div>
          <div className="stat-card">
            <h4>Đến hạn kiểm tra 24 giờ</h4>
            <p>{checkInsQuery.loading ? '…' : checkInsTotal}</p>
            <small>
              <Link to="/admin/check-ins">Mở hàng chờ kiểm tra →</Link>
            </small>
          </div>
        </div>
      )}

      <div>
        <div className="page-header">
          <h3 className="section-title">Phân bố xe máy điện theo trạng thái</h3>
          {vehiclesQuery.meta && vehiclesQuery.meta.total > vehicles.length && (
            <span className="muted">
              Đang tổng hợp trên {vehicles.length}/{vehiclesQuery.meta.total} xe đầu tiên.
            </span>
          )}
        </div>
        {vehiclesQuery.loading ? (
          <LoadingState message="Đang tải thống kê đội xe..." />
        ) : vehiclesQuery.error ? (
          <ErrorState error={vehiclesQuery.error} onRetry={vehiclesQuery.reload} />
        ) : (
          <div className="stats-grid">
            {vehicleCountsByStatus.map((item) => (
              <Link
                key={item.status}
                to={`/admin/vehicles?status=${encodeURIComponent(item.status)}`}
                className="stat-card stat-card-link"
              >
                <StatusBadge domain="vehicleStatus" value={item.status} />
                <p style={{ marginTop: 8 }}>{item.count} xe</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="section-title">Trạm hoạt động sắp đầy chỗ đỗ (&le; 1 chỗ trống)</h3>
        <DataTable
          columns={stationColumns}
          rows={nearFullStations}
          loading={stationsQuery.loading}
          error={stationsQuery.error}
          onRetry={stationsQuery.reload}
          emptyTitle="Không có trạm nào sắp đầy chỗ đỗ"
          emptyHint="Tất cả trạm đang hoạt động hiện đều còn từ 2 chỗ trống trở lên để tiếp nhận trả xe."
        />
      </div>

      <div>
        <h3 className="section-title">5 yêu cầu hỗ trợ mới nhất</h3>
        <DataTable
          columns={ticketColumns}
          rows={tickets}
          loading={ticketsQuery.loading}
          error={ticketsQuery.error}
          onRetry={ticketsQuery.reload}
          emptyTitle="Chưa có yêu cầu hỗ trợ nào"
          emptyHint="Các yêu cầu hỗ trợ hoặc báo hỏng mới nhất từ khách hàng và nhân viên sẽ hiển thị tại đây."
        />
      </div>
    </div>
  );
}
