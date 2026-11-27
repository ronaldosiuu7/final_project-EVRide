import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import useIdempotentMutation from '../../hooks/useIdempotentMutation.js';
import {
  createCustomerTopupRequest,
  getMyWallet,
  listMyTopupRequests,
  listMyWalletTransactions,
} from '../../services/walletsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SelectField,
  StatusBadge,
  Tabs,
  TextField,
  useToast,
} from '../../components/ui/index.js';
import {
  ArrowRightIcon,
  ClockIcon,
  RefreshIcon,
  WalletIcon,
} from '../../components/customer/CustomerIcons.jsx';
import { formatDateTimeVN } from '../../utils/format.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import { isUncertainIdempotentOutcome } from '../../utils/validation.js';
import {
  applyFilterPatch,
  formatMoneyDisplay,
  getSystemTotalFromMeta,
} from '../../utils/fleetDisplay.js';
import {
  createTopupPollingController,
  detectTopupStatusTransitions,
  evaluateTopupBackendCompatibility,
  evaluateWalletSubmissionGate,
  SUGGESTED_TOPUP_AMOUNTS,
  TOPUP_STATUS_FILTER_OPTIONS,
  validateTopupAmountInput,
  WALLET_TX_TYPE_FILTER_OPTIONS,
} from '../../utils/walletHelpers.js';
import TopupDetailModal from './TopupDetailModal.jsx';

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const TOPUP_POLL_INTERVAL_MS = 12000;

