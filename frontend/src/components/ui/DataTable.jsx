import React from 'react';
import Pagination from './Pagination';
import { EmptyState, ErrorState, LoadingState } from './StateBoxes';

/**
 * Bảng dữ liệu dùng chung hỗ trợ loading/empty/error, cuộn ngang trên màn hình 390px và phân trang.
 */
export default function DataTable({
  columns = [],
  rows = [],
  rowKey = 'id',
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'Không có dữ liệu',
  emptyHint,
  emptyAction,
  meta,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  onRowClick,
}) {
  if (loading) {
    return <LoadingState />;
  }
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />;
  }

  return (
    <>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className={col.align === 'right' ? 'text-right' : ''}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const keyVal = typeof rowKey === 'function' ? rowKey(row, idx) : row[rowKey] ?? idx;
              return (
                <tr
                  key={keyVal}
                  className={onRowClick ? 'table-row-clickable' : ''}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={col.align === 'right' ? 'text-right' : ''}>
                      {col.render ? col.render(row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {meta && onPageChange && (
        <Pagination
          meta={meta}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </>
  );
}
