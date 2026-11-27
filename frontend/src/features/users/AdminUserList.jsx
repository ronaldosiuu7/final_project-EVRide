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
import { useAuth } from '../../integrations/authBridge';
import { listUsers } from '../../services/accountsApi';
import { formatDateTimeVN } from '../../utils/format';
import StaffCreateModal from './StaffCreateModal';
import UserEditModal from './UserEditModal';

export default function AdminUserList() {
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');

  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const { data, meta, loading, error, reload } = useApiQuery(
    ({ signal }) =>
      listUsers(
        {
          role: role || undefined,
          status: status || undefined,
          q: debouncedQuery.trim() || undefined,
          page,
          page_size: pageSize,
        },
        { signal }
      ),
    [role, status, debouncedQuery, page, pageSize]
  );

  const resetFilters = () => {
    setRole('');
    setStatus('');
    setQuery('');
    setPage(1);
  };

  const columns = [
    {
      key: 'id',
      header: 'ID',
      render: (u) => <Link to={`/admin/users/${u.id}`}>#{u.id}</Link>,
    },
    { key: 'name', header: 'Họ và tên' },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Vai trò',
      render: (u) => <StatusBadge domain="userRole" value={u.role} />,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (u) => <StatusBadge domain="userStatus" value={u.status} />,
    },
    {
      key: 'created_at',
      header: 'Ngày tạo',
      render: (u) => formatDateTimeVN(u.created_at),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (u) => (
        <div className="action-group">
          <Link to={`/admin/users/${u.id}`} className="btn btn-sm">
            Chi tiết / Ví
          </Link>
          {isManager && (
            <Button size="sm" onClick={() => setEditingUser(u)}>
              Cập nhật
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
          <h2>Quản lý tài khoản</h2>
          <p className="muted">
            Tra cứu thông tin khách hàng và nhân sự, cập nhật trạng thái hoạt động hoặc tạo mới tài khoản nhân viên vận hành.
          </p>
        </div>
        {isManager && (
          <Button variant="primary" onClick={() => setCreatingStaff(true)}>
            + Tạo tài khoản nhân sự
          </Button>
        )}
      </div>

      <FilterBar onReset={resetFilters}>
        <TextField
          label="Tìm tên hoặc email"
          type="search"
          placeholder="Nhập tên hoặc email..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Vai trò"
          value={role}
          placeholder="Tất cả vai trò"
          options={[
            { value: 'CUSTOMER', label: 'Khách hàng' },
            { value: 'STAFF', label: 'Nhân viên vận hành' },
            { value: 'MANAGER', label: 'Quản lý' },
          ]}
          onChange={(e) => {
            setRole(e.target.value);
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
            { value: 'BLOCKED', label: 'Đang bị khóa' },
            { value: 'BLACKLISTED', label: 'Hạn chế sử dụng' },
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
        emptyTitle="Không tìm thấy tài khoản nào"
        emptyHint="Thử xóa bộ lọc tìm kiếm."
      />

      {creatingStaff && (
        <StaffCreateModal
          onClose={() => setCreatingStaff(false)}
          onSuccess={() => {
            setCreatingStaff(false);
            reload();
          }}
        />
      )}

      {editingUser && (
        <UserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
