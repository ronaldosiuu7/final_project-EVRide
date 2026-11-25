import React, { useState } from 'react';
import useApiQuery from '../../hooks/useApiQuery.js';
import {
  getRentalInvoice,
  listRentalTransactions,
} from '../../services/rentalsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  Pagination,
  SelectField,
  StatusBadge,
} from '../../components/ui/index.js';
import { formatDateTimeVN } from '../../utils/format.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { applyFilterPatch } from '../../utils/fleetDisplay.js';
import {
  classifyInvoiceFetchResult,
  formatOfficialMoneyOrNull,
} from '../../utils/promotionFinanceHelpers.js';

const RENTAL_TX_KIND_OPTIONS = [
  { value: '', label: 'Tất cả khoản thanh toán' },
  { value: 'DEPOSIT', label: 'Thu tiền cọc' },
  { value: 'PAYMENT', label: 'Thanh toán tiền thuê' },
  { value: 'REFUND', label: 'Hoàn tiền cọc dư' },
];

/**
 * Hiển thị Hóa đơn chính thức (GET /rentals/{id}/invoice) và Lịch sử giao dịch tài chính của chuyến
 * (GET /rentals/{id}/transactions) lấy trực tiếp từ backend.
 * - Xử lý 404 NOT_FOUND trên hóa đơn như trạng thái "Chưa phát hành hóa đơn", không phải lỗi hệ thống.
 * - Phân biệt rõ số tiền 0đ ("0.00") với giá trị null/chưa phát sinh.
 */
export default function CustomerRentalFinanceSection({ rentalId, rentalStatus }) {
  const [txFilters, setTxFilters] = useState({
    kind: '',
    page: 1,
    pageSize: 10,
  });

  const invoiceQuery = useApiQuery(
    ({ signal }) => getRentalInvoice(rentalId, { signal }),
    [rentalId, rentalStatus],
    { enabled: Boolean(rentalId) }
  );

  const txQuery = useApiQuery(
    ({ signal }) =>
      listRentalTransactions(
        rentalId,
        {
          kind: txFilters.kind || undefined,
          page: txFilters.page,
          page_size: txFilters.pageSize,
        },
        { signal }
      ),
    [rentalId, rentalStatus, txFilters.kind, txFilters.page, txFilters.pageSize],
    { enabled: Boolean(rentalId) }
  );

  const invoiceResult = classifyInvoiceFetchResult({
    invoice: invoiceQuery.data,
    error: invoiceQuery.error,
  });
  const transactions = Array.isArray(txQuery.data) ? txQuery.data : [];

  const handleRefresh = () => {
    invoiceQuery.reload();
    txQuery.reload();
  };

  return (
    <section className="station-detail-panel" aria-labelledby="rental-finance-heading">
      <div className="station-detail-top">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 id="rental-finance-heading" className="customer-card-title">
              Hóa đơn &amp; Giao dịch tài chính chuyến thuê
            </h2>
            <StatusBadge label="Tiền mô phỏng" tone="info" />
          </div>
          <p className="station-card-address">
            Mọi số liệu hóa đơn và giao dịch thu cọc, thanh toán, hoàn cọc đều được đồng bộ trực tiếp từ hệ thống quyết toán.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={handleRefresh}>
          Làm mới tài chính
        </Button>
      </div>

      {/* 1. Hóa đơn chính thức */}
      <div className="stack-sm">
        <h3 className="customer-meta-label">Hóa đơn chuyến thuê</h3>

        {invoiceQuery.loading && !invoiceQuery.data && (
          <LoadingState message="Đang kiểm tra hóa đơn chuyến thuê..." />
        )}

        {!invoiceQuery.loading && invoiceResult.state === 'error' && (
          <ErrorState
            error={invoiceResult.error}
            onRetry={invoiceQuery.reload}
            title="Không tải được thông tin hóa đơn"
            hideCode
          />
        )}

        {!invoiceQuery.loading && invoiceResult.state === 'not_issued' && (
          <div className="alert alert-info" role="status">
            {invoiceResult.message} Hóa đơn sẽ tự động hiển thị sau khi nhân viên hoàn tất quyết toán chuyến thuê.
          </div>
        )}

        {!invoiceQuery.loading && invoiceResult.state === 'issued' && (
          <div className="station-detail-stats">
            <div className="station-metric-box">
              <span className="customer-meta-label">Tổng cước chính thức trên hóa đơn</span>
              <strong className="station-metric-number">
                {formatOfficialMoneyOrNull(invoiceResult.invoice.total_amount)}
              </strong>
            </div>
            <div className="station-metric-box">
              <span className="customer-meta-label">Trạng thái hóa đơn</span>
              <div>
                <StatusBadge
                  label={getCustomerStatusMeta('invoiceStatus', invoiceResult.invoice.status).label}
                  tone={getCustomerStatusMeta('invoiceStatus', invoiceResult.invoice.status).tone}
                />
              </div>
            </div>
            <div className="station-metric-box">
              <span className="customer-meta-label">Thời điểm phát hành</span>
              <strong className="customer-meta-value">
                {formatDateTimeVN(invoiceResult.invoice.created_at, { withSeconds: true })}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* 2. Lịch sử giao dịch tài chính của chuyến */}
      <div className="stack-sm">
        <h3 className="customer-meta-label">Giao dịch tài chính của chuyến</h3>

        <FilterBar
          onReset={
            txFilters.kind
              ? () => setTxFilters((prev) => applyFilterPatch(prev, { kind: '' }))
              : undefined
          }
          resetLabel="Tất cả khoản"
        >
          <SelectField
            label="Lọc theo loại giao dịch"
            value={txFilters.kind}
            onChange={(e) =>
              setTxFilters((prev) => applyFilterPatch(prev, { kind: e.target.value }))
            }
            options={RENTAL_TX_KIND_OPTIONS}
          />
        </FilterBar>

        {txQuery.loading && !txQuery.data && (
          <LoadingState message="Đang tải giao dịch của chuyến..." />
        )}

        {!txQuery.loading && txQuery.error && (
          <ErrorState
            error={txQuery.error}
            onRetry={txQuery.reload}
            title="Không tải được giao dịch của chuyến"
            hideCode
          />
        )}

        {!txQuery.loading && !txQuery.error && transactions.length === 0 && (
          <EmptyState
            title="Chưa có giao dịch tài chính nào cho chuyến này"
            hint="Các khoản thu tiền cọc, thanh toán tiền thuê hoặc hoàn cọc dư sẽ xuất hiện tại đây khi phát sinh."
          />
        )}

        {!txQuery.error && transactions.length > 0 && (
          <>
            <div className="gps-history-list">
              {transactions.map((tx) => {
                const kindMeta = getCustomerStatusMeta('rentalTransactionKind', tx.kind);
                const statusMeta = getCustomerStatusMeta('transactionStatus', tx.status);
                const isRefund = tx.kind === 'REFUND';

                return (
                  <div key={tx.id} className="gps-history-row">
                    <div>
                      <strong>{kindMeta.label}</strong>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        {formatDateTimeVN(tx.created_at, { withSeconds: true })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <strong className={`wallet-tx-amount ${isRefund ? 'is-credit' : 'is-debit'}`}>
                        {isRefund ? '+' : '-'} {formatOfficialMoneyOrNull(tx.amount)}
                      </strong>
                      <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination
              meta={txQuery.meta}
              onPageChange={(nextPage) => setTxFilters((prev) => ({ ...prev, page: nextPage }))}
            />
          </>
        )}
      </div>
    </section>
  );
}
