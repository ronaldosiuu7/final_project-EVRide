import React, { useState } from 'react';
import { moveVehicle } from '../../services/mockApi';
import { getErrorMessage } from '../../components/common/ErrorState';

// Modal điều chuyển xe sang trạm đích (POST /vehicles/{id}/move).
// Chỉ cho phép chọn trạm ACTIVE khác trạm hiện tại và còn chỗ trống.
const VehicleMoveModal = ({ vehicle, stations, onClose, onSuccess }) => {
  const eligibleStations = (stations || []).filter(
    (s) => s.status === 'ACTIVE' && s.id !== vehicle.current_station_id && s.available_spaces > 0
  );
  const [targetStationId, setTargetStationId] = useState(eligibleStations[0]?.id || '');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const currentStation = (stations || []).find((s) => s.id === vehicle.current_station_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await moveVehicle(vehicle.id, {
        target_station_id: targetStationId,
        note: note.trim() || undefined
      });
      onSuccess(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="move-modal-title">
      <div className="modal-card">
        <div className="modal-header">
          <h3 id="move-modal-title">Điều chuyển xe #{vehicle.id}</h3>
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <p className="muted">
            <strong>{vehicle.name}</strong> — Trạm hiện tại:{' '}
            {currentStation ? `${currentStation.name} (#${currentStation.id})` : 'Không ở trạm'}
          </p>

          {eligibleStations.length === 0 ? (
            <p className="form-error" role="alert">
              Hiện không có trạm ACTIVE nào khác còn chỗ trống để điều chuyển.
            </p>
          ) : (
            <label className="form-field">
              <span>Trạm đích (chỉ hiện trạm ACTIVE còn chỗ trống) *</span>
              <select
                value={targetStationId}
                onChange={(e) => setTargetStationId(e.target.value)}
                required
              >
                {eligibleStations.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} - {s.name} (Trống {s.available_spaces}/{s.capacity} chỗ)
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="form-field">
            <span>Ghi chú điều chuyển (tùy chọn, tối đa 2.000 ký tự)</span>
            <textarea
              rows={3}
              maxLength={2000}
              placeholder="Ví dụ: Điều phối xe sang trạm đông khách giờ cao điểm..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && (
            <p className="form-error" role="alert">
              {getErrorMessage(error)}
              {error.code && <code className="error-code">{error.code}</code>}
            </p>
          )}

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || eligibleStations.length === 0}
            >
              {submitting ? 'Đang xử lý...' : 'Xác nhận điều chuyển'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VehicleMoveModal;
