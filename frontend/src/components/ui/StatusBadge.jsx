import React from 'react';
import { getStatusMeta } from '../../utils/statusConfig';

/**
 * Huy hiệu trạng thái dùng chung: luôn có dấu chấm chỉ báo + chữ rõ ràng.
 */
export default function StatusBadge({ value, domain, label, tone }) {
  const meta = getStatusMeta(domain, value);
  const finalLabel = label || meta.label;
  const finalTone = tone || meta.tone || 'neutral';

  return (
    <span className={`badge badge-${finalTone}`}>
      <span className="badge-dot" aria-hidden="true" />
      <span>{finalLabel}</span>
    </span>
  );
}
