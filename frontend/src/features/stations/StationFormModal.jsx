import React, { useState } from 'react';
import { Button, ConfirmDialog, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { createStation, updateStation } from '../../services/fleetApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { mapApiFieldErrors, validateOperatingHours } from '../../utils/validation';

function formatTimeInput(timeStr) {
  if (!timeStr) return '';
  return String(timeStr).slice(0, 5);
}

export default function StationFormModal({ station = null, onClose, onSuccess }) {
  const isEdit = Boolean(station);
  const toast = useToast();

  const [form, setForm] = useState({
    name: station?.name || '',
    address: station?.address || '',
    latitude: station?.latitude ?? '',
    longitude: station?.longitude ?? '',
    capacity: station?.capacity ?? '',
    opens_at: formatTimeInput(station?.opens_at),
    closes_at: formatTimeInput(station?.closes_at),
    status: station?.status || 'ACTIVE',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);

  const buildPayload = () => {
    const errors = {};
    const name = form.name.trim();
    const address = form.address.trim();
    if (!name || name.length > 120) errors.name = 'Tên trạm phải từ 1 đến 120 ký tự.';
    if (!address) errors.address = 'Địa chỉ không được để trống.';

    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (form.latitude === '' || Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Vĩ độ phải từ -90 đến 90.';
    }
    if (form.longitude === '' || Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Kinh độ phải từ -180 đến 180.';
    }

    const cap = Number(form.capacity);
    if (!Number.isInteger(cap) || cap <= 0) {
      errors.capacity = 'Sức chứa phải là số nguyên lớn hơn 0.';
    }

    const hours = validateOperatingHours(form.opens_at, form.closes_at);
    if (hours.error) {
      errors.opens_at = hours.error;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return null;
    }

    const payload = {
      name,
      address,
      latitude: String(form.latitude).trim(),
      longitude: String(form.longitude).trim(),
      capacity: cap,
      opens_at: hours.opens_at,
      closes_at: hours.closes_at,
    };
    if (isEdit) {
      payload.status = form.status;
    }
    return payload;
  };

  const executeSave = async (payload) => {
    setSubmitting(true);
    setFormError('');
    setFieldErrors({});
    try {
      const res = isEdit
        ? await updateStation(station.id, payload)
        : await createStation(payload);
      toast.success(isEdit ? `Đã cập nhật trạm #${station.id}.` : 'Đã tạo trạm mới thành công.');
      onSuccess(res.data);
    } catch (err) {
      setFieldErrors(mapApiFieldErrors(err));
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    if (isEdit && station.status === 'ACTIVE' && payload.status === 'INACTIVE') {
      setConfirmDeactivateOpen(true);
      return;
    }
    executeSave(payload);
  };

  return (
    <>
      <Modal
        open
        title={isEdit ? `Cập nhật trạm #${station.id}` : 'Tạo trạm xe máy điện mới'}
        onClose={onClose}
        closeDisabled={submitting}
        footer={
          <>
            <Button onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" form="station-form" variant="primary" loading={submitting}>
              {isEdit ? 'Lưu thay đổi' : 'Tạo trạm'}
            </Button>
          </>
        }
      >
        <form id="station-form" onSubmit={handleSubmit} className="stack-md">
          <TextField
            label="Tên trạm"
            required
            maxLength={120}
            value={form.name}
            error={fieldErrors.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            label="Địa chỉ"
            required
            value={form.address}
            error={fieldErrors.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
          <div className="grid-2">
            <TextField
              label="Vĩ độ (latitude)"
              required
              type="number"
              step="any"
              value={form.latitude}
              error={fieldErrors.latitude}
              onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
            />
            <TextField
              label="Kinh độ (longitude)"
              required
              type="number"
              step="any"
              value={form.longitude}
              error={fieldErrors.longitude}
              onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
            />
          </div>
          <div className="grid-2">
            <TextField
              label="Sức chứa (chỗ đỗ)"
              required
              type="number"
              min={1}
              step={1}
              value={form.capacity}
              error={fieldErrors.capacity}
              hint={isEdit ? `Đang đỗ tại trạm: ${station.occupied_spaces} xe` : undefined}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            />
            {isEdit && (
              <SelectField
                label="Trạng thái trạm"
                value={form.status}
                options={[
                  { value: 'ACTIVE', label: 'Hoạt động (ACTIVE)' },
                  { value: 'INACTIVE', label: 'Ngừng hoạt động (INACTIVE)' },
                ]}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              />
            )}
          </div>
          <div className="grid-2">
            <TextField
              label="Giờ mở cửa (HH:mm)"
              type="time"
              value={form.opens_at}
              error={fieldErrors.opens_at}
              hint="Để trống cả 2 ô nếu mở 24/7"
              onChange={(e) => setForm((f) => ({ ...f, opens_at: e.target.value }))}
            />
            <TextField
              label="Giờ đóng cửa (HH:mm)"
              type="time"
              value={form.closes_at}
              hint="Hỗ trợ khoảng mở qua nửa đêm"
              onChange={(e) => setForm((f) => ({ ...f, closes_at: e.target.value }))}
            />
          </div>

          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDeactivateOpen}
        title="Ngừng hoạt động trạm?"
        message={`Trạm "${station?.name}" sẽ chuyển sang INACTIVE. Backend sẽ từ chối nếu trạm vẫn còn xe đang đỗ hoặc lượt giữ chỗ hiệu lực.`}
        confirmLabel="Xác nhận ngừng trạm"
        loading={submitting}
        onCancel={() => setConfirmDeactivateOpen(false)}
        onConfirm={() => {
          setConfirmDeactivateOpen(false);
          const payload = buildPayload();
          if (payload) executeSave(payload);
        }}
      />
    </>
  );
}
