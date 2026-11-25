// Logic nghiệp vụ hồ sơ & điều kiện giấy tờ cho khách hàng EVRide (#15).
// Đối chiếu trực tiếp backend/app/api/v1/documents.py, schemas/document.py và services/rentals.py:
// - POST /users/me/documents BẮT BUỘC cả front_file_id và back_file_id (không tự giả định mặt sau tùy chọn).
// - Hồ sơ PENDING tuyệt đối KHÔNG được coi là VERIFIED / đủ điều kiện thuê.
// - Điều kiện thuê demo: có CCCD VERIFIED, chưa bị thu hồi (revoked_at == null),
//   còn hạn theo ngày Việt Nam (expires_on >= todayVN) và đủ 16 tuổi theo verified_birth_date.

import { getEstimatedServerNowMs } from './format.js';
import { isPositiveIdString } from './validation.js';

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'CCCD', label: 'Căn cước công dân (CCCD)' },
  { value: 'PASSPORT', label: 'Hộ chiếu' },
  { value: 'DRIVER_LICENSE', label: 'Giấy phép lái xe' },
];

export function getDocumentTypeLabel(docType) {
  const found = DOCUMENT_TYPE_OPTIONS.find((opt) => opt.value === docType);
  return found ? found.label : 'Giấy tờ định danh';
}

/**
 * Lấy ngày hiện tại theo múi giờ Việt Nam (YYYY-MM-DD).
 */
