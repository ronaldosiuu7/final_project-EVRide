import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, StatusBadge, Tabs } from '../../components/ui';

const MODULE_INFO = {
  utilization: {
    title: 'Mức sử dụng trạm & Giờ cao điểm',
    description:
      'Bản đồ nhiệt lượt thuê theo từng trạm trong 24 giờ và thống kê thời gian xe chờ trung bình tại trạm sẽ tự động hiển thị ngay khi nguồn dữ liệu phân tích trực tiếp được kết nối.',
    nextSteps: [
      'Theo dõi số chỗ trống và số xe sẵn sàng hiện tại của từng trạm trong mục Trạm xe máy điện.',
      'Xem tổng hợp doanh thu và số chuyến thực tế theo tháng trong mục Báo cáo doanh thu.',
    ],
  },
  routes: {
    title: 'Tuyến di chuyển phổ biến theo tháng',
    description:
      'Bảng xếp hạng các cặp trạm nhận – trả xe được sử dụng nhiều nhất mỗi tháng hiện đang chờ kết nối nguồn dữ liệu thống kê trực tiếp từ hệ thống.',
    nextSteps: [
      'Tra cứu trạm nhận và trạm trả thực tế của từng chuyến trong mục Lượt giữ & chuyến thuê.',
      'Kiểm tra các trạm sắp đầy chỗ đỗ trên màn hình Tổng quan vận hành để điều chuyển xe kịp thời.',
    ],
  },
  inactive: {
    title: 'Nhóm khách hàng chưa phát sinh chuyến gần đây',
    description:
      'Danh sách khách hàng đang hoạt động có số dư ví nhưng chưa phát sinh chuyến đi trong 14–90 ngày hiện chưa kết nối dữ liệu tổng hợp trực tiếp.',
    nextSteps: [
      'Tra cứu tài khoản khách hàng và kiểm tra lịch sử chuyến thuê trong mục Tài khoản.',
      'Theo dõi kết quả doanh thu thực tế theo kỳ trong mục Báo cáo doanh thu.',
    ],
  },
  overview: {
    title: 'Chỉ số tổng quan mở rộng theo kỳ',
    description:
      'Các chỉ số tổng hợp nâng cao (thời lượng chuyến trung bình, số khách duy nhất theo kỳ) hiện đang chờ kết nối nguồn dữ liệu trực tiếp để đảm bảo tính chính xác tuyệt đối.',
    nextSteps: [
      'Sử dụng màn hình Tổng quan vận hành để theo dõi đội xe, trạm, kiểm tra 24 giờ và tổng hợp tài chính hiện tại.',
      'Mở Báo cáo doanh thu để xem số liệu doanh thu và chi tiết từng hóa đơn đã quyết toán.',
    ],
  },
};

export default function OperationalAnalyticsPage() {
  const [activeTab, setActiveTab] = useState('utilization');
  const current = MODULE_INFO[activeTab] || MODULE_INFO.utilization;

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <h2>Phân tích vận hành mở rộng</h2>
          <p className="muted">
            Khu vực chuyên sâu dành cho biểu đồ giờ cao điểm, tuyến phổ biến, thời gian xe chờ tại trạm và phân nhóm khách hàng.
          </p>
        </div>
        <div className="page-header-actions">
          <Link to="/admin" className="btn">
            Về tổng quan vận hành
          </Link>
          <Link to="/admin/reports" className="btn btn-primary">
            Xem báo cáo doanh thu
          </Link>
        </div>
      </div>

      <div className="alert alert-info" role="status">
        <strong>Trạng thái dữ liệu:</strong> Các báo cáo phân tích mở rộng dưới đây hiện chưa được kết nối nguồn dữ liệu trực tiếp nên hệ thống không hiển thị số liệu ước lượng. Để theo dõi số liệu vận hành và tài chính thực tế, vui lòng sử dụng{' '}
        <Link to="/admin/reports">Báo cáo doanh thu</Link> hoặc{' '}
        <Link to="/admin">Tổng quan vận hành</Link>.
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        ariaLabel="Danh mục phân tích vận hành mở rộng"
        tabs={[
          { key: 'utilization', label: 'Mức sử dụng trạm' },
          { key: 'routes', label: 'Tuyến phổ biến' },
          { key: 'inactive', label: 'Khách lâu không đi' },
          { key: 'overview', label: 'Chỉ số tổng quan mở rộng' },
        ]}
      />

      <div className="card stack-md">
        <div className="card-header">
          <h3>{current.title}</h3>
          <StatusBadge label="Chưa kết nối dữ liệu trực tiếp" tone="neutral" />
        </div>

        <EmptyState
          title="Chưa có dữ liệu phân tích trực tiếp cho mục này"
          hint={current.description}
          action={
            <div className="row-wrap" style={{ justifyContent: 'center' }}>
              <Link to="/admin/reports" className="btn btn-primary btn-sm">
                Mở Báo cáo doanh thu
              </Link>
              <Link to="/admin/stations" className="btn btn-sm">
                Xem tình trạng trạm
              </Link>
            </div>
          }
        />

        <div className="stack-sm">
          <strong>Gợi ý thao tác hiện tại:</strong>
          <ul className="checklist">
            {current.nextSteps.map((step, idx) => (
              <li key={idx}>• {step}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
