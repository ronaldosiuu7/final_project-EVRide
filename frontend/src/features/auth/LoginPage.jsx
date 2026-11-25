import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import { resolvePostLoginPath } from '../../integrations/authSession.js';
import { Button, TextField } from '../../components/ui/index.js';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import { mapApiFieldErrors } from '../../utils/validation.js';

export default function LoginPage() {
  const { login, authNotice, clearAuthNotice } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const prefilledEmail = location.state?.registeredEmail || '';
  const registeredSuccess = Boolean(location.state?.registeredSuccess);

  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextFieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      nextFieldErrors.email = 'Vui lòng nhập địa chỉ email.';
    }
    if (!password) {
      nextFieldErrors.password = 'Vui lòng nhập mật khẩu.';
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    clearAuthNotice();

    try {
      const loggedInUser = await login(trimmedEmail, password);
      const destination = resolvePostLoginPath(loggedInUser, location.state?.from);
      navigate(destination, { replace: true });
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-wrap">
      <div className="auth-panel">
        <div className="auth-panel-header">
          <Link to="/" className="customer-brand" aria-label="Về trang chủ EVRide">
            <span className="customer-brand-mark">EV</span>
            <span>EVRide</span>
          </Link>
          <h1>Đăng nhập hệ thống</h1>
          <p className="muted">
            Sử dụng tài khoản EVRide để đặt xe máy điện theo trạm hoặc truy cập khu vực vận hành được phân quyền.
          </p>
        </div>

        {registeredSuccess && !authNotice && !formError && (
          <div className="alert alert-success" role="status">
            Đăng ký tài khoản thành công! Vui lòng đăng nhập để bắt đầu sử dụng dịch vụ.
          </div>
        )}

        {authNotice && (
          <div className="alert alert-warning" role="alert">
            {authNotice}
          </div>
        )}

        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="stack-md" noValidate>
          <TextField
            label="Địa chỉ email"
            type="email"
            required
            maxLength={100}
            autoComplete="username"
            placeholder="ten.ban@example.com"
            value={email}
            error={fieldErrors.email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <TextField
            label="Mật khẩu"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Nhập mật khẩu của bạn"
            value={password}
            error={fieldErrors.password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" variant="primary" className="btn-block" loading={submitting}>
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>

        <div className="auth-links-row">
          <span>
            Chưa có tài khoản? <Link to="/register">Đăng ký khách hàng</Link>
          </span>
          <Link to="/">Trang chủ</Link>
        </div>
      </div>
    </div>
  );
}
