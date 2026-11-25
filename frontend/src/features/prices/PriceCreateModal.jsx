import React, { useState } from 'react';
import { Button, ConfirmDialog, Modal, TextField, useToast } from '../../components/ui';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import { createPriceVersion } from '../../services/fleetApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { isPositiveIdString, mapApiFieldErrors, normalizeMoneyString } from '../../utils/validation';

export default function PriceCreateModal({ initialVehicle = null, onClose, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({
    vehicle_id: initialVehicle?.id || '',
    first_30_minutes_price: initialVehicle?.first_30_minutes_price || '10000.00',
    extra_minute_price: initialVehicle?.extra_minute_price || '350.00',
    deposit_amount: initialVehicle?.deposit_amount || '100000.00',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    createPriceVersion(payload, idempotencyKey)
  );

  const validateAndBuild = () => {
    const errors = {};
    if (!isPositiveIdString(form.vehicle_id)) {
      errors.vehicle_id = 'ID xe phải là chuỗi số nguyên dương.';
    }
    const first30 = normalizeMoneyString(form.first_30_minutes_price);
    const extra = normalizeMoneyString(form.extra_minute_price);
    const deposit = normalizeMoneyString(form.deposit_amount);
    if (!first30) errors.first_30_minutes_price = 'Giá 30 phút đầu không hợp lệ.';
    if (!extra) errors.extra_minute_price = 'Giá mỗi phút thêm không hợp lệ.';
    if (!deposit) errors.deposit_amount = 'Tiền cọc không hợp lệ.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return null;
    }
    setFieldErrors({});
    return {
      vehicle_id: String(form.vehicle_id).trim(),
      first_30_minutes_price: first30,
      extra_minute_price: extra,
      deposit_amount: deposit,
    };
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    const payload = validateAndBuild();
    if (!payload) return;
    try {
      const res = await mutation.execute(`price_create_${payload.vehicle_id}`, payload);
      toast.success(`Đã áp dụng phiên bản giá v${res.data.version_number} cho xe #${payload.vehicle_id}.`);
      onSuccess(res.data);
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
    }
  };

  return (
    <>
      <Modal
        open
        size="sm"
        title="Áp dụng phiên bản giá / cọc mới (MANAGER)"
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={mutation.loading}
              onClick={() => {
                if (validateAndBuild()) setConfirmOpen(true);
              }}
            >
              Áp dụng giá mới
            </Button>
          </>
        }
      >
        <div className="alert alert-info">
          Giá mới chỉ áp dụng cho lượt giữ/thuê tạo sau thời điểm cập nhật; không sửa snapshot của các chuyến đã giữ hoặc đang thuê.
        </div>

        <TextField
          label="ID xe máy điện"
          required
          disabled={Boolean(initialVehicle)}
          value={form.vehicle_id}
          error={fieldErrors.vehicle_id}
          onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}
        />
        <TextField
          label="Giá 30 phút đầu (VND)"
          required
          value={form.first_30_minutes_price}
          error={fieldErrors.first_30_minutes_price}
          onChange={(e) => setForm((f) => ({ ...f, first_30_minutes_price: e.target.value }))}
        />
        <TextField
          label="Giá mỗi phút thêm (VND)"
          required
          value={form.extra_minute_price}
          error={fieldErrors.extra_minute_price}
          onChange={(e) => setForm((f) => ({ ...f, extra_minute_price: e.target.value }))}
        />
        <TextField
          label="Tiền cọc (VND)"
          required
          value={form.deposit_amount}
          error={fieldErrors.deposit_amount}
          onChange={(e) => setForm((f) => ({ ...f, deposit_amount: e.target.value }))}
        />

        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận áp dụng bảng giá mới"
        message={`Tạo phiên bản giá mới cho xe #${form.vehicle_id}? Bản ghi lịch sử trước đó không thể chỉnh sửa hoặc xóa.`}
        confirmLabel="Xác nhận áp dụng"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
