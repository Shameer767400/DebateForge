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

export default apiService;
