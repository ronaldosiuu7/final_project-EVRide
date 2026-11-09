import React from 'react';

// Điều khiển phân trang theo meta của contract: { page, page_size, total }.
const Pagination = ({ meta, onPageChange, onPageSizeChange, pageSizeOptions = [5, 10, 20, 50] }) => {
  if (!meta) return null;
  const { page = 1, page_size = 20, total = 0 } = meta;
  const totalPages = Math.max(1, Math.ceil(total / page_size));

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
              value={page_size}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>{opt} / trang</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Trước
        </button>
        <button
          type="button"
          className="btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau →
        </button>
      </div>
    </div>
  );
};

export default Pagination;
