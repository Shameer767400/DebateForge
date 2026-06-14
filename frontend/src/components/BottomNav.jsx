import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './BottomNav.css';

const NAV_ITEMS = [
  { path: '/lobby',       icon: '⚔️',  label: 'Lobby' },
  { path: '/dashboard',   icon: '📊',  label: 'Stats' },
  { path: '/leaderboard', icon: '🏆',  label: 'Ranks' },
  { path: '/history',     icon: '📜',  label: 'History' },
  { path: '/profile',     icon: '👤',  label: 'Profile' },
];

/**
 * BottomNav — fixed mobile bottom navigation bar.
 * Only renders when the user is authenticated and on a protected route.
 * Hidden on desktop via CSS (display: none above 768px).
 */
export default function BottomNav() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Don't render during auth loading, or when not logged in,
  // or on public pages (login, register, landing, verify, etc.)
  const publicPaths = ['/', '/login', '/register', '/forgot-password', '/pricing', '/verify-email-otp'];
  const isPublicPage = publicPaths.includes(location.pathname) || location.pathname.startsWith('/reset-password') || location.pathname.startsWith('/verify-email');
  const isDebatePage = location.pathname.startsWith('/debate/');

  if (loading || !isAuthenticated || isPublicPage || isDebatePage) {
    return null;
  }

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {NAV_ITEMS.map(({ path, icon, label }) => {
        const isActive = location.pathname === path || 
          (path === '/lobby' && location.pathname.startsWith('/debate/'));
        return (
          <Link
            key={path}
            to={path}
            className={`bottom-nav-item ${isActive ? 'bottom-nav-item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottom-nav-icon">{icon}</span>
            <span className="bottom-nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
