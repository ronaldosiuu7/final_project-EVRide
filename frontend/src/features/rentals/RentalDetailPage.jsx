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
import { getUser, listActiveEmployees } from '../../services/accountsApi';
import { listAdminStations } from '../../services/fleetApi';
import {
  getRental,
  getRentalInvoice,
  getRentalReview,
  listRentalHandovers,
  listRentalTransactions,
} from '../../services/rentalsApi';
import { buildIdMap, getStationDisplayName, getUserDisplay } from '../../utils/entityDisplay';
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

  const rentalQuery = useApiQuery(({ signal }) => getRental(rentalId, { signal }), [rentalId]);
  const rental = rentalQuery.data;
  const canHaveInvoice = Boolean(
    rental && ['COMPLETED', 'STOLEN', 'INCIDENT_PENDING', 'CLOSED_INCIDENT'].includes(rental.status)
  );
  const canHaveReview = rental?.status === 'COMPLETED';

  const stationsQuery = useApiQuery(
    ({ signal }) => listAdminStations({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const customerQuery = useApiQuery(
    ({ signal }) => getUser(rental.customer_id, { signal }),
    [rental?.customer_id],
    { enabled: Boolean(rental?.customer_id) }
  );
  const employeesQuery = useApiQuery(({ signal }) => listActiveEmployees({ signal }), []);
  const handoversQuery = useApiQuery(
    ({ signal }) => listRentalHandovers(rentalId, { page: 1, page_size: 20 }, { signal }),
    [rentalId],
    { enabled: Boolean(rentalId && activeTab === 'handovers') }
  );
  const txQuery = useApiQuery(
    ({ signal }) => listRentalTransactions(rentalId, { page: 1, page_size: 50 }, { signal }),
    [rentalId],
    { enabled: Boolean(rentalId && activeTab === 'handovers') }
  );
  const invoiceQuery = useApiQuery(
    ({ signal }) => getRentalInvoice(rentalId, { signal }),
    [rentalId],
    { enabled: Boolean(rentalId && activeTab === 'handovers' && canHaveInvoice) }
  );
  const reviewQuery = useApiQuery(
    ({ signal }) => getRentalReview(rentalId, { signal }),
    [rentalId],
    { enabled: Boolean(rentalId && activeTab === 'review' && canHaveReview) }
  );

  if (rentalQuery.loading) return <LoadingState />;
  if (rentalQuery.error) return <ErrorState error={rentalQuery.error} onRetry={rentalQuery.reload} />;

  if (!rental) return null;

  const stations = stationsQuery.data || [];
  const stationMap = buildIdMap(stations);
  const employeeMap = buildIdMap(employeesQuery.data || []);
  const customer = customerQuery.data;
  const customerDisplay = customer?.name
    ? { primary: customer.name, secondary: customer.email || `Mã #${rental.customer_id}` }
    : { primary: `Khách hàng #${rental.customer_id}`, secondary: null };
  const vehicleTitle = rental.vehicle_name || `Xe #${rental.vehicle_id}`;

  const reloadAll = () => {
    rentalQuery.reload();
    handoversQuery.reload();
    txQuery.reload();
    invoiceQuery.reload();
    reviewQuery.reload();
  };

  const handoverColumns = [
    { key: 'id', header: 'Mã', render: (h) => `#${h.id}` },
    { key: 'kind', header: 'Loại biên bản', render: (h) => <StatusBadge domain="handoverKind" value={h.kind} /> },
    { key: 'time', header: 'Thời điểm', render: (h) => formatDateTimeVN(h.time, { withSeconds: true }) },
    { key: 'battery_percent', header: 'Pin', render: (h) => `${h.battery_percent}%` },
    {
      key: 'vehicle_condition',
      header: 'Tình trạng xe',
      render: (h) => (h.vehicle_condition ? <StatusBadge domain="vehicleCondition" value={h.vehicle_condition} /> : '—'),
    },
    {
      key: 'staff_id',
      header: 'Nhân viên',
      render: (h) => {
        const staff = getUserDisplay(employeeMap, h.staff_id, 'Nhân sự');
        return (
          <div>
            <div>{staff.primary}</div>
            {staff.secondary && <div className="muted">{staff.secondary}</div>}
          </div>
        );
      },
    },
    { key: 'note', header: 'Ghi chú', render: (h) => h.note || '—' },
  ];

  const txColumns = [
    { key: 'id', header: 'Mã', render: (t) => `#${t.id}` },
    { key: 'kind', header: 'Loại giao dịch', render: (t) => <StatusBadge domain="rentalTransactionKind" value={t.kind} /> },
    { key: 'amount', header: 'Số tiền', render: (t) => formatVnd(t.amount) },
    { key: 'status', header: 'Trạng thái', render: (t) => <StatusBadge domain="transactionStatus" value={t.status} /> },
    { key: 'invoice_id', header: 'Hóa đơn', render: (t) => (t.invoice_id ? `#${t.invoice_id}` : '—') },
    { key: 'created_at', header: 'Thời điểm', render: (t) => formatDateTimeVN(t.created_at, { withSeconds: true }) },
  ];

  const pickupStationName = getStationDisplayName(stationMap, rental.pickup_station_id);
  const returnStationName = rental.actual_return_station_id
    ? getStationDisplayName(stationMap, rental.actual_return_station_id)
    : '—';

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <Link to="/admin/rentals">← Quay lại danh sách chuyến thuê</Link>
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <h2>Chuyến thuê — {vehicleTitle}</h2>
            <StatusBadge domain="rentalStatus" value={rental.status} />
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            Mã chuyến #{rental.id}
            {customer?.name ? ` · Khách hàng: ${customer.name}` : ''}
            {rental.vehicle_model_snapshot ? ` · ${rental.vehicle_model_snapshot}` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          <Link to={`/admin/tickets?rental_id=${rental.id}`} className="btn">
            Xem yêu cầu hỗ trợ
          </Link>
          {['IN_RENT', 'RETURN_PENDING', 'STOLEN', 'INCIDENT_PENDING', 'COMPLETED'].includes(
            rental.status
          ) && (
            <Button onClick={() => setTicketModalOpen(true)}>+ Tạo yêu cầu hỗ trợ</Button>
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
                <Link to={`/admin/users/${rental.customer_id}`}>{customerDisplay.primary}</Link>
                {customerDisplay.secondary && <div className="muted">{customerDisplay.secondary}</div>}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Xe máy điện</dt>
              <dd>
                <Link to={`/admin/vehicles/${rental.vehicle_id}`}>{vehicleTitle}</Link>
                <div className="muted">Mã xe #{rental.vehicle_id}</div>
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
              <dt>Thời điểm nhận xe</dt>
              <dd>{formatDateTimeVN(rental.actual_start_time, { withSeconds: true })}</dd>
            </div>
            <div className="detail-item">
              <dt>Thời điểm tiếp nhận trả</dt>
              <dd>{formatDateTimeVN(rental.return_initiated_at || rental.actual_end_time, { withSeconds: true })}</dd>
            </div>
            <div className="detail-item">
              <dt>Thời điểm quyết toán</dt>
              <dd>{formatDateTimeVN(rental.settled_at, { withSeconds: true })}</dd>
            </div>
            <div className="detail-item">
              <dt>Thời lượng sử dụng</dt>
              <dd>{formatDurationSeconds(rental.elapsed_seconds)}</dd>
            </div>
          </dl>
        </div>

        <div className="card stack-sm">
          <h3>Biểu giá &amp; tiền cọc áp dụng</h3>
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Dòng xe</dt>
              <dd>{rental.vehicle_model_snapshot || '—'}</dd>
            </div>
            <div className="detail-item">
              <dt>Đơn vị tính cước</dt>
              <dd>30 phút đầu, sau đó tính theo từng phút thêm</dd>
            </div>
            <div className="detail-item">
              <dt>Giá 30 phút đầu</dt>
              <dd>{formatVnd(rental.first_30_minutes_price_snapshot)}</dd>
            </div>
            <div className="detail-item">
              <dt>Giá mỗi phút thêm</dt>
              <dd>{formatVnd(rental.extra_minute_price_snapshot)}</dd>
            </div>
            <div className="detail-item">
              <dt>Cọc quy định / Cọc đang giữ</dt>
              <dd>
                {formatVnd(rental.deposit_amount_snapshot)} / <strong>{formatVnd(rental.deposit_held)}</strong>
              </dd>
            </div>
            <div className="detail-item">
              <dt>Tổng tiền thuê</dt>
              <dd>
                <strong>{formatVnd(rental.total_price)}</strong>
              </dd>
            </div>
          </dl>
          {rental.cancellation_reason && (
            <div className="alert alert-warning">
              Lý do hủy: <strong>{rental.cancellation_reason === 'VEHICLE_FAULT' ? 'Lỗi xe' : rental.cancellation_reason === 'SYSTEM_ERROR' ? 'Lỗi hệ thống' : 'Khách hàng hủy'}</strong> · Miễn hạn mức:{' '}
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
            { key: 'gps', label: 'Định vị GPS' },
            { key: 'review', label: 'Đánh giá chuyến' },
          ]}
        />

        {activeTab === 'lifecycle' && (
          <div className="stack-md">
            <RentalLifecyclePanel rental={rental} stations={stations} onUpdated={reloadAll} />
            {!['RESERVED', 'IN_RENT', 'RETURN_PENDING'].includes(rental.status) && (
              <div className="alert alert-info">
                Chuyến thuê hiện không còn thao tác bàn giao hoặc trả xe thông thường.
                {rental.status === 'COMPLETED' &&
                  ' Nếu phát sinh phản ánh sau khi hoàn tất, nhân viên có thể tạo yêu cầu hỗ trợ hoặc phiếu bảo trì xe (không chỉnh sửa hóa đơn đã quyết toán).'}
              </div>
            )}
          </div>
        )}

        {activeTab === 'handovers' && (
          <div className="stack-lg">
            <div className="card stack-sm">
              <h3>Hóa đơn chuyến thuê</h3>
              {!canHaveInvoice ? (
                <p className="muted">Chuyến thuê ở trạng thái hiện tại chưa phát hành hóa đơn.</p>
              ) : invoiceQuery.loading ? (
                <LoadingState message="Đang kiểm tra hóa đơn..." />
              ) : invoiceQuery.error?.status === 404 ? (
                <p className="muted">Chuyến thuê chưa phát hành hóa đơn.</p>
              ) : invoiceQuery.error ? (
                <ErrorState error={invoiceQuery.error} onRetry={invoiceQuery.reload} />
              ) : invoiceQuery.data ? (
                <dl className="detail-grid">
                  <div className="detail-item">
                    <dt>Mã hóa đơn</dt>
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
                      <StatusBadge domain="invoiceStatus" value={invoiceQuery.data.status} />
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
              <h3>Biên bản bàn giao &amp; tiếp nhận</h3>
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
              <h3>Giao dịch tài chính của chuyến</h3>
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

        {activeTab === 'gps' && (
          <RentalGpsPanel
            rental={rental}
            pickupStation={stationMap.get(String(rental.pickup_station_id)) || null}
            returnStation={
              rental.actual_return_station_id
                ? stationMap.get(String(rental.actual_return_station_id)) || null
                : null
            }
          />
        )}

        {activeTab === 'review' && (
          <div className="card stack-sm">
            <h3>Đánh giá của khách hàng</h3>
            <p className="muted">
              Đánh giá chuyến đi được lưu nguyên trạng để phục vụ nâng cao chất lượng dịch vụ và không thể chỉnh sửa.
            </p>
            {!canHaveReview ? (
              <p className="muted">Chỉ các chuyến thuê đã hoàn tất quyết toán mới có đánh giá từ khách hàng.</p>
            ) : reviewQuery.loading ? (
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
