import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import StreakBadge from '../components/StreakBadge';
import { usePushNotifications } from '../hooks/usePushNotifications';
import '../styles/theme.css';
import '../styles/dashboard.css';
import '../styles/streak.css';

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
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [fallacies, setFallacies] = useState([]);
  const [history, setHistory] = useState([]);

  const { supported: pushSupported, subscribed: pushSubscribed, subscribe: subscribePush } =
    usePushNotifications();

  const DAILY_CHALLENGES = [
    'Win a debate using only questions (Socratic style)',
    'Debate a topic you disagree with personally',
    'Complete a debate without any fallacies detected',
    'Win an Expert-level debate',
    'Use at least 3 statistics in your arguments',
    'Win a debate in under 5 minutes',
    'Complete a formal Oxford-style debate',
  ];
  const todaysChallenge = DAILY_CHALLENGES[new Date().getDay()];

  /* ── parallel fetch ── */
  useEffect(() => {
    const base = process.env.REACT_APP_API_URL;
    const opts = { baseURL: base, withCredentials: true };

    Promise.allSettled([
      axios.get('/api/profile/me',                   opts),
      axios.get('/api/profile/fallacies',            opts),
      axios.get('/api/debates/history?limit=20',     opts),
    ]).then(([prof, fall, hist]) => {
      if (prof.status  === 'fulfilled') setProfile(prof.value.data);
      if (fall.status  === 'fulfilled') setFallacies(fall.value.data?.fallacies ?? fall.value.data ?? []);
      if (hist.status  === 'fulfilled') setHistory(hist.value.data?.debates     ?? hist.value.data ?? []);
      setLoading(false);
    });
  }, []);

  /* ── derived stats ── */
  const totalDebates = profile?.totalDebates ?? history.length;
  const wins         = profile?.wins ?? 0;
  const winRate      = totalDebates > 0 ? Math.round((wins / totalDebates) * 100) : 0;
  const avgScore     = profile?.avgScore ?? 0;
  const elo          = profile?.elo ?? user?.elo ?? 1200;
  const streakData   = profile?.user?.streak || user?.streak || { current: 0, longest: 0, freezeUsed: false };

  /* ── weekly activity (last 7 live local days from debate history) ── */
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const dateTitleFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  function toLocalYMD(dateLike) {
    const d = new Date(dateLike);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const today = new Date();
  const activityDots = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - i));
    const dayStr = toLocalYMD(day);
    const isActive = history.some((d) => {
      const debateDate = d.startedAt || d.createdAt;
      if (!debateDate) return false;
      return toLocalYMD(debateDate) === dayStr;
    });
    const isToday = i === 6;
    return {
      label: weekdayFormatter.format(day),
      title: dateTitleFormatter.format(day),
      isActive,
      isToday,
    };
  });

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

      {/* ── STREAK & HABIT SECTION (Addition 7) ── */}
      <section className="dash-section">
        <h2 className="dash-section-title">Habit Tracker</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

          {/* Streak Badge */}
          <StreakBadge streak={streakData} />

          {/* Weekly Activity Grid */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>This Week</div>
            <div className="activity-grid">
              {activityDots.map((dot, i) => (
                <div
                  key={i}
                  className={`activity-dot ${dot.isActive ? 'activity-dot--active' : ''} ${dot.isToday ? 'activity-dot--today' : ''}`}
                  title={`${dot.title}${dot.isActive ? ' • Debated' : ' • No debate'}${dot.isToday ? ' • Today' : ''}`}
                >
                  {dot.label}
                </div>
              ))}
            </div>
          </div>

          {/* Daily Challenge */}
          <div className="daily-challenge">
            <div className="daily-challenge-title">🎯 Daily Challenge</div>
            <div className="daily-challenge-text">{todaysChallenge}</div>
            <button className="daily-challenge-cta" onClick={() => navigate('/lobby')}>
              Accept Challenge
            </button>
          </div>
        </div>

        {/* Push notification opt-in */}
        {pushSupported && !pushSubscribed && (
          <div className="push-banner" style={{ marginTop: 12 }}>
            <span className="push-banner-text">
              🔔 Get reminders to keep your streak alive?
            </span>
            <button className="push-banner-btn" onClick={subscribePush}>
              Enable Notifications
            </button>
          </div>
        )}
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

      {/* ── COACHING FOCUS (Adaptive Coaching Engine) ── */}
      {!loading && profile?.coaching && profile.coaching.activeDrill && (
        <section className="dash-section">
          <h2 className="dash-section-title">🎯 Coaching Focus</h2>
          <div className="coaching-card">
            <div className="coaching-header">
              <div className="coaching-target">
                <span className="coaching-label">Active Drill</span>
                <span className="coaching-fallacy">
                  {profile.coaching.activeDrill.replace(/_/g, ' ')}
                </span>
              </div>
              {profile.coaching.weakPhase && (
                <div className="coaching-target">
                  <span className="coaching-label">Weak Phase</span>
                  <span className="coaching-phase">{profile.coaching.weakPhase}</span>
                </div>
              )}
              <div className="coaching-target">
                <span className="coaching-label">Coaching Level</span>
                <span className="coaching-level">{profile.coaching.level}/100</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="coaching-progress-wrap">
              <div
                className="coaching-progress-bar"
                style={{ width: `${Math.min(profile.coaching.level, 100)}%` }}
              />
            </div>

            {/* Active weaknesses */}
            {profile.coaching.weaknesses && profile.coaching.weaknesses.length > 0 && (
              <div className="coaching-weaknesses">
                <span className="coaching-label" style={{ marginBottom: 8, display: 'block' }}>Weaknesses Being Drilled</span>
                {profile.coaching.weaknesses.map((w) => (
                  <div key={w.fallacy} className="coaching-weakness-row">
                    <span className="coaching-weakness-name">{w.fallacy?.replace(/_/g, ' ')}</span>
                    <span className="coaching-weakness-count">{w.occurrences}× detected</span>
                    <span className="coaching-weakness-streak">
                      {w.cleanStreak > 0 ? `🟢 ${w.cleanStreak} clean` : '🔴 Active'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              className="coaching-cta"
              onClick={() => navigate('/lobby')}
            >
              ⚔ Practice This Weakness
            </button>
          </div>
        </section>
      )}

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
          <Link to="/history" className="dash-view-all" style={{ textDecoration: 'none' }}>
            View All →
          </Link>
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
                  const isWin = d.winner === 'user';
                  const isLoss = d.winner === 'ai';
                  return (
                    <tr
                      key={id}
                      className="debate-row"
                      onClick={() => navigate('/history')}
                      title="View in History"
                    >
                      <td className="td-topic">
                        {d.topicSnapshot ?? d.topic?.title ?? '—'}
                      </td>
                      <td className="td-date">
                        {(d.startedAt || d.createdAt)
                          ? new Date(d.startedAt ?? d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="td-side">
                        <span className={`side-tag side-tag--${(d.userSide ?? '').toLowerCase()}`}>
                          {d.userSide ?? '—'}
                        </span>
                      </td>
                      <td>
                        <ResultPill result={isWin ? 'win' : isLoss ? 'loss' : d.winner === 'draw' ? 'draw' : undefined} />
                      </td>
                      <td className="td-score">
                        {d.userFinalScore ?? '—'}
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
