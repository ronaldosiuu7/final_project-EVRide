// Cầu nối React Context & Route Guards dùng chung cho toàn bộ EVRide (#15 CUSTOMER & #16 STAFF/MANAGER).
// Gắn kết trực tiếp `authSession` (Rolling Session, Web Locks, BroadcastChannel) với `apiClient`
// kèm ngữ cảnh phiên nguyên tử tại thời điểm gửi request (getSessionContext, failedToken thực tế, sessionId, epoch).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { configurePlatformApi } from './apiClient.js';
import {
  evaluateRouteAccess,
  getDefaultAuthSessionManager,
  resolvePostLoginPath,
} from './authSession.js';
import { LoadingState } from '../components/ui/index.js';
import ForbiddenPage from '../features/auth/ForbiddenPage.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children, externalAuth = null, sessionManager = null }) {
  const activeManager = sessionManager || getDefaultAuthSessionManager();
  const [authState, setAuthState] = useState(() => activeManager.getState());

  // Cấu hình đồng bộ cho apiClient ngay trong pha render để mọi request con chụp đúng
  // token & (sessionId, epoch) tại thời điểm gửi request.
  if (externalAuth) {
    configurePlatformApi({
      getAccessToken: externalAuth.getAccessToken || (() => externalAuth.accessToken || null),
      getSessionContext:
        externalAuth.getSessionContext ||
        (() => ({
          accessToken: externalAuth.accessToken || null,
          sessionId: externalAuth.sessionId || null,
          epoch: externalAuth.epoch || null,
          isLoggingOut: Boolean(externalAuth.isLoggingOut),
        })),
      onTokenExpired: externalAuth.onTokenExpired || null,
      onAuthInvalid: externalAuth.onAuthInvalid || null,
      customRequest: externalAuth.request || null,
    });
  } else {
    configurePlatformApi({
      getAccessToken: () => activeManager.getAccessToken(),
      getSessionContext: () => activeManager.getSessionContext(),
      onTokenExpired: ({ failedToken, sessionId, epoch }) =>
        activeManager.refreshAccessToken({
          failedToken,
          expectedSessionId: sessionId,
          expectedEpoch: epoch,
        }),
      onAuthInvalid: (err, requestAuthContext) =>
        activeManager.handleAuthInvalid(err, requestAuthContext),
      customRequest: null,
    });
  }

  useEffect(() => {
    if (externalAuth) return undefined;
    const unsubscribe = activeManager.subscribe((nextSnapshot) => {
      setAuthState(nextSnapshot);
    });
    void activeManager.bootstrap();
    return unsubscribe;
  }, [externalAuth, activeManager]);

  const login = useCallback(
    (email, password) => {
      if (externalAuth?.login) {
        return externalAuth.login(email, password);
      }
      return activeManager.login(email, password);
    },
    [externalAuth, activeManager]
  );

  const register = useCallback(
    (payload) => {
      if (externalAuth?.register) {
        return externalAuth.register(payload);
      }
      return activeManager.register(payload);
    },
    [externalAuth, activeManager]
  );

  const logout = useCallback(
    (options) => {
      const normalizedOptions =
        options && typeof options === 'object' && !('nativeEvent' in options) ? options : {};
      if (externalAuth?.logout) {
        return externalAuth.logout(normalizedOptions);
      }
      return activeManager.logout(normalizedOptions);
    },
    [externalAuth, activeManager]
  );

  const changePassword = useCallback(
    (payload) => {
      if (externalAuth?.changePassword) {
        return externalAuth.changePassword(payload);
      }
      return activeManager.changePassword(payload);
    },
    [externalAuth, activeManager]
  );

  const refreshSession = useCallback(() => {
    if (externalAuth?.refreshSession) {
      return externalAuth.refreshSession();
    }
    return activeManager.refreshAccessToken();
  }, [externalAuth, activeManager]);

  const updateSessionUser = useCallback(
    (partialUser) => {
      if (externalAuth?.updateSessionUser) {
        return externalAuth.updateSessionUser(partialUser);
      }
      return activeManager.updateUserProfile(partialUser);
    },
    [externalAuth, activeManager]
  );

  const clearAuthNotice = useCallback(
    () => {
      if (externalAuth?.clearAuthNotice) {
        return externalAuth.clearAuthNotice();
      }
      return activeManager.clearAuthNotice();
    },
    [externalAuth, activeManager]
  );

  const activeUser = externalAuth ? externalAuth.user : authState.user;
  const activeToken = externalAuth ? externalAuth.accessToken : authState.accessToken;
  const activeSessionId = externalAuth ? externalAuth.sessionId : authState.sessionId;
  const activeGeneration = externalAuth ? externalAuth.generation ?? 0 : authState.generation;
  const isBootstrapping = externalAuth ? Boolean(externalAuth.isBootstrapping) : authState.isBootstrapping;
  const authNotice = externalAuth ? externalAuth.authNotice || null : authState.authNotice;
  const isAuthenticated = Boolean(activeUser && activeToken);

  const value = useMemo(
    () => ({
      user: activeUser,
      accessToken: activeToken,
      sessionId: activeSessionId,
      generation: activeGeneration,
      isAuthenticated,
      isBootstrapping,
      authNotice,
      clearAuthNotice,
      login,
      register,
      logout,
      changePassword,
      refreshSession,
      updateSessionUser,
      hasRole: (...roles) => Boolean(activeUser && roles.includes(activeUser.role)),
    }),
    [
      activeUser,
      activeToken,
      activeSessionId,
      activeGeneration,
      isAuthenticated,
      isBootstrapping,
      authNotice,
      clearAuthNotice,
      login,
      register,
      logout,
      changePassword,
      refreshSession,
      updateSessionUser,
    ]
  );

  // Remount private queries, forms, blob URLs and toasts when identity changes.
  // Token rotation/profile edits deliberately retain the same boundary.
  const identityKey = JSON.stringify([activeSessionId || null, activeUser?.id || null, activeUser?.role || null]);
  return <AuthContext.Provider value={value}><React.Fragment key={identityKey}>{children}</React.Fragment></AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth phải được gọi bên trong AuthProvider.');
  }
  return ctx;
}

