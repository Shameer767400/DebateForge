import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../context/ToastContext';
import '../styles/auth.css';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = () => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters.';
    }
    if (!/(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/.test(password)) {
      return 'Password needs an uppercase letter, a number, and a special character.';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(
        `/api/auth/reset-password/${token}`,
        { password },
        { baseURL: process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001' }
      );
      toast.success(res.data.message || 'Password reset successfully!');
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.error || 'Reset failed. The link may have expired.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="df-center">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">🔐</span>
          <h1 className="auth-title">Set New Password</h1>
          <p className="auth-subtitle">Choose a strong, unique password</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="new-password">
              New Password
            </label>
            <input
              id="new-password"
              className="auth-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <span className="auth-hint">Min 8 chars · 1 uppercase · 1 number · 1 special</span>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="confirm-new-password">
              Confirm Password
            </label>
            <input
              id="confirm-new-password"
              className="auth-input"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
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
                Resetting…
              </span>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/login" className="auth-link">← Back to Login</Link>
        </p>
      </div>
    </div>
  );
}
