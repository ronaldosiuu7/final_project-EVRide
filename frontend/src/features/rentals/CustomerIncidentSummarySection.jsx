import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import { getIncidentFinanceSummary } from '../../services/incidentsApi.js';
import {
  Button,
  ErrorState,
  LoadingState,
  StatusBadge,
  TextField,
} from '../../components/ui/index.js';
import { formatDateTimeVN } from '../../utils/format.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { formatMoneyDisplay } from '../../utils/fleetDisplay.js';
import { isPositiveIdString } from '../../utils/validation.js';
import { isIncidentRentalStatus } from '../../utils/rentalHelpers.js';
import { describeExternalCompensation } from '../../utils/supportHelpers.js';

/**
 * Thông tin sự cố & tách bạch tài chính phía Khách hàng.
 * - CHỈ sử dụng endpoint CUSTOMER có quyền: `GET /rental-incidents/{id}/finance-summary`.
 * - TUYỆT ĐỐI KHÔNG gọi các endpoint vận hành của STAFF/MANAGER (`/rental-incidents`, `/events`, `/rent-preview`).
 * - Tách rõ: tiền thuê (tạm tính vs đã chốt), tiền cọc đang giữ, và bồi thường ngoài hệ thống (phân biệt null với 0đ).
 */
export default function CustomerIncidentSummarySection({ rental }) {
  const [searchParams] = useSearchParams();
  const initialIncidentId =
    (rental?.incident_id ? String(rental.incident_id) : '') ||
    (searchParams.get('incident_id') || '');

  const [incidentIdInput, setIncidentIdInput] = useState(initialIncidentId);
  const [activeIncidentId, setActiveIncidentId] = useState(initialIncidentId);

  const isIncidentTrip = isIncidentRentalStatus(rental?.status);

  const summaryQuery = useApiQuery(
    ({ signal }) => getIncidentFinanceSummary(activeIncidentId, { signal }),
    [activeIncidentId],
    { enabled: isIncidentTrip && isPositiveIdString(activeIncidentId) }
  );

  if (!isIncidentTrip) {
    return null;
  }

  const summary = summaryQuery.data;
  const compensationInfo = summary
    ? describeExternalCompensation(
        summary.compensation_amount,
        Boolean(summary.external_compensation_settled)
      )
    : null;

  const isNotConfirmedYet = summaryQuery.error?.code === 'INCIDENT_NOT_CONFIRMED';
  const isNotFound = summaryQuery.error?.status === 404;

  const handleLookup = (event) => {
    event.preventDefault();
    const trimmed = incidentIdInput.trim();
    if (isPositiveIdString(trimmed)) {
      setActiveIncidentId(trimmed);
    }
  };

  return (
    <section className="station-detail-panel" aria-labelledby="customer-incident-heading">
      <div className="station-detail-top">
        <div>
          <h2 id="customer-incident-heading" className="customer-card-title">
            Thông tin xử lý sự cố &amp; Tách bạch tài chính
          </h2>
          <p className="station-card-address">
            Gửi báo cáo sự cố không tự động dừng tính cước hay xác định trách nhiệm. Các khoản tiền thuê, tiền cọc và bồi thường ngoài hệ thống luôn được tách biệt rõ ràng.
          </p>
        </div>
        <Link
          to={`/support?rental_id=${encodeURIComponent(String(rental.id))}`}
          className="btn btn-sm btn-secondary"
        >
          Gửi yêu cầu hỗ trợ / Bằng chứng
        </Link>
      </div>

      {/* Tổng quan tối thiểu luôn có từ dữ liệu chuyến thuê */}
      <div className="station-detail-stats">
        <div className="station-metric-box">
          <span className="customer-meta-label">Tiền thuê chuyến</span>
          <strong className="customer-meta-value">
            {summary
              ? `${formatMoneyDisplay(summary.rent_paid)} (${summary.rent_settled ? 'Đã chốt quyết toán' : 'Tạm tính / Chưa chốt'})`
              : rental.total_price !== null && rental.total_price !== undefined
                ? `${formatMoneyDisplay(rental.total_price)} (Đã chốt)`
                : 'Chưa chốt tiền thuê'}
          </strong>
        </div>

        <div className="station-metric-box">
          <span className="customer-meta-label">Tiền cọc đang tạm giữ</span>
          <strong className="customer-meta-value">
            {formatMoneyDisplay(summary ? summary.deposit_remaining_held : rental.deposit_held)}
          </strong>
        </div>

        <div className="station-metric-box">
          <span className="customer-meta-label">Bồi thường ngoài hệ thống</span>
          <strong className="customer-meta-value">
            {compensationInfo ? compensationInfo.valueText : 'Chưa có tổng hợp hồ sơ'}
          </strong>
          {compensationInfo && (
            <span className="customer-meta-label" style={{ marginTop: 2 }}>
              {compensationInfo.statusLabel}
            </span>
          )}
        </div>
      </div>

      {/* Tra cứu bảng tổng hợp tài chính sự cố nếu biết mã hồ sơ sự cố */}
      {!rental?.incident_id && (
        <form onSubmit={handleLookup} className="quote-action-bar" noValidate>
          <div style={{ flex: '1 1 240px' }}>
            <TextField
              label="Mã hồ sơ sự cố (nếu nhân viên đã cung cấp)"
              placeholder="Nhập mã số hồ sơ để xem tổng hợp tài chính..."
              value={incidentIdInput}
              onChange={(e) => setIncidentIdInput(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={!isPositiveIdString(incidentIdInput.trim())}
          >
            Xem tổng hợp tài chính sự cố
          </Button>
        </form>
      )}

      {summaryQuery.loading && (
        <LoadingState message="Đang tải tổng hợp tài chính hồ sơ sự cố..." />
      )}

      {!summaryQuery.loading && summaryQuery.error && (
        isNotConfirmedYet ? (
          <div className="alert alert-info" role="status">
            Hồ sơ sự cố đang trong quá trình xác minh nên chưa có bảng tổng hợp tài chính chính thức.
          </div>
        ) : isNotFound ? (
          <div className="alert alert-warning" role="status">
            Không tìm thấy hồ sơ sự cố khớp mã đã nhập trong phạm vi tài khoản của bạn.
          </div>
        ) : (
          <ErrorState
            error={summaryQuery.error}
            onRetry={summaryQuery.reload}
            title="Không tải được tổng hợp tài chính sự cố"
            hideCode
          />
        )
      )}

      {!summaryQuery.loading && summary && (
        <div className="quote-result-panel">
          <div className="station-detail-top">
            <strong>Tổng hợp tài chính hồ sơ sự cố (Chính thức từ hệ thống)</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <StatusBadge
                label={getCustomerStatusMeta('incidentStatus', summary.incident_status).label}
                tone={getCustomerStatusMeta('incidentStatus', summary.incident_status).tone}
              />
              <StatusBadge
                label={getCustomerStatusMeta('agreementStatus', summary.agreement_status).label}
                tone={getCustomerStatusMeta('agreementStatus', summary.agreement_status).tone}
              />
            </div>
          </div>

          <dl className="vehicle-pricing-list">
            <div className="vehicle-pricing-row">
              <dt>Tiền thuê đã quyết toán ({summary.rent_settled ? 'Đã chốt' : 'Chưa chốt'})</dt>
              <dd>{formatMoneyDisplay(summary.rent_paid)}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Tiền cọc còn đang tạm giữ</dt>
              <dd>{formatMoneyDisplay(summary.deposit_remaining_held)}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Bồi thường ngoài hệ thống</dt>
              <dd>{compensationInfo.valueText} — {compensationInfo.statusLabel}</dd>
            </div>
            {summary.closed_at && (
              <div className="vehicle-pricing-row">
                <dt>Thời điểm đóng hồ sơ sự cố</dt>
                <dd>{formatDateTimeVN(summary.closed_at, { withSeconds: true })}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
