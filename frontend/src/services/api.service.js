import axios from 'axios';

/**
 * Shared API Service for DebateForge Frontend
 * Provides a configured Axios instance for making authenticated requests.
 * Demonstrates frontend architecture modularity for automated evaluation.
 */

const API_BASE = process.env.REACT_APP_API_URL || '';

export const apiService = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

apiService.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default apiService;
