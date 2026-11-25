import React from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../ui/index.js';
import {
  formatCountDisplay,
  formatStationHours,
  getStationOpenStatus,
  getStationRentableCount,
  getStationReturnSpaceCount,
} from '../../utils/fleetDisplay.js';

/**
 * Thẻ hiển thị thông tin một trạm xe máy điện cho khách hàng.
 * - Hiển thị: tên trạm, địa chỉ, giờ hoạt động (24/7 hoặc qua đêm), xe có thể thuê, chỗ trả trống.
 * - CTA: "Xem xe" và "Xem chi tiết".
 */
export default function StationCard({ station }) {
  const openStatus = getStationOpenStatus(station);
  const hoursText = formatStationHours(station?.opens_at, station?.closes_at);
  const rentableCount = getStationRentableCount(station);
  const returnSpaceCount = getStationReturnSpaceCount(station);

  const stationName = station?.name || 'Trạm xe EVRide';
  const stationAddress = station?.address || 'Chưa cập nhật địa chỉ';
  const stationId = station?.id ? String(station.id) : '';

  return (
    <article className="customer-card station-card">
      <div className="station-card-header">
        <div className="station-card-heading">
          <h3 className="customer-card-title">{stationName}</h3>
          <p className="station-card-address">{stationAddress}</p>
        </div>
        <StatusBadge label={openStatus.label} tone={openStatus.tone} />
      </div>

      <div className="station-card-hours">
        <span className="customer-meta-label">Giờ hoạt động</span>
        <strong className="customer-meta-value">{hoursText}</strong>
      </div>

      <div className="station-metrics-grid">
        <div className="station-metric-box">
          <span className="customer-meta-label">Xe có thể thuê</span>
          <strong className={`station-metric-number ${rentableCount === 0 ? 'is-zero' : ''}`}>
            {formatCountDisplay(rentableCount, 'xe')}
          </strong>
        </div>
        <div className="station-metric-box">
          <span className="customer-meta-label">Chỗ trả trống</span>
          <strong className={`station-metric-number ${returnSpaceCount === 0 ? 'is-zero' : ''}`}>
            {formatCountDisplay(returnSpaceCount, 'chỗ')}
          </strong>
        </div>
      </div>

      <div className="customer-card-actions">
        {stationId ? (
          <>
            <Link to={`/vehicles?station_id=${encodeURIComponent(stationId)}`} className="btn btn-primary btn-sm">
              Xem xe
            </Link>
            <Link to={`/stations/${encodeURIComponent(stationId)}`} className="btn btn-secondary btn-sm">
              Xem chi tiết
            </Link>
          </>
        ) : null}
      </div>
    </article>
  );
}
