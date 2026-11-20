import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { icon: '📊', label: 'Overview',  to: '/admin/overview'  },
  { icon: '👥', label: 'Users',     to: '/admin/users'     },
  { icon: '🎯', label: 'Debates',   to: '/admin/debates'   },
  { icon: '📚', label: 'Topics',    to: '/admin/topics'    },
  { icon: '💬', label: 'Feedback',  to: '/admin/feedback'  },
  { icon: '🔒', label: 'Security',  to: '/admin/security'  },
  { icon: '🖥️', label: 'System',    to: '/admin/system'    },
];

export default function AdminSidebar({ collapsed, onToggle }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="admin-hamburger"
        onClick={onToggle}
        aria-label="Toggle sidebar"
      >
        {collapsed ? '☰' : '✕'}
      </button>

      <aside className={`admin-sidebar ${!collapsed ? 'admin-sidebar--open' : ''}`}>
        {/* Header */}
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-logo">
            <span className="admin-sidebar-logo-icon">⚔</span>
            <span className="admin-sidebar-logo-text">DebateForge Admin</span>
          </div>
          {user?.username && (
            <div className="admin-sidebar-username">@{user.username}</div>
          )}
        </div>

        {/* Navigation */}
        <nav className="admin-sidebar-nav">
          <ul>
            {NAV_ITEMS.map(({ icon, label, to }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `admin-sidebar-item${isActive ? ' active' : ''}`
                  }
                >
                  <span className="admin-sidebar-item-icon">{icon}</span>
                  <span className="admin-sidebar-item-label">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="admin-sidebar-footer">
          <NavLink to="/dashboard" className="admin-sidebar-back-link">
            <span className="admin-sidebar-item-icon">←</span>
            <span className="admin-sidebar-item-label">Back to App</span>
          </NavLink>
        </div>
      </aside>
    </>
  );
}
