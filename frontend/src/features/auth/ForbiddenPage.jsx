import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import { resolveDefaultHomeForRole } from '../../integrations/authSession.js';
import { Button } from '../../components/ui/index.js';
import { getCustomerStatusMeta } from '../../utils/statusConfig.js';

export default function ForbiddenPage({ allowedRoles = [] }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const currentRoleLabel = user ? getCustomerStatusMeta('userRole', user.role).label : 'Khách truy cập';
  const requiredRolesLabel =
    Array.isArray(allowedRoles) && allowedRoles.length > 0
      ? allowedRoles.map((r) => getCustomerStatusMeta('userRole', r).label).join(' hoặc ')
      : null;

  const homePath = resolveDefaultHomeForRole(user?.role);
  const homeLabel =
    user?.role === 'STAFF' || user?.role === 'MANAGER'
      ? 'Về cổng vận hành'
      : 'Về trang khách hàng';

  const handleSwitchAccount = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="status-screen-wrap" role="alert">
      <div className="status-screen-card">
        <span className="status-code-pill">403 — Từ chối truy cập</span>
        <h1>Bạn không có quyền mở trang này</h1>
        <p className="muted">
          Tài khoản hiện tại thuộc nhóm <strong>{currentRoleLabel}</strong>
          {requiredRolesLabel ? (
            <>
              , trong khi khu vực này chỉ dành cho <strong>{requiredRolesLabel}</strong>.
            </>
          ) : (
            '.'
          )}
        </p>

        <div className="status-screen-actions">
          <Link to={homePath} className="btn btn-primary">
            {homeLabel}
          </Link>
          {isAuthenticated ? (
            <Button variant="secondary" onClick={handleSwitchAccount}>
              Đăng xuất / Đổi tài khoản
            </Button>
          ) : (
            <Link to="/login" className="btn btn-secondary">
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
