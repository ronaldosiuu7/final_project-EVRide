import React, { useState } from 'react';
import { Button, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { createStaffUser } from '../../services/accountsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { mapApiFieldErrors } from '../../utils/validation';

export default function StaffCreateModal({ onClose, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name || name.length > 100) errors.name = 'Tên từ 1 đến 100 ký tự.';
    if (!email || email.length > 100) errors.email = 'Email không hợp lệ.';
    // Contract: KHÔNG trim mật khẩu; độ dài 12–128 ký tự.
    if (form.password.length < 12 || form.password.length > 128) {
      errors.password = 'Mật khẩu phải từ 12 đến 128 ký tự (không tự cắt khoảng trắng).';
    }
    if (!['STAFF', 'MANAGER'].includes(form.role)) {
      errors.role = 'Chỉ được tạo tài khoản STAFF hoặc MANAGER.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      const res = await createStaffUser({
        name,
        email,
        password: form.password,
        role: form.role,
      });
      toast.success(`Đã tạo tài khoản ${res.data.role} cho ${res.data.email}.`);
      onSuccess(res.data);
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      title="Tạo tài khoản nhân viên (MANAGER)"
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" form="create-staff-form" variant="primary" loading={submitting}>
            Tạo tài khoản
          </Button>
        </>
      }
    >
      <form id="create-staff-form" onSubmit={handleSubmit} className="stack-md">
        <TextField
          label="Họ và tên"
          required
          maxLength={100}
          value={form.name}
          error={fieldErrors.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <TextField
          label="Email"
          required
          type="email"
          maxLength={100}
          value={form.email}
          error={fieldErrors.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <TextField
          label="Mật khẩu (12–128 ký tự)"
          required
          type="password"
          minLength={12}
          maxLength={128}
          value={form.password}
          error={fieldErrors.password}
          hint="Mật khẩu giữ nguyên ký tự khoảng trắng nếu có."
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />
        <SelectField
          label="Vai trò"
          required
          value={form.role}
          error={fieldErrors.role}
          options={[
            { value: 'STAFF', label: 'Nhân viên vận hành (STAFF)' },
            { value: 'MANAGER', label: 'Quản lý (MANAGER)' },
          ]}
          hint="Không tạo CUSTOMER tại đây (khách hàng đăng ký qua cổng công khai)."
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        />

        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}
      </form>
    </Modal>
  );
}
