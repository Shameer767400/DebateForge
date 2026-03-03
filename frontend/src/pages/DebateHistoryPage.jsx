import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';

const API = process.env.REACT_APP_API_URL;

function timeAgo(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DebateHistoryPage() {
  const { token } = useAuth();
  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get('/api/debates/history?limit=50', {
        baseURL: API,
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setDebates(r.data?.debates ?? r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-ui)',
      padding: '32px clamp(16px, 4vw, 48px)',
    }}>
      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <Link to="/lobby" style={{ color: 'var(--accent-user)', textDecoration: 'none', fontSize: '0.9rem' }}>← Back to Lobby</Link>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link to="/dashboard" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.85rem' }}>Dashboard</Link>
          <Link to="/leaderboard" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.85rem' }}>Leaderboard</Link>
        </div>
      </nav>

      <h1 style={{ fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', marginBottom: '24px' }}>⚔ Debate History</h1>

      {loading ? (
        <div className="df-center" style={{ minHeight: '40vh' }}>
          <div className="df-spinner">
            <div className="df-spinner-core" />
            <div className="df-spinner-orbit" />
          </div>
        </div>
      ) : debates.length === 0 ? (
        <div style={{
          textAlign: 'center',
          color: 'var(--text-muted)',
          padding: '60px 0',
          fontSize: '0.95rem',
        }}>
          No debates yet. <Link to="/lobby" style={{ color: 'var(--accent-user)' }}>Start your first debate →</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {debates.map((d, i) => {
            const isWin = d.winner === 'user';
            const isLoss = d.winner === 'ai';
            const borderColor = isWin ? 'rgba(0,255,135,0.3)' : isLoss ? 'rgba(255,51,102,0.2)' : 'var(--border)';
            const resultLabel = isWin ? '🏆 WIN' : isLoss ? '💀 LOSS' : '🤝 DRAW';
            const resultColor = isWin ? 'var(--accent-user)' : isLoss ? 'var(--accent-ai)' : 'var(--accent-score)';

            return (
              <div
                key={d._id ?? d.id ?? i}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '16px',
                  flexWrap: 'wrap',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Topic + meta */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px' }}>
                    {d.topicSnapshot ?? d.topic?.title ?? 'Custom Topic'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>Side: {d.side ?? '—'}</span>
                    <span>Difficulty: {d.difficulty ?? '—'}</span>
                    <span>{timeAgo(d.createdAt ?? d.startedAt)}</span>
                  </div>
                </div>

                {/* Scores */}
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>Logic: {d.scores?.logic ?? d.userFinalScore ?? '—'}</span>
                  <span>Evidence: {d.scores?.evidence ?? '—'}</span>
                  <span>Clarity: {d.scores?.clarity ?? '—'}</span>
                </div>

                {/* Result */}
                <div style={{
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: resultColor,
                  letterSpacing: '1px',
                  minWidth: '80px',
                  textAlign: 'right',
                }}>
                  {resultLabel}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
