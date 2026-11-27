import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Modal, StatusBadge, useToast } from '../../components/ui/index.js';
import {
  ClockIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from '../../components/customer/CustomerIcons.jsx';
import useIdempotentMutation from '../../hooks/useIdempotentMutation.js';
import { createRental } from '../../services/rentalsApi.js';
import {
  formatMoneyDisplay,
  formatStationHours,
  getBatteryLevelInfo,
} from '../../utils/fleetDisplay.js';
import {
  buildCreateRentalPayload,
  computeUpfrontReservationRequirement,
  describeReservationError,
} from '../../utils/rentalHelpers.js';

/**
 * Hộp thoại xác nhận giữ một xe máy điện cụ thể trong 30 phút (POST /rentals kèm Idempotency-Key).
 * - Hiển thị đầy đủ giá 30 phút đầu, giá phút thêm, tiền cọc, tổng số dư tối thiểu cần có và điều kiện giữ chỗ.
 * - Chặn bấm đúp khi request đang gửi; giữ nguyên Idempotency-Key khi thử lại sau lỗi mạng/timeout/chưa rõ kết quả.
 */
export default function ReserveVehicleModal({
  vehicle,
  station = null,
  onClose,
  onReserved,
}) {
  const navigate = useNavigate();
  const toast = useToast();

  const { execute, loading, error } = useIdempotentMutation(
    ({ payload, idempotencyKey }) => createRental(payload, idempotencyKey)
  );

  const battery = getBatteryLevelInfo(vehicle?.battery_percent);
  const first30Price = formatMoneyDisplay(vehicle?.first_30_minutes_price);
  const extraMinPrice = formatMoneyDisplay(vehicle?.extra_minute_price);
  const depositAmount = formatMoneyDisplay(vehicle?.deposit_amount);
  const upfrontReq = useMemo(() => computeUpfrontReservationRequirement(vehicle), [vehicle]);

  const pickupStationId = vehicle?.current_station_id
    ? String(vehicle.current_station_id)
    : station?.id
      ? String(station.id)
      : '';

  const errorDetails = error ? describeReservationError(error) : null;

  const handleConfirm = async () => {
    if (!vehicle?.id || !pickupStationId) return;
    try {
      const payload = buildCreateRentalPayload({
        vehicleId: vehicle.id,
        pickupStationId,
      });
      const res = await execute(
        `reserve-vehicle:${payload.vehicle_id}:${payload.pickup_station_id}`,
        payload
      );
      const createdRental = res?.data;
      toast.success('Đã giữ xe thành công! Bạn có 30 phút để đến trạm nhận xe.');
      onReserved?.(createdRental);
      onClose?.();
      if (createdRental?.id) {
        navigate(`/rentals/${encodeURIComponent(String(createdRental.id))}`);
      } else {
        navigate('/rentals');
      }
    } catch {
      // Lỗi đã được lưu trong hook useIdempotentMutation để hiển thị hướng dẫn xử lý.
    }
  };

  return (
    <Modal
      open
      size="md"
      title="Xác nhận giữ xe máy điện (30 phút)"
      onClose={onClose}
      closeDisabled={loading}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Đóng
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!vehicle?.id || !pickupStationId}
            onClick={handleConfirm}
          >
            {errorDetails?.canRetrySameKey ? 'Thử gửi lại yêu cầu giữ xe' : 'Xác nhận giữ xe 30 phút'}
          </Button>
        </>
      }
    >
      <div className="stack-md">
        {errorDetails && (
          <div className="alert alert-danger stack-xs" role="alert">
            <strong>{errorDetails.title}</strong>
            <p>{errorDetails.message}</p>
            {errorDetails.hint && <p style={{ fontSize: '0.86rem' }}>{errorDetails.hint}</p>}
            {errorDetails.actionTo && errorDetails.actionLabel && (
              <div style={{ marginTop: 4 }}>
                <Link
                  to={errorDetails.actionTo}
                  className="btn btn-sm btn-secondary"
                  onClick={onClose}
                >
                  {errorDetails.actionLabel}
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="reserve-vehicle-summary">
          <div className="reserve-vehicle-summary-head">
            <div>
              <p className="vehicle-model-tag">{vehicle?.model || 'Xe máy điện'}</p>
              <strong className="customer-card-title">{vehicle?.name || 'Xe máy điện EVRide'}</strong>
            </div>
            <StatusBadge label={`Pin ${battery.text}`} tone={battery.tone} />
          </div>

          <div className="station-card-meta-list">
            <p className="station-card-address">
              <MapPinIcon size={15} className="station-meta-icon" />
              <span>
                Trạm nhận xe:{' '}
                <strong>{station?.name || (pickupStationId ? 'Trạm đã chọn' : 'Chưa xác định')}</strong>
                {station?.address ? ` — ${station.address}` : ''}
              </span>
            </p>
            {station && (
              <p className="station-card-hours-line">
                <ClockIcon size={15} className="station-meta-icon" />
                <span>
                  Giờ hoạt động trạm:{' '}
                  <strong>{formatStationHours(station.opens_at, station.closes_at)}</strong>
                </span>
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className="customer-meta-label" style={{ marginBottom: 8 }}>
            Biểu giá khóa tại thời điểm đặt chỗ
          </h3>
          <dl className="vehicle-pricing-list">
            <div className="vehicle-pricing-row">
              <dt>Giá 30 phút đầu</dt>
              <dd className="price-highlight">{first30Price}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Giá mỗi phút thêm (làm tròn lên theo phút)</dt>
              <dd>{extraMinPrice}</dd>
            </div>
            <div className="vehicle-pricing-row">
              <dt>Tiền cọc (tạm giữ khi nhân viên bàn giao xe)</dt>
              <dd>{depositAmount}</dd>
            </div>
            <div className="vehicle-pricing-row is-total">
              <dt>
                <strong>Số dư ví tối thiểu cần có</strong>
              </dt>
              <dd className="price-highlight">{upfrontReq.formattedTotal}</dd>
            </div>
          </dl>
        </div>

        <div className="reserve-rules-box">
          <span className="reserve-rules-heading">
            <ShieldCheckIcon size={16} />
            <span>Điều kiện giữ xe cần lưu ý</span>
          </span>
          <ul className="rental-rules-list">
            <li>
              Lượt giữ xe có hiệu lực trong <strong>30 phút</strong> theo đồng hồ máy chủ. Nhân viên tại trạm sẽ kiểm tra và thực hiện bàn giao nhận xe.
            </li>
            <li>
              Tài khoản cần có <strong>CCCD đã xác minh</strong>, còn hạn hiệu lực và đủ từ 16 tuổi.
            </li>
            <li>
              Hủy trước khi nhận xe không mất phí, nhưng tối đa{' '}
              <strong>3 lần hủy hoặc để hết hạn mỗi ngày</strong> theo giờ Việt Nam.
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
