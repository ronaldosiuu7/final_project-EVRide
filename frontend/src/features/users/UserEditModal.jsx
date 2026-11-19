import React, { useState } from 'react';
import { Button, ConfirmDialog, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { useAuth } from '../../integrations/authBridge';
import { updateUser } from '../../services/accountsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { mapApiFieldErrors } from '../../utils/validation';

export default function UserEditModal({ user, onClose, onSuccess }) {
  const toast = useToast();
  const { user: currentUser, logout } = useAuth();
  const isCustomer = user.role === 'CUSTOMER';

  const [name, setName] = useState(user.name || '');
  const [status, setStatus] = useState(user.status || 'ACTIVE');
  const [role, setRole] = useState(user.role || 'STAFF');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const buildPayload = () => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) {
      setFieldErrors({ name: 'Tên phải từ 1 đến 100 ký tự.' });
      return null;
    }
    const payload = {};
    if (trimmedName !== user.name) payload.name = trimmedName;
    if (status !== user.status) payload.status = status;
    // Không bao giờ gửi thay đổi role đối với CUSTOMER trái contract.
    if (!isCustomer && role !== user.role) payload.role = role;
    return payload;
  };

  const executeUpdate = async (payload) => {
    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      const res = await updateUser(user.id, payload);
      toast.success(`Đã cập nhật tài khoản #${user.id}.`);
      if (currentUser?.id === user.id && payload.status && payload.status !== 'ACTIVE') {
        await logout();
        return;
      }
      onSuccess(res.data);
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    const isSensitive =
      (payload.status && payload.status !== 'ACTIVE') || (payload.role && payload.role !== user.role);
    if (isSensitive) {
      setConfirmOpen(true);
      return;
    }
    executeUpdate(payload);
  };

  return (
    <>
      <Modal
        open
        size="sm"
        title={`Cập nhật tài khoản #${user.id}`}
        onClose={onClose}
        closeDisabled={submitting}
        footer={
          <>
            <Button onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" form="edit-user-form" variant="primary" loading={submitting}>
              Lưu thay đổi
            </Button>
          </>
        }
      >
        <form id="edit-user-form" onSubmit={handleSubmit} className="stack-md">
          <p className="muted">
            Email: <strong>{user.email}</strong>
          </p>

          <TextField
            label="Họ và tên"
            required
            maxLength={100}
            value={name}
            error={fieldErrors.name}
            onChange={(e) => setName(e.target.value)}
          />

          <SelectField
            label="Trạng thái tài khoản"
            value={status}
            error={fieldErrors.status}
            options={[
              { value: 'ACTIVE', label: 'Đang hoạt động (ACTIVE)' },
              { value: 'INACTIVE', label: 'Ngừng hoạt động (INACTIVE)' },
              { value: 'BLOCKED', label: 'Bị khóa (BLOCKED)' },
              { value: 'BLACKLISTED', label: 'Danh sách đen (BLACKLISTED)' },
            ]}
            hint="Khi khóa tài khoản (khác ACTIVE), toàn bộ phiên đăng nhập của tài khoản sẽ bị thu hồi ngay."
            onChange={(e) => setStatus(e.target.value)}
          />

          {isCustomer ? (
            <div className="alert alert-info">
              Tài khoản <code>CUSTOMER</code> không thể chuyển đổi thành nhân viên qua PATCH theo quy định tách quyền sở hữu dữ liệu.
            </div>
          ) : (
            <SelectField
              label="Vai trò nhân sự"
              value={role}
              error={fieldErrors.role}
              options={[
                { value: 'STAFF', label: 'Nhân viên vận hành (STAFF)' },
                { value: 'MANAGER', label: 'Quản lý (MANAGER)' },
              ]}
              hint="Hệ thống chặn khóa hoặc hạ quyền tài khoản MANAGER đang hoạt động cuối cùng."
              onChange={(e) => setRole(e.target.value)}
            />
          )}

          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận thay đổi trạng thái / vai trò"
        message={`Thao tác trên tài khoản ${user.email} có thể thu hồi toàn bộ phiên đăng nhập đang hoạt động hoặc thay đổi quyền vận hành. Tiếp tục?`}
        confirmLabel="Xác nhận cập nhật"
        loading={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          const payload = buildPayload();
          if (payload) executeUpdate(payload);
        }}
      />
    </>
  );
}
