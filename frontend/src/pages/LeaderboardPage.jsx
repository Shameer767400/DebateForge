import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';
import '../styles/leaderboard.css';

/* ── medal config ── */
const MEDALS = [
  { rank: 1, emoji: '🥇', cls: 'medal--gold'   },
  { rank: 2, emoji: '🥈', cls: 'medal--silver' },
  { rank: 3, emoji: '🥉', cls: 'medal--bronze' },
];

function RankBadge({ rank }) {
  const medal = MEDALS.find((m) => m.rank === rank);
  if (medal) {
    return (
      <span className={`rank-badge ${medal.cls}`}>
        {medal.emoji} {rank}
      </span>
    );
  }
  return <span className="rank-badge rank-badge--plain">#{rank}</span>;
}

/* ── "X seconds/minutes ago" helper ── */
function timeAgo(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)  return `${diff} second${diff !== 1 ? 's' : ''} ago`;
  const mins = Math.floor(diff / 60);
  return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
}

/* ────────────────────────────────────────
   MAIN PAGE
──────────────────────────────────────── */
export default function LeaderboardPage() {
  const { user, token } = useAuth();

  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);        // Date object
  const [tick, setTick]           = useState(0);           // forces re-render for relative time
  const [userRow, setUserRow]     = useState(null);
  const userRowRef                = useRef(null);

  /* ── tick every 10 s to update the "X ago" label ── */
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(iv);
  }, []);

  /* ── fetch ── */
  const fetchLeaderboard = useCallback(() => {
    setLoading(true);
    axios
      .get('/api/profile/leaderboard', {
        baseURL: process.env.REACT_APP_API_URL,
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const data = res.data?.leaderboard ?? res.data ?? [];
        setRows(data.slice(0, 50));

        // locate current user in list
        const uid = user?._id ?? user?.id ?? user?.username;
        const found = data.find(
          (r) => (r._id ?? r.id ?? r.username) === uid || r.username === user?.username
        );
        setUserRow(found ?? null);
        setUpdatedAt(new Date());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, user]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  /* ── user's rank (1-based index in the full list) ── */
  const userRank = (userRow?.rank ?? (rows.findIndex(
    (r) => r.username === user?.username
  ) + 1)) || null;

  /* ── is user in top 10? (show sticky banner only if not) ── */
  const userInTop10 = userRank != null && userRank <= 10;

  /* ── skeleton rows ── */
  if (loading) {
    return (
      <div className="lb-page">
        <header className="lb-header">
          <h1 className="lb-title">🏆 Global Leaderboard</h1>
        </header>
        <div className="lb-skeleton-list">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="lb-skeleton-row" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="lb-page">

      {/* ── HEADER ── */}
      <header className="lb-header">
        <h1 className="lb-title">🏆 Global Leaderboard</h1>
        <div className="lb-header-right">
          {updatedAt && (
            /* tick is read only to trigger re-render */
            // eslint-disable-next-line no-unused-expressions
            <span className="lb-timestamp" aria-live="polite">
              {/* eslint-disable-next-line no-unused-expressions */}
              {void tick /* consume tick */}
              Updated {timeAgo(updatedAt)}
            </span>
          )}
          <button className="lb-refresh-btn" onClick={fetchLeaderboard}>
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* ── USER RANK CARD (sticky, shown only when user outside top 10) ── */}
      {!userInTop10 && userRow && (
        <div className="lb-user-rank-card">
          <span className="lb-user-rank-label">Your Rank</span>
          <span className="lb-user-rank-val">
            #{userRank}
          </span>
          <span className="lb-user-rank-sep">·</span>
          <span className="lb-user-rank-elo">
            ELO: {userRow.elo ?? userRow.eloRating ?? '—'}
          </span>
          <button
            className="lb-user-rank-scroll"
            onClick={() => userRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            Jump to my row ↓
          </button>
        </div>
      )}

      {/* ── TABLE ── */}
      <div className="lb-table-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th className="th-rank">Rank</th>
              <th>Username</th>
              <th className="th-num">ELO</th>
              <th className="th-num">Wins</th>
              <th className="th-num">Debates</th>
              <th className="th-num">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const rank   = row.rank ?? idx + 1;
              const isUser = row.username === user?.username;
              const wr     = row.totalDebates > 0
                ? Math.round((row.wins / row.totalDebates) * 100)
                : 0;

              return (
                <tr
                  key={row._id ?? row.id ?? row.username ?? idx}
                  ref={isUser ? userRowRef : null}
                  className={`lb-row ${isUser ? 'lb-row--me' : ''} ${rank <= 3 ? `lb-row--top${rank}` : ''}`}
                >
                  <td className="td-rank">
                    <RankBadge rank={rank} />
                  </td>
                  <td className="td-username">
                    {isUser && <span className="you-tag">you</span>}
                    {row.username ?? '—'}
                  </td>
                  <td className="td-num td-elo">{row.elo ?? row.eloRating ?? '—'}</td>
                  <td className="td-num">{row.wins ?? 0}</td>
                  <td className="td-num">{row.totalDebates ?? 0}</td>
                  <td className="td-num td-wr">{wr}%</td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="lb-empty-cell">
                  No leaderboard data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
