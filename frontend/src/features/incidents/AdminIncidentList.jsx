import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  FilterBar,
  SelectField,
  StatusBadge,
  TextField,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { listUsers } from '../../services/accountsApi';
import { listAdminStations } from '../../services/fleetApi';
import { listIncidents } from '../../services/incidentsApi';
import { listRentals } from '../../services/rentalsApi';
import {
  buildIdMap,
  getBillingCutoffReasonLabel,
  getStationDisplayName,
  getUserDisplay,
} from '../../utils/entityDisplay';
import { formatDateTimeVN, formatVnd } from '../../utils/format';
import { isPositiveIdString } from '../../utils/validation';
import IncidentIntakeModal from './IncidentIntakeModal';

export default function AdminIncidentList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [rentalId, setRentalId] = useState(searchParams.get('rental_id') || '');
  const debouncedRentalId = useDebouncedValue(rentalId, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [intakeOpen, setIntakeOpen] = useState(false);

  const rentalsLookupQuery = useApiQuery(
    ({ signal }) => listRentals({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const usersLookupQuery = useApiQuery(
    ({ signal }) => listUsers({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const stationsLookupQuery = useApiQuery(
    ({ signal }) => listAdminStations({ page: 1, page_size: 100 }, { signal }),
    []
  );

  const rentalMap = buildIdMap(rentalsLookupQuery.data);
  const userMap = buildIdMap(usersLookupQuery.data);
  const stationMap = buildIdMap(stationsLookupQuery.data);

  const { data, meta, loading, error, reload } = useApiQuery(
    ({ signal }) =>
      listIncidents(
        {
          status: status || undefined,
          rental_id: isPositiveIdString(debouncedRentalId) ? debouncedRentalId.trim() : undefined,
          page,
          page_size: pageSize,
        },
        { signal }
      ),
    [status, debouncedRentalId, page, pageSize]
  );

  const resetFilters = () => {
    setStatus('');
    setRentalId('');
    setPage(1);
  };

  const columns = [
    {
      key: 'id',
      header: 'Hồ sơ & Xe máy điện',
      render: (inc) => {
        const rental = rentalMap.get(String(inc.rental_id));
        const vehicleTitle = rental?.vehicle_name || `Chuyến #${inc.rental_id}`;
        return (
          <div>
            <Link to={`/admin/incidents/${inc.id}`}>
              <strong>{vehicleTitle}</strong>
            </Link>
            <div className="muted">
              {rental?.vehicle_model_snapshot ? `${rental.vehicle_model_snapshot} · ` : ''}
              Mã hồ sơ #{inc.id}
            </div>
          </div>
        );
      },
    },
    {
      key: 'rental_id',
      header: 'Khách hàng & Chuyến thuê',
      render: (inc) => {
        const rental = rentalMap.get(String(inc.rental_id));
        const customer = rental ? getUserDisplay(userMap, rental.customer_id, 'Khách hàng') : null;
        return (
          <div>
            {customer ? (
              <Link to={`/admin/users/${rental.customer_id}`}>
                <strong>{customer.primary}</strong>
              </Link>
            ) : (
              <strong>Chuyến #{inc.rental_id}</strong>
            )}
            <div className="muted">
              <Link to={`/admin/rentals/${inc.rental_id}`}>Chuyến #{inc.rental_id}</Link>
              {customer?.secondary ? ` · ${customer.secondary}` : ''}
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái hồ sơ',
      render: (inc) => <StatusBadge domain="incidentStatus" value={inc.status} />,
    },
    {
      key: 'verified_outcome',
      header: 'Kết luận xác minh',
      render: (inc) =>
        inc.verified_outcome ? (
          <StatusBadge domain="incidentOutcome" value={inc.verified_outcome} />
        ) : (
          <span className="muted">Chờ quản lý xác minh</span>
        ),
    },
    {
      key: 'billing_cutoff_at',
      header: 'Mốc dừng cước',
      render: (inc) =>
        inc.billing_cutoff_at ? (
          <div>
            <div>{formatDateTimeVN(inc.billing_cutoff_at)}</div>
            <div className="muted">{getBillingCutoffReasonLabel(inc.billing_cutoff_reason)}</div>
          </div>
        ) : (
          'Chưa chốt'
        ),
    },
    {
      key: 'recovery',
      header: 'Thu hồi & Bàn giao trạm',
      render: (inc) => (
        <div>
          <div>Thu hồi: {inc.recovered_at ? formatDateTimeVN(inc.recovered_at) : 'Chưa thu hồi'}</div>
          <div className="muted">
            Về trạm:{' '}
            {inc.arrived_station_at ? (
              <>
                {getStationDisplayName(stationMap, inc.received_station_id)}{' '}
                {inc.recovery_condition && (
                  <StatusBadge domain="recoveryCondition" value={inc.recovery_condition} />
                )}
              </>
            ) : (
              'Chưa về trạm'
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'compensation',
      header: 'Bồi thường ngoài hệ thống',
      render: (inc) => (
        <div>
          <StatusBadge domain="agreementStatus" value={inc.agreement_status || 'PENDING'} />
          <div className="muted">
            {inc.compensation_assessed_amount !== null && inc.compensation_assessed_amount !== undefined
              ? formatVnd(inc.compensation_assessed_amount)
              : 'Chưa xác định'}
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (inc) => (
        <Link to={`/admin/incidents/${inc.id}`} className="btn btn-sm btn-primary">
          Xử lý hồ sơ
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Quản lý hồ sơ sự cố</h2>
          <p className="muted">
            Theo dõi toàn bộ quy trình xử lý nghi mất, trộm hoặc bỏ xe: tiếp nhận, xác minh, thu hồi về trạm, bảo trì, quyết toán và đóng hồ sơ.
          </p>
        </div>
        <Button variant="danger" onClick={() => setIntakeOpen(true)}>
          + Tiếp nhận sự cố mới
        </Button>
      </div>

      <FilterBar onReset={resetFilters}>
        <SelectField
          label="Trạng thái hồ sơ"
          value={status}
          placeholder="Tất cả"
          options={[
            { value: 'OPEN', label: 'Mới tạo' },
            { value: 'INVESTIGATING', label: 'Đang điều tra' },
            { value: 'CONFIRMED', label: 'Đã xác nhận' },
            { value: 'DISMISSED', label: 'Báo nhầm' },
            { value: 'CLOSED', label: 'Đã đóng hồ sơ' },
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="ID Chuyến thuê"
          type="search"
          placeholder="VD: 501"
          value={rentalId}
          onChange={(e) => {
            setRentalId(e.target.value);
            setPage(1);
          }}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data || []}
        loading={loading}
        error={error}
        onRetry={reload}
        meta={meta}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        emptyTitle="Chưa có hồ sơ sự cố nào"
        emptyHint="Nhấn '+ Tiếp nhận sự cố mới' hoặc chuyển từ màn hình Kiểm tra 24 giờ."
      />

      {intakeOpen && (
        <IncidentIntakeModal
          initialRentalId={rentalId}
          onClose={() => setIntakeOpen(false)}
          onSuccess={(incident) => {
            setIntakeOpen(false);
            navigate(`/admin/incidents/${incident.id}`);
          }}
        />
      )}
    </div>
  );
}
