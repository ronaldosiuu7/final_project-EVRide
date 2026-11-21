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
import { listMaintenanceOrders } from '../../services/operationsApi';
import { formatDateTimeVN } from '../../utils/format';
import { isPositiveIdString } from '../../utils/validation';
import MaintenanceActionModal from './MaintenanceActionModal';
import MaintenanceCreateModal from './MaintenanceCreateModal';

export default function AdminMaintenanceList() {
  const [searchParams] = useSearchParams();
  const [vehicleId, setVehicleId] = useState(searchParams.get('vehicle_id') || '');
  const [incidentId, setIncidentId] = useState(searchParams.get('incident_id') || '');
  const [status, setStatus] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [actionModal, setActionModal] = useState(null);

  const { data, meta, loading, error, reload } = useApiQuery(
    () =>
      listMaintenanceOrders({
        vehicle_id: isPositiveIdString(vehicleId) ? vehicleId.trim() : undefined,
        incident_id: isPositiveIdString(incidentId) ? incidentId.trim() : undefined,
        status: status || undefined,
        assigned_to: isPositiveIdString(assignedTo) ? assignedTo.trim() : undefined,
        page,
        page_size: pageSize,
      }),
    [vehicleId, incidentId, status, assignedTo, page, pageSize]
  );

  const resetFilters = () => {
    setVehicleId('');
    setIncidentId('');
    setStatus('');
    setAssignedTo('');
    setPage(1);
  };

  const columns = [
    { key: 'id', header: 'Phiếu', render: (m) => `#${m.id}` },
    {
      key: 'vehicle_id',
      header: 'Xe / Sự cố',
      render: (m) => (
        <div>
          <Link to={`/admin/vehicles/${m.vehicle_id}`}>Xe #{m.vehicle_id}</Link>
          {m.incident_id && (
            <div className="muted">
              <Link to={`/admin/incidents/${m.incident_id}`}>Sự cố #{m.incident_id}</Link>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Nội dung & Ghi chú xử lý',
      render: (m) => (
        <div>
          <strong>{m.title}</strong>
          <div className="muted">{m.description}</div>
          {m.resolution_note && (
            <div className="muted">
              <em>Kết quả: {m.resolution_note}</em>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'assigned_to',
      header: 'Phụ trách',
      render: (m) => (m.assigned_to ? `User #${m.assigned_to}` : 'Chưa gán'),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (m) => <StatusBadge domain="maintenanceStatus" value={m.status} />,
    },
    {
      key: 'times',
      header: 'Mốc thời gian',
      render: (m) => (
        <div>
          <div>Mở: {formatDateTimeVN(m.opened_at)}</div>
          {m.started_at && <div className="muted">Bắt đầu: {formatDateTimeVN(m.started_at)}</div>}
          {m.completed_at && (
            <div className="muted">Hoàn tất: {formatDateTimeVN(m.completed_at)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (m) => (
        <div className="action-group">
          {m.status === 'OPEN' && (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setActionModal({ order: m, actionType: 'start' })}
              >
                Bắt đầu
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setActionModal({ order: m, actionType: 'cancel' })}
              >
                Hủy phiếu
              </Button>
            </>
          )}
          {m.status === 'IN_PROGRESS' && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setActionModal({ order: m, actionType: 'complete' })}
            >
              Hoàn tất
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Phiếu bảo trì xe máy điện</h2>
          <p className="muted">
            Dùng chung cho xe thường và xe sự cố (có <code>incident_id</code>). Phiếu <code>OPEN</code>/<code>IN_PROGRESS</code> chặn thuê; hoàn tất không tự đặt xe <code>AVAILABLE</code>.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Tạo phiếu bảo trì
        </Button>
      </div>

      <FilterBar onReset={resetFilters}>
        <SelectField
          label="Trạng thái"
          value={status}
          placeholder="Tất cả"
          options={[
            { value: 'OPEN', label: 'Mở (OPEN)' },
            { value: 'IN_PROGRESS', label: 'Đang sửa (IN_PROGRESS)' },
            { value: 'COMPLETED', label: 'Hoàn tất (COMPLETED)' },
            { value: 'CANCELLED', label: 'Đã hủy (CANCELLED)' },
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="ID Xe"
          type="search"
          placeholder="VD: 992003"
          value={vehicleId}
          onChange={(e) => {
            setVehicleId(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="ID Hồ sơ sự cố"
          type="search"
          placeholder="VD: 12"
          value={incidentId}
          onChange={(e) => {
            setIncidentId(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="ID Nhân viên phụ trách"
          type="search"
          placeholder="VD: 990006"
          value={assignedTo}
          onChange={(e) => {
            setAssignedTo(e.target.value);
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
        emptyTitle="Chưa có phiếu bảo trì nào"
        emptyHint="Nhấn '+ Tạo phiếu bảo trì' hoặc thử xóa bộ lọc."
      />

      {creating && (
        <MaintenanceCreateModal
          initialVehicleId={vehicleId}
          initialIncidentId={incidentId}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {actionModal && (
        <MaintenanceActionModal
          order={actionModal.order}
          actionType={actionModal.actionType}
          onClose={() => setActionModal(null)}
          onSuccess={() => {
            setActionModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
