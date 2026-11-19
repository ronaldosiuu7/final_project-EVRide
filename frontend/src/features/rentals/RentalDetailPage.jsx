import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  ErrorState,
  LoadingState,
  StatusBadge,
  Tabs,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import { listAdminStations } from '../../services/fleetApi';
import {
  getRental,
  getRentalInvoice,
  getRentalReview,
  listRentalHandovers,
  listRentalTransactions,
} from '../../services/rentalsApi';
import { formatDateTimeVN, formatDurationSeconds, formatVnd } from '../../utils/format';
import IncidentIntakeModal from '../incidents/IncidentIntakeModal';
import TicketCreateModal from '../tickets/TicketCreateModal';
import RentalGpsPanel from './RentalGpsPanel';
import RentalLifecyclePanel from './RentalLifecyclePanel';

export default function RentalDetailPage() {
  const navigate = useNavigate();
  const { rentalId } = useParams();
  const [activeTab, setActiveTab] = useState('lifecycle');
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);

  const rentalQuery = useApiQuery(() => getRental(rentalId), [rentalId]);
  const stationsQuery = useApiQuery(() => listAdminStations({ page: 1, page_size: 100 }), []);
  const handoversQuery = useApiQuery(
    () => listRentalHandovers(rentalId, { page: 1, page_size: 20 }),
    [rentalId]
  );
  const txQuery = useApiQuery(
    () => listRentalTransactions(rentalId, { page: 1, page_size: 50 }),
    [rentalId]
  );
  const invoiceQuery = useApiQuery(() => getRentalInvoice(rentalId), [rentalId]);
  const reviewQuery = useApiQuery(() => getRentalReview(rentalId), [rentalId]);

  if (rentalQuery.loading) return <LoadingState />;
  if (rentalQuery.error) return <ErrorState error={rentalQuery.error} onRetry={rentalQuery.reload} />;

  const rental = rentalQuery.data;
  if (!rental) return null;

  const stations = stationsQuery.data || [];
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  const reloadAll = () => {
    rentalQuery.reload();
    handoversQuery.reload();
    txQuery.reload();
    invoiceQuery.reload();
    reviewQuery.reload();
  };

  const handoverColumns = [
    { key: 'id', header: 'ID', render: (h) => `#${h.id}` },
    { key: 'kind', header: 'Loại biên bản', render: (h) => <code>{h.kind}</code> },
    { key: 'time', header: 'Thời điểm', render: (h) => formatDateTimeVN(h.time, { withSeconds: true }) },
    { key: 'battery_percent', header: 'Pin', render: (h) => `${h.battery_percent}%` },
    { key: 'vehicle_condition', header: 'Tình trạng xe', render: (h) => h.vehicle_condition || '—' },
    { key: 'staff_id', header: 'Nhân viên', render: (h) => `User #${h.staff_id}` },
    { key: 'note', header: 'Ghi chú', render: (h) => h.note || '—' },
  ];

  const txColumns = [
    { key: 'id', header: 'ID', render: (t) => `#${t.id}` },
    { key: 'kind', header: 'Loại', render: (t) => <code>{t.kind}</code> },
    { key: 'amount', header: 'Số tiền', render: (t) => formatVnd(t.amount) },
    { key: 'status', header: 'Trạng thái', render: (t) => <StatusBadge domain="transactionStatus" value={t.status} /> },
    { key: 'invoice_id', header: 'Hóa đơn', render: (t) => (t.invoice_id ? `#${t.invoice_id}` : '—') },
    { key: 'created_at', header: 'Thời điểm', render: (t) => formatDateTimeVN(t.created_at, { withSeconds: true }) },
  ];

  const pickupStationName = stationMap.get(rental.pickup_station_id)?.name || `#${rental.pickup_station_id}`;
  const returnStationName = rental.actual_return_station_id
    ? stationMap.get(rental.actual_return_station_id)?.name || `#${rental.actual_return_station_id}`
    : '—';

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <Link to="/admin/rentals">← Quay lại danh sách chuyến thuê</Link>
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <h2>Chuyến thuê #{rental.id}</h2>
            <StatusBadge domain="rentalStatus" value={rental.status} />
          </div>
        </div>
        <div className="page-header-actions">
          <Link to={`/admin/tickets?rental_id=${rental.id}`} className="btn">
            Xem ticket của chuyến
          </Link>
          {['IN_RENT', 'RETURN_PENDING', 'STOLEN', 'INCIDENT_PENDING', 'COMPLETED'].includes(
            rental.status
          ) && (
            <Button onClick={() => setTicketModalOpen(true)}>+ Tạo ticket mới</Button>
          )}
          <Link to={`/admin/incidents?rental_id=${rental.id}`} className="btn">
            Kiểm tra hồ sơ sự cố
          </Link>
          {rental.status === 'IN_RENT' && (
            <Button variant="danger" onClick={() => setIncidentModalOpen(true)}>
              + Tiếp nhận sự cố
            </Button>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card stack-sm">
          <h3>Thông tin chuyến thuê &amp; các mốc thời gian</h3>
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Khách hàng</dt>
              <dd>
                <Link to={`/admin/users/${rental.customer_id}`}>Khách hàng #{rental.customer_id}</Link>
              </dd>
            </div>
            <div className="detail-item">
              <dt>Xe máy điện</dt>
              <dd>
                <Link to={`/admin/vehicles/${rental.vehicle_id}`}>
                  {rental.vehicle_name || `Xe #${rental.vehicle_id}`}
                </Link>
              </dd>
            </div>
            <div className="detail-item">
              <dt>Trạm nhận / Trạm trả thực tế</dt>
              <dd>
                {pickupStationName} → {returnStationName}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Tạo giữ chỗ / Hạn giữ (30 phút)</dt>
              <dd>
                {formatDateTimeVN(rental.created_at)} · Hạn: {formatDateTimeVN(rental.expires_at)}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Nhận xe (actual_start_time)</dt>
              <dd>{formatDateTimeVN(rental.actual_start_time, { withSeconds: true })}</dd>
            </div>
            <div className="detail-item">
              <dt>Tiếp nhận trả (return_initiated_at / actual_end_time)</dt>
              <dd>{formatDateTimeVN(rental.return_initiated_at || rental.actual_end_time, { withSeconds: true })}</dd>
            </div>
            <div className="detail-item">
              <dt>Quyết toán hóa đơn (settled_at)</dt>
              <dd>{formatDateTimeVN(rental.settled_at, { withSeconds: true })}</dd>
            </div>
            <div className="detail-item">
              <dt>Thời gian đã chạy (elapsed_seconds)</dt>
              <dd>{formatDurationSeconds(rental.elapsed_seconds)}</dd>
            </div>
          </dl>
        </div>

        <div className="card stack-sm">
          <h3>Snapshot giá/cọc tại thời điểm giữ xe</h3>
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Mẫu xe snapshot</dt>
              <dd>{rental.vehicle_model_snapshot || '—'}</dd>
            </div>
            <div className="detail-item">
              <dt>Chính sách / Đơn vị tính</dt>
              <dd>
                {rental.pricing_policy_version || '—'} · {rental.billing_unit || '—'}
              </dd>
            </div>
            <div className="detail-item">
              <dt>30 phút đầu (Snapshot)</dt>
              <dd>{formatVnd(rental.first_30_minutes_price_snapshot)}</dd>
            </div>
            <div className="detail-item">
              <dt>Mỗi phút thêm (Snapshot)</dt>
              <dd>{formatVnd(rental.extra_minute_price_snapshot)}</dd>
            </div>
            <div className="detail-item">
              <dt>Cọc quy định / Cọc đang giữ</dt>
              <dd>
                {formatVnd(rental.deposit_amount_snapshot)} / <strong>{formatVnd(rental.deposit_held)}</strong>
              </dd>
            </div>
            <div className="detail-item">
              <dt>Tổng tiền thuê (total_price)</dt>
              <dd>
                <strong>{formatVnd(rental.total_price)}</strong>
              </dd>
            </div>
          </dl>
          {rental.cancellation_reason && (
            <div className="alert alert-warning">
              Lý do hủy: <code>{rental.cancellation_reason}</code> · Miễn hạn mức:{' '}
              <strong>{rental.cancellation_limit_exempt ? 'Có' : 'Không'}</strong>
            </div>
          )}
        </div>
      </div>

      <div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: 'lifecycle', label: 'Thao tác bàn giao / trả / quyết toán' },
            { key: 'handovers', label: 'Biên bản & Giao dịch / Hóa đơn' },
            { key: 'gps', label: 'GPS mô phỏng' },
            { key: 'review', label: 'Đánh giá chuyến' },
          ]}
        />

        {activeTab === 'lifecycle' && (
          <div className="stack-md">
            <RentalLifecyclePanel rental={rental} stations={stations} onUpdated={reloadAll} />
            {!['RESERVED', 'IN_RENT', 'RETURN_PENDING'].includes(rental.status) && (
              <div className="alert alert-info">
                Chuyến đang ở trạng thái <code>{rental.status}</code>. Không còn thao tác pickup/trả xe thường.
                {rental.status === 'COMPLETED' &&
                  ' Với phản ánh phát sinh sau COMPLETED, nhân viên chỉ mở ticket/bảo trì xe, không sửa hóa đơn hoặc thu thêm tiền.'}
              </div>
            )}
          </div>
        )}

        {activeTab === 'handovers' && (
          <div className="stack-lg">
            <div className="card stack-sm">
              <h3>Hóa đơn chuyến thuê</h3>
              {invoiceQuery.loading ? (
                <LoadingState message="Đang kiểm tra hóa đơn..." />
              ) : invoiceQuery.error?.status === 404 ? (
                <p className="muted">Chuyến thuê chưa phát hành hóa đơn.</p>
              ) : invoiceQuery.error ? (
                <ErrorState error={invoiceQuery.error} onRetry={invoiceQuery.reload} />
              ) : invoiceQuery.data ? (
                <dl className="detail-grid">
                  <div className="detail-item">
                    <dt>ID Hóa đơn</dt>
                    <dd>#{invoiceQuery.data.id}</dd>
                  </div>
                  <div className="detail-item">
                    <dt>Tổng tiền hóa đơn</dt>
                    <dd>
                      <strong>{formatVnd(invoiceQuery.data.total_amount)}</strong>
                    </dd>
                  </div>
                  <div className="detail-item">
                    <dt>Trạng thái</dt>
                    <dd>
                      <StatusBadge domain="transactionStatus" value={invoiceQuery.data.status === 'PAID' ? 'SUCCESS' : invoiceQuery.data.status} label={invoiceQuery.data.status} />
                    </dd>
                  </div>
                  <div className="detail-item">
                    <dt>Ngày phát hành</dt>
                    <dd>{formatDateTimeVN(invoiceQuery.data.created_at, { withSeconds: true })}</dd>
                  </div>
                </dl>
              ) : null}
            </div>

            <div>
              <h3>Biên bản bàn giao (Handovers)</h3>
              <DataTable
                columns={handoverColumns}
                rows={handoversQuery.data || []}
                loading={handoversQuery.loading}
                error={handoversQuery.error}
                onRetry={handoversQuery.reload}
                emptyTitle="Chưa có biên bản bàn giao nào"
              />
            </div>

            <div>
              <h3>Giao dịch tài chính của chuyến (Transactions)</h3>
              <DataTable
                columns={txColumns}
                rows={txQuery.data || []}
                loading={txQuery.loading}
                error={txQuery.error}
                onRetry={txQuery.reload}
                emptyTitle="Chưa có giao dịch tài chính nào"
              />
            </div>
          </div>
        )}

        {activeTab === 'gps' && <RentalGpsPanel rental={rental} />}

        {activeTab === 'review' && (
          <div className="card stack-sm">
            <h3>Đánh giá của khách hàng (Chỉ đọc)</h3>
            <p className="muted">
              Theo quy định V1, đánh giá chuyến chỉ phục vụ xem theo quyền API; không công khai thông tin cá nhân và nhân viên không được chỉnh sửa đánh giá.
            </p>
            {reviewQuery.loading ? (
              <LoadingState />
            ) : reviewQuery.error?.status === 404 ? (
              <p className="muted">Chuyến này chưa có đánh giá từ khách hàng.</p>
            ) : reviewQuery.error ? (
              <ErrorState error={reviewQuery.error} onRetry={reviewQuery.reload} />
            ) : reviewQuery.data ? (
              <dl className="detail-grid">
                <div className="detail-item">
                  <dt>Số sao</dt>
                  <dd>
                    <strong>{reviewQuery.data.rating} / 5 ★</strong>
                  </dd>
                </div>
                <div className="detail-item">
                  <dt>Nhận xét</dt>
                  <dd>{reviewQuery.data.comment || 'Không có nhận xét'}</dd>
                </div>
                <div className="detail-item">
                  <dt>Thời điểm gửi</dt>
                  <dd>{formatDateTimeVN(reviewQuery.data.created_at)}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        )}
      </div>

      {ticketModalOpen && (
        <TicketCreateModal
          initialRentalId={String(rental.id)}
          onClose={() => setTicketModalOpen(false)}
          onSuccess={(ticket) => {
            setTicketModalOpen(false);
            if (ticket?.id) {
              navigate(`/admin/tickets/${ticket.id}`);
            }
          }}
        />
      )}

      {incidentModalOpen && (
        <IncidentIntakeModal
          initialRentalId={String(rental.id)}
          onClose={() => setIncidentModalOpen(false)}
          onSuccess={(incident) => {
            setIncidentModalOpen(false);
            if (incident?.id) {
              navigate(`/admin/incidents/${incident.id}`);
            }
          }}
        />
      )}
    </div>
  );
}
