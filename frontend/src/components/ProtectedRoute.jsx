import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="df-center">
        <div className="df-spinner">
          <div className="df-spinner-core" />
          <div className="df-spinner-orbit" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (location.pathname.startsWith('/join/') || location.search.includes('code=') || location.search.includes('join=')) {
      try {
        sessionStorage.setItem('df_post_login_redirect', `${location.pathname}${location.search || ''}`);
      } catch { /* ignore */ }
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;

