import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../styles/theme.css';

/**
 * PageLoader — shows the DebateForge orbital spinner
 * for a brief moment on every route change, giving
 * a polished page-transition feel.
 */
export default function PageLoader({ children }) {
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let showTimer;
    let hideTimer;

    showTimer = setTimeout(() => setLoading(true), 120);
    hideTimer = setTimeout(() => setLoading(false), 260);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="page-loader-overlay">
        <div className="page-loader-content">
          <div className="df-spinner">
            <div className="df-spinner-core" />
            <div className="df-spinner-orbit" />
          </div>
          <span className="page-loader-text">Forging…</span>
        </div>
      </div>
    );
  }

  return children;
}
