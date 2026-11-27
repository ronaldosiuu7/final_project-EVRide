import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import useApiQuery from '../../hooks/useApiQuery.js';
import useIdempotentMutation from '../../hooks/useIdempotentMutation.js';
import { getStation } from '../../services/fleetApi.js';
import {
  cancelRental,
  getRental,
  listRentalHandovers,
} from '../../services/rentalsApi.js';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
  useToast,
} from '../../components/ui/index.js';
import {
  ClockIcon,
  LifebuoyIcon,
  RefreshIcon,
} from '../../components/customer/CustomerIcons.jsx';
import { formatDateTimeVN, formatDurationSeconds } from '../../utils/format.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import {
  formatBatteryPercent,
  formatMoneyDisplay,
  formatStationHours,
} from '../../utils/fleetDisplay.js';
import {
  getCancellationReasonLabel,
  getHandoverKindLabel,
  getReservationCountdownState,
  getVehicleConditionLabel,
  isIncidentRentalStatus,
} from '../../utils/rentalHelpers.js';
import CustomerReturnQuoteSection from './CustomerReturnQuoteSection.jsx';
import CustomerGpsSection from './CustomerGpsSection.jsx';
import CustomerRentalFinanceSection from './CustomerRentalFinanceSection.jsx';
import CustomerIncidentSummarySection from './CustomerIncidentSummarySection.jsx';
import CustomerReviewSection from './CustomerReviewSection.jsx';
import { createTopupPollingController } from '../../utils/walletHelpers.js';
import { canCreateTicketForRental } from '../../utils/supportHelpers.js';

