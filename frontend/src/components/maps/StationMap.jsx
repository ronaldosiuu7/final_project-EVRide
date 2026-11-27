import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, StatusBadge } from '../ui/index.js';
import { loadLeaflet } from './loadLeaflet.js';
import {
  DEFAULT_MAP_CENTER,
  buildGoogleMapsDirectionsUrl,
  calculateDistanceKm,
  escapeHtml,
  formatDistanceVi,
  getStationPinState,
  parseCoordinatePair,
} from '../../utils/mapHelpers.js';
import {
  formatCountDisplay,
  formatStationHours,
  getStationOpenStatus,
  getStationRentableCount,
  getStationReturnSpaceCount,
} from '../../utils/fleetDisplay.js';

const TILE_OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
};

export default function StationMap({
  stations = [],
  mode = 'customer',
  singleStation = false,
  selectedStationId = null,
  onSelectStation = null,
  userLocation = null,
  onUserLocationChange = null,
  onEditStation = null,
  heightVariant = 'default',
  ariaLabel = 'Bản đồ vị trí các trạm xe máy điện EVRide',
}) {
  const containerRef = useRef(null);
  const leafletRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const userLayerRef = useRef(null);
  const onSelectRef = useRef(onSelectStation);
  onSelectRef.current = onSelectStation;

  const [mapReady, setMapReady] = useState(false);
  const [internalSelectedId, setInternalSelectedId] = useState(
    singleStation && stations[0]?.id ? String(stations[0].id) : null
  );
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState('');

  const effectiveSelectedId =
    selectedStationId !== null && selectedStationId !== undefined
      ? String(selectedStationId)
      : internalSelectedId;

  const mappableStations = useMemo(() => {
    const list = [];
    for (const st of Array.isArray(stations) ? stations : []) {
      const coords = parseCoordinatePair(st?.latitude, st?.longitude);
      if (coords) {
        list.push({ station: st, coords, id: String(st.id) });
      }
    }
    return list;
  }, [stations]);

  const selectedEntry = useMemo(() => {
    if (!mappableStations.length) return null;
    if (singleStation) return mappableStations[0];
    if (!effectiveSelectedId) return null;
    return mappableStations.find((item) => item.id === effectiveSelectedId) || null;
  }, [mappableStations, effectiveSelectedId, singleStation]);

  // Khởi tạo bản đồ Leaflet trên trình duyệt (lazy-load).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return undefined;

    let cancelled = false;
    let resizeObserver = null;

    loadLeaflet().then((L) => {
      if (cancelled || !L || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const initialCenter = mappableStations[0]?.coords || DEFAULT_MAP_CENTER;
      const map = L.map(containerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: singleStation ? 16 : 13,
        scrollWheelZoom: false,
        zoomControl: true,
      });

      L.tileLayer(TILE_OSM.url, {
        attribution: TILE_OSM.attribution,
        maxZoom: TILE_OSM.maxZoom,
      }).addTo(map);

      map.on('focus', () => map.scrollWheelZoom.enable());
      map.on('click', () => map.scrollWheelZoom.enable());
      map.on('mouseout', () => map.scrollWheelZoom.disable());

      markersLayerRef.current = L.layerGroup().addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (mapRef.current) mapRef.current.invalidateSize();
        });
        resizeObserver.observe(containerRef.current);
      }
    });

    return () => {
      cancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersLayerRef.current = null;
        userLayerRef.current = null;
      }
    };
  }, []);

  // Cập nhật ghim trạm.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!mapReady || !L || !map || !layer) return;

    layer.clearLayers();

    for (const item of mappableStations) {
      const pinState = getStationPinState(item.station, mode);
      const isSelected = singleStation || effectiveSelectedId === item.id;
      const safeBadge = escapeHtml(pinState.badgeText);
      const safeName = escapeHtml(item.station.name || 'Trạm xe EVRide');
      const safeStatus = escapeHtml(pinState.statusText);

      const icon = L.divIcon({
        className: 'ev-map-pin-wrapper',
        html: `<div class="ev-map-pin ev-map-pin--${pinState.tone}${isSelected ? ' is-selected' : ''}" role="button" tabindex="0" aria-label="${safeName}: ${safeStatus}">${safeBadge}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([item.coords.lat, item.coords.lng], {
        icon,
        zIndexOffset: isSelected ? 600 : 100,
      });

      marker.bindTooltip(`<strong>${safeName}</strong><br/>${safeStatus}`, {
        direction: 'top',
        offset: [0, -34],
        className: 'ev-map-tooltip',
      });

      marker.on('click', () => {
        setInternalSelectedId(item.id);
        onSelectRef.current?.(item.station);
      });

      marker.addTo(layer);
    }
  }, [mapReady, mappableStations, mode, effectiveSelectedId, singleStation]);

  // Căn khung bản đồ theo danh sách trạm đang hiển thị.
  const stationIdsSignature = useMemo(
    () => mappableStations.map((m) => `${m.id}:${m.coords.lat},${m.coords.lng}`).join('|'),
    [mappableStations]
  );

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map || !mappableStations.length) return;

    if (mappableStations.length === 1) {
      const only = mappableStations[0].coords;
      map.setView([only.lat, only.lng], singleStation ? 16 : 15, { animate: false });
    } else {
      const bounds = L.latLngBounds(mappableStations.map((m) => [m.coords.lat, m.coords.lng]));
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15, animate: false });
    }
  }, [mapReady, stationIdsSignature, singleStation]);

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Bay mượt tới trạm được chọn.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || singleStation || !selectedEntry) return;
    const targetZoom = Math.max(map.getZoom(), 14);
    map.panTo([selectedEntry.coords.lat, selectedEntry.coords.lng], {
      animate: !prefersReducedMotion(),
    });
    if (map.getZoom() < 14) {
      map.setZoom(targetZoom);
    }
  }, [mapReady, selectedEntry?.id, singleStation]);

  // Hiển thị vị trí người dùng.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = userLayerRef.current;
    if (!mapReady || !L || !layer) return;
    layer.clearLayers();
    const coords = userLocation ? parseCoordinatePair(userLocation.lat, userLocation.lng) : null;
    if (!coords) return;

    const icon = L.divIcon({
      className: 'ev-user-dot-wrapper',
      html: '<div class="ev-user-dot" aria-label="Vị trí hiện tại của bạn"></div>',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    L.marker([coords.lat, coords.lng], { icon, zIndexOffset: 700 })
      .bindTooltip('Vị trí của bạn', { direction: 'top', offset: [0, -10], className: 'ev-map-tooltip' })
      .addTo(layer);
  }, [mapReady, userLocation]);

  const handleFitAll = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mappableStations.length) return;
    const pts = mappableStations.map((m) => [m.coords.lat, m.coords.lng]);
    if (userLocation) {
      const u = parseCoordinatePair(userLocation.lat, userLocation.lng);
      if (u) pts.push([u.lat, u.lng]);
    }
    if (pts.length === 1) {
      map.setView(pts[0], 16, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(pts), { padding: [44, 44], maxZoom: 15, animate: true });
    }
  };

  const handleLocateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoMessage('Trình duyệt hiện tại không hỗ trợ định vị GPS.');
      return;
    }
    setLocating(true);
    setGeoMessage('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocating(false);
        onUserLocationChange?.(nextLoc);
        if (mapRef.current) {
          mapRef.current.setView([nextLoc.lat, nextLoc.lng], 14, { animate: true });
        }
      },
      (err) => {
        setLocating(false);
        if (err?.code === 1) {
          setGeoMessage('Bạn chưa cấp quyền vị trí cho trình duyệt. Bạn vẫn có thể tìm trạm theo khu vực hoặc địa chỉ.');
        } else {
          setGeoMessage('Không xác định được vị trí hiện tại. Vui lòng thử lại sau ít giây.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  if (mappableStations.length === 0) {
    return (
      <div className="ev-map-shell">
        <div className="ev-map-notice">
          Chưa có tọa độ trạm hợp lệ để hiển thị trên bản đồ.
        </div>
      </div>
    );
  }

  const selectedStation = selectedEntry?.station || null;
  const selectedDirectionsUrl = selectedStation
    ? buildGoogleMapsDirectionsUrl(selectedStation.latitude, selectedStation.longitude)
    : null;
  const selectedDistanceText =
    selectedStation && userLocation
      ? formatDistanceVi(
          calculateDistanceKm(userLocation, {
            lat: selectedStation.latitude,
            lng: selectedStation.longitude,
          })
        )
      : null;

  return (
    <div className="ev-map-shell">
      <div className="ev-map-toolbar">
        <div className="ev-map-legend" aria-label="Chú thích trạng thái trạm trên bản đồ">
          {mode === 'admin' ? (
            <>
              <span className="ev-map-legend-item">
                <span className="ev-map-legend-dot is-available" />
                <span>Hoạt động ổn định</span>
              </span>
              <span className="ev-map-legend-item">
                <span className="ev-map-legend-dot is-return-only" />
                <span>Sắp đầy (&le; 1 chỗ)</span>
              </span>
              <span className="ev-map-legend-item">
                <span className="ev-map-legend-dot is-full" />
                <span>Đã đầy chỗ đỗ</span>
              </span>
              <span className="ev-map-legend-item">
                <span className="ev-map-legend-dot is-unavailable" />
                <span>Ngừng hoạt động</span>
              </span>
            </>
          ) : (
            <>
              <span className="ev-map-legend-item">
                <span className="ev-map-legend-dot is-available" />
                <span>Có xe sẵn sàng</span>
              </span>
              <span className="ev-map-legend-item">
                <span className="ev-map-legend-dot is-return-only" />
                <span>Hết xe · Còn chỗ trả</span>
              </span>
              <span className="ev-map-legend-item">
                <span className="ev-map-legend-dot is-unavailable" />
                <span>Ngoài giờ / Hết chỗ</span>
              </span>
              {userLocation && (
                <span className="ev-map-legend-item">
                  <span className="ev-map-legend-dot is-user" />
                  <span>Vị trí của bạn</span>
                </span>
              )}
            </>
          )}
        </div>

        <div className="ev-map-actions">
          {mode === 'customer' && !singleStation && (
            <Button size="sm" variant="secondary" loading={locating} onClick={handleLocateMe}>
              Vị trí của tôi
            </Button>
          )}
          {!singleStation && mappableStations.length > 1 && (
            <Button size="sm" variant="ghost" onClick={handleFitAll}>
              Xem toàn bộ ({mappableStations.length} trạm)
            </Button>
          )}
          {singleStation && selectedDirectionsUrl && (
            <a
              href={selectedDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-primary"
            >
              Chỉ đường Google Maps
            </a>
          )}
        </div>
      </div>

      {geoMessage && (
        <div className="ev-map-notice is-warning" role="status">
          {geoMessage}
        </div>
      )}

      <div
        className={`ev-map-viewport${heightVariant === 'compact' ? ' is-compact' : ''}`}
        role="region"
        aria-label={ariaLabel}
      >
        {!mapReady && (
          <div className="ev-map-loading-overlay" role="status">
            Đang tải bản đồ...
          </div>
        )}
        <div ref={containerRef} className="ev-map-canvas" />
        {mapReady && !singleStation && (
          <div className="ev-map-hint-pill" aria-hidden="true">
            Nhấn vào bản đồ để thu phóng · Chọn ghim xem chi tiết
          </div>
        )}
      </div>

      {!singleStation && selectedStation && (
        <div className="ev-map-selected-card" role="status" aria-live="polite">
          <div className="ev-map-selected-info">
            <div className="ev-map-selected-title-row">
              <h3 className="ev-map-selected-title">{selectedStation.name}</h3>
              {mode === 'admin' ? (
                <StatusBadge domain="stationStatus" value={selectedStation.status} />
              ) : (
                <StatusBadge
                  label={getStationOpenStatus(selectedStation).label}
                  tone={getStationOpenStatus(selectedStation).tone}
                />
              )}
              {selectedDistanceText && (
                <StatusBadge label={`Cách ${selectedDistanceText}`} tone="info" />
              )}
            </div>
            <div className="ev-map-selected-meta">
              <span>{selectedStation.address || 'Chưa cập nhật địa chỉ'}</span>
              <span>· Giờ mở cửa: {formatStationHours(selectedStation.opens_at, selectedStation.closes_at)}</span>
            </div>
            <div className="ev-map-selected-metrics">
              <span>
                Xe sẵn sàng:{' '}
                <strong>{formatCountDisplay(getStationRentableCount(selectedStation), 'xe')}</strong>
              </span>
              <span>
                Chỗ trả trống:{' '}
                <strong>{formatCountDisplay(getStationReturnSpaceCount(selectedStation), 'chỗ')}</strong>
              </span>
            </div>
          </div>

          <div className="ev-map-selected-actions">
            {mode === 'admin' ? (
              <>
                <Link
                  to={`/admin/vehicles?station_id=${encodeURIComponent(String(selectedStation.id))}`}
                  className="btn btn-sm btn-primary"
                >
                  Xem xe tại trạm
                </Link>
                {onEditStation && (
                  <Button size="sm" variant="secondary" onClick={() => onEditStation(selectedStation)}>
                    Sửa trạm
                  </Button>
                )}
              </>
            ) : (
              <>
                <Link
                  to={`/stations/${encodeURIComponent(String(selectedStation.id))}`}
                  className="btn btn-sm btn-primary"
                >
                  Xem xe &amp; Đặt giữ chỗ
                </Link>
                {selectedDirectionsUrl && (
                  <a
                    href={selectedDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-secondary"
                  >
                    Chỉ đường
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