export function RequireAuth({ children }) {
  const { isBootstrapping, isAuthenticated, user } = useAuth();
  const location = useLocation();

  const decision = evaluateRouteAccess({
    isBootstrapping,
    isAuthenticated,
    user,
    allowedRoles: [],
  });

  if (decision.status === 'bootstrapping') {
    return <LoadingState message="Đang khôi phục phiên đăng nhập..." />;
  }

  if (decision.status === 'unauthenticated') {
    const from = `${location.pathname}${location.search || ''}`;
    return <Navigate to="/login" state={{ from }} replace />;
  }

  return children;
}

export function RequireRole({ allowedRoles, children }) {
  const { isBootstrapping, isAuthenticated, user } = useAuth();
  const location = useLocation();

  const decision = evaluateRouteAccess({
    isBootstrapping,
    isAuthenticated,
    user,
    allowedRoles,
  });

  if (decision.status === 'bootstrapping') {
    return <LoadingState message="Đang khôi phục phiên đăng nhập..." />;
  }

  if (decision.status === 'unauthenticated') {
    const from = `${location.pathname}${location.search || ''}`;
    return <Navigate to="/login" state={{ from }} replace />;
  }

  if (decision.status === 'forbidden') {
    return <ForbiddenPage allowedRoles={allowedRoles} />;
  }

  return children;
}

export function GuestOnlyRoute({ children }) {
  const { isBootstrapping, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <LoadingState message="Đang kiểm tra phiên đăng nhập..." />;
  }

  if (isAuthenticated && user) {
    const destination = resolvePostLoginPath(user, location.state?.from);
    return <Navigate to={destination} replace />;
  }

  return children;
}
