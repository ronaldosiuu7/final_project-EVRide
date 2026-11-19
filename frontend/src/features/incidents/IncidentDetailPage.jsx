import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  ErrorState,
  LoadingState,
  StatusBadge,
  Tabs,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import { useAuth } from '../../integrations/authBridge';
import { listAdminStations } from '../../services/fleetApi';
import {
  getIncident,
  getIncidentFinanceSummary,
  getIncidentRentPreview,
  listIncidentEvents,
} from '../../services/incidentsApi';
import { listMaintenanceOrders, listTickets } from '../../services/operationsApi';
import { getRental } from '../../services/rentalsApi';
import { formatDateTimeVN, formatDurationSeconds, formatVnd } from '../../utils/format';
import MaintenanceCreateModal from '../maintenance/MaintenanceCreateModal';
import {
  ArrivalModal,
  CloseIncidentModal,
  EvidenceTicketModal,
  ExternalCompensationModal,
  RecoveryModal,
  RefundDepositModal,
  ReleaseVehicleModal,
  SettleRentModal,
  VerifyIncidentModal,
} from './IncidentActionModals';

export default function IncidentDetailPage() {
  const { incidentId } = useParams();
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');

  const [activeTab, setActiveTab] = useState('overview');
  const [eventsPage, setEventsPage] = useState(1);
  const [modal, setModal] = useState(null);

  const incidentQuery = useApiQuery(() => getIncident(incidentId), [incidentId]);
  const incident = incidentQuery.data;

  const rentalId = incident?.rental_id;
  const isConfirmedOrClosed =
    incident && ['CONFIRMED', 'CLOSED'].includes(incident.status) &&
    ['LOSS_THEFT', 'ABANDONMENT'].includes(incident.verified_outcome);

  const rentalQuery = useApiQuery(() => getRental(rentalId), [rentalId], { enabled: Boolean(rentalId) });
  const ticketsQuery = useApiQuery(
    () => listTickets({ rental_id: rentalId, page: 1, page_size: 100 }),
    [rentalId],
    { enabled: Boolean(rentalId) }
  );
  const maintQuery = useApiQuery(
    () => listMaintenanceOrders({ incident_id: incidentId, page: 1, page_size: 50 }),
    [incidentId],
    { enabled: Boolean(incidentId) }
  );
  const stationsQuery = useApiQuery(() => listAdminStations({ page: 1, page_size: 100 }), []);
  const eventsQuery = useApiQuery(
    () => listIncidentEvents(incidentId, { page: eventsPage, page_size: 20 }),
    [incidentId, eventsPage]
  );

  const rentPreviewQuery = useApiQuery(
    () => getIncidentRentPreview(incidentId),
    [incidentId],
    { enabled: Boolean(isConfirmedOrClosed) }
  );
  const financeQuery = useApiQuery(
    () => getIncidentFinanceSummary(incidentId),
    [incidentId],
    { enabled: Boolean(isConfirmedOrClosed) }
  );

  if (incidentQuery.loading) return <LoadingState />;
  if (incidentQuery.error) return <ErrorState error={incidentQuery.error} onRetry={incidentQuery.reload} />;
  if (!incident) return null;

  const rental = rentalQuery.data;
  const stations = stationsQuery.data || [];
  const allTickets = ticketsQuery.data || [];
  const humanTickets = allTickets.filter(
    (t) =>
      ['CUSTOMER', 'STAFF'].includes(t.report_source) &&
      (t.check_cycle === null || t.check_cycle === undefined)
  );
  const maintenanceOrders = maintQuery.data || [];
  const completedOrders = maintenanceOrders.filter((o) => o.status === 'COMPLETED');

  const rentPreview = rentPreviewQuery.data;
  const financeSummary = financeQuery.data;

  const reloadAll = () => {
    incidentQuery.reload();
    rentalQuery.reload();
    ticketsQuery.reload();
    maintQuery.reload();
    eventsQuery.reload();
    if (isConfirmedOrClosed) {
      rentPreviewQuery.reload();
      financeQuery.reload();
    }
  };

  // Xác định điều kiện mở các thao tác theo trạng thái & quyền từ backend.
  const canCreateEvidence = ['INVESTIGATING', 'CONFIRMED', 'CLOSED'].includes(incident.status);
  const canVerify = isManager && incident.status === 'INVESTIGATING';
  const vehicleNotReleased = !rental || rental.vehicle_released_at === null;
  const canRecordRecovery = isConfirmedOrClosed && vehicleNotReleased && !incident.recovered_at;
  const canRecordArrival =
    isConfirmedOrClosed &&
    vehicleNotReleased &&
    Boolean(incident.recovered_at) &&
    !incident.arrived_station_at;
  const canCreateIncidentMaint =
    isConfirmedOrClosed && vehicleNotReleased && Boolean(incident.arrived_station_at);
  const canReleaseVehicle =
    isManager && isConfirmedOrClosed && vehicleNotReleased && Boolean(incident.arrived_station_at);

  const canSettleRent = isManager && isConfirmedOrClosed && !incident.rent_settled_at && Boolean(rentPreview);
  const canRefundDeposit =
    isManager &&
    isConfirmedOrClosed &&
    Boolean(financeSummary?.rent_settled) &&
    Number(financeSummary?.deposit_remaining_held || 0) > 0;
  const canSettleExternalComp =
    isManager &&
    incident.status === 'CONFIRMED' &&
    !incident.compensation_settled_at &&
    incident.agreement_status === 'PENDING';
  const canClose =
    isManager && incident.status === 'CONFIRMED' && Boolean(financeSummary?.can_close);

  const eventColumns = [
    { key: 'id', header: 'ID', render: (e) => `#${e.id}` },
    { key: 'action', header: 'Sự kiện', render: (e) => <code>{e.action}</code> },
    { key: 'actor_id', header: 'Người thực hiện', render: (e) => (e.actor_id ? `User #${e.actor_id}` : 'SYSTEM') },
    {
      key: 'summary',
      header: 'Chi tiết ghi nhận',
      render: (e) => (
        <div className="muted">
          {e.after_data?.note || e.after_data?.reason || e.after_data?.status || '—'}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Thời điểm (giờ VN)',
      render: (e) => formatDateTimeVN(e.created_at, { withSeconds: true }),
    },
  ];

  const ticketColumns = [
    { key: 'id', header: 'ID', render: (t) => <Link to={`/admin/tickets/${t.id}`}>#{t.id}</Link> },
    { key: 'title', header: 'Tiêu đề' },
    { key: 'report_source', header: 'Nguồn', render: (t) => <code>{t.report_source || 'LEGACY'}</code> },
    { key: 'received_at', header: 'Tiếp nhận lúc', render: (t) => formatDateTimeVN(t.received_at, { withSeconds: true }) },
    { key: 'status', header: 'Trạng thái', render: (t) => <StatusBadge domain="ticketStatus" value={t.status} /> },
  ];

  const maintColumns = [
    { key: 'id', header: 'Phiếu', render: (m) => `#${m.id}` },
    { key: 'title', header: 'Nội dung bảo trì' },
    { key: 'status', header: 'Trạng thái', render: (m) => <StatusBadge domain="maintenanceStatus" value={m.status} /> },
    { key: 'completed_at', header: 'Hoàn tất lúc', render: (m) => formatDateTimeVN(m.completed_at) },
    {
      key: 'actions',
      header: 'Xử lý',
      render: () => (
        <Link to={`/admin/maintenance?incident_id=${incident.id}`} className="btn btn-sm">
          Mở danh sách bảo trì
        </Link>
      ),
    },
  ];

  const compAmount = financeSummary?.compensation_amount ?? incident.compensation_assessed_amount;

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <Link to="/admin/incidents">← Quay lại danh sách hồ sơ sự cố</Link>
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <h2>Hồ sơ sự cố #{incident.id}</h2>
            <StatusBadge domain="incidentStatus" value={incident.status} />
            {incident.verified_outcome && (
              <StatusBadge domain="incidentOutcome" value={incident.verified_outcome} />
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <Link to={`/admin/rentals/${incident.rental_id}`} className="btn">
            Chuyến #{incident.rental_id}
          </Link>
          {rental && (
            <Link to={`/admin/vehicles/${rental.vehicle_id}`} className="btn">
              Xe #{rental.vehicle_id}
            </Link>
          )}
          {canCreateEvidence && (
            <Button onClick={() => setModal('evidence')}>+ Tạo ticket bằng chứng</Button>
          )}
          {canVerify && (
            <Button variant="danger" onClick={() => setModal('verify')}>
              MANAGER xác minh kết luận
            </Button>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card stack-sm">
          <h3>Thông tin điều tra &amp; mốc dừng cước</h3>
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Trạng thái chuyến thuê</dt>
              <dd>{rental ? <StatusBadge domain="rentalStatus" value={rental.status} /> : '—'}</dd>
            </div>
            <div className="detail-item">
              <dt>Mốc dừng cước (Backend chốt)</dt>
              <dd>
                {incident.billing_cutoff_at ? (
                  <>
                    <strong>{formatDateTimeVN(incident.billing_cutoff_at, { withSeconds: true })}</strong>
                    <div className="muted">Lý do: <code>{incident.billing_cutoff_reason}</code></div>
                  </>
                ) : (
                  'Chưa chốt mốc dừng cước'
                )}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Lý do xác minh (MANAGER)</dt>
              <dd>{incident.verification_reason || 'Chưa xác minh'}</dd>
            </div>
            <div className="detail-item">
              <dt>Ticket báo cáo hợp lệ</dt>
              <dd>
                {incident.valid_report_ticket_id ? (
                  <Link to={`/admin/tickets/${incident.valid_report_ticket_id}`}>
                    Ticket #{incident.valid_report_ticket_id}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card stack-sm">
          <h3>Vòng đời vật lý của xe (Độc lập công nợ khách)</h3>
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Thu hồi ngoài hiện trường</dt>
              <dd>
                {incident.recovered_at
                  ? formatDateTimeVN(incident.recovered_at, { withSeconds: true })
                  : 'Chưa ghi nhận thu hồi'}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Tiếp nhận về trạm &amp; Tình trạng</dt>
              <dd>
                {incident.arrived_station_at ? (
                  <>
                    Trạm #{incident.received_station_id} ·{' '}
                    <StatusBadge domain="recoveryCondition" value={incident.recovery_condition} />
                  </>
                ) : (
                  'Chưa về trạm'
                )}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Giải phóng xe cho thuê lại</dt>
              <dd>
                {rental?.vehicle_released_at ? (
                  <StatusBadge
                    label={`Đã giải phóng (${formatDateTimeVN(rental.vehicle_released_at)})`}
                    tone="success"
                  />
                ) : (
                  'Chưa giải phóng khỏi hồ sơ sự cố'
                )}
              </dd>
            </div>
          </dl>

          <div className="row-wrap" style={{ marginTop: 8 }}>
            {canRecordRecovery && (
              <Button variant="primary" size="sm" onClick={() => setModal('recovery')}>
                Ghi nhận thu hồi hiện trường
              </Button>
            )}
            {canRecordArrival && (
              <Button variant="primary" size="sm" onClick={() => setModal('arrival')}>
                Tiếp nhận xe về trạm
              </Button>
            )}
            {canCreateIncidentMaint && (
              <Button size="sm" onClick={() => setModal('createMaint')}>
                + Mở phiếu bảo trì sự cố
              </Button>
            )}
            {canReleaseVehicle && (
              <Button variant="primary" size="sm" onClick={() => setModal('release')}>
                MANAGER giải phóng xe
              </Button>
            )}
          </div>
        </div>
      </div>

      {isConfirmedOrClosed && (
        <div className="stack-md">
          <h3 className="section-title">Tài chính sự cố (Tách biệt: Tiền thuê / Tiền cọc / Bồi thường ngoài hệ thống)</h3>

          {(rentPreviewQuery.error || financeQuery.error) && (
            <ErrorState
              error={rentPreviewQuery.error || financeQuery.error}
              onRetry={reloadAll}
            />
          )}

          <div className="stats-grid">
            <div className="stat-card stack-sm">
              <h4>1. Tiền thuê sự cố (Không áp khuyến mãi)</h4>
              <p>{formatVnd(rentPreview?.rent_amount ?? financeSummary?.rent_paid)}</p>
              {rentPreview?.status === 'UNSETTLED' && (
                <small>
                  {rentPreview.is_estimate ? 'Tạm tính đến hiện tại' : 'Chốt theo cutoff'}:{' '}
                  {formatDurationSeconds(rentPreview.elapsed_seconds)}
                </small>
              )}
              {financeSummary?.rent_settled ? (
                <StatusBadge label="Đã quyết toán tiền thuê" tone="success" />
              ) : (
                <StatusBadge label="Chưa quyết toán tiền thuê" tone="warning" />
              )}
              {canSettleRent && (
                <Button size="sm" variant="primary" onClick={() => setModal('settleRent')}>
                  Quyết toán tiền thuê
                </Button>
              )}
            </div>

            <div className="stat-card stack-sm">
              <h4>2. Tiền cọc (Chỉ cấn thuê &amp; hoàn dư)</h4>
              <p>{formatVnd(financeSummary?.deposit_remaining_held ?? rental?.deposit_held)}</p>
              <small>
                Cọc gốc: {formatVnd(rental?.deposit_amount_snapshot)} ·{' '}
                {rentPreview?.deposit_to_apply ? `Cấn thuê dự kiến: ${formatVnd(rentPreview.deposit_to_apply)}` : 'Còn giữ hiện tại'}
              </small>
              {canRefundDeposit && (
                <Button size="sm" variant="primary" onClick={() => setModal('refundDeposit')}>
                  Hoàn cọc dư ({formatVnd(financeSummary.deposit_remaining_held)})
                </Button>
              )}
            </div>

            <div className="stat-card stack-sm">
              <h4>3. Bồi thường ngoài hệ thống</h4>
              <p>
                {compAmount === null || compAmount === undefined
                  ? 'Chưa xác định'
                  : formatVnd(compAmount)}
              </p>
              <div>
                <StatusBadge
                  domain="agreementStatus"
                  value={financeSummary?.agreement_status || incident.agreement_status || 'PENDING'}
                />
              </div>
              <small>Không trừ hoặc hoàn bồi thường qua ví / cọc nội bộ.</small>
              {canSettleExternalComp && (
                <Button size="sm" variant="primary" onClick={() => setModal('compensation')}>
                  Ghi nhận kết quả ngoài hệ thống
                </Button>
              )}
            </div>
          </div>

          <div className="card stack-md">
            <div className="card-header">
              <h4>Điều kiện đóng hồ sơ sự cố (<code>CLOSED_INCIDENT</code>)</h4>
              {canClose && (
                <Button variant="danger" onClick={() => setModal('close')}>
                  Đóng hồ sơ sự cố
                </Button>
              )}
            </div>
            <ul className="checklist">
              <li>
                {financeSummary?.rent_settled ? '✅' : '⏳'} 1. Đã quyết toán tiền thuê sự cố (<code>settle-rent</code>)
              </li>
              <li>
                {financeSummary?.deposit_remaining_held === '0.00' ? '✅' : '⏳'} 2. Tiền cọc còn giữ đã xử lý/hoàn hết về <code>0.00</code> (hiện còn: {formatVnd(financeSummary?.deposit_remaining_held)})
              </li>
              <li>
                {financeSummary?.external_compensation_settled ? '✅' : '⏳'} 3. Đã ghi nhận kết quả bồi thường ngoài hệ thống (<code>0.00 + NOT_REQUIRED</code> hoặc số dương + chứng từ thanh toán)
              </li>
            </ul>
          </div>
        </div>
      )}

      <div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: 'overview', label: 'Nhật ký sự kiện (Audit)', badge: eventsQuery.meta?.total },
            { key: 'tickets', label: 'Ticket bằng chứng của chuyến', badge: allTickets.length },
            { key: 'maintenance', label: 'Phiếu bảo trì sự cố', badge: maintenanceOrders.length },
          ]}
        />

        {activeTab === 'overview' && (
          <DataTable
            columns={eventColumns}
            rows={eventsQuery.data || []}
            loading={eventsQuery.loading}
            error={eventsQuery.error}
            onRetry={eventsQuery.reload}
            meta={eventsQuery.meta}
            onPageChange={setEventsPage}
            emptyTitle="Chưa có sự kiện nào"
          />
        )}

        {activeTab === 'tickets' && (
          <DataTable
            columns={ticketColumns}
            rows={allTickets}
            loading={ticketsQuery.loading}
            error={ticketsQuery.error}
            onRetry={ticketsQuery.reload}
            emptyTitle="Chưa có ticket bằng chứng nào cho chuyến này"
          />
        )}

        {activeTab === 'maintenance' && (
          <DataTable
            columns={maintColumns}
            rows={maintenanceOrders}
            loading={maintQuery.loading}
            error={maintQuery.error}
            onRetry={maintQuery.reload}
            emptyTitle="Chưa có phiếu bảo trì gắn với hồ sơ sự cố này"
          />
        )}
      </div>

      {modal === 'evidence' && (
        <EvidenceTicketModal
          incidentId={incident.id}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'verify' && (
        <VerifyIncidentModal
          incident={incident}
          humanTickets={humanTickets}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'recovery' && (
        <RecoveryModal
          incident={incident}
          humanTickets={humanTickets}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'arrival' && (
        <ArrivalModal
          incident={incident}
          humanTickets={humanTickets}
          stations={stations}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'createMaint' && rental && (
        <MaintenanceCreateModal
          initialVehicleId={rental.vehicle_id}
          initialIncidentId={incident.id}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'release' && (
        <ReleaseVehicleModal
          incident={incident}
          humanTickets={humanTickets}
          completedOrders={completedOrders}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'settleRent' && rentPreview && (
        <SettleRentModal
          incident={incident}
          humanTickets={humanTickets}
          rentPreview={rentPreview}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'compensation' && (
        <ExternalCompensationModal
          incident={incident}
          humanTickets={humanTickets}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'refundDeposit' && financeSummary && (
        <RefundDepositModal
          incident={incident}
          humanTickets={humanTickets}
          financeSummary={financeSummary}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
      {modal === 'close' && (
        <CloseIncidentModal
          incident={incident}
          humanTickets={humanTickets}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}
