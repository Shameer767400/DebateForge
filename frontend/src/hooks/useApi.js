import axios from 'axios';
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function useApi() {
  const navigate = useNavigate();
  const { logout, refreshSession, isAuthenticated } = useAuth();
  const isRefreshing = useRef(false);
  const failedQueue = useRef([]);

  // ── Use refs so the interceptor always reads the LATEST values ──
  // Without refs, the closure inside useMemo captures the initial values
  // (isAuthenticated=false on mount) and never updates, causing premature
  // logouts whenever a 401 arrives.
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const refreshSessionRef = useRef(refreshSession);
  refreshSessionRef.current = refreshSession;

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: process.env.REACT_APP_API_URL,
      withCredentials: true, // Automatically send HTTP-only cookies
    });

    // Request interceptor: append JWT token if present in localStorage
    instance.interceptors.request.use(
      (config) => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: handle 401s with token refresh
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Only handle 401 errors, and don't retry auth endpoints or already-retried requests
        if (
          error.response?.status !== 401 ||
          originalRequest._retry ||
          originalRequest.url?.includes('/auth/login') ||
          originalRequest.url?.includes('/auth/register') ||
          originalRequest.url?.includes('/auth/logout') ||
          originalRequest.url?.includes('/auth/me') ||
          originalRequest.url?.includes('/auth/session') ||
          originalRequest.url?.includes('/auth/refresh')
        ) {
          return Promise.reject(error);
        }

        // If we're not authenticated, don't try to refresh — just reject
        // Uses ref to get the CURRENT value, not the stale closure value
        if (!isAuthenticatedRef.current) {
          return Promise.reject(error);
        }

        // If a refresh is already in progress, queue this request
        if (isRefreshing.current) {
          return new Promise((resolve, reject) => {
            failedQueue.current.push({ resolve, reject });
          }).then(() => {
            return instance(originalRequest);
          }).catch(() => {
            return Promise.reject(error);
          });
        }

        originalRequest._retry = true;
        isRefreshing.current = true;

        try {
          const refreshed = await refreshSessionRef.current();

          if (refreshed) {
            // Retry all queued requests
            failedQueue.current.forEach(({ resolve }) => resolve());
            failedQueue.current = [];
            isRefreshing.current = false;

            // Retry the original request
            return instance(originalRequest);
          } else {
            // Refresh failed — log out
            failedQueue.current.forEach(({ reject }) => reject(new Error('Session expired')));
            failedQueue.current = [];
            isRefreshing.current = false;

            // Let logout() set isAuthenticated=false, then ProtectedRoute
            // will handle the redirect naturally. Do NOT call navigate('/login')
            // here — it causes race conditions with React Router and can
            // interrupt active pages (e.g. debate room).
            logoutRef.current();
            return Promise.reject(error);
          }
        } catch {
          failedQueue.current.forEach(({ reject }) => reject(new Error('Session expired')));
          failedQueue.current = [];
          isRefreshing.current = false;

          logoutRef.current();
          return Promise.reject(error);
        }
      }
    );

    return instance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return api;
}
