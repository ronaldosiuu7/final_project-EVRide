import React, { useState } from 'react';
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
import {
  closeIncident,
  createIncidentEvidenceTicket,
  recordIncidentArrival,
  recordIncidentRecovery,
  refundIncidentDeposit,
  releaseIncidentVehicle,
  settleExternalCompensation,
  settleIncidentRent,
  verifyIncident,
} from '../../services/incidentsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { formatVnd, nowLocalInput, toIsoWithVietnamOffset } from '../../utils/format';
import { normalizeMoneyString } from '../../utils/validation';

function TicketSelector({ label, tickets, value, onChange, hint }) {
  return (
    <SelectField
      label={label}
      required
      value={value}
      placeholder="Chọn ticket bằng chứng hợp lệ"
      hint={hint || 'Chỉ dùng ticket báo cáo từ CUSTOMER hoặc STAFF (không dùng cảnh báo SYSTEM).'}
      options={tickets.map((t) => ({
        value: t.id,
        label: `#${t.id} [${t.report_source}] - ${t.title}`,
      }))}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function EvidenceTicketModal({ incidentId, onClose, onSuccess }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    createIncidentEvidenceTicket(incidentId, payload, idempotencyKey)
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const res = await mutation.execute(`inc_evidence_${incidentId}`, {
        title: title.trim(),
        description: description.trim(),
      });
      toast.success(`Đã tạo ticket bằng chứng #${res.data.id}.`);
      onSuccess(res.data);
    } catch {
      // Lỗi hiển thị ngay tại modal.
    }
  };

  return (
    <Modal
      open
      size="md"
      title={`Tạo ticket bằng chứng sự cố #${incidentId}`}
      onClose={onClose}
      closeDisabled={mutation.loading}
      footer={
        <>
          <Button onClick={onClose} disabled={mutation.loading}>
            Hủy
          </Button>
          <Button
            type="submit"
            form="evidence-ticket-form"
            variant="primary"
            disabled={!title.trim() || !description.trim()}
            loading={mutation.loading}
          >
            Tạo ticket bằng chứng
          </Button>
        </>
      }
    >
      <form id="evidence-ticket-form" onSubmit={handleSubmit} className="stack-md">
        <TextField
          label="Tiêu đề bằng chứng"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextareaField
          label="Nội dung chi tiết / biên bản"
          required
          rows={4}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </form>
    </Modal>
  );
}

