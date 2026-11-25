import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import useIdempotentMutation from '../../hooks/useIdempotentMutation.js';
import { listRentals } from '../../services/rentalsApi.js';
import {
  attachFileToTicket,
  createTicket,
  listTickets,
} from '../../services/operationsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  ImageUploadField,
  LoadingState,
  Modal,
  Pagination,
  SelectField,
  StatusBadge,
  TextareaField,
  TextField,
  useToast,
} from '../../components/ui/index.js';
import { formatDateTimeVN } from '../../utils/format.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import { mapApiFieldErrors } from '../../utils/validation.js';
import { applyFilterPatch, getSystemTotalFromMeta } from '../../utils/fleetDisplay.js';
import {
  canCreateTicketForRental,
  CUSTOMER_TICKET_STATUS_OPTIONS,
  validateCustomerTicketForm,
} from '../../utils/supportHelpers.js';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function CustomerTicketCreateModal({ initialRentalId = '', onClose, onCreated }) {
  const toast = useToast();
  const navigate = useNavigate();

  const rentalsQuery = useApiQuery(
    ({ signal }) => listRentals({ page: 1, page_size: 50 }, { signal }),
    []
  );

  const eligibleRentals = useMemo(() => {
    const items = Array.isArray(rentalsQuery.data) ? rentalsQuery.data : [];
    return items.filter(canCreateTicketForRental);
  }, [rentalsQuery.data]);

  const [rentalId, setRentalId] = useState(initialRentalId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const attachMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    attachFileToTicket(payload.fileId, payload.ticketId, idempotencyKey)
  );

  const rentalOptions = useMemo(() => {
    const base = [{ value: '', label: 'Chọn chuyến thuê cần hỗ trợ...' }];
    for (const r of eligibleRentals) {
      const statusMeta = getCustomerStatusMeta('rentalStatus', r.status);
      base.push({
        value: String(r.id),
        label: `${r.vehicle_name || 'Xe máy điện'} (${statusMeta.label}) — ${formatDateTimeVN(r.created_at)}`,
      });
    }
    return base;
  }, [eligibleRentals]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateCustomerTicketForm({ rentalId, title, description });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      const { data: created } = await createTicket(rentalId, {
        title: title.trim(),
        description: description.trim(),
      });

      if (evidenceFile?.file_id && created?.id) {
        try {
          await attachMutation.execute(`attach-ticket:${created.id}:${evidenceFile.file_id}`, {
            fileId: String(evidenceFile.file_id),
            ticketId: String(created.id),
          });
        } catch (attachErr) {
          toast.info(
            `Đã tạo yêu cầu hỗ trợ thành công, nhưng chưa gắn được ảnh bằng chứng (${getApiErrorMessage(attachErr)}). Bạn có thể đính kèm lại trong trang chi tiết.`
          );
          onCreated?.(created);
          onClose();
          navigate(`/support/tickets/${encodeURIComponent(String(created.id))}`);
          return;
        }
      }

      toast.success('Đã gửi yêu cầu hỗ trợ thành công.');
      onCreated?.(created);
      onClose();
      if (created?.id) {
        navigate(`/support/tickets/${encodeURIComponent(String(created.id))}`);
      }
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
      size="md"
      title="Gửi yêu cầu hỗ trợ / Báo cáo sự cố"
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button
            type="submit"
            form="customer-ticket-create-form"
            variant="primary"
            loading={submitting}
            disabled={eligibleRentals.length === 0 && !rentalsQuery.loading}
          >
            Gửi yêu cầu hỗ trợ
          </Button>
        </>
      }
    >
      <form id="customer-ticket-create-form" onSubmit={handleSubmit} className="stack-md" noValidate>
        <div className="alert alert-info">
          Gửi yêu cầu hỗ trợ hoặc báo cáo sự cố <strong>không tự động dừng tính cước chuyến thuê</strong> và không tự xác định trách nhiệm. Nhân viên EVRide sẽ kiểm tra và phản hồi kết quả xử lý trên yêu cầu này.
        </div>

        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}

        {rentalsQuery.loading ? (
          <LoadingState message="Đang tải danh sách chuyến thuê của bạn..." />
        ) : eligibleRentals.length === 0 ? (
          <div className="alert alert-warning" role="status">
            Bạn chưa có chuyến thuê nào ở trạng thái được phép tạo yêu cầu hỗ trợ (đang thuê, chờ quyết toán, đang xử lý sự cố hoặc đã hoàn tất).
          </div>
        ) : (
          <SelectField
            label="Chuyến thuê liên quan"
            required
            value={rentalId}
            error={fieldErrors.rental_id}
            disabled={submitting}
            onChange={(e) => setRentalId(e.target.value)}
            options={rentalOptions}
          />
        )}

        <TextField
          label="Tiêu đề yêu cầu"
          required
          maxLength={200}
          placeholder="Ví dụ: Xe gặp sự cố phanh, báo mất xe, cần hỗ trợ trả xe..."
          value={title}
          error={fieldErrors.title}
          disabled={submitting}
          onChange={(e) => setTitle(e.target.value)}
        />

        <TextareaField
          label="Mô tả chi tiết"
          required
          rows={4}
          maxLength={5000}
          placeholder="Mô tả rõ tình huống, vị trí hoặc vấn đề bạn đang gặp phải..."
          value={description}
          error={fieldErrors.description}
          disabled={submitting}
          onChange={(e) => setDescription(e.target.value)}
        />

        <ImageUploadField
          label="Ảnh bằng chứng đính kèm (tùy chọn)"
          hint="Tải ảnh hiện trường hoặc ảnh lỗi xe (JPEG, PNG, WebP tối đa 10 MiB)."
          value={evidenceFile}
          onChange={setEvidenceFile}
          disabled={submitting}
        />
      </form>
    </Modal>
  );
}

