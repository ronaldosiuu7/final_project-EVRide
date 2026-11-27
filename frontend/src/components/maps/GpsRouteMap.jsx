import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/index.js';
import { loadLeaflet } from './loadLeaflet.js';
import { formatDateTimeVN } from '../../utils/format.js';
import {
  DEFAULT_MAP_CENTER,
  buildGoogleMapsPointUrl,
  calculatePathDistanceKm,
  escapeHtml,
  formatDistanceVi,
  parseCoordinatePair,
  sortGpsPointsChronologically,
} from '../../utils/mapHelpers.js';

const TILE_OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
};

export default function GpsRouteMap({
  latestPoint = null,
  isStale = false,
  historyPoints = [],
  pickupStation = null,
  returnStation = null,
  selectedPointId = null,
  onSelectPoint = null,
}) {
  const containerRef = useRef(null);
  const leafletRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const onSelectPointRef = useRef(onSelectPoint);
  onSelectPointRef.current = onSelectPoint;

  const [mapReady, setMapReady] = useState(false);

  const orderedPoints = useMemo(() => {
    const merged = Array.isArray(historyPoints) ? [...historyPoints] : [];
    if (latestPoint && parseCoordinatePair(latestPoint.latitude, latestPoint.longitude)) {
      const exists = merged.some((p) => String(p.id) === String(latestPoint.id));
      if (!exists) merged.push(latestPoint);
    }
    return sortGpsPointsChronologically(merged);
  }, [historyPoints, latestPoint]);

  const pathDistanceKm = useMemo(() => calculatePathDistanceKm(orderedPoints), [orderedPoints]);

  const pickupCoords = useMemo(
    () => (pickupStation ? parseCoordinatePair(pickupStation.latitude, pickupStation.longitude) : null),
    [pickupStation]
  );
  const returnCoords = useMemo(
    () => (returnStation ? parseCoordinatePair(returnStation.latitude, returnStation.longitude) : null),
    [returnStation]
  );

  const effectiveLatest = useMemo(() => {
    if (latestPoint && parseCoordinatePair(latestPoint.latitude, latestPoint.longitude)) {
      return {
        ...latestPoint,
        _coords: parseCoordinatePair(latestPoint.latitude, latestPoint.longitude),
      };
    }
    return orderedPoints.length > 0 ? orderedPoints[orderedPoints.length - 1] : null;
  }, [latestPoint, orderedPoints]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return undefined;

    let cancelled = false;
    let resizeObserver = null;

    loadLeaflet().then((L) => {
      if (cancelled || !L || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const startCenter = effectiveLatest?._coords || pickupCoords || DEFAULT_MAP_CENTER;
      const map = L.map(containerRef.current, {
        center: [startCenter.lat, startCenter.lng],
        zoom: 14,
        scrollWheelZoom: false,
        zoomControl: true,
      });

      L.tileLayer(TILE_OSM.url, {
        attribution: TILE_OSM.attribution,
        maxZoom: TILE_OSM.maxZoom,
      }).addTo(map);

      map.on('click', () => map.scrollWheelZoom.enable());
      map.on('mouseout', () => map.scrollWheelZoom.disable());

      routeLayerRef.current = L.layerGroup().addTo(map);
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
        routeLayerRef.current = null;
      }
    };
  }, []);

  const drawAllBounds = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const pts = orderedPoints.map((p) => [p._coords.lat, p._coords.lng]);
    if (pickupCoords) pts.push([pickupCoords.lat, pickupCoords.lng]);
    if (returnCoords) pts.push([returnCoords.lat, returnCoords.lng]);

    if (pts.length === 1) {
      map.setView(pts[0], 15, { animate: true });
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16, animate: true });
    }
  };

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!mapReady || !L || !map || !layer) return;

    layer.clearLayers();

    if (pickupCoords && pickupStation) {
      const icon = L.divIcon({
        className: 'ev-map-pin-wrapper',
        html: '<div class="ev-map-pin ev-map-pin--available">Trạm nhận</div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([pickupCoords.lat, pickupCoords.lng], { icon, zIndexOffset: 200 })
        .bindTooltip(`Trạm nhận: ${escapeHtml(pickupStation.name)}`, {
          direction: 'top',
          offset: [0, -32],
          className: 'ev-map-tooltip',
        })
        .addTo(layer);
    }

    if (returnCoords && returnStation && String(returnStation.id) !== String(pickupStation?.id)) {
      const icon = L.divIcon({
        className: 'ev-map-pin-wrapper',
        html: '<div class="ev-map-pin ev-map-pin--return-only">Trạm trả</div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([returnCoords.lat, returnCoords.lng], { icon, zIndexOffset: 200 })
        .bindTooltip(`Trạm trả: ${escapeHtml(returnStation.name)}`, {
          direction: 'top',
          offset: [0, -32],
          className: 'ev-map-tooltip',
        })
        .addTo(layer);
    }

    if (orderedPoints.length >= 2) {
      const latLngs = orderedPoints.map((p) => [p._coords.lat, p._coords.lng]);
      L.polyline(latLngs, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(layer);
      L.polyline(latLngs, {
        color: isStale ? '#d97706' : '#0f766e',
        weight: 4,
        opacity: 0.95,
        dashArray: isStale ? '6 6' : undefined,
      }).addTo(layer);
    }

    orderedPoints.forEach((pt, idx) => {
      const isFirst = idx === 0 && orderedPoints.length > 1;
      const isLast =
        effectiveLatest && String(pt.id) === String(effectiveLatest.id)
          ? true
          : idx === orderedPoints.length - 1;
      const isSelected = selectedPointId !== null && String(selectedPointId) === String(pt.id);
      const timeLabel = formatDateTimeVN(pt.recorded_at, { withSeconds: true });
      const tooltipHtml = `<strong>${isLast ? 'Vị trí gần nhất' : isFirst ? 'Điểm bắt đầu' : `Điểm GPS #${idx + 1}`}</strong><br/>${escapeHtml(timeLabel)}<br/>${pt._coords.lat.toFixed(6)}, ${pt._coords.lng.toFixed(6)}`;

      if (isLast) {
        const icon = L.divIcon({
          className: 'ev-gps-dot-wrapper',
          html: `<div class="ev-gps-latest-dot${isStale ? ' is-stale' : ''}" aria-label="Vị trí GPS gần nhất"></div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        L.marker([pt._coords.lat, pt._coords.lng], { icon, zIndexOffset: 700 })
          .bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -14], className: 'ev-map-tooltip' })
          .on('click', () => onSelectPointRef.current?.(pt))
          .addTo(layer);
      } else if (isFirst) {
        const icon = L.divIcon({
          className: 'ev-gps-dot-wrapper',
          html: '<div class="ev-gps-start-dot" aria-label="Điểm GPS đầu tiên"></div>',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        L.marker([pt._coords.lat, pt._coords.lng], { icon, zIndexOffset: 500 })
          .bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -10], className: 'ev-map-tooltip' })
          .on('click', () => onSelectPointRef.current?.(pt))
          .addTo(layer);
      } else {
        L.circleMarker([pt._coords.lat, pt._coords.lng], {
          radius: isSelected ? 7 : 5,
          color: '#ffffff',
          weight: 2,
          fillColor: isSelected ? '#0f172a' : '#0f766e',
          fillOpacity: 1,
        })
          .bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -8], className: 'ev-map-tooltip' })
          .on('click', () => onSelectPointRef.current?.(pt))
          .addTo(layer);
      }
    });
  }, [mapReady, orderedPoints, effectiveLatest, isStale, pickupCoords, returnCoords, pickupStation, returnStation, selectedPointId]);

  const routeSig = useMemo(
    () =>
      `${orderedPoints.map((p) => p.id).join(',')}|${pickupStation?.id || ''}|${returnStation?.id || ''}`,
    [orderedPoints, pickupStation?.id, returnStation?.id]
  );

  useEffect(() => {
    if (mapReady) drawAllBounds();
  }, [mapReady, routeSig]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !selectedPointId) return;
    const found = orderedPoints.find((p) => String(p.id) === String(selectedPointId));
    if (found) {
      map.panTo([found._coords.lat, found._coords.lng], { animate: true });
      if (map.getZoom() < 15) map.setZoom(15);
    }
  }, [mapReady, selectedPointId, orderedPoints]);

  const latestMapsUrl = effectiveLatest
    ? buildGoogleMapsPointUrl(effectiveLatest._coords.lat, effectiveLatest._coords.lng)
    : null;
  const hasAnyGeo = orderedPoints.length > 0 || Boolean(pickupCoords) || Boolean(returnCoords);

  if (!hasAnyGeo) {
    return (
      <div className="ev-map-shell">
        <div className="ev-map-notice">
          Chưa có tọa độ GPS hoặc tọa độ trạm để hiển thị bản đồ lộ trình.
        </div>
      </div>
    );
  }

  return (
    <div className="ev-map-shell">
      <div className="ev-map-toolbar">
        <div className="ev-map-legend">
          <span className="ev-map-legend-item">
            <span className={`ev-map-legend-dot ${isStale ? 'is-return-only' : 'is-available'}`} />
            <span>{isStale ? 'Vị trí gần nhất (tín hiệu cũ)' : 'Vị trí gần nhất'}</span>
          </span>
          {orderedPoints.length > 0 && (
            <span className="ev-map-legend-item">
              <span>
                <strong>{orderedPoints.length}</strong> điểm GPS
                {orderedPoints.length >= 2 ? ` · Quãng đường ước tính: ${formatDistanceVi(pathDistanceKm)}` : ''}
              </span>
            </span>
          )}
        </div>

        <div className="ev-map-actions">
          <Button size="sm" variant="ghost" onClick={drawAllBounds}>
            Thu gọn toàn lộ trình
          </Button>
          {latestMapsUrl && (
            <a
              href={latestMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-secondary"
            >
              Mở Google Maps
            </a>
          )}
        </div>
      </div>

      <div
        className="ev-map-viewport is-gps"
        role="region"
        aria-label="Bản đồ định vị và lộ trình GPS của chuyến thuê"
      >
        {!mapReady && (
          <div className="ev-map-loading-overlay" role="status">
            Đang tải bản đồ lộ trình GPS...
          </div>
        )}
        <div ref={containerRef} className="ev-map-canvas" />
      </div>
    </div>
  );
}
