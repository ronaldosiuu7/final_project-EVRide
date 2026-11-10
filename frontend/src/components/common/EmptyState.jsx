import React from 'react';

// Trạng thái rỗng luôn kèm hướng dẫn việc tiếp theo (đặc tả mục 6).
const EmptyState = ({ title = 'Chưa có dữ liệu', hint, action }) => (
  <div className="state-box state-empty">
    <p className="state-title">{title}</p>
    {hint && <p className="state-hint">{hint}</p>}
    {action}
  </div>
);

export default EmptyState;

