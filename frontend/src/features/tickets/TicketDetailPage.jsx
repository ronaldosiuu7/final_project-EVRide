import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PrivateImage,
  SelectField,
  StatusBadge,
  TextareaField,
  useToast,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import { useAuth } from '../../integrations/authBridge';
import { uploadEvidenceFile, validateEvidenceFile } from '../../integrations/fileBridge';
import { listActiveEmployees } from '../../services/accountsApi';
import {
  attachFileToTicket,
  getTicket,
  listTicketAttachments,
  updateTicket,
} from '../../services/operationsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { formatDateTimeVN } from '../../utils/format';

const NEXT_STATUS = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'RESOLVED',
  RESOLVED: 'CLOSED',
  CLOSED: null,
};

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const toast = useToast();
  const { user } = useAuth();

  const ticketQuery = useApiQuery(({ signal }) => getTicket(ticketId, { signal }), [ticketId]);
  const employeesQuery = useApiQuery(({ signal }) => listActiveEmployees({ signal }), []);
  const attachmentsQuery = useApiQuery(
    ({ signal }) => listTicketAttachments(ticketId, { page: 1, page_size: 50 }, { signal }),
    [ticketId]
  );

  const [assignedTo, setAssignedTo] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const attachMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    attachFileToTicket(payload.file_id, ticketId, idempotencyKey)
  );

  useEffect(() => {
    setSelectedFile(null);
    setFileInputKey((k) => k + 1);
    setUploadError('');
    setUpdateError('');
    setConfirmAction(null);
  }, [ticketId]);

  useEffect(() => {
    if (ticketQuery.data) {
      setAssignedTo(ticketQuery.data.assigned_to || user?.id || '');
      setResolutionNote(ticketQuery.data.resolution_note || '');
    }
  }, [ticketQuery.data, user?.id]);

  if (ticketQuery.loading) return <LoadingState />;
  if (ticketQuery.error) return <ErrorState error={ticketQuery.error} onRetry={ticketQuery.reload} />;

  const ticket = ticketQuery.data;
  if (!ticket) return null;

  const employees = employeesQuery.data || [];
  const nextStatus = NEXT_STATUS[ticket.status];
  const isSystemAlert = ticket.check_cycle !== null && ticket.check_cycle !== undefined;

  const submitPatch = async (payload) => {
    setConfirmAction(null);
    setUpdating(true);
    setUpdateError('');
    try {
      await updateTicket(ticket.id, payload);
      toast.success(`Đã cập nhật ticket #${ticket.id}.`);
      ticketQuery.reload();
    } catch (err) {
      setUpdateError(getApiErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  };

  const handleUploadEvidence = async (event) => {
    event.preventDefault();
    const validationErr = validateEvidenceFile(selectedFile);
    if (validationErr) {
      setUploadError(validationErr);
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const uploaded = await uploadEvidenceFile(selectedFile);
      await attachMutation.execute(`attach_ticket_${ticket.id}_${uploaded.file_id}`, {
        file_id: uploaded.file_id,
      });
      toast.success(`Đã tải lên và gắn ảnh bằng chứng #${uploaded.file_id} vào ticket.`);
      setSelectedFile(null);
      setFileInputKey((k) => k + 1);
      attachmentsQuery.reload();
    } catch (err) {
      setUploadError(getApiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <Link to="/admin/tickets">← Quay lại danh sách ticket</Link>
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <h2>
              Ticket #{ticket.id}: {ticket.title}
            </h2>
            <StatusBadge domain="ticketStatus" value={ticket.status} />
          </div>
        </div>
        <div className="page-header-actions">
          <Link to={`/admin/rentals/${ticket.rental_id}`} className="btn">
            Xem chuyến #{ticket.rental_id}
          </Link>
          <Link to={`/admin/incidents?rental_id=${ticket.rental_id}`} className="btn">
            Hồ sơ sự cố liên quan
          </Link>
        </div>
      </div>

      {isSystemAlert && (
        <div className="alert alert-warning">
          Ticket này là cảnh báo chu kỳ <code>check_cycle = {ticket.check_cycle}</code>; phải xử lý qua luồng kiểm tra 24 giờ (<code>/admin/check-ins</code>).
        </div>
      )}

      <div className="card stack-md">
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>Chuyến thuê</dt>
            <dd>
              <Link to={`/admin/rentals/${ticket.rental_id}`}>#{ticket.rental_id}</Link>
            </dd>
          </div>
          <div className="detail-item">
            <dt>Nguồn báo / Thời điểm tiếp nhận</dt>
            <dd>
              <code>{ticket.report_source || 'LEGACY'}</code> · {formatDateTimeVN(ticket.received_at)}
            </dd>
          </div>
          <div className="detail-item">
            <dt>Người tạo / Người phụ trách</dt>
            <dd>
              {ticket.created_by ? `User #${ticket.created_by}` : 'SYSTEM'} →{' '}
              {ticket.assigned_to ? `User #${ticket.assigned_to}` : 'Chưa phân công'}
            </dd>
          </div>
          <div className="detail-item">
            <dt>Thời điểm tạo / Giải quyết</dt>
            <dd>
              {formatDateTimeVN(ticket.created_at)} · {formatDateTimeVN(ticket.resolved_at)}
            </dd>
          </div>
        </dl>
        <div>
          <strong>Mô tả:</strong>
          <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
        </div>
        {ticket.resolution_note && (
          <div className="alert alert-success">
            <strong>Kết quả giải quyết:</strong> {ticket.resolution_note}
          </div>
        )}
      </div>

      {!isSystemAlert && ticket.status !== 'CLOSED' && (
        <div className="card stack-md">
          <h3>Cập nhật xử lý ticket (Tuần tự: OPEN → IN_PROGRESS → RESOLVED → CLOSED)</h3>

          <div className="grid-2">
            <SelectField
              label="Phân công nhân viên phụ trách (STAFF/MANAGER ACTIVE)"
              value={assignedTo}
              placeholder="Chọn nhân viên phụ trách"
              options={employees.map((emp) => ({
                value: emp.id,
                label: `#${emp.id} - ${emp.name} (${emp.role})`,
              }))}
              onChange={(e) => setAssignedTo(e.target.value)}
            />
          </div>

          {ticket.status === 'IN_PROGRESS' && (
            <TextareaField
              label="Kết quả xử lý (bắt buộc khi chuyển RESOLVED)"
              required
              maxLength={5000}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
            />
          )}

          {updateError && (
            <div className="alert alert-danger" role="alert">
              {updateError}
            </div>
          )}

          <div className="row-wrap">
            {assignedTo && assignedTo !== ticket.assigned_to && (
              <Button
                loading={updating}
                onClick={() => submitPatch({ assigned_to: String(assignedTo) })}
              >
                Chỉ cập nhật phân công
              </Button>
            )}
            {nextStatus && (
              <Button
                variant="primary"
                loading={updating}
                disabled={
                  (nextStatus === 'IN_PROGRESS' && !assignedTo) ||
                  (nextStatus === 'RESOLVED' && !resolutionNote.trim())
                }
                onClick={() => {
                  const payload = { status: nextStatus };
                  if (assignedTo && assignedTo !== ticket.assigned_to) {
                    payload.assigned_to = String(assignedTo);
                  } else if (nextStatus === 'IN_PROGRESS' && assignedTo) {
                    payload.assigned_to = String(assignedTo);
                  }
                  if (nextStatus === 'RESOLVED') {
                    payload.resolution_note = resolutionNote.trim();
                  }
                  setConfirmAction({
                    title: `Chuyển ticket sang ${nextStatus}`,
                    message: `Xác nhận chuyển ticket #${ticket.id} từ ${ticket.status} sang ${nextStatus}?`,
                    payload,
                  });
                }}
              >
                Chuyển sang {nextStatus}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="card stack-md">
        <div className="card-header">
          <h3>Ảnh bằng chứng đính kèm (<code>TICKET_EVIDENCE</code>)</h3>
        </div>

        <form onSubmit={handleUploadEvidence} className="row-wrap">
          <input
            key={fileInputKey}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Chọn ảnh bằng chứng (JPEG, PNG, WebP tối đa 10 MiB)"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />
          <Button type="submit" variant="primary" disabled={!selectedFile} loading={uploading}>
            Tải lên &amp; Gắn vào ticket
          </Button>
        </form>
        {uploadError && (
          <div className="alert alert-danger" role="alert">
            {uploadError}
          </div>
        )}

        {attachmentsQuery.loading ? (
          <LoadingState message="Đang tải danh sách ảnh đính kèm..." />
        ) : attachmentsQuery.error ? (
          <ErrorState error={attachmentsQuery.error} onRetry={attachmentsQuery.reload} />
        ) : (attachmentsQuery.data || []).length === 0 ? (
          <p className="muted">Chưa có ảnh bằng chứng nào gắn với ticket này.</p>
        ) : (
          <div className="grid-2">
            {(attachmentsQuery.data || []).map((att) => (
              <PrivateImage
                key={att.id}
                fileIdOrUrl={att.file_id}
                label={`Tệp #${att.file_id} · Gắn lúc ${formatDateTimeVN(att.created_at)}`}
                alt={`Bang chung ticket ${ticket.id} file ${att.file_id}`}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel="Xác nhận"
        variant="primary"
        loading={updating}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && submitPatch(confirmAction.payload)}
      />
    </div>
  );
}
