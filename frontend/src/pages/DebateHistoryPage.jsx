import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';
import '../styles/history.css';

const API = process.env.REACT_APP_API_URL;

/* ══════════════════════════════════════════════════════════
   generateReportHTML — standalone report card for history
══════════════════════════════════════════════════════════ */
function generateReportHTML(debate) {
  const date = debate.startedAt
    ? new Date(debate.startedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const topic = debate.topicSnapshot ?? 'Custom Topic';
  const side = debate.userSide ?? '—';
  const diff = debate.difficulty ?? '—';
  const format = (debate.format ?? 'freeform').replace(/_/g, ' ');
  const score = debate.userFinalScore ?? '—';
  const isWin = debate.winner === 'user';
  const isLoss = debate.winner === 'ai';
  const winnerLabel = isWin ? '🏆 YOU WIN' : isLoss ? '🤖 AI WINS' : '🤝 DRAW';
  const winnerColor = isWin ? '#00ff87' : isLoss ? '#ff3366' : '#ffcc00';

  const argRows = (debate.arguments ?? []).map((arg, i) => {
    const isUser = arg.speaker === 'user';
    const bg = isUser ? 'rgba(0,255,135,0.04)' : 'rgba(255,51,102,0.03)';
    const border = isUser ? 'rgba(0,255,135,0.1)' : 'rgba(255,51,102,0.1)';
    const labelColor = isUser ? '#00ff87' : '#ff3366';
    const label = isUser ? `You — Round ${arg.turnNumber ?? i + 1}` : `AI — Round ${arg.turnNumber ?? i + 1}`;
    const scoresHtml = arg.scores?.overall != null
      ? `<div class="arg-scores">Logic: ${arg.scores.logic ?? '—'} &nbsp;|&nbsp; Evidence: ${arg.scores.evidence ?? '—'} &nbsp;|&nbsp; Clarity: ${arg.scores.clarity ?? '—'} &nbsp;|&nbsp; Overall: ${arg.scores.overall}</div>`
      : '';
    const fallacyHtml = arg.fallacy?.detected
      ? `<div class="arg-fallacy">⚠ Fallacy: ${arg.fallacy.type} (${Math.round((arg.fallacy.confidence ?? 0) * 100)}%)</div>`
      : '';
    return `<div class="arg-row" style="background:${bg};border:1px solid ${border}">
      <div class="arg-label" style="color:${labelColor}">${label}</div>
      <div class="arg-content">${arg.content ?? ''}</div>
      ${scoresHtml}${fallacyHtml}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DebateForge Report Card — ${topic.slice(0, 40)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background: #0a0a0f; color: #e8e8f0; padding: 40px; max-width: 820px; margin: 0 auto; }
  .header { text-align: center; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 24px; margin-bottom: 32px; }
  .logo { font-size: 2rem; font-weight: 800; background: linear-gradient(135deg,#00ff87,#00aaff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .date { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 6px; }
  .topic { font-size: 1.3rem; font-weight: 700; margin-top: 14px; color: #fff; line-height: 1.4; }
  .meta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }
  .meta span { font-size: 0.75rem; color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.06); padding: 4px 12px; border-radius: 20px; }
  .winner-box { text-align: center; padding: 24px; margin-bottom: 28px; background: rgba(255,255,255,0.04); border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); }
  .winner-label { font-size: 2.4rem; font-weight: 800; color: ${winnerColor}; }
  .score-row { display: flex; gap: 10px; justify-content: center; margin-top: 16px; align-items: center; }
  .score-box { text-align: center; }
  .score-num { font-size: 2.6rem; font-weight: 800; }
  .score-num--user { color: #00ff87; }
  .score-lbl { font-size: 0.7rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .vs { font-size: 1.1rem; color: rgba(255,255,255,0.2); }
  .section { margin-bottom: 26px; }
  .section-title { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.4); border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; margin-bottom: 12px; }
  .text-block { font-size: 0.88rem; line-height: 1.65; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px; border: 1px solid rgba(255,255,255,0.07); }
  .arg-row { border-radius: 10px; padding: 12px; margin-bottom: 10px; }
  .arg-label { font-size: 0.7rem; font-weight: 700; margin-bottom: 6px; }
  .arg-content { font-size: 0.85rem; color: rgba(255,255,255,0.75); line-height: 1.55; }
  .arg-scores { font-size: 0.7rem; color: rgba(255,255,255,0.35); margin-top: 6px; }
  .arg-fallacy { font-size: 0.72rem; color: #ffbb33; margin-top: 4px; }
  .footer { text-align: center; font-size: 0.7rem; color: rgba(255,255,255,0.2); margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; }
  @media print { body { background: #fff; color: #111; } }
</style>
</head>
<body>
<div class="header">
  <div class="logo">⚔ DebateForge</div>
  <div class="date">Report Card — ${date}</div>
  <div class="topic">${topic}</div>
  <div class="meta">
    <span>Side: ${side}</span>
    <span>Format: ${format}</span>
    <span>Difficulty: ${diff}</span>
  </div>
</div>

<div class="winner-box">
  <div class="winner-label">${winnerLabel}</div>
  <div class="score-row">
    <div class="score-box"><div class="score-num score-num--user">${score}</div><div class="score-lbl">Your Score</div></div>
  </div>
</div>

${argRows ? `<div class="section"><div class="section-title">Full Debate Transcript</div>${argRows}</div>` : ''}

<div class="footer">Generated by DebateForge · ${new Date().toISOString()}</div>
</body>
</html>`;
}

function downloadReport(debate) {
  const html = generateReportHTML(debate);
  const topic = debate.topicSnapshot ?? 'debate';
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `debateforge-${topic.slice(0, 28).replace(/\s+/g, '-').toLowerCase()}-report.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Helpers ── */
function timeAgo(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ResultBadge({ winner }) {
  if (winner === 'user') return (
    <span style={{ color: '#00ff87', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '1px' }}>🏆 WIN</span>
  );
  if (winner === 'ai') return (
    <span style={{ color: '#ff3366', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '1px' }}>💀 LOSS</span>
  );
  return (
    <span style={{ color: '#ffcc00', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '1px' }}>🤝 DRAW</span>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function DebateHistoryPage() {
  const api = useApi();
  const navigate = useNavigate();

  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('all'); // all | win | loss | draw
  const LIMIT = 15;

  useEffect(() => {
    setLoading(true);
    api
      .get(`/api/debates/history?page=${page}&limit=${LIMIT}`)
      .then((r) => {
        setDebates(r.data?.debates ?? r.data ?? []);
        setTotalPages(r.data?.pages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, api]);

  const filtered = filter === 'all'
    ? debates
    : debates.filter(d => d.winner === (filter === 'win' ? 'user' : filter === 'loss' ? 'ai' : 'draw'));

  const fetchDetail = (id) => {
    if (detailCache[id]) return;
    api
      .get(`/api/debates/${id}`)
      .then((r) => {
        const detail = r.data?.debate ?? r.data;
        setDetailCache(prev => ({ ...prev, [id]: detail }));
      })
      .catch(console.error);
  };

  return (
    <div className="history-container">

      {/* ── Nav ── */}
      <nav className="history-nav">
        <Link to="/lobby" className="retro-back-link">
          ← Back to Lobby
        </Link>
        <div className="history-nav-links">
          <Link to="/dashboard" className="history-nav-link">Dashboard</Link>
          <Link to="/leaderboard" className="history-nav-link">Leaderboard</Link>
        </div>
      </nav>

      {/* ── Header ── */}
      <div className="history-header">
        <h1 className="history-title">⚔ Debate History</h1>
        <p className="history-subtitle">
          All your past debates — click any row to expand and download a report card
        </p>
      </div>

      {/* ── Filter tabs ── */}
      <div className="history-filters">
        {['all', 'win', 'loss', 'draw'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`}
          >
            {f === 'all' ? 'All' : f === 'win' ? '🏆 Wins' : f === 'loss' ? '💀 Losses' : '🤝 Draws'}
          </button>
        ))}
        <span className="filter-count">
          {filtered.length} debate{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="df-center" style={{ minHeight: '40vh' }}>
          <div className="df-spinner">
            <div className="df-spinner-core" />
            <div className="df-spinner-orbit" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: '0.95rem' }}>
          No debates found. <Link to="/lobby" style={{ color: 'var(--accent-user)' }}>Start your first →</Link>
        </div>
      ) : (
        <div className="history-list">
          {filtered.map((d, i) => {
            const id = d._id ?? d.id ?? i;
            const isExpanded = expandedId === id;
            const isWin = d.winner === 'user';
            const isLoss = d.winner === 'ai';
            const borderColor = isWin ? 'rgba(0,255,135,0.25)' : isLoss ? 'rgba(255,51,102,0.18)' : 'rgba(255,204,0,0.15)';
            const detail = detailCache[id];

            return (
              <div
                key={id}
                className="history-item"
                style={{
                  border: `1px solid ${isExpanded ? (isWin ? 'rgba(0,255,135,0.4)' : isLoss ? 'rgba(255,51,102,0.35)' : 'rgba(255,204,0,0.35)') : borderColor}`,
                }}
              >
                {/* ── Summary row ── */}
                <div
                  className="history-item-summary"
                  onClick={() => {
                    if (isExpanded) { setExpandedId(null); return; }
                    setExpandedId(id);
                    fetchDetail(id);
                  }}
                >
                  {/* Result indicator */}
                  <div className="item-indicator" style={{
                    background: isWin ? 'var(--accent-user)' : isLoss ? 'var(--accent-ai)' : 'var(--accent-score)',
                  }} />

                  {/* Topic + meta */}
                  <div className="item-meta-info">
                    <div className="item-title">
                      {d.topicSnapshot ?? 'Custom Topic'}
                    </div>
                    <div className="item-badge-row">
                      {d.userSide && <span>Side: {d.userSide}</span>}
                      {d.difficulty && <span>Difficulty: {d.difficulty}</span>}
                      {d.format && <span>Format: {d.format}</span>}
                      <span>{timeAgo(d.startedAt ?? d.createdAt)}</span>
                    </div>
                  </div>

                  {/* Score */}
                  {d.userFinalScore != null && (
                    <div className="item-score">
                      <div className="score-value" style={{ color: isWin ? 'var(--accent-user)' : isLoss ? 'var(--accent-ai)' : 'var(--accent-score)' }}>
                        {d.userFinalScore}
                      </div>
                      <div className="score-lbl">Score</div>
                    </div>
                  )}

                  {/* Result */}
                  <ResultBadge winner={d.winner} />

                  {/* Expand chevron */}
                  <span className="expand-chevron" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </div>

                {/* ── Expanded section ── */}
                {isExpanded && (
                  <div
                    className="history-detail-box"
                    onClick={e => e.stopPropagation()}
                  >
                    {!detail ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '12px 0' }}>
                        Loading debate details…
                      </div>
                    ) : (
                      <>
                        {/* ── Action buttons ── */}
                        <div className="history-actions">
                          <button
                            onClick={() => downloadReport(detail)}
                            className="action-btn action-btn--download"
                          >
                            📥 Download Report Card
                          </button>
                          <button
                            onClick={() => navigate('/lobby')}
                            className="action-btn action-btn--again"
                          >
                            ⚔ Debate Again
                          </button>
                        </div>

                        {/* ── Stats row ── */}
                        {(detail.totalRounds || detail.durationSecs) && (
                          <div className="history-stats-row">
                            {detail.totalRounds && (
                              <div className="stat-card">
                                <div className="stat-val">{detail.totalRounds}</div>
                                <div className="stat-lbl">Rounds</div>
                              </div>
                            )}
                            {detail.durationSecs && (
                              <div className="stat-card">
                                <div className="stat-val">{Math.round(detail.durationSecs / 60)}m</div>
                                <div className="stat-lbl">Duration</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Argument transcript ── */}
                        <div className="history-transcript">
                          {(detail.arguments ?? []).map((arg, ai) => {
                            const isUser = arg.speaker === 'user';
                            return (
                              <div key={ai} className="transcript-bubble" style={{
                                background: isUser ? 'rgba(0,255,135,0.05)' : 'rgba(255,51,102,0.04)',
                                border: `1px solid ${isUser ? 'rgba(0,255,135,0.14)' : 'rgba(255,51,102,0.11)'}`,
                              }}>
                                <div className="bubble-header" style={{ color: isUser ? 'var(--accent-user)' : 'var(--accent-ai)' }}>
                                  {isUser ? '🎤 You' : '🤖 AI'} · Round {arg.turnNumber ?? ai + 1}
                                </div>
                                <div className="bubble-content">
                                  {arg.content}
                                </div>
                                {arg.scores?.overall != null && (
                                  <div className="bubble-scores">
                                    {[['Logic', arg.scores.logic], ['Evidence', arg.scores.evidence], ['Clarity', arg.scores.clarity], ['Overall', arg.scores.overall]].map(([label, val]) => (
                                      <span key={label} className="bubble-score-badge">
                                        {label}: {val ?? '—'}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {arg.fallacy?.detected && (
                                  <div className="bubble-fallacy">
                                    ⚠ {arg.fallacy.type} ({Math.round((arg.fallacy.confidence ?? 0) * 100)}%)
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {(detail.arguments ?? []).length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '12px 0' }}>
                              No argument transcript available
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="history-pagination">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="pagi-btn"
          >
            ← Previous
          </button>
          <span className="pagi-info">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="pagi-btn"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
