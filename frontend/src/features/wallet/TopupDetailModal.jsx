import React from 'react';
import useApiQuery from '../../hooks/useApiQuery.js';
import { getTopupRequestDetail } from '../../services/walletsApi.js';
import {
  Button,
  ErrorState,
  LoadingState,
  Modal,
  StatusBadge,
} from '../../components/ui/index.js';
import { formatDateTimeVN } from '../../utils/format.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { formatMoneyDisplay } from '../../utils/fleetDisplay.js';

/**
 * Hộp thoại xem chi tiết một yêu cầu nạp tiền qua GET /wallet-topup-requests/{id}.
 * Chỉ hiển thị đúng các thông tin có trong API: số tiền, chế độ tiền mô phỏng, trạng thái,
 * thời gian gửi, thời gian xử lý và lý do từ chối (nếu bị từ chối).
 */
export default function TopupDetailModal({ requestSummary, onClose }) {
  const requestId = requestSummary?.id ? String(requestSummary.id) : '';

  const detailQuery = useApiQuery(
    ({ signal }) => getTopupRequestDetail(requestId, { signal }),
    [requestId],
    { enabled: Boolean(requestId) }
  );

  const item = detailQuery.data || requestSummary;
  const statusMeta = item ? getCustomerStatusMeta('topupStatus', item.status) : null;

  return (
    <Modal
      open
      size="md"
      title="Chi tiết yêu cầu nạp tiền"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <div className="stack-md">
        {detailQuery.loading && !detailQuery.data && (
          <LoadingState message="Đang tải chi tiết yêu cầu nạp tiền..." />
        )}

        {!detailQuery.loading && detailQuery.error && (
          <ErrorState
            error={detailQuery.error}
            onRetry={detailQuery.reload}
            title="Không tải được chi tiết yêu cầu nạp tiền"
            hideCode
          />
        )}

        {!detailQuery.error && item && (
          <>
            <div className="station-metric-box" style={{ gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <span className="customer-meta-label">Số tiền yêu cầu nạp</span>
                  <strong className="wallet-balance-amount" style={{ fontSize: '1.45rem' }}>
                    {formatMoneyDisplay(item.amount)}
                  </strong>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.payment_mode === 'DEMO' && (
                    <StatusBadge label="Tiền mô phỏng" tone="info" />
                  )}
                  {statusMeta && (
                    <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                  )}
                </div>
              </div>
            </div>

            <dl className="vehicle-pricing-list">
              <div className="vehicle-pricing-row">
                <dt>Trạng thái xử lý</dt>
                <dd>{statusMeta?.label || 'Không xác định'}</dd>
              </div>
              <div className="vehicle-pricing-row">
                <dt>Thời gian gửi yêu cầu</dt>
                <dd>{formatDateTimeVN(item.created_at, { withSeconds: true })}</dd>
              </div>
              <div className="vehicle-pricing-row">
                <dt>Thời gian nhân viên xử lý</dt>
                <dd>
                  {item.reviewed_at
                    ? formatDateTimeVN(item.reviewed_at, { withSeconds: true })
                    : 'Đang chờ nhân viên xác nhận'}
                </dd>
              </div>
            </dl>

            {item.status === 'PENDING' && (
              <div className="alert alert-info" role="status">
                Yêu cầu nạp tiền đang chờ nhân viên xác nhận. Số dư ví chỉ thay đổi sau khi yêu cầu chuyển sang trạng thái <strong>Đã duyệt</strong>.
              </div>
            )}

            {item.status === 'APPROVED' && (
              <div className="alert alert-success" role="status">
                Yêu cầu nạp tiền đã được nhân viên xác nhận và ghi nhận vào lịch sử giao dịch ví của bạn.
              </div>
            )}

            {item.status === 'REJECTED' && (
              <div className="alert alert-danger stack-xs" role="status">
                <strong>Lý do từ chối yêu cầu nạp:</strong>
                <p>{item.rejection_reason || 'Nhân viên không ghi chú lý do cụ thể.'}</p>
                <p style={{ fontSize: '0.84rem' }}>
                  Số dư ví của bạn không thay đổi khi yêu cầu bị từ chối. Bạn có thể tạo một yêu cầu nạp mới nếu cần.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
