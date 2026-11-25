// Các hàm nghiệp vụ thuần túy cho luồng Giữ xe & Theo dõi chuyến thuê phía Khách hàng (#15).
// Tuân thủ chặt chẽ contract backend/app/api/v1/rentals.py, services/rentals.py & operations.py:
// - ID gửi trong RentalCreate / ReturnQuoteRequest bắt buộc là chuỗi số nguyên dương.
// - Đếm ngược giữ chỗ dựa trên expires_at đồng bộ server_time; khi về 0 chỉ đánh dấu cần tải lại từ máy chủ,
//   TUYỆT ĐỐI KHÔNG tự phán quyết trạng thái EXPIRED hay quyền nhận xe chỉ bằng đồng hồ trình duyệt.
// - TUYỆT ĐỐI KHÔNG tự tính tiền thuê chính thức bằng bộ đếm client.

import {
  addMoneyStrings,
  computeRemainingSeconds,
  formatCountdownMmSs,
  formatVnd,
} from './format.js';
import { getApiErrorMessage } from './errorMessages.js';
import { isPositiveIdString, isUncertainIdempotentOutcome } from './validation.js';

export const UNRESOLVED_RENTAL_STATUSES = new Set([
  'RESERVED',
  'IN_RENT',
  'RETURN_PENDING',
  'STOLEN',
  'INCIDENT_PENDING',
]);

export const INCIDENT_RENTAL_STATUSES = new Set([
  'STOLEN',
  'INCIDENT_PENDING',
  'CLOSED_INCIDENT',
]);

export const CUSTOMER_RENTAL_FILTER_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'RESERVED', label: 'Đang giữ chỗ' },
  { value: 'IN_RENT', label: 'Đang thuê xe' },
  { value: 'RETURN_PENDING', label: 'Chờ thanh toán trả xe' },
  { value: 'COMPLETED', label: 'Đã hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
  { value: 'EXPIRED', label: 'Hết hạn giữ chỗ' },
  { value: 'INCIDENT_PENDING', label: 'Đang xử lý sự cố' },
  { value: 'STOLEN', label: 'Đang xác minh mất xe' },
  { value: 'CLOSED_INCIDENT', label: 'Đã đóng theo hồ sơ sự cố' },
];

export function isUnresolvedRentalStatus(status) {
  return UNRESOLVED_RENTAL_STATUSES.has(String(status || '').toUpperCase());
}

export function isIncidentRentalStatus(status) {
  return INCIDENT_RENTAL_STATUSES.has(String(status || '').toUpperCase());
}

export function findUnresolvedRental(rentals = []) {
  if (!Array.isArray(rentals)) return null;
  return rentals.find((item) => item && isUnresolvedRentalStatus(item.status)) || null;
}

/**
 * Tính số dư ví tối thiểu cần có để đặt giữ xe: deposit_amount + first_30_minutes_price (bằng BigInt).
 */
export function computeUpfrontReservationRequirement(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') {
    return { totalRequired: null, formattedTotal: 'Chưa cập nhật' };
  }
  try {
    const sum = addMoneyStrings(
      vehicle.deposit_amount ?? '0.00',
      vehicle.first_30_minutes_price ?? '0.00'
    );
    return {
      totalRequired: sum,
      formattedTotal: formatVnd(sum),
    };
  } catch {
    return { totalRequired: null, formattedTotal: 'Chưa cập nhật' };
  }
}

/**
 * Tạo payload chuẩn cho POST /rentals (vehicle_id và pickup_station_id bắt buộc là string).
 */
export function buildCreateRentalPayload({ vehicleId, pickupStationId }) {
  const vId = String(vehicleId ?? '').trim();
  const sId = String(pickupStationId ?? '').trim();
  if (!isPositiveIdString(vId) || !isPositiveIdString(sId)) {
    throw new Error('Thông tin xe hoặc trạm nhận không hợp lệ.');
  }
  return {
    vehicle_id: vId,
    pickup_station_id: sId,
  };
}

