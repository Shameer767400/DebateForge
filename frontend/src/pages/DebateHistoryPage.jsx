import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';

const API = process.env.REACT_APP_API_URL;

/** Download debate transcript as a .txt file */
function downloadTranscript(debate) {
  const lines = [
    `DebateForge Transcript`,
    `======================`,
    `Topic: ${debate.topicSnapshot ?? 'Custom Topic'}`,
    `Side: ${debate.userSide ?? '—'}  |  Difficulty: ${debate.difficulty ?? '—'}`,
    `Result: ${debate.winner === 'user' ? 'WIN' : debate.winner === 'ai' ? 'LOSS' : 'DRAW'}`,
    `Score: ${debate.userFinalScore ?? '—'}`,
    `Date: ${debate.startedAt ? new Date(debate.startedAt).toLocaleString() : '—'}`,
    '',
    '--- Arguments ---',
    '',
  ];

  (debate.arguments ?? []).forEach((arg, i) => {
    const speaker = arg.speaker === 'user' ? 'YOU' : 'AI';
    lines.push(`[Round ${arg.turnNumber ?? i + 1}] ${speaker}:`);
    lines.push(arg.content ?? '');
    if (arg.scores?.overall != null) {
      lines.push(`  Scores — Logic: ${arg.scores.logic ?? '—'} | Evidence: ${arg.scores.evidence ?? '—'} | Clarity: ${arg.scores.clarity ?? '—'}`);
    }
    if (arg.fallacy?.detected) {
      lines.push(`  ⚠ Fallacy: ${arg.fallacy.type} (${Math.round((arg.fallacy.confidence ?? 0) * 100)}%)`);
    }
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `debate-${(debate.topicSnapshot ?? 'custom').slice(0, 30).replace(/\s+/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});

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
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'border-color 0.2s',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const debateKey = d._id ?? d.id;
                  if (expandedId === debateKey) {
                    setExpandedId(null);
                    return;
                  }
                  setExpandedId(debateKey);
                  // Fetch full debate details if not cached
                  if (!detailCache[debateKey]) {
                    axios
                      .get(`/api/debates/${debateKey}`, {
                        baseURL: API,
                        headers: { Authorization: `Bearer ${token}` },
                      })
                      .then((r) => {
                        const detail = r.data?.debate ?? r.data;
                        setDetailCache((prev) => ({ ...prev, [debateKey]: detail }));
                      })
                      .catch(console.error);
                  }
                }}
              >
                {/* Summary row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {/* Topic + meta */}
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px' }}>
                      {d.topicSnapshot ?? d.topic?.title ?? 'Custom Topic'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <span>Side: {d.userSide ?? d.side ?? '—'}</span>
                      <span>{timeAgo(d.createdAt ?? d.startedAt)}</span>
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Score: {d.userFinalScore ?? '—'}
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

                {/* Expanded detail */}
                {expandedId === (d._id ?? d.id) && (
                  <div
                    style={{
                      borderTop: '1px solid var(--border)',
                      paddingTop: '12px',
                      marginTop: '4px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {detailCache[d._id ?? d.id] ? (
                      <>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                          <button
                            style={{
                              padding: '6px 14px',
                              borderRadius: '999px',
                              border: 'none',
                              background: 'linear-gradient(135deg, var(--accent-user), var(--accent-blue))',
                              color: '#020309',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                            onClick={() => downloadTranscript(detailCache[d._id ?? d.id])}
                          >
                            📥 Download Transcript
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                          {(detailCache[d._id ?? d.id].arguments ?? []).map((arg, ai) => (
                            <div key={ai} style={{
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: arg.speaker === 'user' ? 'rgba(0,255,135,0.06)' : 'rgba(255,51,102,0.04)',
                              border: `1px solid ${arg.speaker === 'user' ? 'rgba(0,255,135,0.15)' : 'rgba(255,51,102,0.12)'}`,
                              fontSize: '0.82rem',
                              lineHeight: 1.5,
                            }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, marginBottom: '4px', color: arg.speaker === 'user' ? 'var(--accent-user)' : 'var(--accent-ai)' }}>
                                {arg.speaker === 'user' ? '🎤 You' : '🤖 AI'} · Round {arg.turnNumber ?? ai + 1}
                              </div>
                              {arg.content}
                              {arg.scores?.overall != null && (
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                  L:{arg.scores.logic ?? '—'} E:{arg.scores.evidence ?? '—'} C:{arg.scores.clarity ?? '—'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading details…</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
