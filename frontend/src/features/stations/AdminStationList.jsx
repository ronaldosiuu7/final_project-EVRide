import React from 'react';
import { EmptyState } from '../../components/ui';

export default function AdminStationList() {
  return (
    <div>
      <div className="page-header">
        <h2>Danh sách trạm xe máy điện</h2>
      </div>
      <EmptyState
        title="Đang nâng cấp kết nối API thật"
        hint="Chức năng quản lý trạm sẽ được hoàn thiện ở gói việc tiếp theo."
      />
    </div>
  );
}
