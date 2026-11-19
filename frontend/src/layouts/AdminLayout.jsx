import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../integrations/authBridge';
import { Button, StatusBadge } from '../components/ui';
import '../styles/admin.css';

// Menu điều hướng khu vực vận hành.
// Quyền thực tế dùng đúng CUSTOMER / STAFF / MANAGER như API; "Admin" chỉ là tên khu vực URL.
const NAV_GROUPS = [
  {
    title: 'Tổng quan & Báo cáo',
    items: [
      { to: '/admin', label: 'Tổng quan', end: true, roles: ['STAFF', 'MANAGER'] },
      { to: '/admin/reports', label: 'Báo cáo doanh thu', end: true, roles: ['STAFF', 'MANAGER'] },
      { to: '/admin/reports/operations', label: 'Phân tích mở rộng', roles: ['STAFF', 'MANAGER'] },
    ],
  },
  {
    title: 'Đội xe & Trạm',
    items: [
      { to: '/admin/vehicles', label: 'Xe máy điện', roles: ['STAFF', 'MANAGER'] },
      { to: '/admin/stations', label: 'Trạm xe máy điện', roles: ['STAFF', 'MANAGER'] },
      { to: '/admin/prices', label: 'Bảng giá theo xe', roles: ['STAFF', 'MANAGER'] },
    ],
  },
  {
    title: 'Vận hành chuyến',
    items: [
      { to: '/admin/rentals', label: 'Lượt giữ & chuyến thuê', roles: ['STAFF', 'MANAGER'] },
      { to: '/admin/check-ins', label: 'Kiểm tra 24 giờ', roles: ['STAFF', 'MANAGER'] },
    ],
  },
  {
    title: 'Hỗ trợ & Sự cố',
    items: [
      { to: '/admin/tickets', label: 'Ticket hỗ trợ', roles: ['STAFF', 'MANAGER'] },
      { to: '/admin/maintenance', label: 'Phiếu bảo trì', roles: ['STAFF', 'MANAGER'] },
      { to: '/admin/incidents', label: 'Hồ sơ sự cố', roles: ['STAFF', 'MANAGER'] },
    ],
  },
  {
    title: 'Tài khoản & Chính sách',
    items: [
      { to: '/admin/users', label: 'Tài khoản', roles: ['STAFF', 'MANAGER'] },
      { to: '/admin/documents', label: 'Xác minh giấy tờ', roles: ['STAFF', 'MANAGER'] },
      {
        to: '/admin/promotions',
        label: 'Khuyến mãi',
        roles: ['MANAGER'],
        roleTag: 'MANAGER',
      },
    ],
  },
];

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const role = user?.role;

  return (
    <div className="admin-container">
      <aside className={sidebarOpen ? 'admin-sidebar open' : 'admin-sidebar'} id="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-title">EVRide Vận hành</span>
          <span className="admin-brand-sub">Cổng STAFF / MANAGER</span>
        </div>

        <nav className="admin-nav-groups" aria-label="Điều hướng quản trị">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => !role || item.roles.includes(role));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title}>
                <div className="admin-nav-group-label">{group.title}</div>
                <ul className="admin-nav">
                  {visibleItems.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          isActive ? 'admin-nav-link active' : 'admin-nav-link'
                        }
                      >
                        <span>{item.label}</span>
                        {item.roleTag && <span className="admin-nav-role-tag">{item.roleTag}</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <div
        className={sidebarOpen ? 'sidebar-backdrop open' : 'sidebar-backdrop'}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header-title">
            <Button
              size="sm"
              className="menu-toggle"
              aria-label="Mở menu điều hướng"
              aria-controls="admin-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              ☰
            </Button>
            <h3>Hệ thống Vận hành Xe máy điện EVRide</h3>
          </div>

          <div className="admin-header-meta">
            {user && (
              <>
                <span className="muted">
                  <strong>{user.name}</strong> ({user.email})
                </span>
                <StatusBadge domain="userRole" value={user.role} />
                <Button size="sm" onClick={logout}>
                  Đăng xuất
                </Button>
              </>
            )}
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
