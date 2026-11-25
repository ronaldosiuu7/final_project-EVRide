import React, { useEffect, useId, useState } from 'react';
import Button from './Button';
import { validateDateRange } from '../../utils/validation';

/**
 * Bộ lọc khoảng ngày dùng chung cho Dashboard & Báo cáo.
 * Hai tham số `from_date` và `to_date` luôn đi cùng nhau; để trống cả hai = toàn bộ dữ liệu.
 */
export default function DateRangeFilter({ value, onChange, label }) {
  const fromId = useId();
  const toId = useId();
  const [draft, setDraft] = useState({
    from_date: value?.from_date || '',
    to_date: value?.to_date || '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({
      from_date: value?.from_date || '',
      to_date: value?.to_date || '',
    });
  }, [value?.from_date, value?.to_date]);

  const apply = (event) => {
    event.preventDefault();
    const msg = validateDateRange(draft.from_date, draft.to_date);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    onChange(draft.from_date ? { from_date: draft.from_date, to_date: draft.to_date } : {});
  };

  const reset = () => {
    setDraft({ from_date: '', to_date: '' });
    setError('');
    onChange({});
  };

  return (
    <form className="filter-bar" onSubmit={apply}>
      <div className="filter-fields">
        {label && <span className="filter-label">{label}</span>}
        <div className="form-field">
          <label htmlFor={fromId}>Từ ngày</label>
          <input
            id={fromId}
            type="date"
            value={draft.from_date}
            onChange={(e) => setDraft((d) => ({ ...d, from_date: e.target.value }))}
          />
        </div>
        <div className="form-field">
          <label htmlFor={toId}>Đến ngày</label>
          <input
            id={toId}
            type="date"
            value={draft.to_date}
            onChange={(e) => setDraft((d) => ({ ...d, to_date: e.target.value }))}
          />
        </div>
      </div>
      <div className="filter-actions">
        <Button type="submit" variant="primary" size="sm">
          Áp dụng
        </Button>
        <Button type="button" size="sm" onClick={reset}>
          Toàn bộ
        </Button>
      </div>
      {error && (
        <p className="field-error full-width" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
