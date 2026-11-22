import React from 'react';

const STATUS_MAP = {
  success: 'admin-badge--success',
  warning: 'admin-badge--warning',
  danger:  'admin-badge--danger',
  info:    'admin-badge--info',
  muted:   'admin-badge--muted',
};

/**
 * AdminStatusBadge
 *
 * Props:
 *   status – 'success' | 'warning' | 'danger' | 'info' | 'muted'
 *   label  – display text (falls back to status string if omitted)
 */
export default function AdminStatusBadge({ status = 'muted', label }) {
  const safeStatus = typeof status === 'string' ? status : 'muted';
  const modifier = STATUS_MAP[safeStatus] ?? STATUS_MAP.muted;
  const safeLabel = (typeof label === 'string' || typeof label === 'number') ? label : safeStatus;

  return (
    <span className={`admin-badge ${modifier}`}>
      {safeLabel}
    </span>
  );
}
