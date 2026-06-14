/**
 * @fileoverview DebateRoomPage — real-time AI debate interface.
 *
 * Core Features:
 *   - Voice recording with Whisper transcription
 *   - Text input for no-mic fallback
 *   - Streaming AI responses with TTS playback
 *   - Live fallacy detection alerts
 *   - Per-turn scoring (logic, evidence, clarity)
 *   - Formal debate format phase management
 *   - AI judge verdict with downloadable Report Card
 *   - Victory confetti and streak celebrations
 *
 * WebSocket Events Used:
 *   - join_debate, audio_chunk, audio_end, transcript_direct
 *   - ai_text_chunk, ai_turn_complete, fallacy_detected, scores_update
 *   - phase_update, judge_verdict, debate_ended
 *
 * @module pages/DebateRoomPage
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';

import { useToast } from '../context/ToastContext';
import { useDebateSocket } from '../hooks/useDebateSocket';
import Confetti from '../components/Confetti';
import StreakCelebration from '../components/StreakCelebration';
import '../styles/theme.css';
import '../styles/debate.css';
import '../styles/lobby-format.css';
import '../styles/judge-verdict.css';

/* ═══════════════════════════════════════════════════════
   generateReportCardPDF — builds and downloads an HTML
   report card rendered as a printable document.
═══════════════════════════════════════════════════════ */
function generateReportCardPDF(judgeVerdict, debateInfo, messages) {
  if (!judgeVerdict) return;

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const topic = debateInfo?.topicSnapshot || 'Custom Topic';
  const format = (debateInfo?.format || 'freeform').replace(/_/g, ' ');
  const side = debateInfo?.userSide || '—';
  const difficulty = debateInfo?.difficulty || '—';

  const winnerLabel =
    judgeVerdict.winner === 'user' ? '🏆 YOU WIN' :
    judgeVerdict.winner === 'ai'   ? '🤖 AI WINS' : '🤝 DRAW';
  const winnerColor =
    judgeVerdict.winner === 'user' ? '#00ff87' :
    judgeVerdict.winner === 'ai'   ? '#ff3366' : '#ffcc00';

  // Build argument rows
  const argRows = (messages || [])
    .filter(m => m.speaker === 'user')
    .map((m, i) => `
      <div class="arg-row">
        <div class="arg-label">Round ${i + 1} — You</div>
        <div class="arg-content">${m.text || ''}</div>
        ${m.scores ? `<div class="arg-scores">Logic: ${m.scores.logic ?? '—'} &nbsp;|&nbsp; Evidence: ${m.scores.evidence ?? '—'} &nbsp;|&nbsp; Clarity: ${m.scores.clarity ?? '—'}</div>` : ''}
      </div>
    `).join('');

  // Build improve list
  const improveItems = (judgeVerdict.areasToImprove || [])
    .map(a => `<li>${a}</li>`).join('');
  const grammarItems = (judgeVerdict.grammarMistakes || [])
    .map(g => `<li>${g}</li>`).join('');
  const focusItems = (judgeVerdict.savedFocusAreas || [])
    .slice(0, 6).map(f => `<li>${f}</li>`).join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DebateForge Report Card — ${topic.slice(0, 40)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', sans-serif;
    background: #0a0a0f;
    color: #e8e8f0;
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid rgba(255,255,255,0.1);
    padding-bottom: 24px;
    margin-bottom: 32px;
  }
  .logo { font-size: 2rem; font-weight: 800; background: linear-gradient(135deg,#00ff87,#00aaff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .date { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 6px; }
  .topic { font-size: 1.2rem; font-weight: 700; margin-top: 12px; color: #fff; }
  .meta { display: flex; gap: 20px; justify-content: center; margin-top: 8px; }
  .meta span { font-size: 0.75rem; color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.06); padding: 3px 10px; border-radius: 20px; }
  .winner-box { text-align: center; padding: 20px; margin-bottom: 24px; background: rgba(255,255,255,0.04); border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); }
  .winner-label { font-size: 2.2rem; font-weight: 800; color: ${winnerColor}; }
  .scores-row { display: flex; gap: 20px; justify-content: center; margin-top: 12px; }
  .score-box { text-align: center; }
  .score-num { font-size: 2.4rem; font-weight: 800; }
  .score-num--user { color: #00ff87; }
  .score-num--ai { color: #ff3366; }
  .score-lbl { font-size: 0.7rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; }
  .vs { font-size: 1rem; color: rgba(255,255,255,0.2); align-self: center; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.4); margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; }
  .text-block { font-size: 0.88rem; line-height: 1.6; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px; border: 1px solid rgba(255,255,255,0.07); }
  .headline { background: rgba(255,149,0,0.12); border: 1px solid rgba(255,149,0,0.25); border-radius: 10px; padding: 12px; color: #ffd39a; font-size: 0.9rem; font-weight: 600; margin-bottom: 20px; text-align: center; }
  .strengths { background: rgba(0,255,135,0.06); border: 1px solid rgba(0,255,135,0.15); border-radius: 10px; padding: 12px; color: #a0ffd4; font-size: 0.85rem; line-height: 1.5; }
  .weaknesses { background: rgba(255,80,0,0.06); border: 1px solid rgba(255,80,0,0.18); border-radius: 10px; padding: 12px; color: #ffb490; font-size: 0.85rem; line-height: 1.5; }
  ul { padding-left: 20px; margin-top: 8px; }
  li { font-size: 0.84rem; color: rgba(255,255,255,0.65); margin-bottom: 4px; line-height: 1.5; }
  .arg-row { background: rgba(0,255,135,0.04); border: 1px solid rgba(0,255,135,0.1); border-radius: 10px; padding: 12px; margin-bottom: 10px; }
  .arg-label { font-size: 0.7rem; font-weight: 700; color: #00ff87; margin-bottom: 6px; }
  .arg-content { font-size: 0.84rem; color: rgba(255,255,255,0.75); line-height: 1.5; }
  .arg-scores { font-size: 0.7rem; color: rgba(255,255,255,0.35); margin-top: 6px; }
  .footer { text-align: center; font-size: 0.7rem; color: rgba(255,255,255,0.2); margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; }
  @media print { body { background: #fff; color: #111; } .logo { -webkit-text-fill-color: #0066cc; } }
</style>
</head>
<body>
<div class="header">
  <div class="logo">⚔ DebateForge</div>
  <div class="date">Report Card — ${date}</div>
  <div class="topic">${topic}</div>
  <div class="meta">
    <span>Side: ${side}</span>
    <span>Format: ${format}</span>
    <span>Difficulty: ${difficulty}</span>
  </div>
</div>

${judgeVerdict.reportCardHeadline ? `<div class="headline">${judgeVerdict.reportCardHeadline}</div>` : ''}

<div class="winner-box">
  <div class="winner-label">${winnerLabel}</div>
  <div class="scores-row">
    <div class="score-box"><div class="score-num score-num--user">${judgeVerdict.userScore}</div><div class="score-lbl">You</div></div>
    <div class="vs">VS</div>
    <div class="score-box"><div class="score-num score-num--ai">${judgeVerdict.aiScore}</div><div class="score-lbl">AI</div></div>
  </div>
</div>

${judgeVerdict.feedback ? `<div class="section"><div class="section-title">Judge's Feedback</div><div class="text-block">${judgeVerdict.feedback}</div></div>` : ''}

${judgeVerdict.userStrengths ? `<div class="section"><div class="section-title">✅ Your Strengths</div><div class="strengths">${judgeVerdict.userStrengths}</div></div>` : ''}

${judgeVerdict.userWeaknesses ? `<div class="section"><div class="section-title">⚠️ Main Weakness</div><div class="weaknesses">${judgeVerdict.userWeaknesses}</div></div>` : ''}

${improveItems ? `<div class="section"><div class="section-title">📈 Areas To Improve</div><ul>${improveItems}</ul></div>` : ''}

${judgeVerdict.improvementSummary ? `<div class="section"><div class="section-title">🎯 Next Debate Focus</div><div class="text-block">${judgeVerdict.improvementSummary}</div></div>` : ''}

${grammarItems ? `<div class="section"><div class="section-title">📝 Grammar & Vocabulary</div><ul>${grammarItems}</ul></div>` : ''}

${judgeVerdict.fallacies && judgeVerdict.fallacies.length > 0 ? `<div class="section"><div class="section-title">🚨 Fallacies Made</div><ul>${judgeVerdict.fallacies.map(f => `<li>${f}</li>`).join('')}</ul></div>` : ''}

${focusItems ? `<div class="section"><div class="section-title">📌 Recurring Weaknesses</div><ul>${focusItems}</ul></div>` : ''}

${argRows ? `<div class="section"><div class="section-title">Your Arguments This Debate</div>${argRows}</div>` : ''}

<div class="footer">Generated by DebateForge · ${new Date().toISOString()}</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `debateforge-report-${topic.slice(0, 30).replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

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
const WAVE_BARS  = 30;
const DEFAULT_TIMER_MAX = 60;
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
  const prevTextRef = useRef('');

  useEffect(() => {
    // If the new text starts with what we've already revealed, continue from there
    // This prevents the "jump" when ai_turn_complete replaces streaming text with fullText
    const startFrom = text.startsWith(prevTextRef.current) ? prevTextRef.current.length : 0;
    if (startFrom >= text.length) {
      setVisible(text);
      prevTextRef.current = text;
      return;
    }

    let i = startFrom;
    if (startFrom > 0) setVisible(text.slice(0, startFrom));

    const iv = setInterval(() => {
      i++;
      const next = text.slice(0, i);
      setVisible(next);
      prevTextRef.current = next;
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
  const api = useApi();
  const { id: debateId } = useParams();
  const navigate          = useNavigate();

  /* ── state ── */
  const [debateInfo,     setDebateInfo]     = useState(null);
  const [phase,          setPhase]          = useState('user_turn');
  const [messages,       setMessages]       = useState([]);
  const [currentScores,  setCurrentScores]  = useState({ logic: 0, evidence: 0, clarity: 0 });
  const [fallacyAlert,   setFallacyAlert]   = useState(null);
  const [fallacyHistory, setFallacyHistory] = useState([]);
  const [round,          setRound]          = useState(1);
  const [timerMax,       setTimerMax]       = useState(DEFAULT_TIMER_MAX);
  const [timer,          setTimer]          = useState(DEFAULT_TIMER_MAX);
  const [userWins,       setUserWins]       = useState(0);
  const [aiWins,         setAiWins]         = useState(0);
  const [alertExiting,   setAlertExiting]   = useState(false);
  const [endResult,      setEndResult]      = useState(null);
  const [showConfetti,   setShowConfetti]   = useState(false);
  const [textInput,      setTextInput]      = useState('');
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [debateLanguage, setDebateLanguage] = useState('auto'); // 'auto' or iso 639-1
  // Addition 6: Format/phase state
  const [phaseInfo,      setPhaseInfo]      = useState(null);
  const [judgeVerdict,   setJudgeVerdict]   = useState(null);
  // Addition 7: Streak celebration
  const [streakMilestone, setStreakMilestone] = useState(null);
  const [streakFreezeUsed, setStreakFreezeUsed] = useState(false);

  /* Incrementing key used to guarantee the timer resets every new user_turn */
  const [timerKey, setTimerKey] = useState(0);

  const toast = useToast();

  const LANGUAGE_OPTIONS = [
    { value: 'auto', label: 'Auto (detected)' },
    { value: 'en', label: 'English' },
    { value: 'hi', label: 'Hindi' },
    { value: 'ta', label: 'Tamil' },
    { value: 'te', label: 'Telugu' },
    { value: 'kn', label: 'Kannada' },
    { value: 'ml', label: 'Malayalam' },
    { value: 'mr', label: 'Marathi' },
    { value: 'bn', label: 'Bengali' },
    { value: 'gu', label: 'Gujarati' },
    { value: 'pa', label: 'Punjabi' },
    { value: 'ur', label: 'Urdu' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'es', label: 'Spanish' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'it', label: 'Italian' },
    { value: 'nl', label: 'Dutch' },
    { value: 'ru', label: 'Russian' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'zh', label: 'Chinese' },
    { value: 'ar', label: 'Arabic' },
    { value: 'sn', label: 'Shona' },
  ];

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

      /* Streaming token from LLM */
      case 'ai_text_chunk': {
        const token = data.text ?? data.chunk ?? '';
        const isPlaceholder = !!data.isPlaceholder;
        const chunkTurnId = data.turnId || null;
        setPhase('ai_speaking');
        setMessages((prev) => {
          const hasPending = prev.some((m) => m.isStreaming);
          if (hasPending) {
            // If it's a placeholder we only have '…' — don't keep appending it
            if (isPlaceholder) return prev;
            return prev.map((m) =>
              m.isStreaming ? { ...m, text: m.text + token } : m
            );
          }
          // First chunk — assign a stable id immediately so the key never changes
          return [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              speaker: 'ai',
              text: token,
              scores: null,
              isStreaming: true,
              isPlaceholder,
              turnId: chunkTurnId,
            },
          ];
        });
        break;
      }

      /* ai_audio_chunk is handled entirely inside the hook (AudioContext queue) */
      case 'ai_audio_chunk':
        break;

      /* Gemini is translating the AI response to the user's selected language */
      case 'ai_translating':
        setPhase('ai_speaking'); // keep the AI speaking indicator active
        break;

      /* AI finished its turn — match by turnId (precise) or first streaming bubble */
      case 'ai_turn_complete': {
        const completeTurnId = data.turnId || null;
        setMessages((prev) => {
          const hasTurnIdMatch = completeTurnId && prev.some((m) => m.isStreaming && m.turnId === completeTurnId);
          return prev.map((m) => {
            if (!m.isStreaming) return m;
            // If we have a turnId match, only update that specific bubble
            if (hasTurnIdMatch && m.turnId !== completeTurnId) return m;
            return { ...m, isStreaming: false, isPlaceholder: false, text: data.fullText ?? m.text };
          });
        });
        setRound(data.round ?? ((r) => r + 1));
        setPhase('user_turn');
        setTimerKey((k) => k + 1);
        playDing();
        break;
      }

      /* Legacy Debate over — still set phase to 'ended' to disable inputs */
      case 'debate_ended':
        setPhase('ended');
        break;

      case 'debate_joined':
        break;

      /* Phase transition (Addition 6) — also update timer max for new phase */
      case 'phase_update':
        setPhaseInfo(data);
        if (data?.timeLimit && data.timeLimit > 0) {
          setTimerMax(data.timeLimit);
          setTimer(data.timeLimit);
        }
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
        // Streak celebration (Addition 7)
        if (data?.streak?.milestoneReached) {
          setStreakMilestone(data.streak.milestoneReached);
        }
        if (data?.streak?.freezeUsed) {
          setStreakFreezeUsed(true);
        }
        break;

      case 'error':
        console.error('[DebateRoom] socket error:', data);
        if (data?.message) toast.error(data.message);
        // Reset to user_turn so UI doesn't freeze on backend errors
        setPhase((prev) => (prev === 'processing' || prev === 'ai_speaking') ? 'user_turn' : prev);
        break;
      default:
        break;
    }
  }, [toast]);

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
    setVoiceEnabled: setHookVoiceEnabled,
    setTtsLanguageOverride,
    setLanguage,
  } = useDebateSocket(debateId, {
    onEvent: handleEvent,
    selectedVoiceURI,
    preferredLang: debateLanguage === 'auto' ? null : debateLanguage,
  });

  useEffect(() => {
    setHookVoiceEnabled(voiceEnabled);
  }, [voiceEnabled, setHookVoiceEnabled]);

  useEffect(() => {
    setTtsLanguageOverride(debateLanguage);
  }, [debateLanguage, setTtsLanguageOverride]);

  useEffect(() => {
    if (!connected) return;
    setLanguage(debateLanguage === 'auto' ? null : debateLanguage);
  }, [connected, debateLanguage, setLanguage]);

  /* Keep stopRecording accessible inside the timer callback without stale closure */
  useEffect(() => { stopRecRef.current = stopRecording; }, [stopRecording]);

  /* ── fetch debate metadata on mount ── */
  const debateFetchRetried = useRef(false);
  useEffect(() => {
    if (!debateId) return;
    let mounted = true;

    const fetchDebate = () => {
      api
        .get(`/api/debates/${debateId}`)
        .then((r) => { if (mounted) setDebateInfo(r.data?.debate ?? r.data); })
        .catch((err) => {
          if (!mounted) return;
          console.error('[DebateRoom] Failed to load debate info:', err);

          // Only redirect on confirmed 404 (debate truly doesn't exist).
          // For network errors or 401s, show a toast but DON'T navigate away —
          // the user may still have a valid session and the debate may load on retry.
          if (err.response?.status === 404) {
            toast.error('Debate not found. Returning to lobby.');
            navigate('/lobby');
          } else if (!debateFetchRetried.current) {
            // Retry once after 2 seconds for transient errors
            debateFetchRetried.current = true;
            setTimeout(fetchDebate, 2000);
          } else {
            toast.error('Could not load debate info. Please try refreshing.');
          }
        });
    };

    fetchDebate();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateId]);

  /* ── Navigate to dashboard after debate ends ──
       Only auto-redirect when the user explicitly ended early (Esc / End button)
       and there's no judge verdict to display. ── */
  useEffect(() => {
    if (phase !== 'ended') return;
    if (judgeVerdict) return; // Let user dismiss the verdict overlay manually
    if (endResult?.winner === 'user') toast.success('🏆 You won the debate!');
    else if (endResult?.winner === 'ai') toast.error('The AI won this round. Keep forging!');
    else toast.info('Debate ended.');
    // Give user 10 seconds before auto-redirect — longer than before to avoid
    // accidental redirects when phase toggles unexpectedly.
    const t = setTimeout(() => navigate('/dashboard'), 10000);
    return () => clearTimeout(t);
  }, [phase, navigate, endResult, toast, judgeVerdict]);

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
       - Increments timerKey every ai_turn_complete to guarantee a fresh restart
       - Auto-calls stopRecording() when it hits 0
       - Pauses during processing/ai_speaking phases
  ── */
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    // Only run timer during active user phases
    if (phase !== 'user_turn' && phase !== 'recording') {
      clearInterval(timerRef.current);
      return;
    }
    // Always reset to timerMax at the start of a fresh user_turn (timerKey bumped)
    setTimer(timerMax);

    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          if (phaseRef.current === 'recording') {
            stopRecRef.current?.();
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  // timerKey is bumped every ai_turn_complete so the effect re-fires reliably
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKey, phase === 'recording' ? 'recording' : 'user_turn', timerMax]);

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
  const timerOffset  = RING_C - (timer / timerMax) * RING_C;
  const isRecording  = phase === 'recording';
  const isProcessing = phase === 'processing';
  // isAISpeaking: trust both phase state AND the hook's AudioContext flag
  const isAISpeaking = phase === 'ai_speaking' || hookIsAISpeaking;
  const isEnded      = phase === 'ended';

  /* ── handleDownloadReport ── */
  const handleDownloadReport = useCallback(() => {
    generateReportCardPDF(judgeVerdict, debateInfo, messages);
    toast.success('📥 Report card downloaded!');
  }, [judgeVerdict, debateInfo, messages, toast]);

  /* ── Share result handler ── */
  const handleShare = useCallback(() => {
    if (!judgeVerdict) return;
    const text = `I scored ${judgeVerdict.userScore}/100 in a formal debate on DebateForge!\nTopic: ${debateInfo?.topicSnapshot || 'Custom topic'} | Format: ${debateInfo?.format || 'Freeform'}\nResult: ${judgeVerdict.winner === 'user' ? 'WIN 🏆' : judgeVerdict.winner === 'ai' ? 'LOSS' : 'DRAW'}\nTry it at debateforge.app`;
    navigator.clipboard?.writeText(text).then(() => toast.success('Result copied to clipboard!')).catch(() => {});
  }, [judgeVerdict, debateInfo, toast]);

  /* ── Render ── */
  return (
    <>
      {/* Confetti on win */}
      {showConfetti && <Confetti />}

      {/* Streak celebration (Addition 7) */}
      <StreakCelebration
        milestone={streakMilestone}
        freezeUsed={streakFreezeUsed}
        onDismiss={() => { setStreakMilestone(null); setStreakFreezeUsed(false); }}
      />

      {/* ════════ MAIN LAYOUT ════════ */}
      <div className="debate-root">

        {/* ──── PHASE PROGRESS BAR (Addition 6) ──── */}
        {phaseInfo && phaseInfo.phases && (
          <>
            <div className="phase-progress phase-progress--full">
              {phaseInfo.phases.map((p, i) => (
                <div key={i} className="phase-step">
                  {i > 0 && (
                    <div
                      className={`phase-connector ${i < phaseInfo.phaseNumber ? 'phase-connector--done' : ''}`}
                    />
                  )}
                  <div
                    className={`phase-dot ${
                      i + 1 === phaseInfo.phaseNumber ? 'phase-dot--active' :
                      i + 1 < phaseInfo.phaseNumber ? 'phase-dot--done' : ''
                    }`}
                  >
                    {i + 1 < phaseInfo.phaseNumber ? '✓' : i + 1}
                  </div>
                  <span
                    className={`phase-label ${i + 1 === phaseInfo.phaseNumber ? 'phase-label--active' : ''}`}
                  >
                    {p.name}
                  </span>
                </div>
              ))}
            </div>

            <div className="phase-progress phase-progress--compact" aria-live="polite">
              Phase {phaseInfo.phaseNumber} / {phaseInfo.totalPhases}: {phaseInfo.phases?.[phaseInfo.phaseNumber - 1]?.name || phaseInfo.phaseName}
            </div>
          </>
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
            <div className="debate-topbar-controls">
              <select 
                value={selectedVoiceURI} 
                onChange={(e) => setSelectedVoiceURI(e.target.value)}
                className="debate-voice-select"
              >
                <option value="">Default AI Voice</option>
                {availableVoices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                ))}
              </select>

              <label className="debate-voice-label">
                <input
                  type="checkbox"
                  checked={voiceEnabled}
                  onChange={(e) => setVoiceEnabled(e.target.checked)}
                  disabled={phase !== 'user_turn' || judgeVerdict}
                  aria-label="AI voice"
                />
                <span className="debate-voice-label-text">
                  AI voice
                </span>
              </label>

              <select
                value={debateLanguage}
                onChange={(e) => setDebateLanguage(e.target.value)}
                disabled={phase !== 'user_turn' || judgeVerdict}
                aria-label="Debate language"
                className="debate-lang-select"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              <button
                className="debate-end-btn"
                onClick={() => {
                  endDebate();
                  setPhase('ended');
                }}
              >
                End Debate <span className="debate-esc-text">(Esc)</span>
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
                  <div className={`msg-bubble msg-bubble--${msg.speaker}${msg.isPlaceholder ? ' msg-bubble--generating' : ''}`}>
                    {msg.speaker === 'ai' && msg.isPlaceholder ? (
                      <span className="generating-dots">
                        <span /><span /><span />
                      </span>
                    ) : msg.speaker === 'ai' && !msg.isStreaming ? (
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
                    <svg className="score-ring-svg" width="60" height="60" viewBox="0 0 60 60" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
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

            {judgeVerdict.reportCardHeadline && (
              <div className="judge-headline">
                {judgeVerdict.reportCardHeadline}
              </div>
            )}

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
            {judgeVerdict.userWeaknesses && (
              <div className="judge-weaknesses">
                <div className="judge-weaknesses-title">⚠️ Main Weakness</div>
                <div className="judge-weaknesses-text">{judgeVerdict.userWeaknesses}</div>
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
            {judgeVerdict.improvementSummary && (
              <div className="judge-summary">
                <div className="judge-summary-title">🎯 Next Debate Focus</div>
                <div className="judge-summary-text">{judgeVerdict.improvementSummary}</div>
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
            {judgeVerdict.savedFocusAreas && judgeVerdict.savedFocusAreas.length > 0 && (
              <div className="judge-persistent">
                <div className="judge-persistent-title">📌 Recurring Weaknesses The AI Will Keep Pressing</div>
                <ul className="judge-list">
                  {judgeVerdict.savedFocusAreas.slice(0, 8).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {judgeVerdict.savedGrammarPatterns && judgeVerdict.savedGrammarPatterns.length > 0 && (
              <div className="judge-persistent">
                <div className="judge-persistent-title">✍️ Recurring Grammar Issues To Clean Up</div>
                <ul className="judge-list judge-list--grammar">
                  {judgeVerdict.savedGrammarPatterns.slice(0, 8).map((item, i) => (
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
              <button
                className="judge-btn judge-btn--download"
                onClick={handleDownloadReport}
                title="Download full report card as HTML"
              >
                📥 Report Card
              </button>
              <button
                className="judge-btn judge-btn--share"
                onClick={handleShare}
                title="Copy result to clipboard"
              >
                📤 Share
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
