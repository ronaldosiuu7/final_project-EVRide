import React, { useState } from 'react';
import { useAuth } from '../../integrations/authBridge.jsx';
import useApiQuery from '../../hooks/useApiQuery.js';
import { getRentalReview } from '../../services/rentalsApi.js';
import { createRentalReview } from '../../services/operationsApi.js';
import {
  Button,
  ErrorState,
  LoadingState,
  StatusBadge,
  TextareaField,
  useToast,
} from '../../components/ui/index.js';
import { formatDateTimeVN } from '../../utils/format.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import {
  canCustomerReviewRental,
  validateReviewForm,
} from '../../utils/supportHelpers.js';

/**
 * Đánh giá chuyến thuê 1 lần duy nhất (GET/POST /rentals/{id}/review).
 * - CHỈ cho phép chuyến COMPLETED thuộc khách.
 * - TUYỆT ĐỐI KHÔNG coi CLOSED_INCIDENT là COMPLETED.
 */
export default function CustomerReviewSection({ rental }) {
  const { user } = useAuth();
  const toast = useToast();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isCompleted = canCustomerReviewRental(rental, user?.role);
  const isClosedIncident = rental?.status === 'CLOSED_INCIDENT';

  const reviewQuery = useApiQuery(
    ({ signal }) => getRentalReview(rental.id, { signal }),
    [rental?.id || ''],
    { enabled: isCompleted }
  );

  if (isClosedIncident) {
    return (
      <section className="station-detail-panel" aria-labelledby="rental-review-heading">
        <h2 id="rental-review-heading" className="customer-card-title">
          Đánh giá chuyến thuê
        </h2>
        <div className="alert alert-info" role="status">
          Chuyến thuê kết thúc theo hồ sơ sự cố không áp dụng chức năng đánh giá chuyến.
        </div>
      </section>
    );
  }

  if (!isCompleted) {
    return null;
  }

  const isNotReviewedYet =
    reviewQuery.error &&
    (reviewQuery.error.status === 404 || reviewQuery.error.code === 'NOT_FOUND');

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateReviewForm({ rating, comment });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      const payload = { rating: Number(rating) };
      if (comment.trim()) {
        payload.comment = comment.trim();
      }
      await createRentalReview(rental.id, payload);
      toast.success('Cảm ơn bạn đã gửi đánh giá cho chuyến thuê!');
      reviewQuery.reload();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
      if (err?.code === 'ALREADY_REVIEWED') {
        reviewQuery.reload();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="station-detail-panel" aria-labelledby="rental-review-heading">
      <div className="station-detail-top">
        <div>
          <h2 id="rental-review-heading" className="customer-card-title">
            Đánh giá chuyến thuê
          </h2>
          <p className="station-card-address">
            Mỗi chuyến thuê đã hoàn tất được gửi một lần đánh giá để cải thiện chất lượng xe và dịch vụ trạm.
          </p>
        </div>
      </div>

      {reviewQuery.loading && <LoadingState message="Đang kiểm tra đánh giá chuyến..." />}

      {!reviewQuery.loading && reviewQuery.error && !isNotReviewedYet && (
        <ErrorState
          error={reviewQuery.error}
          onRetry={reviewQuery.reload}
          title="Không tải được đánh giá chuyến"
          hideCode
        />
      )}

      {!reviewQuery.loading && reviewQuery.data && (
        <div className="station-metric-box" style={{ gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong className="customer-meta-value">
              {'★'.repeat(Number(reviewQuery.data.rating) || 0)}
              {'☆'.repeat(Math.max(0, 5 - (Number(reviewQuery.data.rating) || 0)))} ({reviewQuery.data.rating}/5 sao)
            </strong>
            <StatusBadge label="Đã gửi đánh giá" tone="success" />
          </div>
          <p style={{ margin: 0 }}>
            {reviewQuery.data.comment || 'Không có nhận xét thêm.'}
          </p>
          <span className="customer-meta-label">
            Gửi lúc {formatDateTimeVN(reviewQuery.data.created_at)}
          </span>
        </div>
      )}

      {!reviewQuery.loading && isNotReviewedYet && (
        <form onSubmit={handleSubmit} className="stack-md" noValidate>
          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}

          <div>
            <span className="customer-meta-label" style={{ marginBottom: 8 }}>
              Mức độ hài lòng của bạn (1–5 sao)
            </span>
            <div className="rating-stars-row" role="radiogroup" aria-label="Chọn số sao đánh giá">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  disabled={submitting}
                  className={`rating-star-btn ${rating >= star ? 'active' : ''}`}
                  onClick={() => setRating(star)}
                >
                  ★ {star} sao
                </button>
              ))}
            </div>
            {fieldErrors.rating && (
              <p className="field-error" role="alert">
                {fieldErrors.rating}
              </p>
            )}
          </div>

          <TextareaField
            label="Nhận xét thêm (tùy chọn)"
            rows={3}
            maxLength={2000}
            placeholder="Chia sẻ trải nghiệm về tình trạng xe, pin hoặc hỗ trợ tại trạm..."
            value={comment}
            error={fieldErrors.comment}
            disabled={submitting}
            onChange={(e) => setComment(e.target.value)}
          />

          <div>
            <Button type="submit" variant="primary" loading={submitting}>
              Gửi đánh giá
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
