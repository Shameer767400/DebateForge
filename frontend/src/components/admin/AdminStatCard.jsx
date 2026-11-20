import React from 'react';

const COLOR_CLASS = {
  green:  'admin-stat-card--green',
  red:    'admin-stat-card--red',
  yellow: 'admin-stat-card--yellow',
  blue:   'admin-stat-card--blue',
};

/**
 * AdminStatCard
 *
 * Props:
 *   icon        – emoji or string icon
 *   label       – card label (small text below value)
 *   value       – main metric value (string or number)
 *   trend       – positive = up (green), negative = down (red), 0/null = hidden
 *   trendLabel  – extra text next to the trend (e.g. "vs last week")
 *   color       – 'green' | 'red' | 'yellow' | 'blue'
 */
export default function AdminStatCard({
  icon,
  label,
  value,
  trend,
  trendLabel,
  color = 'green',
}) {
  const hasTrend = trend !== null && trend !== undefined && trend !== 0;
  const isUp = hasTrend && trend > 0;

  return (
    <div className={`admin-stat-card ${COLOR_CLASS[color] ?? COLOR_CLASS.green}`}>
      <div className="admin-stat-card-header">
        {icon && <span className="admin-stat-card-icon">{icon}</span>}

        {hasTrend && (
          <div
            className={`admin-stat-card-trend ${
              isUp ? 'admin-stat-card-trend--up' : 'admin-stat-card-trend--down'
            }`}
          >
            <span className="admin-stat-card-trend-arrow">
              {isUp ? '▲' : '▼'}
            </span>
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>

      <div className="admin-stat-card-value">{value ?? '—'}</div>
      <div className="admin-stat-card-label">{label}</div>

      {hasTrend && trendLabel && (
        <div className="admin-stat-card-trend-label">{trendLabel}</div>
      )}
    </div>
  );
}
