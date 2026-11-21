import React, { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  FilterBar,
  SelectField,
  StatusBadge,
  useToast,
} from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import { listPromotions, updatePromotionStatus } from '../../services/accountsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { formatDateTimeVN, formatVnd } from '../../utils/format';
import PromotionCreateModal from './PromotionCreateModal';

export default function AdminPromotionList() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [togglingPromo, setTogglingPromo] = useState(null);
  const [togglingLoading, setTogglingLoading] = useState(false);

  const { data, meta, loading, error, reload } = useApiQuery(
    () => listPromotions({ status: status || undefined, page, page_size: pageSize }),
    [status, page, pageSize]
  );

  const nextStatusFor = (promo) => (promo.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');

  const handleToggleConfirm = async () => {
    if (!togglingPromo) return;
    const nextStatus = nextStatusFor(togglingPromo);
    setTogglingLoading(true);
    try {
      await updatePromotionStatus(togglingPromo.id, { status: nextStatus });
      toast.success(`Đã chuyển mã ${togglingPromo.code} sang ${nextStatus}.`);
      setTogglingPromo(null);
      reload();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setTogglingLoading(false);
    }
  };

  const columns = [
    { key: 'id', header: 'ID', render: (p) => `#${p.id}` },
    {
      key: 'code',
      header: 'Mã & Mô tả',
      render: (p) => (
        <div>
          <strong>
            <code>{p.code}</code>
          </strong>
          {p.description && <div className="muted">{p.description}</div>}
        </div>
      ),
    },
    {
      key: 'discount',
      header: 'Mức giảm & Điều kiện',
      render: (p) => (
        <div>
          <div>
            <StatusBadge domain="promotionType" value={p.discount_type} />{' '}
            <strong>
              {p.discount_type === 'PERCENTAGE'
                ? `${Number(p.discount_value)}%`
                : formatVnd(p.discount_value)}
            </strong>
          </div>
          <div className="muted">
            {p.max_discount_amount ? `Tối đa ${formatVnd(p.max_discount_amount)} · ` : ''}
            {p.min_rental_amount ? `Đơn tối thiểu ${formatVnd(p.min_rental_amount)} · ` : ''}
            {p.vehicle_model ? `Mẫu ${p.vehicle_model}` : 'Mọi mẫu xe'}
          </div>
        </div>
      ),
    },
    {
      key: 'usage',
      header: 'Đã dùng / Hạn mức',
      render: (p) => `${p.used_count} / ${p.usage_limit}`,
    },
    {
      key: 'period',
      header: 'Thời gian hiệu lực',
      render: (p) => (
        <div>
          <div>Từ: {formatDateTimeVN(p.start_date)}</div>
          <div>Đến: {formatDateTimeVN(p.end_date)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (p) => <StatusBadge domain="promotionStatus" value={p.status} />,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (p) => (
        <Button
          size="sm"
          variant={p.status === 'ACTIVE' ? 'danger' : 'primary'}
          onClick={() => setTogglingPromo(p)}
        >
          {p.status === 'ACTIVE' ? 'Tắt mã (DISABLED)' : 'Bật lại (ACTIVE)'}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Quản lý khuyến mãi (MANAGER)</h2>
          <p className="muted">
            Tạo mới và bật/tắt trạng thái khuyến mãi. Không áp dụng khuyến mãi cho hồ sơ sự cố đã xác nhận.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Tạo mã khuyến mãi
        </Button>
      </div>

      <FilterBar
        onReset={() => {
          setStatus('');
          setPage(1);
        }}
      >
        <SelectField
          label="Trạng thái"
          value={status}
          placeholder="Tất cả"
          options={[
            { value: 'ACTIVE', label: 'Đang bật (ACTIVE)' },
            { value: 'DISABLED', label: 'Đã tắt (DISABLED)' },
          ]}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data || []}
        loading={loading}
        error={error}
        onRetry={reload}
        meta={meta}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        emptyTitle="Chưa có chương trình khuyến mãi nào"
        emptyHint="Nhấn '+ Tạo mã khuyến mãi' để thêm mới."
      />

      {creating && (
        <PromotionCreateModal
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(togglingPromo)}
        title="Xác nhận đổi trạng thái khuyến mãi"
        message={
          togglingPromo
            ? `Chuyển mã ${togglingPromo.code} sang ${nextStatusFor(togglingPromo)}?`
            : ''
        }
        confirmLabel="Xác nhận"
        variant={togglingPromo?.status === 'ACTIVE' ? 'danger' : 'primary'}
        loading={togglingLoading}
        onCancel={() => setTogglingPromo(null)}
        onConfirm={handleToggleConfirm}
      />
    </div>
  );
}
