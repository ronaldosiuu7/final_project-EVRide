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
import { getUser, listActiveEmployees } from '../../services/accountsApi';
import {
  attachFileToTicket,
  getTicket,
  listTicketAttachments,
  updateTicket,
} from '../../services/operationsApi';
import { getRental } from '../../services/rentalsApi';
import { buildIdMap, getReportSourceLabel, getUserDisplay } from '../../utils/entityDisplay';
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
  const employees = employeesQuery.data || [];
  const employeeMap = buildIdMap(employees);
  const ticketRentalId = ticketQuery.data?.rental_id;
  const ticketCreatorId = ticketQuery.data?.created_by;

  const rentalQuery = useApiQuery(
    ({ signal }) => getRental(ticketRentalId, { signal }),
    [ticketRentalId],
    { enabled: Boolean(ticketRentalId) }
  );
  const creatorQuery = useApiQuery(
    ({ signal }) => getUser(ticketCreatorId, { signal }),
    [ticketCreatorId],
    { enabled: Boolean(ticketCreatorId && !employeesQuery.loading && !employeeMap.has(String(ticketCreatorId))) }
  );
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

  const rental = rentalQuery.data;
  const creatorUser = employeeMap.get(String(ticket.created_by)) || creatorQuery.data;
  const creatorName = !ticket.created_by
    ? 'Hệ thống'
    : creatorUser?.name || `Tài khoản #${ticket.created_by}`;
  const assignee = ticket.assigned_to
    ? getUserDisplay(employeeMap, ticket.assigned_to, 'Nhân sự')
    : null;
  const nextStatus = NEXT_STATUS[ticket.status];
  const isSystemAlert = ticket.check_cycle !== null && ticket.check_cycle !== undefined;

  const submitPatch = async (payload) => {
    setConfirmAction(null);
    setUpdating(true);
    setUpdateError('');
    try {
      await updateTicket(ticket.id, payload);
      toast.success(`Đã cập nhật yêu cầu hỗ trợ #${ticket.id}.`);
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
      toast.success(`Đã tải lên và gắn ảnh bằng chứng #${uploaded.file_id} vào yêu cầu hỗ trợ.`);
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
          <Link to="/admin/tickets">← Quay lại danh sách yêu cầu hỗ trợ</Link>
          <div className="row-wrap" style={{ marginTop: 4 }}>
            <h2>{ticket.title}</h2>
            <StatusBadge domain="ticketStatus" value={ticket.status} />
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            Yêu cầu #{ticket.id} · Chuyến #{ticket.rental_id}
            {rental?.vehicle_name ? ` (${rental.vehicle_name})` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          <Link to={`/admin/rentals/${ticket.rental_id}`} className="btn">
            {rental?.vehicle_name
              ? `Xem chuyến ${rental.vehicle_name}`
              : `Xem chuyến #${ticket.rental_id}`}
          </Link>
          <Link to={`/admin/incidents?rental_id=${ticket.rental_id}`} className="btn">
            Hồ sơ sự cố liên quan
          </Link>
        </div>
      </div>

      {isSystemAlert && (
        <div className="alert alert-warning">
          Đây là nhắc kiểm tra tự động lần {ticket.check_cycle}. Vui lòng xử lý trong mục{' '}
          <Link to="/admin/check-ins">Kiểm tra 24 giờ</Link>.
        </div>
      )}

      <div className="card stack-md">
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>Chuyến thuê</dt>
            <dd>
              <Link to={`/admin/rentals/${ticket.rental_id}`}>
                {rental?.vehicle_name || `Chuyến #${ticket.rental_id}`}
              </Link>
              <div className="muted">
                Chuyến #{ticket.rental_id}
                {rental?.vehicle_model_snapshot ? ` · ${rental.vehicle_model_snapshot}` : ''}
              </div>
            </dd>
          </div>
          <div className="detail-item">
            <dt>Nguồn báo / Thời điểm tiếp nhận</dt>
            <dd>
              {getReportSourceLabel(ticket.report_source)} · {formatDateTimeVN(ticket.received_at)}
            </dd>
          </div>
          <div className="detail-item">
            <dt>Người tạo / Người phụ trách</dt>
            <dd>
              {creatorName} → {assignee ? assignee.primary : 'Chưa phân công'}
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
          <h3>Cập nhật tiến trình xử lý</h3>

          <div className="grid-2">
            <SelectField
              label="Phân công nhân viên phụ trách"
              value={assignedTo}
              placeholder="Chọn nhân viên phụ trách"
              options={employees.map((emp) => ({
                value: emp.id,
                label: `${emp.name} (${emp.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'})`,
              }))}
              onChange={(e) => setAssignedTo(e.target.value)}
            />
          </div>

          {ticket.status === 'IN_PROGRESS' && (
            <TextareaField
              label="Kết quả xử lý (bắt buộc khi đánh dấu đã giải quyết)"
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
                  const nextLabel =
                    nextStatus === 'IN_PROGRESS'
                      ? 'Đang xử lý'
                      : nextStatus === 'RESOLVED'
                        ? 'Đã giải quyết'
                        : 'Đã đóng';
                  setConfirmAction({
                    title: `Chuyển trạng thái sang ${nextLabel}`,
                    message: `Xác nhận chuyển yêu cầu #${ticket.id} sang trạng thái ${nextLabel}?`,
                    payload,
                  });
                }}
              >
                Chuyển sang{' '}
                {nextStatus === 'IN_PROGRESS'
                  ? 'Đang xử lý'
                  : nextStatus === 'RESOLVED'
                    ? 'Đã giải quyết'
                    : 'Đã đóng'}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="card stack-md">
        <div className="card-header">
          <h3>Ảnh bằng chứng đính kèm</h3>
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
            Tải lên &amp; Gắn vào yêu cầu
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
          <p className="muted">Chưa có ảnh bằng chứng nào gắn với yêu cầu hỗ trợ này.</p>
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
