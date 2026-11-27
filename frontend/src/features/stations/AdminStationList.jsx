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
import StationMap from '../../components/maps/StationMap.jsx';
import useApiQuery from '../../hooks/useApiQuery';
import useDebouncedValue from '../../hooks/useDebouncedValue';
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
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingStation, setEditingStation] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [selectedStationId, setSelectedStationId] = useState(null);

  const { data, meta, loading, error, reload } = useApiQuery(
    ({ signal }) =>
      listAdminStations(
        {
          status: status || undefined,
          q: debouncedQuery.trim() || undefined,
          page,
          page_size: pageSize,
        },
        { signal }
      ),
    [status, debouncedQuery, page, pageSize]
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
            Quản lý toàn bộ trạm đang hoạt động và tạm ngưng, theo dõi sức chứa, chỗ trả trống và số xe sẵn sàng.
          </p>
        </div>
        <div className="page-header-actions">
          <Button variant="secondary" onClick={() => setShowMap((v) => !v)}>
            {showMap ? 'Ẩn bản đồ' : 'Xem bản đồ trạm'}
          </Button>
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
            { value: 'ACTIVE', label: 'Đang hoạt động' },
            { value: 'INACTIVE', label: 'Ngừng hoạt động' },
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
      </FilterBar>

      {showMap && !loading && !error && (data || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <StationMap
            stations={data || []}
            mode="admin"
            selectedStationId={selectedStationId}
            onSelectStation={(st) => setSelectedStationId(String(st.id))}
            onEditStation={isManager ? (st) => setEditingStation(st) : null}
            heightVariant="compact"
            ariaLabel="Bản đồ giám sát mạng lưới trạm vận hành"
          />
        </div>
      )}

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
        emptyHint="Thử xóa bộ lọc hoặc tạo trạm mới."
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
