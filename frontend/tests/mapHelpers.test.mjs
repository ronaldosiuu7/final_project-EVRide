import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsPointUrl,
  calculateDistanceKm,
  calculatePathDistanceKm,
  escapeHtml,
  formatDistanceVi,
  getStationPinState,
  parseCoordinatePair,
  sortGpsPointsChronologically,
} from '../src/utils/mapHelpers.js';

test('parseCoordinatePair validates numeric and string coordinates strictly', () => {
  assert.deepEqual(parseCoordinatePair('21.028500', '105.854200'), {
    lat: 21.0285,
    lng: 105.8542,
  });
  assert.deepEqual(parseCoordinatePair(0, 0), { lat: 0, lng: 0 });
  assert.equal(parseCoordinatePair('', '105.85'), null);
  assert.equal(parseCoordinatePair(null, 105.85), null);
  assert.equal(parseCoordinatePair(95, 105.85), null);
  assert.equal(parseCoordinatePair(21.0, 200), null);
});

test('calculateDistanceKm and formatDistanceVi compute realistic Hanoi distances', () => {
  const hoGuom = { lat: 21.0285, lng: 105.8542 };
  const thongNhat = { lat: 21.0168, lng: 105.8473 };
  const km = calculateDistanceKm(hoGuom, thongNhat);

  assert.ok(km > 1.3 && km < 1.7, `Expected ~1.48 km, got ${km}`);
  assert.equal(formatDistanceVi(km), `${km.toFixed(1).replace('.', ',')} km`);
  assert.equal(formatDistanceVi(0.348), '350 m');
  assert.equal(formatDistanceVi(null), null);
});

test('sortGpsPointsChronologically and calculatePathDistanceKm order and sum trails', () => {
  const unsorted = [
    { id: 3, latitude: '21.030000', longitude: '105.856000', recorded_at: '2026-11-28T09:10:00+07:00' },
    { id: 1, latitude: '21.028000', longitude: '105.854000', recorded_at: '2026-11-28T09:00:00+07:00' },
    { id: 2, latitude: '21.029000', longitude: '105.855000', recorded_at: '2026-11-28T09:05:00+07:00' },
    { id: 4, latitude: 'invalid', longitude: '105.855000', recorded_at: '2026-11-28T09:15:00+07:00' },
  ];

  const sorted = sortGpsPointsChronologically(unsorted);
  assert.deepEqual(
    sorted.map((p) => p.id),
    [1, 2, 3]
  );

  const dist = calculatePathDistanceKm(unsorted);
  assert.ok(dist > 0.2 && dist < 0.5, `Expected ~0.3 km trail, got ${dist}`);
});

test('getStationPinState categorizes customer and admin station markers accurately', () => {
  const openWithBikes = {
    status: 'ACTIVE',
    is_open: true,
    available_vehicle_count: 5,
    available_spaces: 4,
    capacity: 10,
  };
  assert.equal(getStationPinState(openWithBikes, 'customer').tone, 'available');
  assert.equal(getStationPinState(openWithBikes, 'customer').badgeText, '5 xe');

  const returnOnly = {
    status: 'ACTIVE',
    is_open: true,
    available_vehicle_count: 0,
    available_spaces: 6,
    capacity: 10,
  };
  assert.equal(getStationPinState(returnOnly, 'customer').tone, 'return-only');
  assert.equal(getStationPinState(returnOnly, 'customer').badgeText, 'Trả (6)');

  const fullAdmin = {
    status: 'ACTIVE',
    available_vehicle_count: 10,
    available_spaces: 0,
    capacity: 10,
  };
  assert.equal(getStationPinState(fullAdmin, 'admin').tone, 'full');

  const nearFullAdmin = {
    status: 'ACTIVE',
    available_vehicle_count: 9,
    available_spaces: 1,
    capacity: 10,
  };
  assert.equal(getStationPinState(nearFullAdmin, 'admin').tone, 'return-only');
});

test('Google Maps URLs and HTML escaping work safely', () => {
  assert.equal(
    buildGoogleMapsDirectionsUrl('21.0285', '105.8542'),
    'https://www.google.com/maps/dir/?api=1&destination=21.0285,105.8542'
  );
  assert.equal(
    buildGoogleMapsPointUrl('21.0285', '105.8542'),
    'https://www.google.com/maps/search/?api=1&query=21.0285,105.8542'
  );
  assert.equal(buildGoogleMapsDirectionsUrl(null, null), null);
  assert.equal(escapeHtml('<script>"EV"</script>'), '&lt;script&gt;&quot;EV&quot;&lt;/script&gt;');
});
