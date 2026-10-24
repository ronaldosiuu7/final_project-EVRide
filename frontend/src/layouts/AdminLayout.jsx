import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../styles/admin.css';

const AdminLayout = () => {
  return (
    <div className="admin-container">
      <aside className="admin-sidebar">
        <div className="admin-brand">EVRide Admin / Staff</div>
        <nav>
          <ul className="admin-nav">
            <li>
              <NavLink
                to="/admin"
                end
                className={({ isActive }) => isActive ? "admin-nav-link active" : "admin-nav-link"}
              >
                Tổng quan
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/admin/vehicles"
                className={({ isActive }) => isActive ? "admin-nav-link active" : "admin-nav-link"}
              >
                Danh sách ô tô điện
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/admin/stations"
                className={({ isActive }) => isActive ? "admin-nav-link active" : "admin-nav-link"}
              >
                Danh sách trạm
              </NavLink>
            </li>
          </ul>
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <h3>Bảng điều khiển Quản trị & Nhân viên</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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