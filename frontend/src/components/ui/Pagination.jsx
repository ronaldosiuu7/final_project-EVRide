import React from 'react';
import Button from './Button';

/**
 * Thanh phân trang đồng bộ theo envelope `meta: { page, page_size, total }`.
 */
export default function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}) {
  if (!meta) return null;
  const page = Number(meta.page || 1);
  const pageSize = Number(meta.page_size || 20);
  const total = Number(meta.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="pagination-bar">
      <div className="pagination-info">
        Trang <strong>{page}</strong> / <strong>{totalPages}</strong> (Tổng {total} mục)
      </div>
      <div className="pagination-controls">
        {onPageSizeChange && (
          <label className="pagination-size">
            <span>Hiển thị</span>
            <select
              aria-label="Số mục mỗi trang"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / trang
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Trước
        </Button>
        <Button
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau →
        </Button>
      </div>
    </div>
  );
}
