import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { listAdminStations } from '../../services/fleetApi';
import { listRentals } from '../../services/rentalsApi';
import { formatDateTimeVN, formatDurationSeconds, formatVnd, toIsoWithVietnamOffset } from '../../utils/format';
import { STATUS_CONFIG } from '../../utils/statusConfig';
import { isPositiveIdString } from '../../utils/validation';

const RENTAL_STATUS_OPTIONS = Object.keys(STATUS_CONFIG.rentalStatus).map((key) => ({
  value: key,
  label: STATUS_CONFIG.rentalStatus[key].label,
}));

export default function AdminRentalList() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') || '');
  const [vehicleId, setVehicleId] = useState(searchParams.get('vehicle_id') || '');
  const debouncedCustomerId = useDebouncedValue(customerId, 300);
  const debouncedVehicleId = useDebouncedValue(vehicleId, 300);
  const [pickupStationId, setPickupStationId] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const stationsQuery = useApiQuery(
    ({ signal }) => listAdminStations({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const stations = stationsQuery.data || [];
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  const rentalsQuery = useApiQuery(
    ({ signal }) =>
      listRentals(
        {
          status: status || undefined,
          customer_id: isPositiveIdString(debouncedCustomerId)
            ? debouncedCustomerId.trim()
            : undefined,
          vehicle_id: isPositiveIdString(debouncedVehicleId)
            ? debouncedVehicleId.trim()
            : undefined,
          pickup_station_id: pickupStationId || undefined,
          created_from: createdFrom ? `${createdFrom}T00:00:00+07:00` : undefined,
          created_to: createdTo ? toIsoWithVietnamOffset(`${createdTo}T23:59:59`) : undefined,
          page,
          page_size: pageSize,
        },
        { signal }
      ),
    [
      status,
      debouncedCustomerId,
      debouncedVehicleId,
      pickupStationId,
      createdFrom,
      createdTo,
      page,
      pageSize,
    ]
  );

  const resetFilters = () => {
    setStatus('');
    setCustomerId('');
    setVehicleId('');
    setPickupStationId('');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
  };

  const columns = [
    {
      key: 'id',
      header: 'ID Chuyến',
      render: (r) => <Link to={`/admin/rentals/${r.id}`}>#{r.id}</Link>,
    },
    {
      key: 'customer_id',
      header: 'Khách hàng',
      render: (r) => <Link to={`/admin/users/${r.customer_id}`}>Khách #{r.customer_id}</Link>,
    },
    {
      key: 'vehicle',
      header: 'Xe máy điện (Snapshot)',
      render: (r) => (
        <div>
          <Link to={`/admin/vehicles/${r.vehicle_id}`}>
            {r.vehicle_name || `Xe #${r.vehicle_id}`}
          </Link>
          {r.vehicle_model_snapshot && <div className="muted">{r.vehicle_model_snapshot}</div>}
        </div>
      ),
    },
    {
      key: 'stations',
      header: 'Trạm nhận / Trả',
      render: (r) => {
        const pName = stationMap.get(r.pickup_station_id)?.name || `#${r.pickup_station_id}`;
        const rName = r.actual_return_station_id
          ? stationMap.get(r.actual_return_station_id)?.name || `#${r.actual_return_station_id}`
          : '—';
        return (
          <div>
            <div>Nhận: {pName}</div>
            <div className="muted">Trả: {rName}</div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (r) => (
        <div>
          <StatusBadge domain="rentalStatus" value={r.status} />
          {r.status === 'RESERVED' && (
            <div className="muted">Còn giữ: {formatDurationSeconds(r.remaining_hold_seconds)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'snapshot_money',
      header: 'Cọc giữ / Tổng tiền',
      render: (r) => (
        <div>
          <div>Cọc: {formatVnd(r.deposit_held)}</div>
          <div className="muted">Tổng: {formatVnd(r.total_price)}</div>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Tạo lúc',
      render: (r) => formatDateTimeVN(r.created_at),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (r) => (
        <Link to={`/admin/rentals/${r.id}`} className="btn btn-sm btn-primary">
          Xử lý / Chi tiết
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Lượt giữ xe &amp; chuyến thuê</h2>
          <p className="muted">
            Theo dõi toàn bộ lượt đặt, bàn giao nhận xe, tiếp nhận trả xe và quyết toán theo API <code>/rentals</code>.
          </p>
        </div>
      </div>

      <FilterBar onReset={resetFilters}>
        <SelectField
          label="Trạng thái"
          value={status}
          placeholder="Tất cả trạng thái"
          options={RENTAL_STATUS_OPTIONS}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="ID Khách hàng"
          type="search"
          placeholder="VD: 990001"
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="ID Xe"
          type="search"
          placeholder="VD: 992001"
          value={vehicleId}
          onChange={(e) => {
            setVehicleId(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Trạm nhận xe"
          value={pickupStationId}
          placeholder="Tất cả trạm"
          options={stations.map((s) => ({ value: s.id, label: `#${s.id} - ${s.name}` }))}
          onChange={(e) => {
            setPickupStationId(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Tạo từ ngày"
          type="date"
          value={createdFrom}
          onChange={(e) => {
            setCreatedFrom(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Tạo đến ngày"
          type="date"
          value={createdTo}
          onChange={(e) => {
            setCreatedTo(e.target.value);
            setPage(1);
          }}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rentalsQuery.data || []}
        loading={rentalsQuery.loading}
        error={rentalsQuery.error}
        onRetry={rentalsQuery.reload}
        meta={rentalsQuery.meta}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        emptyTitle="Chưa có lượt giữ hoặc chuyến thuê phù hợp"
        emptyHint="Thử xóa bộ lọc để xem toàn bộ danh sách."
        emptyAction={
          <Button size="sm" onClick={resetFilters}>
            Xóa bộ lọc
          </Button>
        }
      />
    </div>
  );
}