/**
 * Tính trạng thái đếm ngược giữ chỗ (RESERVED) đồng bộ theo server_time:
 * - Khi remainingSeconds > 0: hiển thị MM:SS.
 * - Khi remainingSeconds === 0 mà bản ghi vẫn là RESERVED: đặt `needsServerRefresh = true`
 *   để giao diện gọi GET /rentals/{id} xác minh trạng thái thật trên máy chủ,
 *   tuyệt đối không tự đổi sang EXPIRED hay chặn quyền ở phía client.
 */
export function getReservationCountdownState(
  rental,
  { serverTimeIso = null, clientNowMs = Date.now() } = {}
) {
  if (!rental || rental.status !== 'RESERVED') {
    return {
      isActiveHold: false,
      remainingSeconds: 0,
      formattedCountdown: '00:00',
      needsServerRefresh: false,
    };
  }

  const remainingSeconds = computeRemainingSeconds(rental.expires_at, {
    serverTimeIso,
    clientNowMs,
  });

  return {
    isActiveHold: true,
    remainingSeconds,
    formattedCountdown: formatCountdownMmSs(remainingSeconds),
    needsServerRefresh: remainingSeconds <= 0,
  };
}

/**
 * Phân tích mã lỗi khi đặt giữ xe hoặc hủy giữ xe để đưa ra hướng dẫn và hành động cụ thể cho khách hàng.
 */
export function describeReservationError(error) {
  const code = error?.code || '';
  const message = getApiErrorMessage(error);
  const canRetrySameKey = isUncertainIdempotentOutcome(error);

  if (code === 'VERIFIED_CCCD_REQUIRED' || code === 'CUSTOMER_NOT_ELIGIBLE') {
    return {
      title: 'Chưa đủ điều kiện giấy tờ định danh',
      message,
      hint: 'Bạn cần có CCCD ở trạng thái Đã xác minh, còn hạn hiệu lực và đủ từ 16 tuổi.',
      actionLabel: 'Mở Hồ sơ & Giấy tờ',
      actionTo: '/profile',
      canRetrySameKey: false,
    };
  }

  if (code === 'ACTIVE_RENTAL_EXISTS') {
    return {
      title: 'Bạn đang có chuyến thuê hoặc lượt giữ chỗ chưa giải quyết',
      message,
      hint: 'Mỗi khách hàng chỉ có tối đa một chuyến đang hoạt động tại một thời điểm.',
      actionLabel: 'Xem chuyến của tôi',
      actionTo: '/rentals',
      canRetrySameKey: false,
    };
  }

  if (code === 'INSUFFICIENT_BALANCE' || code === 'WALLET_UNAVAILABLE' || code === 'WALLET_NOT_FOUND') {
    return {
      title: 'Ví chưa đủ điều kiện thanh toán đặt cọc & cước đầu',
      message,
      hint: 'Số dư ví (Tiền mô phỏng) cần đủ tổng tiền cọc và giá 30 phút đầu, đồng thời ví phải đang hoạt động.',
      actionLabel: 'Mở Ví Tiền mô phỏng',
      actionTo: '/wallet',
      canRetrySameKey: false,
    };
  }

  if (code === 'DAILY_CANCELLATION_LIMIT_REACHED') {
    return {
      title: 'Đã chạm hạn mức hủy / hết hạn trong ngày',
      message,
      hint: 'Hệ thống giới hạn tối đa 3 lần hủy hoặc để hết hạn giữ chỗ mỗi ngày theo giờ Việt Nam. Vui lòng quay lại vào ngày mai.',
      actionLabel: 'Xem lịch sử chuyến',
      actionTo: '/rentals',
      canRetrySameKey: false,
    };
  }

  if (
    code === 'VEHICLE_UNAVAILABLE' ||
    code === 'ACTIVE_MAINTENANCE_ORDER' ||
    code === 'INVALID_VEHICLE_STATE' ||
    (error?.status === 404 && code === 'NOT_FOUND')
  ) {
    return {
      title: 'Xe này vừa không còn sẵn sàng để giữ chỗ',
      message:
        error?.status === 404
          ? 'Xe vừa được khách khác đặt trước, tụt pin dưới 30% hoặc đang bảo trì.'
          : message,
      hint: 'Hãy chọn một xe máy điện khác đang sẵn sàng tại trạm.',
      actionLabel: 'Tìm xe khác',
      actionTo: '/vehicles',
      canRetrySameKey: false,
    };
  }

  if (code === 'STATION_UNAVAILABLE' || code === 'STATION_FULL' || code === 'STATION_CAPACITY_INCONSISTENT') {
    return {
      title: 'Trạm hiện không thể phục vụ giao dịch này',
      message,
      hint: 'Trạm có thể vừa đóng cửa hoặc hết chỗ trống. Vui lòng chọn một trạm khác đang mở cửa.',
      actionLabel: 'Xem danh sách trạm',
      actionTo: '/stations',
      canRetrySameKey: false,
    };
  }

  if (canRetrySameKey) {
    return {
      title: 'Chưa xác nhận được kết quả từ máy chủ',
      message,
      hint: 'Bạn có thể bấm thử lại ngay — hệ thống sẽ giữ nguyên khóa chống gửi trùng để không tạo hai lượt giữ xe.',
      actionLabel: null,
      actionTo: null,
      canRetrySameKey: true,
    };
  }

  return {
    title: 'Không thể hoàn tất yêu cầu giữ xe',
    message,
    hint: null,
    actionLabel: null,
    actionTo: null,
    canRetrySameKey: false,
  };
}

