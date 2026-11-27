// Các hàm định dạng tên hiển thị thân thiện (khách hàng, xe, trạm, nhân sự, sự kiện sự cố)
// để tránh hiển thị mã ID hoặc mã trạng thái kỹ thuật làm thông tin chính trên giao diện vận hành.

export function buildIdMap(items = []) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (item && item.id !== undefined && item.id !== null) {
      map.set(String(item.id), item);
    }
  }
  return map;
}

export function getUserDisplay(userMap, userId, fallbackPrefix = 'Tài khoản') {
  if (userId === null || userId === undefined || userId === '') {
    return { primary: '—', secondary: null };
  }
  const key = String(userId);
  const found = userMap instanceof Map ? userMap.get(key) : null;
  if (found?.name) {
    return {
      primary: found.name,
      secondary: found.email || `Mã #${key}`,
    };
  }
  return { primary: `${fallbackPrefix} #${key}`, secondary: null };
}

export function getVehicleDisplay(vehicleMap, vehicleId, fallbackName = null, fallbackModel = null) {
  if (vehicleId === null || vehicleId === undefined || vehicleId === '') {
    return { primary: fallbackName || 'Xe máy điện', secondary: fallbackModel || null };
  }
  const key = String(vehicleId);
  const found = vehicleMap instanceof Map ? vehicleMap.get(key) : null;
  const name = fallbackName || found?.name || null;
  const model = fallbackModel || found?.model || null;
  if (name) {
    return {
      primary: name,
      secondary: model ? `${model} · Mã #${key}` : `Mã xe #${key}`,
    };
  }
  return { primary: `Xe #${key}`, secondary: model || null };
}

export function getStationDisplayName(stationMap, stationId) {
  if (stationId === null || stationId === undefined || stationId === '') {
    return '—';
  }
  const key = String(stationId);
  const found = stationMap instanceof Map ? stationMap.get(key) : null;
  return found?.name || `Trạm #${key}`;
}

const BILLING_CUTOFF_REASON_LABELS = {
  VALID_REPORT: 'Theo báo cáo hợp lệ',
  LOSS_THEFT_REPORT: 'Theo báo cáo mất / trộm hợp lệ',
  FIELD_RECOVERY: 'Theo thời điểm thu hồi ngoài hiện trường',
  RECOVERY: 'Theo thời điểm thu hồi xe',
  STATION_ARRIVAL: 'Theo thời điểm tiếp nhận về trạm',
  RETURN_INITIATED: 'Theo thời điểm tiếp nhận trả xe',
};

export function getBillingCutoffReasonLabel(reason) {
  if (!reason) return '—';
  return BILLING_CUTOFF_REASON_LABELS[String(reason).toUpperCase()] || 'Theo mốc xác minh sự cố';
}

const INCIDENT_AUDIT_ACTION_LABELS = {
  RENTAL_INCIDENT_INTAKE: 'Tiếp nhận hồ sơ nghi mất / sự cố',
  RENTAL_INCIDENT_CREATED: 'Tạo hồ sơ sự cố',
  RENTAL_INCIDENT_EVIDENCE_ADDED: 'Thêm yêu cầu bằng chứng',
  RENTAL_INCIDENT_VERIFIED: 'Xác minh kết luận sự cố',
  RENTAL_INCIDENT_DISMISSED: 'Xác nhận báo nhầm',
  RENTAL_INCIDENT_RECOVERY_RECORDED: 'Ghi nhận thu hồi ngoài hiện trường',
  RENTAL_INCIDENT_ARRIVAL_RECORDED: 'Tiếp nhận xe về trạm',
  RENTAL_INCIDENT_VEHICLE_RELEASED: 'Giải phóng xe cho thuê lại',
  RENTAL_INCIDENT_RENT_SETTLED: 'Quyết toán tiền thuê sự cố',
  RENTAL_INCIDENT_DEPOSIT_REFUNDED: 'Hoàn tiền cọc dư về ví khách',
  RENTAL_INCIDENT_COMPENSATION_RECORDED: 'Ghi nhận kết quả bồi thường ngoài hệ thống',
  RENTAL_INCIDENT_CLOSED: 'Đóng hồ sơ sự cố',
};

export function getIncidentActionLabel(action) {
  if (!action) return 'Cập nhật hồ sơ';
  return INCIDENT_AUDIT_ACTION_LABELS[String(action).toUpperCase()] || 'Cập nhật trạng thái hồ sơ';
}

export function getReportSourceLabel(source) {
  if (source === 'CUSTOMER') return 'Khách hàng báo';
  if (source === 'STAFF') return 'Nhân viên ghi nhận';
  if (source === 'SYSTEM') return 'Cảnh báo hệ thống';
  return 'Ghi nhận trước đó';
}
