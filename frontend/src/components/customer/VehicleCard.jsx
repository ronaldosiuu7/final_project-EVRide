import React from 'react';
import { Link } from 'react-router-dom';
import { Button, StatusBadge } from '../ui/index.js';
import ElectricScooterIllustration from './ElectricScooterIllustration.jsx';
import {
  formatMoneyDisplay,
  getBatteryLevelInfo,
} from '../../utils/fleetDisplay.js';

/**
 * Thẻ hiển thị một xe máy điện cho khách hàng.
 * - Hiển thị: ảnh minh họa xe máy điện, model, pin, giá 30 phút đầu, giá mỗi phút thêm, tiền cọc.
 * - Không dùng ảnh ô tô hay dữ liệu đánh giá giả.
 * - CTA: "Giữ xe 30 phút" (khi có onReserve) và "Xem chi tiết".
 */
export default function VehicleCard({ vehicle, stationName = null, onReserve = null }) {
  const vehicleId = vehicle?.id ? String(vehicle.id) : '';
  const canReserve = Boolean(onReserve && vehicleId && vehicle?.current_station_id);
  const modelText = vehicle?.model || 'Chưa cập nhật dòng xe';
  const nameText = vehicle?.name || 'Xe máy điện EVRide';
  const battery = getBatteryLevelInfo(vehicle?.battery_percent);

  const first30Price = formatMoneyDisplay(vehicle?.first_30_minutes_price);
  const extraMinPrice = formatMoneyDisplay(vehicle?.extra_minute_price);
  const depositAmount = formatMoneyDisplay(vehicle?.deposit_amount);

  return (
    <article className="customer-card vehicle-card">
      <div className="vehicle-card-visual">
        <ElectricScooterIllustration model={vehicle?.model} compact />
        <div className="vehicle-battery-pill">
          <StatusBadge label={`Pin ${battery.text}`} tone={battery.tone} />
        </div>
      </div>

      <div className="vehicle-card-body">
        <div className="vehicle-card-header">
          <div>
            <p className="vehicle-model-tag">{modelText}</p>
            <h3 className="customer-card-title">{nameText}</h3>
          </div>
        </div>

        {stationName && (
          <p className="vehicle-station-line">
            <span>Trạm hiện tại:</span> <strong>{stationName}</strong>
          </p>
        )}

        <div className="battery-meter-wrap" aria-label={`Mức pin ${battery.text}`}>
          <div className="battery-meter-track">
            <div
              className={`battery-meter-fill tone-${battery.tone}`}
              style={{ width: battery.percent !== null ? `${battery.percent}%` : '0%' }}
            />
          </div>
          <span className="battery-meter-caption">
            {battery.percent !== null ? `${battery.text} · ${battery.label}` : battery.text}
          </span>
        </div>

        <dl className="vehicle-pricing-list">
          <div className="vehicle-pricing-row">
            <dt>30 phút đầu</dt>
            <dd className="price-highlight">{first30Price}</dd>
          </div>
          <div className="vehicle-pricing-row">
            <dt>Mỗi phút thêm</dt>
            <dd>{extraMinPrice}</dd>
          </div>
          <div className="vehicle-pricing-row">
            <dt>Tiền cọc</dt>
            <dd>{depositAmount}</dd>
          </div>
        </dl>

        <div className="customer-card-actions">
          {canReserve && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onReserve(vehicle)}
            >
              Giữ xe 30 phút
            </Button>
          )}
          {vehicleId ? (
            <Link
              to={`/vehicles/${encodeURIComponent(vehicleId)}`}
              className={`btn btn-sm ${canReserve ? 'btn-secondary' : 'btn-primary vehicle-detail-cta'}`}
            >
              Xem chi tiết
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