/**
 * Chuẩn hóa nhãn tiếng Việt thuần cho biên bản bàn giao / tiếp nhận & lý do hủy (không lộ enum).
 */
export function getHandoverKindLabel(kind) {
  if (kind === 'PICKUP') return 'Bàn giao nhận xe';
  if (kind === 'RETURN') return 'Tiếp nhận trả xe';
  return 'Biên bản trạm';
}

export function getVehicleConditionLabel(condition) {
  if (!condition) return null;
  if (condition === 'OK') return 'Tình trạng bình thường';
  if (condition === 'NEEDS_MAINTENANCE') return 'Cần kiểm tra bảo trì';
  return 'Đã ghi nhận tình trạng';
}

export function getCancellationReasonLabel(reason, exempt = false) {
  if (reason === 'CUSTOMER_CANCELLED') {
    return 'Khách hàng chủ động hủy trước khi nhận xe';
  }
  if (reason === 'VEHICLE_FAULT') {
    return exempt
      ? 'Hủy vận hành do kỹ thuật xe (không tính vào hạn mức hủy ngày)'
      : 'Hủy vận hành do kỹ thuật xe';
  }
  if (reason === 'SYSTEM_ERROR') {
    return exempt
      ? 'Hủy vận hành do sự cố hệ thống (không tính vào hạn mức hủy ngày)'
      : 'Hủy vận hành do sự cố hệ thống';
  }
  return reason ? 'Đã hủy lượt giữ chỗ' : 'Chưa ghi nhận';
}

/**
 * Đánh giá trạng thái hiển thị của dữ liệu GPS mô phỏng từ GET /rentals/{id}/gps/latest.
 * Không bao giờ mô tả tọa độ cũ là vị trí hiện tại!
 */
export function evaluateGpsStatus(latestGpsData) {
  if (!latestGpsData || !latestGpsData.point) {
    return {
      hasPoint: false,
      isStale: true,
      staleAfterSeconds: latestGpsData?.stale_after_seconds ?? 60,
      badgeLabel: 'Chưa có tọa độ',
      badgeTone: 'neutral',
      warningText:
        'Chuyến thuê hiện chưa có điểm định vị GPS mô phỏng nào được ghi nhận trên hệ thống.',
    };
  }

  const staleAfter = Number(latestGpsData.stale_after_seconds) || 60;
  const isStale = Boolean(latestGpsData.is_stale);

  if (isStale) {
    return {
      hasPoint: true,
      isStale: true,
      staleAfterSeconds: staleAfter,
      badgeLabel: 'Dữ liệu vị trí đã cũ',
      badgeTone: 'warning',
      warningText: `Tọa độ này được ghi nhận cách đây hơn ${staleAfter} giây — đây là vị trí ghi nhận lần cuối, không phải vị trí tức thời hiện tại.`,
    };
  }

  return {
    hasPoint: true,
    isStale: false,
    staleAfterSeconds: staleAfter,
    badgeLabel: 'Vừa cập nhật',
    badgeTone: 'success',
    warningText: null,
  };
}
