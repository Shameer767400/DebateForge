import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function EmailVerificationBanner() {
  const { user, token } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Don't show if no user, or user is already verified
  if (!user || user.emailVerified) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await axios.post(
        '/api/auth/resend-verification',
        {},
        {
          baseURL: process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSent(true);
    } catch {
      /* silent fail — banner is non-critical */
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.banner}>
      <span style={styles.icon}>📧</span>
      <span style={styles.text}>
        Please verify your email address.
      </span>
      {sent ? (
        <span style={styles.sent}>Verification email sent ✓</span>
      ) : (
        <button
          style={styles.button}
          onClick={handleResend}
          disabled={sending}
        >
          {sending ? 'Sending…' : 'Resend Email'}
        </button>
      )}
    </div>
  );
}

const styles = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 20px',
    background: 'linear-gradient(135deg, rgba(255, 170, 50, 0.15), rgba(255, 120, 50, 0.1))',
    borderBottom: '1px solid rgba(255, 170, 50, 0.3)',
    fontSize: '0.85rem',
    color: '#ffaa32',
    zIndex: 1000,
    flexWrap: 'wrap',
  },
  icon: {
    fontSize: '1.1rem',
  },
  text: {
    flex: 1,
  },
  button: {
    padding: '5px 14px',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#000',
    background: '#ffaa32',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  sent: {
    fontSize: '0.78rem',
    color: '#4ade80',
    fontWeight: 600,
  },
};