export function getTodayVietnamDateString(referenceNowMs = getEstimatedServerNowMs()) {
  const date = new Date(referenceNowMs);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseIsoDateParts(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(ISO_DATE_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Tính số tuổi nguyên tại ngày todayDateStr (YYYY-MM-DD). Trả về null nếu ngày sinh không hợp lệ.
 */
export function computeAgeAtDate(birthDateStr, todayDateStr) {
  const birth = parseIsoDateParts(birthDateStr);
  const today = parseIsoDateParts(todayDateStr);
  if (!birth || !today) return null;
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) {
    age -= 1;
  }
  return age;
}

/**
 * Kiểm tra giấy tờ đã hết hạn so với ngày hiện tại tại Việt Nam hay chưa.
 * Hợp lệ khi expires_on >= todayDateStr.
 */
export function isDocumentExpired(expiresOn, todayDateStr = getTodayVietnamDateString()) {
  if (!expiresOn || !ISO_DATE_PATTERN.test(String(expiresOn).trim())) return null;
  return String(expiresOn).trim() < todayDateStr;
}

/**
 * Đánh giá điều kiện thuê xe của khách hàng dựa trên danh sách giấy tờ từ GET /users/me/documents.
 * Tuyệt đối KHÔNG coi PENDING là VERIFIED!
 */
export function evaluateCustomerDocumentEligibility(
  documents = [],
  referenceNowMs = getEstimatedServerNowMs()
) {
  const list = Array.isArray(documents) ? documents : [];
  const todayVN = getTodayVietnamDateString(referenceNowMs);
  const cccdDocs = list.filter((doc) => doc && doc.document_type === 'CCCD');

  // 1. Tìm bản CCCD đã VERIFIED, chưa thu hồi, còn hạn và đủ 16 tuổi
  const validVerifiedCccd = cccdDocs.find((doc) => {
    if (doc.verified_status !== 'VERIFIED' || doc.revoked_at) return false;
    if (!doc.expires_on || isDocumentExpired(doc.expires_on, todayVN) !== false) return false;
    const age = computeAgeAtDate(doc.verified_birth_date, todayVN);
    return age !== null && age >= 16;
  });

  if (validVerifiedCccd) {
    return {
      eligible: true,
      tone: 'success',
      statusLabel: 'Đủ điều kiện thuê xe',
      title: 'Hồ sơ CCCD đã được xác minh hợp lệ',
      description:
        'Bạn đã đáp ứng điều kiện định danh (CCCD đã xác minh, còn hạn hiệu lực và đủ 16 tuổi theo giờ Việt Nam) để giữ và thuê xe máy điện.',
      matchedDocumentId: String(validVerifiedCccd.id),
    };
  }

  // 2. Có CCCD đang chờ duyệt (PENDING) — tuyệt đối KHÔNG báo đủ điều kiện!
  const pendingCccd = cccdDocs.find((doc) => doc.verified_status === 'PENDING' && !doc.revoked_at);
  if (pendingCccd) {
    return {
      eligible: false,
      tone: 'warning',
      statusLabel: 'Đang chờ xác minh',
      title: 'CCCD của bạn đang chờ nhân viên xác minh',
      description:
        'Hồ sơ đang ở trạng thái chờ duyệt nên chưa đủ điều kiện giữ xe. Bạn có thể đặt xe ngay sau khi nhân viên xác nhận CCCD hợp lệ.',
      matchedDocumentId: String(pendingCccd.id),
    };
  }

  // 3. Có CCCD đã VERIFIED nhưng hết hạn hoặc chưa đủ 16 tuổi hoặc bị thu hồi
  const verifiedCccd = cccdDocs.find((doc) => doc.verified_status === 'VERIFIED');
  if (verifiedCccd) {
    if (verifiedCccd.revoked_at) {
      return {
        eligible: false,
        tone: 'danger',
        statusLabel: 'Giấy tờ đã bị thu hồi',
        title: 'CCCD trước đó đã bị thu hồi',
        description: 'Vui lòng nộp lại bản CCCD mới đầy đủ ảnh mặt trước và mặt sau để được xác minh lại.',
        matchedDocumentId: String(verifiedCccd.id),
      };
    }
    if (!verifiedCccd.expires_on || isDocumentExpired(verifiedCccd.expires_on, todayVN) === true) {
      return {
        eligible: false,
        tone: 'danger',
        statusLabel: 'CCCD đã hết hạn',
        title: 'CCCD đã xác minh của bạn đã hết hạn hiệu lực',
        description: 'Vui lòng nộp bản CCCD mới còn hạn hiệu lực để tiếp tục thuê xe.',
        matchedDocumentId: String(verifiedCccd.id),
      };
    }
    const age = computeAgeAtDate(verifiedCccd.verified_birth_date, todayVN);
    if (age !== null && age < 16) {
      return {
        eligible: false,
        tone: 'danger',
        statusLabel: 'Chưa đủ 16 tuổi',
        title: 'Tài khoản chưa đủ độ tuổi quy định',
        description: 'Theo quy định dịch vụ EVRide, khách hàng cần đủ 16 tuổi trở lên theo ngày sinh trên CCCD đã xác minh.',
        matchedDocumentId: String(verifiedCccd.id),
      };
    }
  }

  // 4. Có CCCD bị từ chối
  const rejectedCccd = cccdDocs.find((doc) => doc.verified_status === 'REJECTED');
  if (rejectedCccd) {
    return {
      eligible: false,
      tone: 'danger',
      statusLabel: 'Cần nộp lại CCCD',
      title: 'Hồ sơ CCCD trước đó chưa được chấp nhận',
      description:
        'Hãy kiểm tra lại ảnh chụp rõ nét cả hai mặt, đúng số giấy tờ và nộp lại hồ sơ mới để nhân viên xác minh.',
      matchedDocumentId: String(rejectedCccd.id),
    };
  }

  // 5. Chưa nộp CCCD nào
  return {
    eligible: false,
    tone: 'neutral',
    statusLabel: 'Chưa xác minh CCCD',
    title: 'Bạn cần nộp CCCD để đủ điều kiện thuê xe',
    description:
      'Tải lên ảnh mặt trước và mặt sau CCCD còn hạn để nhân viên xác minh. Chỉ tài khoản có CCCD đã xác minh và đủ 16 tuổi mới có thể giữ xe.',
    matchedDocumentId: null,
  };
}

/**
 * Kiểm tra form nộp giấy tờ khớp schema CreateDocumentRequest của backend:
 * - document_type: CCCD | PASSPORT | DRIVER_LICENSE
 * - document_number: 1–50 ký tự sau trim
 * - front_file_id & back_file_id: CẢ HAI ĐỀU BẮT BUỘC
 */
export function validateDocumentSubmissionForm({
  documentType,
  documentNumber,
  frontFile,
  backFile,
  birthDate,
  expiresOn,
}) {
  const errors = {};
  const validTypes = new Set(['CCCD', 'PASSPORT', 'DRIVER_LICENSE']);
  if (!validTypes.has(documentType)) {
    errors.document_type = 'Vui lòng chọn loại giấy tờ hợp lệ.';
  }

  const trimmedNumber = String(documentNumber || '').trim();
  if (!trimmedNumber || trimmedNumber.length > 50) {
    errors.document_number = 'Số giấy tờ phải từ 1 đến 50 ký tự.';
  }

  if (!frontFile || !isPositiveIdString(frontFile.file_id)) {
    errors.front_file_id = 'Vui lòng tải lên ảnh mặt trước của giấy tờ.';
  }

  if (!backFile || !isPositiveIdString(backFile.file_id)) {
    errors.back_file_id = 'Vui lòng tải lên ảnh mặt sau của giấy tờ (bắt buộc).';
  }

  if (birthDate && !ISO_DATE_PATTERN.test(String(birthDate).trim())) {
    errors.birth_date = 'Ngày sinh không đúng định dạng.';
  }

  if (expiresOn && !ISO_DATE_PATTERN.test(String(expiresOn).trim())) {
    errors.expires_on = 'Ngày hết hạn không đúng định dạng.';
  }

  return errors;
}

/**
 * Tạo body gửi POST /users/me/documents đúng schema backend.
 */
export function buildCreateDocumentPayload({
  documentType,
  documentNumber,
  frontFile,
  backFile,
  birthDate,
  expiresOn,
}) {
  const payload = {
    document_type: documentType,
    document_number: String(documentNumber || '').trim(),
    front_file_id: String(frontFile.file_id),
    back_file_id: String(backFile.file_id),
  };
  if (birthDate && String(birthDate).trim()) {
    payload.birth_date = String(birthDate).trim();
  }
  if (expiresOn && String(expiresOn).trim()) {
    payload.expires_on = String(expiresOn).trim();
  }
  return payload;
}
