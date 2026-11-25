import React, { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Modal,
  TextField,
  TextareaField,
  useToast,
} from '../../components/ui';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import { intakeIncident } from '../../services/incidentsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { isPositiveIdString } from '../../utils/validation';

export default function IncidentIntakeModal({ initialRentalId = '', onClose, onSuccess }) {
  const toast = useToast();
  const [rentalId, setRentalId] = useState(initialRentalId);
  const [sourceTicketId, setSourceTicketId] = useState('');
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    intakeIncident(rentalId.trim(), payload, idempotencyKey)
  );

  const validateAndBuild = () => {
    if (!isPositiveIdString(rentalId)) {
      setFieldError('ID chuyến thuê phải là chuỗi số nguyên dương.');
      return null;
    }
    if (!isPositiveIdString(sourceTicketId)) {
      setFieldError('ID ticket báo cáo nguồn (của khách hoặc nhân viên) phải là chuỗi số nguyên dương.');
      return null;
    }
    if (!note.trim()) {
      setFieldError('Bắt buộc nhập ghi chú tiếp nhận điều tra.');
      return null;
    }
    setFieldError('');
    return {
      source_ticket_id: sourceTicketId.trim(),
      note: note.trim(),
    };
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    const payload = validateAndBuild();
    if (!payload) return;
    try {
      const res = await mutation.execute(`incident_intake_${rentalId.trim()}`, payload);
      toast.success(`Đã mở hồ sơ điều tra sự cố #${res.data.id}.`);
      onSuccess(res.data);
    } catch {
      // Lỗi hiển thị ngay trên modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="md"
        title="Tiếp nhận nghi mất / sự cố chuyến thuê"
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={mutation.loading}
              onClick={() => {
                if (validateAndBuild()) setConfirmOpen(true);
              }}
            >
              Mở hồ sơ điều tra
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Thao tác chuyển xe sang <code>SUSPECTED_STOLEN</code> và mở hồ sơ <code>INVESTIGATING</code>; chuyến thuê giữ nguyên <code>IN_RENT</code> và chưa dừng cước cho tới khi MANAGER xác minh.
        </div>

        <TextField
          label="ID chuyến thuê (đang IN_RENT)"
          required
          value={rentalId}
          onChange={(e) => setRentalId(e.target.value)}
        />
        <TextField
          label="ID ticket nguồn hợp lệ (CUSTOMER hoặc STAFF)"
          required
          value={sourceTicketId}
          hint="Không dùng ticket cảnh báo tự động của SYSTEM."
          onChange={(e) => setSourceTicketId(e.target.value)}
        />
        <TextareaField
          label="Ghi chú tiếp nhận điều tra"
          required
          maxLength={5000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {(fieldError || mutation.error) && (
          <div className="alert alert-danger" role="alert">
            {fieldError || getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận mở hồ sơ sự cố"
        message={`Tiếp nhận điều tra sự cố cho chuyến #${rentalId} dựa trên ticket #${sourceTicketId}?`}
        confirmLabel="Xác nhận tiếp nhận"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
