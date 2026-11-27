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
import { listActiveEmployees } from '../../services/accountsApi';
import { listVehicles } from '../../services/fleetApi';
import { listMaintenanceOrders } from '../../services/operationsApi';
import { buildIdMap, getUserDisplay, getVehicleDisplay } from '../../utils/entityDisplay';
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
  const debouncedVehicleId = useDebouncedValue(vehicleId, 300);
  const debouncedIncidentId = useDebouncedValue(incidentId, 300);
  const debouncedAssignedTo = useDebouncedValue(assignedTo, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [actionModal, setActionModal] = useState(null);

  const { data, meta, loading, error, reload } = useApiQuery(
    ({ signal }) =>
      listMaintenanceOrders(
        {
          vehicle_id: isPositiveIdString(debouncedVehicleId)
            ? debouncedVehicleId.trim()
            : undefined,
          incident_id: isPositiveIdString(debouncedIncidentId)
            ? debouncedIncidentId.trim()
            : undefined,
          status: status || undefined,
          assigned_to: isPositiveIdString(debouncedAssignedTo)
            ? debouncedAssignedTo.trim()
            : undefined,
          page,
          page_size: pageSize,
        },
        { signal }
      ),
    [debouncedVehicleId, debouncedIncidentId, status, debouncedAssignedTo, page, pageSize]
  );

  const vehiclesLookupQuery = useApiQuery(
    ({ signal }) => listVehicles({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const employeesQuery = useApiQuery(({ signal }) => listActiveEmployees({ signal }), []);
  const vehicleMap = buildIdMap(vehiclesLookupQuery.data || []);
  const employeeMap = buildIdMap(employeesQuery.data || []);

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
      render: (m) => {
        const vehicle = getVehicleDisplay(vehicleMap, m.vehicle_id);
        return (
          <div>
            <Link to={`/admin/vehicles/${m.vehicle_id}`}>
              <strong>{vehicle.primary}</strong>
            </Link>
            {vehicle.secondary && <div className="muted">{vehicle.secondary}</div>}
            {m.incident_id && (
              <div className="muted">
                <Link to={`/admin/incidents/${m.incident_id}`}>Hồ sơ sự cố #{m.incident_id}</Link>
              </div>
            )}
          </div>
        );
      },
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
      render: (m) => {
        if (!m.assigned_to) return <span className="muted">Chưa phân công</span>;
        const staff = getUserDisplay(employeeMap, m.assigned_to, 'Nhân sự');
        return (
          <div>
            <div>{staff.primary}</div>
            {staff.secondary && <div className="muted">{staff.secondary}</div>}
          </div>
        );
      },
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
            Quản lý bảo trì định kỳ và bảo trì xe sau sự cố. Xe có phiếu đang mở hoặc đang sửa sẽ tạm khóa cho thuê cho đến khi được kiểm tra và mở lại.
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
            { value: 'OPEN', label: 'Chờ xử lý' },
            { value: 'IN_PROGRESS', label: 'Đang sửa chữa' },
            { value: 'COMPLETED', label: 'Hoàn tất' },
            { value: 'CANCELLED', label: 'Đã hủy' },
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
