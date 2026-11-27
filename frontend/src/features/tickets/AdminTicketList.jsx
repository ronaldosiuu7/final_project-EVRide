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
import { listTickets } from '../../services/operationsApi';
import { listRentals } from '../../services/rentalsApi';
import { buildIdMap, getReportSourceLabel, getUserDisplay } from '../../utils/entityDisplay';
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

  const employeesQuery = useApiQuery(({ signal }) => listActiveEmployees({ signal }), []);
  const rentalsLookupQuery = useApiQuery(
    ({ signal }) => listRentals({ page: 1, page_size: 100 }, { signal }),
    []
  );
  const employeeMap = buildIdMap(employeesQuery.data || []);
  const rentalMap = buildIdMap(rentalsLookupQuery.data || []);

  const resetFilters = () => {
    setStatus('');
    setRentalId('');
    setAssignedTo('');
    setPage(1);
  };

  const columns = [
    {
      key: 'title',
      header: 'Yêu cầu hỗ trợ',
      render: (t) => (
        <div>
          <Link to={`/admin/tickets/${t.id}`}>
            <strong>{t.title}</strong>
          </Link>
          <div className="muted">
            Yêu cầu #{t.id} · {getReportSourceLabel(t.report_source)}
            {t.check_cycle ? ` · Nhắc kiểm tra lần ${t.check_cycle}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'rental_id',
      header: 'Chuyến thuê',
      render: (t) => {
        const rental = rentalMap.get(String(t.rental_id));
        return (
          <div>
            <Link to={`/admin/rentals/${t.rental_id}`}>
              {rental?.vehicle_name || `Chuyến #${t.rental_id}`}
            </Link>
            <div className="muted">
              Chuyến #{t.rental_id}
              {rental?.vehicle_model_snapshot ? ` · ${rental.vehicle_model_snapshot}` : ''}
            </div>
          </div>
        );
      },
    },
    {
      key: 'assigned_to',
      header: 'Phụ trách',
      render: (t) => {
        if (!t.assigned_to) return <span className="muted">Chưa phân công</span>;
        const staff = getUserDisplay(employeeMap, t.assigned_to, 'Nhân sự');
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
          <h2>Yêu cầu hỗ trợ &amp; báo hỏng</h2>
          <p className="muted">
            Tiếp nhận, phân công nhân viên phụ trách, cập nhật tiến trình xử lý và lưu ảnh bằng chứng cho từng chuyến thuê.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Tạo yêu cầu mới
        </Button>
      </div>

      <FilterBar onReset={resetFilters}>
        <SelectField
          label="Trạng thái"
          value={status}
          placeholder="Tất cả"
          options={[
            { value: 'OPEN', label: 'Mới mở' },
            { value: 'IN_PROGRESS', label: 'Đang xử lý' },
            { value: 'RESOLVED', label: 'Đã giải quyết' },
            { value: 'CLOSED', label: 'Đã đóng' },
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
        emptyTitle="Chưa có yêu cầu hỗ trợ nào"
        emptyHint="Thử xóa bộ lọc hoặc tạo yêu cầu hỗ trợ mới cho chuyến thuê."
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
