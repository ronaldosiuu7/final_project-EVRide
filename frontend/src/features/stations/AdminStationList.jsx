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
import { useAuth } from '../../integrations/authBridge';
import { listAdminStations } from '../../services/fleetApi';
import StationFormModal from './StationFormModal';

function formatOperatingHours(opensAt, closesAt) {
  if (!opensAt && !closesAt) return '24/7';
  return `${String(opensAt).slice(0, 5)} – ${String(closesAt).slice(0, 5)}`;
}

export default function AdminStationList() {
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');

  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingStation, setEditingStation] = useState(null);
  const [creating, setCreating] = useState(false);

  const { data, meta, loading, error, reload } = useApiQuery(
    () =>
      listAdminStations({
        status: status || undefined,
        q: query.trim() || undefined,
        page,
        page_size: pageSize,
      }),
    [status, query, page, pageSize]
  );

  const resetFilters = () => {
    setStatus('');
    setQuery('');
    setPage(1);
  };

  const columns = [
    { key: 'id', header: 'ID', render: (s) => `#${s.id}` },
    { key: 'name', header: 'Tên trạm' },
    { key: 'address', header: 'Địa chỉ' },
    {
      key: 'coords',
      header: 'Tọa độ',
      render: (s) => `${s.latitude}, ${s.longitude}`,
    },
    {
      key: 'hours',
      header: 'Giờ mở cửa',
      render: (s) => formatOperatingHours(s.opens_at, s.closes_at),
    },
    {
      key: 'spaces',
      header: 'Đang đỗ / Sức chứa',
      render: (s) => `${s.occupied_spaces} / ${s.capacity}`,
    },
    {
      key: 'available_spaces',
      header: 'Chỗ trống',
      render: (s) =>
        s.available_spaces <= 0 ? (
          <StatusBadge label={`Đầy (${s.available_spaces})`} tone="danger" />
        ) : s.available_spaces === 1 ? (
          <StatusBadge label="Sắp đầy (1)" tone="warning" />
        ) : (
          <span>{s.available_spaces}</span>
        ),
    },
    {
      key: 'available_vehicle_count',
      header: 'Xe sẵn sàng thuê',
      render: (s) => (
        <Link to={`/admin/vehicles?station_id=${s.id}`}>
          {s.available_vehicle_count} xe
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (s) => <StatusBadge domain="stationStatus" value={s.status} />,
    },
    ...(isManager
      ? [
          {
            key: 'actions',
            header: 'Thao tác',
            render: (s) => (
              <Button size="sm" onClick={() => setEditingStation(s)}>
                Sửa trạm
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Quản lý trạm xe máy điện</h2>
          <p className="muted">
            Bao gồm cả trạm ACTIVE và INACTIVE từ API vận hành <code>GET /admin/stations</code>.
          </p>
        </div>
        <div className="page-header-actions">
          {isManager && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + Tạo trạm mới
            </Button>
          )}
        </div>
      </div>

      <FilterBar onReset={resetFilters}>
        <TextField
          label="Tìm tên hoặc địa chỉ"
          type="search"
          placeholder="Ví dụ: Cầu Giấy, Xuân Thủy..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Trạng thái"
          value={status}
          placeholder="Tất cả trạng thái"
          options={[
            { value: 'ACTIVE', label: 'Hoạt động (ACTIVE)' },
            { value: 'INACTIVE', label: 'Ngừng hoạt động (INACTIVE)' },
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
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
        emptyTitle="Không có trạm nào phù hợp"
        emptyHint="Thử xóa bộ lọc hoặc MANAGER tạo trạm mới."
        emptyAction={
          <Button size="sm" onClick={resetFilters}>
            Xóa bộ lọc
          </Button>
        }
      />

      {(creating || editingStation) && (
        <StationFormModal
          station={editingStation}
          onClose={() => {
            setCreating(false);
            setEditingStation(null);
          }}
          onSuccess={() => {
            setCreating(false);
            setEditingStation(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
