import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/profile.css';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001';

const ACHIEVEMENTS_CATALOGUE = [
  { id: 'first_debate',      icon: '⚔️',  name: 'First Blood',      desc: 'Complete your first debate' },
  { id: 'first_blood',       icon: '🏅',  name: 'First Win',         desc: 'Win your first debate' },
  { id: '10_wins',           icon: '🏆',  name: '10 Victories',      desc: 'Win 10 debates' },
  { id: 'logic_master',      icon: '🧠',  name: 'Logic Master',      desc: 'Average score > 80 across 5 debates' },
  { id: 'no_fallacy_streak_3', icon: '🛡️', name: 'Iron Logic',       desc: '3 debates without a fallacy' },
  { id: 'evidence_king',     icon: '📚',  name: 'Evidence King',     desc: 'Evidence score > 90' },
  { id: 'comeback_king',     icon: '🔥',  name: 'Comeback King',     desc: 'Win after a losing streak' },
  { id: 'veteran',           icon: '⭐',  name: 'Veteran',           desc: '50 debates completed' },
];

function StatCard({ value, label, color }) {
  return (
    <div className="prof-stat-card">
      <div className="prof-stat-value" style={color ? { color } : {}}>
        {value ?? '—'}
      </div>
      <div className="prof-stat-label">{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [fallacies, setFallacies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    Promise.allSettled([
      axios.get('/api/profile/me', { baseURL: API, headers }),
      axios.get('/api/profile/fallacies', { baseURL: API, headers }),
      axios.get('/api/debates/history?limit=10', { baseURL: API, headers }),
    ]).then(([prof, fall, hist]) => {
      if (prof.status === 'fulfilled') {
        setProfile(prof.value.data);
        if (prof.value.data?.user?.profilePicUrl) {
          setAvatarUrl(prof.value.data.user.profilePicUrl);
        }
      }
      if (fall.status === 'fulfilled') setFallacies(fall.value.data?.fallacies ?? []);
      if (hist.status === 'fulfilled') setHistory(hist.value.data?.debates ?? []);
      setLoading(false);
    });
  }, [token]);

  const profileUser = profile?.user ?? user;
  const wins = profileUser?.wins ?? 0;
  const losses = profileUser?.losses ?? 0;
  const draws = profileUser?.draws ?? 0;
  const total = profileUser?.totalDebates ?? 0;
  const elo = profileUser?.eloRating ?? 0;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const avgScore = profile?.stats?.avgScore != null
    ? Math.round(profile.stats.avgScore)
    : '—';
  const earnedSet = new Set(profileUser?.achievements ?? []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await axios.post('/api/profile/avatar', formData, {
        baseURL: API,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setAvatarUrl(res.data.profilePicUrl);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await axios.delete('/api/profile/avatar', {
        baseURL: API,
        headers: { Authorization: `Bearer ${token}` },
      });
      setAvatarUrl(null);
    } catch (err) {
      console.error('Avatar remove failed:', err);
    }
  };

  /* ── Bio editing ── */
  const [bio, setBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [savingBio, setSavingBio] = useState(false);

  useEffect(() => {
    if (profile?.user?.bio != null) setBio(profile.user.bio);
  }, [profile]);

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      await axios.put('/api/profile/bio', { bio }, {
        baseURL: API,
        headers: { Authorization: `Bearer ${token}` },
      });
      setEditingBio(false);
    } catch (err) {
      console.error('Bio save failed:', err);
    } finally {
      setSavingBio(false);
    }
  };

  return (
    <div className="prof-page">
      {/* ── Nav ── */}
      <nav className="prof-nav">
        <Link to="/lobby" className="prof-nav-back">← Back to Lobby</Link>
        <div className="prof-nav-links">
          <Link to="/dashboard" className="prof-nav-link">Dashboard</Link>
          <Link to="/leaderboard" className="prof-nav-link">Leaderboard</Link>
          <button className="prof-logout-btn" onClick={handleLogout}>Log Out</button>
        </div>
      </nav>

      {loading ? (
        <div className="prof-loading">Loading profile…</div>
      ) : (
        <>
          {/* ── Hero ── */}
          <section className="prof-hero">
            <div className="prof-avatar-wrap">
              <div
                className={`prof-avatar ${uploading ? 'prof-avatar--uploading' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                title="Click to change profile picture"
              >
                {avatarUrl ? (
                  <img
                    src={`${API}${avatarUrl}`}
                    alt="Profile"
                    className="prof-avatar-img"
                  />
                ) : (
                  profileUser?.username?.[0]?.toUpperCase() ?? '?'
                )}
                <div className="prof-avatar-overlay">
                  {uploading ? '⏳' : '📷'}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                />
              </div>
              {avatarUrl && (
                <button
                  className="prof-avatar-remove"
                  onClick={handleRemoveAvatar}
                  title="Remove profile picture"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="prof-hero-info">
              <h1 className="prof-username">{profileUser?.username ?? 'Debater'}</h1>
              <p className="prof-email">{profileUser?.email ?? ''}</p>
              {/* Bio display */}
              {bio && !editingBio && (
                <p className="prof-bio">{bio}</p>
              )}
              <div className="prof-elo-badge">{elo} ELO</div>
            </div>
          </section>

          {/* ── Profile Options ── */}
          <section className="prof-section">
            <h2 className="prof-section-title">Profile Options</h2>
            <div className="prof-options">
              <button
                className="prof-option-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                📷 {avatarUrl ? 'Change Profile Picture' : 'Add Profile Picture'}
              </button>
              {avatarUrl && (
                <button
                  className="prof-option-btn prof-option-btn--danger"
                  onClick={handleRemoveAvatar}
                >
                  🗑️ Remove Picture
                </button>
              )}
              <button
                className="prof-option-btn"
                onClick={() => setEditingBio(true)}
              >
                ✏️ {bio ? 'Edit Bio' : 'Add Bio'}
              </button>
            </div>

            {/* Bio editor */}
            {editingBio && (
              <div className="prof-bio-editor">
                <textarea
                  className="prof-bio-input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 200))}
                  placeholder="Write a short bio about yourself…"
                  rows={3}
                  maxLength={200}
                  autoFocus
                />
                <div className="prof-bio-footer">
                  <span className="prof-bio-count">{bio.length}/200</span>
                  <div className="prof-bio-actions">
                    <button
                      className="prof-bio-cancel"
                      onClick={() => {
                        setBio(profile?.user?.bio ?? '');
                        setEditingBio(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="prof-bio-save"
                      onClick={handleSaveBio}
                      disabled={savingBio}
                    >
                      {savingBio ? 'Saving…' : 'Save Bio'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── Stats ── */}
          <section className="prof-section">
            <h2 className="prof-section-title">Stats</h2>
            <div className="prof-stats-row">
              <StatCard value={total} label="Debates" />
              <StatCard value={wins} label="Wins" color="var(--accent-user)" />
              <StatCard value={losses} label="Losses" color="#ff3366" />
              <StatCard value={draws} label="Draws" color="var(--accent-score)" />
              <StatCard value={`${winRate}%`} label="Win Rate" color="var(--accent-user)" />
              <StatCard value={avgScore} label="Avg Score" color="var(--accent-blue)" />
            </div>
          </section>

          {/* ── Achievements ── */}
          <section className="prof-section">
            <h2 className="prof-section-title">Achievements</h2>
            <div className="prof-achievements">
              {ACHIEVEMENTS_CATALOGUE.map((a) => {
                const unlocked = earnedSet.has(a.id);
                return (
                  <div
                    key={a.id}
                    className={`prof-achievement ${unlocked ? 'prof-achievement--earned' : 'prof-achievement--locked'}`}
                    title={a.desc}
                  >
                    <span className="prof-achievement-icon">{a.icon}</span>
                    <span className="prof-achievement-name">{a.name}</span>
                    <span className="prof-achievement-desc">{a.desc}</span>
                    {!unlocked && <span className="prof-achievement-lock">🔒</span>}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Fallacy profile ── */}
          {fallacies.length > 0 && (
            <section className="prof-section">
              <h2 className="prof-section-title">Your Fallacy Profile</h2>
              <div className="prof-fallacies">
                {fallacies.map((f) => (
                  <div key={f.type} className="prof-fallacy-row">
                    <span className="prof-fallacy-type">
                      {f.type.replace(/_/g, ' ')}
                    </span>
                    <div className="prof-fallacy-bar-wrap">
                      <div
                        className="prof-fallacy-bar"
                        style={{ width: `${f.percentage}%` }}
                      />
                    </div>
                    <span className="prof-fallacy-pct">{f.percentage}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Recent debates ── */}
          <section className="prof-section">
            <h2 className="prof-section-title">Recent Debates</h2>
            {history.length === 0 ? (
              <p className="prof-empty">No debates yet — <Link to="/lobby" className="prof-link">start one!</Link></p>
            ) : (
              <div className="prof-history">
                {history.map((d) => {
                  const id = d._id ?? d.id;
                  const resultCls =
                    d.winner === 'user' ? 'prof-result--win'
                    : d.winner === 'ai' ? 'prof-result--loss'
                    : d.winner === 'draw' ? 'prof-result--draw'
                    : '';
                  const resultLabel =
                    d.winner === 'user' ? 'Win'
                    : d.winner === 'ai' ? 'Loss'
                    : d.winner === 'draw' ? 'Draw'
                    : 'In Progress';
                  return (
                    <div key={id} className="prof-history-row">
                      <div className="prof-history-topic">
                        {d.topicSnapshot ?? '—'}
                      </div>
                      <div className="prof-history-meta">
                        <span className={`prof-side prof-side--${d.userSide}`}>
                          {d.userSide === 'for' ? '👍 For' : '👎 Against'}
                        </span>
                        <span className={`prof-result ${resultCls}`}>{resultLabel}</span>
                        {d.userFinalScore != null && (
                          <span className="prof-score">{d.userFinalScore} pts</span>
                        )}
                        <span className="prof-date">
                          {d.startedAt
                            ? new Date(d.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                            : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
