import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../context/ToastContext';
import '../styles/auth.css';

export default function VerifyEmailPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function verify() {
      try {
        const res = await axios.get(
          `/api/auth/verify-email/${token}`,
          { baseURL: process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001' }
        );
        setStatus('success');
        setMessage(res.data.message || 'Email verified!');
        toast.success('Email verified successfully!');
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Verification failed. The link may be invalid.');
        toast.error('Email verification failed.');
      }
    }
    verify();
  }, [token, toast]);

  return (
    <div className="df-center">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-logo">
          {status === 'verifying' && (
            <>
              <div className="df-spinner" style={{ margin: '0 auto 16px' }}>
                <div className="df-spinner-core" />
                <div className="df-spinner-orbit" />
              </div>
              <h1 className="auth-title">Verifying…</h1>
            </>
          )}
          {status === 'success' && (
            <>
              <span className="auth-logo-icon">✅</span>
              <h1 className="auth-title">Email Verified!</h1>
              <p className="auth-subtitle">{message}</p>
            </>
          )}
          {status === 'error' && (
            <>
              <span className="auth-logo-icon">❌</span>
              <h1 className="auth-title">Verification Failed</h1>
              <p className="auth-subtitle">{message}</p>
            </>
          )}
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
