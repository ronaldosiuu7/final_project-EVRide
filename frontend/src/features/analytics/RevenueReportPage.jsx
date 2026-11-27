import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DataTable,
  DateRangeFilter,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import {
  getFinancialSummary,
  getRevenueDetails,
  getRevenueReport,
} from '../../services/analyticsApi';
import { formatDateTimeVN, formatVnd } from '../../utils/format';
import RevenueStackedChart from './RevenueStackedChart';

export default function RevenueReportPage() {
  const [range, setRange] = useState({});
  const [detailsPage, setDetailsPage] = useState(1);
  const [detailsPageSize, setDetailsPageSize] = useState(20);

  const summaryQuery = useApiQuery(
    ({ signal }) => getFinancialSummary(range, { signal }),
    [range.from_date, range.to_date]
  );
  const revenueQuery = useApiQuery(
    ({ signal }) => getRevenueReport(range, { signal }),
    [range.from_date, range.to_date]
  );
  const detailsQuery = useApiQuery(
    ({ signal }) =>
      getRevenueDetails(
        {
          ...range,
          page: detailsPage,
          page_size: detailsPageSize,
        },
        { signal }
      ),
    [range.from_date, range.to_date, detailsPage, detailsPageSize]
  );

  const handleRangeChange = (nextRange) => {
    setRange(nextRange);
    setDetailsPage(1);
  };

  const summary = summaryQuery.data;
  const revenue = revenueQuery.data;
  const details = detailsQuery.data;

  const missingSnapshots = Math.max(
    summary?.missing_snapshot_count || 0,
    revenue?.missing_snapshot_count || 0,
    details?.missing_snapshot_count || 0
  );

  const revenueColumns = [
    { key: 'month', header: 'Tháng' },
    {
      key: 'vehicle_model',
      header: 'Dòng xe',
      render: (r) => r.vehicle_model || <span className="muted">Chưa phân loại</span>,
    },
    { key: 'rental_count', header: 'Số chuyến', align: 'right' },
    {
      key: 'normal_revenue',
      header: 'Thuê thường',
      align: 'right',
      render: (r) => formatVnd(r.normal_revenue),
    },
    {
      key: 'incident_revenue',
      header: 'Thuê sự cố',
      align: 'right',
      render: (r) => formatVnd(r.incident_revenue),
    },
    {
      key: 'revenue',
      header: 'Tổng doanh thu',
      align: 'right',
      render: (r) => <strong>{formatVnd(r.revenue)}</strong>,
    },
    {
      key: 'cumulative_revenue',
      header: 'Lũy kế theo dòng xe',
      align: 'right',
      render: (r) => formatVnd(r.cumulative_revenue),
    },
    {
      key: 'share_percent',
      header: 'Tỷ trọng tháng (%)',
      align: 'right',
      render: (r) => `${r.share_percent}%`,
    },
  ];

  const detailsColumns = [
    {
      key: 'rental_id',
      header: 'Chuyến thuê',
      render: (d) => <Link to={`/admin/rentals/${d.rental_id}`}>#{d.rental_id}</Link>,
    },
    { key: 'invoice_id', header: 'Hóa đơn', render: (d) => `#${d.invoice_id}` },
    {
      key: 'revenue_type',
      header: 'Loại ghi nhận',
      render: (d) => <StatusBadge domain="revenueType" value={d.revenue_type} />,
    },
    {
      key: 'recognized_at',
      header: 'Thời điểm ghi nhận (giờ VN)',
      render: (d) => formatDateTimeVN(d.recognized_at, { withSeconds: true }),
    },
    {
      key: 'vehicle_model',
      header: 'Dòng xe',
      render: (d) => d.vehicle_model || <span className="muted">Chưa phân loại</span>,
    },
    {
      key: 'revenue',
      header: 'Doanh thu',
      align: 'right',
      render: (d) => <strong>{formatVnd(d.revenue)}</strong>,
    },
  ];

  const detailsMeta = details
    ? { page: details.page, page_size: details.page_size, total: details.total }
    : null;

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <h2>Báo cáo doanh thu &amp; Tổng hợp tài chính</h2>
          <p className="muted">
            Tổng hợp doanh thu thuê xe thực tế, phân bổ theo tháng và dòng xe cùng danh sách chi tiết từng hóa đơn đã quyết toán.
          </p>
        </div>
        <Link to="/admin/reports/operations" className="btn">
          Xem phân tích vận hành mở rộng →
        </Link>
      </div>

      <DateRangeFilter label="Khoảng ngày báo cáo" value={range} onChange={handleRangeChange} />

      <div className="card stack-sm">
        <h3>Nguyên tắc ghi nhận doanh thu</h3>
        <ul className="checklist">
          <li>
            • <strong>Chuyến thuê thông thường:</strong> ghi nhận tại thời điểm kết thúc chuyến khi đã hoàn tất quyết toán và thanh toán hóa đơn.
          </li>
          <li>
            • <strong>Chuyến phát sinh sự cố:</strong> ghi nhận một lần tại thời điểm quyết toán tiền thuê thành công; việc đóng hồ sơ sau đó không ghi trùng doanh thu.
          </li>
          <li>
            • Không cộng tiền nạp ví, tiền cọc đang tạm giữ hoặc khoản bồi thường ngoài hệ thống vào doanh thu cho thuê.
          </li>
        </ul>
      </div>

      {missingSnapshots > 0 && (
        <div className="alert alert-warning" role="alert">
          Lưu ý dữ liệu: Có <strong>{missingSnapshots}</strong> chuyến thuê chưa có thông tin dòng xe lưu kèm (được nhóm vào mục &ldquo;Chưa phân loại&rdquo;).
        </div>
      )}

      <div>
        <h3 className="section-title">1. Tổng hợp tài chính</h3>
        {summaryQuery.loading ? (
          <LoadingState message="Đang tải tổng hợp tài chính..." />
        ) : summaryQuery.error ? (
          <ErrorState error={summaryQuery.error} onRetry={summaryQuery.reload} />
        ) : summary ? (
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Tổng doanh thu thuê</h4>
              <p>{formatVnd(summary.rental_revenue)}</p>
              <small>{summary.rental_count} chuyến / hồ sơ</small>
            </div>
            <div className="stat-card">
              <h4>Doanh thu thuê thường</h4>
              <p>{formatVnd(summary.normal_rental_revenue)}</p>
              <small>{summary.normal_rental_count} chuyến đã thanh toán</small>
            </div>
            <div className="stat-card">
              <h4>Doanh thu thuê sự cố</h4>
              <p>{formatVnd(summary.incident_rental_revenue)}</p>
              <small>{summary.incident_rental_count} hồ sơ đã quyết toán thuê</small>
            </div>
            <div className="stat-card">
              <h4>Tiền cọc đang tạm giữ</h4>
              <p>{formatVnd(summary.deposit_held_current?.all_rentals)}</p>
              <small>
                Cập nhật {formatDateTimeVN(summary.deposit_held_current?.as_of)} · Hồ sơ sự cố:{' '}
                {formatVnd(summary.deposit_held_current?.confirmed_incidents)}
              </small>
            </div>
            <div className="stat-card">
              <h4>Hoàn cọc sự cố (trong kỳ)</h4>
              <p>{formatVnd(summary.incident_deposit_refunded)}</p>
              <small>Tính theo thời điểm giao dịch hoàn cọc</small>
            </div>
            <div className="stat-card">
              <h4>Chênh lệch bồi thường nội bộ</h4>
              <p>{formatVnd(summary.compensation_net_movement)}</p>
              <small>
                Thu: {formatVnd(summary.compensation_collected)} · Hoàn: {formatVnd(summary.compensation_refunded)}
              </small>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <div className="page-header">
          <h3 className="section-title">2. Doanh thu theo tháng &amp; dòng xe</h3>
          {revenue && (
            <span className="muted">
              Tổng: <strong>{formatVnd(revenue.total_revenue)}</strong> ({revenue.rental_count} lượt)
            </span>
          )}
        </div>

        {revenueQuery.loading ? (
          <LoadingState message="Đang tải báo cáo theo tháng..." />
        ) : revenueQuery.error ? (
          <ErrorState error={revenueQuery.error} onRetry={revenueQuery.reload} />
        ) : !revenue || revenue.items.length === 0 ? (
          <EmptyState
            title="Không có doanh thu nào trong khoảng ngày này"
            hint="Thử mở rộng khoảng ngày hoặc chọn 'Toàn bộ' để xem lịch sử doanh thu."
          />
        ) : (
          <div className="stack-md">
            <RevenueStackedChart items={revenue.items} />
            <DataTable
              columns={revenueColumns}
              rows={revenue.items}
              rowKey={(r, idx) => `${r.month}-${r.vehicle_model || 'missing'}-${idx}`}
            />
          </div>
        )}
      </div>

      <div>
        <h3 className="section-title">3. Chi tiết từng khoản doanh thu</h3>
        <DataTable
          columns={detailsColumns}
          rows={details?.items || []}
          rowKey={(d) => `${d.rental_id}-${d.invoice_id}`}
          loading={detailsQuery.loading}
          error={detailsQuery.error}
          onRetry={detailsQuery.reload}
          meta={detailsMeta}
          onPageChange={setDetailsPage}
          onPageSizeChange={(size) => {
            setDetailsPageSize(size);
            setDetailsPage(1);
          }}
          emptyTitle="Không có giao dịch doanh thu nào trong khoảng ngày này"
          emptyHint="Thử chọn khoảng ngày khác hoặc xóa bộ lọc ngày."
        />
      </div>
    </div>
  );
}
