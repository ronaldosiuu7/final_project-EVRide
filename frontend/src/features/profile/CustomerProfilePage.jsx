import React, { useEffect, useState } from 'react';
import { useAuth } from '../../integrations/authBridge.jsx';
import useApiQuery from '../../hooks/useApiQuery.js';
import {
  getMyProfile,
  listMyDocuments,
  updateMyProfile,
} from '../../services/accountsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  StatusBadge,
  TextField,
  useToast,
} from '../../components/ui/index.js';
import {
  RefreshIcon,
  ShieldCheckIcon,
} from '../../components/customer/CustomerIcons.jsx';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { formatDateTimeVN, formatDateVN } from '../../utils/format.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import { mapApiFieldErrors } from '../../utils/validation.js';
import {
  evaluateCustomerDocumentEligibility,
  getDocumentTypeLabel,
  isDocumentExpired,
} from '../../utils/documentEligibility.js';
import { getSystemTotalFromMeta } from '../../utils/fleetDisplay.js';
import DocumentUploadModal from './DocumentUploadModal.jsx';
import SensitiveDocumentModal from './SensitiveDocumentModal.jsx';

const DOC_PAGE_SIZE = 10;

export default function CustomerProfilePage() {
  const { updateSessionUser } = useAuth();
  const toast = useToast();

  const [docPage, setDocPage] = useState(1);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [profileFormError, setProfileFormError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [sensitiveTarget, setSensitiveTarget] = useState(null);

  const profileQuery = useApiQuery(({ signal }) => getMyProfile({ signal }), []);
  const documentsQuery = useApiQuery(
    ({ signal }) => listMyDocuments({ page: docPage, page_size: DOC_PAGE_SIZE }, { signal }),
    [docPage]
  );

  // Đồng bộ tên hiển thị khi tải hồ sơ thành công.
  useEffect(() => {
    if (profileQuery.data?.name !== undefined) {
      setNameInput(profileQuery.data.name || '');
    }
  }, [profileQuery.data?.name]);

  const profile = profileQuery.data;
  const documents = Array.isArray(documentsQuery.data) ? documentsQuery.data : [];
  const totalDocs = getSystemTotalFromMeta(documentsQuery.meta);
  const pageEligibility = evaluateCustomerDocumentEligibility(documents);
  // A paginated slice cannot prove that no valid document exists elsewhere.
  const eligibility =
    !pageEligibility.eligible && totalDocs > documents.length
      ? {
          tone: 'info',
          statusLabel: 'Cần kiểm tra thêm',
          title: 'Giấy tờ của bạn có nhiều trang',
          description:
            'Trang này chưa có CCCD đủ điều kiện. Vui lòng kiểm tra các trang còn lại; hệ thống sẽ kiểm tra toàn bộ hồ sơ khi bạn giữ xe.',
        }
      : pageEligibility;

  const handleSaveName = async (event) => {
    event.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length > 100) {
      setNameError('Tên hiển thị phải từ 1 đến 100 ký tự.');
      return;
    }

    setSavingProfile(true);
    setNameError('');
    setProfileFormError('');
    try {
      const { data } = await updateMyProfile({ name: trimmed });
      updateSessionUser(data);
      setNameInput(data.name || trimmed);
      toast.success('Đã cập nhật tên hiển thị thành công.');
      profileQuery.reload();
    } catch (err) {
      const mapped = mapApiFieldErrors(err);
      if (mapped.name) {
        setNameError(mapped.name);
      }
      setProfileFormError(getApiErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const roleMeta = profile ? getCustomerStatusMeta('userRole', profile.role) : null;
  const statusMeta = profile ? getCustomerStatusMeta('userStatus', profile.status) : null;
  const isNameDirty = profile && nameInput.trim() !== (profile.name || '').trim();

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <span className="customer-page-eyebrow">Tài khoản &amp; Định danh</span>
          <h1 className="customer-page-title">Hồ sơ cá nhân &amp; Giấy tờ định danh</h1>
          <p className="customer-page-subtitle">
            Quản lý tên hiển thị tài khoản, nộp giấy tờ định danh và theo dõi điều kiện đủ chuẩn để giữ xe máy điện.
          </p>
        </div>
      </div>

      {/* 1. Thông tin tài khoản */}
      <section className="station-detail-panel" aria-labelledby="profile-info-heading">
        <div className="station-detail-top">
          <div>
            <h2 id="profile-info-heading" className="customer-card-title">
              Thông tin tài khoản
            </h2>
            <p className="station-card-address" style={{ marginTop: 4 }}>
              Bạn có thể cập nhật tên hiển thị. Email đăng nhập, vai trò và trạng thái tài khoản do hệ thống quản lý.
            </p>
          </div>
          {profile && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {roleMeta && <StatusBadge label={roleMeta.label} tone={roleMeta.tone} />}
              {statusMeta && <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />}
            </div>
          )}
        </div>

        {profileQuery.loading && <LoadingState message="Đang tải thông tin tài khoản..." />}

        {!profileQuery.loading && profileQuery.error && (
          <ErrorState
            error={profileQuery.error}
            onRetry={profileQuery.reload}
            title="Không tải được hồ sơ cá nhân"
            hideCode
          />
        )}

        {!profileQuery.loading && !profileQuery.error && profile && (
          <div className="profile-layout-grid">
            <form onSubmit={handleSaveName} className="stack-md" noValidate>
              {profileFormError && (
                <div className="alert alert-danger" role="alert">
                  {profileFormError}
                </div>
              )}

              <TextField
                id="profile-display-name"
                label="Tên hiển thị"
                required
                maxLength={100}
                value={nameInput}
                error={nameError}
                disabled={savingProfile}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (nameError) setNameError('');
                }}
              />

              <div>
                <Button
                  type="submit"
                  variant="primary"
                  loading={savingProfile}
                  disabled={!isNameDirty}
                >
                  Lưu thay đổi
                </Button>
              </div>
            </form>

            <dl className="profile-readonly-list">
              <div className="vehicle-pricing-row">
                <dt>Email đăng nhập</dt>
                <dd>{profile.email || 'Chưa cập nhật'}</dd>
              </div>
              <div className="vehicle-pricing-row">
                <dt>Vai trò</dt>
                <dd>{roleMeta?.label || 'Khách hàng'}</dd>
              </div>
              <div className="vehicle-pricing-row">
                <dt>Trạng thái tài khoản</dt>
                <dd>{statusMeta?.label || 'Đang hoạt động'}</dd>
              </div>
              <div className="vehicle-pricing-row">
                <dt>Ngày tạo tài khoản</dt>
                <dd>{formatDateTimeVN(profile.created_at)}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* 2. Điều kiện thuê xe & danh sách giấy tờ */}
      <section className="station-detail-panel" aria-labelledby="profile-documents-heading">
        <div className="station-detail-top">
          <div>
            <h2 id="profile-documents-heading" className="customer-card-title">
              Giấy tờ định danh &amp; điều kiện thuê xe
            </h2>
            <p className="station-card-address" style={{ marginTop: 4 }}>
              Để giữ và thuê xe, bạn cần có CCCD ở trạng thái <strong>Đã xác minh</strong>, còn hạn hiệu lực và đủ 16 tuổi theo giờ Việt Nam.
            </p>
          </div>
          <Button variant="primary" onClick={() => setUploadModalOpen(true)}>
            {documents.length > 0 ? 'Nộp / nộp lại giấy tờ' : 'Nộp giấy tờ mới'}
          </Button>
        </div>

        {!documentsQuery.loading && !documentsQuery.error && (
          <div className={`eligibility-banner tone-${eligibility.tone}`} role="status">
            <div className="eligibility-banner-head">
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <ShieldCheckIcon size={17} />
                <span>{eligibility.title}</span>
              </strong>
              <StatusBadge label={eligibility.statusLabel} tone={eligibility.tone} />
            </div>
            <p>{eligibility.description}</p>
          </div>
        )}

        {documentsQuery.loading && <LoadingState message="Đang tải danh sách giấy tờ..." />}

        {!documentsQuery.loading && documentsQuery.error && (
          <ErrorState
            error={documentsQuery.error}
            onRetry={documentsQuery.reload}
            title="Không tải được danh sách giấy tờ"
            hideCode
          />
        )}

        {!documentsQuery.loading && !documentsQuery.error && documents.length === 0 && (
          <EmptyState
            title="Bạn chưa nộp giấy tờ định danh nào"
            hint="Hãy nộp CCCD đầy đủ ảnh mặt trước và mặt sau để nhân viên xác minh trước khi giữ xe."
            action={
              <Button variant="primary" onClick={() => setUploadModalOpen(true)}>
                Nộp giấy tờ ngay
              </Button>
            }
          />
        )}

        {!documentsQuery.loading && !documentsQuery.error && documents.length > 0 && (
          <>
            <div className="customer-results-bar">
              <span>
                {totalDocs !== null ? (
                  <>
                    Tổng số <strong>{totalDocs}</strong> hồ sơ giấy tờ đã nộp
                  </>
                ) : (
                  'Danh sách giấy tờ đã nộp'
                )}
              </span>
              <Button size="sm" variant="ghost" onClick={documentsQuery.reload}>
                <RefreshIcon size={15} />
                <span>Làm mới</span>
              </Button>
            </div>

            <div className="document-list">
              {documents.map((doc) => {
                const verifyMeta = getCustomerStatusMeta('documentStatus', doc.verified_status);
                const expired = isDocumentExpired(doc.expires_on);
                return (
                  <article key={doc.id} className="document-item-card">
                    <div className="document-item-head">
                      <div>
                        <h3 className="customer-card-title">
                          {getDocumentTypeLabel(doc.document_type)}
                        </h3>
                        <p className="station-card-address" style={{ marginTop: 4 }}>
                          Số giấy tờ: <strong>{doc.document_number_masked || 'Chưa cập nhật'}</strong>
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <StatusBadge label={verifyMeta.label} tone={verifyMeta.tone} />
                        {doc.revoked_at && <StatusBadge label="Đã thu hồi" tone="danger" />}
                        {!doc.revoked_at && expired === true && (
                          <StatusBadge label="Đã hết hạn" tone="danger" />
                        )}
                      </div>
                    </div>

                    <div className="station-detail-stats-strip">
                      <div className="station-detail-stat">
                        <span className="customer-meta-label">Hạn hiệu lực</span>
                        <strong className="customer-meta-value">
                          {doc.expires_on ? formatDateVN(doc.expires_on) : 'Chưa cập nhật'}
                        </strong>
                      </div>
                      <div className="station-detail-stat">
                        <span className="customer-meta-label">Ngày sinh xác minh</span>
                        <strong className="customer-meta-value">
                          {doc.verified_birth_date ? formatDateVN(doc.verified_birth_date) : 'Chưa cập nhật'}
                        </strong>
                      </div>
                      <div className="station-detail-stat">
                        <span className="customer-meta-label">Thời điểm nộp</span>
                        <strong className="customer-meta-value">
                          {formatDateTimeVN(doc.created_at)}
                        </strong>
                      </div>
                      <div className="station-detail-stat">
                        <span className="customer-meta-label">Thời điểm duyệt</span>
                        <strong className="customer-meta-value">
                          {doc.verified_at ? formatDateTimeVN(doc.verified_at) : 'Chưa duyệt'}
                        </strong>
                      </div>
                    </div>

                    <div className="customer-card-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSensitiveTarget(doc)}
                      >
                        Xem số đầy đủ &amp; ảnh giấy tờ
                      </Button>
                      {(doc.verified_status === 'REJECTED' || expired === true || doc.revoked_at) && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setUploadModalOpen(true)}
                        >
                          Nộp bản mới
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <Pagination
              meta={documentsQuery.meta}
              onPageChange={(nextPage) => setDocPage(nextPage)}
            />
          </>
        )}
      </section>

      {uploadModalOpen && (
        <DocumentUploadModal
          onClose={() => setUploadModalOpen(false)}
          onSubmitted={() => {
            setDocPage(1);
            documentsQuery.reload();
          }}
        />
      )}

      {sensitiveTarget && (
        <SensitiveDocumentModal
          documentItem={sensitiveTarget}
          onClose={() => setSensitiveTarget(null)}
        />
      )}
    </div>
  );
}
