import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import '../styles/lobby.css';
import '../styles/lobby-format.css';

const CATEGORIES = [
  'All',
  'Placement & GD',
  'Model UN (MUN)',
  'Technology',
  'Society',
  'Politics',
  'Education',
  'Environment',
  'Economy',
];

const CURATED_TOPICS = [
  { id: 'gd-1', title: 'Work From Home vs Return to Office: What is better for young careers?', category: 'Placement & GD', difficulty: 'medium' },
  { id: 'gd-2', title: 'Should Generative AI tools be allowed during campus placement coding tests?', category: 'Placement & GD', difficulty: 'hard' },
  { id: 'gd-3', title: 'Cryptocurrency & Digital Currency: Financial future or speculative bubble?', category: 'Placement & GD', difficulty: 'hard' },
  { id: 'gd-4', title: 'Privatization of Public Sector Banks and PSUs: Economic boon or bane?', category: 'Placement & GD', difficulty: 'medium' },
  { id: 'gd-5', title: 'Electric Vehicles in developing nations: Are power grids and infra ready?', category: 'Placement & GD', difficulty: 'medium' },
  { id: 'gd-6', title: 'Gig Economy: Flexible workforce empowerment or lack of labor security?', category: 'Placement & GD', difficulty: 'easy' },
  { id: 'gd-7', title: 'Data localization vs cross-border cloud innovation: Which must policy prioritize?', category: 'Placement & GD', difficulty: 'hard' },
  { id: 'gd-8', title: 'College degrees vs specialized portfolio skills: What recruiters value more in 2026', category: 'Placement & GD', difficulty: 'easy' },
  { id: 'mun-1', title: 'The UN Security Council veto power should be permanently restructured', category: 'Model UN (MUN)', difficulty: 'hard' },
  { id: 'mun-2', title: 'Developed nations owe legally binding climate reparations to the Global South', category: 'Model UN (MUN)', difficulty: 'hard' },
  { id: 'mun-3', title: 'An international treaty must ban fully autonomous lethal military systems', category: 'Model UN (MUN)', difficulty: 'hard' },
  { id: 'mun-4', title: 'Developing nations should have guaranteed sovereign access to outer space resources', category: 'Model UN (MUN)', difficulty: 'medium' },
  { id: 'mun-5', title: 'Universal human rights vs cultural sovereignty in international trade sanctions', category: 'Model UN (MUN)', difficulty: 'hard' },
  { id: 'mun-6', title: 'Global governance of artificial intelligence should be managed by a UN specialized agency', category: 'Model UN (MUN)', difficulty: 'medium' },
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

const PERSONAS = [
  { key: 'balanced',   icon: '⚖️', name: 'Balanced',   desc: 'Firm but fair — the default style' },
  { key: 'socratic',   icon: '🧐', name: 'Socratic',   desc: 'Probing questions — exposes contradictions' },
  { key: 'aggressive', icon: '💥', name: 'Aggressive', desc: 'Sharp wit, pointed challenges, no mercy' },
  { key: 'academic',   icon: '🎓', name: 'Academic',   desc: 'Studies, logic notation, scholarly tone' },
  { key: 'casual',     icon: '☕', name: 'Casual',     desc: 'Smart friend debating over coffee' },
];

const FORMATS = [
  { key: 'freeform',          icon: '💬', name: 'Freeform',          desc: 'Open debate, no strict rules',       badge: 'RECOMMENDED',  badgeColor: '#00ff87' },
  { key: 'oxford',            icon: '🎓', name: 'Oxford Union',      desc: 'Opening → Rebuttal → Cross-Exam → Closing', badge: 'INTERMEDIATE', badgeColor: '#ffcc00' },
  { key: 'lincoln_douglas',   icon: '⚖️',  name: 'Lincoln-Douglas',   desc: 'Classic 1v1 value debate format',    badge: 'ADVANCED',     badgeColor: '#ff9500' },
  { key: 'parliamentary',     icon: '🏛️', name: 'Parliamentary',     desc: 'British Parliamentary style',        badge: 'EXPERT',       badgeColor: '#ff3366' },
];

const DIFF_COLORS = {
  easy: '#00ff87',
  medium: '#ffcc00',
  hard: '#ff3366',
};

const MAX_CUSTOM_TOPIC_LEN = 150;

export default function LobbyPage() {
  const { user } = useAuth();
  const api = useApi();
  const navigate = useNavigate();

  // "browse" | "custom"
  const [mode, setMode] = useState('browse');

  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [customTopicText, setCustomTopicText] = useState('');

  const [side, setSide] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [persona, setPersona] = useState('balanced');
  const [format, setFormat] = useState('freeform');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [billingInfo, setBillingInfo] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const sideRef = useRef(null);
  const diffRef = useRef(null);
  const personaRef = useRef(null);
  const formatRef = useRef(null);
  const customInputRef = useRef(null);
  const apiRef = useRef(api);
  apiRef.current = api;

  /* ── Fetch topics & subscription on mount ── */
  useEffect(() => {
    let mounted = true;
    apiRef.current
      .get('/api/topics')
      .then((res) => { if (mounted) setTopics(res.data.topics ?? res.data); })
      .catch(() => { if (mounted) setError('Failed to load topics.'); })
      .finally(() => { if (mounted) setLoading(false); });

    apiRef.current
      .get('/api/billing/subscription')
      .then((res) => { if (mounted) setBillingInfo(res.data); })
      .catch(() => {});

    return () => { mounted = false; };
  }, []);

  /* ── Auto-select shared challenge topic from URL ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedTopic = params.get('topic');
    if (sharedTopic && sharedTopic.trim()) {
      setMode('custom');
      setCustomTopicText(sharedTopic.trim());
      setSelectedTopic({ title: sharedTopic.trim(), category: 'Challenge', difficulty: 'medium' });
    }
  }, []);

  /* ── Reset step-2 / step-3 when mode or topic changes ── */
  const resetSteps = () => {
    setSide(null);
    setDifficulty(null);
    setPersona('balanced');
    setFormat('freeform');
  };

  const switchMode = (m) => {
    setMode(m);
    setSelectedTopic(null);
    setCustomTopicText('');
    resetSteps();
  };

  /* ── Filters ── */
  const allAvailableTopics = [...CURATED_TOPICS, ...topics];
  const filtered =
    activeTab === 'All'
      ? allAvailableTopics
      : allAvailableTopics.filter(
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
  const scrollToPersona = () =>
    setTimeout(
      () => personaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50
    );
  const scrollToFormat = () =>
    setTimeout(
      () => formatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
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
      const isCuratedCustom =
        selectedTopic?.id &&
        (String(selectedTopic.id).startsWith('gd-') || String(selectedTopic.id).startsWith('mun-'));

      const body =
        mode === 'custom' || isCuratedCustom
          ? { customTopic: activeTopic, side, difficulty, persona, format }
          : {
              topicId: selectedTopic._id ?? selectedTopic.id,
              side,
              difficulty,
              persona,
              format,
            };

      const res = await api.post('/api/debates/start', body);
      navigate(`/debate/${res.data.debateId ?? res.data._id}`);
    } catch (err) {
      if (err.response?.status === 402 || err.response?.data?.code === 'FREE_LIMIT_REACHED') {
        setShowUpgradeModal(true);
      } else {
        setError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            err.message ||
            'Could not start debate.'
        );
      }
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
        <div className="lobby-user" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="lobby-desktop-links">
            {user?.role && String(user.role).replace(/["'\\]/g, '').trim().toLowerCase() === 'admin' && (
              <Link to="/admin" className="lobby-nav-desktop-link" style={{ color: '#00ff87', fontWeight: 700 }}>🛡️ Admin</Link>
            )}
            <Link to="/dashboard" className="lobby-nav-desktop-link">Dashboard</Link>
            <Link to="/leaderboard" className="lobby-nav-desktop-link">Leaderboard</Link>
            <Link to="/history" className="lobby-nav-desktop-link">History</Link>
            <Link to="/pricing" className="lobby-nav-desktop-link">Pricing</Link>
            <Link to="/feedback" className="lobby-nav-desktop-link">Feedback</Link>
          </div>
          <Link to="/profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="lobby-elo">{user?.eloRating ?? 1000}</span>
            <span className="lobby-username">{user?.username ?? 'Debater'}</span>
          </Link>
        </div>
      </header>

      {/* ── Usage / Plan status banner ── */}
      {billingInfo && (
        <div className="lobby-usage-strip">
          {billingInfo.isPaid ? (
            <div className="lobby-usage-pill lobby-usage-pill--pro">
              <span className="lobby-usage-icon">✨</span>
              <span className="lobby-usage-text"><strong>Pro Active:</strong> Unlimited AI debate sparring rounds unlocked</span>
            </div>
          ) : (
            <div className="lobby-usage-pill lobby-usage-pill--free">
              <span className="lobby-usage-icon">🎯</span>
              <span className="lobby-usage-text">
                Free Plan: <strong>{billingInfo.usage?.debatesRemaining ?? (Math.max(0, 5 - (billingInfo.usage?.debatesUsed ?? 0)))} of {billingInfo.usage?.debatesLimit ?? 5} free debates</strong> remaining this month
              </span>
              <Link to="/pricing" className="lobby-upgrade-cta">
                ⚡ Upgrade (Day Pass ₹49 / Pro ₹299)
              </Link>
            </div>
          )}
        </div>
      )}

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
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="topic-skeleton" style={{ animationDelay: `${i * 100}ms` }} />
              ))
            ) : filtered.length === 0 ? (
              <div className="no-topics">No topics found for this category.</div>
            ) : (
              filtered.map((topic) => {
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
              })
            )}
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
              onClick={() => {
                setDifficulty(d.key);
                scrollToPersona();
              }}
            >
              <span className="diff-icon">{d.icon}</span>
              <span className="diff-name">{d.name}</span>
              <span className="diff-desc">{d.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Persona selector ── */}
      <div
        ref={personaRef}
        className={`lobby-section ${difficulty ? 'lobby-section--open' : ''}`}
      >
        <h2 className="lobby-section-title">Choose AI Persona</h2>
        <div className="persona-row">
          {PERSONAS.map((p) => (
            <button
              key={p.key}
              className={`persona-card ${persona === p.key ? 'persona-card--active' : ''}`}
              onClick={() => { setPersona(p.key); scrollToFormat(); }}
            >
              <span className="persona-icon">{p.icon}</span>
              <span className="persona-name">{p.name}</span>
              <span className="persona-desc">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Format selector (Addition 6) ── */}
      <div
        ref={formatRef}
        className={`lobby-section ${persona ? 'lobby-section--open' : ''}`}
      >
        <h2 className="lobby-section-title">Choose Debate Format</h2>
        <div className="format-row">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              className={`format-card ${format === f.key ? 'format-card--active' : ''}`}
              onClick={() => setFormat(f.key)}
            >
              <span className="format-badge" style={{ background: f.badgeColor }}>{f.badge}</span>
              <span className="format-icon">{f.icon}</span>
              <span className="format-name">{f.name}</span>
              <span className="format-desc">{f.desc}</span>
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
      {/* ── Upgrade Prompt Modal ── */}
      {showUpgradeModal && (
        <div className="lobby-upgrade-backdrop" onClick={() => setShowUpgradeModal(false)}>
          <div className="lobby-upgrade-card" onClick={(e) => e.stopPropagation()}>
            <div className="lobby-upgrade-icon">🎯</div>
            <h3 className="lobby-upgrade-title">Monthly Free Limit Reached (5/5)</h3>
            <p className="lobby-upgrade-desc">
              You've used all 5 free debates for this month! Upgrade now to keep sparring with AI opponents, unlock unlimited custom personas, and access detailed fallacy breakdowns.
            </p>
            <div className="lobby-upgrade-options">
              <div className="lobby-upgrade-option">
                <div className="option-name">⚡ 24-Hour Pass</div>
                <div className="option-price">₹49</div>
                <div className="option-sub">Unlimited debates for 24h</div>
              </div>
              <div className="lobby-upgrade-option lobby-upgrade-option--featured">
                <div className="option-badge">POPULAR</div>
                <div className="option-name">✨ Monthly Pro</div>
                <div className="option-price">₹299/mo</div>
                <div className="option-sub">Unlimited debates & advanced judging</div>
              </div>
            </div>
            <div className="lobby-upgrade-actions">
              <button className="lobby-upgrade-btn" onClick={() => navigate('/pricing')}>
                View Plans & Upgrade →
              </button>
              <button className="lobby-upgrade-dismiss" onClick={() => setShowUpgradeModal(false)}>
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
