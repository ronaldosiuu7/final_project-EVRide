import React from 'react';
import Button from './Button';
import { getApiErrorMessage } from '../../utils/errorMessages';

function StateIcon({ kind }) {
  if (kind === 'error') {
    return (
      <span className="state-icon is-error" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      </span>
    );
  }
  return (
    <span className="state-icon is-empty" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M3 13h5l2 2.5h4l2-2.5h5" />
      </svg>
    </span>
  );
}

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
      <StateIcon kind="empty" />
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title, hideCode = true }) {
  const isForbidden = error?.status === 403 || error?.code === 'FORBIDDEN' || error?.code === 'MANAGER_REQUIRED';
  const heading = title || (isForbidden ? 'Không đủ quyền truy cập' : 'Không tải được dữ liệu');

  return (
    <div className="state-box state-error" role="alert">
      <StateIcon kind="error" />
      <p className="state-title">{heading}</p>
      <p className="state-hint">
        {getApiErrorMessage(error)}
        {!hideCode && error?.code && <code className="error-code">{error.code}</code>}
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
