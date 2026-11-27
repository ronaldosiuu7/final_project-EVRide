import React, { useRef, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  FilterBar,
  LoadingState,
  PrivateImage,
  SelectField,
  StatusBadge,
  TextField,
  useToast,
} from '../../components/ui';
import { getDocumentSensitive, verifyDocument } from '../../services/accountsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { formatDateTimeVN, formatDateVN } from '../../utils/format';
import { isPositiveIdString } from '../../utils/validation';

export default function AdminDocumentVerifyPage() {
  const toast = useToast();

  const [docIdInput, setDocIdInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [sensitiveDoc, setSensitiveDoc] = useState(null);
  const [verifiedDoc, setVerifiedDoc] = useState(null);

  const [decision, setDecision] = useState('VERIFIED');
  const [verifiedBirthDate, setVerifiedBirthDate] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lookupSeqRef = useRef(0);

  const resetVerifyForm = () => {
    setDecision('VERIFIED');
    setVerifiedBirthDate('');
    setExpiresOn('');
    setFormError('');
    setConfirmOpen(false);
  };

  const handleLookup = async () => {
    const id = docIdInput.trim();
    const seq = lookupSeqRef.current + 1;
    lookupSeqRef.current = seq;
    setSensitiveDoc(null);
    setVerifiedDoc(null);
    resetVerifyForm();

    if (!isPositiveIdString(id)) {
      setLookupLoading(false);
      setLookupError({ code: 'VALIDATION_ERROR', message: 'ID giấy tờ phải là số nguyên dương.' });
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await getDocumentSensitive(id);
      if (lookupSeqRef.current !== seq) return;
      setSensitiveDoc(res.data);
    } catch (err) {
      if (lookupSeqRef.current !== seq) return;
      setLookupError(err);
    } finally {
      if (lookupSeqRef.current === seq) {
        setLookupLoading(false);
      }
    }
  };

  const validateVerifyForm = () => {
    if (!sensitiveDoc) return null;
    if (decision === 'VERIFIED' && sensitiveDoc.document_type === 'CCCD') {
      if (!verifiedBirthDate || !expiresOn) {
        setFormError('Khi xác minh CCCD hợp lệ, bắt buộc nhập đầy đủ ngày sinh và ngày hết hạn.');
        return null;
      }
    }
    setFormError('');
    const payload = { verified_status: decision };
    if (decision === 'VERIFIED') {
      if (verifiedBirthDate) payload.verified_birth_date = verifiedBirthDate;
      if (expiresOn) payload.expires_on = expiresOn;
    }
    return payload;
  };

  const executeVerify = async () => {
    setConfirmOpen(false);
    const payload = validateVerifyForm();
    if (!payload || !sensitiveDoc) return;
    setSubmitting(true);
    setFormError('');
    try {
      const res = await verifyDocument(sensitiveDoc.id, payload);
      setVerifiedDoc(res.data);
      resetVerifyForm();
      toast.success(
        `Đã cập nhật kết quả xác minh cho hồ sơ giấy tờ #${sensitiveDoc.id} (${
          res.data.verified_status === 'VERIFIED' ? 'Đã xác minh' : 'Đã từ chối'
        }).`
      );
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <h2>Xác minh giấy tờ định danh</h2>
          <p className="muted">
            Tra cứu theo mã hồ sơ giấy tờ để đối chiếu thông tin, kiểm tra ảnh chụp và phê duyệt điều kiện thuê xe.
          </p>
        </div>
      </div>

      <div className="alert alert-info">
        <strong>Hướng dẫn tra cứu:</strong> Nhập <strong>mã giấy tờ</strong> khách hàng đã nộp để tải thông tin và ảnh mặt trước/mặt sau qua kênh bảo mật. Hệ thống không cho phép nhân viên tự duyệt hồ sơ của chính mình.
      </div>

      <FilterBar
        onSubmit={handleLookup}
        onReset={() => {
          lookupSeqRef.current += 1;
          setLookupLoading(false);
          setDocIdInput('');
          setSensitiveDoc(null);
          setVerifiedDoc(null);
          setLookupError(null);
          resetVerifyForm();
        }}
      >
        <TextField
          label="ID giấy tờ cần kiểm tra"
          type="search"
          required
          placeholder="Nhập ID giấy tờ (VD: 1, 2...)"
          value={docIdInput}
          onChange={(e) => setDocIdInput(e.target.value)}
        />
      </FilterBar>

      {lookupLoading && <LoadingState message="Đang tải thông tin nhạy cảm & ảnh giấy tờ..." />}
      {!lookupLoading && lookupError && <ErrorState error={lookupError} onRetry={handleLookup} />}

      {!lookupLoading && sensitiveDoc && (
        <div className="stack-lg">
          <div className="card stack-md">
            <div className="card-header">
              <h3>Hồ sơ giấy tờ #{sensitiveDoc.id}</h3>
              <StatusBadge domain="documentType" value={sensitiveDoc.document_type} />
            </div>

            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Loại giấy tờ</dt>
                <dd>{sensitiveDoc.document_type}</dd>
              </div>
              <div className="detail-item">
                <dt>Số giấy tờ đầy đủ</dt>
                <dd>
                  <strong>{sensitiveDoc.document_number}</strong>
                </dd>
              </div>
            </dl>

            <div className="grid-2">
              <PrivateImage
                fileIdOrUrl={sensitiveDoc.front_download_url}
                label="Ảnh mặt trước"
                alt={`Mat truoc giay to ${sensitiveDoc.id}`}
              />
              <PrivateImage
                fileIdOrUrl={sensitiveDoc.back_download_url}
                label="Ảnh mặt sau"
                alt={`Mat sau giay to ${sensitiveDoc.id}`}
              />
            </div>
          </div>

          {verifiedDoc ? (
            <div className="card stack-md">
              <div className="card-header">
                <h3>Kết quả xác minh đã lưu</h3>
                <StatusBadge domain="documentStatus" value={verifiedDoc.verified_status} />
              </div>
              <dl className="detail-grid">
                <div className="detail-item">
                  <dt>Số giấy tờ hiển thị ẩn</dt>
                  <dd>{verifiedDoc.document_number_masked}</dd>
                </div>
                <div className="detail-item">
                  <dt>Ngày sinh đã xác minh</dt>
                  <dd>{formatDateVN(verifiedDoc.verified_birth_date)}</dd>
                </div>
                <div className="detail-item">
                  <dt>Ngày hết hạn</dt>
                  <dd>{formatDateVN(verifiedDoc.expires_on)}</dd>
                </div>
                <div className="detail-item">
                  <dt>Người duyệt / Thời điểm</dt>
                  <dd>
                    Nhân sự #{verifiedDoc.verified_by} · {formatDateTimeVN(verifiedDoc.verified_at)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="card stack-md">
              <h3>Thẩm định giấy tờ</h3>
              <div className="grid-2">
                <SelectField
                  label="Quyết định thẩm định"
                  value={decision}
                  options={[
                    { value: 'VERIFIED', label: 'Xác minh hợp lệ' },
                    { value: 'REJECTED', label: 'Từ chối hồ sơ' },
                  ]}
                  onChange={(e) => setDecision(e.target.value)}
                />
                {decision === 'VERIFIED' && (
                  <>
                    <TextField
                      label="Ngày sinh xác minh trên giấy tờ"
                      type="date"
                      required={sensitiveDoc.document_type === 'CCCD'}
                      value={verifiedBirthDate}
                      hint="Khách phải đủ 16 tuổi tại ngày giữ và ngày nhận xe (CCCD bắt buộc)"
                      onChange={(e) => setVerifiedBirthDate(e.target.value)}
                    />
                    <TextField
                      label="Ngày hết hạn giấy tờ"
                      type="date"
                      required={sensitiveDoc.document_type === 'CCCD'}
                      value={expiresOn}
                      onChange={(e) => setExpiresOn(e.target.value)}
                    />
                  </>
                )}
              </div>

              {formError && (
                <div className="alert alert-danger" role="alert">
                  {formError}
                </div>
              )}

              <div className="row-wrap">
                <Button
                  variant={decision === 'VERIFIED' ? 'primary' : 'danger'}
                  loading={submitting}
                  onClick={() => {
                    if (validateVerifyForm()) setConfirmOpen(true);
                  }}
                >
                  {decision === 'VERIFIED' ? 'Xác nhận duyệt hồ sơ' : 'Từ chối hồ sơ giấy tờ'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận kết quả thẩm định giấy tờ"
        message={`Lưu kết quả ${decision === 'VERIFIED' ? 'Đã xác minh' : 'Từ chối'} cho hồ sơ giấy tờ #${sensitiveDoc?.id}? Chỉ hồ sơ đang chờ duyệt mới có thể thẩm định.`}
        confirmLabel="Xác nhận"
        variant={decision === 'VERIFIED' ? 'primary' : 'danger'}
        loading={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={executeVerify}
      />
    </div>
  );
}
