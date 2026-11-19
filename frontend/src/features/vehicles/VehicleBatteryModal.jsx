import React, { useState } from 'react';
import { Button, Modal, TextField, TextareaField, useToast } from '../../components/ui';
import { updateVehicleBattery } from '../../services/fleetApi';
import { getApiErrorMessage } from '../../utils/errorMessages';

export default function VehicleBatteryModal({ vehicle, onClose, onSuccess }) {
  const toast = useToast();
  const [battery, setBattery] = useState(String(vehicle.battery_percent ?? 0));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const pct = Number(battery);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      setError('Mức pin phải là số nguyên từ 0 đến 100.');
      return;
    }
    if (!note.trim()) {
      setError('Vui lòng nhập ghi chú kiểm toán pin.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await updateVehicleBattery(vehicle.id, {
        battery_percent: pct,
        note: note.trim(),
      });
      toast.success(`Đã cập nhật pin xe #${vehicle.id} thành ${pct}%.`);
      onSuccess(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      title={`Cập nhật pin xe #${vehicle.id}`}
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" form="battery-form" variant="primary" loading={submitting}>
            Lưu mức pin
          </Button>
        </>
      }
    >
      <form id="battery-form" onSubmit={handleSubmit} className="stack-md">
        <p className="muted">
          <strong>{vehicle.name}</strong> ({vehicle.model}) — Pin hiện tại: {vehicle.battery_percent}%
        </p>
        <TextField
          label="Mức pin mới (0–100%)"
          required
          type="number"
          min={0}
          max={100}
          step={1}
          value={battery}
          hint="Xe dưới 30% pin không đủ điều kiện đặt hoặc nhận xe."
          onChange={(e) => setBattery(e.target.value)}
        />
        <TextareaField
          label="Ghi chú kiểm toán (bắt buộc)"
          required
          maxLength={2000}
          placeholder="Ví dụ: Đã sạc đầy tại trạm sau bảo trì."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
