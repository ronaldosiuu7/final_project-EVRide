import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../integrations/authBridge.jsx';
import { Button, TextField, useToast } from '../../components/ui/index.js';
import ElectricScooterIllustration from '../../components/customer/ElectricScooterIllustration.jsx';
import {
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  ShieldCheckIcon,
} from '../../components/customer/CustomerIcons.jsx';
import { getApiErrorMessage } from '../../utils/errorMessages.js';
import { mapApiFieldErrors } from '../../utils/validation.js';

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || trimmedName.length > 100) {
      errors.name = 'Họ và tên phải từ 1 đến 100 ký tự.';
    }
    if (!trimmedEmail || trimmedEmail.length > 100 || !SIMPLE_EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = 'Vui lòng nhập địa chỉ email hợp lệ (tối đa 100 ký tự).';
    }
    // Contract: KHÔNG trim mật khẩu, độ dài từ 12 đến 128 ký tự.
    if (password.length < 12 || password.length > 128) {
      errors.password = 'Mật khẩu phải có độ dài từ 12 đến 128 ký tự.';
    }
    if (confirmPassword !== password) {
      errors.confirm_password = 'Mật khẩu nhập lại chưa khớp.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');

    try {
      await register({
        name: trimmedName,
        email: trimmedEmail,
        password,
      });
      toast.success('Tạo tài khoản thành công! Vui lòng đăng nhập.');
      navigate('/login', {
        replace: true,
        state: {
          registeredEmail: trimmedEmail,
          registeredSuccess: true,
        },
      });
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-wrap">
      <div className="auth-split-shell">
        <aside className="auth-brand-aside" aria-label="Quyền lợi tài khoản khách hàng EVRide">
          <div>
            <Link to="/" className="customer-brand" aria-label="Về trang chủ EVRide">
              <span className="customer-brand-mark">
                <BoltIcon size={18} />
              </span>
              <span className="customer-brand-text">
                <strong>EVRide</strong>
                <small>Thuê xe máy điện theo trạm</small>
              </span>
            </Link>

            <h2 className="auth-aside-title">
              Bắt đầu hành trình xanh chỉ với vài bước đơn giản
            </h2>
            <p className="auth-aside-desc">
              Tạo tài khoản khách hàng kèm ví tiền mô phỏng để tìm trạm, nộp giấy tờ CCCD và giữ xe máy điện thuận tiện.
            </p>

            <ul className="auth-aside-points">
              <li className="auth-aside-point">
                <ShieldCheckIcon size={17} />
                <span>Hồ sơ CCCD lưu trữ riêng tư, chỉ tải qua phiên đăng nhập hợp lệ.</span>
              </li>
              <li className="auth-aside-point">
                <ClockIcon size={17} />
                <span>Chủ động chọn trạm nhận xe và xem báo giá minh bạch trước khi trả.</span>
              </li>
              <li className="auth-aside-point">
                <CheckCircleIcon size={17} />
                <span>Theo dõi lịch sử chuyến thuê, ví điện tử và mã khuyến mãi trên một nơi.</span>
              </li>
            </ul>
          </div>

          <ElectricScooterIllustration compact />
        </aside>

        <div className="auth-panel">
          <div className="auth-panel-header">
            <Link to="/" className="customer-brand auth-panel-mobile-brand" aria-label="Về trang chủ EVRide">
              <span className="customer-brand-mark">
                <BoltIcon size={18} />
              </span>
              <span>EVRide</span>
            </Link>
            <h1>Đăng ký tài khoản khách hàng</h1>
            <p className="muted">
              Tạo tài khoản miễn phí kèm ví tiền mô phỏng để tìm trạm, xác minh giấy tờ và giữ xe máy điện trong 30 phút.
            </p>
          </div>

          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="stack-md" noValidate>
            <TextField
              id="register-name"
              label="Họ và tên"
              required
              maxLength={100}
              autoComplete="name"
              placeholder="Nguyễn Văn A"
              value={name}
              error={fieldErrors.name}
              onChange={(e) => setName(e.target.value)}
            />

            <TextField
              id="register-email"
              label="Địa chỉ email"
              type="email"
              required
              maxLength={100}
              autoComplete="email"
              placeholder="khachhang@example.com"
              value={email}
              error={fieldErrors.email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <TextField
              id="register-password"
              label="Mật khẩu (12–128 ký tự)"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              placeholder="Tối thiểu 12 ký tự"
              hint="Hệ thống giữ nguyên khoảng trắng nếu bạn đặt mật khẩu có khoảng trắng."
              value={password}
              error={fieldErrors.password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <TextField
              id="register-confirm-password"
              label="Xác nhận mật khẩu"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu ở trên"
              value={confirmPassword}
              error={fieldErrors.confirm_password}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <Button type="submit" variant="primary" className="btn-block" loading={submitting}>
              {submitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}
            </Button>
          </form>

          <div className="auth-links-row">
            <span>
              Đã có tài khoản? <Link to="/login">Đăng nhập ngay</Link>
            </span>
            <Link to="/">Trang chủ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
