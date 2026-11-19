import React from 'react';
import { EmptyState } from '../../components/ui';

export default function AdminVehicleList() {
  return (
    <div>
      <div className="page-header">
        <h2>Danh sách xe máy điện</h2>
      </div>
      <EmptyState
        title="Đang nâng cấp kết nối API thật"
        hint="Chức năng quản lý xe máy điện sẽ được hoàn thiện ở gói việc tiếp theo."
      />
    </div>
  );
}
