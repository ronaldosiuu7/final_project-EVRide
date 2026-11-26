import React from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../ui/index.js';
import { ClockIcon, MapPinIcon } from './CustomerIcons.jsx';
import {
  formatCountDisplay,
  formatStationHours,
  getStationCapacityCount,
  getStationOpenStatus,
  getStationRentableCount,
  getStationReturnSpaceCount,
} from '../../utils/fleetDisplay.js';

/**
 * Khung xương tải danh sách trạm (giữ ổn định bố cục desktop, không gây nhảy chiều cao).
 */
export function StationGridSkeleton({ count = 6, label = 'Đang tải danh sách trạm...' }) {
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      <div className="customer-card-grid">
        {Array.from({ length: count }, (_, idx) => (
          <div key={idx} className="customer-skeleton-card" aria-hidden="true">
            <div className="customer-skeleton-line is-title" />
            <div className="customer-skeleton-line is-sub" />
            <div className="customer-skeleton-line is-short" />
            <div className="customer-skeleton-metrics">
              <div className="customer-skeleton-line" />
              <div className="customer-skeleton-line" />
            </div>
            <div className="customer-skeleton-btn-row">
              <div className="customer-skeleton-btn" />
              <div className="customer-skeleton-btn" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const capacityCount = getStationCapacityCount(station);

  const stationName = station?.name || 'Trạm xe EVRide';
  const stationAddress = station?.address || 'Chưa cập nhật địa chỉ';
  const stationId = station?.id ? String(station.id) : '';

  return (
    <article className="customer-card station-card">
      <div className="station-card-header">
        <div className="station-card-heading">
          <h3 className="customer-card-title">
            {stationId ? (
              <Link
                to={`/stations/${encodeURIComponent(stationId)}`}
                className="customer-card-title-link"
              >
                {stationName}
              </Link>
            ) : (
              stationName
            )}
          </h3>
        </div>
        <StatusBadge label={openStatus.label} tone={openStatus.tone} />
      </div>

      <div className="station-card-meta-list">
        <p className="station-card-address">
          <MapPinIcon size={16} className="station-meta-icon" />
          <span>{stationAddress}</span>
        </p>
        <p className="station-card-hours-line">
          <ClockIcon size={16} className="station-meta-icon" />
          <span>
            Giờ hoạt động: <strong>{hoursText}</strong>
            {capacityCount !== null ? ` · Sức chứa ${capacityCount} xe` : ''}
          </span>
        </p>
      </div>

      <div className="station-metrics-grid">
        <div className="station-metric-box">
          <span className="customer-meta-label">Xe có thể thuê</span>
          <strong
            className={`station-metric-number ${
              rentableCount === 0 || rentableCount === null ? 'is-zero' : ''
            }`}
          >
            {formatCountDisplay(rentableCount, 'xe')}
          </strong>
        </div>
        <div className="station-metric-box">
          <span className="customer-meta-label">Chỗ trả trống</span>
          <strong
            className={`station-metric-number ${
              returnSpaceCount === 0 || returnSpaceCount === null ? 'is-zero' : ''
            }`}
          >
            {formatCountDisplay(returnSpaceCount, 'chỗ')}
          </strong>
        </div>
      </div>

      <div className="customer-card-actions">
        {stationId ? (
          <>
            <Link
              to={`/vehicles?station_id=${encodeURIComponent(stationId)}`}
              className="btn btn-primary btn-sm"
            >
              Xem xe
            </Link>
            <Link
              to={`/stations/${encodeURIComponent(stationId)}`}
              className="btn btn-secondary btn-sm"
            >
              Xem chi tiết
            </Link>
          </>
        ) : null}
      </div>
    </article>
  );
}
