import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIdMap,
  getBillingCutoffReasonLabel,
  getIncidentActionLabel,
  getReportSourceLabel,
  getStationDisplayName,
  getUserDisplay,
  getVehicleDisplay,
} from '../src/utils/entityDisplay.js';
import { getApiErrorMessage, sanitizeUiMessage } from '../src/utils/errorMessages.js';

test('buildIdMap indexes items by stringified id safely', () => {
  const map = buildIdMap([
    { id: 101, name: 'Trạm Công viên Thống Nhất' },
    { id: '202', name: 'Trạm Hồ Gươm' },
    null,
    { name: 'Thiếu ID' },
  ]);

  assert.equal(map.size, 2);
  assert.equal(map.get('101')?.name, 'Trạm Công viên Thống Nhất');
  assert.equal(map.get('202')?.name, 'Trạm Hồ Gươm');
});

test('getUserDisplay shows user name with email and falls back cleanly', () => {
  const userMap = buildIdMap([
    { id: '990004', name: 'Nguyễn Minh Quân', email: 'quan@example.com' },
    { id: '990006', name: 'Lê Thu Hà' },
  ]);

  assert.deepEqual(getUserDisplay(userMap, 990004, 'Khách'), {
    primary: 'Nguyễn Minh Quân',
    secondary: 'quan@example.com',
  });
  assert.deepEqual(getUserDisplay(userMap, '990006', 'Nhân sự'), {
    primary: 'Lê Thu Hà',
    secondary: 'Mã #990006',
  });
  assert.deepEqual(getUserDisplay(userMap, '999999', 'Khách'), {
    primary: 'Khách #999999',
    secondary: null,
  });
  assert.deepEqual(getUserDisplay(userMap, null), {
    primary: '—',
    secondary: null,
  });
});

test('getVehicleDisplay and getStationDisplayName resolve friendly names', () => {
  const vehicleMap = buildIdMap([
    { id: '2', name: 'EV-002', model: 'VinFast Klara S' },
  ]);
  const stationMap = buildIdMap([
    { id: '5', name: 'Trạm Đại học Quốc Gia' },
  ]);

  assert.deepEqual(getVehicleDisplay(vehicleMap, 2), {
    primary: 'EV-002',
    secondary: 'VinFast Klara S · Mã #2',
  });
  assert.deepEqual(getVehicleDisplay(vehicleMap, 7, 'EV-007', 'Dat Bike Quantum S2'), {
    primary: 'EV-007',
    secondary: 'Dat Bike Quantum S2 · Mã #7',
  });
  assert.equal(getStationDisplayName(stationMap, 5), 'Trạm Đại học Quốc Gia');
  assert.equal(getStationDisplayName(stationMap, 99), 'Trạm #99');
  assert.equal(getStationDisplayName(stationMap, null), '—');
});

test('incident cutoff reasons, actions, and report sources translate to natural Vietnamese', () => {
  assert.equal(getBillingCutoffReasonLabel('VALID_REPORT'), 'Theo báo cáo hợp lệ');
  assert.equal(getBillingCutoffReasonLabel('FIELD_RECOVERY'), 'Theo thời điểm thu hồi ngoài hiện trường');
  assert.equal(getBillingCutoffReasonLabel(''), '—');

  assert.equal(getIncidentActionLabel('RENTAL_INCIDENT_VERIFIED'), 'Xác minh kết luận sự cố');
  assert.equal(getIncidentActionLabel('UNKNOWN_ACTION'), 'Cập nhật trạng thái hồ sơ');

  assert.equal(getReportSourceLabel('CUSTOMER'), 'Khách hàng báo');
  assert.equal(getReportSourceLabel('STAFF'), 'Nhân viên ghi nhận');
  assert.equal(getReportSourceLabel('SYSTEM'), 'Cảnh báo hệ thống');
});

test('sanitizeUiMessage and getApiErrorMessage humanize raw backend status enums', () => {
  assert.equal(
    sanitizeUiMessage('Lượt thuê không ở trạng thái IN_RENT.'),
    'Lượt thuê không ở trạng thái Đang thuê.'
  );
  assert.equal(
    sanitizeUiMessage('Chuyến đang ở trạng thái RETURN_PENDING, không thể chuyển sang RESERVED.'),
    'Chuyến đang ở trạng thái Chờ quyết toán, không thể chuyển sang Đang giữ chỗ.'
  );
  assert.equal(
    getApiErrorMessage({
      code: 'INVALID_RENTAL_STATE',
      message: 'Lượt thuê không ở trạng thái IN_RENT.',
    }),
    'Lượt thuê không ở trạng thái Đang thuê.'
  );
});