export default function CustomerWalletPage() {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('requests');
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState('');
  const [lastSubmittedNotice, setLastSubmittedNotice] = useState('');

  const [topupFilters, setTopupFilters] = useState({
    status: '',
    page: 1,
    pageSize: 10,
  });
  const [txFilters, setTxFilters] = useState({
    type: '',
    page: 1,
    pageSize: 10,
  });

  const [selectedTopup, setSelectedTopup] = useState(null);
  const [hasVerifiedTopupEndpoint, setHasVerifiedTopupEndpoint] = useState(false);

  const knownStatusesRef = useRef(new Map());

  // 1. Tải thông tin số dư & trạng thái ví từ backend (nguồn dữ liệu số dư duy nhất).
  const walletQuery = useApiQuery(({ signal }) => getMyWallet({ signal }), []);

  // 2. Tải danh sách yêu cầu nạp tiền của khách (cũng dùng để xác minh tương thích backend PR #40).
  const topupsQuery = useApiQuery(
    ({ signal }) =>
      listMyTopupRequests(
        {
          status: topupFilters.status || undefined,
          page: topupFilters.page,
          page_size: topupFilters.pageSize,
        },
        { signal }
      ),
    [topupFilters.status, topupFilters.page, topupFilters.pageSize]
  );

  // 4. Tải lịch sử giao dịch đã vào/ra ví (tách biệt hoàn toàn với yêu cầu đang chờ).
  const transactionsQuery = useApiQuery(
    ({ signal }) =>
      listMyWalletTransactions(
        {
          type: txFilters.type || undefined,
          page: txFilters.page,
          page_size: txFilters.pageSize,
        },
        { signal }
      ),
    [txFilters.type, txFilters.page, txFilters.pageSize]
  );

  // Ghi nhận khi GET /wallets/me/topups đã phản hồi hợp lệ (xác nhận máy chủ có contract chờ duyệt).
  useEffect(() => {
    if (Array.isArray(topupsQuery.data) && !topupsQuery.error) {
      setHasVerifiedTopupEndpoint(true);
    }
  }, [topupsQuery.data, topupsQuery.error]);

  // Phát hiện yêu cầu chuyển từ PENDING -> APPROVED / REJECTED để tự tải lại số dư & giao dịch từ backend.
  useEffect(() => {
    const sourceList = topupsQuery.data;
    if (!Array.isArray(sourceList)) return;

    const { nextStatusById, newlyApproved, newlyRejected } =
      detectTopupStatusTransitions(knownStatusesRef.current, sourceList);

    knownStatusesRef.current = nextStatusById;

    if (newlyApproved.length > 0) {
      walletQuery.reload();
      transactionsQuery.reload();
      toast.success('Yêu cầu nạp tiền đã được nhân viên xác nhận. Đang tải lại số dư ví.');
    }

    if (newlyRejected.length > 0) {
      const firstReason = newlyRejected[0]?.rejection_reason;
      toast.info(
        firstReason
          ? `Yêu cầu nạp tiền đã bị từ chối: ${firstReason}`
          : 'Một yêu cầu nạp tiền của bạn đã bị từ chối. Số dư ví không thay đổi.'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupsQuery.data]);

  const compatibility = useMemo(
    () =>
      evaluateTopupBackendCompatibility({
        hasVerifiedOnce: hasVerifiedTopupEndpoint,
        topupsError: topupsQuery.error,
        topupsLoading: topupsQuery.loading,
      }),
    [hasVerifiedTopupEndpoint, topupsQuery.error, topupsQuery.loading]
  );

  // Refresh authoritative wallet data while visible, independently of list filters/pages.
  // A PENDING row can disappear after approval; absence is not proof of rejection or approval.
  useEffect(() => {
    if (compatibility.status !== 'compatible') {
      return undefined;
    }

    const controller = createTopupPollingController({
      intervalMs: TOPUP_POLL_INTERVAL_MS,
      onTick: () => {
        if (!topupsQuery.loading) topupsQuery.reload();
        if (!walletQuery.loading) walletQuery.reload();
        if (!transactionsQuery.loading) transactionsQuery.reload();
      },
    });

    controller.start();
    return () => controller.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatibility.status, topupsQuery.reload, walletQuery.reload, transactionsQuery.reload, topupsQuery.loading, walletQuery.loading, transactionsQuery.loading]);

  const topupMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    createCustomerTopupRequest(payload, idempotencyKey, {
      backendCompatible: compatibility.canSubmit,
    })
  );

  const wallet = walletQuery.data;
  const walletStatusMeta = wallet ? getCustomerStatusMeta('walletStatus', wallet.status) : null;
  const submissionGate = evaluateWalletSubmissionGate({ wallet, compatibility });

  const topupRequests = Array.isArray(topupsQuery.data) ? topupsQuery.data : [];
  const totalTopups = getSystemTotalFromMeta(topupsQuery.meta);

  const walletTransactions = Array.isArray(transactionsQuery.data) ? transactionsQuery.data : [];
  const totalTransactions = getSystemTotalFromMeta(transactionsQuery.meta);

  const handleRefreshAll = () => {
    walletQuery.reload();
    topupsQuery.reload();
    transactionsQuery.reload();
  };

  const handleSelectPreset = (presetValue) => {
    setAmountInput(presetValue.replace(/\.00$/, ''));
    setAmountError('');
    setLastSubmittedNotice('');
    topupMutation.clearError();
  };

  const handleSubmitTopup = async (event) => {
    event.preventDefault();
    if (!submissionGate.allowed) return;

    const check = validateTopupAmountInput(amountInput);
    if (!check.valid) {
      setAmountError(check.error);
      return;
    }

    setAmountError('');
    setLastSubmittedNotice('');
    try {
      const res = await topupMutation.execute('customer-wallet-topup', {
        amount: check.normalizedAmount,
      });
      const created = res?.data;
      if (created?.id) {
        knownStatusesRef.current.set(String(created.id), 'PENDING');
      }

      // TUYỆT ĐỐI KHÔNG cộng số dư ví trên frontend và KHÔNG tạo giao dịch giả!
      const pendingMessage = 'Đã gửi yêu cầu, đang chờ nhân viên xác nhận';
      setLastSubmittedNotice(pendingMessage);
      toast.info(pendingMessage);
      setAmountInput('');
      setActiveTab('requests');
      setTopupFilters((prev) => ({ ...prev, status: '', page: 1 }));
      topupsQuery.reload();
    } catch {
      // Lỗi đã được lưu trong topupMutation.error để hiển thị.
    }
  };

  const canRetrySameKey =
    Boolean(topupMutation.error) && isUncertainIdempotentOutcome(topupMutation.error);

  const tabItems = [
    {
      key: 'requests',
      label: 'Yêu cầu nạp tiền',
      badge: totalTopups !== null ? totalTopups : undefined,
    },
    {
      key: 'transactions',
      label: 'Lịch sử giao dịch ví',
      badge: totalTransactions !== null ? totalTransactions : undefined,
    },
  ];

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <span className="customer-page-eyebrow">Tài chính &amp; Số dư</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="customer-page-title">Ví của tôi</h1>
          </div>
          <p className="customer-page-subtitle">
            Quản lý số dư phục vụ đặt cọc và thanh toán chuyến thuê xe máy điện. Mọi khoản nạp tiền đều cần nhân viên xác nhận trước khi vào ví.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={handleRefreshAll}>
            <RefreshIcon size={15} />
            <span>Làm mới</span>
          </Button>
          <Link to="/vehicles" className="btn btn-sm btn-primary">
            <span>Tìm xe để thuê</span>
            <ArrowRightIcon size={15} />
          </Link>
        </div>
      </div>

      {/* Khối 1: Số dư ví + Form gửi yêu cầu nạp tiền chờ duyệt */}
      <div className="wallet-overview-grid">
        <section className="station-detail-panel wallet-balance-card" aria-labelledby="wallet-balance-heading">
          <div className="wallet-balance-head">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <span className="wallet-balance-icon-badge">
                <WalletIcon size={22} />
              </span>
              <div>
                <span id="wallet-balance-heading" className="customer-meta-label">
                  Số dư khả dụng hiện tại
                </span>
                {walletQuery.loading && !wallet ? (
                  <p className="customer-meta-value" style={{ marginTop: 8 }}>
                    Đang tải số dư ví...
                  </p>
                ) : wallet ? (
                  <div className="wallet-balance-amount">
                    {formatMoneyDisplay(wallet.balance)}
                  </div>
                ) : null}
              </div>
            </div>
            {walletStatusMeta && (
              <StatusBadge label={walletStatusMeta.label} tone={walletStatusMeta.tone} />
            )}
          </div>

          {!walletQuery.loading && walletQuery.error && (
            <ErrorState
              error={walletQuery.error}
              onRetry={walletQuery.reload}
              title="Không tải được thông tin ví"
              hideCode
            />
          )}

          {wallet && (
            <div className="wallet-balance-meta">
              <span>
                Cập nhật lần cuối: <strong>{formatDateTimeVN(wallet.updated_at)}</strong>
              </span>
              {compatibility.status === 'compatible' && (
                <span className="wallet-pending-hint">
                  Số dư và lịch sử tự động cập nhật mỗi 12 giây khi bạn mở trang này.
                </span>
              )}
            </div>
          )}
        </section>

        <section className="station-detail-panel" aria-labelledby="wallet-topup-heading">
          <div className="station-detail-top">
            <div>
              <h2 id="wallet-topup-heading" className="customer-card-title">
                Tạo yêu cầu nạp tiền vào ví
              </h2>
              <p className="station-card-address" style={{ marginTop: 4 }}>
                Chọn nhanh mệnh giá gợi ý hoặc nhập số tiền cần nạp. Tiền chỉ vào ví sau khi nhân viên duyệt yêu cầu.
              </p>
            </div>
          </div>

          {compatibility.status === 'incompatible' && (
            <div className="alert alert-warning" role="alert">
              <strong>Chức năng gửi yêu cầu nạp tạm khóa:</strong> {compatibility.message}
            </div>
          )}

          {wallet && wallet.status !== 'ACTIVE' && (
            <div className="alert alert-danger" role="alert">
              {submissionGate.reason}
            </div>
          )}

          {lastSubmittedNotice && (
            <div className="alert alert-info" role="status">
              <strong>{lastSubmittedNotice}</strong>. Số dư ví hiện tại được giữ nguyên cho đến khi nhân viên hoàn tất duyệt yêu cầu.
            </div>
          )}

          {topupMutation.error && (
            <div className="alert alert-danger stack-xs" role="alert">
              <strong>Không gửi được yêu cầu nạp tiền</strong>
              <p>{getApiErrorMessage(topupMutation.error)}</p>
              {canRetrySameKey && (
                <p style={{ fontSize: '0.85rem' }}>
                  Kết quả phản hồi chưa xác định — bạn có thể bấm nút bên dưới để thử gửi lại an toàn với cùng khóa chống trùng lặp.
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmitTopup} className="stack-md" noValidate>
            <div>
              <span className="customer-meta-label" style={{ marginBottom: 8 }}>
                Mức tiền gợi ý
              </span>
              <div className="topup-preset-row" role="group" aria-label="Mức tiền gợi ý">
                {SUGGESTED_TOPUP_AMOUNTS.map((preset) => {
                  const rawNumeric = preset.value.replace(/\.00$/, '');
                  const isActive = amountInput.trim() === rawNumeric || amountInput.trim() === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={isActive}
                      disabled={!submissionGate.allowed || topupMutation.loading}
                      className={`topup-preset-chip ${isActive ? 'active' : ''}`}
                      onClick={() => handleSelectPreset(preset.value)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <TextField
              id="wallet-topup-amount"
              label="Số tiền muốn nạp (VND)"
              inputMode="decimal"
              placeholder="Ví dụ: 150000"
              hint="Nhập số dương không chứa dấu phẩy hay ký tự đặc biệt (ví dụ 150000 cho 150.000đ)."
              value={amountInput}
              error={amountError}
              disabled={!submissionGate.allowed || topupMutation.loading}
              onChange={(e) => {
                setAmountInput(e.target.value);
                if (amountError) setAmountError('');
                if (lastSubmittedNotice) setLastSubmittedNotice('');
              }}
            />

            <div>
              <Button
                type="submit"
                variant="primary"
                loading={topupMutation.loading}
                disabled={!submissionGate.allowed}
              >
                {canRetrySameKey ? 'Gửi yêu cầu nạp tiền (Thử lại)' : 'Gửi yêu cầu nạp tiền'}
              </Button>
            </div>
          </form>
        </section>
      </div>

      {/* Khối 2: Hai danh sách tách biệt — Yêu cầu nạp tiền vs Lịch sử giao dịch ví */}
      <section className="station-detail-panel" aria-label="Danh sách yêu cầu nạp và lịch sử giao dịch">
        <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} />

        {activeTab === 'requests' && (
          <div className="stack-md">
            <div className="inline-filter-row">
              <SelectField
                id="wallet-topup-status-filter"
                label="Trạng thái yêu cầu nạp"
                value={topupFilters.status}
                onChange={(e) =>
                  setTopupFilters((prev) => applyFilterPatch(prev, { status: e.target.value }))
                }
                options={TOPUP_STATUS_FILTER_OPTIONS}
              />
              {topupFilters.status && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTopupFilters((prev) => applyFilterPatch(prev, { status: '' }))}
                >
                  Xem tất cả yêu cầu
                </Button>
              )}
            </div>

            {topupsQuery.loading && !topupsQuery.data && (
              <LoadingState message="Đang tải danh sách yêu cầu nạp tiền..." />
            )}

            {!topupsQuery.loading && topupsQuery.error && (
              <ErrorState
                error={topupsQuery.error}
                onRetry={topupsQuery.reload}
                title={
                  compatibility.status === 'incompatible'
                    ? 'Máy chủ chưa có danh sách yêu cầu nạp tiền chờ duyệt'
                    : 'Không tải được danh sách yêu cầu nạp tiền'
                }
                hideCode
              />
            )}

            {!topupsQuery.loading && !topupsQuery.error && topupRequests.length === 0 && (
              <EmptyState
                title={
                  topupFilters.status
                    ? 'Không có yêu cầu nạp tiền nào ở trạng thái đã chọn'
                    : 'Bạn chưa có yêu cầu nạp tiền nào'
                }
                hint="Khi bạn gửi yêu cầu nạp tiền mới, trạng thái xử lý và kết quả duyệt sẽ hiển thị tại đây."
              />
            )}

            {!topupsQuery.error && topupRequests.length > 0 && (
              <>
                <div className="document-list">
                  {topupRequests.map((reqItem) => {
                    const statusMeta = getCustomerStatusMeta('topupStatus', reqItem.status);
                    return (
                      <article key={reqItem.id} className="document-item-card">
                        <div className="document-item-head">
                          <div>
                            <h3 className="customer-card-title">
                              Yêu cầu nạp {formatMoneyDisplay(reqItem.amount)}
                            </h3>
                            <p className="station-card-hours-line" style={{ marginTop: 4 }}>
                              <ClockIcon size={15} className="station-meta-icon" />
                              <span>
                                Gửi lúc{' '}
                                <strong>{formatDateTimeVN(reqItem.created_at, { withSeconds: true })}</strong>
                              </span>
                            </p>
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                          </div>
                        </div>

                        <div className="station-detail-stats-strip">
                          <div className="station-detail-stat">
                            <span className="customer-meta-label">Số tiền yêu cầu</span>
                            <strong className="customer-meta-value">
                              {formatMoneyDisplay(reqItem.amount)}
                            </strong>
                          </div>
                          <div className="station-detail-stat">
                            <span className="customer-meta-label">Trạng thái</span>
                            <strong className="customer-meta-value">{statusMeta.label}</strong>
                          </div>
                          <div className="station-detail-stat">
                            <span className="customer-meta-label">Thời gian xử lý</span>
                            <strong className="customer-meta-value">
                              {reqItem.reviewed_at
                                ? formatDateTimeVN(reqItem.reviewed_at, { withSeconds: true })
                                : 'Chờ nhân viên xác nhận'}
                            </strong>
                          </div>
                        </div>

                        {reqItem.status === 'REJECTED' && (
                          <div className="alert alert-danger" style={{ margin: 0 }}>
                            <strong>Lý do từ chối:</strong>{' '}
                            {reqItem.rejection_reason || 'Không có ghi chú lý do.'}
                          </div>
                        )}

                        <div className="customer-card-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedTopup(reqItem)}
                          >
                            Xem chi tiết
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <Pagination
                  meta={topupsQuery.meta}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={(nextPage) =>
                    setTopupFilters((prev) => ({ ...prev, page: nextPage }))
                  }
                  onPageSizeChange={(nextSize) =>
                    setTopupFilters((prev) => ({ ...prev, pageSize: nextSize, page: 1 }))
                  }
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="stack-md">
            <div className="inline-filter-row">
              <SelectField
                id="wallet-tx-type-filter"
                label="Loại biến động số dư"
                value={txFilters.type}
                onChange={(e) =>
                  setTxFilters((prev) => applyFilterPatch(prev, { type: e.target.value }))
                }
                options={WALLET_TX_TYPE_FILTER_OPTIONS}
              />
              {txFilters.type && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTxFilters((prev) => applyFilterPatch(prev, { type: '' }))}
                >
                  Xem tất cả giao dịch
                </Button>
              )}
            </div>

            {transactionsQuery.loading && !transactionsQuery.data && (
              <LoadingState message="Đang tải lịch sử giao dịch ví..." />
            )}

            {!transactionsQuery.loading && transactionsQuery.error && (
              <ErrorState
                error={transactionsQuery.error}
                onRetry={transactionsQuery.reload}
                title="Không tải được lịch sử giao dịch ví"
                hideCode
              />
            )}

            {!transactionsQuery.loading && !transactionsQuery.error && walletTransactions.length === 0 && (
              <EmptyState
                title={
                  txFilters.type
                    ? 'Không có giao dịch nào thuộc loại đã chọn'
                    : 'Chưa có biến động số dư nào trong ví'
                }
                hint="Lịch sử giao dịch chỉ ghi nhận các khoản tiền đã thực sự vào hoặc ra khỏi ví (như nạp tiền đã được duyệt, thu cọc, thanh toán thuê xe hoặc hoàn cọc)."
              />
            )}

            {!transactionsQuery.error && walletTransactions.length > 0 && (
              <>
                <div className="document-list">
                  {walletTransactions.map((tx) => {
                    const typeMeta = getCustomerStatusMeta('walletTransactionType', tx.type);
                    const txStatusMeta = getCustomerStatusMeta('transactionStatus', tx.status);
                    const isCredit =
                      tx.type === 'TOPUP' ||
                      tx.type === 'RENTAL_REFUND' ||
                      tx.type === 'COMPENSATION_REFUND';

                    return (
                      <article key={tx.id} className="document-item-card">
                        <div className="document-item-head">
                          <div>
                            <h3 className="customer-card-title">{typeMeta.label}</h3>
                            <p className="station-card-hours-line" style={{ marginTop: 4 }}>
                              <ClockIcon size={15} className="station-meta-icon" />
                              <span>
                                Thời gian ghi sổ:{' '}
                                <strong>{formatDateTimeVN(tx.created_at, { withSeconds: true })}</strong>
                              </span>
                            </p>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <strong className={`wallet-tx-amount ${isCredit ? 'is-credit' : 'is-debit'}`}>
                              {isCredit ? '+' : '-'} {formatMoneyDisplay(tx.amount)}
                            </strong>
                            <StatusBadge label={txStatusMeta.label} tone={txStatusMeta.tone} />
                          </div>
                        </div>

                        <div className="station-detail-stats-strip">
                          <div className="station-detail-stat">
                            <span className="customer-meta-label">Số dư trước giao dịch</span>
                            <strong className="customer-meta-value">
                              {formatMoneyDisplay(tx.balance_before)}
                            </strong>
                          </div>
                          <div className="station-detail-stat">
                            <span className="customer-meta-label">Số dư sau giao dịch</span>
                            <strong className="customer-meta-value">
                              {formatMoneyDisplay(tx.balance_after)}
                            </strong>
                          </div>
                          {tx.rental_id && (
                            <div className="station-detail-stat">
                              <span className="customer-meta-label">Chuyến thuê liên quan</span>
                              <div>
                                <Link
                                  to={`/rentals/${encodeURIComponent(String(tx.rental_id))}`}
                                  className="btn btn-sm btn-ghost"
                                  style={{ paddingLeft: 0 }}
                                >
                                  <span>Xem chuyến thuê</span>
                                  <ArrowRightIcon size={15} />
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                <Pagination
                  meta={transactionsQuery.meta}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={(nextPage) =>
                    setTxFilters((prev) => ({ ...prev, page: nextPage }))
                  }
                  onPageSizeChange={(nextSize) =>
                    setTxFilters((prev) => ({ ...prev, pageSize: nextSize, page: 1 }))
                  }
                />
              </>
            )}
          </div>
        )}
      </section>

      {selectedTopup && (
        <TopupDetailModal
          requestSummary={selectedTopup}
          onClose={() => setSelectedTopup(null)}
        />
      )}
    </div>
  );
}
