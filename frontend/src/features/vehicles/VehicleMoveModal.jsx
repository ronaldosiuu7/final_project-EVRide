import React, { useState } from 'react';
import { Button, ConfirmDialog, Modal, SelectField, TextareaField, useToast } from '../../components/ui';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import { moveVehicle } from '../../services/fleetApi';
import { getApiErrorMessage } from '../../utils/errorMessages';

export default function VehicleMoveModal({ vehicle, stations = [], onClose, onSuccess }) {
  const toast = useToast();
  const eligibleStations = (stations || []).filter(
    (s) => s.status === 'ACTIVE' && s.id !== vehicle.current_station_id && s.available_spaces > 0
  );
  const currentStation = (stations || []).find((s) => s.id === vehicle.current_station_id);

  const [targetStationId, setTargetStationId] = useState(eligibleStations[0]?.id || '');
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    moveVehicle(vehicle.id, payload, idempotencyKey)
  );

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      const payload = { target_station_id: String(targetStationId) };
      if (note.trim()) {
        payload.note = note.trim();
      }
      const res = await mutation.execute(`vehicle_move_${vehicle.id}`, payload);
      toast.success(`Đã điều chuyển xe #${vehicle.id} sang trạm #${targetStationId}.`);
      onSuccess(res.data);
    } catch {
      // Lỗi hiển thị ngay trên modal; giữ Idempotency-Key để thử lại an toàn.
    }
  };

  return (
    <>
      <Modal
        open
        size="sm"
        title={`Điều chuyển xe #${vehicle.id}`}
        onClose={onClose}
        closeDisabled={mutation.loading}
        footer={
          <>
            <Button onClick={onClose} disabled={mutation.loading}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={!targetStationId || eligibleStations.length === 0}
              loading={mutation.loading}
              onClick={() => setConfirmOpen(true)}
            >
              Điều chuyển xe
            </Button>
          </>
        }
      >
        <p className="muted">
          <strong>{vehicle.name}</strong> ({vehicle.model}) — Trạm hiện tại:{' '}
          {currentStation ? `${currentStation.name} (#${currentStation.id})` : 'Không ở trạm'}
        </p>

        {eligibleStations.length === 0 ? (
          <div className="alert alert-warning" role="alert">
            Không có trạm ACTIVE nào khác còn chỗ trống để điều chuyển.
          </div>
        ) : (
          <SelectField
            label="Trạm đích (ACTIVE còn chỗ trống)"
            required
            value={targetStationId}
            options={eligibleStations.map((s) => ({
              value: s.id,
              label: `#${s.id} - ${s.name} (Trống ${s.available_spaces}/${s.capacity})`,
            }))}
            onChange={(e) => setTargetStationId(e.target.value)}
          />
        )}

        <TextareaField
          label="Ghi chú điều chuyển (tùy chọn)"
          maxLength={2000}
          placeholder="Ví dụ: Điều phối xe sang trạm đông khách..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {mutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận điều chuyển xe"
        message={`Điều chuyển xe #${vehicle.id} sang trạm #${targetStationId}?`}
        confirmLabel="Xác nhận điều chuyển"
        variant="primary"
        loading={mutation.loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
