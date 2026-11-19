import React from 'react';
import Button from './Button';
import { getApiErrorMessage } from '../../utils/errorMessages';

export function LoadingState({ message = 'Đang tải dữ liệu...' }) {
  return (
    <div className="state-box state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="state-title">{message}</p>
    </div>
  );
}

export function EmptyState({ title = 'Chưa có dữ liệu', hint, action }) {
  return (
    <div className="state-box state-empty">
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title }) {
  const isForbidden = error?.status === 403 || error?.code === 'FORBIDDEN' || error?.code === 'MANAGER_REQUIRED';
  const heading = title || (isForbidden ? 'Không đủ quyền truy cập (403)' : 'Không tải được dữ liệu');

  return (
    <div className="state-box state-error" role="alert">
      <p className="state-title">{heading}</p>
      <p className="state-hint">
        {getApiErrorMessage(error)}
        {error?.code && <code className="error-code">{error.code}</code>}
      </p>
      {onRetry && !isForbidden && (
        <div className="state-action">
          <Button variant="primary" onClick={onRetry}>
            Tải lại
          </Button>
        </div>
      )}
    </div>
  );
}
