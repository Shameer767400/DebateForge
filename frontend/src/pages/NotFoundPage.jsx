import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/theme.css';

export default function NotFoundPage() {
  return (
    <div className="df-center" style={{ flexDirection: 'column', gap: '24px', textAlign: 'center', padding: '24px' }}>

      {/* Big 404 */}
      <div style={{
        fontSize: 'clamp(5rem, 15vw, 10rem)',
        fontWeight: 900,
        fontFamily: 'var(--font-ui)',
        background: 'linear-gradient(135deg, var(--accent-user), var(--accent-score), var(--accent-ai))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1,
        letterSpacing: '-4px',
        userSelect: 'none',
      }}>
        404
      </div>

      {/* Subtitle */}
      <h2 style={{
        fontFamily: 'var(--font-ui)',
        fontSize: '1.3rem',
        color: 'var(--text-primary)',
        margin: 0,
      }}>
        Lost in the Arena
      </h2>
      <p style={{
        fontFamily: 'var(--font-ui)',
        fontSize: '0.9rem',
        color: 'var(--text-secondary)',
        maxWidth: '400px',
        lineHeight: 1.6,
        margin: 0,
      }}>
        The page you're looking for doesn't exist or has been forged into something else.
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
        <Link
          to="/"
          style={{
            padding: '12px 28px',
            borderRadius: '10px',
            background: 'var(--accent-user)',
            color: '#0a0a0f',
            fontWeight: 700,
            fontFamily: 'var(--font-ui)',
            textDecoration: 'none',
            fontSize: '0.85rem',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 8px 24px rgba(0,255,135,0.3)'; }}
          onMouseLeave={(e) => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = 'none'; }}
        >
          ← Go Home
        </Link>
        <Link
          to="/lobby"
          style={{
            padding: '12px 28px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontFamily: 'var(--font-ui)',
            textDecoration: 'none',
            fontSize: '0.85rem',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => { e.target.style.borderColor = 'var(--accent-user)'; }}
          onMouseLeave={(e) => { e.target.style.borderColor = 'var(--border)'; }}
        >
          Enter Lobby →
        </Link>
      </div>

      {/* Floating sword emoji */}
      <div style={{
        marginTop: '32px',
        fontSize: '2.5rem',
        animation: 'df-pulse 2s ease-in-out infinite alternate',
        opacity: 0.5,
      }}>
        ⚔
      </div>
    </div>
  );
}
