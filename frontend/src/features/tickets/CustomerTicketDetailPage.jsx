import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import useIdempotentMutation from '../../hooks/useIdempotentMutation.js';
import {
  attachFileToTicket,
  getTicket,
  listTicketAttachments,
} from '../../services/operationsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  ImageUploadField,
  LoadingState,
  Pagination,
  PrivateImage,
  StatusBadge,
  useToast,
} from '../../components/ui/index.js';
import { formatDateTimeVN } from '../../utils/format.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';

export default function CustomerTicketDetailPage() {
  const { ticketId } = useParams();
  const toast = useToast();

  const [attPage, setAttPage] = useState(1);
  const [newPhoto, setNewPhoto] = useState(null);
  const [uploadResetKey, setUploadResetKey] = useState(0);

  const ticketQuery = useApiQuery(
    ({ signal }) => getTicket(ticketId, { signal }),
    [ticketId],
    { enabled: Boolean(ticketId) }
  );

  const attachmentsQuery = useApiQuery(
    ({ signal }) =>
      listTicketAttachments(ticketId, { page: attPage, page_size: 12 }, { signal }),
    [ticketId, attPage],
    { enabled: Boolean(ticketId) && Boolean(ticketQuery.data) }
  );

  const attachMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    attachFileToTicket(payload.fileId, payload.ticketId, idempotencyKey)
  );

  const handleAttachPhoto = async () => {
    if (!newPhoto?.file_id || !ticketId) return;
    try {
      await attachMutation.execute(`attach-ticket:${ticketId}:${newPhoto.file_id}`, {
        fileId: String(newPhoto.file_id),
        ticketId: String(ticketId),
      });
      toast.success('Đã đính kèm ảnh bằng chứng vào yêu cầu hỗ trợ.');
      setNewPhoto(null);
      setUploadResetKey((prev) => prev + 1);
      attachmentsQuery.reload();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  if (ticketQuery.loading && !ticketQuery.data) {
    return <LoadingState message="Đang tải chi tiết yêu cầu hỗ trợ..." />;
  }

  if (ticketQuery.error) {
    const isNotFound = ticketQuery.error.status === 404;
    return (
      <div className="customer-page">
        <nav className="customer-breadcrumb" aria-label="Đường dẫn">
          <Link to="/support">Hỗ trợ</Link>
          <span aria-hidden="true">/</span>
          <span>Chi tiết yêu cầu</span>
        </nav>

        {isNotFound ? (
          <EmptyState
            title="Không tìm thấy yêu cầu hỗ trợ này"
            hint="Yêu cầu không tồn tại hoặc không thuộc tài khoản của bạn."
            action={
              <Link to="/support" className="btn btn-primary">
                Quay lại danh sách hỗ trợ
              </Link>
            }
          />
        ) : (
          <ErrorState
            error={ticketQuery.error}
            onRetry={ticketQuery.reload}
            title="Không tải được chi tiết yêu cầu hỗ trợ"
            hideCode
          />
        )}
      </div>
    );
  }

  const ticket = ticketQuery.data;
  if (!ticket) return null;

  const statusMeta = getCustomerStatusMeta('ticketStatus', ticket.status);
  const attachments = Array.isArray(attachmentsQuery.data) ? attachmentsQuery.data : [];
  const canAddEvidence = ticket.status !== 'CLOSED';

  return (
    <div className="customer-page">
      <nav className="customer-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <Link to="/support">Hỗ trợ</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{ticket.title}</span>
      </nav>

      <section className="station-detail-panel" aria-labelledby="ticket-detail-heading">
        <div className="station-detail-top">
          <div>
            <h1 id="ticket-detail-heading" className="customer-page-title">
              {ticket.title}
            </h1>
            <p className="station-card-address">
              Gửi lúc <strong>{formatDateTimeVN(ticket.created_at, { withSeconds: true })}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            <Button size="sm" variant="secondary" onClick={ticketQuery.reload}>
              Làm mới
            </Button>
          </div>
        </div>

        <div className="station-metric-box">
          <span className="customer-meta-label">Nội dung mô tả</span>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{ticket.description}</p>
        </div>

        {ticket.resolution_note ? (
          <div className="alert alert-success stack-xs">
            <strong>Kết quả xử lý từ nhân viên EVRide:</strong>
            <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.resolution_note}</p>
          </div>
        ) : (
          <div className="alert alert-info">
            Yêu cầu đang được đội ngũ vận hành tiếp nhận và xử lý. Gửi yêu cầu hỗ trợ không tự động dừng tính cước chuyến thuê.
          </div>
        )}

        <div className="customer-card-actions">
          {ticket.rental_id && (
            <Link
              to={`/rentals/${encodeURIComponent(String(ticket.rental_id))}`}
              className="btn btn-sm btn-secondary"
            >
              Xem chuyến thuê liên quan →
            </Link>
          )}
          <Link to="/support" className="btn btn-sm btn-ghost">
            ← Danh sách hỗ trợ
          </Link>
        </div>
      </section>

      {/* Ảnh bằng chứng đính kèm */}
      <section className="station-detail-panel" aria-labelledby="ticket-evidence-heading">
        <div className="station-detail-top">
          <div>
            <h2 id="ticket-evidence-heading" className="customer-card-title">
              Ảnh bằng chứng đính kèm
            </h2>
            <p className="station-card-address">
              Ảnh được tải bảo mật theo phiên đăng nhập hiện tại.
            </p>
          </div>
        </div>

        {canAddEvidence && (
          <div className="stack-sm">
            <ImageUploadField
              key={uploadResetKey}
              label="Bổ sung ảnh bằng chứng mới"
              value={newPhoto}
              onChange={setNewPhoto}
              disabled={attachMutation.loading}
            />
            {newPhoto?.file_id && (
              <div>
                <Button
                  size="sm"
                  variant="primary"
                  loading={attachMutation.loading}
                  onClick={handleAttachPhoto}
                >
                  Đính kèm ảnh này vào yêu cầu
                </Button>
              </div>
            )}
          </div>
        )}

        {attachmentsQuery.loading && !attachmentsQuery.data && (
          <LoadingState message="Đang tải danh sách ảnh bằng chứng..." />
        )}

        {!attachmentsQuery.loading && attachmentsQuery.error && (
          <ErrorState
            error={attachmentsQuery.error}
            onRetry={attachmentsQuery.reload}
            title="Không tải được danh sách ảnh bằng chứng"
            hideCode
          />
        )}

        {!attachmentsQuery.loading && !attachmentsQuery.error && attachments.length === 0 && (
          <EmptyState
            title="Chưa có ảnh bằng chứng nào được đính kèm"
            hint="Bạn có thể bổ sung ảnh chụp xe hoặc hiện trường ở khung phía trên."
          />
        )}

        {!attachmentsQuery.error && attachments.length > 0 && (
          <>
            <div className="sensitive-images-grid">
              {attachments.map((att) => (
                <PrivateImage
                  key={att.id}
                  fileIdOrUrl={att.file_id}
                  label={`Bằng chứng lúc ${formatDateTimeVN(att.created_at)}`}
                  alt="Ảnh bằng chứng yêu cầu hỗ trợ"
                />
              ))}
            </div>

            <Pagination
              meta={attachmentsQuery.meta}
              onPageChange={(nextPage) => setAttPage(nextPage)}
            />
          </>
        )}
      </section>
    </div>
  );
}
