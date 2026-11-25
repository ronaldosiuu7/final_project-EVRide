import React, { useEffect, useState } from 'react';
import useApiQuery from '../../hooks/useApiQuery.js';
import { getLatestRentalGps, listRentalGpsHistory } from '../../services/rentalsApi.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  StatusBadge,
} from '../../components/ui/index.js';
import { formatDateTimeVN } from '../../utils/format.js';
import { formatCoordinatesDisplay } from '../../utils/fleetDisplay.js';
import { evaluateGpsStatus } from '../../utils/rentalHelpers.js';

const GPS_POLL_INTERVAL_MS = 15000;
const GPS_PAGE_SIZE = 10;

/**
 * Hiển thị tọa độ GPS mô phỏng mới nhất và lịch sử hành trình của chuyến thuê.
 * - Cảnh báo rõ ràng khi dữ liệu cũ quá ngưỡng (>60s) hoặc chưa có điểm định vị; không bao giờ mô tả vị trí cũ là hiện tại.
 * - Tự động làm mới định kỳ khi chuyến đang IN_RENT và tab đang hiển thị; dọn sạch interval/listener/request khi unmount hoặc đăng xuất.
 */
export default function CustomerGpsSection({ rentalId, isLiveTrip = false }) {
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    setHistoryPage(1);
  }, [rentalId]);

  const latestQuery = useApiQuery(
    ({ signal }) => getLatestRentalGps(rentalId, { signal }),
    [rentalId],
    { enabled: Boolean(rentalId) }
  );

  const historyQuery = useApiQuery(
    ({ signal }) =>
      listRentalGpsHistory(rentalId, { page: historyPage, page_size: GPS_PAGE_SIZE }, { signal }),
    [rentalId, historyPage],
    { enabled: Boolean(rentalId) }
  );

  // Tự làm mới vị trí định kỳ 15s khi chuyến đang thuê và người dùng đang mở tab.
  useEffect(() => {
    if (!rentalId || !isLiveTrip) return undefined;

    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      latestQuery.reload();
      if (historyPage === 1) {
        historyQuery.reload();
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, GPS_POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshIfVisible();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentalId, isLiveTrip, historyPage]);

  const gpsStatus = evaluateGpsStatus(latestQuery.data);
  const latestPoint = latestQuery.data?.point || null;
  const historyPoints = Array.isArray(historyQuery.data) ? historyQuery.data : [];

  const handleManualRefresh = () => {
    latestQuery.reload();
    historyQuery.reload();
  };

  return (
    <section className="station-detail-panel" aria-labelledby="customer-gps-heading">
      <div className="station-detail-top">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 id="customer-gps-heading" className="customer-card-title">
              Hành trình &amp; Vị trí GPS mô phỏng
            </h2>
            <StatusBadge label="GPS mô phỏng" tone="info" />
          </div>
          <p className="station-card-address">
            Dữ liệu tọa độ phục vụ minh họa theo dõi lộ trình xe máy điện trên hệ thống.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={handleManualRefresh}>
          Làm mới vị trí
        </Button>
      </div>

      {latestQuery.loading && !latestQuery.data && (
        <LoadingState message="Đang tải vị trí GPS mô phỏng mới nhất..." />
      )}

      {!latestQuery.loading && latestQuery.error && (
        <ErrorState
          error={latestQuery.error}
          onRetry={latestQuery.reload}
          title="Không tải được tọa độ GPS mới nhất"
          hideCode
        />
      )}

      {!latestQuery.error && latestQuery.data && (
        <>
          {gpsStatus.warningText && (
            <div className="alert alert-warning" role="status">
              <strong>Lưu ý độ trễ dữ liệu:</strong> {gpsStatus.warningText}
            </div>
          )}

          {latestPoint && (
            <div className="station-detail-stats">
              <div className="station-metric-box">
                <span className="customer-meta-label">
                  {gpsStatus.isStale ? 'Tọa độ ghi nhận lần cuối' : 'Tọa độ mới nhất'}
                </span>
                <strong className="customer-meta-value">
                  {formatCoordinatesDisplay(latestPoint.latitude, latestPoint.longitude)}
                </strong>
              </div>

              <div className="station-metric-box">
                <span className="customer-meta-label">Thời điểm ghi nhận</span>
                <strong className="customer-meta-value">
                  {formatDateTimeVN(latestPoint.recorded_at, { withSeconds: true })}
                </strong>
              </div>

              <div className="station-metric-box">
                <span className="customer-meta-label">Độ mới tín hiệu</span>
                <div>
                  <StatusBadge label={gpsStatus.badgeLabel} tone={gpsStatus.badgeTone} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="stack-sm">
        <h3 className="customer-meta-label">Lịch sử điểm định vị đã ghi nhận</h3>

        {historyQuery.loading && !historyQuery.data && (
          <LoadingState message="Đang tải lịch sử tọa độ..." />
        )}

        {!historyQuery.loading && historyQuery.error && (
          <ErrorState
            error={historyQuery.error}
            onRetry={historyQuery.reload}
            title="Không tải được lịch sử hành trình"
            hideCode
          />
        )}

        {!historyQuery.loading && !historyQuery.error && historyPoints.length === 0 && (
          <EmptyState
            title="Chưa có lịch sử tọa độ GPS mô phỏng"
            hint="Các điểm định vị sẽ xuất hiện tại đây khi hệ thống ghi nhận tín hiệu trong chuyến đi."
          />
        )}

        {!historyQuery.error && historyPoints.length > 0 && (
          <>
            <div className="gps-history-list">
              {historyPoints.map((pt) => (
                <div key={pt.id} className="gps-history-row">
                  <span>
                    <strong>{formatCoordinatesDisplay(pt.latitude, pt.longitude)}</strong>
                  </span>
                  <span className="muted">
                    Ghi nhận lúc {formatDateTimeVN(pt.recorded_at, { withSeconds: true })}
                  </span>
                </div>
              ))}
            </div>

            <Pagination
              meta={historyQuery.meta}
              onPageChange={(nextPage) => setHistoryPage(nextPage)}
            />
          </>
        )}
      </div>
    </section>
  );
}
