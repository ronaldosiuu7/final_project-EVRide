import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../integrations/authBridge';
import {
  Button,
  Modal,
  StatusBadge,
  Tabs,
  TextField,
  useToast,
} from '../components/ui';
import {
  BoltIcon,
  CloseIcon,
  MenuIcon,
} from '../components/customer/CustomerIcons.jsx';
import { changeMyPassword, updateMyProfile } from '../services/accountsApi';
import { getApiErrorMessage } from '../utils/errorMessages';
import { getStatusMeta } from '../utils/statusConfig';
import { mapApiFieldErrors } from '../utils/validation';
import '../styles/admin.css';

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
      { to: '/admin/tickets', label: 'Yêu cầu hỗ trợ', roles: ['STAFF', 'MANAGER'] },
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
        roleTag: 'Quản lý',
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

  const roleLabel = getStatusMeta('userRole', user?.role).label;

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
    if (!currentPassword) {
      errors.current_password = 'Vui lòng nhập mật khẩu hiện tại.';
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      errors.new_password = 'Mật khẩu mới phải từ 12 đến 128 ký tự (giữ nguyên khoảng trắng nếu có).';
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
      toast.success('Đã đổi mật khẩu. Toàn bộ phiên đã được thu hồi, vui lòng đăng nhập lại.');
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
          Tài khoản: <strong>{user.email}</strong> ({roleLabel})
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
              Để bảo vệ tài khoản, sau khi đổi mật khẩu thành công, toàn bộ phiên đăng nhập hiện có sẽ được thu hồi và bạn cần đăng nhập lại.
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

  useEffect(() => {
    if (!sidebarOpen || typeof window === 'undefined') return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  const role = user?.role;
  const displayName = overrideName ?? user?.name;

  return (
    <div className="admin-container">
      <a href="#admin-main-content" className="admin-skip-link">
        Chuyển tới nội dung vận hành
      </a>

      <aside className={sidebarOpen ? 'admin-sidebar open' : 'admin-sidebar'} id="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-row">
            <span className="admin-brand-mark" aria-hidden="true">
              <BoltIcon size={18} />
            </span>
            <div className="admin-brand-copy">
              <span className="admin-brand-title">EVRide</span>
              <span className="admin-brand-sub">Trung tâm Vận hành</span>
            </div>
          </div>
          <button
            type="button"
            className="admin-sidebar-close"
            aria-label="Đóng thanh điều hướng"
            onClick={() => setSidebarOpen(false)}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <nav className="admin-nav-groups" aria-label="Điều hướng vận hành">
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

        <div className="admin-sidebar-footer">
          <Link to="/stations" className="admin-sidebar-portal-link">
            Xem danh sách trạm công khai
          </Link>
        </div>
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
              aria-label={sidebarOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
              aria-controls="admin-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              {sidebarOpen ? <CloseIcon size={17} /> : <MenuIcon size={17} />}
            </Button>
            <h3>Hệ thống Vận hành EVRide</h3>
          </div>

          <div className="admin-header-meta">
            {user && (
              <>
                <span className="admin-header-user">
                  <strong>{displayName}</strong>
                  {user.email ? <span className="muted"> ({user.email})</span> : null}
                </span>
                <StatusBadge domain="userRole" value={user.role} />
                <Button size="sm" onClick={() => setAccountModalOpen(true)}>
                  Hồ sơ &amp; Bảo mật
                </Button>
                <Button size="sm" variant="ghost" onClick={logout}>
                  Đăng xuất
                </Button>
              </>
            )}
          </div>
        </header>

        <main id="admin-main-content" className="admin-content" tabIndex={-1}>
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
