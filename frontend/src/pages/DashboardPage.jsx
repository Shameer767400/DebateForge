import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';
import '../styles/dashboard.css';

/* ──────────────────────────────────────────
   Static achievements catalogue
────────────────────────────────────────── */
const ACHIEVEMENTS = [
  { id: 'first_blood',  icon: '⚔️',  name: 'First Blood',      desc: 'Win your first debate',       min: 1  },
  { id: 'sharp_mind',  icon: '🧠',  name: 'Sharp Mind',        desc: 'Avg logic score > 80',        min: 10 },
  { id: 'no_fallacy',  icon: '🛡️',  name: 'Iron Logic',        desc: '5 debates, 0 fallacies',      min: 5  },
  { id: 'speed_demon', icon: '⚡',  name: 'Speed Demon',       desc: 'Answer in under 10s',         min: 1  },
  { id: 'veteran',     icon: '🏆',  name: 'Veteran',           desc: '50 debates completed',        min: 50 },
  { id: 'polymath',    icon: '🌐',  name: 'Polymath',          desc: 'Debate in 5 categories',      min: 5  },
  { id: 'devil',       icon: '😈',  name: "Devil's Advocate",  desc: 'Win a Devil mode debate',     min: 1  },
  { id: 'expert',      icon: '🔥',  name: 'Expert Debater',    desc: 'Win 10 Expert debates',       min: 10 },
];

