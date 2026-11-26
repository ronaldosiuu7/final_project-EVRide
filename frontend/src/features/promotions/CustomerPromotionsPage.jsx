import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import useIdempotentMutation from '../../hooks/useIdempotentMutation.js';
import {
  claimPromotion,
  listAvailablePromotions,
  listMyPromotions,
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
  useToast,
} from '../../components/ui/index.js';
import {
  ArrowRightIcon,
  RefreshIcon,
  TagIcon,
} from '../../components/customer/CustomerIcons.jsx';
import { formatDateTimeVN } from '../../utils/format.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import { applyFilterPatch, getSystemTotalFromMeta } from '../../utils/fleetDisplay.js';
import {
  buildPromotionConditionLines,
  evaluatePromotionState,
  formatPromotionDiscountSummary,
} from '../../utils/promotionFinanceHelpers.js';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const MY_PROMO_FILTER_OPTIONS = [
  { value: '', label: 'Tất cả mã đã nhận' },
  { value: 'false', label: 'Chưa sử dụng' },
  { value: 'true', label: 'Đã sử dụng' },
];

export default function CustomerPromotionsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('available');
  const [availablePage, setAvailablePage] = useState({ page: 1, pageSize: 10 });
  const [myFilters, setMyFilters] = useState({ isUsed: '', page: 1, pageSize: 10 });
  const [claimingId, setClaimingId] = useState(null);

  const availableQuery = useApiQuery(
    ({ signal }) =>
      listAvailablePromotions(
        { page: availablePage.page, page_size: availablePage.pageSize },
        { signal }
      ),
    [availablePage.page, availablePage.pageSize]
  );

  // Tải danh sách mã đã nhận của khách để đồng bộ nút "Đã nhận" ở tab Khuyến mãi khả dụng.
  const allClaimedLookupQuery = useApiQuery(
    ({ signal }) => listMyPromotions({ page: 1, page_size: 100 }, { signal }),
    []
  );

  const myPromotionsQuery = useApiQuery(
    ({ signal }) =>
      listMyPromotions(
        {
          is_used: myFilters.isUsed || undefined,
          page: myFilters.page,
          page_size: myFilters.pageSize,
        },
        { signal }
      ),
    [myFilters.isUsed, myFilters.page, myFilters.pageSize]
  );

  const claimMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    claimPromotion(payload.promotionId, idempotencyKey)
  );

  const claimedByPromoId = useMemo(() => {
    const map = new Map();
    const list = Array.isArray(allClaimedLookupQuery.data) ? allClaimedLookupQuery.data : [];
    for (const claim of list) {
      if (claim?.promotion_id) {
        map.set(String(claim.promotion_id), claim);
      }
    }
    return map;
  }, [allClaimedLookupQuery.data]);

  const availablePromos = Array.isArray(availableQuery.data) ? availableQuery.data : [];
  const totalAvailable = getSystemTotalFromMeta(availableQuery.meta);

  const myPromos = Array.isArray(myPromotionsQuery.data) ? myPromotionsQuery.data : [];
  const totalMyPromos = getSystemTotalFromMeta(myPromotionsQuery.meta);

  const handleRefreshAll = () => {
    availableQuery.reload();
    allClaimedLookupQuery.reload();
    myPromotionsQuery.reload();
  };

  const handleClaim = async (promotion) => {
    const promoId = String(promotion.id);
    setClaimingId(promoId);
    try {
      const res = await claimMutation.execute(`claim-promo:${promoId}`, { promotionId: promoId });
      if (res?.status === 200) {
        toast.info(`Bạn đã nhận mã ${promotion.code} trước đó rồi.`);
      } else {
        toast.success(`Đã nhận mã khuyến mãi ${promotion.code}. Bạn có thể chọn mã này khi xem báo giá trả xe.`);
      }
      allClaimedLookupQuery.reload();
      myPromotionsQuery.reload();
      availableQuery.reload();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
      if (err?.code === 'PROMOTION_EXHAUSTED' || err?.code === 'PROMOTION_INVALID') {
        availableQuery.reload();
      }
    } finally {
      setClaimingId(null);
    }
  };

  const tabItems = [
    {
      key: 'available',
      label: 'Khuyến mãi có thể nhận',
      badge: totalAvailable !== null ? totalAvailable : undefined,
    },
    {
      key: 'mine',
      label: 'Mã khuyến mãi của tôi',
      badge: totalMyPromos !== null ? totalMyPromos : undefined,
    },
  ];

  return (
    <div className="customer-page">
      <div className="customer-page-header">
        <div>
          <span className="customer-page-eyebrow">Ưu đãi khách hàng</span>
          <h1 className="customer-page-title">Ưu đãi &amp; Khuyến mãi</h1>
          <p className="customer-page-subtitle">
            Nhận mã khuyến mãi đang áp dụng và chọn mã hợp lệ khi kiểm tra báo giá trả xe. Lưu ý: việc nhận mã hoặc xem báo giá chưa tiêu thụ lượt dùng cho đến khi nhân viên hoàn tất quyết toán chuyến.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={handleRefreshAll}>
            <RefreshIcon size={15} />
            <span>Làm mới</span>
          </Button>
          <Link to="/rentals" className="btn btn-sm btn-primary">
            <span>Chuyến của tôi</span>
            <ArrowRightIcon size={15} />
          </Link>
        </div>
      </div>

      <section className="station-detail-panel" aria-label="Danh sách khuyến mãi">
        <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} />

        {activeTab === 'available' && (
          <div className="stack-md">
            {availableQuery.loading && !availableQuery.data && (
              <LoadingState message="Đang tải danh sách khuyến mãi khả dụng..." />
            )}

            {!availableQuery.loading && availableQuery.error && (
              <ErrorState
                error={availableQuery.error}
                onRetry={availableQuery.reload}
                title="Không tải được danh sách khuyến mãi"
                hideCode
              />
            )}

            {!availableQuery.loading && !availableQuery.error && availablePromos.length === 0 && (
              <EmptyState
                title="Hiện chưa có chương trình khuyến mãi nào đang mở"
                hint="Các ưu đãi mới sẽ hiển thị tại đây ngay khi hệ thống mở đợt áp dụng."
              />
            )}

            {!availableQuery.error && availablePromos.length > 0 && (
              <>
                <div className="customer-card-grid">
                  {availablePromos.map((promo) => {
                    const existingClaim = claimedByPromoId.get(String(promo.id)) || null;
                    const promoState = evaluatePromotionState(promo, {
                      claimed: Boolean(existingClaim),
                      isUsed: Boolean(existingClaim?.is_used),
                    });
                    const conditionLines = buildPromotionConditionLines(promo);
                    const isClaimingThis = claimingId === String(promo.id) && claimMutation.loading;

                    return (
                      <article key={promo.id} className="customer-card promo-card">
                        <div className="station-card-header">
                          <div>
                            <span className="promo-code-chip">
                              <TagIcon size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />
                              {promo.code}
                            </span>
                            <h2 className="customer-card-title" style={{ marginTop: 8 }}>
                              {formatPromotionDiscountSummary(promo)}
                            </h2>
                          </div>
                          <StatusBadge label={promoState.label} tone={promoState.tone} />
                        </div>

                        {promo.description && (
                          <p className="station-card-address" style={{ marginTop: 0 }}>
                            {promo.description}
                          </p>
                        )}

                        <div className="promo-card-divider">
                          <ul className="rental-rules-list">
                            {conditionLines.map((line, idx) => (
                              <li key={idx}>{line}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="customer-card-actions">
                          {promoState.canClaim ? (
                            <Button
                              size="sm"
                              variant="primary"
                              loading={isClaimingThis}
                              disabled={claimMutation.loading && !isClaimingThis}
                              onClick={() => handleClaim(promo)}
                            >
                              Nhận mã
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" disabled>
                              {promoState.label}
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                <Pagination
                  meta={availableQuery.meta}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={(nextPage) =>
                    setAvailablePage((prev) => ({ ...prev, page: nextPage }))
                  }
                  onPageSizeChange={(nextSize) =>
                    setAvailablePage({ page: 1, pageSize: nextSize })
                  }
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'mine' && (
          <div className="stack-md">
            <div className="inline-filter-row">
              <SelectField
                id="promo-used-filter"
                label="Trạng thái sử dụng"
                value={myFilters.isUsed}
                onChange={(e) =>
                  setMyFilters((prev) => applyFilterPatch(prev, { isUsed: e.target.value }))
                }
                options={MY_PROMO_FILTER_OPTIONS}
              />
              {myFilters.isUsed && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMyFilters((prev) => applyFilterPatch(prev, { isUsed: '' }))}
                >
                  Xem tất cả mã
                </Button>
              )}
            </div>

            {myPromotionsQuery.loading && !myPromotionsQuery.data && (
              <LoadingState message="Đang tải mã khuyến mãi của bạn..." />
            )}

            {!myPromotionsQuery.loading && myPromotionsQuery.error && (
              <ErrorState
                error={myPromotionsQuery.error}
                onRetry={myPromotionsQuery.reload}
                title="Không tải được mã khuyến mãi của bạn"
                hideCode
              />
            )}

            {!myPromotionsQuery.loading && !myPromotionsQuery.error && myPromos.length === 0 && (
              <EmptyState
                title={
                  myFilters.isUsed
                    ? 'Không có mã khuyến mãi nào khớp bộ lọc'
                    : 'Bạn chưa nhận mã khuyến mãi nào'
                }
                hint="Hãy sang tab Khuyến mãi có thể nhận để lưu các mã ưu đãi đang mở."
                action={
                  !myFilters.isUsed ? (
                    <Button variant="primary" onClick={() => setActiveTab('available')}>
                      Xem khuyến mãi đang mở
                    </Button>
                  ) : null
                }
              />
            )}

            {!myPromotionsQuery.error && myPromos.length > 0 && (
              <>
                <div className="customer-card-grid">
                  {myPromos.map((claim) => {
                    const promo = claim.promotion;
                    const promoState = evaluatePromotionState(promo, {
                      claimed: true,
                      isUsed: Boolean(claim.is_used),
                    });
                    const conditionLines = buildPromotionConditionLines(promo);

                    return (
                      <article key={claim.id} className="customer-card promo-card">
                        <div className="station-card-header">
                          <div>
                            <span className="promo-code-chip">
                              <TagIcon size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />
                              {promo?.code || 'MÃ ƯU ĐÃI'}
                            </span>
                            <h2 className="customer-card-title" style={{ marginTop: 8 }}>
                              {formatPromotionDiscountSummary(promo)}
                            </h2>
                          </div>
                          <StatusBadge label={promoState.label} tone={promoState.tone} />
                        </div>

                        {promo?.description && (
                          <p className="station-card-address" style={{ marginTop: 0 }}>
                            {promo.description}
                          </p>
                        )}

                        {claim.is_used && claim.used_at && (
                          <p className="customer-meta-label">
                            Đã sử dụng lúc: <strong>{formatDateTimeVN(claim.used_at)}</strong>
                          </p>
                        )}

                        <div className="promo-card-divider">
                          <ul className="rental-rules-list">
                            {conditionLines.map((line, idx) => (
                              <li key={idx}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <Pagination
                  meta={myPromotionsQuery.meta}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={(nextPage) =>
                    setMyFilters((prev) => ({ ...prev, page: nextPage }))
                  }
                  onPageSizeChange={(nextSize) =>
                    setMyFilters((prev) => ({ ...prev, pageSize: nextSize, page: 1 }))
                  }
                />
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
