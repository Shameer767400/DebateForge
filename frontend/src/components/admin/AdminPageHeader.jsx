import React from 'react';

/**
 * AdminPageHeader
 *
 * Props:
 *   title    – string (required)
 *   subtitle – string (optional)
 *   children – action buttons / elements rendered on the right
 */
export default function AdminPageHeader({ title, subtitle, children }) {
  return (
    <div className="admin-page-header">
      <div className="admin-page-header-left">
        <h1 className="admin-page-title">{title}</h1>
        {subtitle && (
          <p className="admin-page-subtitle">{subtitle}</p>
        )}
      </div>

      {children && (
        <div className="admin-page-header-actions">
          {children}
        </div>
      )}
    </div>
  );
}