export function VerifyIncidentModal({ incident, humanTickets, onClose, onSuccess }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState('LOSS_THEFT');
  const [evidenceTicketId, setEvidenceTicketId] = useState(humanTickets[0]?.id || '');
  const [validReportTicketId, setValidReportTicketId] = useState(humanTickets[0]?.id || '');
  const [nextCheckAt, setNextCheckAt] = useState(nowLocalInput(60 * 12));
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    verifyIncident(incident.id, payload, idempotencyKey)
  );

  const buildPayload = () => {
    const payload = {
      outcome,
      evidence_ticket_id: String(evidenceTicketId),
      reason: reason.trim(),
    };
    if (outcome === 'LOSS_THEFT') {
      payload.valid_report_ticket_id = String(validReportTicketId);
    } else if (outcome === 'FALSE_ALARM') {
      payload.next_check_at = toIsoWithVietnamOffset(nextCheckAt);
    }
    return payload;
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const payload = buildPayload();
      const res = await mutation.execute(`inc_verify_${incident.id}`, payload);
      toast.success(`Đã xác minh hồ sơ #${incident.id} với kết luận ${outcome}.`);
      onSuccess(res.data);
    } catch {
      // Lỗi hiển thị trong modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="md"
        title={`MANAGER xác minh hồ sơ sự cố #${incident.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant={outcome === 'FALSE_ALARM' ? 'primary' : 'danger'}
              disabled={!evidenceTicketId || !reason.trim()}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Xác nhận kết luận
            </Button>
          </>
        }
      >
        <SelectField
          label="Kết luận xác minh"
          required
          value={outcome}
          options={[
            { value: 'LOSS_THEFT', label: 'Xác nhận mất / trộm (LOSS_THEFT — dừng cước tại báo cáo hợp lệ)' },
            { value: 'ABANDONMENT', label: 'Xác nhận bỏ xe (ABANDONMENT — dừng cước khi thu hồi thực tế)' },
            { value: 'FALSE_ALARM', label: 'Báo nhầm (FALSE_ALARM — tiếp tục thuê & đặt lịch kiểm tra tiếp)' },
          ]}
          onChange={(e) => setOutcome(e.target.value)}
        />

        <TicketSelector
          label="Ticket bằng chứng quyết định"
          tickets={humanTickets}
          value={evidenceTicketId}
          onChange={setEvidenceTicketId}
        />

        {outcome === 'LOSS_THEFT' && (
          <TicketSelector
            label="Ticket báo cáo mất/trộm hợp lệ (chốt mốc dừng cước server)"
            tickets={humanTickets}
            value={validReportTicketId}
            hint="Mốc dừng cước lấy theo thời điểm received_at của ticket này (không dùng báo cáo cũ trước FALSE_ALARM)."
            onChange={setValidReportTicketId}
          />
        )}

        {outcome === 'FALSE_ALARM' && (
          <TextField
            label="Lịch kiểm tra tiếp theo (next_check_at, giờ VN)"
            type="datetime-local"
            required
            value={nextCheckAt}
            onChange={(e) => setNextCheckAt(e.target.value)}
          />
        )}

        <TextareaField
          label="Lý do & căn cứ xác minh"
          required
          maxLength={5000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận kết luận sự cố"
        message={`MANAGER xác nhận kết luận ${outcome} cho hồ sơ #${incident.id}?`}
        confirmLabel="Xác nhận"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function RecoveryModal({ incident, humanTickets, onClose, onSuccess }) {
  const toast = useToast();
  const [evidenceTicketId, setEvidenceTicketId] = useState(humanTickets[0]?.id || '');
  const [recoveredAt, setRecoveredAt] = useState(nowLocalInput());
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    recordIncidentRecovery(incident.id, payload, idempotencyKey)
  );

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const res = await mutation.execute(`inc_recovery_${incident.id}`, {
        evidence_ticket_id: String(evidenceTicketId),
        recovered_at: toIsoWithVietnamOffset(recoveredAt),
        note: note.trim(),
      });
      toast.success(`Đã ghi nhận thu hồi ngoài hiện trường cho hồ sơ #${incident.id}.`);
      onSuccess(res.data);
    } catch {
      // Hiển thị lỗi tại modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="md"
        title={`Ghi nhận thu hồi ngoài hiện trường — Hồ sơ #${incident.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!evidenceTicketId || !recoveredAt || !note.trim()}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Ghi nhận thu hồi
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Bước này chỉ ghi nhận thu hồi ngoài hiện trường (chưa gán trạm cho xe). Nếu hồ sơ là <code>ABANDONMENT</code>, mốc thu hồi sẽ là mốc dừng cước; nếu đã <code>CLOSED_INCIDENT</code> trước đó, hệ thống ghi nhận thu hồi trên hồ sơ cũ mà không mở lại rental.
        </div>

        <TicketSelector
          label="Ticket bằng chứng thu hồi"
          tickets={humanTickets}
          value={evidenceTicketId}
          onChange={setEvidenceTicketId}
        />
        <TextField
          label="Thời điểm thu hồi thực tế (giờ VN)"
          type="datetime-local"
          required
          value={recoveredAt}
          onChange={(e) => setRecoveredAt(e.target.value)}
        />
        <TextareaField
          label="Biên bản / ghi chú thu hồi"
          required
          maxLength={5000}
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
        title="Xác nhận thu hồi xe ngoài hiện trường"
        message={`Ghi nhận xe đã được thu hồi lúc ${recoveredAt} cho hồ sơ #${incident.id}?`}
        confirmLabel="Xác nhận"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function ArrivalModal({ incident, humanTickets, stations, onClose, onSuccess }) {
  const toast = useToast();
  const eligibleStations = (stations || []).filter(
    (s) => s.status === 'ACTIVE' && s.available_spaces > 0
  );
  const [evidenceTicketId, setEvidenceTicketId] = useState(humanTickets[0]?.id || '');
  const [stationId, setStationId] = useState(eligibleStations[0]?.id || '');
  const [arrivedAt, setArrivedAt] = useState(nowLocalInput());
  const [condition, setCondition] = useState('REPAIRABLE');
  const [inspectedAt, setInspectedAt] = useState(nowLocalInput());
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    recordIncidentArrival(incident.id, payload, idempotencyKey)
  );

  const handleConfirm = async () => {
    setConfirmOpen(false);
    const payload = {
      evidence_ticket_id: String(evidenceTicketId),
      station_id: String(stationId),
      arrived_at: toIsoWithVietnamOffset(arrivedAt),
      condition,
      note: note.trim(),
    };
    if (inspectedAt) {
      payload.inspected_at = toIsoWithVietnamOffset(inspectedAt);
    }
    try {
      const res = await mutation.execute(`inc_arrival_${incident.id}`, payload);
      toast.success(`Đã tiếp nhận xe về trạm #${stationId} ở trạng thái MAINTENANCE.`);
      onSuccess(res.data);
    } catch {
      // Hiển thị lỗi tại modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="md"
        title={`Tiếp nhận xe sự cố về trạm (Arrival + Condition)`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!evidenceTicketId || !stationId || !arrivedAt || !note.trim()}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Tiếp nhận về trạm
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Chỉ gán trạm khi xe thực sự về trạm ACTIVE và còn chỗ đỗ; xe sẽ tự chuyển trạng thái <code>MAINTENANCE</code> tại trạm nhận.
        </div>

        <TicketSelector
          label="Ticket bằng chứng tiếp nhận tại trạm"
          tickets={humanTickets}
          value={evidenceTicketId}
          onChange={setEvidenceTicketId}
        />

        {eligibleStations.length === 0 ? (
          <div className="alert alert-danger">
            Không có trạm ACTIVE nào còn chỗ đỗ trống để tiếp nhận xe.
          </div>
        ) : (
          <SelectField
            label="Trạm tiếp nhận xe"
            required
            value={stationId}
            options={eligibleStations.map((s) => ({
              value: s.id,
              label: `#${s.id} - ${s.name} (Trống ${s.available_spaces}/${s.capacity})`,
            }))}
            onChange={(e) => setStationId(e.target.value)}
          />
        )}

        <div className="grid-2">
          <TextField
            label="Thời điểm về trạm (giờ VN)"
            type="datetime-local"
            required
            value={arrivedAt}
            onChange={(e) => setArrivedAt(e.target.value)}
          />
          <SelectField
            label="Tình trạng kiểm tra ban đầu"
            required
            value={condition}
            options={[
              { value: 'INTACT', label: 'Nguyên vẹn (INTACT)' },
              { value: 'REPAIRABLE', label: 'Hư hỏng sửa được (REPAIRABLE)' },
              { value: 'UNREPAIRABLE', label: 'Không sửa được (UNREPAIRABLE)' },
            ]}
            onChange={(e) => setCondition(e.target.value)}
          />
        </div>

        <TextField
          label="Thời điểm kiểm tra (tùy chọn, giờ VN)"
          type="datetime-local"
          value={inspectedAt}
          onChange={(e) => setInspectedAt(e.target.value)}
        />

        <TextareaField
          label="Ghi chú kiểm tra khi về trạm"
          required
          maxLength={5000}
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
        title="Xác nhận tiếp nhận xe về trạm"
        message={`Gán xe về trạm #${stationId} với tình trạng ${condition}?`}
        confirmLabel="Xác nhận"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function ReleaseVehicleModal({
  incident,
  humanTickets,
  completedOrders,
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const [evidenceTicketId, setEvidenceTicketId] = useState(humanTickets[0]?.id || '');
  const [orderId, setOrderId] = useState(completedOrders[0]?.id || '');
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    releaseIncidentVehicle(incident.id, payload, idempotencyKey)
  );

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const res = await mutation.execute(`inc_release_${incident.id}`, {
        evidence_ticket_id: String(evidenceTicketId),
        maintenance_order_id: String(orderId),
        note: note.trim(),
      });
      toast.success(`Đã giải phóng xe cho thuê lại độc lập với công nợ khách cũ.`);
      onSuccess(res.data);
    } catch {
      // Hiển thị lỗi tại modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="md"
        title={`MANAGER giải phóng xe khỏi hồ sơ #${incident.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!evidenceTicketId || !orderId || !note.trim()}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Giải phóng xe (AVAILABLE)
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Giải phóng xe tách biệt hoàn toàn với công nợ/quyết toán của khách cũ; yêu cầu xe đã có phiếu bảo trì sự cố <code>COMPLETED</code> và pin &ge; 30%.
        </div>

        <TicketSelector
          label="Ticket bằng chứng giải phóng xe"
          tickets={humanTickets}
          value={evidenceTicketId}
          onChange={setEvidenceTicketId}
        />

        {completedOrders.length === 0 ? (
          <div className="alert alert-warning">
            Chưa có phiếu bảo trì gắn hồ sơ này ở trạng thái <code>COMPLETED</code>. Vui lòng tạo và hoàn tất phiếu bảo trì trước.
          </div>
        ) : (
          <SelectField
            label="Phiếu bảo trì sự cố đã hoàn tất (COMPLETED)"
            required
            value={orderId}
            options={completedOrders.map((o) => ({
              value: o.id,
              label: `Phiếu #${o.id} - ${o.title}`,
            }))}
            onChange={(e) => setOrderId(e.target.value)}
          />
        )}

        <TextareaField
          label="Ghi chú duyệt giải phóng xe"
          required
          maxLength={5000}
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
        title="Xác nhận giải phóng xe cho thuê lại"
        message={`Giải phóng xe khỏi hồ sơ #${incident.id} sang AVAILABLE? Chuyến cũ vẫn giữ trạng thái để tiếp tục xử lý tài chính độc lập.`}
        confirmLabel="Xác nhận giải phóng"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function SettleRentModal({ incident, humanTickets, rentPreview, onClose, onSuccess }) {
  const toast = useToast();
  const [evidenceTicketId, setEvidenceTicketId] = useState(humanTickets[0]?.id || '');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    settleIncidentRent(incident.id, payload, idempotencyKey)
  );

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const res = await mutation.execute(`inc_settle_rent_${incident.id}`, {
        evidence_ticket_id: String(evidenceTicketId),
        expected_rent_amount: rentPreview.rent_amount,
        reason: reason.trim(),
      });
      toast.success(`Đã quyết toán tiền thuê sự cố ${formatVnd(res.data.rent_amount)}.`);
      onSuccess(res.data);
    } catch {
      // Hiển thị lỗi tại modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="md"
        title={`MANAGER quyết toán tiền thuê sự cố — Hồ sơ #${incident.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!evidenceTicketId || !reason.trim()}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Quyết toán tiền thuê ({formatVnd(rentPreview.rent_amount)})
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Sự cố đã xác nhận không áp dụng khuyến mãi. Hệ thống dùng cọc cấn tiền thuê trước, phần thiếu thu thêm từ ví khách.
        </div>

        <dl className="detail-grid">
          <div className="detail-item">
            <dt>Tổng tiền thuê (expected_rent_amount)</dt>
            <dd>
              <strong>{formatVnd(rentPreview.rent_amount)}</strong>
            </dd>
          </div>
          <div className="detail-item">
            <dt>Cọc dự kiến cấn</dt>
            <dd>{formatVnd(rentPreview.deposit_to_apply)}</dd>
          </div>
          <div className="detail-item">
            <dt>Thu thêm ví khách</dt>
            <dd>{formatVnd(rentPreview.additional_wallet_payment)}</dd>
          </div>
          <div className="detail-item">
            <dt>Cọc còn giữ sau quyết toán</dt>
            <dd>{formatVnd(rentPreview.deposit_remaining_held)}</dd>
          </div>
        </dl>

        <TicketSelector
          label="Ticket bằng chứng quyết toán tiền thuê"
          tickets={humanTickets}
          value={evidenceTicketId}
          onChange={setEvidenceTicketId}
        />

        <TextareaField
          label="Lý do / ghi chú quyết toán"
          required
          maxLength={5000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận quyết toán tiền thuê sự cố"
        message={`Chốt hóa đơn PAID số tiền ${formatVnd(rentPreview.rent_amount)} cho hồ sơ #${incident.id}?`}
        confirmLabel="Xác nhận quyết toán"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function ExternalCompensationModal({ incident, humanTickets, onClose, onSuccess }) {
  const toast = useToast();
  const [evidenceTicketId, setEvidenceTicketId] = useState(humanTickets[0]?.id || '');
  const [amount, setAmount] = useState('0.00');
  const [agreementStatus, setAgreementStatus] = useState('NOT_REQUIRED');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAt, setPaidAt] = useState(nowLocalInput());
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    settleExternalCompensation(incident.id, payload, idempotencyKey)
  );

  const normalizedAmount = normalizeMoneyString(amount);
  const isZero = normalizedAmount === '0.00';

  const handleAmountChange = (val) => {
    setAmount(val);
    const norm = normalizeMoneyString(val);
    if (norm === '0.00') {
      setAgreementStatus('NOT_REQUIRED');
    } else if (norm && Number(norm) > 0 && agreementStatus === 'NOT_REQUIRED') {
      setAgreementStatus('AGREED');
    }
  };

  const validateAndBuild = () => {
    if (!normalizedAmount) {
      setFieldError('Số tiền bồi thường phải hợp lệ (VD: 0.00 hoặc 1500000.00).');
      return null;
    }
    if (!reason.trim()) {
      setFieldError('Bắt buộc nhập căn cứ / lý do kết quả bồi thường.');
      return null;
    }
    if (isZero) {
      if (agreementStatus !== 'NOT_REQUIRED') {
        setFieldError('Số tiền 0.00 bắt buộc chọn NOT_REQUIRED.');
        return null;
      }
      setFieldError('');
      return {
        evidence_ticket_id: String(evidenceTicketId),
        amount: '0.00',
        agreement_status: 'NOT_REQUIRED',
        reason: reason.trim(),
      };
    }

    if (!['AGREED', 'AUTHORITY_DECISION'].includes(agreementStatus)) {
      setFieldError('Khoản bồi thường dương bắt buộc dùng AGREED hoặc AUTHORITY_DECISION.');
      return null;
    }
    if (!paymentMethod.trim() || !paymentReference.trim() || !paidAt) {
      setFieldError('Khoản bồi thường dương cần đủ phương thức thanh toán, mã tham chiếu và thời điểm thanh toán.');
      return null;
    }
    setFieldError('');
    return {
      evidence_ticket_id: String(evidenceTicketId),
      amount: normalizedAmount,
      agreement_status: agreementStatus,
      payment_method: paymentMethod.trim(),
      payment_reference: paymentReference.trim(),
      paid_at: toIsoWithVietnamOffset(paidAt),
      reason: reason.trim(),
    };
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    const payload = validateAndBuild();
    if (!payload) return;
    try {
      const res = await mutation.execute(`inc_comp_${incident.id}`, payload);
      toast.success(`Đã ghi nhận kết quả bồi thường ngoài hệ thống (${formatVnd(payload.amount)}).`);
      onSuccess(res.data);
    } catch {
      // Hiển thị lỗi tại modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="md"
        title={`Ghi nhận bồi thường ngoài hệ thống — Hồ sơ #${incident.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!evidenceTicketId || !reason.trim()}
              loading={mutation.loading}
              onClick={() => {
                if (validateAndBuild()) setConfirmOpen(true);
              }}
            >
              Ghi nhận kết quả bồi thường
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Bồi thường xử lý bên ngoài hệ thống (chuyển khoản, tiền mặt, quyết định cơ quan chức năng) — không trừ qua ví hay cọc nội bộ và chỉ ghi nhận một lần.
        </div>

        <TicketSelector
          label="Ticket bằng chứng thỏa thuận / biên lai"
          tickets={humanTickets}
          value={evidenceTicketId}
          onChange={setEvidenceTicketId}
        />

        <div className="grid-2">
          <TextField
            label="Số tiền bồi thường (VND)"
            required
            value={amount}
            hint='Nhập "0.00" nếu không phải bồi thường; > 0 nếu có thanh toán ngoài hệ thống'
            onChange={(e) => handleAmountChange(e.target.value)}
          />
          <SelectField
            label="Trạng thái thỏa thuận"
            required
            value={agreementStatus}
            options={
              isZero
                ? [{ value: 'NOT_REQUIRED', label: 'Không yêu cầu bồi thường (NOT_REQUIRED)' }]
                : [
                    { value: 'AGREED', label: 'Hai bên đã thỏa thuận (AGREED)' },
                    {
                      value: 'AUTHORITY_DECISION',
                      label: 'Quyết định cơ quan thẩm quyền (AUTHORITY_DECISION)',
                    },
                  ]
            }
            onChange={(e) => setAgreementStatus(e.target.value)}
          />
        </div>

        {!isZero && (
          <div className="grid-2">
            <TextField
              label="Phương thức thanh toán ngoài (payment_method)"
              required
              maxLength={50}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
            <TextField
              label="Mã tham chiếu / chứng từ (payment_reference)"
              required
              maxLength={120}
              placeholder="VD: VCB-20261119-001"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
            />
            <TextField
              label="Thời điểm thanh toán ngoài (giờ VN)"
              type="datetime-local"
              required
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
        )}

        <TextareaField
          label="Căn cứ / lý do xác nhận bồi thường"
          required
          maxLength={5000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {(fieldError || mutation.error) && (
          <div className="alert alert-danger" role="alert">
            {fieldError || getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận ghi nhận bồi thường ngoài hệ thống"
        message={`Ghi nhận một lần số tiền ${formatVnd(normalizedAmount)} (${agreementStatus})? Thao tác không thay đổi số dư ví/cọc và không thể sửa lại sau khi lưu.`}
        confirmLabel="Xác nhận ghi nhận"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function RefundDepositModal({
  incident,
  humanTickets,
  financeSummary,
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const [evidenceTicketId, setEvidenceTicketId] = useState(humanTickets[0]?.id || '');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    refundIncidentDeposit(incident.id, payload, idempotencyKey)
  );

  const expectedAmount = financeSummary?.deposit_remaining_held || '0.00';

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const res = await mutation.execute(`inc_refund_deposit_${incident.id}`, {
        evidence_ticket_id: String(evidenceTicketId),
        expected_amount: expectedAmount,
        reason: reason.trim(),
      });
      toast.success(`Đã hoàn trả toàn bộ cọc dư (${formatVnd(expectedAmount)}) về ví khách.`);
      onSuccess(res.data);
    } catch {
      // Hiển thị lỗi tại modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="sm"
        title={`Hoàn cọc dư về ví — Hồ sơ #${incident.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!evidenceTicketId || !reason.trim()}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Hoàn {formatVnd(expectedAmount)}
            </Button>
          </>
        }
      >
        <p className="muted">
          Tiền cọc còn giữ hiện tại: <strong>{formatVnd(expectedAmount)}</strong>. Cọc chỉ hoàn về ví khách sau khi đã quyết toán tiền thuê sự cố.
        </p>

        <TicketSelector
          label="Ticket bằng chứng hoàn cọc"
          tickets={humanTickets}
          value={evidenceTicketId}
          onChange={setEvidenceTicketId}
        />

        <TextareaField
          label="Lý do hoàn cọc dư"
          required
          maxLength={5000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận hoàn cọc dư về ví"
        message={`Hoàn ${formatVnd(expectedAmount)} tiền cọc dư về ví khách hàng?`}
        confirmLabel="Xác nhận hoàn cọc"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function CloseIncidentModal({ incident, humanTickets, onClose, onSuccess }) {
  const toast = useToast();
  const [evidenceTicketId, setEvidenceTicketId] = useState(humanTickets[0]?.id || '');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    closeIncident(incident.id, payload, idempotencyKey)
  );

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const res = await mutation.execute(`inc_close_${incident.id}`, {
        evidence_ticket_id: String(evidenceTicketId),
        reason: reason.trim(),
      });
      toast.success(`Đã đóng hồ sơ sự cố #${incident.id} (CLOSED_INCIDENT).`);
      onSuccess(res.data);
    } catch {
      // Hiển thị lỗi tại modal.
    }
  };

  return (
    <>
      <Modal
        open
        size="sm"
        title={`Đóng hồ sơ sự cố #${incident.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!evidenceTicketId || !reason.trim()}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Đóng hồ sơ (CLOSED)
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Đóng hồ sơ chuyển chuyến thuê sang <code>CLOSED_INCIDENT</code>, không sửa trạng thái xe (nếu chưa tìm thấy xe vẫn giữ <code>STOLEN</code>) và không ghi lại doanh thu.
        </div>

        <TicketSelector
          label="Ticket bằng chứng đóng hồ sơ"
          tickets={humanTickets}
          value={evidenceTicketId}
          onChange={setEvidenceTicketId}
        />

        <TextareaField
          label="Ghi chú đóng hồ sơ"
          required
          maxLength={5000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận đóng hồ sơ sự cố"
        message={`Đóng vĩnh viễn hồ sơ #${incident.id} và chuyển chuyến thuê sang CLOSED_INCIDENT?`}
        confirmLabel="Xác nhận đóng"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
