import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/navbar.css';

const NAV_LINKS = [
  { path: '/dashboard',   label: 'Dashboard',  icon: '🏠' },
  { path: '/lobby',       label: 'New Debate',  icon: '⚔️' },
  { path: '/multiplayer', label: 'Multiplayer', icon: '👥' },
  { path: '/history',     label: 'History',     icon: '📜' },
  { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { path: '/profile',     label: 'Profile',     icon: '👤' },
];

// Pages where the navbar should be hidden entirely
const HIDDEN_ROUTES = [
  '/login', '/register', '/forgot-password',
  '/verify-email', '/verify-email-otp', '/',
];

function shouldHideNav(pathname) {
  return HIDDEN_ROUTES.some((r) => pathname === r || pathname.startsWith('/reset-password') || pathname.startsWith('/verify-email'));
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);

  // Scroll shadow effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Hide on auth/landing pages or when not logged in
  if (!user || shouldHideNav(location.pathname)) return null;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`} ref={menuRef}>
      <div className="navbar-inner">

        {/* ── Logo ── */}
        <Link to="/dashboard" className="navbar-logo" onClick={() => setMenuOpen(false)}>
          <span className="navbar-logo-icon">⚔</span>
          <span className="navbar-logo-text">DebateForge</span>
        </Link>

        {/* ── Desktop Links ── */}
        <ul className="navbar-links">
          {NAV_LINKS.map(({ path, label, icon }) => {
            const active = location.pathname === path ||
              (path === '/lobby' && location.pathname.startsWith('/debate'));
            return (
              <li key={path}>
                <Link
                  to={path}
                  className={`navbar-link ${active ? 'navbar-link--active' : ''}`}
                >
                  <span className="navbar-link-icon">{icon}</span>
                  <span className="navbar-link-label">{label}</span>
                  {active && <span className="navbar-link-dot" />}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* ── Desktop Right ── */}
        <div className="navbar-right">
          <div className="navbar-user">
            <div className="navbar-avatar">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="navbar-username">{user?.username}</span>
          </div>
          <button
            className="navbar-logout-btn"
            onClick={handleLogout}
            title="Log out"
            id="navbar-logout"
          >
            ⎋ Logout
          </button>
        </div>

        {/* ── Hamburger ── */}
        <button
          className={`navbar-hamburger ${menuOpen ? 'navbar-hamburger--open' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
          id="navbar-hamburger"
        >
          <span /><span /><span />
        </button>
      </div>

      {/* ── Mobile Drawer ── */}
      <div className={`navbar-drawer ${menuOpen ? 'navbar-drawer--open' : ''}`}>
        <ul className="navbar-drawer-links">
          {NAV_LINKS.map(({ path, label, icon }) => {
            const active = location.pathname === path;
            return (
              <li key={path}>
                <Link
                  to={path}
                  className={`navbar-drawer-link ${active ? 'navbar-drawer-link--active' : ''}`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="navbar-drawer-footer">
          <div className="navbar-drawer-user">
            <div className="navbar-avatar navbar-avatar--lg">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span>{user?.username}</span>
          </div>
          <button
            className="navbar-logout-btn navbar-logout-btn--full"
            onClick={handleLogout}
          >
            ⎋ Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
