import axios from 'axios';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function useApi() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: process.env.REACT_APP_API_URL,
    });

    instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('debateforge_token');
      if (token) {
        // eslint-disable-next-line no-param-reassign
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          logout();
          navigate('/login');
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }, [logout, navigate]);

  return api;
}

