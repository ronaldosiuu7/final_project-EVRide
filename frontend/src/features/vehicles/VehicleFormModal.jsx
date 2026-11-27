import React, { useState } from 'react';
import { Button, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { createVehicle, updateVehicle } from '../../services/fleetApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { mapApiFieldErrors, normalizeMoneyString } from '../../utils/validation';

export default function VehicleFormModal({ vehicle = null, stations = [], onClose, onSuccess }) {
  const isEdit = Boolean(vehicle);
  const toast = useToast();

  const activeStations = (stations || []).filter((s) => s.status === 'ACTIVE');

  const [form, setForm] = useState({
    current_station_id: vehicle?.current_station_id || activeStations[0]?.id || '',
    name: vehicle?.name || '',
    model: vehicle?.model || '',
    battery_percent: vehicle?.battery_percent ?? '100',
    first_30_minutes_price: vehicle?.first_30_minutes_price || '10000.00',
    extra_minute_price: vehicle?.extra_minute_price || '350.00',
    deposit_amount: vehicle?.deposit_amount || '100000.00',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    const name = form.name.trim();
    const model = form.model.trim();
    if (!name || name.length > 100) errors.name = 'Tên xe từ 1 đến 100 ký tự.';
    if (!model || model.length > 100) errors.model = 'Mẫu xe (model) từ 1 đến 100 ký tự.';

    let payload;
    if (isEdit) {
      payload = { name, model };
    } else {
      if (!form.current_station_id) {
        errors.current_station_id = 'Vui lòng chọn trạm ACTIVE còn chỗ đỗ.';
      }
      const battery = Number(form.battery_percent);
      if (!Number.isInteger(battery) || battery < 0 || battery > 100) {
        errors.battery_percent = 'Pin phải là số nguyên từ 0 đến 100.';
      }
      const first30 = normalizeMoneyString(form.first_30_minutes_price);
      const extraMin = normalizeMoneyString(form.extra_minute_price);
      const deposit = normalizeMoneyString(form.deposit_amount);
      if (!first30) errors.first_30_minutes_price = 'Giá tiền không hợp lệ (ví dụ 10000.00).';
      if (!extraMin) errors.extra_minute_price = 'Giá tiền không hợp lệ (ví dụ 350.00).';
      if (!deposit) errors.deposit_amount = 'Tiền cọc không hợp lệ (ví dụ 100000.00).';

      payload = {
        current_station_id: String(form.current_station_id),
        name,
        model,
        battery_percent: battery,
        first_30_minutes_price: first30,
        extra_minute_price: extraMin,
        deposit_amount: deposit,
      };
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      const res = isEdit
        ? await updateVehicle(vehicle.id, payload)
        : await createVehicle(payload);
      toast.success(isEdit ? `Đã cập nhật xe #${vehicle.id}.` : 'Đã thêm xe máy điện mới.');
      onSuccess(res.data);
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
      title={isEdit ? `Sửa thông tin xe #${vehicle.id}` : 'Thêm xe máy điện mới'}
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" form="vehicle-form" variant="primary" loading={submitting}>
            {isEdit ? 'Lưu thay đổi' : 'Tạo xe'}
          </Button>
        </>
      }
    >
      <form id="vehicle-form" onSubmit={handleSubmit} className="stack-md">
        <TextField
          label="Tên / biển số xe máy điện"
          required
          maxLength={100}
          placeholder="Ví dụ: VinFast Klara S - 29AA-123.45"
          value={form.name}
          error={fieldErrors.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <TextField
          label="Dòng xe"
          required
          maxLength={100}
          placeholder="Ví dụ: Klara S, Feliz S, Evo200..."
          value={form.model}
          error={fieldErrors.model}
          onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
        />

        {!isEdit && (
          <>
            <SelectField
              label="Trạm tiếp nhận ban đầu"
              required
              value={form.current_station_id}
              error={fieldErrors.current_station_id}
              placeholder="Chọn trạm đang hoạt động"
              options={activeStations.map((s) => ({
                value: s.id,
                label: `#${s.id} - ${s.name} (Trống ${s.available_spaces}/${s.capacity})`,
                disabled: s.available_spaces <= 0,
              }))}
              onChange={(e) => setForm((f) => ({ ...f, current_station_id: e.target.value }))}
            />
            <TextField
              label="Mức pin hiện tại (%)"
              required
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.battery_percent}
              error={fieldErrors.battery_percent}
              onChange={(e) => setForm((f) => ({ ...f, battery_percent: e.target.value }))}
            />
            <div className="grid-2">
              <TextField
                label="Giá 30 phút đầu (VND)"
                required
                value={form.first_30_minutes_price}
                error={fieldErrors.first_30_minutes_price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, first_30_minutes_price: e.target.value }))
                }
              />
              <TextField
                label="Giá mỗi phút thêm (VND)"
                required
                value={form.extra_minute_price}
                error={fieldErrors.extra_minute_price}
                onChange={(e) => setForm((f) => ({ ...f, extra_minute_price: e.target.value }))}
              />
            </div>
            <TextField
              label="Tiền cọc mặc định (VND)"
              required
              value={form.deposit_amount}
              error={fieldErrors.deposit_amount}
              hint="Muốn điều chỉnh giá sau khi tạo, hãy sử dụng mục Bảng giá theo xe."
              onChange={(e) => setForm((f) => ({ ...f, deposit_amount: e.target.value }))}
            />
          </>
        )}

        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}
      </form>
    </Modal>
  );
}
