import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../integrations/authBridge';
import {
  Button,
  Modal,
  StatusBadge,
  Tabs,
  TextField,
  useToast,
} from '../components/ui';
import { changeMyPassword, updateMyProfile } from '../services/accountsApi';
import { getApiErrorMessage } from '../utils/errorMessages';
import { mapApiFieldErrors } from '../utils/validation';
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

function AccountSecurityModal({ user, displayName, onProfileUpdated, onPasswordChanged, onClose }) {
  const toast = useToast();
  const [tab, setTab] = useState('password');
  const [name, setName] = useState(displayName || user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) {
      setFieldErrors({ name: 'Tên hiển thị phải từ 1 đến 100 ký tự.' });
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      const res = await updateMyProfile({ name: trimmed });
      toast.success('Đã cập nhật tên hiển thị.');
      onProfileUpdated(res.data?.name || trimmed);
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    // Contract: KHÔNG trim mật khẩu; độ dài 12–128 ký tự.
    if (!currentPassword) {
      errors.current_password = 'Vui lòng nhập mật khẩu hiện tại.';
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      errors.new_password = 'Mật khẩu mới phải từ 12 đến 128 ký tự (không cắt khoảng trắng).';
    }
    if (confirmPassword !== newPassword) {
      errors.confirm_password = 'Xác nhận mật khẩu mới chưa khớp.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      await changeMyPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Đã đổi mật khẩu. Toàn bộ phiên đã bị thu hồi, vui lòng đăng nhập lại.');
      await onPasswordChanged();
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      title="Hồ sơ cá nhân & Bảo mật"
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Đóng
          </Button>
          {tab === 'profile' ? (
            <Button type="submit" form="self-profile-form" variant="primary" loading={submitting}>
              Lưu tên hiển thị
            </Button>
          ) : (
            <Button type="submit" form="self-password-form" variant="primary" loading={submitting}>
              Đổi mật khẩu &amp; Đăng xuất
            </Button>
          )}
        </>
      }
    >
      <div className="stack-md">
        <p className="muted">
          Tài khoản: <strong>{user.email}</strong> ({user.role})
        </p>

        <Tabs
          activeKey={tab}
          onChange={(nextTab) => {
            setTab(nextTab);
            setFieldErrors({});
            setFormError('');
          }}
          tabs={[
            { key: 'password', label: 'Đổi mật khẩu' },
            { key: 'profile', label: 'Đổi tên hiển thị' },
          ]}
        />

        {tab === 'profile' ? (
          <form id="self-profile-form" onSubmit={handleProfileSubmit} className="stack-md">
            <TextField
              label="Tên hiển thị"
              required
              maxLength={100}
              value={name}
              error={fieldErrors.name}
              onChange={(e) => setName(e.target.value)}
            />
            {formError && (
              <div className="alert alert-danger" role="alert">
                {formError}
              </div>
            )}
          </form>
        ) : (
          <form id="self-password-form" onSubmit={handlePasswordSubmit} className="stack-md">
            <div className="alert alert-info">
              Theo chính sách bảo mật phiên, sau khi đổi mật khẩu thành công, toàn bộ phiên đăng nhập hiện có sẽ bị thu hồi và bạn cần đăng nhập lại.
            </div>
            <TextField
              label="Mật khẩu hiện tại"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              error={fieldErrors.current_password}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <TextField
              label="Mật khẩu mới (12–128 ký tự)"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={newPassword}
              error={fieldErrors.new_password}
              hint="Giữ nguyên khoảng trắng nếu mật khẩu có chứa khoảng trắng."
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <TextField
              label="Nhập lại mật khẩu mới"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              error={fieldErrors.confirm_password}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {formError && (
              <div className="alert alert-danger" role="alert">
                {formError}
              </div>
            )}
          </form>
        )}
      </div>
    </Modal>
  );
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [overrideName, setOverrideName] = useState(null);
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setOverrideName(null);
  }, [user?.id, user?.name]);

  const role = user?.role;
  const displayName = overrideName ?? user?.name;

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
                  <strong>{displayName}</strong> ({user.email})
                </span>
                <StatusBadge domain="userRole" value={user.role} />
                <Button size="sm" onClick={() => setAccountModalOpen(true)}>
                  Đổi mật khẩu / Hồ sơ
                </Button>
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

      {accountModalOpen && user && (
        <AccountSecurityModal
          user={user}
          displayName={displayName}
          onClose={() => setAccountModalOpen(false)}
          onProfileUpdated={(nextName) => {
            setOverrideName(nextName);
            setAccountModalOpen(false);
          }}
          onPasswordChanged={async () => {
            setAccountModalOpen(false);
            await logout();
          }}
        />
      )}
    </div>
  );
}