export default function CustomerRentalDetailPage() {
  const { rentalId } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [countdownTick, setCountdownTick] = useState(0);
  const expiryReloadedForRef = useRef(null);

  const rentalQuery = useApiQuery(
    ({ signal }) => getRental(rentalId, { signal }),
    [rentalId],
    { enabled: Boolean(rentalId) }
  );

  const rental = rentalQuery.data;

  const pickupStationId = rental?.pickup_station_id ? String(rental.pickup_station_id) : '';
  const returnStationId = rental?.actual_return_station_id
    ? String(rental.actual_return_station_id)
    : '';

  const pickupStationQuery = useApiQuery(
    ({ signal }) => getStation(pickupStationId, { signal }),
    [pickupStationId],
    { enabled: Boolean(pickupStationId) }
  );

  const returnStationQuery = useApiQuery(
    ({ signal }) => getStation(returnStationId, { signal }),
    [returnStationId],
    { enabled: Boolean(returnStationId) && returnStationId !== pickupStationId }
  );

  const handoversQuery = useApiQuery(
    ({ signal }) => listRentalHandovers(rentalId, { page: 1, page_size: 20 }, { signal }),
    [rentalId, rental?.status || ''],
    { enabled: Boolean(rentalId) && Boolean(rental) }
  );

  const cancelMutation = useIdempotentMutation(({ idempotencyKey }) =>
    cancelRental(rentalId, idempotencyKey)
  );

  // Đồng bộ đồng hồ đếm ngược mỗi 1 giây khi chuyến đang RESERVED; dọn dẹp sạch khi unmount/đăng xuất.
  useEffect(() => {
    if (rental?.status !== 'RESERVED' || typeof window === 'undefined') return undefined;
    const intervalId = window.setInterval(() => {
      setCountdownTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [rental?.status, rental?.expires_at]);

  const countdownState = getReservationCountdownState(rental, {
    clientNowMs: Date.now() + countdownTick * 0,
  });

  // Khi countdown chạm 0, KHÔNG tự biến trạng thái sang EXPIRED bằng đồng hồ client,
  // mà gọi máy chủ tải lại đúng 1 lần cho mốc expires_at đó để nhận trạng thái chính thức.
  useEffect(() => {
    if (
      !rental ||
      rental.status !== 'RESERVED' ||
      !countdownState.needsServerRefresh ||
      typeof window === 'undefined'
    ) {
      return undefined;
    }
    const expiryKey = `${rental.id}:${rental.expires_at}`;
    if (expiryReloadedForRef.current === expiryKey) {
      return undefined;
    }
    expiryReloadedForRef.current = expiryKey;
    const timerId = window.setTimeout(() => {
      rentalQuery.reload();
      handoversQuery.reload();
    }, 350);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rental?.id, rental?.status, rental?.expires_at, countdownState.needsServerRefresh]);

  // Tự tải lại trạng thái chuyến khi người dùng quay lại tab / cửa sổ trình duyệt; dọn dẹp sạch khi unmount/đăng xuất.
  useEffect(() => {
    if (!rentalId || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    const refreshOnReturn = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      rentalQuery.reload();
      handoversQuery.reload();
    };

    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('focus', refreshOnReturn);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('focus', refreshOnReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentalId]);

  // Theo dõi bàn giao, tiếp nhận trả và quyết toán mỗi 12s khi tab mở
  // để tự cập nhật sang COMPLETED cùng hóa đơn & giao dịch mới nhất; dừng sạch khi unmount/logout/ẩn tab.
  useEffect(() => {
    if (!rentalId || !['RESERVED', 'IN_RENT', 'RETURN_PENDING'].includes(rental?.status)) {
      return undefined;
    }
    const controller = createTopupPollingController({
      intervalMs: 12000,
      onTick: () => {
        if (!rentalQuery.loading) rentalQuery.reload();
        if (!handoversQuery.loading) handoversQuery.reload();
      },
    });
    controller.start();
    return () => controller.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentalId, rental?.status, rentalQuery.loading, handoversQuery.loading, rentalQuery.reload, handoversQuery.reload]);

  const handleConfirmCancel = async () => {
    try {
      await cancelMutation.execute(`cancel-rental:${rentalId}`, {});
      toast.success('Đã hủy lượt giữ xe thành công.');
      setConfirmCancelOpen(false);
      rentalQuery.reload();
    } catch (err) {
      setConfirmCancelOpen(false);
      toast.error(getApiErrorMessage(err));
      // Nếu lượt giữ chỗ vừa hết hạn hoặc đã được nhân viên bàn giao, tải lại ngay dữ liệu máy chủ!
      if (err?.code === 'RESERVATION_EXPIRED' || err?.code === 'INVALID_RENTAL_STATE') {
        rentalQuery.reload();
        handoversQuery.reload();
      }
    }
  };

  if (rentalQuery.loading && !rental) {
    return <LoadingState message="Đang tải thông tin chuyến thuê..." />;
  }

  if (rentalQuery.error) {
    const isNotFound = rentalQuery.error.status === 404;
    return (
      <div className="customer-page">
        <nav className="customer-breadcrumb" aria-label="Đường dẫn">
          <Link to="/rentals">Chuyến của tôi</Link>
          <span aria-hidden="true">/</span>
          <span>Chi tiết chuyến</span>
        </nav>

        {isNotFound ? (
          <EmptyState
            title="Không tìm thấy chuyến thuê này"
            hint="Chuyến thuê không tồn tại hoặc không thuộc tài khoản của bạn."
            action={
              <Link to="/rentals" className="btn btn-primary">
                Quay lại danh sách chuyến
              </Link>
            }
          />
        ) : (
          <ErrorState
            error={rentalQuery.error}
            onRetry={rentalQuery.reload}
            title="Không tải được chi tiết chuyến thuê"
            hideCode
          />
        )}
      </div>
    );
  }

  if (!rental) {
    return null;
  }

  const statusMeta = getCustomerStatusMeta('rentalStatus', rental.status);
  const pickupStation = pickupStationQuery.data;
  const returnStation =
    returnStationId === pickupStationId ? pickupStation : returnStationQuery.data;
  const handovers = Array.isArray(handoversQuery.data) ? handoversQuery.data : [];
  const canCustomerCancel = user?.role === 'CUSTOMER' && rental.status === 'RESERVED';
  const showGpsSection = rental.actual_start_time !== null && rental.actual_start_time !== undefined;

  const normalStepIndex = {
    RESERVED: 0,
    IN_RENT: 2,
    RETURN_PENDING: 3,
    COMPLETED: 4,
  }[rental.status];

  const rentalSteps = [
    { num: 1, title: 'Giữ xe 30 phút', desc: 'Đến quầy trước khi hết hạn' },
    { num: 2, title: 'Nhận xe tại trạm', desc: 'Nhân viên kiểm tra & giao xe' },
    { num: 3, title: 'Đang di chuyển', desc: 'Trả tại bất kỳ trạm còn chỗ' },
    { num: 4, title: 'Trả xe & Quyết toán', desc: 'Xuất hóa đơn minh bạch' },
  ];

  const holdProgressPct =
    rental.status === 'RESERVED' && typeof countdownState.remainingSeconds === 'number'
      ? Math.min(100, Math.max(0, Math.round((countdownState.remainingSeconds / 1800) * 100)))
      : 0;

  return (
    <div className="customer-page">
      <nav className="customer-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <Link to="/rentals">Chuyến của tôi</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{rental.vehicle_name || 'Chi tiết chuyến'}</span>
      </nav>

      {/* Khối tổng quan trạng thái & hướng dẫn vận hành */}
      <section className="station-detail-panel" aria-labelledby="rental-detail-title">
        <div className="station-detail-top">
          <div className="station-detail-heading">
            <span className="vehicle-model-tag">
              {rental.vehicle_model_snapshot || 'Xe máy điện EVRide'}
            </span>
            <h1 id="rental-detail-title" className="customer-page-title">
              {rental.vehicle_name || 'Chuyến thuê xe máy điện'}
            </h1>
            <p className="station-card-hours-line">
              <ClockIcon size={15} className="station-meta-icon" />
              <span>
                Tạo lúc <strong>{formatDateTimeVN(rental.created_at)}</strong>
              </span>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            {user?.role === 'CUSTOMER' && canCreateTicketForRental(rental) && (
              <Link
                to={`/support?rental_id=${encodeURIComponent(String(rental.id))}`}
                className="btn btn-sm btn-ghost"
              >
                <LifebuoyIcon size={15} />
                <span>Báo sự cố / Hỗ trợ</span>
              </Link>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                rentalQuery.reload();
                handoversQuery.reload();
              }}
            >
              <RefreshIcon size={15} />
              <span>Đồng bộ trạng thái</span>
            </Button>
          </div>
        </div>

        {/* Tiến trình chuyến thuê trực quan cho người dùng mới */}
        {normalStepIndex !== undefined && (
          <ol className="rental-stepper" aria-label="Tiến trình chuyến thuê">
            {rentalSteps.map((step, idx) => {
              const stateClass =
                normalStepIndex > idx
                  ? 'is-done'
                  : normalStepIndex === idx
                    ? 'is-current'
                    : 'is-upcoming';
              return (
                <li
                  key={step.num}
                  className={`rental-stepper-item ${stateClass}`}
                  aria-current={normalStepIndex === idx ? 'step' : undefined}
                >
                  <span className="rental-stepper-num" aria-hidden="true">
                    {step.num}
                  </span>
                  <div className="rental-stepper-copy">
                    <strong>{step.title}</strong>
                    <span>{step.desc}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Trạng thái RESERVED: đếm ngược theo server_time + hủy giữ chỗ */}
        {rental.status === 'RESERVED' && (
          <div className="reservation-hold-banner" role="status">
            <div className="station-detail-top">
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <strong>
                    {countdownState.needsServerRefresh
                      ? 'Đang kiểm tra hạn giữ chỗ...'
                      : 'Thời gian giữ chỗ còn lại:'}
                  </strong>
                  {!countdownState.needsServerRefresh && (
                    <span className="rental-countdown-value">
                      {countdownState.formattedCountdown}
                    </span>
                  )}
                </div>
                {!countdownState.needsServerRefresh && (
                  <div className="rental-countdown-track" aria-hidden="true">
                    <div
                      className="rental-countdown-fill"
                      style={{ width: `${holdProgressPct}%` }}
                    />
                  </div>
                )}
                <p style={{ marginTop: 8 }}>
                  Hạn nhận xe:{' '}
                  <strong>{formatDateTimeVN(rental.expires_at, { withSeconds: true })}</strong>. Bước tiếp theo: đến quầy trạm nhận xe và xuất trình CCCD đã xác minh để{' '}
                  <strong>nhân viên trạm kiểm tra và thực hiện bàn giao xe</strong>.
                </p>
              </div>
              {canCustomerCancel && (
                <Button
                  variant="danger"
                  size="sm"
                  loading={cancelMutation.loading}
                  onClick={() => setConfirmCancelOpen(true)}
                >
                  Hủy giữ xe
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Trạng thái IN_RENT: hiển thị thời lượng máy chủ ghi nhận, không tự tính tiền bằng timer */}
        {rental.status === 'IN_RENT' && (
          <div className="alert alert-info stack-xs" role="status">
            <strong>Xe đang trong hành trình thuê của bạn</strong>
            <p>
              Nhận xe lúc <strong>{formatDateTimeVN(rental.actual_start_time)}</strong> · Thời lượng tính đến lần đồng bộ gần nhất:{' '}
              <strong>{formatDurationSeconds(rental.elapsed_seconds)}</strong>.
            </p>
            <p>
              Khi muốn trả xe, hãy đưa xe tới bất kỳ trạm đang mở cửa và còn chỗ trống để <strong>nhân viên trạm tiếp nhận trả xe</strong>. Tiền thuê chính thức sẽ được máy chủ tính theo mốc nhân viên tiếp nhận xe.
            </p>
          </div>
        )}

        {/* Trạng thái RETURN_PENDING */}
        {rental.status === 'RETURN_PENDING' && (
          <div className="alert alert-warning stack-xs" role="status">
            <strong>Xe đã được nhân viên tiếp nhận — đang chờ hoàn tất thanh toán</strong>
            <p>
              Thời điểm tiếp nhận trả xe:{' '}
              <strong>{formatDateTimeVN(rental.return_initiated_at)}</strong> · Thời lượng chuyến:{' '}
              <strong>{formatDurationSeconds(rental.elapsed_seconds)}</strong>. Bạn có thể xem báo giá 10 phút bên dưới và thông báo mã khuyến mãi cho nhân viên quyết toán.
            </p>
          </div>
        )}

        {/* Trạng thái sự cố */}
        {isIncidentRentalStatus(rental.status) && (
          <div className="alert alert-danger stack-xs" role="status">
            <strong>Chuyến thuê đang hoặc đã xử lý theo quy trình sự cố</strong>
            <p>
              {rental.status === 'CLOSED_INCIDENT'
                ? 'Hồ sơ sự cố của chuyến này đã được đóng. Các khoản tiền thuê và tiền cọc được đối chiếu theo sổ quyết toán chính thức trên hệ thống.'
                : 'Chuyến thuê đang có hồ sơ sự cố cần xác minh và giải quyết. Trong thời gian chuyến chưa giải quyết xong, tài khoản tạm thời chưa thể đặt xe mới.'}
            </p>
          </div>
        )}

        {/* Trạng thái CANCELLED / EXPIRED / COMPLETED */}
        {rental.status === 'CANCELLED' && (
          <div className="alert alert-info stack-xs">
            <strong>Lượt giữ xe đã được hủy</strong>
            <p>
              Thời điểm hủy: <strong>{formatDateTimeVN(rental.cancelled_at)}</strong> · Lý do:{' '}
              <strong>
                {getCancellationReasonLabel(
                  rental.cancellation_reason,
                  rental.cancellation_limit_exempt
                )}
              </strong>
              .
            </p>
          </div>
        )}

        {rental.status === 'EXPIRED' && (
          <div className="alert alert-warning stack-xs">
            <strong>Lượt giữ xe đã hết hạn 30 phút</strong>
            <p>
              Hạn giữ chỗ kết thúc lúc <strong>{formatDateTimeVN(rental.expires_at)}</strong> mà chưa hoàn tất bàn giao nhận xe tại trạm. Bạn có thể chọn và đặt lại xe mới nếu chưa vượt giới hạn 3 lần/ngày.
            </p>
          </div>
        )}

        {rental.status === 'COMPLETED' && (
          <div className="alert alert-success stack-xs">
            <strong>Chuyến thuê đã hoàn tất quyết toán</strong>
            <p>
              Hoàn tất lúc <strong>{formatDateTimeVN(rental.settled_at || rental.actual_end_time)}</strong> · Tổng cước chính thức:{' '}
              <strong>{formatMoneyDisplay(rental.total_price)}</strong>.
            </p>
          </div>
        )}

        {/* Thông tin trạm & biểu giá khóa của chuyến */}
        <div className="station-detail-stats-strip">
          <div className="station-detail-stat">
            <span className="customer-meta-label">Trạm nhận xe</span>
            <strong className="customer-meta-value">
              {pickupStation?.name || 'Đang tải tên trạm...'}
            </strong>
            {pickupStation && (
              <span className="customer-meta-label" style={{ fontWeight: 500 }}>
                {pickupStation.address} ({formatStationHours(pickupStation.opens_at, pickupStation.closes_at)})
              </span>
            )}
          </div>

          {returnStationId && (
            <div className="station-detail-stat">
              <span className="customer-meta-label">Trạm trả xe thực tế</span>
              <strong className="customer-meta-value">
                {returnStation?.name || 'Trạm tiếp nhận trả xe'}
              </strong>
              {returnStation && (
                <span className="customer-meta-label" style={{ fontWeight: 500 }}>
                  {returnStation.address}
                </span>
              )}
            </div>
          )}

          <div className="station-detail-stat">
            <span className="customer-meta-label">Giá khóa (30p đầu / phút thêm)</span>
            <strong className="customer-meta-value">
              {formatMoneyDisplay(rental.first_30_minutes_price_snapshot)} /{' '}
              {formatMoneyDisplay(rental.extra_minute_price_snapshot)}
            </strong>
          </div>

          <div className="station-detail-stat">
            <span className="customer-meta-label">Cọc quy định / Cọc đang giữ</span>
            <strong className="customer-meta-value">
              {formatMoneyDisplay(rental.deposit_amount_snapshot)} /{' '}
              {formatMoneyDisplay(rental.deposit_held)}
            </strong>
          </div>
        </div>
      </section>

      {/* Tìm trạm còn chỗ trả & Báo giá từ máy chủ (IN_RENT / RETURN_PENDING) */}
      <CustomerReturnQuoteSection rental={rental} />

      {/* Hóa đơn & Giao dịch tài chính chính thức từ backend */}
      {rental.status !== 'RESERVED' &&
        rental.status !== 'CANCELLED' &&
        rental.status !== 'EXPIRED' && (
          <CustomerRentalFinanceSection
            rentalId={String(rental.id)}
            rentalStatus={rental.status}
          />
        )}

      {/* Thông tin xử lý sự cố & tách bạch tài chính (chỉ endpoint CUSTOMER có quyền) */}
      <CustomerIncidentSummarySection rental={rental} />

      {/* Đánh giá chuyến thuê 1 lần (chỉ COMPLETED, không coi CLOSED_INCIDENT là COMPLETED) */}
      <CustomerReviewSection rental={rental} />

      {/* Biên bản bàn giao / tiếp nhận thực tế từ GET /rentals/{id}/handovers */}
      <section className="station-detail-panel" aria-labelledby="rental-handovers-heading">
        <div className="station-detail-top">
          <div>
            <h2 id="rental-handovers-heading" className="customer-card-title">
              Biên bản bàn giao &amp; tiếp nhận xe tại trạm
            </h2>
            <p className="station-card-address" style={{ marginTop: 4 }}>
              Ghi nhận thực tế từ nhân viên trạm ở bước bàn giao nhận xe và tiếp nhận trả xe.
            </p>
          </div>
        </div>

        {handoversQuery.loading && !handoversQuery.data && (
          <LoadingState message="Đang tải biên bản bàn giao..." />
        )}

        {!handoversQuery.loading && handoversQuery.error && (
          <ErrorState
            error={handoversQuery.error}
            onRetry={handoversQuery.reload}
            title="Không tải được biên bản bàn giao"
            hideCode
          />
        )}

        {!handoversQuery.loading && !handoversQuery.error && handovers.length === 0 && (
          <EmptyState
            title="Chưa có biên bản bàn giao nào"
            hint="Biên bản sẽ xuất hiện ngay sau khi nhân viên tại trạm hoàn tất bước bàn giao nhận xe."
          />
        )}

        {!handoversQuery.error && handovers.length > 0 && (
          <div className="document-list">
            {handovers.map((ho) => {
              const conditionLabel = getVehicleConditionLabel(ho.vehicle_condition);
              return (
                <article key={ho.id} className="document-item-card">
                  <div className="document-item-head">
                    <div>
                      <h3 className="customer-card-title">{getHandoverKindLabel(ho.kind)}</h3>
                      <p className="station-card-hours-line" style={{ marginTop: 4 }}>
                        <ClockIcon size={15} className="station-meta-icon" />
                        <span>
                          Thời điểm ghi nhận:{' '}
                          <strong>{formatDateTimeVN(ho.time, { withSeconds: true })}</strong>
                        </span>
                      </p>
                    </div>
                    <StatusBadge
                      label={`Pin ${formatBatteryPercent(ho.battery_percent)}`}
                      tone={ho.kind === 'PICKUP' ? 'success' : 'info'}
                    />
                  </div>

                  <div className="station-detail-stats-strip">
                    <div className="station-detail-stat">
                      <span className="customer-meta-label">Mức pin bàn giao</span>
                      <strong className="customer-meta-value">
                        {formatBatteryPercent(ho.battery_percent)}
                      </strong>
                    </div>
                    {conditionLabel && (
                      <div className="station-detail-stat">
                        <span className="customer-meta-label">Tình trạng xe</span>
                        <strong className="customer-meta-value">{conditionLabel}</strong>
                      </div>
                    )}
                    <div className="station-detail-stat">
                      <span className="customer-meta-label">Ghi chú của nhân viên trạm</span>
                      <strong className="customer-meta-value">
                        {ho.note ? ho.note : 'Không có ghi chú thêm'}
                      </strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Vị trí & Lộ trình GPS */}
      {showGpsSection && (
        <CustomerGpsSection
          rentalId={String(rental.id)}
          isLiveTrip={rental.status === 'IN_RENT'}
        />
      )}

      <ConfirmDialog
        open={confirmCancelOpen}
        title="Xác nhận hủy lượt giữ xe"
        message="Bạn có chắc muốn hủy lượt giữ xe này? Hủy trước khi nhận xe không mất phí, nhưng sẽ được tính vào giới hạn tối đa 3 lần hủy hoặc để hết hạn giữ chỗ mỗi ngày theo giờ Việt Nam."
        confirmLabel="Xác nhận hủy giữ xe"
        cancelLabel="Giữ lại"
        variant="danger"
        loading={cancelMutation.loading}
        onConfirm={handleConfirmCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </div>
  );
}
