import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/lobby.css';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001';

const CATEGORIES = [
  'All',
  'Technology',
  'Society',
  'Politics',
  'Education',
  'Environment',
  'Economy',
];

const DIFFICULTIES = [
  {
    key: 'beginner',
    icon: '🌱',
    name: 'Beginner',
    desc: 'Guided arguments with helpful prompts',
  },
  {
    key: 'intermediate',
    icon: '⚡',
    name: 'Intermediate',
    desc: 'Balanced challenge, fewer guardrails',
  },
  {
    key: 'expert',
    icon: '🔥',
    name: 'Expert',
    desc: 'No mercy — razor-sharp AI opponent',
  },
  {
    key: 'devil',
    icon: '😈',
    name: "Devil's Advocate",
    desc: 'AI argues against your own beliefs',
  },
];

const DIFF_COLORS = {
  easy: '#00ff87',
  medium: '#ffcc00',
  hard: '#ff3366',
};

const MAX_CUSTOM_TOPIC_LEN = 150;

export default function LobbyPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // "browse" | "custom"
  const [mode, setMode] = useState('browse');

  const [topics, setTopics] = useState([]);
  const [activeTab, setActiveTab] = useState('All');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [customTopicText, setCustomTopicText] = useState('');

  const [side, setSide] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const sideRef = useRef(null);
  const diffRef = useRef(null);
  const customInputRef = useRef(null);

  /* ── Fetch topics on mount ── */
  useEffect(() => {
    axios
      .get('/api/topics', {
        baseURL: API,
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setTopics(res.data.topics ?? res.data))
      .catch(() => setError('Failed to load topics.'));
  }, [token]);

  /* ── Reset step-2 / step-3 when mode or topic changes ── */
  const resetSteps = () => {
    setSide(null);
    setDifficulty(null);
  };

  const switchMode = (m) => {
    setMode(m);
    setSelectedTopic(null);
    setCustomTopicText('');
    resetSteps();
  };

  /* ── Filters ── */
  const filtered =
    activeTab === 'All'
      ? topics
      : topics.filter(
          (t) => t.category?.toLowerCase() === activeTab.toLowerCase()
        );

  /* ── Random pick ── */
  const pickRandom = () => {
    if (filtered.length === 0) return;
    const rand = filtered[Math.floor(Math.random() * filtered.length)];
    setSelectedTopic(rand);
    resetSteps();
    setTimeout(
      () => sideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50
    );
  };

  /* ── Scroll helpers ── */
  const scrollToSide = () =>
    setTimeout(
      () => sideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50
    );
  const scrollToDiff = () =>
    setTimeout(
      () => diffRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50
    );

  /* ── Derived values ── */
  const activeTopic =
    mode === 'custom' ? customTopicText.trim() : selectedTopic?.title ?? null;
  const canStart = activeTopic && activeTopic.length >= 5 && side && difficulty;

  /* ── Start debate ── */
  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    setError('');
    try {
      const body =
        mode === 'custom'
          ? { customTopic: customTopicText.trim(), side, difficulty }
          : {
              topicId: selectedTopic._id ?? selectedTopic.id,
              side,
              difficulty,
            };

      const res = await axios.post('/api/debates/start', body, {
        baseURL: API,
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate(`/debate/${res.data.debateId ?? res.data._id}`);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Could not start debate.'
      );
    } finally {
      setStarting(false);
    }
  };

  /* ── Render ── */
  return (
    <div className="lobby">
      {/* ── Header ── */}
      <header className="lobby-header">
        <h1 className="lobby-heading">Choose Your Debate</h1>
        <div className="lobby-user">
          <Link to="/profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="lobby-elo">{user?.eloRating ?? 1000}</span>
            <span className="lobby-username">{user?.username ?? 'Debater'}</span>
          </Link>
        </div>
      </header>

      {/* ── Mode toggle ── */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${mode === 'browse' ? 'mode-btn--active' : ''}`}
          onClick={() => switchMode('browse')}
        >
          📋 Browse Topics
        </button>
        <button
          className={`mode-btn ${mode === 'custom' ? 'mode-btn--active' : ''}`}
          onClick={() => {
            switchMode('custom');
            setTimeout(() => customInputRef.current?.focus(), 80);
          }}
        >
          ✍️ Your Topic
        </button>
      </div>

      {/* ── Browse mode ── */}
      {mode === 'browse' && (
        <>
          {/* ── Category tabs ── */}
          <nav className="lobby-tabs">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`lobby-tab ${activeTab === cat ? 'lobby-tab--active' : ''}`}
                onClick={() => setActiveTab(cat)}
              >
                {cat}
              </button>
            ))}
          </nav>

          {/* ── Random button ── */}
          <button className="lobby-random" onClick={pickRandom}>
            🎲 Random Topic
          </button>

          {/* ── Topics grid ── */}
          <div className="lobby-grid">
            {filtered.map((topic) => {
              const id = topic._id ?? topic.id;
              const selected =
                selectedTopic && (selectedTopic._id ?? selectedTopic.id) === id;
              return (
                <button
                  key={id}
                  className={`topic-card ${selected ? 'topic-card--selected' : ''}`}
                  onClick={() => {
                    setSelectedTopic(topic);
                    resetSteps();
                    scrollToSide();
                  }}
                >
                  <span className="topic-title">{topic.title}</span>
                  <div className="topic-meta">
                    <span
                      className="topic-pill"
                      data-category={topic.category?.toLowerCase()}
                    >
                      {topic.category}
                    </span>
                    <span
                      className="topic-diff"
                      style={{ color: DIFF_COLORS[topic.difficulty?.toLowerCase()] }}
                    >
                      {topic.difficulty}
                    </span>
                  </div>
                  <span className="topic-count">
                    {topic.debateCount ?? 0} debates
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Custom topic mode ── */}
      {mode === 'custom' && (
        <div className="custom-topic-area">
          <label className="custom-topic-label" htmlFor="custom-topic-input">
            Enter any topic — the AI will argue the opposite side.
          </label>
          <textarea
            id="custom-topic-input"
            ref={customInputRef}
            className="custom-topic-input"
            placeholder="e.g. 'Social media is ruining democracy' or 'Mars colonisation is humanity's greatest challenge'"
            value={customTopicText}
            maxLength={MAX_CUSTOM_TOPIC_LEN}
            rows={3}
            onChange={(e) => {
              setCustomTopicText(e.target.value);
              resetSteps();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (customTopicText.trim().length >= 5) scrollToSide();
              }
            }}
          />
          <div className="custom-topic-meta">
            <span
              className={`custom-topic-hint ${
                customTopicText.trim().length > 0 && customTopicText.trim().length < 5
                  ? 'custom-topic-hint--warn'
                  : ''
              }`}
            >
              {customTopicText.trim().length < 5 && customTopicText.length > 0
                ? 'Keep going…'
                : customTopicText.trim().length >= 5
                ? '✓ Topic ready'
                : 'Minimum 5 characters'}
            </span>
            <span className="custom-topic-counter">
              {customTopicText.length} / {MAX_CUSTOM_TOPIC_LEN}
            </span>
          </div>
          {customTopicText.trim().length >= 5 && (
            <button
              className="custom-topic-proceed"
              onClick={scrollToSide}
            >
              Continue → Pick Your Side
            </button>
          )}
        </div>
      )}

      {/* ── Side selector ── */}
      <div
        ref={sideRef}
        className={`lobby-section ${
          (mode === 'browse' && selectedTopic) ||
          (mode === 'custom' && customTopicText.trim().length >= 5)
            ? 'lobby-section--open'
            : ''
        }`}
      >
        <h2 className="lobby-section-title">Pick Your Side</h2>
        <div className="side-row">
          <button
            className={`side-btn side-btn--for ${side === 'for' ? 'side-btn--active' : ''}`}
            onClick={() => {
              setSide('for');
              scrollToDiff();
            }}
          >
            👍 FOR
          </button>
          <button
            className={`side-btn side-btn--against ${side === 'against' ? 'side-btn--active' : ''}`}
            onClick={() => {
              setSide('against');
              scrollToDiff();
            }}
          >
            👎 AGAINST
          </button>
        </div>
      </div>

      {/* ── Difficulty selector ── */}
      <div
        ref={diffRef}
        className={`lobby-section ${side ? 'lobby-section--open' : ''}`}
      >
        <h2 className="lobby-section-title">Select Difficulty</h2>
        <div className="diff-row">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              className={`diff-card ${difficulty === d.key ? 'diff-card--active' : ''} ${d.key === 'devil' ? 'diff-card--devil' : ''}`}
              onClick={() => setDifficulty(d.key)}
            >
              <span className="diff-icon">{d.icon}</span>
              <span className="diff-name">{d.name}</span>
              <span className="diff-desc">{d.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && <p className="lobby-error">{error}</p>}

      {/* ── Start button ── */}
      <button
        className={`lobby-start ${canStart ? 'lobby-start--ready' : ''}`}
        disabled={!canStart || starting}
        onClick={handleStart}
      >
        {starting ? 'Entering arena…' : 'Start Debate ⚔️'}
      </button>
    </div>
  );
}
