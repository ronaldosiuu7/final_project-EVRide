import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  SelectField,
  StatusBadge,
  useToast,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import { useAuth } from '../../integrations/authBridge';
import { getUser, getUserWallet, updateWalletStatus } from '../../services/accountsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { formatDateTimeVN, formatVnd } from '../../utils/format';
import UserEditModal from './UserEditModal';

export default function UserDetailPage() {
  const { userId } = useParams();
  const toast = useToast();
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');

  const [editing, setEditing] = useState(false);
  const [nextWalletStatus, setNextWalletStatus] = useState('');
  const [confirmWalletOpen, setConfirmWalletOpen] = useState(false);
  const [walletSaving, setWalletSaving] = useState(false);

  const userQuery = useApiQuery(() => getUser(userId), [userId]);
  const walletQuery = useApiQuery(
    () => getUserWallet(userId),
    [userId],
    { enabled: isManager }
  );

  if (userQuery.loading) return <LoadingState />;
  if (userQuery.error) return <ErrorState error={userQuery.error} onRetry={userQuery.reload} />;

  const targetUser = userQuery.data;
  if (!targetUser) return null;

  const wallet = walletQuery.data;

  const handleConfirmWalletStatus = async () => {
    if (!wallet || !nextWalletStatus) return;
    setWalletSaving(true);
    try {
      await updateWalletStatus(wallet.id, { status: nextWalletStatus });
      toast.success(`Đã chuyển trạng thái ví #${wallet.id} sang ${nextWalletStatus}.`);
      setConfirmWalletOpen(false);
      walletQuery.reload();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setWalletSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <Link to="/admin/users">← Quay lại danh sách tài khoản</Link>
          <h2>
            Tài khoản #{targetUser.id}: {targetUser.name}
          </h2>
        </div>
        <div className="page-header-actions">
          {targetUser.role === 'CUSTOMER' && (
            <Link to={`/admin/rentals?customer_id=${targetUser.id}`} className="btn">
              Xem chuyến thuê của khách
            </Link>
          )}
          {isManager && (
            <Button variant="primary" onClick={() => setEditing(true)}>
              Sửa / Khóa tài khoản
            </Button>
          )}
        </div>
      </div>

      <div className="card">
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>Email</dt>
            <dd>{targetUser.email}</dd>
          </div>
          <div className="detail-item">
            <dt>Vai trò</dt>
            <dd>
              <StatusBadge domain="userRole" value={targetUser.role} />
            </dd>
          </div>
          <div className="detail-item">
            <dt>Trạng thái</dt>
            <dd>
              <StatusBadge domain="userStatus" value={targetUser.status} />
            </dd>
          </div>
          <div className="detail-item">
            <dt>Ngày tạo</dt>
            <dd>{formatDateTimeVN(targetUser.created_at)}</dd>
          </div>
        </dl>
      </div>

      <div className="card stack-md">
        <div className="card-header">
          <h3>Thông tin ví người dùng (chỉ MANAGER)</h3>
          {wallet && <StatusBadge domain="walletStatus" value={wallet.status} />}
        </div>

        {!isManager ? (
          <div className="alert alert-info">
            Chỉ tài khoản <strong>MANAGER</strong> mới được xem ví khách hàng và thay đổi trạng thái ví (<code>GET /users/{userId}/wallet</code>).
          </div>
        ) : walletQuery.loading ? (
          <LoadingState message="Đang tải thông tin ví..." />
        ) : walletQuery.error ? (
          <ErrorState error={walletQuery.error} onRetry={walletQuery.reload} />
        ) : wallet ? (
          <>
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>ID Ví</dt>
                <dd>#{wallet.id}</dd>
              </div>
              <div className="detail-item">
                <dt>Số dư hiện tại (Chỉ đọc — không sửa trực tiếp)</dt>
                <dd>
                  <strong>{formatVnd(wallet.balance)}</strong>
                </dd>
              </div>
              <div className="detail-item">
                <dt>Cập nhật lần cuối</dt>
                <dd>{formatDateTimeVN(wallet.updated_at)}</dd>
              </div>
            </dl>

            <div className="row-wrap">
              <SelectField
                label="Đổi trạng thái ví"
                value={nextWalletStatus || wallet.status}
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE (Hoạt động)' },
                  { value: 'FROZEN', label: 'FROZEN (Đóng băng)' },
                  { value: 'LOCKED', label: 'LOCKED (Khóa ví)' },
                ]}
                onChange={(e) => setNextWalletStatus(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={!nextWalletStatus || nextWalletStatus === wallet.status}
                onClick={() => setConfirmWalletOpen(true)}
              >
                Áp dụng trạng thái ví
              </Button>
            </div>

            <div className="alert alert-info">
              Ghi chú API: Backend hiện chưa có endpoint cho STAFF/MANAGER tra cứu trực tiếp danh sách <code>wallet_transactions</code> của khách (<code>GET /users/&#123;id&#125;/wallet/transactions</code>). Nhân viên có thể xem giao dịch theo từng chuyến qua <Link to={`/admin/rentals?customer_id=${targetUser.id}`}>danh sách chuyến thuê</Link>.
            </div>
          </>
        ) : null}
      </div>

      {editing && (
        <UserEditModal
          user={targetUser}
          onClose={() => setEditing(false)}
          onSuccess={() => {
            setEditing(false);
            userQuery.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmWalletOpen}
        title="Xác nhận đổi trạng thái ví"
        message={`Chuyển ví #${wallet?.id} sang trạng thái ${nextWalletStatus}? Khi ví không ACTIVE, khách hàng sẽ không thể giữ xe, nhận xe hoặc thanh toán.`}
        confirmLabel="Xác nhận"
        loading={walletSaving}
        onCancel={() => setConfirmWalletOpen(false)}
        onConfirm={handleConfirmWalletStatus}
      />
    </div>
  );
}
