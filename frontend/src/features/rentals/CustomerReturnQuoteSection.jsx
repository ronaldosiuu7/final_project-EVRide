import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useApiQuery from '../../hooks/useApiQuery.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { listStations } from '../../services/fleetApi.js';
import { createReturnQuote } from '../../services/rentalsApi.js';
import { listMyPromotions } from '../../services/walletsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SelectField,
  StatusBadge,
  TextField,
} from '../../components/ui/index.js';
import { formatDurationSeconds } from '../../utils/format.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import {
  formatCountDisplay,
  formatStationHours,
  getStationOpenStatus,
  getStationReturnSpaceCount,
} from '../../utils/fleetDisplay.js';
import {
  evaluatePromotionState,
  evaluateQuoteExpiry,
  formatOfficialMoneyOrNull,
  formatPromotionDiscountSummary,
} from '../../utils/promotionFinanceHelpers.js';

/**
 * Tìm trạm trả còn chỗ (khi IN_RENT) và lấy báo giá ước tính / báo giá chốt 10 phút từ máy chủ
 * (POST /rentals/{id}/return-quote), hỗ trợ chọn từ mã khuyến mãi đã nhận của khách.
 * - TUYỆT ĐỐI KHÔNG tự tính tiền thuê chính thức bằng đồng hồ trình duyệt.
 * - TUYỆT ĐỐI KHÔNG tiêu thụ mã khuyến mãi trên frontend khi chỉ lấy báo giá.
 * - TUYỆT ĐỐI KHÔNG cho CUSTOMER gọi endpoint quyết toán (/rentals/{id}/return) chỉ dành cho STAFF/MANAGER.
 */
