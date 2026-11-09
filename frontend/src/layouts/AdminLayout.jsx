import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import '../styles/admin.css';

const NAV_ITEMS = [
  { to: '/admin', label: 'Tổng quan', end: true },
  { to: '/admin/vehicles', label: 'Danh sách ô tô điện' },
  { to: '/admin/stations', label: 'Danh sách trạm' }
];

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Đóng menu trên điện thoại sau khi chuyển trang.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="admin-container">
      <aside className={sidebarOpen ? 'admin-sidebar open' : 'admin-sidebar'} id="admin-sidebar">
        <div className="admin-brand">EVRide Admin / Staff</div>
        <nav>
          <ul className="admin-nav">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => isActive ? "admin-nav-link active" : "admin-nav-link"}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
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
            <button
              type="button"
              className="btn menu-toggle"
              aria-label="Mở menu"
              aria-controls="admin-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              ☰
            </button>
            <h3>Bảng điều khiển Quản trị &amp; Nhân viên</h3>
          </div>
          <div className="admin-header-meta">
            <span className="badge badge-warning">Dữ liệu mẫu — chưa kết nối API</span>
            <span>Vai trò: Admin/Staff</span>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
