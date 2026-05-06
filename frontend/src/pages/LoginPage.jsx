import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import '../styles/auth.css';
import AnimatedPasswordInput from '../components/AnimatedPasswordInput';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Add a small delay to prevent flickering for fast responses
    setTimeout(() => setShowLoading(true), 100);

    try {
      const res = await axios.post(
        '/api/auth/login',
        { email, password },
        { baseURL: process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001' }
      );
      login(res.data.token, res.data.user);
      toast.success('Welcome back!');
      navigate('/lobby');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Login failed. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      // Add delay to ensure smooth transition
      setTimeout(() => {
        setLoading(false);
        setShowLoading(false);
      }, 300);
    }
  };

  return (
    <div className="df-center">
      <div className="auth-card" style={{ position: 'relative' }}>
        {showLoading && (
          <div className="auth-loading-overlay active">
            <div className="loading-content">
              <div className="auth-simple-spinner"></div>
              <div className="loading-text">Signing in...</div>
            </div>
          </div>
        )}
        <div className="auth-logo">
          <span className="auth-logo-icon">⚔</span>
          <h1 className="auth-title">DebateForge</h1>
          <p className="auth-subtitle">Sharpen your arguments</p>
        </div>

        <form 
          className={`auth-form ${loading ? 'loading' : ''}`}
          onSubmit={handleSubmit}
        >
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="password">
              Password
            </label>
            <AnimatedPasswordInput
              id="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <div style={{ textAlign: 'right', marginTop: '-8px' }}>
            <Link to="/forgot-password" className="auth-link" style={{ fontSize: '0.78rem' }}>
              Forgot Password?
            </Link>
          </div>

          <button
            className={`auth-submit ${loading ? 'loading' : ''}`}
            type="submit"
            disabled={loading}
          >
            <div className="button-content">
              Sign In
            </div>
            <div className="loading-content">
              <div className="auth-simple-spinner"></div>
              <span className="loading-text">Signing in…</span>
            </div>
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <Link to="/register" className="auth-link">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
