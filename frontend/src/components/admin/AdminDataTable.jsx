import React, { useState } from 'react';

/**
 * AdminDataTable
 *
 * Props:
 *   columns     – [{ key, label, sortable?, render? }]
 *   data        – array of row objects
 *   pagination  – { page, pages, total, limit }
 *   onPageChange– (page: number) => void
 *   onSort      – (key: string, order: 'asc'|'desc') => void
 *   sortKey     – currently sorted column key
 *   sortOrder   – 'asc' | 'desc'
 *   loading     – boolean
 *   emptyMessage– string
 */
export default function AdminDataTable({
  columns = [],
  data = [],
  pagination,
  onPageChange,
  onSort,
  sortKey,
  sortOrder = 'asc',
  loading = false,
  emptyMessage = 'No data found.',
}) {
  const handleSort = (col) => {
    if (!col.sortable || !onSort) return;
    const nextOrder =
      sortKey === col.key && sortOrder === 'asc' ? 'desc' : 'asc';
    onSort(col.key, nextOrder);
  };

  const renderPageNumbers = () => {
    if (!pagination) return null;
    const { page, pages } = pagination;
    const nums = [];

    // Show at most 7 page buttons with ellipsis
    const range = (start, end) => {
      for (let i = start; i <= end; i++) nums.push(i);
    };

    if (pages <= 7) {
      range(1, pages);
    } else if (page <= 4) {
      range(1, 5);
      nums.push('...');
      nums.push(pages);
    } else if (page >= pages - 3) {
      nums.push(1);
      nums.push('...');
      range(pages - 4, pages);
    } else {
      nums.push(1);
      nums.push('...');
      range(page - 1, page + 1);
      nums.push('...');
      nums.push(pages);
    }

    return nums;
  };

  /* ── Render ── */
  return (
    <div className="admin-table-container">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const isActive = sortKey === col.key;
              const isDesc   = isActive && sortOrder === 'desc';
              return (
                <th
                  key={col.key}
                  className={[
                    'admin-th',
                    col.sortable ? 'admin-th--sortable' : '',
                    isActive     ? 'admin-th--active'   : '',
                    isDesc       ? 'admin-th--desc'     : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleSort(col)}
                >
                  <div className="admin-th-inner">
                    {col.label}
                    {col.sortable && (
                      <span className="admin-sort-icon">▲</span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length}>
                <div className="admin-loading">
                  <div className="admin-loading-spinner" />
                  <span className="admin-loading-text">Loading…</span>
                </div>
              </td>
            </tr>
          ) : !Array.isArray(data) || data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <div className="admin-empty">
                  <div className="admin-empty-icon">🗂️</div>
                  <p className="admin-empty-title">{emptyMessage}</p>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr key={row?._id ?? row?.id ?? rowIdx} className="admin-tr">
                {columns.map((col) => {
                  const val = row && typeof row === 'object' ? row[col.key] : undefined;
                  let cellContent = val ?? '—';
                  if (col.render) {
                    try {
                      const res = col.render(val, row, rowIdx);
                      if (res === undefined && row && typeof row === 'object') {
                        const fallbackRes = col.render(row, rowIdx);
                        cellContent = fallbackRes !== undefined ? fallbackRes : '—';
                      } else {
                        cellContent = res !== undefined ? res : '—';
                      }
                    } catch {
                      try {
                        const fallbackRes = col.render(row, rowIdx);
                        cellContent = fallbackRes !== undefined ? fallbackRes : '—';
                      } catch {
                        cellContent = val ?? '—';
                      }
                    }
                  }

                  // Guard: if cellContent is an object that is not a valid React element, serialize to string
                  if (cellContent && typeof cellContent === 'object' && !React.isValidElement(cellContent)) {
                    cellContent = JSON.stringify(cellContent);
                  }

                  return (
                    <td key={col.key} className="admin-td">
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {pagination && pagination.pages > 0 && (
        <div className="admin-pagination">
          <span className="admin-pagination-info">
            {pagination.total} total · page {pagination.page} of{' '}
            {pagination.pages}
          </span>

          <div className="admin-pagination-controls">
            <button
              className="admin-pagination-btn"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange && onPageChange(pagination.page - 1)}
            >
              ← Prev
            </button>

            {renderPageNumbers().map((num, idx) =>
              num === '...' ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="admin-pagination-btn"
                  style={{ cursor: 'default', opacity: 0.4 }}
                >
                  …
                </span>
              ) : (
                <button
                  key={num}
                  className={`admin-pagination-btn ${
                    num === pagination.page ? 'admin-pagination-btn--active' : ''
                  }`}
                  onClick={() => onPageChange && onPageChange(num)}
                >
                  {num}
                </button>
              )
            )}

            <button
              className="admin-pagination-btn"
              disabled={pagination.page >= pagination.pages}
              onClick={() => onPageChange && onPageChange(pagination.page + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
