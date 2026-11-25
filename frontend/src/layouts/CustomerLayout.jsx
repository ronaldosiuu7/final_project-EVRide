import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../integrations/authBridge.jsx';
import { Button, Modal, StatusBadge, TextField, useToast } from '../components/ui/index.js';
import { getCustomerStatusMeta } from '../utils/statusConfig.js';
import { getApiErrorMessage } from '../utils/errorMessages.js';
import { mapApiFieldErrors } from '../utils/validation.js';

function ChangePasswordModal({ onClose }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!currentPassword) {
      errors.current_password = 'Vui lòng nhập mật khẩu hiện tại.';
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      errors.new_password = 'Mật khẩu mới phải từ 12 đến 128 ký tự.';
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
      await changePassword({ currentPassword, newPassword });
      toast.success('Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.');
      onClose();
      navigate('/login', { replace: true });
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
      title="Đổi mật khẩu tài khoản"
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" form="customer-change-password-form" variant="primary" loading={submitting}>
            Cập nhật &amp; Đăng nhập lại
          </Button>
        </>
      }
    >
      <form id="customer-change-password-form" onSubmit={handleSubmit} className="stack-md" noValidate>
        <div className="alert alert-info">
          Để bảo vệ tài khoản, sau khi đổi mật khẩu thành công, toàn bộ phiên đăng nhập trên các thiết bị sẽ được thu hồi và bạn cần đăng nhập lại.
        </div>

        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}

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
          hint="Giữ nguyên khoảng trắng nếu mật khẩu có chứa khoảng trắng."
          value={newPassword}
          error={fieldErrors.new_password}
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
      </form>
    </Modal>
  );
}

const NAV_ITEMS = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/stations', label: 'Trạm xe', end: false },
  { to: '/vehicles', label: 'Tìm xe', end: false },
  { to: '/faq', label: 'FAQ', end: false },
];

