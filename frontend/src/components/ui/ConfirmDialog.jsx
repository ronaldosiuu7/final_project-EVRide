import React from 'react';
import Modal from './Modal';
import Button from './Button';

/**
 * Hộp thoại xác nhận thao tác nhạy cảm (khóa tài khoản, xác minh, giải phóng xe, quyết toán, đóng hồ sơ...).
 */
export default function ConfirmDialog({
  open,
  title = 'Xác nhận thao tác',
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
  children,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      closeDisabled={loading}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p>{message}</p>}
      {children}
    </Modal>
  );
}
