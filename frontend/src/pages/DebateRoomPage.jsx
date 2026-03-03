import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDebateSocket } from '../hooks/useDebateSocket';
import Confetti from '../components/Confetti';
import '../styles/theme.css';
import '../styles/debate.css';

/* ── Sound helpers (Web Audio API — no files needed) ── */
function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* silent fail if audio not supported */ }
}

function playVictory() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.4);
    });
  } catch { /* silent fail */ }
}

/* ── Results modal ── */
function ResultsModal({ result, onClose }) {
  const winner = result?.winner;
  const score  = result?.userFinalScore ?? 0;
  const emoji  = winner === 'user' ? '🏆' : winner === 'draw' ? '🤝' : '😔';
  const label  = winner === 'user' ? 'You Win!' : winner === 'draw' ? 'Draw' : 'AI Wins';
  return (
    <div className="debate-ended-banner">
      <div style={{ fontSize: '3rem' }}>{emoji}</div>
      <div className="debate-ended-title">{label}</div>
      <div className="debate-ended-sub">Your score: {score} · Redirecting to dashboard…</div>
    </div>
  );
}

/* ── helpers ── */
const WAVE_BARS = 30;
const TIMER_MAX = 60;
const RING_R = 45;          // SVG circle radius for timer
const RING_C = 2 * Math.PI * RING_R;  // circumference

const SCORE_R = 24;
const SCORE_C = 2 * Math.PI * SCORE_R;

function timerColor(t) {
  if (t > 30) return 'var(--accent-user)';
  if (t > 10) return 'var(--accent-score)';
  return 'var(--accent-ai)';
}

