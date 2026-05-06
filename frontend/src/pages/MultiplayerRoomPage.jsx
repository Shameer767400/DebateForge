import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useMultiplayerSocket } from '../hooks/useMultiplayerSocket';
import '../styles/multiplayer.css';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001';

export default function MultiplayerRoomPage() {
  const { id: roomId } = useParams();
  const { user, token } = useAuth();

  /* ── Room state ── */
  const [roomState, setRoomState] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ── Live feed ── */
  const [arguments_, setArguments] = useState([]);
  const [moderatorMsgs, setModeratorMsgs] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [turnTimer, setTurnTimer] = useState(0);
  const [status, setStatus] = useState('waiting');

  /* ── Input ── */
  const [argText, setArgText] = useState('');
  const [chatText, setChatText] = useState('');

  /* ── Voting ── */
  const [votes, setVotes] = useState({ for: 0, against: 0 });
  const [hasVoted, setHasVoted] = useState(false);
  const [votingPhase, setVotingPhase] = useState(false);

  /* ── Results ── */
  const [results, setResults] = useState(null);

  /* ── Error ── */
  const [error, setError] = useState('');

  /* ── Refs ── */
  const feedRef = useRef(null);
  const chatFeedRef = useRef(null);
  const timerRef = useRef(null);

  /* ── Fetch initial room data ── */
  useEffect(() => {
    axios
      .get(`/api/rooms/${roomId}`, {
        baseURL: API,
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const r = res.data.room;
        setRoomState(r);
        setArguments(r.arguments || []);
        setModeratorMsgs(r.moderatorComments || []);
        setChatMessages((r.chatMessages || []).slice(-50));
        setStatus(r.status);
        setCurrentSpeaker(r.currentSpeaker);
        setVotes(r.votes || { for: 0, against: 0 });
        if (r.status === 'finished') {
          setResults({
            winner: r.winner,
            teamForScore: r.teamForScore,
            teamAgainstScore: r.teamAgainstScore,
            votes: r.votes,
            aiFeedback: r.aiFeedback,
          });
        }
      })
      .catch(() => setError('Failed to load room.'))
      .finally(() => setLoading(false));
  }, [roomId, token]);

  /* ── Socket event handler ── */
  const handleEvent = useCallback((event, data) => {
    switch (event) {
      case 'room_state':
        setRoomState(data);
        setStatus(data.status);
        setCurrentSpeaker(data.currentSpeaker);
        setArguments(data.arguments || []);
        setModeratorMsgs(data.moderatorComments || []);
        setChatMessages((data.chatMessages || []).slice(-50));
        setVotes(data.votes || { for: 0, against: 0 });
        break;

      case 'match_started':
        setStatus('in_progress');
        setCurrentSpeaker(data.currentSpeaker);
        startCountdown(data.turnTimerSecs);
        break;

      case 'turn_change':
        setCurrentSpeaker(data.currentSpeaker);
        startCountdown(data.turnTimerSecs);
        break;

      case 'turn_timeout':
        // handled by turn_change
        break;

      case 'argument_submitted':
        setArguments(prev => [...prev, data]);
        break;

      case 'moderator_message':
        setModeratorMsgs(prev => [...prev, data]);
        break;

      case 'chat_message':
        setChatMessages(prev => [...prev.slice(-99), data]);
        break;

      case 'fallacy_detected':
        // Could show a popup/toast — for now append to moderator messages
        setModeratorMsgs(prev => [...prev, {
          content: `⚠️ Fallacy detected in ${data.username}'s argument: ${data.fallacy_type} (${data.confidence}% confidence)`,
        }]);
        break;

      case 'vote_update':
        setVotes({ for: data.for, against: data.against });
        break;

      case 'voting_phase':
        setVotingPhase(true);
        setStatus('voting');
        clearInterval(timerRef.current);
        break;

      case 'match_ended':
        setStatus('finished');
        setResults(data);
        setVotingPhase(false);
        clearInterval(timerRef.current);
        break;

      case 'user_joined':
      case 'user_left':
        // room_state will follow
        break;

      case 'error':
        setError(data.message);
        setTimeout(() => setError(''), 4000);
        break;

      default:
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { connected, selectTeam, startMatch, submitArgument, sendChat, submitVote } =
    useMultiplayerSocket(roomId, { onEvent: handleEvent });

  /* ── Timer countdown ── */
  const startCountdown = (seconds) => {
    clearInterval(timerRef.current);
    setTurnTimer(seconds);
    timerRef.current = setInterval(() => {
      setTurnTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  /* ── Auto-scroll feed ── */
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [arguments_, moderatorMsgs]);

  useEffect(() => {
    chatFeedRef.current?.scrollTo({ top: chatFeedRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  /* ── Derived state ── */
  const isHost = roomState?.hostId === user?.id || roomState?.hostId?._id === user?.id;
  const myTeam = roomState?.teamFor?.find(m => m.userId === user?.id) ? 'for'
    : roomState?.teamAgainst?.find(m => m.userId === user?.id) ? 'against'
    : 'audience';
  const isMyTurn = currentSpeaker?.userId === user?.id;
  const canSpeak = status === 'in_progress' && isMyTurn;
  const isDebater = myTeam === 'for' || myTeam === 'against';

  /* ── Submit argument ── */
  const handleSubmit = () => {
    if (!argText.trim() || !canSpeak) return;
    submitArgument(argText);
    setArgText('');
  };

  /* ── Send chat ── */
  const handleChat = () => {
    if (!chatText.trim()) return;
    sendChat(chatText);
    setChatText('');
  };

  /* ── Vote ── */
  const handleVote = (side) => {
    if (hasVoted || isDebater) return;
    submitVote(side);
    setHasVoted(true);
  };

  if (loading) {
    return (
      <div className="df-center">
        <div className="df-spinner"><div className="df-spinner-orbit" /><div className="df-spinner-core" /></div>
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className="df-center">
        <p style={{ color: 'var(--text-muted)' }}>Room not found. <Link to="/multiplayer" style={{ color: 'var(--accent-blue)' }}>Back to lobby</Link></p>
      </div>
    );
  }

  /* ══════════════════════════════════════════
     WAITING ROOM
  ══════════════════════════════════════════ */
  if (status === 'waiting') {
    return (
      <div className="mp-lobby">
        <header className="mp-lobby-header">
          <h1>🏟️ {roomState.topic}</h1>
          <p>
            Room Code: <span style={{ color: '#00aaff', fontWeight: 700, letterSpacing: '3px', fontSize: '1.2rem' }}>{roomState.roomCode}</span>
            {' '}— Share this with friends!
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.5rem' }}>
            <span className={`mp-status-badge mp-status-badge--${status}`}>{status}</span>
            {connected && <span style={{ color: 'var(--accent-user)', fontSize: '0.75rem' }}>● Connected</span>}
          </div>
        </header>

        {/* Teams */}
        <div className="mp-teams-panel">
          <div
            className={`mp-team-box mp-team-box--for ${myTeam === 'for' ? 'mp-team-box--selected' : ''}`}
            onClick={() => selectTeam('for')}
          >
            <div className="mp-team-title mp-team-title--for">👍 Team FOR</div>
            <ul className="mp-team-members">
              {(roomState.teamFor || []).map((m, i) => (
                <li key={i} className="mp-team-member">
                  {m.username} {m.userId === roomState.hostId ? '👑' : ''}
                </li>
              ))}
              {(roomState.teamFor?.length || 0) < roomState.maxTeamSize && (
                <li className="mp-team-empty">
                  {roomState.maxTeamSize - (roomState.teamFor?.length || 0)} slot(s) open
                </li>
              )}
            </ul>
          </div>

          <div
            className={`mp-team-box mp-team-box--against ${myTeam === 'against' ? 'mp-team-box--selected' : ''}`}
            onClick={() => selectTeam('against')}
          >
            <div className="mp-team-title mp-team-title--against">👎 Team AGAINST</div>
            <ul className="mp-team-members">
              {(roomState.teamAgainst || []).map((m, i) => (
                <li key={i} className="mp-team-member">
                  {m.username} {m.userId === roomState.hostId ? '👑' : ''}
                </li>
              ))}
              {(roomState.teamAgainst?.length || 0) < roomState.maxTeamSize && (
                <li className="mp-team-empty">
                  {roomState.maxTeamSize - (roomState.teamAgainst?.length || 0)} slot(s) open
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Audience */}
        <div className="mp-audience-box">
          <button onClick={() => selectTeam('audience')} style={myTeam === 'audience' ? { borderColor: 'var(--accent-score)', color: 'var(--accent-score)' } : {}}>
            👀 Watch as Audience ({roomState.audience?.length || 0})
          </button>
        </div>

        {/* Host start button */}
        {isHost && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button
              className="mp-btn mp-btn--primary"
              onClick={startMatch}
              disabled={(roomState.teamFor?.length || 0) === 0 || (roomState.teamAgainst?.length || 0) === 0}
            >
              Start Match ⚔️
            </button>
            {((roomState.teamFor?.length || 0) === 0 || (roomState.teamAgainst?.length || 0) === 0) && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                Both teams need at least one member
              </p>
            )}
          </div>
        )}

        {!isHost && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem', fontSize: '0.85rem' }}>
            Waiting for the host to start the match…
          </p>
        )}

        {error && <p className="mp-error">{error}</p>}
      </div>
    );
  }

  /* ══════════════════════════════════════════
     LIVE DEBATE / VOTING / FINISHED
  ══════════════════════════════════════════ */
  return (
    <div className="mp-room">
      {/* ── Header ── */}
      <div className="mp-room-header">
        <div>
          <h2>{roomState.topic}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {roomState.roomCode} • {myTeam === 'audience' ? '👀 Audience' : `Team ${myTeam.toUpperCase()}`}
          </span>
        </div>
        <div className="mp-room-header-meta">
          <span className={`mp-status-badge mp-status-badge--${status}`}>{status.replace('_', ' ')}</span>
          {connected && <span style={{ color: 'var(--accent-user)', fontSize: '0.7rem' }}>● Live</span>}
          <Link to="/multiplayer" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>
            ← Leave
          </Link>
        </div>
      </div>

      {/* ── Main debate area ── */}
      <div className="mp-debate-area" ref={feedRef}>
        {/* Render arguments + moderator messages in order */}
        {renderFeed(arguments_, moderatorMsgs)}

        {/* Voting phase */}
        {votingPhase && !results && (
          <div className="mp-vote-panel">
            <h3>🗳️ Cast Your Vote</h3>
            {isDebater ? (
              <p style={{ color: 'var(--text-muted)' }}>Debaters cannot vote.</p>
            ) : hasVoted ? (
              <p style={{ color: 'var(--accent-user)' }}>✅ Vote submitted!</p>
            ) : (
              <div className="mp-vote-buttons">
                <button className="mp-vote-btn mp-vote-btn--for" onClick={() => handleVote('for')}>
                  👍 Team FOR
                </button>
                <button className="mp-vote-btn mp-vote-btn--against" onClick={() => handleVote('against')}>
                  👎 Team AGAINST
                </button>
              </div>
            )}
            <div className="mp-vote-counts">
              <span className="mp-vote-count--for">FOR: {votes.for}</span>
              <span className="mp-vote-count--against">AGAINST: {votes.against}</span>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="mp-results">
            <h2 className={`mp-results-winner--${results.winner}`}>
              {results.winner === 'draw' ? '🤝 Draw!' : `🏆 Team ${results.winner?.toUpperCase()} Wins!`}
            </h2>
            <div className="mp-results-scores">
              <div className="mp-results-team">
                <div className="mp-results-team-label">Team FOR</div>
                <div className="mp-results-team-score" style={{ color: 'var(--accent-user)' }}>
                  {results.teamForScore ?? 0}
                </div>
              </div>
              <div className="mp-results-team">
                <div className="mp-results-team-label">Team AGAINST</div>
                <div className="mp-results-team-score" style={{ color: 'var(--accent-ai)' }}>
                  {results.teamAgainstScore ?? 0}
                </div>
              </div>
            </div>
            <div className="mp-vote-counts" style={{ marginBottom: '1rem' }}>
              <span className="mp-vote-count--for">Votes FOR: {results.votes?.for || 0}</span>
              <span className="mp-vote-count--against">Votes AGAINST: {results.votes?.against || 0}</span>
            </div>
            {results.aiFeedback && (
              <div className="mp-results-feedback">{results.aiFeedback}</div>
            )}
            <div style={{ marginTop: '1.5rem' }}>
              <Link to="/multiplayer" className="mp-btn mp-btn--secondary" style={{ textDecoration: 'none' }}>
                Back to Lobby
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── Turn bar + Input ── */}
      {status === 'in_progress' && (
        <>
          <div className="mp-turn-bar">
            <span className="mp-turn-speaker">
              {isMyTurn ? '🎤 Your turn!' : `🎤 ${currentSpeaker?.username || '...'}'s turn`}
              {currentSpeaker?.team && (
                <span className={`mp-argument-team mp-argument-team--${currentSpeaker.team}`} style={{ marginLeft: '0.5rem' }}>
                  {currentSpeaker.team}
                </span>
              )}
            </span>
            <span className="mp-turn-timer">
              {Math.floor(turnTimer / 60)}:{String(turnTimer % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="mp-input-bar">
            <input
              type="text"
              placeholder={canSpeak ? 'Type your argument and press Enter…' : 'Wait for your turn…'}
              value={argText}
              onChange={(e) => setArgText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={!canSpeak}
            />
            <button className="mp-send-btn" onClick={handleSubmit} disabled={!canSpeak || !argText.trim()}>
              Send
            </button>
          </div>
        </>
      )}

      {/* ── Chat sidebar ── */}
      <div className="mp-sidebar">
        <div className="mp-sidebar-header">
          <h3>💬 Chat</h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {(roomState.teamFor?.length || 0) + (roomState.teamAgainst?.length || 0)} debaters • {roomState.audience?.length || 0} watching
          </span>
        </div>
        <div className="mp-chat-feed" ref={chatFeedRef}>
          {chatMessages.map((msg, i) => (
            <div key={i} className="mp-chat-msg">
              <span className="mp-chat-msg-user">{msg.username}: </span>
              <span className="mp-chat-msg-text">{msg.text}</span>
            </div>
          ))}
          {chatMessages.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>
              No messages yet
            </p>
          )}
        </div>
        <div className="mp-chat-input-wrap">
          <input
            type="text"
            placeholder="Say something…"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChat()}
            maxLength={500}
          />
          <button onClick={handleChat} disabled={!chatText.trim()}>Send</button>
        </div>
      </div>

      {error && <p className="mp-error" style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 999 }}>{error}</p>}
    </div>
  );
}

/* ── Helper: interleave arguments + moderator messages ── */
function renderFeed(args, modMsgs) {
  const feed = [];

  // Map moderator messages by afterTurn
  const modByTurn = new Map();
  modMsgs.forEach(m => {
    const key = m.afterTurn ?? -1;
    if (!modByTurn.has(key)) modByTurn.set(key, []);
    modByTurn.get(key).push(m);
  });

  // Opening moderator messages (afterTurn = 0 or -1)
  (modByTurn.get(0) || []).forEach((m, i) => {
    feed.push(<div key={`mod-0-${i}`} className="mp-moderator">{m.content}</div>);
  });
  (modByTurn.get(-1) || []).forEach((m, i) => {
    feed.push(<div key={`mod-n-${i}`} className="mp-moderator">{m.content}</div>);
  });

  args.forEach((arg, idx) => {
    feed.push(
      <div key={`arg-${idx}`} className={`mp-argument mp-argument--${arg.team}`}>
        <div className="mp-argument-header">
          <span className={`mp-argument-user mp-argument-user--${arg.team}`}>
            {arg.username}
          </span>
          <span className={`mp-argument-team mp-argument-team--${arg.team}`}>
            Team {arg.team.toUpperCase()}
          </span>
        </div>
        <div className="mp-argument-content">{arg.content}</div>
        {arg.scores?.overall != null && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Logic: {arg.scores.logic} • Evidence: {arg.scores.evidence} • Clarity: {arg.scores.clarity} • Overall: {arg.scores.overall}
          </div>
        )}
      </div>
    );

    // Moderator messages after this turn
    (modByTurn.get(arg.turnNumber) || []).forEach((m, i) => {
      feed.push(<div key={`mod-${arg.turnNumber}-${i}`} className="mp-moderator">{m.content}</div>);
    });
  });

  return feed;
}
