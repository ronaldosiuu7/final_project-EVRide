import React, { useState } from 'react';
import { Button, Modal, SelectField, TextField, TextareaField, useToast } from '../../components/ui';
import { createPromotion } from '../../services/accountsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { nowLocalInput, toIsoWithVietnamOffset } from '../../utils/format';
import { mapApiFieldErrors, normalizeMoneyString } from '../../utils/validation';

export default function PromotionCreateModal({ onClose, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({
    code: '',
    description: '',
    discount_type: 'PERCENTAGE',
    discount_value: '10.00',
    max_discount_amount: '20000.00',
    min_rental_amount: '',
    vehicle_model: '',
    usage_limit: '100',
    start_date: nowLocalInput(0),
    end_date: nowLocalInput(60 * 24 * 30),
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    const code = form.code.trim().toUpperCase();
    if (!code || code.length > 50) errors.code = 'Mã khuyến mãi từ 1 đến 50 ký tự.';

    const discountValue = normalizeMoneyString(form.discount_value);
    if (!discountValue || Number(discountValue) <= 0) {
      errors.discount_value = 'Giá trị giảm phải lớn hơn 0.';
    } else if (form.discount_type === 'PERCENTAGE') {
      const pct = Number(discountValue);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
        errors.discount_value = 'Giảm theo phần trăm phải là số nguyên từ 1 đến 100.';
      }
    }

    let maxDiscount = null;
    if (form.discount_type === 'PERCENTAGE' && form.max_discount_amount.trim()) {
      maxDiscount = normalizeMoneyString(form.max_discount_amount);
      if (!maxDiscount) errors.max_discount_amount = 'Số tiền giảm tối đa không hợp lệ.';
    }

    let minRental = null;
    if (form.min_rental_amount.trim()) {
      minRental = normalizeMoneyString(form.min_rental_amount);
      if (!minRental) errors.min_rental_amount = 'Đơn tối thiểu không hợp lệ.';
    }

    const usageLimit = Number(form.usage_limit);
    if (!Number.isInteger(usageLimit) || usageLimit <= 0) {
      errors.usage_limit = 'Giới hạn lượt dùng phải là số nguyên > 0.';
    }

    const startIso = toIsoWithVietnamOffset(form.start_date);
    const endIso = toIsoWithVietnamOffset(form.end_date);
    if (!startIso) errors.start_date = 'Cần chọn thời điểm bắt đầu.';
    if (!endIso) errors.end_date = 'Cần chọn thời điểm kết thúc.';
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      errors.end_date = 'Thời điểm kết thúc phải sau thời điểm bắt đầu.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload = {
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: discountValue,
      max_discount_amount: form.discount_type === 'PERCENTAGE' ? maxDiscount : null,
      min_rental_amount: minRental,
      vehicle_model: form.vehicle_model.trim() || null,
      usage_limit: usageLimit,
      start_date: startIso,
      end_date: endIso,
    };

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      const res = await createPromotion(payload);
      toast.success(`Đã tạo mã khuyến mãi ${res.data.code}.`);
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
      title="Tạo mã khuyến mãi mới (MANAGER)"
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" form="promo-create-form" variant="primary" loading={submitting}>
            Tạo khuyến mãi
          </Button>
        </>
      }
    >
      <div className="alert alert-info">
        Theo hợp đồng API, sau khi tạo mã khuyến mãi chỉ có thể bật/tắt trạng thái (<code>ACTIVE / DISABLED</code>), không chỉnh sửa điều kiện áp dụng.
      </div>

      <form id="promo-create-form" onSubmit={handleSubmit} className="stack-md">
        <div className="grid-2">
          <TextField
            label="Mã khuyến mãi (tự viết hoa)"
            required
            maxLength={50}
            placeholder="VD: EVRIDE10"
            value={form.code}
            error={fieldErrors.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
          <TextField
            label="Hạn mức tổng lượt dùng"
            required
            type="number"
            min={1}
            step={1}
            value={form.usage_limit}
            error={fieldErrors.usage_limit}
            onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
          />
        </div>

        <TextareaField
          label="Mô tả (tùy chọn)"
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />

        <div className="grid-2">
          <SelectField
            label="Loại giảm giá"
            required
            value={form.discount_type}
            options={[
              { value: 'PERCENTAGE', label: 'Giảm theo phần trăm (PERCENTAGE)' },
              { value: 'FIXED_AMOUNT', label: 'Giảm số tiền cố định (FIXED_AMOUNT)' },
            ]}
            onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}
          />
          <TextField
            label={form.discount_type === 'PERCENTAGE' ? 'Phần trăm giảm (1–100)' : 'Số tiền giảm (VND)'}
            required
            value={form.discount_value}
            error={fieldErrors.discount_value}
            onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
          />
        </div>

        <div className="grid-2">
          {form.discount_type === 'PERCENTAGE' && (
            <TextField
              label="Giảm tối đa (VND, tùy chọn)"
              value={form.max_discount_amount}
              error={fieldErrors.max_discount_amount}
              onChange={(e) => setForm((f) => ({ ...f, max_discount_amount: e.target.value }))}
            />
          )}
          <TextField
            label="Giá trị thuê tối thiểu (VND, tùy chọn)"
            value={form.min_rental_amount}
            error={fieldErrors.min_rental_amount}
            onChange={(e) => setForm((f) => ({ ...f, min_rental_amount: e.target.value }))}
          />
          <TextField
            label="Áp dụng riêng mẫu xe (tùy chọn)"
            maxLength={100}
            placeholder="Để trống nếu áp dụng mọi xe"
            value={form.vehicle_model}
            error={fieldErrors.vehicle_model}
            onChange={(e) => setForm((f) => ({ ...f, vehicle_model: e.target.value }))}
          />
        </div>

        <div className="grid-2">
          <TextField
            label="Bắt đầu hiệu lực (giờ VN)"
            type="datetime-local"
            required
            value={form.start_date}
            error={fieldErrors.start_date}
            onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
          />
          <TextField
            label="Hết hạn hiệu lực (giờ VN)"
            type="datetime-local"
            required
            value={form.end_date}
            error={fieldErrors.end_date}
            onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
          />
        </div>

        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}
      </form>
    </Modal>
  );
}
