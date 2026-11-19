import React from 'react';
import { EmptyState } from '../../components/ui';

export default function AdminDashboard() {
  return (
    <div>
      <div className="page-header">
        <h2>Tổng quan vận hành</h2>
      </div>
      <EmptyState
        title="Đang nâng cấp kết nối API thật"
        hint="Màn hình Tổng quan & Báo cáo sẽ được hoàn thiện ở gói việc tiếp theo."
      />
    </div>
  );
}
