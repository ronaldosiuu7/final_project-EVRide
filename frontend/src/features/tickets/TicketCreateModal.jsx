import React, { useState } from 'react';
import { Button, Modal, TextField, TextareaField, useToast } from '../../components/ui';
import { createTicket } from '../../services/operationsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { isPositiveIdString, mapApiFieldErrors } from '../../utils/validation';

export default function TicketCreateModal({ initialRentalId = '', onClose, onSuccess }) {
  const toast = useToast();
  const [rentalId, setRentalId] = useState(initialRentalId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!isPositiveIdString(rentalId)) errors.rental_id = 'ID chuyến thuê phải là số nguyên dương.';
    if (!title.trim() || title.trim().length > 200) errors.title = 'Tiêu đề từ 1 đến 200 ký tự.';
    if (!description.trim() || description.trim().length > 5000) {
      errors.description = 'Mô tả từ 1 đến 5.000 ký tự.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      const res = await createTicket(rentalId.trim(), {
        title: title.trim(),
        description: description.trim(),
      });
      toast.success(`Đã tạo ticket hỗ trợ #${res.data.id}.`);
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
      size="md"
      title="Tạo ticket hỗ trợ / báo cáo nhân viên"
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" form="ticket-create-form" variant="primary" loading={submitting}>
            Tạo ticket
          </Button>
        </>
      }
    >
      <form id="ticket-create-form" onSubmit={handleSubmit} className="stack-md">
        <TextField
          label="ID chuyến thuê"
          required
          value={rentalId}
          error={fieldErrors.rental_id}
          hint="Áp dụng cho chuyến đang IN_RENT, RETURN_PENDING, STOLEN, INCIDENT_PENDING hoặc COMPLETED."
          onChange={(e) => setRentalId(e.target.value)}
        />
        <TextField
          label="Tiêu đề"
          required
          maxLength={200}
          value={title}
          error={fieldErrors.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextareaField
          label="Mô tả chi tiết"
          required
          rows={4}
          maxLength={5000}
          value={description}
          error={fieldErrors.description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}
      </form>
    </Modal>
  );
}
