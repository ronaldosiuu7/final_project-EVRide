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
import { listActiveEmployees } from '../../services/accountsApi';
import {
  getVehicle,
  listAdminStations,
  listPrices,
  listVehicleMoveHistory,
} from '../../services/fleetApi';
import { buildIdMap, getStationDisplayName, getUserDisplay } from '../../utils/entityDisplay';
import { formatDateTimeVN, formatVnd } from '../../utils/format';
import PriceCreateModal from '../prices/PriceCreateModal';
import VehicleBatteryModal from './VehicleBatteryModal';
import VehicleFormModal from './VehicleFormModal';
import VehicleMoveModal from './VehicleMoveModal';
import VehicleStatusModal from './VehicleStatusModal';

export default function VehicleDetailPage() {
  const { vehicleId } = useParams();
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');

  const [activeTab, setActiveTab] = useState('prices');
  const [pricePage, setPricePage] = useState(1);
  const [movePage, setMovePage] = useState(1);

  const [editing, setEditing] = useState(false);
  const [batteryOpen, setBatteryOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const vehicleQuery = useApiQuery(() => getVehicle(vehicleId), [vehicleId]);
  const stationsQuery = useApiQuery(() => listAdminStations({ page: 1, page_size: 100 }), []);
  const employeesQuery = useApiQuery(({ signal }) => listActiveEmployees({ signal }), []);
  const pricesQuery = useApiQuery(
    () => listPrices({ vehicle_id: vehicleId, page: pricePage, page_size: 20 }),
    [vehicleId, pricePage]
  );
  const movesQuery = useApiQuery(
    () => listVehicleMoveHistory(vehicleId, { page: movePage, page_size: 20 }),
    [vehicleId, movePage]
  );

  if (vehicleQuery.loading) return <LoadingState />;
  if (vehicleQuery.error) return <ErrorState error={vehicleQuery.error} onRetry={vehicleQuery.reload} />;

  const vehicle = vehicleQuery.data;
  if (!vehicle) return null;

  const stations = stationsQuery.data || [];
  const stationMap = buildIdMap(stations);
  const employeeMap = buildIdMap(employeesQuery.data || []);
  const currentStation = vehicle.current_station_id
    ? stationMap.get(String(vehicle.current_station_id))
    : null;

  const atStation = vehicle.current_station_id !== null;
  const canMove = atStation && ['AVAILABLE', 'MAINTENANCE'].includes(vehicle.status);
  const canMaintenance = atStation && vehicle.status === 'AVAILABLE';
  const canReopen = isManager && atStation && vehicle.status === 'MAINTENANCE';
  const canBattery = !['STOLEN', 'SUSPECTED_STOLEN'].includes(vehicle.status);

  const reloadAll = () => {
    vehicleQuery.reload();
    stationsQuery.reload();
    pricesQuery.reload();
    movesQuery.reload();
  };

  const priceColumns = [
    { key: 'version_number', header: 'Phiên bản', render: (p) => `v${p.version_number}` },
    {
      key: 'first_30',
      header: '30 phút đầu (Cũ → Mới)',
      render: (p) => `${formatVnd(p.old_first_30_minutes_price)} → ${formatVnd(p.new_first_30_minutes_price)}`,
    },
    {
      key: 'extra_min',
      header: 'Phút thêm (Cũ → Mới)',
      render: (p) => `${formatVnd(p.old_extra_minute_price)} → ${formatVnd(p.new_extra_minute_price)}`,
    },
    {
      key: 'deposit',
      header: 'Tiền cọc (Cũ → Mới)',
      render: (p) => `${formatVnd(p.old_deposit_amount)} → ${formatVnd(p.new_deposit_amount)}`,
    },
    {
      key: 'changed_by',
      header: 'Người áp dụng',
      render: (p) => {
        const actor = getUserDisplay(employeeMap, p.changed_by, 'Nhân sự');
        return (
          <div>
            <div>{actor.primary}</div>
            {actor.secondary && <div className="muted">{actor.secondary}</div>}
          </div>
        );
      },
    },
    { key: 'created_at', header: 'Thời điểm', render: (p) => formatDateTimeVN(p.created_at) },
  ];

  const moveColumns = [
    { key: 'id', header: 'Mã', render: (m) => `#${m.id}` },
    {
      key: 'from_station_id',
      header: 'Trạm nguồn',
      render: (m) => getStationDisplayName(stationMap, m.from_station_id),
    },
    {
      key: 'to_station_id',
      header: 'Trạm đích',
      render: (m) => getStationDisplayName(stationMap, m.to_station_id),
    },
    {
      key: 'actor_id',
      header: 'Người điều chuyển',
      render: (m) => {
        const actor = getUserDisplay(employeeMap, m.actor_id, 'Nhân sự');
        return (
          <div>
            <div>{actor.primary}</div>
            {actor.secondary && <div className="muted">{actor.secondary}</div>}
          </div>
        );
      },
    },
    { key: 'note', header: 'Ghi chú', render: (m) => m.note || '—' },
    { key: 'moved_at', header: 'Thời điểm', render: (m) => formatDateTimeVN(m.moved_at) },
  ];

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <Link to="/admin/vehicles">← Quay lại danh sách xe</Link>
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <h2>{vehicle.name}</h2>
            <StatusBadge domain="vehicleStatus" value={vehicle.status} />
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            Mã xe #{vehicle.id} · {vehicle.model}
          </p>
        </div>
        <div className="page-header-actions">
          {isManager && <Button onClick={() => setEditing(true)}>Sửa tên / dòng xe</Button>}
          <Button disabled={!canBattery} onClick={() => setBatteryOpen(true)}>
            Cập nhật pin
          </Button>
          <Button disabled={!canMove} onClick={() => setMoveOpen(true)}>
            Điều chuyển trạm
          </Button>
          {vehicle.status === 'MAINTENANCE' ? (
            <Button disabled={!canReopen} onClick={() => setStatusOpen(true)}>
              Mở lại cho thuê
            </Button>
          ) : (
            <Button disabled={!canMaintenance} onClick={() => setStatusOpen(true)}>
              Chuyển bảo trì
            </Button>
          )}
          {isManager && (
            <Button variant="primary" onClick={() => setPriceOpen(true)}>
              Áp dụng giá mới
            </Button>
          )}
        </div>
      </div>

      <div className="card">
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>Dòng xe</dt>
            <dd>{vehicle.model}</dd>
          </div>
          <div className="detail-item">
            <dt>Trạng thái</dt>
            <dd>
              <StatusBadge domain="vehicleStatus" value={vehicle.status} />
            </dd>
          </div>
          <div className="detail-item">
            <dt>Pin hiện tại</dt>
            <dd className={vehicle.battery_percent < 30 ? 'battery-low' : ''}>
              {vehicle.battery_percent}% {vehicle.battery_percent < 30 ? '(Dưới 30% — chặn thuê)' : ''}
            </dd>
          </div>
          <div className="detail-item">
            <dt>Trạm hiện tại</dt>
            <dd>
              {currentStation
                ? `${currentStation.name} (#${currentStation.id})`
                : vehicle.current_station_id
                  ? `#${vehicle.current_station_id}`
                  : 'Không ở trạm'}
            </dd>
          </div>
          <div className="detail-item">
            <dt>Giá 30 phút đầu</dt>
            <dd>{formatVnd(vehicle.first_30_minutes_price)}</dd>
          </div>
          <div className="detail-item">
            <dt>Giá mỗi phút thêm</dt>
            <dd>{formatVnd(vehicle.extra_minute_price)}</dd>
          </div>
          <div className="detail-item">
            <dt>Tiền cọc hiện hành</dt>
            <dd>{formatVnd(vehicle.deposit_amount)}</dd>
          </div>
          <div className="detail-item">
            <dt>Ngày tạo</dt>
            <dd>{formatDateTimeVN(vehicle.created_at)}</dd>
          </div>
        </dl>
      </div>

      <div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: 'prices', label: 'Lịch sử bảng giá (Chỉ đọc)', badge: pricesQuery.meta?.total },
            { key: 'moves', label: 'Lịch sử điều chuyển trạm', badge: movesQuery.meta?.total },
          ]}
        />

        {activeTab === 'prices' && (
          <div className="stack-sm">
            <div className="alert alert-info">
              Lịch sử giá được lưu cố định theo từng phiên bản. Giá mới chỉ áp dụng cho các lượt giữ và chuyến thuê tạo sau thời điểm cập nhật.
            </div>
            <DataTable
              columns={priceColumns}
              rows={pricesQuery.data || []}
              loading={pricesQuery.loading}
              error={pricesQuery.error}
              onRetry={pricesQuery.reload}
              meta={pricesQuery.meta}
              onPageChange={setPricePage}
              emptyTitle="Chưa có lịch sử phiên bản giá"
            />
          </div>
        )}

        {activeTab === 'moves' && (
          <DataTable
            columns={moveColumns}
            rows={movesQuery.data || []}
            loading={movesQuery.loading}
            error={movesQuery.error}
            onRetry={movesQuery.reload}
            meta={movesQuery.meta}
            onPageChange={setMovePage}
            emptyTitle="Xe chưa có lịch sử điều chuyển trạm"
          />
        )}
      </div>

      {editing && (
        <VehicleFormModal
          vehicle={vehicle}
          stations={stations}
          onClose={() => setEditing(false)}
          onSuccess={() => {
            setEditing(false);
            reloadAll();
          }}
        />
      )}
      {batteryOpen && (
        <VehicleBatteryModal
          vehicle={vehicle}
          onClose={() => setBatteryOpen(false)}
          onSuccess={() => {
            setBatteryOpen(false);
            reloadAll();
          }}
        />
      )}
      {moveOpen && (
        <VehicleMoveModal
          vehicle={vehicle}
          stations={stations}
          onClose={() => setMoveOpen(false)}
          onSuccess={() => {
            setMoveOpen(false);
            reloadAll();
          }}
        />
      )}
      {statusOpen && (
        <VehicleStatusModal
          vehicle={vehicle}
          onClose={() => setStatusOpen(false)}
          onSuccess={() => {
            setStatusOpen(false);
            reloadAll();
          }}
        />
      )}
      {priceOpen && (
        <PriceCreateModal
          initialVehicle={vehicle}
          onClose={() => setPriceOpen(false)}
          onSuccess={() => {
            setPriceOpen(false);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}
