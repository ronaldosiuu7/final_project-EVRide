import React, { useState } from 'react';
import { Button, Modal, SelectField, TextField, TextareaField, useToast } from '../../components/ui';
import useApiQuery from '../../hooks/useApiQuery';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import { listActiveEmployees } from '../../services/accountsApi';
import { createMaintenanceOrder } from '../../services/operationsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { isPositiveIdString } from '../../utils/validation';

export default function MaintenanceCreateModal({
  initialVehicleId = '',
  initialIncidentId = '',
  onClose,
  onSuccess,
}) {
  const toast = useToast();
  const [vehicleId, setVehicleId] = useState(initialVehicleId);
  const [incidentId, setIncidentId] = useState(initialIncidentId);
  const [assignedTo, setAssignedTo] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fieldError, setFieldError] = useState('');

  const employeesQuery = useApiQuery(({ signal }) => listActiveEmployees({ signal }), []);
  const employees = employeesQuery.data || [];

  const mutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    createMaintenanceOrder(payload, idempotencyKey)
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isPositiveIdString(vehicleId)) {
      setFieldError('ID xe phải là chuỗi số nguyên dương.');
      return;
    }
    if (incidentId.trim() && !isPositiveIdString(incidentId)) {
      setFieldError('ID hồ sơ sự cố phải là chuỗi số nguyên dương.');
      return;
    }
    if (!title.trim() || !description.trim()) {
      setFieldError('Tiêu đề và mô tả công việc bảo trì không được để trống.');
      return;
    }

    const payload = {
      vehicle_id: vehicleId.trim(),
      title: title.trim(),
      description: description.trim(),
    };
    if (incidentId.trim()) payload.incident_id = incidentId.trim();
    if (assignedTo) payload.assigned_to = String(assignedTo);

    setFieldError('');
    try {
      const res = await mutation.execute(`maint_create_${payload.vehicle_id}`, payload);
      toast.success(`Đã mở phiếu bảo trì #${res.data.id}.`);
      onSuccess(res.data);
    } catch {
      // Lỗi hiển thị ngay tại modal.
    }
  };

  return (
    <Modal
      open
      size="md"
      title="Tạo phiếu bảo trì xe (Maintenance Order)"
      onClose={onClose}
      closeDisabled={mutation.loading}
      footer={
        <>
          <Button onClick={onClose} disabled={mutation.loading}>
            Hủy
          </Button>
          <Button type="submit" form="maint-create-form" variant="primary" loading={mutation.loading}>
            Mở phiếu bảo trì
          </Button>
        </>
      }
    >
      <div className="alert alert-info">
        Phiếu trạng thái <code>OPEN</code> hoặc <code>IN_PROGRESS</code> sẽ chặn cho thuê xe. Hoàn tất phiếu (<code>COMPLETED</code>) không tự động chuyển xe sang <code>AVAILABLE</code>.
      </div>

      <form id="maint-create-form" onSubmit={handleSubmit} className="stack-md">
        <div className="grid-2">
          <TextField
            label="ID xe máy điện"
            required
            disabled={Boolean(initialVehicleId)}
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          />
          <TextField
            label="ID hồ sơ sự cố (tùy chọn)"
            disabled={Boolean(initialIncidentId)}
            placeholder="Chỉ nhập khi bảo trì xe sự cố đã về trạm"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value)}
          />
        </div>

        <SelectField
          label="Nhân viên phụ trách (tùy chọn)"
          value={assignedTo}
          placeholder="Chưa phân công"
          options={employees.map((e) => ({
            value: e.id,
            label: `#${e.id} - ${e.name} (${e.role})`,
          }))}
          onChange={(e) => setAssignedTo(e.target.value)}
        />

        <TextField
          label="Tiêu đề bảo trì"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <TextareaField
          label="Mô tả hạng mục kiểm tra / sửa chữa"
          required
          rows={3}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {(fieldError || mutation.error) && (
          <div className="alert alert-danger" role="alert">
            {fieldError || getApiErrorMessage(mutation.error)}
          </div>
        )}
      </form>
    </Modal>
  );
}
