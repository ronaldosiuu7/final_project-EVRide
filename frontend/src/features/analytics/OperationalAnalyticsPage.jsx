import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DataTable,
  DateRangeFilter,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  SelectField,
  StatusBadge,
  Tabs,
  TextField,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import {
  getIdleTimeAnalytics,
  getInactiveCustomersAnalytics,
  getOverviewAnalytics,
  getPeakHoursAnalytics,
  getTopRoutesAnalytics,
} from '../../services/analyticsApi';
import { formatDateTimeVN, formatMinutes, formatVnd } from '../../utils/format';

function heatCellBackground(count, maxCount) {
  if (!count || maxCount <= 0) return '#f9fafb';
  const ratio = count / maxCount;
  // Thang màu đơn sắc xanh ngọc từ nhạt -> đậm theo đặc tả Q3.
  const alpha = (0.15 + ratio * 0.78).toFixed(2);
  return `rgba(16, 185, 129, ${alpha})`;
}

export default function OperationalAnalyticsPage() {
  const [activeTab, setActiveTab] = useState('utilization');
  const [range, setRange] = useState({});
  const [stationFilter, setStationFilter] = useState('');
  const [hoveredCell, setHoveredCell] = useState(null);

  // Bộ lọc riêng cho Q6 Khách lâu không đi (KHÔNG dùng from_date/to_date).
  const [inactiveDays, setInactiveDays] = useState('30');
  const [asOfDate, setAsOfDate] = useState('');
  const [inactivePage, setInactivePage] = useState(1);

  const overviewQuery = useApiQuery(
    () => getOverviewAnalytics(range),
    [range.from_date, range.to_date]
  );
  const peakQuery = useApiQuery(
    () => getPeakHoursAnalytics({ ...range, station_id: stationFilter || undefined }),
    [range.from_date, range.to_date, stationFilter]
  );
  const idleQuery = useApiQuery(
    () => getIdleTimeAnalytics({ ...range, limit: 15 }),
    [range.from_date, range.to_date]
  );
  const routesQuery = useApiQuery(
    () => getTopRoutesAnalytics(range),
    [range.from_date, range.to_date]
  );
  const inactiveQuery = useApiQuery(
    () =>
      getInactiveCustomersAnalytics({
        days: Number(inactiveDays),
        as_of_date: asOfDate || undefined,
        page: inactivePage,
        page_size: 20,
      }),
    [inactiveDays, asOfDate, inactivePage]
  );

  // Gom dữ liệu Heatmap Q3 theo từng trạm x 24 giờ.
  const peakItems = peakQuery.data?.items || [];
  const stationOptionsMap = new Map();
  const heatmapRowsMap = new Map();
  let maxHeatCount = 0;

  for (const item of peakItems) {
    stationOptionsMap.set(item.station_id, item.station_name);
    if (!heatmapRowsMap.has(item.station_id)) {
      heatmapRowsMap.set(item.station_id, {
        station_id: item.station_id,
        station_name: item.station_name,
        hours: Array(24).fill(0),
        total: 0,
      });
    }
    const row = heatmapRowsMap.get(item.station_id);
    row.hours[item.hour] = item.rental_count;
    row.total += item.rental_count;
    if (item.rental_count > maxHeatCount) maxHeatCount = item.rental_count;
  }

  const heatmapRows = Array.from(heatmapRowsMap.values())
    .sort((a, b) => b.total - a.total || Number(a.station_id) - Number(b.station_id))
    .slice(0, 20);

  const idleItems = idleQuery.data?.items || [];
  const maxIdleMinutes = Math.max(1, ...idleItems.map((i) => i.average_idle_minutes || 0));

  const routeColumns = [
    { key: 'month', header: 'Tháng' },
    { key: 'rank', header: 'Hạng (RANK)', render: (r) => `#${r.rank}` },
    {
      key: 'pickup',
      header: 'Trạm xuất phát',
      render: (r) => `${r.pickup_station_name || ''} (#${r.pickup_station_id})`,
    },
    {
      key: 'return',
      header: 'Trạm trả xe',
      render: (r) => `${r.return_station_name || ''} (#${r.return_station_id})`,
    },
    { key: 'rental_count', header: 'Số lượt thuê', align: 'right' },
  ];

  const inactiveColumns = [
    {
      key: 'user_id',
      header: 'Khách hàng',
      render: (u) => <Link to={`/admin/users/${u.user_id}`}>#{u.user_id} - {u.name}</Link>,
    },
    { key: 'email', header: 'Email' },
    {
      key: 'balance',
      header: 'Số dư ví',
      align: 'right',
      render: (u) => <strong>{formatVnd(u.balance)}</strong>,
    },
  ];

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <h2>Phân tích vận hành mở rộng (Theo đặc tả &amp; Contract)</h2>
          <p className="muted">
            Bao gồm tổng quan đặc tả, bản đồ nhiệt giờ cao điểm (Q3), thời gian nằm chờ (Q8), top 3 tuyến (Q5) và khách lâu không đi (Q6).
          </p>
        </div>
        <Link to="/admin/reports" className="btn">
          ← Quay lại Báo cáo doanh thu (API thật)
        </Link>
      </div>

      <div className="alert alert-warning">
        <strong>Trạng thái Backend:</strong> Backend V1 hiện mới triển khai 3 API báo cáo doanh thu/tài chính. 5 nhóm phân tích mở rộng dưới đây đã hoàn thiện giao diện, bộ lọc, service interface và dữ liệu fixture chuẩn contract (<code>src/fixtures/analyticsFixtures.js</code>) để sẵn sàng nối API khi Backend bổ sung.
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: 'utilization', label: 'Mức sử dụng trạm (Q3 Heatmap & Q8 Chờ)' },
          { key: 'routes', label: 'Top 3 tuyến mỗi tháng (Q5)' },
          { key: 'inactive', label: 'Khách lâu không đi (Q6)' },
          { key: 'overview', label: 'Tổng quan đặc tả (/analytics/overview)' },
        ]}
      />

      {activeTab !== 'inactive' && (
        <DateRangeFilter
          label="Khoảng ngày báo cáo"
          value={range}
          onChange={setRange}
        />
      )}

      {activeTab === 'utilization' && (
        <div className="stack-lg">
          <FilterBar onReset={() => setStationFilter('')}>
            <SelectField
              label="Lọc riêng một trạm (Q3 Heatmap)"
              value={stationFilter}
              placeholder="Top 20 trạm đông nhất"
              options={Array.from(stationOptionsMap.entries()).map(([id, name]) => ({
                value: id,
                label: `#${id} - ${name}`,
              }))}
              onChange={(e) => setStationFilter(e.target.value)}
            />
          </FilterBar>

          <div className="card stack-md">
            <div className="card-header">
              <h3>Bản đồ nhiệt lượt thuê theo trạm × 24 giờ VN (Q3)</h3>
              {peakQuery.data && (
                <div className="row-wrap">
                  <StatusBadge
                    label={`Hiển thị Top 20: ${peakQuery.data.included_trip_count} lượt`}
                    tone="info"
                  />
                  <StatusBadge
                    label={`Tổng toàn phạm vi lọc: ${peakQuery.data.filtered_trip_count} lượt`}
                    tone="neutral"
                  />
                </div>
              )}
            </div>

            {peakQuery.loading ? (
              <LoadingState />
            ) : peakQuery.error ? (
              <ErrorState error={peakQuery.error} onRetry={peakQuery.reload} />
            ) : heatmapRows.length === 0 ? (
              <EmptyState title="Không có chuyến nào trong khoảng ngày này" />
            ) : (
              <>
                <div className="chart-legend" aria-label="Chú giải thang màu bản đồ nhiệt">
                  <span>Thang màu số lượt:</span>
                  {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                    <span key={step} className="legend-item">
                      <span
                        className="legend-swatch"
                        style={{
                          backgroundColor: heatCellBackground(
                            step === 0 ? 0 : Math.max(1, Math.round(step * maxHeatCount)),
                            maxHeatCount
                          ),
                          border: '1px solid #d1d5db',
                        }}
                      />
                      <span>{step === 0 ? '0' : `${Math.round(step * maxHeatCount)}`}</span>
                    </span>
                  ))}
                </div>

                <div className="heatmap-scroll">
                  <table className="heatmap-table">
                    <thead>
                      <tr>
                        <th className="heatmap-station-col">Trạm</th>
                        {Array.from({ length: 24 }, (_, h) => (
                          <th key={h}>{String(h).padStart(2, '0')}h</th>
                        ))}
                        <th>Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapRows.map((row) => (
                        <tr key={row.station_id}>
                          <td className="heatmap-station-col">
                            #{row.station_id} {row.station_name}
                          </td>
                          {row.hours.map((count, hour) => (
                            <td
                              key={hour}
                              tabIndex={0}
                              className="heatmap-cell"
                              style={{
                                backgroundColor: heatCellBackground(count, maxHeatCount),
                                color: count > maxHeatCount * 0.65 ? '#ffffff' : '#111827',
                              }}
                              onMouseEnter={() =>
                                setHoveredCell({
                                  station: row.station_name,
                                  hour,
                                  count,
                                })
                              }
                              onFocus={() =>
                                setHoveredCell({
                                  station: row.station_name,
                                  hour,
                                  count,
                                })
                              }
                              onMouseLeave={() => setHoveredCell(null)}
                            >
                              {count}
                            </td>
                          ))}
                          <td>
                            <strong>{row.total}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {hoveredCell && (
                  <div className="chart-tooltip" role="status">
                    Trạm: <strong>{hoveredCell.station}</strong> · Khung giờ:{' '}
                    <strong>
                      {String(hoveredCell.hour).padStart(2, '0')}:00–
                      {String(hoveredCell.hour).padStart(2, '0')}:59 (giờ VN)
                    </strong>{' '}
                    · Số lượt thuê: <strong>{hoveredCell.count}</strong>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card stack-md">
            <div className="card-header">
              <h3>Thời gian xe nằm chờ trung bình theo trạm — Top 15 (Q8)</h3>
              <span className="muted">
                Phạm vi đo: <code>{idleQuery.data?.coverage || 'OBSERVED_RETURN_PICKUP_PAIRS'}</code>
              </span>
            </div>

            {idleQuery.loading ? (
              <LoadingState />
            ) : idleQuery.error ? (
              <ErrorState error={idleQuery.error} onRetry={idleQuery.reload} />
            ) : idleItems.length === 0 ? (
              <EmptyState title="Chưa có cặp trả–nhận xe quan sát được trong khoảng ngày này" />
            ) : (
              <div className="hbar-list">
                {idleItems.map((item) => {
                  const pct = Math.max(4, Math.round((item.average_idle_minutes / maxIdleMinutes) * 100));
                  return (
                    <div key={item.station_id} className="hbar-row">
                      <span>
                        #{item.station_id} {item.station_name}
                      </span>
                      <div className="hbar-track">
                        <div className="hbar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <strong>{formatMinutes(item.average_idle_minutes)}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'routes' && (
        <div className="card stack-md">
          <h3>Top 3 tuyến đường phổ biến mỗi tháng (Q5 — RANK theo tháng)</h3>
          <DataTable
            columns={routeColumns}
            rows={routesQuery.data?.items || []}
            rowKey={(r, idx) => `${r.month}-${r.rank}-${r.pickup_station_id}-${r.return_station_id}-${idx}`}
            loading={routesQuery.loading}
            error={routesQuery.error}
            onRetry={routesQuery.reload}
            emptyTitle="Không có tuyến thuê nào trong khoảng ngày này"
          />
        </div>
      )}

      {activeTab === 'inactive' && (
        <div className="stack-md">
          <FilterBar
            onReset={() => {
              setInactiveDays('30');
              setAsOfDate('');
              setInactivePage(1);
            }}
          >
            <SelectField
              label="Số ngày không có chuyến (N)"
              value={inactiveDays}
              options={[
                { value: '14', label: '14 ngày' },
                { value: '30', label: '30 ngày (Mặc định)' },
                { value: '60', label: '60 ngày' },
                { value: '90', label: '90 ngày' },
              ]}
              onChange={(e) => {
                setInactiveDays(e.target.value);
                setInactivePage(1);
              }}
            />
            <TextField
              label="Mốc ngày đánh giá (as_of_date)"
              type="date"
              value={asOfDate}
              hint="Bỏ trống để lấy ngày có chuyến gần nhất trên máy chủ"
              onChange={(e) => {
                setAsOfDate(e.target.value);
                setInactivePage(1);
              }}
            />
          </FilterBar>

          <div className="card stack-sm">
            <p className="muted">
              Điều kiện: <code>CUSTOMER ACTIVE</code>, <code>balance &gt; 0</code>, không có chuyến bắt đầu trong{' '}
              <strong>{inactiveQuery.data?.days || inactiveDays} ngày</strong> tính đến{' '}
              <strong>{inactiveQuery.data?.as_of_date || 'ngày gần nhất'}</strong>. Sắp xếp theo <code>balance DESC, user_id ASC</code>.
            </p>
            <DataTable
              columns={inactiveColumns}
              rows={inactiveQuery.data?.items || []}
              rowKey="user_id"
              loading={inactiveQuery.loading}
              error={inactiveQuery.error}
              onRetry={inactiveQuery.reload}
              meta={inactiveQuery.meta}
              onPageChange={setInactivePage}
              emptyTitle="Không có khách hàng nào thuộc nhóm lâu không đi"
            />
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="stack-md">
          {overviewQuery.loading ? (
            <LoadingState />
          ) : overviewQuery.error ? (
            <ErrorState error={overviewQuery.error} onRetry={overviewQuery.reload} />
          ) : overviewQuery.data ? (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <h4>Số chuyến đã bắt đầu</h4>
                  <p>{overviewQuery.data.trip_count}</p>
                </div>
                <div className="stat-card">
                  <h4>Doanh thu</h4>
                  <p>{formatVnd(overviewQuery.data.revenue)}</p>
                </div>
                <div className="stat-card">
                  <h4>Thời lượng trung bình</h4>
                  <p>{formatMinutes(overviewQuery.data.average_trip_minutes)}</p>
                </div>
                <div className="stat-card">
                  <h4>Số khách thuê</h4>
                  <p>{overviewQuery.data.customer_count}</p>
                </div>
              </div>

              <div className="stats-grid">
                {overviewQuery.data.vehicles_by_status.map((s) => (
                  <div key={s.status} className="stat-card">
                    <StatusBadge domain="vehicleStatus" value={s.status} />
                    <p style={{ marginTop: 8 }}>{s.count} xe</p>
                  </div>
                ))}
              </div>

              <div className="card">
                <h4>Ticket gần đây (Tối đa 5)</h4>
                <ul className="checklist" style={{ marginTop: 8 }}>
                  {overviewQuery.data.recent_tickets.map((t) => (
                    <li key={t.id}>
                      #{t.id} (Chuyến #{t.rental_id}): <strong>{t.title}</strong> —{' '}
                      <StatusBadge domain="ticketStatus" value={t.status} /> ({formatDateTimeVN(t.created_at)})
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
