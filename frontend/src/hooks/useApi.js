import axios from 'axios';
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function useApi() {
  const navigate = useNavigate();
  const { logout, refreshSession, isAuthenticated } = useAuth();
  const isRefreshing = useRef(false);
  const failedQueue = useRef([]);

  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: process.env.REACT_APP_API_URL,
      withCredentials: true, // Automatically send HTTP-only cookies
    });

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
        if (!isAuthenticated) {
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
          const refreshed = await refreshSession();

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

            logout();
            navigate('/login');
            return Promise.reject(error);
          }
        } catch {
          failedQueue.current.forEach(({ reject }) => reject(new Error('Session expired')));
          failedQueue.current = [];
          isRefreshing.current = false;

          logout();
          navigate('/login');
          return Promise.reject(error);
        }
      }
    );

    return instance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return api;
}
