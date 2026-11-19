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
import { useAuth } from '../../integrations/authBridge';
import { listAdminStations, listVehicles } from '../../services/fleetApi';
import { formatVnd } from '../../utils/format';
import { STATUS_CONFIG } from '../../utils/statusConfig';
import { isPositiveIdString } from '../../utils/validation';
import VehicleFormModal from './VehicleFormModal';
import VehicleBatteryModal from './VehicleBatteryModal';
import VehicleMoveModal from './VehicleMoveModal';
import VehicleStatusModal from './VehicleStatusModal';

const VEHICLE_STATUS_OPTIONS = Object.keys(STATUS_CONFIG.vehicleStatus).map((key) => ({
  value: key,
  label: STATUS_CONFIG.vehicleStatus[key].label,
}));

export default function AdminVehicleList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');

  const [stationId, setStationId] = useState(searchParams.get('station_id') || '');
  const [status, setStatus] = useState('');
  const [model, setModel] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [creating, setCreating] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [batteryVehicle, setBatteryVehicle] = useState(null);
  const [movingVehicle, setMovingVehicle] = useState(null);
  const [statusVehicle, setStatusVehicle] = useState(null);

  const stationsQuery = useApiQuery(() => listAdminStations({ page: 1, page_size: 100 }), []);
  const vehiclesQuery = useApiQuery(
    () =>
      listVehicles({
        station_id: stationId || undefined,
        status: status || undefined,
        model: model.trim() || undefined,
        page,
        page_size: pageSize,
      }),
    [stationId, status, model, page, pageSize]
  );

  const stations = stationsQuery.data || [];
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  const reloadAll = () => {
    vehiclesQuery.reload();
    stationsQuery.reload();
  };

  const resetFilters = () => {
    setStationId('');
    setStatus('');
    setModel('');
    setPage(1);
  };

  const handleQuickLookup = (event) => {
    event.preventDefault();
    if (isPositiveIdString(lookupId)) {
      navigate(`/admin/vehicles/${lookupId.trim()}`);
    }
  };

  const columns = [
    {
      key: 'id',
      header: 'ID',
      render: (v) => <Link to={`/admin/vehicles/${v.id}`}>#{v.id}</Link>,
    },
    { key: 'name', header: 'Tên xe máy điện' },
    { key: 'model', header: 'Mẫu xe (model)' },
    {
      key: 'battery_percent',
      header: 'Pin',
      render: (v) => (
        <div>
          <span className={v.battery_percent < 30 ? 'battery-low' : ''}>
            {v.battery_percent}%
          </span>
          {v.battery_percent < 30 && <div className="muted">&lt; 30% (chặn thuê)</div>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (v) => <StatusBadge domain="vehicleStatus" value={v.status} />,
    },
    {
      key: 'station',
      header: 'Trạm hiện tại',
      render: (v) => {
        if (!v.current_station_id) return 'Không ở trạm';
        const st = stationMap.get(v.current_station_id);
        return st ? `${st.name} (#${st.id})` : `#${v.current_station_id}`;
      },
    },
    {
      key: 'pricing',
      header: '30p đầu / Phút thêm / Cọc',
      render: (v) => (
        <div>
          <div>{formatVnd(v.first_30_minutes_price)} / 30p</div>
          <div className="muted">
            +{formatVnd(v.extra_minute_price)}/p · Cọc {formatVnd(v.deposit_amount)}
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (v) => {
        const atStation = v.current_station_id !== null;
        const canMove = atStation && ['AVAILABLE', 'MAINTENANCE'].includes(v.status);
        const canMaintenance = atStation && v.status === 'AVAILABLE';
        const canReopen = isManager && atStation && v.status === 'MAINTENANCE';
        const canBattery = !['STOLEN', 'SUSPECTED_STOLEN'].includes(v.status);

        return (
          <div className="action-group">
            <Link to={`/admin/vehicles/${v.id}`} className="btn btn-sm">
              Chi tiết
            </Link>
            {isManager && (
              <Button size="sm" onClick={() => setEditingVehicle(v)}>
                Sửa
              </Button>
            )}
            <Button size="sm" disabled={!canBattery} onClick={() => setBatteryVehicle(v)}>
              Pin
            </Button>
            <Button size="sm" disabled={!canMove} onClick={() => setMovingVehicle(v)}>
              Điều chuyển
            </Button>
            {v.status === 'MAINTENANCE' ? (
              <Button
                size="sm"
                disabled={!canReopen}
                title={isManager ? 'Mở lại xe sau bảo trì' : 'Chỉ MANAGER được mở lại xe'}
                onClick={() => setStatusVehicle(v)}
              >
                Mở lại
              </Button>
            ) : (
              <Button size="sm" disabled={!canMaintenance} onClick={() => setStatusVehicle(v)}>
                Bảo trì
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Quản lý xe máy điện</h2>
          <p className="muted">
            Thay đổi giá/cọc tại tab Chi tiết xe hoặc màn hình Bảng giá (<code>/admin/prices</code>).
          </p>
        </div>
        <div className="page-header-actions">
          <form onSubmit={handleQuickLookup} className="row-wrap">
            <input
              type="search"
              aria-label="Mở nhanh theo ID xe"
              placeholder="Mở nhanh ID xe (VD: 101)"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
            />
            <Button type="submit" size="sm" disabled={!isPositiveIdString(lookupId)}>
              Xem xe
            </Button>
          </form>
          {isManager && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + Thêm xe mới
            </Button>
          )}
        </div>
      </div>

      <FilterBar onReset={resetFilters}>
        <SelectField
          label="Trạm hiện tại"
          value={stationId}
          placeholder="Tất cả trạm"
          options={stations.map((s) => ({
            value: s.id,
            label: `#${s.id} - ${s.name}`,
          }))}
          onChange={(e) => {
            setStationId(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Mẫu xe (model)"
          type="search"
          placeholder="Khớp chính xác mẫu xe..."
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Trạng thái"
          value={status}
          placeholder="Tất cả trạng thái"
          options={VEHICLE_STATUS_OPTIONS}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={vehiclesQuery.data || []}
        loading={vehiclesQuery.loading}
        error={vehiclesQuery.error}
        onRetry={reloadAll}
        meta={vehiclesQuery.meta}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        emptyTitle="Không tìm thấy xe máy điện phù hợp"
        emptyHint="Thử xóa bộ lọc hoặc thêm xe mới (MANAGER)."
        emptyAction={
          <Button size="sm" onClick={resetFilters}>
            Xóa bộ lọc
          </Button>
        }
      />

      {(creating || editingVehicle) && (
        <VehicleFormModal
          vehicle={editingVehicle}
          stations={stations}
          onClose={() => {
            setCreating(false);
            setEditingVehicle(null);
          }}
          onSuccess={() => {
            setCreating(false);
            setEditingVehicle(null);
            reloadAll();
          }}
        />
      )}

      {batteryVehicle && (
        <VehicleBatteryModal
          vehicle={batteryVehicle}
          onClose={() => setBatteryVehicle(null)}
          onSuccess={() => {
            setBatteryVehicle(null);
            reloadAll();
          }}
        />
      )}

      {movingVehicle && (
        <VehicleMoveModal
          vehicle={movingVehicle}
          stations={stations}
          onClose={() => setMovingVehicle(null)}
          onSuccess={() => {
            setMovingVehicle(null);
            reloadAll();
          }}
        />
      )}

      {statusVehicle && (
        <VehicleStatusModal
          vehicle={statusVehicle}
          onClose={() => setStatusVehicle(null)}
          onSuccess={() => {
            setStatusVehicle(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}