export default function CustomerLayout() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const roleMeta = user ? getCustomerStatusMeta('userRole', user.role) : null;
  const isStaffOrManager = user && (user.role === 'STAFF' || user.role === 'MANAGER');

  // Tự động đóng menu mobile khi người dùng chuyển trang.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  // Hỗ trợ phím Escape để đóng menu mobile bằng bàn phím.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setMobileMenuOpen(false);
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="customer-shell">
      <a href="#customer-main-content" className="customer-skip-link">
        Chuyển tới nội dung chính
      </a>

      <header className="customer-topbar">
        <div className="customer-topbar-inner">
          <div className="customer-topbar-left">
            <Link to="/" className="customer-brand" aria-label="EVRide — Về trang chủ">
              <span className="customer-brand-mark" aria-hidden="true">EV</span>
              <span className="customer-brand-text">
                <strong>EVRide</strong>
                <span className="customer-brand-tagline">Xe máy điện theo trạm</span>
              </span>
            </Link>

            <nav className="customer-nav customer-nav-desktop" aria-label="Điều hướng chính">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'customer-nav-link active' : 'customer-nav-link')}
                >
                  {item.label}
                </NavLink>
              ))}
              {isAuthenticated && user?.role === 'CUSTOMER' && (
                <>
                  <NavLink
                    to="/rentals"
                    className={({ isActive }) => (isActive ? 'customer-nav-link active' : 'customer-nav-link')}
                  >
                    Chuyến của tôi
                  </NavLink>
                  <NavLink
                    to="/wallet"
                    className={({ isActive }) => (isActive ? 'customer-nav-link active' : 'customer-nav-link')}
                  >
                    Ví của tôi
                  </NavLink>
                  <NavLink
                    to="/promotions"
                    className={({ isActive }) => (isActive ? 'customer-nav-link active' : 'customer-nav-link')}
                  >
                    Ưu đãi
                  </NavLink>
                  <NavLink
                    to="/support"
                    className={({ isActive }) => (isActive ? 'customer-nav-link active' : 'customer-nav-link')}
                  >
                    Hỗ trợ
                  </NavLink>
                </>
              )}
              {isAuthenticated && (
                <NavLink
                  to="/profile"
                  className={({ isActive }) => (isActive ? 'customer-nav-link active' : 'customer-nav-link')}
                >
                  Hồ sơ &amp; Giấy tờ
                </NavLink>
              )}
              {isStaffOrManager && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) => (isActive ? 'customer-nav-link active' : 'customer-nav-link')}
                >
                  Cổng vận hành
                </NavLink>
              )}
            </nav>
          </div>

          <div className="customer-user-actions customer-actions-desktop">
            {isAuthenticated && user ? (
              <>
                <span className="customer-user-pill">
                  <strong>{user.name}</strong>
                  {roleMeta && <StatusBadge label={roleMeta.label} tone={roleMeta.tone} />}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setPasswordModalOpen(true)}>
                  Đổi mật khẩu
                </Button>
                <Button size="sm" variant="ghost" loading={loggingOut} onClick={handleLogout}>
                  Đăng xuất
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-sm btn-secondary">
                  Đăng nhập
                </Link>
                <Link to="/register" className="btn btn-sm btn-primary">
                  Đăng ký
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="customer-menu-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="customer-mobile-menu"
            aria-label={mobileMenuOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            <span className="customer-menu-icon" aria-hidden="true">
              {mobileMenuOpen ? '✕' : '☰'}
            </span>
            <span>{mobileMenuOpen ? 'Đóng' : 'Menu'}</span>
          </button>
        </div>

        {mobileMenuOpen && (
          <div id="customer-mobile-menu" className="customer-mobile-drawer">
            <nav className="customer-mobile-nav" aria-label="Điều hướng di động">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'customer-mobile-link active' : 'customer-mobile-link')}
                >
                  {item.label}
                </NavLink>
              ))}
              {isAuthenticated && user?.role === 'CUSTOMER' && (
                <>
                  <NavLink
                    to="/rentals"
                    className={({ isActive }) => (isActive ? 'customer-mobile-link active' : 'customer-mobile-link')}
                  >
                    Chuyến của tôi
                  </NavLink>
                  <NavLink
                    to="/wallet"
                    className={({ isActive }) => (isActive ? 'customer-mobile-link active' : 'customer-mobile-link')}
                  >
                    Ví của tôi
                  </NavLink>
                  <NavLink
                    to="/promotions"
                    className={({ isActive }) => (isActive ? 'customer-mobile-link active' : 'customer-mobile-link')}
                  >
                    Ưu đãi
                  </NavLink>
                  <NavLink
                    to="/support"
                    className={({ isActive }) => (isActive ? 'customer-mobile-link active' : 'customer-mobile-link')}
                  >
                    Hỗ trợ
                  </NavLink>
                </>
              )}
              {isAuthenticated && (
                <NavLink
                  to="/profile"
                  className={({ isActive }) => (isActive ? 'customer-mobile-link active' : 'customer-mobile-link')}
                >
                  Hồ sơ &amp; Giấy tờ
                </NavLink>
              )}
              {isStaffOrManager && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) => (isActive ? 'customer-mobile-link active' : 'customer-mobile-link')}
                >
                  Cổng vận hành
                </NavLink>
              )}
            </nav>

            <div className="customer-mobile-auth">
              {isAuthenticated && user ? (
                <>
                  <div className="customer-user-pill">
                    <strong>{user.name}</strong>
                    {roleMeta && <StatusBadge label={roleMeta.label} tone={roleMeta.tone} />}
                  </div>
                  <div className="customer-mobile-auth-buttons">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setPasswordModalOpen(true);
                      }}
                    >
                      Đổi mật khẩu
                    </Button>
                    <Button size="sm" variant="ghost" loading={loggingOut} onClick={handleLogout}>
                      Đăng xuất
                    </Button>
                  </div>
                </>
              ) : (
                <div className="customer-mobile-auth-buttons">
                  <Link to="/login" className="btn btn-sm btn-secondary">
                    Đăng nhập
                  </Link>
                  <Link to="/register" className="btn btn-sm btn-primary">
                    Đăng ký tài khoản
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="customer-main-content" className="customer-main" tabIndex={-1} key={user?.id || 'guest'}>
        <Outlet />
      </main>

      <footer className="customer-footer">
        <div className="customer-footer-inner">
          <div className="customer-footer-brand">
            <strong>EVRide</strong> — Dịch vụ cho thuê xe máy điện theo trạm
          </div>
          <p className="customer-footer-note">
            Phiên bản minh họa đồ án, sử dụng tiền mô phỏng và dữ liệu vận hành theo thời gian thực từ hệ thống.
          </p>
        </div>
      </footer>

      {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
    </div>
  );
}
