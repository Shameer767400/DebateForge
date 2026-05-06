import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import '../styles/auth.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axios.post(
        '/api/auth/forgot-password',
        { email },
        { baseURL: process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001' }
      );
      setSent(true);
    } catch (err) {
      const msg = err.response?.data?.error || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="df-center">
        <div className="auth-card">
          <div className="auth-logo">
            <span className="auth-logo-icon">📧</span>
            <h1 className="auth-title">Check Your Email</h1>
            <p className="auth-subtitle">
              If an account with that email exists, we've sent a password reset link.
              Check your inbox and spam folder.
            </p>
          </div>
          <p className="auth-switch" style={{ marginTop: '8px' }}>
            <Link to="/login" className="retro-back-link">← Back to Login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="df-center">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">🔑</span>
          <h1 className="auth-title">Reset Password</h1>
          <p className="auth-subtitle">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="reset-email">
              Email
            </label>
            <input
              id="reset-email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-loading" style={{ gap: '12px' }}>
                <div className="df-spinner sm">
                  <div className="df-spinner-core" />
                  <div className="df-spinner-orbit" />
                </div>
                Sending…
              </span>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        <p className="auth-switch">
          Remember your password?{' '}
          <Link to="/login" className="auth-link">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
