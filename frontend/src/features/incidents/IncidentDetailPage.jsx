import React, { useEffect, useState } from 'react';
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
import { getUser, listActiveEmployees } from '../../services/accountsApi';
import { listAdminStations } from '../../services/fleetApi';
import {
  getIncident,
  getIncidentFinanceSummary,
  getIncidentRentPreview,
  listIncidentEvents,
} from '../../services/incidentsApi';
import { listMaintenanceOrders, listTickets } from '../../services/operationsApi';
import { getRental } from '../../services/rentalsApi';
import {
  buildIdMap,
  getBillingCutoffReasonLabel,
  getIncidentActionLabel,
  getReportSourceLabel,
  getStationDisplayName,
  getUserDisplay,
} from '../../utils/entityDisplay';
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
  const [releasedAtOverride, setReleasedAtOverride] = useState(null);

  useEffect(() => {
    setReleasedAtOverride(null);
  }, [incidentId]);

  const incidentQuery = useApiQuery(({ signal }) => getIncident(incidentId, { signal }), [incidentId]);
  const incident = incidentQuery.data;

  const rentalId = incident?.rental_id;
  const isConfirmedOrClosed =
    incident && ['CONFIRMED', 'CLOSED'].includes(incident.status) &&
    ['LOSS_THEFT', 'ABANDONMENT'].includes(incident.verified_outcome);

  const rentalQuery = useApiQuery(
    ({ signal }) => getRental(rentalId, { signal }),
    [rentalId],
    { enabled: Boolean(rentalId) }
  );
  const customerId = rentalQuery.data?.customer_id;
  const customerQuery = useApiQuery(
    ({ signal }) => getUser(customerId, { signal }),
    [customerId],
    { enabled: Boolean(customerId) }
  );
  const employeesQuery = useApiQuery(({ signal }) => listActiveEmployees({ signal }), []);
  const ticketsQuery = useApiQuery(
    ({ signal }) => listTickets({ rental_id: rentalId, page: 1, page_size: 100 }, { signal }),
    [rentalId],
    { enabled: Boolean(rentalId) }
  );
  const maintQuery = useApiQuery(
    ({ signal }) => listMaintenanceOrders({ incident_id: incidentId, page: 1, page_size: 50 }, { signal }),
    [incidentId],
    { enabled: Boolean(incidentId) }
  );
  const stationsQuery = useApiQuery(
    ({ signal }) => listAdminStations({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const eventsQuery = useApiQuery(
    ({ signal }) => listIncidentEvents(incidentId, { page: eventsPage, page_size: 20 }, { signal }),
    [incidentId, eventsPage]
  );

  // Chỉ tải thêm tối đa 100 sự kiện để tra dấu vết giải phóng xe khi xe đã về trạm và trang sự kiện hiện tại chưa có đủ toàn bộ lịch sử.
  const hasReleaseInCurrentPage = (eventsQuery.data || []).some(
    (e) => e.action === 'RENTAL_INCIDENT_VEHICLE_RELEASED'
  );
  const needExtendedReleaseLookup = Boolean(
    incident?.arrived_station_at &&
      !releasedAtOverride &&
      !hasReleaseInCurrentPage &&
      (eventsPage > 1 || (eventsQuery.meta?.total ?? 0) > 20)
  );
  const releaseLookupQuery = useApiQuery(
    ({ signal }) => listIncidentEvents(incidentId, { page: 1, page_size: 100 }, { signal }),
    [incidentId],
    { enabled: needExtendedReleaseLookup }
  );

  const rentPreviewQuery = useApiQuery(
    ({ signal }) => getIncidentRentPreview(incidentId, { signal }),
    [incidentId],
    { enabled: Boolean(isConfirmedOrClosed) }
  );
  const financeQuery = useApiQuery(
    ({ signal }) => getIncidentFinanceSummary(incidentId, { signal }),
    [incidentId],
    { enabled: Boolean(isConfirmedOrClosed) }
  );

  if (incidentQuery.loading) return <LoadingState />;
  if (incidentQuery.error) return <ErrorState error={incidentQuery.error} onRetry={incidentQuery.reload} />;
  if (!incident) return null;

  const rental = rentalQuery.data;
  const customer = customerQuery.data;
  const stations = stationsQuery.data || [];
  const stationMap = buildIdMap(stations);
  const employeeMap = buildIdMap(employeesQuery.data || []);
  const allTickets = ticketsQuery.data || [];
  const ticketMap = buildIdMap(allTickets);
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
    if (needExtendedReleaseLookup) {
      releaseLookupQuery.reload();
    }
    if (isConfirmedOrClosed) {
      rentPreviewQuery.reload();
      financeQuery.reload();
    }
  };

  // GET /rentals/{id} không trả về vehicle_released_at; đọc từ audit log RENTAL_INCIDENT_VEHICLE_RELEASED hoặc kết quả release gần nhất.
  const releaseEvent = [...(eventsQuery.data || []), ...(releaseLookupQuery.data || [])].find(
    (e) => e.action === 'RENTAL_INCIDENT_VEHICLE_RELEASED'
  );
  const vehicleReleasedAt =
    releasedAtOverride ||
    releaseEvent?.after_data?.physical_state?.vehicle_released_at ||
    releaseEvent?.created_at ||
    rental?.vehicle_released_at ||
    null;

  // Xác định điều kiện mở các thao tác theo trạng thái & quyền từ backend.
  const canCreateEvidence = ['INVESTIGATING', 'CONFIRMED', 'CLOSED'].includes(incident.status);
  const canVerify = isManager && incident.status === 'INVESTIGATING';
  const vehicleNotReleased = !vehicleReleasedAt;
  const canRecordRecovery = isConfirmedOrClosed && vehicleNotReleased && !incident.recovered_at;
  const canRecordArrival =
    isConfirmedOrClosed &&
    vehicleNotReleased &&
    Boolean(incident.recovered_at) &&
    !incident.arrived_station_at;
  const canCreateIncidentMaint =
    isConfirmedOrClosed && vehicleNotReleased && Boolean(incident.arrived_station_at);
  const canReleaseVehicle =
    isManager &&
    isConfirmedOrClosed &&
    vehicleNotReleased &&
    Boolean(incident.arrived_station_at) &&
    ['INTACT', 'REPAIRABLE'].includes(incident.recovery_condition);

  const canSettleRent =
    isManager &&
    incident.status === 'CONFIRMED' &&
    Boolean(incident.billing_cutoff_at) &&
    !incident.rent_settled_at &&
    Boolean(rentPreview);
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
    { key: 'id', header: 'Mã', render: (e) => `#${e.id}` },
    { key: 'action', header: 'Sự kiện', render: (e) => <strong>{getIncidentActionLabel(e.action)}</strong> },
    {
      key: 'actor_id',
      header: 'Người thực hiện',
      render: (e) => {
        if (!e.actor_id) return 'Hệ thống';
        return getUserDisplay(employeeMap, e.actor_id, 'Nhân sự').primary;
      },
    },
    {
      key: 'summary',
      header: 'Chi tiết ghi nhận',
      render: (e) => (
        <div className="muted">
          {e.after_data?.note || e.after_data?.reason || '—'}
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
    { key: 'id', header: 'Mã', render: (t) => <Link to={`/admin/tickets/${t.id}`}>#{t.id}</Link> },
    { key: 'title', header: 'Tiêu đề', render: (t) => <Link to={`/admin/tickets/${t.id}`}>{t.title}</Link> },
    { key: 'report_source', header: 'Nguồn', render: (t) => getReportSourceLabel(t.report_source) },
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
  const vehicleTitle = rental?.vehicle_name || (rental ? `Xe #${rental.vehicle_id}` : null);
  const validReportTicket = incident.valid_report_ticket_id
    ? ticketMap.get(String(incident.valid_report_ticket_id))
    : null;

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <Link to="/admin/incidents">← Quay lại danh sách hồ sơ sự cố</Link>
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <h2>
              Hồ sơ sự cố {vehicleTitle ? `— ${vehicleTitle}` : `#${incident.id}`}
            </h2>
            <StatusBadge domain="incidentStatus" value={incident.status} />
            {incident.verified_outcome && (
              <StatusBadge domain="incidentOutcome" value={incident.verified_outcome} />
            )}
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            Mã hồ sơ #{incident.id}
            {rental?.vehicle_model_snapshot ? ` · Dòng xe: ${rental.vehicle_model_snapshot}` : ''}
            {customer ? ` · Khách hàng: ${customer.name} (${customer.email})` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          <Link to={`/admin/rentals/${incident.rental_id}`} className="btn">
            Xem chuyến thuê (#{incident.rental_id})
          </Link>
          {rental && (
            <Link to={`/admin/vehicles/${rental.vehicle_id}`} className="btn">
              {vehicleTitle || `Xe #${rental.vehicle_id}`}
            </Link>
          )}
          {canCreateEvidence && (
            <Button onClick={() => setModal('evidence')}>+ Tạo yêu cầu bằng chứng</Button>
          )}
          {canVerify && (
            <Button variant="danger" onClick={() => setModal('verify')}>
              Quản lý xác minh kết luận
            </Button>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card stack-sm">
          <h3>Thông tin điều tra &amp; mốc dừng cước</h3>
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Khách hàng</dt>
              <dd>
                {customer ? (
                  <Link to={`/admin/users/${customer.id}`}>
                    <strong>{customer.name}</strong> ({customer.email})
                  </Link>
                ) : rental ? (
                  <Link to={`/admin/users/${rental.customer_id}`}>Khách hàng #{rental.customer_id}</Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Trạng thái chuyến thuê</dt>
              <dd>{rental ? <StatusBadge domain="rentalStatus" value={rental.status} /> : '—'}</dd>
            </div>
            <div className="detail-item">
              <dt>Mốc dừng cước</dt>
              <dd>
                {incident.billing_cutoff_at ? (
                  <>
                    <strong>{formatDateTimeVN(incident.billing_cutoff_at, { withSeconds: true })}</strong>
                    <div className="muted">
                      Căn cứ: {getBillingCutoffReasonLabel(incident.billing_cutoff_reason)}
                    </div>
                  </>
                ) : (
                  'Chưa chốt mốc dừng cước'
                )}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Lý do xác minh</dt>
              <dd>{incident.verification_reason || 'Chưa xác minh'}</dd>
            </div>
            <div className="detail-item">
              <dt>Báo cáo hợp lệ liên quan</dt>
              <dd>
                {incident.valid_report_ticket_id ? (
                  <Link to={`/admin/tickets/${incident.valid_report_ticket_id}`}>
                    {validReportTicket?.title
                      ? `${validReportTicket.title} (#${incident.valid_report_ticket_id})`
                      : `Yêu cầu #${incident.valid_report_ticket_id}`}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            {incident.closure_note && (
              <div className="detail-item">
                <dt>Ghi chú đóng hồ sơ ({formatDateTimeVN(incident.closed_at)})</dt>
                <dd>{incident.closure_note}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card stack-sm">
          <h3>Vòng đời vật lý của xe (Độc lập công nợ khách)</h3>
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Thu hồi ngoài hiện trường</dt>
              <dd>
                {incident.recovered_at ? (
                  <>
                    <div>{formatDateTimeVN(incident.recovered_at, { withSeconds: true })}</div>
                    {incident.recovery_note && (
                      <div className="muted">Ghi chú: {incident.recovery_note}</div>
                    )}
                  </>
                ) : (
                  'Chưa ghi nhận thu hồi'
                )}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Tiếp nhận về trạm &amp; Tình trạng</dt>
              <dd>
                {incident.arrived_station_at ? (
                  <>
                    <div>
                      {getStationDisplayName(stationMap, incident.received_station_id)} ·{' '}
                      <StatusBadge domain="recoveryCondition" value={incident.recovery_condition} />
                    </div>
                    {incident.inspection_note && (
                      <div className="muted">Kiểm tra: {incident.inspection_note}</div>
                    )}
                  </>
                ) : (
                  'Chưa về trạm'
                )}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Giải phóng xe cho thuê lại</dt>
              <dd>
                {vehicleReleasedAt ? (
                  <StatusBadge
                    label={`Đã giải phóng (${formatDateTimeVN(vehicleReleasedAt)})`}
                    tone="success"
                  />
                ) : incident.recovery_condition === 'UNREPAIRABLE' ? (
                  <StatusBadge label="Hư hỏng không sửa được — Không thể cho thuê lại" tone="danger" />
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
                Giải phóng xe cho thuê lại
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
              {incident.status === 'CONFIRMED' &&
                !incident.rent_settled_at &&
                !incident.billing_cutoff_at && (
                  <small>
                    Cần ghi nhận thu hồi ngoài hiện trường để chốt mốc dừng cước trước khi quyết toán tiền thuê.
                  </small>
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
              {incident.compensation_basis && (
                <small>Căn cứ: {incident.compensation_basis}</small>
              )}
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
              <h4>Điều kiện đóng hồ sơ sự cố</h4>
              {canClose && (
                <Button variant="danger" onClick={() => setModal('close')}>
                  Đóng hồ sơ sự cố
                </Button>
              )}
            </div>
            <ul className="checklist">
              <li className="row-wrap">
                <StatusBadge
                  label={financeSummary?.rent_settled ? 'Đạt' : 'Chưa xong'}
                  tone={financeSummary?.rent_settled ? 'success' : 'warning'}
                />
                <span>1. Đã quyết toán khoản tiền thuê của hồ sơ sự cố</span>
              </li>
              <li className="row-wrap">
                <StatusBadge
                  label={financeSummary?.deposit_remaining_held === '0.00' ? 'Đạt' : 'Chưa xong'}
                  tone={financeSummary?.deposit_remaining_held === '0.00' ? 'success' : 'warning'}
                />
                <span>
                  2. Tiền cọc đang giữ đã xử lý hoặc hoàn đủ về 0đ (hiện còn:{' '}
                  <strong>{formatVnd(financeSummary?.deposit_remaining_held)}</strong>)
                </span>
              </li>
              <li className="row-wrap">
                <StatusBadge
                  label={financeSummary?.external_compensation_settled ? 'Đạt' : 'Chưa xong'}
                  tone={financeSummary?.external_compensation_settled ? 'success' : 'warning'}
                />
                <span>
                  3. Đã ghi nhận kết quả bồi thường ngoài hệ thống (không yêu cầu bồi thường hoặc đã có chứng từ thanh toán)
                </span>
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
          onSuccess={(resData) => {
            setReleasedAtOverride(
              resData?.rental?.vehicle_released_at || new Date().toISOString()
            );
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
