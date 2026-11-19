// ADAPTER BOUNDARY FOR #15:
// Cầu nối upload và download file riêng tư dùng API hiện có của backend (/files/upload, /files/{id}/download).
// Khi #15 hoàn thiện module upload/download dùng chung, chỉ cần trỏ lại hai hàm dưới đây.

import { ApiError, getAccessToken, resolveApiUrl } from './apiClient';

export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB theo backend/app/api/v1/files.py

export function validateEvidenceFile(file) {
  if (!file) {
    return 'Vui lòng chọn một tệp ảnh.';
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Chỉ chấp nhận tệp ảnh định dạng JPEG, PNG hoặc WebP.';
  }
  if (file.size < 1 || file.size > MAX_EVIDENCE_FILE_BYTES) {
    return 'Kích thước tệp phải từ 1 byte đến tối đa 10 MiB.';
  }
  return '';
}

export async function uploadEvidenceFile(file) {
  const validationError = validateEvidenceFile(file);
  if (validationError) {
    throw new ApiError(422, 'VALIDATION_ERROR', validationError);
  }

  const formData = new FormData();
  formData.append('file', file);

  const token = getAccessToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(resolveApiUrl('/files/upload'), {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });
  } catch (networkErr) {
    throw new ApiError(0, 'DEPENDENCY_UNAVAILABLE', 'Không thể tải tệp lên máy chủ.', {
      details: { cause: networkErr?.message },
    });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errObj = payload?.error || {};
    throw new ApiError(
      response.status,
      errObj.code || 'HTTP_ERROR',
      errObj.message || 'Tải ảnh thất bại.'
    );
  }
  return payload?.data ?? payload;
}

export async function downloadPrivateFileBlob(fileIdOrPath) {
  const path = String(fileIdOrPath).startsWith('/')
    ? String(fileIdOrPath)
    : `/files/${fileIdOrPath}/download`;

  const token = getAccessToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(resolveApiUrl(path), {
      method: 'GET',
      headers,
      credentials: 'include',
    });
  } catch (networkErr) {
    throw new ApiError(0, 'DEPENDENCY_UNAVAILABLE', 'Không thể tải tệp từ máy chủ.', {
      details: { cause: networkErr?.message },
    });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const errObj = payload?.error || {};
    throw new ApiError(
      response.status,
      errObj.code || 'HTTP_ERROR',
      errObj.message || `Không thể tải tệp (HTTP ${response.status}).`
    );
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  return {
    blob,
    objectUrl,
    contentType: response.headers.get('content-type') || blob.type,
  };
}