export default function CustomerReturnQuoteSection({ rental }) {
  const isInRent = rental?.status === 'IN_RENT';
  const isReturnPending = rental?.status === 'RETURN_PENDING';

  const [stationSearch, setStationSearch] = useState('');
  const [stationPage, setStationPage] = useState(1);
  const debouncedSearch = useDebouncedValue(stationSearch, 300);

  const [selectedStationId, setSelectedStationId] = useState(
    rental?.actual_return_station_id ? String(rental.actual_return_station_id) : ''
  );
  const [promotionCode, setPromotionCode] = useState('');

  const [quoteData, setQuoteData] = useState(null);
  const quoteRequestVersion = useRef(0);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [, setQuoteTick] = useState(0);

  useEffect(() => {
    quoteRequestVersion.current += 1;
    setQuoteData(null);
    setQuoteError('');
    setQuoteLoading(false);
    return () => { quoteRequestVersion.current += 1; };
  }, [rental?.id, rental?.status, rental?.actual_return_station_id, promotionCode]);

  useEffect(() => {
    if (rental?.actual_return_station_id) {
      setSelectedStationId(String(rental.actual_return_station_id));
    }
  }, [rental?.actual_return_station_id]);

  // Tải danh sách mã khuyến mãi chưa sử dụng của khách để chọn nhanh khi gọi return-quote.
  const myUnusedPromosQuery = useApiQuery(
    ({ signal }) => listMyPromotions({ is_used: 'false', page: 1, page_size: 50 }, { signal }),
    [],
    { enabled: isInRent || isReturnPending }
  );

  const promoOptions = useMemo(() => {
    const base = [{ value: '', label: 'Không áp dụng mã khuyến mãi' }];
    const items = Array.isArray(myUnusedPromosQuery.data) ? myUnusedPromosQuery.data : [];
    for (const claim of items) {
      const promo = claim?.promotion;
      if (!promo?.code) continue;
      const state = evaluatePromotionState(promo, { claimed: true, isUsed: Boolean(claim.is_used) });
      const suffix = state.canUseInQuote ? '' : ` — ${state.label}`;
      base.push({
        value: promo.code,
        label: `${promo.code} (${formatPromotionDiscountSummary(promo)})${suffix}`,
      });
    }
    return base;
  }, [myUnusedPromosQuery.data]);

  // Tìm danh sách trạm đang mở cửa và còn chỗ trả khi khách đang IN_RENT.
  const stationsQuery = useApiQuery(
    ({ signal }) =>
      listStations(
        {
          q: debouncedSearch.trim() || undefined,
          has_return_space: 'true',
          page: stationPage,
          page_size: 6,
        },
        { signal }
      ),
    [debouncedSearch, stationPage],
    { enabled: isInRent }
  );

  // Bộ đếm ngược hiệu lực 10 phút của báo giá từ máy chủ; dọn sạch khi unmount/đăng xuất.
  useEffect(() => {
    if (!quoteData?.quote_expires_at) return undefined;
    const timerId = window.setInterval(() => {
      setQuoteTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [quoteData?.quote_expires_at]);

  if (!isInRent && !isReturnPending) {
    return null;
  }

  const quoteExpiry = evaluateQuoteExpiry(quoteData, {
    clientNowMs: Date.now(),
  });

  const requestServerQuote = async (targetStationId) => {
    const stationIdToUse = String(
      targetStationId || selectedStationId || rental?.actual_return_station_id || ''
    ).trim();

    if (!stationIdToUse) {
      setQuoteError('Vui lòng chọn một trạm trả xe để máy chủ tính báo giá.');
      return;
    }

    const version = ++quoteRequestVersion.current;
    setQuoteData(null);
    setSelectedStationId(stationIdToUse);
    setQuoteLoading(true);
    setQuoteError('');
    try {
      const payload = {
        return_station_id: stationIdToUse,
      };
      if (promotionCode.trim()) {
        payload.promotion_code = promotionCode.trim();
      }
      const res = await createReturnQuote(rental.id, payload);
      if (version !== quoteRequestVersion.current) return;
      setQuoteData(res?.data || null);
      setQuoteTick(0);
    } catch (err) {
      if (version === quoteRequestVersion.current) setQuoteError(getApiErrorMessage(err));
    } finally {
      if (version === quoteRequestVersion.current) setQuoteLoading(false);
    }
  };

  const stations = Array.isArray(stationsQuery.data) ? stationsQuery.data : [];

  return (
    <section className="station-detail-panel" aria-labelledby="return-quote-heading">
      <div className="station-detail-top">
        <div>
          <h2 id="return-quote-heading" className="customer-card-title">
            {isReturnPending
              ? 'Báo giá quyết toán trả xe (Hiệu lực 10 phút)'
              : 'Tìm trạm còn chỗ trả & Ước tính cước'}
          </h2>
          <p className="station-card-address">
            {isReturnPending
              ? 'Nhân viên đã tiếp nhận xe tại trạm trả. Bạn có thể chọn mã khuyến mãi đã nhận để kiểm tra báo giá 10 phút trong lúc chờ nhân viên hoàn tất quyết toán.'
              : 'Bạn có thể trả xe tại trạm nhận hoặc bất kỳ trạm EVRide nào đang mở cửa và còn chỗ trống. Chọn trạm và mã khuyến mãi (nếu có) để xem ước tính cước.'}
          </p>
        </div>
      </div>

      {/* Tìm trạm còn chỗ trả khi đang IN_RENT */}
      {isInRent && (
        <div className="stack-md">
          <TextField
            label="Tìm trạm trả còn chỗ trống"
            type="search"
            placeholder="Nhập tên trạm hoặc khu vực bạn muốn trả xe..."
            value={stationSearch}
            onChange={(e) => {
              setStationSearch(e.target.value);
              setStationPage(1);
            }}
          />

          {stationsQuery.loading && <LoadingState message="Đang tìm trạm còn chỗ trả..." />}

          {!stationsQuery.loading && stationsQuery.error && (
            <ErrorState
              error={stationsQuery.error}
              onRetry={stationsQuery.reload}
              title="Không tải được danh sách trạm trả xe"
              hideCode
            />
          )}

          {!stationsQuery.loading && !stationsQuery.error && stations.length === 0 && (
            <EmptyState
              title="Không tìm thấy trạm nào đang mở cửa và còn chỗ trả khớp từ khóa"
              hint="Hãy thử xóa từ khóa tìm kiếm để xem tất cả trạm còn chỗ trống."
            />
          )}

          {!stationsQuery.loading && !stationsQuery.error && stations.length > 0 && (
            <>
              <div className="return-station-grid">
                {stations.map((st) => {
                  const openInfo = getStationOpenStatus(st);
                  const freeSpaces = getStationReturnSpaceCount(st);
                  const isSelected = String(st.id) === selectedStationId;

                  return (
                    <div
                      key={st.id}
                      className={`return-station-item ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                        <strong>{st.name}</strong>
                        <StatusBadge label={openInfo.label} tone={openInfo.tone} />
                      </div>
                      <p className="station-card-address" style={{ marginTop: 0 }}>
                        {st.address}
                      </p>
                      <p className="station-card-address" style={{ marginTop: 0 }}>
                        Giờ mở: <strong>{formatStationHours(st.opens_at, st.closes_at)}</strong> · Chỗ trống:{' '}
                        <strong>{formatCountDisplay(freeSpaces, 'chỗ')}</strong>
                      </p>
                      <div className="customer-card-actions">
                        <Button
                          size="sm"
                          variant={isSelected ? 'primary' : 'secondary'}
                          loading={quoteLoading && isSelected}
                          onClick={() => requestServerQuote(st.id)}
                        >
                          Ước tính cước tại trạm này
                        </Button>
                        <Link
                          to={`/stations/${encodeURIComponent(String(st.id))}`}
                          className="btn btn-sm btn-ghost"
                        >
                          Xem trạm
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination
                meta={stationsQuery.meta}
                onPageChange={(nextPage) => setStationPage(nextPage)}
              />
            </>
          )}
        </div>
      )}

      {/* Chọn mã khuyến mãi đã nhận (hoặc nhập mã) & lấy báo giá từ máy chủ */}
      <div className="quote-action-bar">
        <div style={{ flex: '1 1 260px' }}>
          <SelectField
            label="Chọn từ mã khuyến mãi của tôi"
            value={promoOptions.some((o) => o.value === promotionCode) ? promotionCode : ''}
            disabled={quoteLoading}
            onChange={(e) => setPromotionCode(e.target.value)}
            options={promoOptions}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <TextField
            label="Hoặc nhập mã khuyến mãi"
            placeholder="Nhập mã đã nhận..."
            value={promotionCode}
            disabled={quoteLoading}
            onChange={(e) => setPromotionCode(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          loading={quoteLoading}
          disabled={!selectedStationId && !rental?.actual_return_station_id}
          onClick={() => requestServerQuote()}
        >
          {quoteData
            ? quoteExpiry.isExpired
              ? 'Lấy báo giá mới'
              : 'Làm mới báo giá'
            : isReturnPending
              ? 'Xem báo giá quyết toán 10 phút'
              : 'Xem ước tính cước'}
        </Button>
      </div>

      <p className="customer-meta-label">
        Chưa có mã khuyến mãi?{' '}
        <Link to="/promotions">Xem và nhận ưu đãi tại trang Khuyến mãi</Link>. Việc xem báo giá không tiêu thụ mã khuyến mãi của bạn.
      </p>

      {quoteError && (
        <div className="alert alert-danger" role="alert">
          {quoteError}
        </div>
      )}

      {quoteData && (
        <div className={`quote-result-panel ${quoteExpiry.isExpired ? 'is-expired-quote' : ''}`}>
          <div className="station-detail-top">
            <div>
              <strong>
                {quoteData.is_estimate
                  ? 'Kết quả ước tính tạm thời từ máy chủ'
                  : 'Báo giá quyết toán khóa cước 10 phút'}
              </strong>
              <p className="station-card-address" style={{ marginTop: 2 }}>
                Thời lượng tính cước trên máy chủ:{' '}
                <strong>{formatDurationSeconds(quoteData.elapsed_seconds)}</strong>
                {quoteData.promotion_code ? (
                  <>
                    {' '}
                    · Mã áp dụng: <strong>{quoteData.promotion_code}</strong>
                  </>
                ) : null}
              </p>
            </div>

            {!quoteExpiry.isExpired ? (
              <StatusBadge
                label={`Còn hiệu lực ${quoteExpiry.formattedCountdown}`}
                tone="success"
              />
            ) : (
              <StatusBadge label="Báo giá đã hết hạn — cần lấy báo giá mới" tone="warning" />
            )}
          </div>

          {quoteExpiry.isExpired && (
            <div className="alert alert-warning" role="status">
              Báo giá này đã hết hiệu lực 10 phút. Vui lòng bấm <strong>Lấy báo giá mới</strong> để nhận số liệu mới nhất từ máy chủ.
            </div>
          )}

          <dl className="vehicle-pricing-list">
            <div className="vehicle-pricing-row">
              <dt>Tiền thuê theo thời gian</dt>
              <dd>{formatOfficialMoneyOrNull(quoteData.rental_fee)}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Giảm giá khuyến mãi</dt>
              <dd>- {formatOfficialMoneyOrNull(quoteData.discount_amount)}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt><strong>Tổng cước sau giảm</strong></dt>
              <dd className="price-highlight">{formatOfficialMoneyOrNull(quoteData.total_amount)}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Tiền cọc đang tạm giữ</dt>
              <dd>{formatOfficialMoneyOrNull(quoteData.deposit_held)}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Tiền cọc cấn trừ vào cước</dt>
              <dd>{formatOfficialMoneyOrNull(quoteData.deposit_applied)}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Tiền cần thu thêm từ ví</dt>
              <dd className="price-highlight">{formatOfficialMoneyOrNull(quoteData.additional_payment)}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Tiền cọc dư hoàn lại ví</dt>
              <dd>{formatOfficialMoneyOrNull(quoteData.deposit_refund)}</dd>
            </div>
          </dl>

          <p className="customer-meta-label">
            {quoteData.is_estimate
              ? 'Số tiền chính thức chỉ được chốt bởi máy chủ sau khi nhân viên trạm tiếp nhận trả xe và thực hiện quyết toán.'
              : 'Nhân viên tại trạm sẽ thực hiện bước quyết toán chính thức. Mã khuyến mãi chỉ được ghi nhận đã dùng khi quyết toán hoàn tất.'}
          </p>
        </div>
      )}
    </section>
  );
}
