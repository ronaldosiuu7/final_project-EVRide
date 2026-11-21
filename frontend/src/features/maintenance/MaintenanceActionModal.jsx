import React, { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Modal,
  SelectField,
  TextareaField,
  useToast,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import { listUsers } from '../../services/accountsApi';
import {
  cancelMaintenanceOrder,
  completeMaintenanceOrder,
  startMaintenanceOrder,
} from '../../services/operationsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';

export default function MaintenanceActionModal({ order, actionType, onClose, onSuccess }) {
  const toast = useToast();
  const [assignedTo, setAssignedTo] = useState(order.assigned_to || '');
  const [textValue, setTextValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const staffQuery = useApiQuery(
    () => listUsers({ role: 'STAFF', status: 'ACTIVE', page: 1, page_size: 100 }),
    [],
    { enabled: actionType === 'start' }
  );
  const managersQuery = useApiQuery(
    () => listUsers({ role: 'MANAGER', status: 'ACTIVE', page: 1, page_size: 100 }),
    [],
    { enabled: actionType === 'start' }
  );
  const employees = [...(staffQuery.data || []), ...(managersQuery.data || [])];

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) => {
    if (actionType === 'start') return startMaintenanceOrder(order.id, payload, idempotencyKey);
    if (actionType === 'complete') return completeMaintenanceOrder(order.id, payload, idempotencyKey);
    return cancelMaintenanceOrder(order.id, payload, idempotencyKey);
  });

  const handleConfirm = async () => {
    setConfirmOpen(false);
    let payload = {};
    if (actionType === 'start') {
      if (assignedTo) payload = { assigned_to: String(assignedTo) };
    } else if (actionType === 'complete') {
      payload = { resolution_note: textValue.trim() };
    } else {
      payload = { reason: textValue.trim() };
    }

    try {
      const res = await mutation.execute(`maint_${actionType}_${order.id}`, payload);
      toast.success(`Đã thực hiện thao tác ${actionType.toUpperCase()} trên phiếu #${order.id}.`);
      onSuccess(res.data);
    } catch {
      // Lỗi hiển thị ngay trên modal.
    }
  };

  const titleMap = {
    start: `Bắt đầu xử lý phiếu bảo trì #${order.id}`,
    complete: `Hoàn tất phiếu bảo trì #${order.id}`,
    cancel: `Hủy phiếu bảo trì #${order.id}`,
  };

  return (
    <>
      <Modal
        open
        size="sm"
        title={titleMap[actionType]}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Đóng
            </Button>
            <Button
              variant={actionType === 'cancel' ? 'danger' : 'primary'}
              disabled={actionType !== 'start' && !textValue.trim()}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Tiếp tục
            </Button>
          </>
        }
      >
        <p className="muted">
          Xe #{order.vehicle_id} · {order.title}
        </p>

        {actionType === 'start' && (
          <SelectField
            label="Người thực hiện (tùy chọn — để trống sẽ gán người đang thao tác)"
            value={assignedTo}
            placeholder="Mặc định: chính tôi"
            options={employees.map((e) => ({
              value: e.id,
              label: `#${e.id} - ${e.name} (${e.role})`,
            }))}
            onChange={(e) => setAssignedTo(e.target.value)}
          />
        )}

        {actionType === 'complete' && (
          <>
            <div className="alert alert-info">
              Lưu ý: Hoàn tất phiếu không tự động đặt xe về <code>AVAILABLE</code>. MANAGER cần mở lại xe tại mục Xe máy điện hoặc Giải phóng xe sự cố (nếu có <code>incident_id</code>).
            </div>
            <TextareaField
              label="Biên bản kết quả sửa chữa / kiểm tra (bắt buộc)"
              required
              maxLength={5000}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
            />
          </>
        )}

        {actionType === 'cancel' && (
          <TextareaField
            label="Lý do hủy phiếu bảo trì (bắt buộc)"
            required
            maxLength={2000}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
          />
        )}

        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title={titleMap[actionType]}
        message="Xác nhận thực hiện thao tác trên phiếu bảo trì này?"
        confirmLabel="Xác nhận"
        variant={actionType === 'cancel' ? 'danger' : 'primary'}
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
