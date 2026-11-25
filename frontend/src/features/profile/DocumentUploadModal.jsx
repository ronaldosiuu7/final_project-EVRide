import React, { useState } from 'react';
import {
  Button,
  ImageUploadField,
  Modal,
  SelectField,
  TextField,
  useToast,
} from '../../components/ui/index.js';
import { createMyDocument } from '../../services/accountsApi.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import { mapApiFieldErrors } from '../../utils/validation.js';
import {
  buildCreateDocumentPayload,
  DOCUMENT_TYPE_OPTIONS,
  validateDocumentSubmissionForm,
} from '../../utils/documentEligibility.js';

export default function DocumentUploadModal({ defaultType = 'CCCD', onClose, onSubmitted }) {
  const toast = useToast();

  const [documentType, setDocumentType] = useState(defaultType);
  const [documentNumber, setDocumentNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitFailedAfterUpload, setSubmitFailedAfterUpload] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateDocumentSubmissionForm({
      documentType,
      documentNumber,
      frontFile,
      backFile,
      birthDate,
      expiresOn,
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Vui lòng kiểm tra lại các thông tin bắt buộc và tải đủ ảnh hai mặt trước khi nộp.');
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    setSubmitFailedAfterUpload(false);

    try {
      const payload = buildCreateDocumentPayload({
        documentType,
        documentNumber,
        frontFile,
        backFile,
        birthDate,
        expiresOn,
      });
      const { data } = await createMyDocument(payload);
      toast.success('Đã gửi hồ sơ giấy tờ thành công. Hồ sơ đang chờ nhân viên xác minh.');
      onSubmitted?.(data);
      onClose();
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
      setFormError(getApiErrorMessage(err));
      // Ảnh đã upload thành công (frontFile & backFile vẫn còn file_id) nhưng bước nộp giấy tờ thất bại:
      // giữ nguyên hai ảnh đã tải lên để khách thử nộp lại ngay, không giả báo hoàn tất.
      if (frontFile?.file_id && backFile?.file_id) {
        setSubmitFailedAfterUpload(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      size="md"
      title="Nộp giấy tờ định danh"
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button
            type="submit"
            form="customer-document-upload-form"
            variant="primary"
            loading={submitting}
          >
            {submitFailedAfterUpload ? 'Thử nộp lại giấy tờ' : 'Gửi hồ sơ chờ xác minh'}
          </Button>
        </>
      }
    >
      <form id="customer-document-upload-form" onSubmit={handleSubmit} className="stack-md" noValidate>
        <div className="alert alert-info">
          Hồ sơ mới nộp sẽ ở trạng thái <strong>Chờ xác minh</strong> cho đến khi nhân viên kiểm tra. Hệ thống yêu cầu tải đủ cả <strong>ảnh mặt trước</strong> và <strong>ảnh mặt sau</strong> rõ nét.
        </div>

        {submitFailedAfterUpload && (
          <div className="alert alert-warning" role="alert">
            <strong>Ảnh đã tải lên nhưng chưa nộp được hồ sơ:</strong> Hai ảnh mặt trước và mặt sau vẫn được giữ sẵn bên dưới. Bạn có thể kiểm tra lại thông tin và bấm <strong>Thử nộp lại giấy tờ</strong> mà không cần tải lại ảnh.
          </div>
        )}

        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}

        <SelectField
          label="Loại giấy tờ"
          required
          value={documentType}
          error={fieldErrors.document_type}
          disabled={submitting}
          onChange={(e) => setDocumentType(e.target.value)}
          options={DOCUMENT_TYPE_OPTIONS}
        />

        <TextField
          label="Số giấy tờ"
          required
          maxLength={50}
          placeholder="Nhập chính xác số trên giấy tờ (1–50 ký tự)"
          value={documentNumber}
          error={fieldErrors.document_number}
          disabled={submitting}
          onChange={(e) => setDocumentNumber(e.target.value)}
        />

        <div className="form-grid-2">
          <TextField
            label="Ngày sinh (tùy chọn)"
            type="date"
            value={birthDate}
            error={fieldErrors.birth_date}
            disabled={submitting}
            onChange={(e) => setBirthDate(e.target.value)}
          />

          <TextField
            label="Ngày hết hạn (tùy chọn)"
            type="date"
            value={expiresOn}
            error={fieldErrors.expires_on}
            disabled={submitting}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>

        <ImageUploadField
          label="Ảnh mặt trước giấy tờ"
          required
          value={frontFile}
          onChange={(uploaded) => {
            setFrontFile(uploaded);
            setSubmitFailedAfterUpload(false);
            if (uploaded) {
              setFieldErrors((prev) => ({ ...prev, front_file_id: undefined }));
            }
          }}
          disabled={submitting}
          error={fieldErrors.front_file_id}
        />

        <ImageUploadField
          label="Ảnh mặt sau giấy tờ"
          required
          value={backFile}
          onChange={(uploaded) => {
            setBackFile(uploaded);
            setSubmitFailedAfterUpload(false);
            if (uploaded) {
              setFieldErrors((prev) => ({ ...prev, back_file_id: undefined }));
            }
          }}
          disabled={submitting}
          error={fieldErrors.back_file_id}
        />
      </form>
    </Modal>
  );
}
