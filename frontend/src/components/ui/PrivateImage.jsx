import React, { useEffect, useState } from 'react';
import { downloadPrivateFileBlob } from '../../integrations/fileBridge';
import { getApiErrorMessage } from '../../utils/errorMessages';
import Button from './Button';

/**
 * Hiển thị ảnh riêng tư từ endpoint `/files/{id}/download` thông qua fetch kèm Bearer token
 * (không lộ token lên URL ảnh, tự giải phóng ObjectURL khi unmount).
 */
export default function PrivateImage({ fileIdOrUrl, alt = 'Ảnh đính kèm', label }) {
  const [state, setState] = useState({ loading: false, url: null, error: null });

  useEffect(() => {
    if (!fileIdOrUrl) {
      setState({ loading: false, url: null, error: null });
      return undefined;
    }

    let cancelled = false;
    let createdUrl = null;
    setState({ loading: true, url: null, error: null });

    downloadPrivateFileBlob(fileIdOrUrl)
      .then(({ objectUrl }) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        createdUrl = objectUrl;
        setState({ loading: false, url: objectUrl, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, url: null, error: err });
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [fileIdOrUrl]);

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
        <div className="field-error" role="alert">
          {getApiErrorMessage(state.error)}
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
