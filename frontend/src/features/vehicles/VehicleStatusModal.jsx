import React, { useState } from 'react';
import { Button, ConfirmDialog, Modal, TextareaField, useToast } from '../../components/ui';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import { useAuth } from '../../integrations/authBridge';
import { updateVehicleStatus } from '../../services/fleetApi';
import { getApiErrorMessage } from '../../utils/errorMessages';

export default function VehicleStatusModal({ vehicle, onClose, onSuccess }) {
  const toast = useToast();
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');
  const nextStatus = vehicle.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE';
  const forbiddenReopen = vehicle.status === 'MAINTENANCE' && nextStatus === 'AVAILABLE' && !isManager;

  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    updateVehicleStatus(vehicle.id, payload, idempotencyKey)
  );

  const nextStatusLabel = nextStatus === 'MAINTENANCE' ? 'Đang bảo trì' : 'Sẵn sàng';
  const currentStatusLabel = vehicle.status === 'AVAILABLE' ? 'Sẵn sàng' : 'Đang bảo trì';

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const res = await mutation.execute(`vehicle_status_${vehicle.id}`, {
        status: nextStatus,
        note: note.trim(),
      });
      toast.success(`Đã chuyển xe #${vehicle.id} sang trạng thái ${nextStatusLabel}.`);
      onSuccess(res.data);
    } catch {
      // Lỗi hiển thị ngay trên modal; giữ nguyên Idempotency-Key khi thử lại.
    }
  };

  return (
    <>
      <Modal
        open
        size="sm"
        title={`Đổi trạng thái xe #${vehicle.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!note.trim() || forbiddenReopen}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Chuyển sang {nextStatusLabel}
            </Button>
          </>
        }
      >
        <p className="muted">
          <strong>{vehicle.name}</strong> ({vehicle.model}): chuyển từ{' '}
          <strong>{currentStatusLabel}</strong> sang <strong>{nextStatusLabel}</strong>.
        </p>

        {forbiddenReopen && (
          <div className="alert alert-warning" role="alert">
            Chỉ tài khoản <strong>Quản lý</strong> mới được mở lại xe từ trạng thái bảo trì sang sẵn sàng (sau khi hoàn tất mọi phiếu bảo trì đang mở).
          </div>
        )}

        <TextareaField
          label="Lý do / ghi chú kiểm toán"
          required
          maxLength={2000}
          placeholder={
            nextStatus === 'MAINTENANCE'
              ? 'Ví dụ: Kiểm tra phanh và sạc pin định kỳ...'
              : 'Ví dụ: Xe đã kiểm tra xong, sẵn sàng cho thuê lại...'
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận đổi trạng thái xe"
        message={`Chuyển xe #${vehicle.id} sang trạng thái ${nextStatusLabel}?`}
        confirmLabel="Xác nhận"
        variant={nextStatus === 'MAINTENANCE' ? 'danger' : 'primary'}
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
