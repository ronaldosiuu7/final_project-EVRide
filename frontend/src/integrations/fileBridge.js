// Dịch vụ upload và tải tệp riêng tư dùng chung cho toàn dự án (#15 & #16).
// - Đi qua `apiRequest` để thừa hưởng Bearer token trong header (KHÔNG đưa token vào URL),
//   timeout, AbortSignal, chuẩn hóa lỗi và tự động làm mới token khi gặp 401 TOKEN_EXPIRED.
// - Không tự đặt header Content-Type cho FormData để trình duyệt tự sinh multipart boundary chuẩn.

import { ApiError, apiRequest } from './apiClient.js';
import { isPositiveIdString } from '../utils/validation.js';

export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const ALLOWED_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB theo backend/app/api/v1/files.py

export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes)) || Number(bytes) < 0) {
    return 'Chưa rõ kích thước';
  }
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function revokeObjectUrlSafely(url) {
  if (!url || typeof url !== 'string') return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Bỏ qua nếu môi trường không hỗ trợ hoặc URL đã được thu hồi.
  }
}

export function validateEvidenceFile(file) {
  if (!file) {
    return 'Vui lòng chọn một tệp ảnh.';
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Chỉ chấp nhận tệp ảnh định dạng JPEG, PNG hoặc WebP.';
  }
  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 1 || file.size > MAX_EVIDENCE_FILE_BYTES) {
    return 'Kích thước tệp phải từ 1 byte đến tối đa 10 MiB.';
  }
  return '';
}

export async function uploadEvidenceFile(file, { signal, timeoutMs = 30000 } = {}) {
  const validationError = validateEvidenceFile(file);
  if (validationError) {
    throw new ApiError(422, 'VALIDATION_ERROR', validationError);
  }

  const formData = new FormData();
  formData.append('file', file);

  const { data } = await apiRequest('/files/upload', {
    method: 'POST',
    body: formData,
    signal,
    timeoutMs,
  });

  if (!data || !isPositiveIdString(data.file_id) || data.status !== 'READY') {
    throw new ApiError(
      502,
      'UPLOAD_INCOMPLETE',
      'Tệp chưa sẵn sàng trên hệ thống sau khi tải lên. Vui lòng thử lại.'
    );
  }

  return data;
}

export async function downloadPrivateFileBlob(fileIdOrPath, { signal, timeoutMs = 30000 } = {}) {
  const raw = String(fileIdOrPath || '').trim();
  if (!raw) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Thiếu định danh tệp cần tải.');
  }

  const path =
    raw.startsWith('/') || /^https?:\/\//i.test(raw)
      ? raw
      : `/files/${encodeURIComponent(raw)}/download`;

  const response = await apiRequest(path, {
    method: 'GET',
    responseType: 'blob',
    signal,
    timeoutMs,
  });

  const blob = response.data;
  const objectUrl = URL.createObjectURL(blob);
  return {
    blob,
    objectUrl,
    contentType: response.contentType || blob.type,
    filename: response.filename || null,
    revoke: () => revokeObjectUrlSafely(objectUrl),
  };
}
