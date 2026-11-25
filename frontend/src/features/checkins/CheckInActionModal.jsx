import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  Modal,
  SelectField,
  TextField,
  TextareaField,
  useToast,
} from '../../components/ui';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import { recordCheckIn } from '../../services/rentalsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { formatDateTimeVN, nowLocalInput, toIsoWithVietnamOffset } from '../../utils/format';
import { isPositiveIdString } from '../../utils/validation';

export default function CheckInActionModal({ item, onClose, onSuccess }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState('CONTINUE_RENTAL');
  const [nextCheckAt, setNextCheckAt] = useState(nowLocalInput(60 * 12)); // mặc định +12 giờ
  const [sourceTicketId, setSourceTicketId] = useState('');
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    recordCheckIn(item.rental_id, payload, idempotencyKey)
  );

  const validateAndBuild = () => {
    if (!note.trim()) {
      setFieldError('Bắt buộc nhập ghi chú kết quả kiểm tra.');
      return null;
    }
    if (outcome === 'CONTINUE_RENTAL' || outcome === 'NO_ANSWER') {
      const iso = toIsoWithVietnamOffset(nextCheckAt);
      if (!iso) {
        setFieldError('Bắt buộc chọn thời điểm kiểm tra tiếp theo (next_check_at).');
        return null;
      }
      setFieldError('');
      return {
        outcome,
        note: note.trim(),
        next_check_at: iso,
      };
    }

    // ESCALATE: KHÔNG truyền next_check_at; source_ticket_id tùy chọn.
    const payload = {
      outcome: 'ESCALATE',
      note: note.trim(),
    };
    if (sourceTicketId.trim()) {
      if (!isPositiveIdString(sourceTicketId)) {
        setFieldError('ID ticket nguồn phải là chuỗi số nguyên dương.');
        return null;
      }
      payload.source_ticket_id = sourceTicketId.trim();
    }
    setFieldError('');
    return payload;
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    const payload = validateAndBuild();
    if (!payload) return;
    try {
      const res = await mutation.execute(`checkin_${item.rental_id}`, payload);
      if (res.data?.incident?.id) {
        toast.success(
          `Đã chuyển chuyến #${item.rental_id} sang hồ sơ sự cố #${res.data.incident.id}.`
        );
      } else {
        toast.success(
          `Đã ghi nhận ${payload.outcome} cho chuyến #${item.rental_id}. Hẹn kiểm tra tiếp: ${formatDateTimeVN(res.data?.next_check_at)}`
        );
      }
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
        title={`Ghi nhận kiểm tra 24 giờ — Chuyến #${item.rental_id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant={outcome === 'ESCALATE' ? 'danger' : 'primary'}
              loading={mutation.loading}
              onClick={() => {
                if (validateAndBuild()) setConfirmOpen(true);
              }}
            >
              {outcome === 'ESCALATE' ? 'Chuyển sang tiếp nhận sự cố' : 'Lưu kết quả kiểm tra'}
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Kiểm tra sau 24 giờ không tự phạt tiền, không tự kết luận mất trộm và không tạo trạng thái OVERDUE.
        </div>

        <p className="muted">
          Khách: <strong>{item.customer_name}</strong> ({item.customer_email}) · Xe:{' '}
          <strong>{item.vehicle_name}</strong>
        </p>

        <SelectField
          label="Kết quả kiểm tra"
          required
          value={outcome}
          options={[
            { value: 'CONTINUE_RENTAL', label: 'Khách xác nhận tiếp tục thuê (CONTINUE_RENTAL)' },
            { value: 'NO_ANSWER', label: 'Không liên lạc được (NO_ANSWER)' },
            { value: 'ESCALATE', label: 'Chuyển sang tiếp nhận sự cố (ESCALATE)' },
          ]}
          onChange={(e) => setOutcome(e.target.value)}
        />

        {outcome !== 'ESCALATE' ? (
          <TextField
            label="Lịch kiểm tra tiếp theo (next_check_at, giờ VN)"
            type="datetime-local"
            required
            value={nextCheckAt}
            hint="Phải lớn hơn thời gian máy chủ hiện tại."
            onChange={(e) => setNextCheckAt(e.target.value)}
          />
        ) : (
          <div className="stack-sm">
            <TextField
              label="ID ticket báo cáo nguồn (tùy chọn)"
              placeholder="Để trống để hệ thống tự tạo ticket STAFF"
              value={sourceTicketId}
              hint={
                <>
                  Nếu đã có ticket của khách/nhân viên trên chuyến, nhập ID tại đây hoặc{' '}
                  <Link to={`/admin/tickets?rental_id=${item.rental_id}`}>xem ticket chuyến</Link>.
                </>
              }
              onChange={(e) => setSourceTicketId(e.target.value)}
            />
          </div>
        )}

        <TextareaField
          label="Ghi chú kiểm tra (bắt buộc)"
          required
          maxLength={5000}
          placeholder="Ghi nhận kết quả trao đổi với khách hàng..."
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
        title="Xác nhận kết quả kiểm tra chuyến 24 giờ"
        message={
          outcome === 'ESCALATE'
            ? `Chuyển chuyến #${item.rental_id} sang hồ sơ sự cố (xe sẽ chuyển SUSPECTED_STOLEN và chờ MANAGER điều tra/xác minh)?`
            : `Lưu kết quả ${outcome} cho chuyến #${item.rental_id}?`
        }
        confirmLabel="Xác nhận"
        variant={outcome === 'ESCALATE' ? 'danger' : 'primary'}
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
