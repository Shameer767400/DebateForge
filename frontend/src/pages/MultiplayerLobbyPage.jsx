import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/multiplayer.css';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001';

export default function MultiplayerLobbyPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('create'); // create | join | browse
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create form
  const [topic, setTopic] = useState('');
  const [maxTeamSize, setMaxTeamSize] = useState(3);
  const [maxRounds, setMaxRounds] = useState(6);
  const [turnTimer, setTurnTimer] = useState(120);
  const [creating, setCreating] = useState(false);

  // Join form
  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining] = useState(false);

  /* ── Fetch rooms when browsing ── */
  useEffect(() => {
    if (tab === 'browse') {
      setLoading(true);
      axios
        .get('/api/rooms', {
          baseURL: API,
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => setRooms(res.data.rooms || []))
        .catch(() => setError('Failed to load rooms.'))
        .finally(() => setLoading(false));
    }
  }, [tab, token]);

  /* ── Create room ── */
  const handleCreate = async () => {
    if (!topic.trim() || topic.trim().length < 5) {
      setError('Topic must be at least 5 characters.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await axios.post(
        '/api/rooms',
        { topic: topic.trim(), maxTeamSize, maxRounds, turnTimerSecs: turnTimer },
        { baseURL: API, headers: { Authorization: `Bearer ${token}` } }
      );
      navigate(`/room/${res.data.roomId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create room.');
    } finally {
      setCreating(false);
    }
  };

  /* ── Join room ── */
  const handleJoin = async () => {
    if (!roomCode.trim()) {
      setError('Enter a room code.');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const res = await axios.post(
        '/api/rooms/join',
        { roomCode: roomCode.trim().toUpperCase() },
        { baseURL: API, headers: { Authorization: `Bearer ${token}` } }
      );
      navigate(`/room/${res.data.roomId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not join room.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="mp-lobby">
      <header className="mp-lobby-header">
        <h1>⚔️ Multiplayer Debates</h1>
        <p>Create a room, invite friends, and debate in real-time with live AI moderation</p>
        <div style={{ marginTop: '1rem' }}>
          <Link to="/lobby" className="retro-back-link">
            ← Back to Solo Lobby
          </Link>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="mp-tabs">
        <button className={`mp-tab ${tab === 'create' ? 'mp-tab--active' : ''}`} onClick={() => { setTab('create'); setError(''); }}>
          ✨ Create Room
        </button>
        <button className={`mp-tab ${tab === 'join' ? 'mp-tab--active' : ''}`} onClick={() => { setTab('join'); setError(''); }}>
          🔑 Join Room
        </button>
        <button className={`mp-tab ${tab === 'browse' ? 'mp-tab--active' : ''}`} onClick={() => { setTab('browse'); setError(''); }}>
          📋 Browse Rooms
        </button>
      </div>

      {/* ── Create ── */}
      {tab === 'create' && (
        <div className="mp-create-form">
          <div className="mp-field">
            <label htmlFor="mp-topic">Debate Topic</label>
            <textarea
              id="mp-topic"
              rows={3}
              placeholder="e.g. 'AI will replace most jobs within 20 years'"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="mp-field-row">
            <div className="mp-field">
              <label htmlFor="mp-team-size">Team Size</label>
              <select id="mp-team-size" value={maxTeamSize} onChange={(e) => setMaxTeamSize(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} per team</option>
                ))}
              </select>
            </div>

            <div className="mp-field">
              <label htmlFor="mp-rounds">Rounds</label>
              <select id="mp-rounds" value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))}>
                {[2, 4, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>{n} rounds</option>
                ))}
              </select>
            </div>

            <div className="mp-field">
              <label htmlFor="mp-timer">Turn Timer</label>
              <select id="mp-timer" value={turnTimer} onChange={(e) => setTurnTimer(Number(e.target.value))}>
                {[30, 60, 90, 120, 180, 300].map((s) => (
                  <option key={s} value={s}>{s >= 60 ? `${s / 60}m` : `${s}s`}</option>
                ))}
              </select>
            </div>
          </div>

          <button className="mp-btn mp-btn--primary" onClick={handleCreate} disabled={creating || !topic.trim()}>
            {creating ? 'Creating…' : 'Create Room 🚀'}
          </button>
        </div>
      )}

      {/* ── Join ── */}
      {tab === 'join' && (
        <div className="mp-join-form">
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Enter the 6-character room code shared by the host
          </p>
          <input
            className="mp-code-input mp-field"
            type="text"
            maxLength={6}
            placeholder="ABC123"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            style={{ display: 'block', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: '2rem', textAlign: 'center', letterSpacing: '8px', textTransform: 'uppercase', maxWidth: '300px', margin: '1rem auto' }}
          />
          <button className="mp-btn mp-btn--primary" onClick={handleJoin} disabled={joining || roomCode.length < 6}>
            {joining ? 'Joining…' : 'Join Room →'}
          </button>
        </div>
      )}

      {/* ── Browse ── */}
      {tab === 'browse' && (
        <div className="mp-room-list">
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading rooms…</p>
          ) : rooms.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No active rooms. Create one!</p>
          ) : (
            rooms.map((room) => (
              <div
                key={room._id}
                className="mp-room-card"
                onClick={() => navigate(`/room/${room._id}`)}
              >
                <div className="mp-room-info">
                  <div className="mp-room-topic">{room.topic}</div>
                  <div className="mp-room-meta">
                    <span>👥 {(room.teamFor?.length || 0) + (room.teamAgainst?.length || 0)} debaters</span>
                    <span>👀 {room.audience?.length || 0} watching</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  <span className={`mp-room-status mp-room-status--${room.status}`}>
                    {room.status === 'waiting' ? '🟢 Open' : '🟡 Live'}
                  </span>
                  <span className="mp-room-code">{room.roomCode}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {error && <p className="mp-error">{error}</p>}
    </div>
  );
}
