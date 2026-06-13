import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Shared axios instance for auth-only requests.
 * NOT the same as the useApi hook (which adds auto-logout on 401).
 * This instance is used internally by AuthProvider so that auth-check
 * failures (expected 401s) don't trigger logout loops.
 */
const authApi = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Configure global Axios request interceptor to append JWT token if present in localStorage
axios.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Configure authApi request interceptor
authApi.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const logoutInProgress = useRef(false);

  const isAuthenticated = !!user;

  /**
   * Check session validity by calling /api/auth/session.
   * Returns the user object on success, or null on failure.
   * Retries once on network error to handle transient failures.
   */
  const checkSession = useCallback(async (retryCount = 0) => {
    try {
      const res = await authApi.get('/api/auth/session');
      if (res.data?.authenticated && res.data?.user) {
        setUser(res.data.user);
        return res.data.user;
      }
      setUser(null);
      if (typeof window !== 'undefined') localStorage.removeItem('token');
      return null;
    } catch (err) {
      // Network error or server down — retry once before giving up
      if (retryCount < 1) {
        // Wait 1 second before retry to give the server time to respond
        await new Promise((r) => setTimeout(r, 1000));
        return checkSession(retryCount + 1);
      }
      // After retry, silently treat as unauthenticated
      setUser(null);
      if (typeof window !== 'undefined') localStorage.removeItem('token');
      return null;
    }
  }, []);

  // On mount: check if there's a valid cookie/session
  useEffect(() => {
    checkSession().finally(() => setLoading(false));
  }, [checkSession]);

  /**
   * Called after successful login/register.
   * Stores the token in localStorage to bypass third-party cookie blocks on mobile.
   */
  const login = useCallback((token, newUser) => {
    setUser(newUser);
    if (token && typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  }, []);

  /**
   * Logout: call the server to clear the cookie, then reset state.
   */
  const logout = useCallback(async () => {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;

    try {
      await authApi.post('/api/auth/logout');
    } catch {
      // best-effort — clear state regardless
    }

    setUser(null);
    if (typeof window !== 'undefined') localStorage.removeItem('token');
    logoutInProgress.current = false;
  }, []);

  /**
   * Silently refresh the session cookie/token.
   */
  const refreshSession = useCallback(async () => {
    try {
      const res = await authApi.post('/api/auth/refresh');
      const userData = res.data?.user ?? null;
      const newToken = res.data?.token ?? null;
      if (newToken && typeof window !== 'undefined') {
        localStorage.setItem('token', newToken);
      }
      if (userData) {
        setUser(userData);
        return true;
      }
      return false;
    } catch {
      // Refresh failed — session is truly expired
      setUser(null);
      if (typeof window !== 'undefined') localStorage.removeItem('token');
      return false;
    }
  }, []);

  const value = {
    user,
    token: null, // Deprecated — kept for backward compat
    login,
    logout,
    isAuthenticated,
    loading,
    checkSession,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
