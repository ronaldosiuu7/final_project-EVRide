import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../integrations/authBridge.jsx';
import { Button, Modal, StatusBadge, TextField, useToast } from '../components/ui/index.js';
import {
  BoltIcon,
  ChevronDownIcon,
  CloseIcon,
  GridIcon,
  KeyIcon,
  LifebuoyIcon,
  LogOutIcon,
  MenuIcon,
  UserIcon,
} from '../components/customer/CustomerIcons.jsx';
import { getCustomerStatusMeta } from '../utils/statusConfig.js';
import { getApiErrorMessage } from '../utils/errorMessages.js';
import { mapApiFieldErrors } from '../utils/validation.js';

function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'EV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

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
          <Button
            type="submit"
            form="customer-change-password-form"
            variant="primary"
            loading={submitting}
          >
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

const PUBLIC_NAV_ITEMS = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/stations', label: 'Trạm xe', end: false },
  { to: '/vehicles', label: 'Tìm xe', end: false },
];

export default function CustomerLayout() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const accountMenuRef = useRef(null);
  const accountTriggerRef = useRef(null);

  const roleMeta = user ? getCustomerStatusMeta('userRole', user.role) : null;
  const isCustomer = isAuthenticated && user?.role === 'CUSTOMER';
  const isStaffOrManager = Boolean(
    user && (user.role === 'STAFF' || user.role === 'MANAGER')
  );

  // Tự động đóng menu khi người dùng chuyển trang.
  useEffect(() => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname, location.search]);

  // Hỗ trợ đóng menu tài khoản khi click ra ngoài hoặc nhấn phím Escape.
  useEffect(() => {
    if ((!accountMenuOpen && !mobileMenuOpen) || typeof window === 'undefined') {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        accountMenuOpen &&
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target)
      ) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (accountMenuOpen) {
          setAccountMenuOpen(false);
          accountTriggerRef.current?.focus();
        }
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
        }
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen, mobileMenuOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setAccountMenuOpen(false);
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
              <span className="customer-brand-mark" aria-hidden="true">
                <BoltIcon size={20} />
              </span>
              <span className="customer-brand-text">
                <strong>EVRide</strong>
                <span className="customer-brand-tagline">Xe máy điện theo trạm</span>
              </span>
            </Link>

            <nav className="customer-nav customer-nav-desktop" aria-label="Điều hướng chính">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? 'customer-nav-link active' : 'customer-nav-link'
                  }
                >
                  {item.label}
                </NavLink>
              ))}

              {isCustomer && (
                <>
                  <NavLink
                    to="/rentals"
                    className={({ isActive }) =>
                      isActive ? 'customer-nav-link active' : 'customer-nav-link'
                    }
                  >
                    Chuyến của tôi
                  </NavLink>
                  <NavLink
                    to="/wallet"
                    className={({ isActive }) =>
                      isActive ? 'customer-nav-link active' : 'customer-nav-link'
                    }
                  >
                    Ví của tôi
                  </NavLink>
                  <NavLink
                    to="/promotions"
                    className={({ isActive }) =>
                      isActive ? 'customer-nav-link active' : 'customer-nav-link'
                    }
                  >
                    Ưu đãi
                  </NavLink>
                  <NavLink
                    to="/support"
                    className={({ isActive }) =>
                      isActive ? 'customer-nav-link active' : 'customer-nav-link'
                    }
                  >
                    Hỗ trợ
                  </NavLink>
                </>
              )}

              <NavLink
                to="/faq"
                className={({ isActive }) =>
                  isActive ? 'customer-nav-link active' : 'customer-nav-link'
                }
              >
                Hỏi đáp
              </NavLink>

              {isStaffOrManager && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    isActive ? 'customer-nav-link active' : 'customer-nav-link'
                  }
                >
                  Cổng vận hành
                </NavLink>
              )}
            </nav>
          </div>

          <div className="customer-user-actions customer-actions-desktop">
            {isAuthenticated && user ? (
              <div className="customer-account-menu" ref={accountMenuRef}>
                <button
                  ref={accountTriggerRef}
                  type="button"
                  className="customer-account-trigger"
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                >
                  <span className="customer-account-avatar" aria-hidden="true">
                    {getInitials(user.name)}
                  </span>
                  <span className="customer-account-name">{user.name}</span>
                  <ChevronDownIcon size={16} className="customer-account-chevron" />
                </button>

                {accountMenuOpen && (
                  <div
                    className="customer-account-dropdown"
                    role="menu"
                    aria-label="Menu tài khoản cá nhân"
                  >
                    <div className="customer-account-header">
                      <div className="customer-account-header-top">
                        <strong>{user.name}</strong>
                        {roleMeta && <StatusBadge label={roleMeta.label} tone={roleMeta.tone} />}
                      </div>
                      {user.email && (
                        <span className="customer-account-email">{user.email}</span>
                      )}
                    </div>

                    <Link
                      to="/profile"
                      role="menuitem"
                      className="customer-account-item"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <UserIcon size={17} />
                      <span>Hồ sơ &amp; Giấy tờ</span>
                    </Link>

                    {isCustomer && (
                      <Link
                        to="/support"
                        role="menuitem"
                        className="customer-account-item"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <LifebuoyIcon size={17} />
                        <span>Yêu cầu hỗ trợ của tôi</span>
                      </Link>
                    )}

                    {isStaffOrManager && (
                      <Link
                        to="/admin"
                        role="menuitem"
                        className="customer-account-item"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <GridIcon size={17} />
                        <span>Mở Cổng vận hành</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      className="customer-account-item"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setPasswordModalOpen(true);
                      }}
                    >
                      <KeyIcon size={17} />
                      <span>Đổi mật khẩu</span>
                    </button>

                    <div className="customer-account-divider" role="separator" />

                    <button
                      type="button"
                      role="menuitem"
                      className="customer-account-item is-danger"
                      disabled={loggingOut}
                      onClick={handleLogout}
                    >
                      <LogOutIcon size={17} />
                      <span>{loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}</span>
                    </button>
                  </div>
                )}
              </div>
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
            {mobileMenuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
            <span>{mobileMenuOpen ? 'Đóng' : 'Menu'}</span>
          </button>
        </div>

        {mobileMenuOpen && (
          <div id="customer-mobile-menu" className="customer-mobile-drawer">
            <nav className="customer-mobile-nav" aria-label="Điều hướng di động">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? 'customer-mobile-link active' : 'customer-mobile-link'
                  }
                >
                  {item.label}
                </NavLink>
              ))}

              {isCustomer && (
                <>
                  <NavLink
                    to="/rentals"
                    className={({ isActive }) =>
                      isActive ? 'customer-mobile-link active' : 'customer-mobile-link'
                    }
                  >
                    Chuyến của tôi
                  </NavLink>
                  <NavLink
                    to="/wallet"
                    className={({ isActive }) =>
                      isActive ? 'customer-mobile-link active' : 'customer-mobile-link'
                    }
                  >
                    Ví của tôi
                  </NavLink>
                  <NavLink
                    to="/promotions"
                    className={({ isActive }) =>
                      isActive ? 'customer-mobile-link active' : 'customer-mobile-link'
                    }
                  >
                    Ưu đãi
                  </NavLink>
                  <NavLink
                    to="/support"
                    className={({ isActive }) =>
                      isActive ? 'customer-mobile-link active' : 'customer-mobile-link'
                    }
                  >
                    Hỗ trợ
                  </NavLink>
                </>
              )}

              <NavLink
                to="/faq"
                className={({ isActive }) =>
                  isActive ? 'customer-mobile-link active' : 'customer-mobile-link'
                }
              >
                Hỏi đáp
              </NavLink>

              {isAuthenticated && (
                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    isActive ? 'customer-mobile-link active' : 'customer-mobile-link'
                  }
                >
                  Hồ sơ &amp; Giấy tờ
                </NavLink>
              )}

              {isStaffOrManager && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    isActive ? 'customer-mobile-link active' : 'customer-mobile-link'
                  }
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
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={loggingOut}
                      onClick={handleLogout}
                    >
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

      <main
        id="customer-main-content"
        className="customer-main"
        tabIndex={-1}
        key={user?.id || 'guest'}
      >
        <Outlet />
      </main>

      <footer className="customer-footer">
        <div className="customer-footer-inner">
          <div className="customer-footer-top">
            <div>
              <div className="customer-footer-brand">
                <span className="customer-brand-mark" style={{ width: 28, height: 28, borderRadius: 7 }} aria-hidden="true">
                  <BoltIcon size={15} />
                </span>
                <strong>EVRide — Thuê xe máy điện theo trạm</strong>
              </div>
              <p className="customer-footer-desc">
                Hệ thống tra cứu trạm, giữ xe máy điện trước 30 phút và quyết toán minh bạch theo thời gian sử dụng thực tế tại trạm.
              </p>
            </div>

            <div>
              <h2 className="customer-footer-col-title">Dịch vụ thuê xe</h2>
              <ul className="customer-footer-links">
                <li>
                  <Link to="/stations">Danh sách trạm hoạt động</Link>
                </li>
                <li>
                  <Link to="/vehicles">Tìm xe máy điện sẵn sàng</Link>
                </li>
                <li>
                  <Link to="/faq">Câu hỏi thường gặp &amp; Quy định</Link>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="customer-footer-col-title">Tài khoản &amp; Hỗ trợ</h2>
              <ul className="customer-footer-links">
                {isAuthenticated ? (
                  <>
                    <li>
                      <Link to="/profile">Hồ sơ &amp; Giấy tờ tùy thân</Link>
                    </li>
                    {isCustomer && (
                      <>
                        <li>
                          <Link to="/rentals">Chuyến thuê của tôi</Link>
                        </li>
                        <li>
                          <Link to="/wallet">Ví điện tử</Link>
                        </li>
                        <li>
                          <Link to="/support">Gửi yêu cầu hỗ trợ</Link>
                        </li>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <li>
                      <Link to="/login">Đăng nhập tài khoản</Link>
                    </li>
                    <li>
                      <Link to="/register">Đăng ký khách hàng mới</Link>
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>

          <div className="customer-footer-bottom">
            <p className="customer-footer-note">
              EVRide – Hệ thống cho thuê xe máy điện theo trạm tại nội thành Hà Nội.
            </p>
          </div>
        </div>
      </footer>

      {passwordModalOpen && (
        <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />
      )}
    </div>
  );
}
