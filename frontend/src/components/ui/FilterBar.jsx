import React from 'react';
import Button from './Button';

export default function FilterBar({ onReset, resetLabel = 'Xóa lọc', onSubmit, children }) {
  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit?.(event);
  };

  return (
    <form className="filter-bar" onSubmit={handleSubmit}>
      <div className="filter-fields">{children}</div>
      <div className="filter-actions">
        {onSubmit && (
          <Button type="submit" variant="primary" size="sm">
            Lọc
          </Button>
        )}
        {onReset && (
          <Button type="button" size="sm" onClick={onReset}>
            {resetLabel}
          </Button>
        )}
      </div>
    </form>
  );
}
