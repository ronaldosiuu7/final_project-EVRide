import React, { useEffect, useId, useRef, useState } from 'react';
import Button from './Button';
import StatusBadge from './StatusBadge';
import {
  ALLOWED_IMAGE_ACCEPT,
  formatFileSize,
  revokeObjectUrlSafely,
  uploadEvidenceFile,
  validateEvidenceFile,
} from '../../integrations/fileBridge.js';
import { isAbortError } from '../../integrations/apiClient.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';

/**
 * Component chọn và tải ảnh dùng chung cho hồ sơ giấy tờ (#15), ảnh bằng chứng ticket (#15)
 * và các màn hình vận hành (#16).
 *
 * Interface bàn giao:
 * - value: `{ file_id, original_filename, content_type, size_bytes, status } | null`
 * - onChange(uploadedFile | null): gọi khi upload thành công hoặc khi người dùng xóa ảnh.
 * - Tự động validate MIME (JPEG/PNG/WebP) & kích thước (1B–10 MiB), tạo/thu hồi Blob URL preview,
 *   và hỗ trợ thử tải lại nếu lần upload trước bị lỗi mạng/server.
 */
export default function ImageUploadField({
  label,
  required = false,
  hint = 'Định dạng JPEG, PNG hoặc WebP, dung lượng tối đa 10 MiB.',
  value = null,
  onChange,
  disabled = false,
  error = '',
  accept = ALLOWED_IMAGE_ACCEPT,
  uploadFn = uploadEvidenceFile,
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const controllerRef = useRef(null);
  const previewUrlRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');

  // Dọn dẹp Blob URL preview và hủy upload nếu component unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      if (previewUrlRef.current) {
        revokeObjectUrlSafely(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const replacePreviewUrl = (nextUrl) => {
    if (previewUrlRef.current) {
      revokeObjectUrlSafely(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  };

  const runUpload = async (file) => {
    if (!file) return;
    controllerRef.current?.abort();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    controllerRef.current = controller;

    setUploading(true);
    setLocalError('');
    try {
      const uploaded = await uploadFn(file, { signal: controller?.signal });
      if (controller?.signal?.aborted) return;
      onChange?.(uploaded);
    } catch (err) {
      if (isAbortError(err)) return;
      onChange?.(null);
      setLocalError(getApiErrorMessage(err));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      setUploading(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    const validationMsg = validateEvidenceFile(file);
    if (validationMsg) {
      setSelectedFile(null);
      replacePreviewUrl(null);
      setLocalError(validationMsg);
      onChange?.(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    setSelectedFile(file);
    const nextPreview = typeof URL?.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
    replacePreviewUrl(nextPreview);
    onChange?.(null);
    await runUpload(file);
  };

  const handleClear = () => {
    controllerRef.current?.abort();
    setUploading(false);
    setSelectedFile(null);
    setLocalError('');
    replacePreviewUrl(null);
    onChange?.(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const displayError = localError || error;
  const isUploaded = Boolean(value?.file_id);

  return (
    <div className="form-field upload-field">
      <div className="upload-field-header">
        <label htmlFor={inputId} className="form-label">
          {label}
          {required && <span className="required-star"> *</span>}
        </label>
        {uploading && <StatusBadge label="Đang tải ảnh lên..." tone="info" />}
        {!uploading && isUploaded && <StatusBadge label="Đã tải lên sẵn sàng" tone="success" />}
        {!uploading && !isUploaded && localError && <StatusBadge label="Tải ảnh thất bại" tone="danger" />}
      </div>

      <div className={`upload-dropzone ${displayError ? 'has-error' : ''} ${isUploaded ? 'is-uploaded' : ''}`}>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled || uploading}
          onChange={handleFileChange}
          className="upload-file-input"
        />

        {previewUrl && (
          <div className="upload-preview-wrap">
            <img
              src={previewUrl}
              alt={selectedFile?.name || label || 'Ảnh xem trước'}
              className="upload-preview-image"
            />
          </div>
        )}

        <div className="upload-meta-row">
          {isUploaded ? (
            <div className="upload-file-info">
              <strong>{value.original_filename || selectedFile?.name || 'Ảnh đã tải lên'}</strong>
              <span className="muted"> ({formatFileSize(value.size_bytes ?? selectedFile?.size)})</span>
            </div>
          ) : selectedFile ? (
            <div className="upload-file-info">
              <strong>{selectedFile.name}</strong>
              <span className="muted"> ({formatFileSize(selectedFile.size)})</span>
            </div>
          ) : (
            <span className="muted">{hint}</span>
          )}

          <div className="upload-actions-row">
            {!uploading && selectedFile && !isUploaded && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={disabled}
                onClick={() => runUpload(selectedFile)}
              >
                Thử tải lại ảnh
              </Button>
            )}
            {(selectedFile || isUploaded) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || uploading}
                onClick={handleClear}
              >
                Chọn ảnh khác
              </Button>
            )}
          </div>
        </div>
      </div>

      {displayError && (
        <p className="field-error" role="alert">
          {displayError}
        </p>
      )}
    </div>
  );
}