export default function CustomerTicketListPage() {
  const [searchParams] = useSearchParams();
  const initialRentalId = searchParams.get('rental_id') || '';

  const [filters, setFilters] = useState({
    status: '',
    page: 1,
    pageSize: 10,
  });
  const [createOpen, setCreateOpen] = useState(Boolean(initialRentalId));

  const ticketsQuery = useApiQuery(
    ({ signal }) =>
      listTickets(
        {
          status: filters.status || undefined,
          page: filters.page,
          page_size: filters.pageSize,
        },
        { signal }
      ),
    [filters.status, filters.page, filters.pageSize]
  );

  const tickets = Array.isArray(ticketsQuery.data) ? ticketsQuery.data : [];
  const totalTickets = getSystemTotalFromMeta(ticketsQuery.meta);

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <h1 className="customer-page-title">Hỗ trợ &amp; Báo cáo sự cố</h1>
          <p className="customer-page-subtitle">
            Gửi yêu cầu hỗ trợ theo chuyến thuê, đính kèm ảnh bằng chứng và theo dõi kết quả xử lý từ đội ngũ vận hành EVRide.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/faq" className="btn btn-sm btn-secondary">
            Xem câu hỏi thường gặp
          </Link>
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            + Tạo yêu cầu hỗ trợ
          </Button>
        </div>
      </div>

      <FilterBar
        onReset={
          filters.status
            ? () => setFilters((prev) => applyFilterPatch(prev, { status: '' }))
            : undefined
        }
        resetLabel="Tất cả trạng thái"
      >
        <SelectField
          label="Trạng thái xử lý"
          value={filters.status}
          onChange={(e) =>
            setFilters((prev) => applyFilterPatch(prev, { status: e.target.value }))
          }
          options={CUSTOMER_TICKET_STATUS_OPTIONS}
        />
      </FilterBar>

      {!ticketsQuery.loading && !ticketsQuery.error && (
        <div className="customer-results-bar">
          <span>
            {totalTickets !== null ? (
              <>
                Tổng cộng <strong>{totalTickets}</strong> yêu cầu hỗ trợ của bạn
              </>
            ) : (
              'Danh sách yêu cầu hỗ trợ'
            )}
          </span>
          <Button size="sm" variant="ghost" onClick={ticketsQuery.reload}>
            Làm mới
          </Button>
        </div>
      )}

      {ticketsQuery.loading && !ticketsQuery.data && (
        <LoadingState message="Đang tải danh sách yêu cầu hỗ trợ..." />
      )}

      {!ticketsQuery.loading && ticketsQuery.error && (
        <ErrorState
          error={ticketsQuery.error}
          onRetry={ticketsQuery.reload}
          title="Không tải được danh sách yêu cầu hỗ trợ"
          hideCode
        />
      )}

      {!ticketsQuery.loading && !ticketsQuery.error && tickets.length === 0 && (
        <EmptyState
          title={
            filters.status
              ? 'Không có yêu cầu hỗ trợ nào ở trạng thái đã chọn'
              : 'Bạn chưa gửi yêu cầu hỗ trợ nào'
          }
          hint="Nếu gặp sự cố với xe hoặc cần hỗ trợ chuyến thuê, hãy tạo yêu cầu mới kèm ảnh bằng chứng."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Tạo yêu cầu hỗ trợ
            </Button>
          }
        />
      )}

      {!ticketsQuery.error && tickets.length > 0 && (
        <>
          <div className="document-list">
            {tickets.map((ticket) => {
              const statusMeta = getCustomerStatusMeta('ticketStatus', ticket.status);
              return (
                <article key={ticket.id} className="document-item-card">
                  <div className="document-item-head">
                    <div>
                      <h2 className="customer-card-title">{ticket.title}</h2>
                      <p className="station-card-address">
                        Gửi lúc <strong>{formatDateTimeVN(ticket.created_at, { withSeconds: true })}</strong>
                        {ticket.updated_at ? (
                          <> · Cập nhật: <strong>{formatDateTimeVN(ticket.updated_at)}</strong></>
                        ) : null}
                      </p>
                    </div>
                    <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                  </div>

                  <p className="station-card-address" style={{ marginTop: 0 }}>
                    {ticket.description}
                  </p>

                  {ticket.resolution_note && (
                    <div className="alert alert-success" style={{ margin: 0 }}>
                      <strong>Kết quả xử lý:</strong> {ticket.resolution_note}
                    </div>
                  )}

                  <div className="customer-card-actions">
                    <Link
                      to={`/support/tickets/${encodeURIComponent(String(ticket.id))}`}
                      className="btn btn-sm btn-secondary"
                    >
                      Xem chi tiết &amp; bằng chứng
                    </Link>
                    {ticket.rental_id && (
                      <Link
                        to={`/rentals/${encodeURIComponent(String(ticket.rental_id))}`}
                        className="btn btn-sm btn-ghost"
                      >
                        Xem chuyến thuê
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <Pagination
            meta={ticketsQuery.meta}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={(nextPage) => setFilters((prev) => ({ ...prev, page: nextPage }))}
            onPageSizeChange={(nextSize) =>
              setFilters((prev) => ({ ...prev, pageSize: nextSize, page: 1 }))
            }
          />
        </>
      )}

      {createOpen && (
        <CustomerTicketCreateModal
          initialRentalId={initialRentalId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => ticketsQuery.reload()}
        />
      )}
    </div>
  );
}
