import {
  getStationOpenStatus,
  getStationRentableCount,
  getStationReturnSpaceCount,
} from './fleetDisplay.js';

// Trung tâm mặc định (Hà Nội) dùng khi chưa có tọa độ nào hợp lệ để khởi tạo khung bản đồ.
export const DEFAULT_MAP_CENTER = { lat: 21.0285, lng: 105.8542 };

export function parseCoordinatePair(latitude, longitude) {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return null;
  }
  const latStr = String(latitude).trim();
  const lngStr = String(longitude).trim();
  if (!latStr || !lngStr) return null;

  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function calculateDistanceKm(from, to) {
  if (!from || !to) return null;
  const a = parseCoordinatePair(from.lat, from.lng);
  const b = parseCoordinatePair(to.lat, to.lng);
  if (!a || !b) return null;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceVi(distanceKm) {
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) {
    return null;
  }
  if (distanceKm < 1) {
    const meters = Math.max(10, Math.round((distanceKm * 1000) / 10) * 10);
    return `${meters} m`;
  }
  return `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

export function sortGpsPointsChronologically(points = []) {
  if (!Array.isArray(points)) return [];
  const valid = [];
  for (const pt of points) {
    if (!pt) continue;
    const coords = parseCoordinatePair(pt.latitude, pt.longitude);
    if (!coords) continue;
    valid.push({ ...pt, _coords: coords });
  }
  return valid.sort((a, b) => {
    const tA = a.recorded_at ? Date.parse(a.recorded_at) : 0;
    const tB = b.recorded_at ? Date.parse(b.recorded_at) : 0;
    if (Number.isFinite(tA) && Number.isFinite(tB) && tA !== tB) {
      return tA - tB;
    }
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

export function calculatePathDistanceKm(points = []) {
  const ordered = sortGpsPointsChronologically(points);
  if (ordered.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const seg = calculateDistanceKm(ordered[i - 1]._coords, ordered[i]._coords);
    if (seg !== null) total += seg;
  }
  return total;
}

export function getStationPinState(station, mode = 'customer') {
  if (!station) {
    return { tone: 'unavailable', badgeText: '—', statusText: 'Không xác định' };
  }

  const rentable = getStationRentableCount(station);
  const returnSpaces = getStationReturnSpaceCount(station);
  const capacity = station.capacity !== undefined && station.capacity !== null ? Number(station.capacity) : null;

  if (mode === 'admin') {
    if (station.status && station.status !== 'ACTIVE') {
      return { tone: 'unavailable', badgeText: 'Tạm ngưng', statusText: 'Ngừng hoạt động' };
    }
    if (returnSpaces !== null && returnSpaces <= 0) {
      return { tone: 'full', badgeText: 'Đầy chỗ', statusText: 'Đã đầy chỗ đỗ' };
    }
    if (returnSpaces !== null && returnSpaces <= 1) {
      return {
        tone: 'return-only',
        badgeText: capacity !== null ? `Trống ${returnSpaces}/${capacity}` : `Trống ${returnSpaces}`,
        statusText: 'Sắp đầy chỗ đỗ',
      };
    }
    return {
      tone: 'available',
      badgeText: `${rentable ?? 0} xe · Trống ${returnSpaces ?? '—'}`,
      statusText: 'Hoạt động ổn định',
    };
  }

  const openStatus = getStationOpenStatus(station);
  if (openStatus.isOpen === false) {
    return { tone: 'unavailable', badgeText: 'Ngoài giờ', statusText: openStatus.label };
  }
  if (rentable !== null && rentable > 0) {
    return { tone: 'available', badgeText: `${rentable} xe`, statusText: `Có ${rentable} xe sẵn sàng` };
  }
  if (returnSpaces !== null && returnSpaces > 0) {
    return { tone: 'return-only', badgeText: `Trả (${returnSpaces})`, statusText: `Hết xe · Còn ${returnSpaces} chỗ trả` };
  }
  return { tone: 'unavailable', badgeText: 'Hết xe', statusText: 'Tạm hết xe & chỗ trả' };
}

export function buildGoogleMapsDirectionsUrl(latitude, longitude) {
  const coords = parseCoordinatePair(latitude, longitude);
  if (!coords) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
}

export function buildGoogleMapsPointUrl(latitude, longitude) {
  const coords = parseCoordinatePair(latitude, longitude);
  if (!coords) return null;
  return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
