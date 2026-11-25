import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import { resolveDefaultHomeForRole } from '../../integrations/authSession.js';

export default function NotFoundPage() {
  const { user } = useAuth();
  const homePath = resolveDefaultHomeForRole(user?.role);
  const homeLabel =
    user?.role === 'STAFF' || user?.role === 'MANAGER'
      ? 'Quay lại cổng vận hành'
      : 'Quay lại trang chủ EVRide';

  return (
    <div className="status-screen-wrap">
      <div className="status-screen-card">
        <span className="status-code-pill neutral">404 — Không tìm thấy trang</span>
        <h1>Đường dẫn không tồn tại</h1>
        <p className="muted">
          Trang bạn đang tìm kiếm không tồn tại hoặc đã được thay đổi đường dẫn trong hệ thống EVRide.
        </p>
        <div className="status-screen-actions">
          <Link to={homePath} className="btn btn-primary">
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
