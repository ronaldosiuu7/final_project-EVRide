// ADAPTER BOUNDARY FOR #15:
// Cầu nối xác thực tối giản chỉ giữ phiên trong bộ nhớ React để chạy khu vực STAFF/MANAGER.
// Cơ chế Rolling Session, Refresh Token Rotation, Web Locks và BroadcastChannel thuộc phạm vi #15;
// khi #15 hoàn thiện, truyền `externalAuth` vào <AuthProvider> hoặc thay thế file này.

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { apiRequest, configurePlatformApi } from './apiClient';
import { getApiErrorMessage } from '../utils/errorMessages';

const AuthContext = createContext(null);
const ALLOWED_STAFF_ROLES = new Set(['STAFF', 'MANAGER']);

export function AuthProvider({ children, externalAuth = null }) {
  const [session, setSession] = useState({
    accessToken: null,
    sessionId: null,
    user: null,
  });
  const [authNotice, setAuthNotice] = useState(null);
  // Giữ token đồng bộ trong ref để apiClient luôn đọc được ngay lập tức trước khi useEffect của component con chạy.
  const tokenRef = useRef(null);

  const activeUser = externalAuth ? externalAuth.user : session.user;
  const activeToken = externalAuth ? externalAuth.accessToken : session.accessToken;
  const activeSessionId = externalAuth ? externalAuth.sessionId : session.sessionId;

  const clearLocalSession = useCallback((notice = null) => {
    tokenRef.current = null;
    setSession({ accessToken: null, sessionId: null, user: null });
    if (notice) setAuthNotice(notice);
  }, []);

  // Đồng bộ handler cho apiClient ngay trong phase render (không chờ passive useEffect)
  // để tránh race condition khiến useApiQuery ở component con gửi request trước khi token được gắn.
  tokenRef.current = activeToken || null;
  if (externalAuth) {
    configurePlatformApi({
      getAccessToken: externalAuth.getAccessToken || (() => tokenRef.current),
      customRequest: externalAuth.request || null,
      onAuthInvalid:
        externalAuth.onAuthInvalid || ((err) => clearLocalSession(getApiErrorMessage(err))),
    });
  } else {
    configurePlatformApi({
      getAccessToken: () => tokenRef.current,
      customRequest: null,
      onAuthInvalid: (err) => {
        clearLocalSession(getApiErrorMessage(err));
      },
    });
  }

  const login = useCallback(async (email, password) => {
    setAuthNotice(null);
    const { data } = await apiRequest('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EVRide-CSRF': '1',
      },
      body: { email, password },
      credentials: 'include',
      skipAuthCallback: true,
    });

    if (!data?.user || !ALLOWED_STAFF_ROLES.has(data.user.role)) {
      // Thu hồi ngay nếu tài khoản CUSTOMER đăng nhập vào cổng vận hành.
      if (data?.session_id) {
        try {
          await apiRequest('/auth/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-EVRide-CSRF': '1',
              'X-Session-ID': data.session_id,
            },
            body: {},
            credentials: 'include',
            skipAuthCallback: true,
          });
        } catch {
          // Bỏ qua lỗi dọn cookie nếu có.
        }
      }
      const forbiddenErr = new Error(
        'Tài khoản CUSTOMER không có quyền truy cập giao diện vận hành STAFF/MANAGER.'
      );
      forbiddenErr.code = 'FORBIDDEN';
      forbiddenErr.status = 403;
      throw forbiddenErr;
    }

    // Gán token đồng bộ trước setSession để mọi request từ component con sau khi mount luôn có Authorization.
    tokenRef.current = data.access_token;
    configurePlatformApi({
      getAccessToken: () => tokenRef.current,
      customRequest: null,
      onAuthInvalid: (err) => {
        clearLocalSession(getApiErrorMessage(err));
      },
    });

    setSession({
      accessToken: data.access_token,
      sessionId: data.session_id,
      user: data.user,
    });
    return data.user;
  }, [clearLocalSession]);

  const logout = useCallback(async () => {
    if (externalAuth?.logout) {
      return externalAuth.logout();
    }
    const sid = session.sessionId;
    clearLocalSession(null);
    if (sid) {
      try {
        await apiRequest('/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EVRide-CSRF': '1',
            'X-Session-ID': sid,
          },
          body: {},
          credentials: 'include',
          skipAuthCallback: true,
        });
      } catch {
        // Phiên cục bộ đã được xóa khỏi bộ nhớ.
      }
    }
    return undefined;
  }, [externalAuth, session.sessionId, clearLocalSession]);

  const value = useMemo(
    () => ({
      user: activeUser,
      accessToken: activeToken,
      sessionId: activeSessionId,
      isAuthenticated: Boolean(activeUser && activeToken),
      authNotice,
      clearAuthNotice: () => setAuthNotice(null),
      login: externalAuth?.login || login,
      logout,
      hasRole: (...roles) => Boolean(activeUser && roles.includes(activeUser.role)),
    }),
    [activeUser, activeToken, activeSessionId, authNotice, externalAuth, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth phải được gọi bên trong AuthProvider.');
  }
  return ctx;
}

function StaffLoginGate() {
  const { login, authNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-card-header">
          <span className="badge badge-info">EVRide Operations</span>
          <h1>Đăng nhập vận hành (STAFF / MANAGER)</h1>
          <p className="muted">
            Cổng làm việc dành cho nhân viên vận hành và quản lý hệ thống cho thuê xe máy điện EVRide.
          </p>
        </div>

        {authNotice && (
          <div className="alert alert-warning" role="alert">
            {authNotice}
          </div>
        )}

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="stack-md">
          <div className="form-field">
            <label htmlFor="staff-login-email">Email tài khoản</label>
            <input
              id="staff-login-email"
              type="email"
              required
              autoComplete="username"
              placeholder="staff@evride.test hoặc manager@evride.test"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="staff-login-password">Mật khẩu</label>
            <input
              id="staff-login-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Nhập mật khẩu (12–128 ký tự)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập vào khu vực vận hành'}
          </button>
        </form>

        <p className="auth-footnote">
          Lưu ý tích hợp: Guard và cổng đăng nhập tạm thời chỉ giữ access token trong bộ nhớ phiên làm việc hiện tại;
          cơ chế Rolling Session / Refresh Rotation dùng chung sẽ được ghép từ #15.
        </p>
      </div>
    </div>
  );
}

export function RequireRole({ allowedRoles, children }) {
  const { isAuthenticated, user, logout } = useAuth();

  if (!isAuthenticated || !user) {
    return <StaffLoginGate />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="state-box state-error" role="alert">
        <p className="state-title">403 — Không có quyền truy cập</p>
        <p className="state-hint">
          Tài khoản hiện tại có vai trò <code>{user.role}</code>. Chức năng này chỉ dành cho{' '}
          <code>{allowedRoles.join(' / ')}</code>.
          <code className="error-code">FORBIDDEN</code>
        </p>
        {user.role === 'CUSTOMER' && (
          <button type="button" className="btn btn-danger" onClick={logout}>
            Đăng xuất tài khoản CUSTOMER
          </button>
        )}
      </div>
    );
  }

  return children;
}
