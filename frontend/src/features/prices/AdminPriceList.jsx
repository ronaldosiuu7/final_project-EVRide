import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, FilterBar, TextField } from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import { useAuth } from '../../integrations/authBridge';
import { listPrices } from '../../services/fleetApi';
import { formatDateTimeVN, formatVnd } from '../../utils/format';
import { isPositiveIdString } from '../../utils/validation';
import PriceCreateModal from './PriceCreateModal';

export default function AdminPriceList() {
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');

  const [vehicleIdInput, setVehicleIdInput] = useState('');
  const [appliedVehicleId, setAppliedVehicleId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, meta, loading, error, reload } = useApiQuery(
    () =>
      listPrices({
        vehicle_id: isPositiveIdString(appliedVehicleId) ? appliedVehicleId : undefined,
        page,
        page_size: pageSize,
      }),
    [appliedVehicleId, page, pageSize]
  );

  const applyFilter = () => {
    setAppliedVehicleId(vehicleIdInput.trim());
    setPage(1);
  };

  const resetFilter = () => {
    setVehicleIdInput('');
    setAppliedVehicleId('');
    setPage(1);
  };

  const columns = [
    {
      key: 'vehicle_id',
      header: 'Xe máy điện',
      render: (p) => <Link to={`/admin/vehicles/${p.vehicle_id}`}>Xe #{p.vehicle_id}</Link>,
    },
    { key: 'version_number', header: 'Phiên bản', render: (p) => `v${p.version_number}` },
    {
      key: 'first30',
      header: 'Giá 30 phút đầu (Cũ → Mới)',
      render: (p) =>
        `${formatVnd(p.old_first_30_minutes_price)} → ${formatVnd(p.new_first_30_minutes_price)}`,
    },
    {
      key: 'extra',
      header: 'Giá mỗi phút thêm (Cũ → Mới)',
      render: (p) =>
        `${formatVnd(p.old_extra_minute_price)} → ${formatVnd(p.new_extra_minute_price)}`,
    },
    {
      key: 'deposit',
      header: 'Tiền cọc (Cũ → Mới)',
      render: (p) => `${formatVnd(p.old_deposit_amount)} → ${formatVnd(p.new_deposit_amount)}`,
    },
    { key: 'changed_by', header: 'Người áp dụng', render: (p) => `User #${p.changed_by}` },
    { key: 'created_at', header: 'Thời điểm áp dụng', render: (p) => formatDateTimeVN(p.created_at) },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Bảng giá theo xe (M5)</h2>
          <p className="muted">
            Để trống bộ lọc để xem phiên bản giá hiện hành của từng xe; nhập ID xe để xem toàn bộ lịch sử phiên bản (chỉ đọc).
          </p>
        </div>
        {isManager && (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + Áp dụng giá mới
          </Button>
        )}
      </div>

      <FilterBar onSubmit={applyFilter} onReset={resetFilter}>
        <TextField
          label="Lọc theo ID xe"
          type="search"
          placeholder="Nhập ID xe (VD: 101) để xem lịch sử..."
          value={vehicleIdInput}
          onChange={(e) => setVehicleIdInput(e.target.value)}
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
        emptyTitle="Chưa có phiên bản giá nào"
        emptyHint="Thử xóa bộ lọc ID xe hoặc tạo xe mới."
      />

      {createOpen && (
        <PriceCreateModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
