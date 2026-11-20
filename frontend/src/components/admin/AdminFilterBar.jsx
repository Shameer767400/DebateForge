import React from 'react';

/**
 * AdminFilterBar
 *
 * Props:
 *   searchPlaceholder – string
 *   searchValue       – string
 *   onSearchChange    – (value: string) => void
 *   filters           – [{ key, label, options: [{value, label}], value }]
 *   onFilterChange    – (key: string, value: string) => void
 *   onClear           – () => void
 */
export default function AdminFilterBar({
  searchPlaceholder = 'Search…',
  searchValue = '',
  search = '',
  onSearchChange,
  filters = [],
  filterConfig = null,
  onFilterChange,
  onClear,
}) {
  const currentSearch = searchValue || search || '';

  let filterList = [];
  if (Array.isArray(filters)) {
    filterList = filters;
  } else if (Array.isArray(filterConfig)) {
    filterList = filterConfig.map((cfg) => ({
      ...cfg,
      value: filters && typeof filters === 'object' ? filters[cfg.key] ?? '' : '',
    }));
  }

  return (
    <div className="admin-filter-bar">
      {/* Search input */}
      <div className="admin-filter-search">
        <span className="admin-filter-search-icon">🔍</span>
        <input
          type="text"
          className="admin-filter-input"
          placeholder={searchPlaceholder}
          value={currentSearch}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
        />
      </div>

      {/* Select dropdowns */}
      {filterList.map((filter) => (
        <select
          key={filter.key}
          className="admin-filter-select"
          value={filter.value ?? ''}
          onChange={(e) =>
            onFilterChange && onFilterChange(filter.key, e.target.value)
          }
          aria-label={filter.label}
        >
          <option value="">{filter.label}</option>
          {(filter.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}

      {/* Clear button */}
      {onClear && (
        <button className="admin-filter-clear-btn" onClick={onClear}>
          ✕ Clear
        </button>
      )}
    </div>
  );
}
