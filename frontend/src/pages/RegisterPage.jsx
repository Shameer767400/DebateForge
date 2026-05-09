import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import '../styles/auth.css';
import AnimatedPasswordInput from '../components/AnimatedPasswordInput';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // Password validation states
  const [passwordValidation, setPasswordValidation] = useState({
    minLength: false,
    hasUppercase: false,
    hasNumber: false,
    hasSpecial: false,
  });

  // Password validation functions
  const checkPasswordValidation = (pwd) => {
    const validation = {
      minLength: pwd.length >= 8,
      hasUppercase: /[A-Z]/.test(pwd),
      hasNumber: /\d/.test(pwd),
      hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\|,.<>/?]/.test(pwd),
    };
    setPasswordValidation(validation);
    return validation;
  };

  const validate = () => {
    if (username.length < 3 || username.length > 30) {
      return 'Username must be between 3 and 30 characters.';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters.';
    }
    if (!/(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\|,.<>/?])/.test(password)) {
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
    // Add a small delay to prevent flickering for fast responses
    setTimeout(() => setShowLoading(true), 100);

    try {
      const res = await axios.post(
        '/api/auth/register',
        { username, email, password },
        { baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001', withCredentials: true }
      );
      login(res.data.token, res.data.user);
      toast.success('Account created! Please check your email for a verification code.');
      navigate('/verify-email-otp?email=' + encodeURIComponent(email));
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Registration failed. Please try again.';
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
              <div className="loading-text">Creating account...</div>
            </div>
          </div>
        )}
        <div className="auth-logo">
          <span className="auth-logo-icon">⚔</span>
          <h1 className="auth-title">DebateForge</h1>
          <p className="auth-subtitle">Create your account</p>
        </div>

        <form 
          className={`auth-form ${loading ? 'loading' : ''}`}
          onSubmit={handleSubmit}
        >
          {/* Honeypot fields — hidden from real users, bots auto-fill them */}
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            <input type="text" name="phone" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="auth-input"
              type="text"
              placeholder="debater42"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
            />
            <span className="auth-hint">3–30 characters</span>
          </div>

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
              onChange={(e) => {
                setPassword(e.target.value);
                checkPasswordValidation(e.target.value);
              }}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <span 
              className={`auth-hint ${
                passwordValidation.minLength && 
                passwordValidation.hasUppercase && 
                passwordValidation.hasNumber && 
                passwordValidation.hasSpecial ? 'auth-hint-valid' : ''
              }`}
            >
              Min 8 chars · 1 uppercase · 1 number · 1 special
            </span>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <AnimatedPasswordInput
              id="confirmPassword"
              className="auth-input"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            className={`auth-submit ${loading ? 'loading' : ''}`}
            type="submit"
            disabled={loading}
          >
            <div className="button-content">
              Create Account
            </div>
            <div className="loading-content">
              <div className="auth-simple-spinner"></div>
              <span className="loading-text">Creating account…</span>
            </div>
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
