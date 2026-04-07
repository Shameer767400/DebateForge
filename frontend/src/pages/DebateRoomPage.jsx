import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDebateSocket } from '../hooks/useDebateSocket';
import Confetti from '../components/Confetti';
import '../styles/theme.css';
import '../styles/debate.css';
import '../styles/lobby-format.css';
import '../styles/judge-verdict.css';

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

/* ── Helpers ── */
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
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  // Addition 6: Format/phase state
  const [phaseInfo,      setPhaseInfo]      = useState(null);
  const [judgeVerdict,   setJudgeVerdict]   = useState(null);

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

      /* Legacy Debate over — still set phase to 'ended' to disable inputs */
      case 'debate_ended':
        setPhase('ended');
        break;

      case 'debate_joined':
        break;

      /* Phase transition (Addition 6) */
      case 'phase_update':
        setPhaseInfo(data);
        break;

      /* AI Judge verdict (Addition 6 & 9 Report Card) */
      case 'judge_verdict':
        setJudgeVerdict(data);
        setPhase('ended');
        if (data?.winner === 'user') {
          setUserWins((w) => w + 1);
          setShowConfetti(true);
          playVictory();
        }
        if (data?.winner === 'ai') setAiWins((w) => w + 1);
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
    availableVoices,
  } = useDebateSocket(debateId, { onEvent: handleEvent, selectedVoiceURI });

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
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    if (phase !== 'user_turn' && phase !== 'recording') {
      clearInterval(timerRef.current);
      return;
    }
    if (phase === 'user_turn') {
      setTimer(TIMER_MAX);
    }
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // Use phaseRef to get the LIVE phase (not stale closure)
          if (phaseRef.current === 'recording') {
            stopRecRef.current?.();
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'user_turn' ? 'user_turn' : phase, round]);

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
  const handleMicToggle = useCallback((e) => {
    if (e) e.preventDefault();
    
    if (phase === 'user_turn') {
      startRecording();
      setPhase('recording');
    } else if (phase === 'recording') {
      stopRecording();
      setPhase('processing');
    }
  }, [phase, startRecording, stopRecording]);

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

        {/* ──── PHASE PROGRESS BAR (Addition 6) ──── */}
        {phaseInfo && phaseInfo.phases && (
          <div className="phase-progress">
            {phaseInfo.phases.map((p, i) => (
              <div key={i} className="phase-step">
                {i > 0 && (
                  <div className={`phase-connector ${i < phaseInfo.phaseNumber ? 'phase-connector--done' : ''}`} />
                )}
                <div className={`phase-dot ${
                  i + 1 === phaseInfo.phaseNumber ? 'phase-dot--active' :
                  i + 1 < phaseInfo.phaseNumber ? 'phase-dot--done' : ''
                }`}>
                  {i + 1 < phaseInfo.phaseNumber ? '✓' : i + 1}
                </div>
                <span className={`phase-label ${i + 1 === phaseInfo.phaseNumber ? 'phase-label--active' : ''}`}>
                  {p.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ──── PHASE INSTRUCTION BANNER ──── */}
        {phaseInfo && phaseInfo.instruction && (
          <div className="phase-banner">
            <span className="phase-banner-phase">{phaseInfo.phaseName}</span>
            <span className="phase-banner-instruction">{phaseInfo.instruction}</span>
          </div>
        )}

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
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select 
                value={selectedVoiceURI} 
                onChange={(e) => setSelectedVoiceURI(e.target.value)}
                style={{
                  background: 'var(--surface-color)',
                  color: 'var(--text-color)',
                  border: '1px solid var(--border-color)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">Default AI Voice</option>
                {availableVoices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                ))}
              </select>

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
                onClick={handleMicToggle}
                disabled={isProcessing || isAISpeaking || isEnded}
                aria-label={isRecording ? 'Tap to Submit' : 'Tap to Speak'}
              >
                {isProcessing ? (
                  <span className="mic-spinner" />
                ) : (
                  '🎤'
                )}
              </button>
              <span className="mic-label">
                {isRecording  ? 'Tap to Submit'     :
                 isProcessing ? 'Processing…'       :
                 isAISpeaking ? 'AI Speaking…'      :
                                'Tap to Speak'}
              </span>
            </div>

            {/* Text input fallback */}
            <form
              className="text-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = textInput.trim();
                if (!trimmed || phase !== 'user_turn') return;
                // Rely on transcript_final from socket to avoid double-messages
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

      {/* ════════ ENDED OVERLAY (Removed in favor of Report Card) ════════ */}

      {/* ════════ JUDGE VERDICT OVERLAY (Addition 6) ════════ */}
      {judgeVerdict && (
        <div className="judge-overlay">
          <div className="judge-card">
            <div className="judge-header">📊 Debate Report Card</div>

            <div className={`judge-winner judge-winner--${judgeVerdict.winner}`}>
              {judgeVerdict.winner === 'user' ? '🏆 You Win!' :
               judgeVerdict.winner === 'ai' ? '🤖 AI Wins' : '🤝 Draw'}
            </div>

            <div className="judge-scores">
              <div className="judge-score-col">
                <span className="judge-score-number judge-score-number--user">
                  {judgeVerdict.userScore}
                </span>
                <span className="judge-score-label">You</span>
              </div>
              <span className="judge-vs">VS</span>
              <div className="judge-score-col">
                <span className="judge-score-number judge-score-number--ai">
                  {judgeVerdict.aiScore}
                </span>
                <span className="judge-score-label">AI</span>
              </div>
            </div>

            {judgeVerdict.feedback && (
              <div className="judge-feedback">
                <div className="judge-feedback-title">Judge's Feedback</div>
                <div className="judge-feedback-text">{judgeVerdict.feedback}</div>
              </div>
            )}

            {judgeVerdict.userStrengths && (
              <div className="judge-strengths">
                <div className="judge-strengths-title">✅ Your Strengths</div>
                <div className="judge-strengths-text">{judgeVerdict.userStrengths}</div>
              </div>
            )}
            {judgeVerdict.areasToImprove && judgeVerdict.areasToImprove.length > 0 && (
              <div className="judge-weaknesses">
                <div className="judge-weaknesses-title">⚠️ Areas to Improve</div>
                <ul className="judge-list">
                  {judgeVerdict.areasToImprove.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {judgeVerdict.grammarMistakes && judgeVerdict.grammarMistakes.length > 0 && (
              <div className="judge-grammar">
                <div className="judge-grammar-title">📝 Grammar & Vocabulary</div>
                <ul className="judge-list judge-list--grammar">
                  {judgeVerdict.grammarMistakes.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="judge-actions">
              <button
                className="judge-btn judge-btn--primary"
                onClick={() => navigate('/lobby')}
              >
                New Debate
              </button>
              <button
                className="judge-btn judge-btn--secondary"
                onClick={() => navigate('/dashboard')}
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
