import React, { useState } from 'react';
import { updateVehicleStatus } from '../../services/mockApi';
import { getErrorMessage } from '../../components/common/ErrorState';

// Modal chuyển trạng thái xe AVAILABLE <-> MAINTENANCE (POST /vehicles/{id}/status).
// Bắt buộc nhập `note` để ghi audit theo contract mục 5.1.
const VehicleStatusModal = ({ vehicle, onClose, onSuccess }) => {
  const nextStatus = vehicle.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE';
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await updateVehicleStatus(vehicle.id, {
        status: nextStatus,
        note
      });
      onSuccess(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="status-modal-title">
      <div className="modal-card">
        <div className="modal-header">
          <h3 id="status-modal-title">Đổi trạng thái xe #{vehicle.id}</h3>
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <p className="muted">
            <strong>{vehicle.name}</strong>: chuyển từ{' '}
            <code>{vehicle.status}</code> sang <code>{nextStatus}</code>.
          </p>

          <label className="form-field">
            <span>Lý do / ghi chú kiểm toán (bắt buộc) *</span>
            <textarea
              rows={3}
              maxLength={2000}
              required
              placeholder={
                nextStatus === 'MAINTENANCE'
                  ? 'Ví dụ: Đưa xe vào kiểm tra định kỳ / sạc pin tại trạm...'
                  : 'Ví dụ: Đã hoàn tất kiểm tra và sạc đầy, mở lại cho thuê...'
              }
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
            <button type="submit" className="btn btn-primary" disabled={submitting || !note.trim()}>
              {submitting ? 'Đang lưu...' : `Chuyển sang ${nextStatus}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VehicleStatusModal;
