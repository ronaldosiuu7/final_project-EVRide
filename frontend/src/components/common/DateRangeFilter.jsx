import React, { useState } from 'react';

// Bộ lọc khoảng ngày dùng chung cho Dashboard và các báo cáo.
// Theo contract mục 11: from_date và to_date đi cùng nhau, định dạng YYYY-MM-DD, from_date <= to_date.
// Bỏ trống cả hai = toàn bộ dữ liệu.
const DateRangeFilter = ({ value, onChange }) => {
  const [draft, setDraft] = useState({ from_date: value?.from_date || '', to_date: value?.to_date || '' });
  const [error, setError] = useState('');

  const apply = (event) => {
    event.preventDefault();
    const { from_date, to_date } = draft;
    if ((from_date && !to_date) || (!from_date && to_date)) {
      setError('Cần chọn cả ngày bắt đầu và ngày kết thúc.');
      return;
    }
    if (from_date && to_date && from_date > to_date) {
      setError('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
      return;
    }
    setError('');
    onChange(from_date ? { from_date, to_date } : {});
  };

  const reset = () => {
    setDraft({ from_date: '', to_date: '' });
    setError('');
    onChange({});
  };

  return (
    <form className="filter-bar" onSubmit={apply}>
      <label className="form-field">
        <span>Từ ngày</span>
        <input
          type="date"
          value={draft.from_date}
          onChange={(e) => setDraft((d) => ({ ...d, from_date: e.target.value }))}
        />
      </label>
      <label className="form-field">
        <span>Đến ngày</span>
        <input
          type="date"
          value={draft.to_date}
          onChange={(e) => setDraft((d) => ({ ...d, to_date: e.target.value }))}
        />
      </label>
      <div className="filter-actions">
        <button type="submit" className="btn btn-primary">Áp dụng</button>
        <button type="button" className="btn" onClick={reset}>Toàn bộ</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
};

export default DateRangeFilter;

