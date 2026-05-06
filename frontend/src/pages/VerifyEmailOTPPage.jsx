import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../context/ToastContext';
import '../styles/auth.css';

export default function VerifyEmailOTPPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('input'); // 'input' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !otp) {
      toast.error('Please enter both email and OTP');
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      toast.error('OTP must be 6 digits');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(
        '/api/auth/verify-email-otp',
        { email, otp },
        { baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001' }
      );
      setStatus('success');
      setMessage(res.data.message || 'Email verified successfully!');
      toast.success('Email verified successfully!');
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || 'Verification failed. Please check your OTP and try again.');
      toast.error('Email verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setResending(true);
    try {
      // First login to get a token (since resend endpoint is protected)
      // For this demo, we'll assume the user is already logged in from registration
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please log in first to resend OTP');
        setResending(false);
        return;
      }

      const res = await axios.post(
        '/api/auth/resend-verification-otp',
        {},
        {
          baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001',
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success('New OTP sent to your email!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  const handleOTPChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
  };

  if (status === 'success') {
    return (
      <div className="df-center">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-logo">
            <span className="auth-logo-icon">✅</span>
            <h1 className="auth-title">Email Verified!</h1>
            <p className="auth-subtitle">{message}</p>
          </div>
          <button
            className="auth-submit"
            style={{ marginTop: '16px' }}
            onClick={() => navigate('/lobby')}
          >
            Go to Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="df-center">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">📧</span>
          <h1 className="auth-title">Verify Email</h1>
          <p className="auth-subtitle">Enter the 6-digit code sent to your email</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">
              Email Address
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
            <label className="auth-label" htmlFor="otp">
              Verification Code
            </label>
            <input
              id="otp"
              className="auth-input"
              type="text"
              placeholder="123456"
              value={otp}
              onChange={handleOTPChange}
              maxLength={6}
              required
              autoComplete="one-time-code"
              style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5em' }}
            />
            <span className="auth-hint">Enter the 6-digit code from your email</span>
          </div>

          {status === 'error' && (
            <p className="auth-error">{message}</p>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading || !email || !/^\d{6}$/.test(otp)}
          >
            {loading ? (
              <span className="auth-btn-loading" style={{ gap: '12px' }}>
                <div className="df-spinner sm">
                  <div className="df-spinner-core" />
                  <div className="df-spinner-orbit" />
                </div>
                Verifying…
              </span>
            ) : (
              'Verify Email'
            )}
          </button>

          <button
            type="button"
            className="auth-link"
            style={{ 
              background: 'none', 
              border: 'none', 
              marginTop: '12px',
              fontSize: '0.82rem',
              cursor: resending ? 'not-allowed' : 'pointer',
              opacity: resending ? 0.6 : 1
            }}
            onClick={handleResendOTP}
            disabled={resending}
          >
            {resending ? 'Sending...' : "Didn't receive the code? Resend"}
          </button>
        </form>

        <p className="auth-switch">
          Already verified?{' '}
          <button 
            className="auth-link" 
            style={{ background: 'none', border: 'none' }}
            onClick={() => navigate('/login')}
          >
            Login
          </button>
        </p>
      </div>
    </div>
  );
}