/* ──────────────────────────────────────────
   Skeleton helpers
────────────────────────────────────────── */
function Skeleton({ width = '100%', height = 20, radius = 6, style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

function StatCardSkeleton() {
  return (
    <div className="stat-card">
      <Skeleton height={44} width="60%" radius={8} style={{ marginBottom: 8 }} />
      <Skeleton height={14} width="80%" radius={4} />
    </div>
  );
}

/* ──────────────────────────────────────────
   Trend indicator
────────────────────────────────────────── */
function Trend({ value }) {
  if (value === 0 || value == null) return null;
  const up = value > 0;
  return (
    <span className={`trend ${up ? 'trend--up' : 'trend--down'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}
    </span>
  );
}

/* ──────────────────────────────────────────
   Result pill
────────────────────────────────────────── */
function ResultPill({ result }) {
  const map = {
    win:  { label: 'Win',  cls: 'pill--win'  },
    loss: { label: 'Loss', cls: 'pill--loss' },
    draw: { label: 'Draw', cls: 'pill--draw' },
  };
  const r = map[result?.toLowerCase()] ?? { label: result ?? '—', cls: '' };
  return <span className={`result-pill ${r.cls}`}>{r.label}</span>;
}

/* ──────────────────────────────────────────
   Custom radar tick
────────────────────────────────────────── */
function RadarTick({ x, y, payload }) {
  return (
    <text
      x={x} y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="rgba(255,255,255,0.55)"
      fontSize={11}
    >
      {payload.value}
    </text>
  );
}

/* ──────────────────────────────────────────
   MAIN PAGE
────────────────────────────────────────── */
export default function DashboardPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [fallacies, setFallacies] = useState([]);
  const [history, setHistory] = useState([]);

  /* ── parallel fetch ── */
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const base = process.env.REACT_APP_API_URL;

    Promise.allSettled([
      axios.get('/api/profile/me',                   { baseURL: base, headers }),
      axios.get('/api/profile/fallacies',            { baseURL: base, headers }),
      axios.get('/api/debates/history?limit=20',     { baseURL: base, headers }),
    ]).then(([prof, fall, hist]) => {
      if (prof.status  === 'fulfilled') setProfile(prof.value.data);
      if (fall.status  === 'fulfilled') setFallacies(fall.value.data?.fallacies ?? fall.value.data ?? []);
      if (hist.status  === 'fulfilled') setHistory(hist.value.data?.debates     ?? hist.value.data ?? []);
      setLoading(false);
    });
  }, [token]);

  /* ── derived stats ── */
  const totalDebates = profile?.totalDebates ?? history.length;
  const wins         = profile?.wins ?? 0;
  const winRate      = totalDebates > 0 ? Math.round((wins / totalDebates) * 100) : 0;
  const avgScore     = profile?.avgScore ?? 0;
  const elo          = profile?.elo ?? user?.elo ?? 1200;

  /* ── score trend data (last 20) ── */
  const trendData = history.slice().reverse().map((d, i) => ({
    n:        i + 1,
    Logic:    d.scores?.logic    ?? 0,
    Evidence: d.scores?.evidence ?? 0,
    Clarity:  d.scores?.clarity  ?? 0,
  }));

  /* ── fallacy radar data ── */
  const radarData = fallacies.length > 0
    ? fallacies.map((f) => ({ subject: f.type, count: f.count }))
    : [];

  /* ── achievements (unlock by debateCount for demo) ── */
  const earned = new Set(profile?.achievements ?? []);

  return (
    <div className="dash">

      {/* ── HEADER ── */}
      <header className="dash-header">
        <div className="dash-welcome">
          <h1 className="dash-title">
            Welcome back,{' '}
            <span className="dash-username">
              {user?.username ?? 'Debater'}
            </span>
          </h1>
        </div>
        <div className="dash-header-right">
          <span className="dash-elo-badge">{elo} ELO</span>
          <button className="dash-new-btn" onClick={() => navigate('/lobby')}>
            ⚔ New Debate
          </button>
        </div>
      </header>

      {/* ── STATS ROW ── */}
      <section className="dash-section">
        <div className="stats-row">
          {loading ? (
            [0,1,2,3].map((i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--accent-score)' }}>{elo}</div>
                <div className="stat-label">ELO Rating</div>
                <Trend value={profile?.eloTrend} />
              </div>
              <div className="stat-card">
                <div className="stat-value">{totalDebates}</div>
                <div className="stat-label">Total Debates</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--accent-user)' }}>{winRate}%</div>
                <div className="stat-label">Win Rate</div>
                <Trend value={profile?.winRateTrend} />
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{avgScore}</div>
                <div className="stat-label">Avg Score</div>
                <Trend value={profile?.avgScoreTrend} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── FALLACY DNA ── */}
      <section className="dash-section">
        <h2 className="dash-section-title">Your Fallacy DNA</h2>
        {loading ? (
          <Skeleton height={320} radius={12} />
        ) : radarData.length === 0 ? (
          <div className="dash-empty">
            Complete more debates to see your fallacy profile
          </div>
        ) : (
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="subject" tick={<RadarTick />} />
                <Radar
                  name="Frequency"
                  dataKey="count"
                  stroke="#FF3366"
                  fill="rgba(255,51,102,0.25)"
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-secondary)' }}
                  itemStyle={{ color: '#FF3366' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ── SCORE TREND ── */}
      <section className="dash-section">
        <h2 className="dash-section-title">Score Trends (Last 20 Debates)</h2>
        {loading ? (
          <Skeleton height={260} radius={12} />
        ) : trendData.length === 0 ? (
          <div className="dash-empty">No debate history yet</div>
        ) : (
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="n"
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                  label={{ value: 'Debate #', position: 'insideBottom', offset: -4, fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => `Debate #${v}`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 12, color: 'rgba(255,255,255,0.5)' }}
                />
                <Line type="monotone" dataKey="Logic"    stroke="#00FF87" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Evidence" stroke="#00AAFF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Clarity"  stroke="#FFCC00" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ── RECENT DEBATES TABLE ── */}
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recent Debates</h2>
          {history.length > 10 && (
            <button className="dash-view-all" onClick={() => alert('Full history coming soon!')}>
              View All
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(5)].map((_, i) => <Skeleton key={i} height={46} radius={8} />)}
          </div>
        ) : history.length === 0 ? (
          <div className="dash-empty">No debates yet — start your first one!</div>
        ) : (
          <div className="table-wrap">
            <table className="debate-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Date</th>
                  <th>Side</th>
                  <th>Result</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map((d) => {
                  const id = d._id ?? d.id ?? Math.random();
                  return (
                    <tr
                      key={id}
                      className="debate-row"
                      onClick={() => alert('Replay coming soon!')}
                    >
                      <td className="td-topic">
                        {d.topic?.title ?? d.topicTitle ?? '—'}
                      </td>
                      <td className="td-date">
                        {d.createdAt
                          ? new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="td-side">
                        <span className={`side-tag side-tag--${d.side?.toLowerCase()}`}>
                          {d.side ?? '—'}
                        </span>
                      </td>
                      <td><ResultPill result={d.result} /></td>
                      <td className="td-score">
                        {d.scores?.avg ?? d.avgScore ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── ACHIEVEMENTS ── */}
      <section className="dash-section">
        <h2 className="dash-section-title">Achievements</h2>
        {loading ? (
          <div className="achievements-row">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} width={110} height={110} radius={12} />
            ))}
          </div>
        ) : (
          <div className="achievements-row">
            {ACHIEVEMENTS.map((a) => {
              const unlocked = earned.has(a.id) || (totalDebates >= a.min);
              return (
                <div
                  key={a.id}
                  className={`achievement ${unlocked ? 'achievement--earned' : 'achievement--locked'}`}
                  title={a.desc}
                >
                  <div className="achievement-icon">{a.icon}</div>
                  <div className="achievement-name">{a.name}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
