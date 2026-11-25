import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { listDueCheckIns } from '../../services/rentalsApi';
import { formatDateTimeVN } from '../../utils/format';
import { isPositiveIdString } from '../../utils/validation';
import CheckInActionModal from './CheckInActionModal';

export default function AdminCheckInList() {
  const [rentalId, setRentalId] = useState('');
  const debouncedRentalId = useDebouncedValue(rentalId, 300);
  const [stationId, setStationId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedItem, setSelectedItem] = useState(null);
  const [lastEscalatedIncident, setLastEscalatedIncident] = useState(null);

  const stationsQuery = useApiQuery(
    ({ signal }) => listAdminStations({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const checkInsQuery = useApiQuery(
    ({ signal }) =>
      listDueCheckIns(
        {
          rental_id: isPositiveIdString(debouncedRentalId) ? debouncedRentalId.trim() : undefined,
          station_id: stationId || undefined,
          page,
          page_size: pageSize,
        },
        { signal }
      ),
    [debouncedRentalId, stationId, page, pageSize]
  );

  const stations = stationsQuery.data || [];

  const resetFilters = () => {
    setRentalId('');
    setStationId('');
    setPage(1);
  };

  const columns = [
    {
      key: 'rental_id',
      header: 'Chuyến thuê',
      render: (c) => <Link to={`/admin/rentals/${c.rental_id}`}>#{c.rental_id}</Link>,
    },
    {
      key: 'customer',
      header: 'Khách hàng',
      render: (c) => (
        <div>
          <Link to={`/admin/users/${c.customer_id}`}>{c.customer_name}</Link>
          <div className="muted">{c.customer_email}</div>
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: 'Xe máy điện',
      render: (c) => (
        <div>
          <Link to={`/admin/vehicles/${c.vehicle_id}`}>{c.vehicle_name}</Link>
          <div className="muted">{c.vehicle_model}</div>
        </div>
      ),
    },
    {
      key: 'pickup_station_name',
      header: 'Trạm nhận',
      render: (c) => `${c.pickup_station_name} (#${c.pickup_station_id})`,
    },
    {
      key: 'actual_start_time',
      header: 'Bắt đầu thuê',
      render: (c) => formatDateTimeVN(c.actual_start_time),
    },
    {
      key: 'due_at',
      header: 'Đến hạn kiểm tra / Lịch hẹn',
      render: (c) => (
        <div>
          <div>Đến hạn: <strong>{formatDateTimeVN(c.due_at)}</strong></div>
          <div className="muted">
            {c.next_check_at ? `Lịch hẹn lại: ${formatDateTimeVN(c.next_check_at)}` : `Mốc 24h đầu: ${formatDateTimeVN(c.first_due_at)}`}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái chuyến',
      render: (c) => <StatusBadge domain="rentalStatus" value={c.status} />,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (c) => (
        <Button size="sm" variant="primary" onClick={() => setSelectedItem(c)}>
          Ghi kết quả
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Danh sách kiểm tra sau 24 giờ từ pickup</h2>
          <p className="muted">
            Theo dõi chuyến <code>IN_RENT</code> đã qua mốc 24 giờ hoặc tới <code>next_check_at</code>.
          </p>
        </div>
      </div>

      <div className="alert alert-info">
        Danh sách <code>GET /rental-check-ins</code> là dữ liệu chỉ đọc. Ngưỡng 24 giờ không tự động phạt, không tạo trạng thái <code>OVERDUE</code> và không tự kết luận mất trộm.
      </div>

      {lastEscalatedIncident && (
        <div className="alert alert-warning row-wrap">
          <span>
            Đã mở hồ sơ sự cố <strong>#{lastEscalatedIncident.id}</strong> (trạng thái{' '}
            <code>{lastEscalatedIncident.status}</code>).
          </span>
          <Link to={`/admin/incidents/${lastEscalatedIncident.id}`} className="btn btn-sm btn-primary">
            Mở hồ sơ sự cố #{lastEscalatedIncident.id}
          </Link>
        </div>
      )}

      <FilterBar onReset={resetFilters}>
        <TextField
          label="Lọc ID chuyến thuê"
          type="search"
          placeholder="VD: 501"
          value={rentalId}
          onChange={(e) => {
            setRentalId(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Trạm nhận xe"
          value={stationId}
          placeholder="Tất cả trạm"
          options={stations.map((s) => ({ value: s.id, label: `#${s.id} - ${s.name}` }))}
          onChange={(e) => {
            setStationId(e.target.value);
            setPage(1);
          }}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={checkInsQuery.data || []}
        rowKey="rental_id"
        loading={checkInsQuery.loading}
        error={checkInsQuery.error}
        onRetry={checkInsQuery.reload}
        meta={checkInsQuery.meta}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        emptyTitle="Hiện không có chuyến thuê nào đến lịch kiểm tra 24 giờ"
        emptyHint="Các chuyến IN_RENT vượt mốc 24 giờ từ lúc pickup hoặc tới hẹn next_check_at sẽ tự xuất hiện tại đây."
      />

      {selectedItem && (
        <CheckInActionModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSuccess={(resData) => {
            if (resData?.incident) {
              setLastEscalatedIncident(resData.incident);
            }
            setSelectedItem(null);
            checkInsQuery.reload();
          }}
        />
      )}
    </div>
  );
}
