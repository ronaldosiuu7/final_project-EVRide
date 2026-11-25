import React from 'react';
import useApiQuery from '../../hooks/useApiQuery.js';
import { getDocumentSensitive } from '../../services/accountsApi.js';
import {
  Button,
  ErrorState,
  LoadingState,
  Modal,
  PrivateImage,
} from '../../components/ui/index.js';
import { getDocumentTypeLabel } from '../../utils/documentEligibility.js';

/**
 * Xem số giấy tờ đầy đủ và ảnh mặt trước/mặt sau qua GET /user-documents/{id}/sensitive.
 * - Chỉ tải khi người dùng chủ động bấm xem, không lưu cache vào storage.
 * - Ảnh tải bằng API client (Bearer header) -> Blob URL tạm thời và tự thu hồi khi đóng hộp thoại.
 */
export default function SensitiveDocumentModal({ documentItem, onClose }) {
  const docId = documentItem?.id ? String(documentItem.id) : '';

  const { data, loading, error, reload } = useApiQuery(
    ({ signal }) => getDocumentSensitive(docId, { signal }),
    [docId],
    { enabled: Boolean(docId) }
  );

  return (
    <Modal
      open
      size="lg"
      title={`Chi tiết bảo mật — ${getDocumentTypeLabel(documentItem?.document_type)}`}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <div className="stack-md">
        <div className="alert alert-info">
          Dữ liệu nhạy cảm chỉ được hiển thị tạm thời trong phiên xem này và không được lưu trữ lâu dài trên trình duyệt.
        </div>

        {loading && <LoadingState message="Đang tải thông tin bảo mật của giấy tờ..." />}

        {!loading && error && (
          <ErrorState
            error={error}
            onRetry={reload}
            title="Không tải được dữ liệu nhạy cảm"
            hideCode
          />
        )}

        {!loading && !error && data && (
          <>
            <div className="sensitive-info-strip">
              <div>
                <span className="customer-meta-label">Loại giấy tờ</span>
                <strong className="customer-meta-value">
                  {getDocumentTypeLabel(data.document_type)}
                </strong>
              </div>
              <div>
                <span className="customer-meta-label">Số giấy tờ đầy đủ</span>
                <strong className="customer-meta-value sensitive-number-text">
                  {data.document_number || 'Chưa cập nhật'}
                </strong>
              </div>
            </div>

            <div className="sensitive-images-grid">
              <PrivateImage
                fileIdOrUrl={data.front_download_url}
                label="Ảnh mặt trước"
                alt={`Ảnh mặt trước ${getDocumentTypeLabel(data.document_type)}`}
              />
              <PrivateImage
                fileIdOrUrl={data.back_download_url}
                label="Ảnh mặt sau"
                alt={`Ảnh mặt sau ${getDocumentTypeLabel(data.document_type)}`}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
