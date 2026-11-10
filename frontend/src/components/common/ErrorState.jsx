import React from 'react';

// Thông báo thân thiện theo error.code (contract mục 2.3: không so sánh message).
const MESSAGES_BY_CODE = {
  INVALID_DATE_RANGE: 'Khoảng ngày không hợp lệ.',
  VALIDATION_ERROR: 'Dữ liệu gửi lên không hợp lệ.',
  FORBIDDEN: 'Bạn không có quyền xem nội dung này.',
  NOT_FOUND: 'Không tìm thấy dữ liệu.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh, vui lòng thử lại sau.',
  DEPENDENCY_UNAVAILABLE: 'Không kết nối được máy chủ.'
};

export const getErrorMessage = (error) => {
  if (!error) return '';
  return error.message || MESSAGES_BY_CODE[error.code] || 'Đã xảy ra lỗi không xác định.';
};

const ErrorState = ({ error, onRetry }) => (
  <div className="state-box state-error" role="alert">
    <p className="state-title">Không tải được dữ liệu</p>
    <p className="state-hint">
      {getErrorMessage(error)}
      {error?.code && <code className="error-code">{error.code}</code>}
    </p>
    {onRetry && (
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Tải lại
      </button>
    )}
  </div>
);

export default ErrorState;

