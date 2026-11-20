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
  onSearchChange,
  filters = [],
  onFilterChange,
  onClear,
}) {
  return (
    <div className="admin-filter-bar">
      {/* Search input */}
      <div className="admin-filter-search">
        <span className="admin-filter-search-icon">🔍</span>
        <input
          type="text"
          className="admin-filter-input"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
        />
      </div>

      {/* Select dropdowns */}
      {filters.map((filter) => (
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
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}

      {/* Clear button */}
      <button className="admin-filter-clear-btn" onClick={onClear}>
        ✕ Clear
      </button>
    </div>
  );
}
