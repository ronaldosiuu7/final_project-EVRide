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
import { listTickets } from '../../services/operationsApi';
import { formatDateTimeVN } from '../../utils/format';
import { isPositiveIdString } from '../../utils/validation';
import TicketCreateModal from './TicketCreateModal';

export default function AdminTicketList() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [rentalId, setRentalId] = useState(searchParams.get('rental_id') || '');
  const [assignedTo, setAssignedTo] = useState('');
  const debouncedRentalId = useDebouncedValue(rentalId, 300);
  const debouncedAssignedTo = useDebouncedValue(assignedTo, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);

  const { data, meta, loading, error, reload } = useApiQuery(
    ({ signal }) =>
      listTickets(
        {
          status: status || undefined,
          rental_id: isPositiveIdString(debouncedRentalId) ? debouncedRentalId.trim() : undefined,
          assigned_to: isPositiveIdString(debouncedAssignedTo)
            ? debouncedAssignedTo.trim()
            : undefined,
          page,
          page_size: pageSize,
        },
        { signal }
      ),
    [status, debouncedRentalId, debouncedAssignedTo, page, pageSize]
  );

  const resetFilters = () => {
    setStatus('');
    setRentalId('');
    setAssignedTo('');
    setPage(1);
  };

  const columns = [
    {
      key: 'id',
      header: 'Ticket',
      render: (t) => <Link to={`/admin/tickets/${t.id}`}>#{t.id}</Link>,
    },
    {
      key: 'rental_id',
      header: 'Chuyến thuê',
      render: (t) => <Link to={`/admin/rentals/${t.rental_id}`}>#{t.rental_id}</Link>,
    },
    {
      key: 'title',
      header: 'Tiêu đề & Nguồn báo',
      render: (t) => (
        <div>
          <Link to={`/admin/tickets/${t.id}`}>
            <strong>{t.title}</strong>
          </Link>
          <div className="muted">
            Nguồn: <code>{t.report_source || 'LEGACY'}</code>
            {t.check_cycle ? ` · Cảnh báo chu kỳ ${t.check_cycle}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'assigned_to',
      header: 'Phụ trách',
      render: (t) => (t.assigned_to ? `User #${t.assigned_to}` : 'Chưa phân công'),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (t) => <StatusBadge domain="ticketStatus" value={t.status} />,
    },
    {
      key: 'created_at',
      header: 'Thời điểm tạo',
      render: (t) => formatDateTimeVN(t.created_at),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (t) => (
        <Link to={`/admin/tickets/${t.id}`} className="btn btn-sm btn-primary">
          Chi tiết / Xử lý
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Ticket hỗ trợ &amp; báo hỏng</h2>
          <p className="muted">
            Tiếp nhận, phân công, giải quyết theo luồng tuần tự <code>OPEN → IN_PROGRESS → RESOLVED → CLOSED</code> và đính kèm ảnh bằng chứng.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Tạo ticket mới
        </Button>
      </div>

      <FilterBar onReset={resetFilters}>
        <SelectField
          label="Trạng thái"
          value={status}
          placeholder="Tất cả"
          options={[
            { value: 'OPEN', label: 'Mới mở (OPEN)' },
            { value: 'IN_PROGRESS', label: 'Đang xử lý (IN_PROGRESS)' },
            { value: 'RESOLVED', label: 'Đã giải quyết (RESOLVED)' },
            { value: 'CLOSED', label: 'Đã đóng (CLOSED)' },
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
        emptyTitle="Chưa có ticket hỗ trợ nào"
        emptyHint="Thử xóa bộ lọc hoặc tạo ticket mới cho chuyến thuê."
      />

      {creating && (
        <TicketCreateModal
          initialRentalId={rentalId}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
