import React, { useEffect, useState } from 'react';
import { downloadPrivateFileBlob, revokeObjectUrlSafely } from '../../integrations/fileBridge.js';
import { isAbortError } from '../../integrations/apiClient.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import Button from './Button';

/**
 * Hiển thị ảnh riêng tư từ endpoint `/files/{id}/download` thông qua API client kèm Bearer token:
 * - Không đưa token vào URL ảnh.
 * - Hủy request đang chạy qua AbortController và thu hồi Blob URL khi unmount hoặc đổi ảnh.
 * - Hỗ trợ nút thử tải lại khi gặp lỗi mạng/quyền tạm thời.
 */
export default function PrivateImage({ fileIdOrUrl, alt = 'Ảnh đính kèm', label }) {
  const [retryTick, setRetryTick] = useState(0);
  const [state, setState] = useState({ loading: false, url: null, error: null });

  useEffect(() => {
    if (!fileIdOrUrl) {
      setState({ loading: false, url: null, error: null });
      return undefined;
    }

    let cancelled = false;
    let createdUrl = null;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setState({ loading: true, url: null, error: null });

    downloadPrivateFileBlob(fileIdOrUrl, { signal: controller?.signal })
      .then(({ objectUrl }) => {
        if (cancelled) {
          revokeObjectUrlSafely(objectUrl);
          return;
        }
        createdUrl = objectUrl;
        setState({ loading: false, url: objectUrl, error: null });
      })
      .catch((err) => {
        if (cancelled || isAbortError(err)) return;
        setState({ loading: false, url: null, error: err });
      });

    return () => {
      cancelled = true;
      controller?.abort();
      if (createdUrl) {
        revokeObjectUrlSafely(createdUrl);
      }
    };
  }, [fileIdOrUrl, retryTick]);

  if (!fileIdOrUrl) {
    return (
      <div className="private-image-box muted">
        {label ? `${label}: Không có ảnh` : 'Không có ảnh'}
      </div>
    );
  }

  return (
    <div className="private-image-box">
      {label && <div className="private-image-label">{label}</div>}
      {state.loading && <div className="muted">Đang tải ảnh bảo mật...</div>}
      {state.error && (
        <div className="stack-xs" role="alert">
          <div className="field-error">{getApiErrorMessage(state.error)}</div>
          <div>
            <Button size="sm" variant="secondary" onClick={() => setRetryTick((prev) => prev + 1)}>
              Thử tải lại ảnh
            </Button>
          </div>
        </div>
      )}
      {state.url && (
        <>
          <a href={state.url} target="_blank" rel="noreferrer">
            <img src={state.url} alt={alt} className="private-image-preview" />
          </a>
          <div className="private-image-actions">
            <a href={state.url} download={alt} className="btn btn-sm btn-secondary">
              Tải ảnh về
            </a>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(state.url, '_blank', 'noopener,noreferrer')}
            >
              Mở tab mới
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