/* ── Streaming text component ── */
function StreamText({ text }) {
  const [visible, setVisible] = useState('');
  useEffect(() => {
    let i = 0;
    setVisible('');
    const iv = setInterval(() => {
      i++;
      setVisible(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, 18);
    return () => clearInterval(iv);
  }, [text]);
  return <>{visible}</>;
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
export default function DebateRoomPage() {
  const { id: debateId } = useParams();
  const navigate          = useNavigate();
  const { token }         = useAuth();

  /* ── state ── */
  const [debateInfo,     setDebateInfo]     = useState(null);
  const [phase,          setPhase]          = useState('user_turn');
  const [messages,       setMessages]       = useState([]);
  const [currentScores,  setCurrentScores]  = useState({ logic: 0, evidence: 0, clarity: 0 });
  const [fallacyAlert,   setFallacyAlert]   = useState(null);
  const [fallacyHistory, setFallacyHistory] = useState([]);
  const [round,          setRound]          = useState(1);
  const [timer,          setTimer]          = useState(TIMER_MAX);
  const [userWins,       setUserWins]       = useState(0);
  const [aiWins,         setAiWins]         = useState(0);
  const [alertExiting,   setAlertExiting]   = useState(false);
  const [endResult,      setEndResult]      = useState(null);
  const [showConfetti,   setShowConfetti]   = useState(false);
  const [textInput,      setTextInput]      = useState('');

  const toast = useToast();

  /* ── refs ── */
  const chatBottomRef = useRef(null);
  const timerRef      = useRef(null);
  const alertTimerRef = useRef(null);
  const stopRecRef    = useRef(null); // holds hook's stopRecording for timer callback

  /* ─────────────────────────────────────
     handleEvent — single dispatcher for
     all 11 server-emitted socket events
  ───────────────────────────────────── */
  const handleEvent = useCallback((eventName, data) => {
    switch (eventName) {

      /* User's spoken argument has been transcribed */
      case 'transcript_final':
        setMessages((prev) => [
          ...prev,
          {
            id:      `user-${Date.now()}`,
            speaker: 'user',
            text:    data.text,
            scores:  null,
          },
        ]);
        break;

      /* Fallacy detected in user's argument */
      case 'fallacy_detected':
        setFallacyAlert(data);
        setFallacyHistory((prev) => [...prev.slice(-4), data]);
        break;

      /* Live score update after ML scoring */
      case 'scores_update':
        setCurrentScores({
          logic:    data.logic    ?? 0,
          evidence: data.evidence ?? 0,
          clarity:  data.clarity  ?? 0,
        });
        /* Attach scores to the most recent user message */
        setMessages((prev) => {
          const last = [...prev].reverse().find((m) => m.speaker === 'user');
          if (!last) return prev;
          return prev.map((m) =>
            m.id === last.id ? { ...m, scores: data } : m
          );
        });
        break;

      /* GPT-4 is generating — show thinking dots */
      case 'ai_thinking':
        setPhase('processing');
        break;

      /* Streaming token from GPT-4 */
      case 'ai_text_chunk': {
        const token = data.text ?? data.chunk ?? '';
        setPhase('ai_speaking');
        setMessages((prev) => {
          const hasPending = prev.some((m) => m.id === 'pending-ai');
          if (hasPending) {
            return prev.map((m) =>
              m.id === 'pending-ai' ? { ...m, text: m.text + token } : m
            );
          }
          return [
            ...prev,
            { id: 'pending-ai', speaker: 'ai', text: token, scores: null },
          ];
        });
        break;
      }

      /* ai_audio_chunk is handled entirely inside the hook (AudioContext queue) */
      case 'ai_audio_chunk':
        break;

      /* AI finished its turn — swap pending stub → final message, advance round */
      case 'ai_turn_complete':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === 'pending-ai'
              ? { ...m, id: `ai-${Date.now()}`, text: data.fullText ?? m.text }
              : m
          )
        );
        setRound(data.round ?? ((r) => r + 1));
        setPhase('user_turn'); // resets timer via the timer useEffect
        playDing();
        break;

      /* Debate over — show results modal then navigate */
      case 'debate_ended':
        setEndResult(data);
        setPhase('ended');
        if (data?.winner === 'user') {
          setUserWins((w) => w + 1);
          setShowConfetti(true);
          playVictory();
        }
        if (data?.winner === 'ai') setAiWins((w) => w + 1);
        break;

      case 'debate_joined':
        break;
      case 'error':
        console.error('[DebateRoom] socket error:', data);
        // Reset to user_turn so UI doesn't freeze on backend errors
        setPhase((prev) => (prev === 'processing' || prev === 'ai_speaking') ? 'user_turn' : prev);
        break;
      default:
        break;
    }
  }, []);

  /* ── Hook: WebSocket + MediaRecorder + AudioContext ── */
  const {
    connected,
    startRecording,
    stopRecording,
    endDebate,
    sendText,
    liveTranscript,
    isAISpeaking: hookIsAISpeaking,
  } = useDebateSocket(debateId, { onEvent: handleEvent });

  /* Keep stopRecording accessible inside the timer callback without stale closure */
  useEffect(() => { stopRecRef.current = stopRecording; }, [stopRecording]);

  /* ── fetch debate metadata on mount ── */
  useEffect(() => {
    if (!debateId) return;
    axios
      .get(`/api/debates/${debateId}`, {
        baseURL: process.env.REACT_APP_API_URL,
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setDebateInfo(r.data?.debate ?? r.data))
      .catch(console.error);
  }, [debateId, token]);

  /* ── Navigate to dashboard 3s after debate ends ── */
  useEffect(() => {
    if (phase !== 'ended') return;
    if (endResult?.winner === 'user') toast.success('🏆 You won the debate!');
    else if (endResult?.winner === 'ai') toast.error('The AI won this round. Keep forging!');
    else toast.info('Debate ended.');
    const t = setTimeout(() => navigate('/dashboard'), 3000);
    return () => clearTimeout(t);
  }, [phase, navigate, endResult, toast]);

  /* ── Keyboard shortcut: Escape to end debate ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && phase !== 'ended') {
        endDebate();
        setPhase('ended');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, endDebate]);

  /* ── Auto-scroll chat ── */
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript]);

  /* ── Countdown timer ──
       - Resets to 60 every time phase becomes 'user_turn' or round changes
       - Auto-calls stopRecording() when it hits 0 (in case user forgot)
       - Clears itself when phase leaves 'user_turn'
  ── */
  useEffect(() => {
    if (phase !== 'user_turn') {
      clearInterval(timerRef.current);
      return;
    }
    setTimer(TIMER_MAX);
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // If user is still recording when time runs out, stop them
          stopRecRef.current?.();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, round]);

  /* ── Fallacy alert auto-dismiss ── */
  const dismissAlert = useCallback(() => {
    setAlertExiting(true);
    alertTimerRef.current = setTimeout(() => {
      setFallacyAlert(null);
      setAlertExiting(false);
    }, 300);
  }, []);

  useEffect(() => {
    if (!fallacyAlert) return;
    const t = setTimeout(dismissAlert, 4000);
    return () => clearTimeout(t);
  }, [fallacyAlert, dismissAlert]);

  useEffect(() => () => clearTimeout(alertTimerRef.current), []);

  /* ── Mic button handlers ── */
  const handleMicDown = useCallback((e) => {
    e.preventDefault();
    if (phase !== 'user_turn') return;
    startRecording();
    setPhase('recording');
  }, [phase, startRecording]);

  const handleMicUp = useCallback((e) => {
    e.preventDefault();
    if (phase !== 'recording') return;
    stopRecording();
    setPhase('processing');
  }, [phase, stopRecording]);

  /* ── Derived ── */
  const timerOffset  = RING_C - (timer / TIMER_MAX) * RING_C;
  const isRecording  = phase === 'recording';
  const isProcessing = phase === 'processing';
  // isAISpeaking: trust both phase state AND the hook's AudioContext flag
  const isAISpeaking = phase === 'ai_speaking' || hookIsAISpeaking;
  const isEnded      = phase === 'ended';

  /* ── Render ── */
  return (
    <>
      {/* Confetti on win */}
      {showConfetti && <Confetti />}

      {/* ════════ MAIN LAYOUT ════════ */}
      <div className="debate-root">

        {/* ──── LEFT PANEL ──── */}

        {/* WebSocket disconnect banner */}
        {!connected && !isEnded && (
          <div className="debate-reconnect-banner">
            <span className="reconnect-dot" />
            <span>Connection lost — reconnecting…</span>
            <button
              className="reconnect-btn"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        )}

        <div className="debate-left">

          {/* Top bar */}
          <div className="debate-topbar">
            <span className="debate-topic">
              {debateInfo?.topicSnapshot ?? debateInfo?.topic?.title ?? 'Loading topic…'}
            </span>
            <span className="debate-round">Round {round}</span>
            <button
              className="debate-end-btn"
              onClick={() => {
                endDebate();
                setPhase('ended');
              }}
            >
              End Debate <span style={{ opacity: 0.5, fontSize: '0.7em' }}>(Esc)</span>
            </button>
          </div>

          {/* Chat area */}
          <div className="debate-chat">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`msg-row msg-row--${msg.speaker}`}
              >
                <div className={`msg-avatar msg-avatar--${msg.speaker}`}>
                  {msg.speaker === 'user' ? '🎤' : '🤖'}
                </div>
                <div className="msg-body">
                  <div className={`msg-bubble msg-bubble--${msg.speaker}`}>
                    {msg.speaker === 'ai' && msg.id !== 'pending-ai' ? (
                      <StreamText text={msg.text} />
                    ) : (
                      msg.text
                    )}
                  </div>
                  {msg.scores && (
                    <div className="msg-scores">
                      <span className="score-pill score-pill--logic">
                        Logic: {msg.scores.logic ?? '—'}
                      </span>
                      <span className="score-pill score-pill--evidence">
                        Evidence: {msg.scores.evidence ?? '—'}
                      </span>
                      <span className="score-pill score-pill--clarity">
                        Clarity: {msg.scores.clarity ?? '—'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* AI thinking indicator */}
            {isProcessing && (
              <div className="msg-row msg-row--ai">
                <div className="msg-avatar msg-avatar--ai">🤖</div>
                <div className="msg-body">
                  <div className="thinking-dots">
                    <span>AI is thinking</span>
                    <div className="dot-row">
                      <div className="dot" />
                      <div className="dot" />
                      <div className="dot" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Bottom bar */}
          <div className="debate-bottom">
            {/* Live transcript */}
            <div className="live-transcript">
              {isRecording && liveTranscript && `"${liveTranscript}"`}
            </div>

            {/* Mic button */}
            <div className="mic-wrap">
              <button
                className={[
                  'mic-btn',
                  isRecording  ? 'mic-btn--recording'  : '',
                  isProcessing || isAISpeaking ? 'mic-btn--processing' : '',
                ].join(' ')}
                onMouseDown={handleMicDown}
                onMouseUp={handleMicUp}
                onTouchStart={handleMicDown}
                onTouchEnd={handleMicUp}
                disabled={isProcessing || isAISpeaking || isEnded}
                aria-label="Hold to speak"
              >
                {isProcessing ? (
                  <span className="mic-spinner" />
                ) : (
                  '🎤'
                )}
              </button>
              <span className="mic-label">
                {isRecording  ? 'Release to Submit' :
                 isProcessing ? 'Processing…'       :
                 isAISpeaking ? 'AI Speaking…'      :
                                'Hold to Speak'}
              </span>
            </div>

            {/* Text input fallback */}
            <form
              className="text-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = textInput.trim();
                if (!trimmed || phase !== 'user_turn') return;
                setMessages((prev) => [
                  ...prev,
                  { id: `user-${Date.now()}`, speaker: 'user', text: trimmed, scores: null },
                ]);
                sendText(trimmed);
                setTextInput('');
                setPhase('processing');
              }}
            >
              <input
                className="text-input-field"
                type="text"
                placeholder="Or type your argument…"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={phase !== 'user_turn' || isEnded}
              />
              <button
                className="text-input-send"
                type="submit"
                disabled={!textInput.trim() || phase !== 'user_turn' || isEnded}
              >
                Send ➤
              </button>
            </form>

            {/* Waveform */}
            <div
              className={[
                'waveform',
                isRecording  ? 'waveform--recording' : '',
                isAISpeaking ? 'waveform--ai'        : '',
              ].join(' ')}
            >
              {Array.from({ length: WAVE_BARS }, (_, i) => (
                <div
                  key={i}
                  className="waveform-bar"
                  style={{
                    '--wave-h': `${4 + Math.random() * 20}px`,
                    animationDelay: `${(i * 60) % 700}ms`,
                    height: '4px',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ──── RIGHT PANEL ──── */}
        <div className="debate-right">

          {/* Timer */}
          <div className="timer-section">
            <div className="panel-section-title">Time Remaining</div>
            <div className="timer-ring-wrap">
              <svg className="timer-ring-svg" width="100" height="100" viewBox="0 0 100 100">
                <circle className="timer-ring-bg" cx="50" cy="50" r={RING_R} />
                <circle
                  className="timer-ring-fg"
                  cx="50"
                  cy="50"
                  r={RING_R}
                  strokeDasharray={RING_C}
                  strokeDashoffset={timerOffset}
                  stroke={timerColor(timer)}
                />
              </svg>
              <div className="timer-value" style={{ color: timerColor(timer) }}>
                {timer}
              </div>
            </div>
          </div>

          {/* Score rings */}
          <div className="scores-section">
            <div className="panel-section-title">Argument Scores</div>
            {[
              { key: 'logic',    label: 'Logic',    color: 'var(--accent-user)',  cls: 'score-pill--logic' },
              { key: 'evidence', label: 'Evidence', color: 'var(--accent-blue)',  cls: 'score-pill--evidence' },
              { key: 'clarity',  label: 'Clarity',  color: 'var(--accent-score)', cls: 'score-pill--clarity' },
            ].map(({ key, label, color }) => {
              const val = currentScores[key] ?? 0;
              const offset = SCORE_C - (val / 100) * SCORE_C;
              return (
                <div key={key} className="score-ring-row">
                  <div className="score-ring-wrap">
                    <svg className="score-ring-svg" width="60" height="60" viewBox="0 0 60 60">
                      <circle className="score-ring-bg" cx="30" cy="30" r={SCORE_R} />
                      <circle
                        className="score-ring-fg"
                        cx="30"
                        cy="30"
                        r={SCORE_R}
                        strokeDasharray={SCORE_C}
                        strokeDashoffset={offset}
                        stroke={color}
                      />
                    </svg>
                    <div className="score-ring-val" style={{ color }}>
                      {val}
                    </div>
                  </div>
                  <div className="score-label-col">
                    <span className="score-name">{label}</span>
                    <span className="score-number" style={{ color }}>{val}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Session tracker */}
          <div>
            <div className="panel-section-title">Session</div>
            <div className="session-tracker">
              <div className="tracker-box tracker-box--user">
                <div className="tracker-label">You</div>
                <div className="tracker-count">{userWins}</div>
              </div>
              <div className="tracker-box tracker-box--ai">
                <div className="tracker-label">AI</div>
                <div className="tracker-count">{aiWins}</div>
              </div>
            </div>
          </div>

          {/* Fallacy history */}
          {fallacyHistory.length > 0 && (
            <div>
              <div className="panel-section-title">Recent Fallacies</div>
              <div className="fallacy-history">
                {fallacyHistory.slice(-3).map((f, i) => (
                  <div key={i} className="fallacy-tag">
                    ⚠ {f.type}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════ FALLACY ALERT (fixed overlay) ════════ */}
      {fallacyAlert && (
        <div className={`fallacy-alert ${alertExiting ? 'fallacy-alert--exit' : ''}`}>
          <div className="fallacy-alert-title">⚠ Fallacy: {fallacyAlert.type}</div>
          {fallacyAlert.confidence != null && (
            <div className="fallacy-alert-conf">
              Confidence: {Math.round(fallacyAlert.confidence * 100)}%
            </div>
          )}
          <div className="fallacy-alert-desc">{fallacyAlert.explanation}</div>
        </div>
      )}

      {/* ════════ ENDED OVERLAY ════════ */}
      {isEnded && <ResultsModal result={endResult} />}
    </>
  );
}
