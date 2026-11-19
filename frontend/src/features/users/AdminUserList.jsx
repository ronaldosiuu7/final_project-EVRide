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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const { data, meta, loading, error, reload } = useApiQuery(
    () =>
      listUsers({
        role: role || undefined,
        status: status || undefined,
        q: query.trim() || undefined,
        page,
        page_size: pageSize,
      }),
    [role, status, query, page, pageSize]
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
            Hệ thống V1 không hỗ trợ xóa tài khoản; có thể khóa/mở hoặc cập nhật nhân sự (MANAGER).
          </p>
        </div>
        {isManager && (
          <Button variant="primary" onClick={() => setCreatingStaff(true)}>
            + Tạo tài khoản STAFF / MANAGER
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
            { value: 'CUSTOMER', label: 'CUSTOMER' },
            { value: 'STAFF', label: 'STAFF' },
            { value: 'MANAGER', label: 'MANAGER' },
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
            { value: 'ACTIVE', label: 'ACTIVE' },
            { value: 'INACTIVE', label: 'INACTIVE' },
            { value: 'BLOCKED', label: 'BLOCKED' },
            { value: 'BLACKLISTED', label: 'BLACKLISTED' },
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
