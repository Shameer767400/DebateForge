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
import { useAuth } from '../context/AuthContext';

import { useToast } from '../context/ToastContext';
import { useDebateSocket } from '../hooks/useDebateSocket';
import Confetti from '../components/Confetti';
import StreakCelebration from '../components/StreakCelebration';
import ShareDebateModal from '../components/ShareDebateModal';
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

function extractSavedVerdict(data, uid) {
  if (!data) return null;
  const myPart = (data.participants || []).find(
    (p) => !p.isAI && uid && (p.userId === uid || p.userId?._id === uid || p.id === uid)
  );
  if (myPart?.judgeScoreSnapshot) return myPart.judgeScoreSnapshot;
  if (data.judgeScore && (data.judgeScore.feedback || data.judgeScore.userScore != null)) {
    return data.judgeScore;
  }
  return null;
}

function timerColor(t) {
  if (t > 30) return 'var(--accent-user)';
  if (t > 10) return 'var(--accent-score)';
  return 'var(--accent-ai)';
}

const API_BASE = process.env.REACT_APP_API_URL || '';
function resolveAvatarUrl(avatar) {
  if (!avatar) return null;
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
    return avatar;
  }
  return `${API_BASE}${avatar}`;
}

const SEAT_THEMES = {
  1: { podiumCls: 'podium--seat1', spotCls: 'spotlight--cyan',   ringCls: 'ring--cyan',   nameCls: 'name--cyan',   color: '#00ff87' },
  2: { podiumCls: 'podium--seat2', spotCls: 'spotlight--amber',  ringCls: 'ring--amber',  nameCls: 'name--amber',  color: '#ffaa00' },
  3: { podiumCls: 'podium--seat3', spotCls: 'spotlight--blue',   ringCls: 'ring--blue',   nameCls: 'name--blue',   color: '#00e5ff' },
  4: { podiumCls: 'podium--seat4', spotCls: 'spotlight--purple', ringCls: 'ring--purple', nameCls: 'name--purple', color: '#d8b4fe' },
};

const AI_FALLBACK_INFO = {
  Aarav: { icon: '⚡', roleTitle: 'Assertive Challenger', speakLabel: '🎙️ CHALLENGING' },
  Priya: { icon: '📊', roleTitle: 'Analytical Evaluator', speakLabel: '🎙️ ANALYZING'   },
  Karan: { icon: '🤝', roleTitle: 'Diplomatic Mediator',  speakLabel: '🎙️ MEDIATING'   },
};

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
  const { user } = useAuth();
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
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
  const [isEvaluating,   setIsEvaluating]   = useState(false);
  const [showConfetti,   setShowConfetti]   = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
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
  const [activeGDSpeaker, setActiveGDSpeaker] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const [startingGD, setStartingGD] = useState(false);
  const [gdCountdown, setGdCountdown] = useState(null);
  const countdownTimerRef = useRef(null);

  /* Incrementing key used to guarantee the timer resets every new user_turn */
  const [timerKey, setTimerKey] = useState(0);

  const toast = useToast();

  const generateInviteDetails = () => {
    const code = debateInfo?.roomCode || '';
    const topic = debateInfo?.topic?.title || 'Campus Placement Group Discussion';
    const origin = window.location.origin;
    const directLink = `${origin}/join/${code}`;
    const whatsappText = `🔥 *Join my Campus Group Discussion on DebateForge!*

📌 *Topic:* ${topic}
🔑 *Room Code:* ${code}

👉 *Tap here to enter my table immediately:*
${directLink}

_4-Seat Campus GD Arena · English & Telugu Support_`;
    return { code, topic, directLink, whatsappText };
  };

  const renderGDCandidateMessages = (msg) => {
    const text = msg.text || '';
    const regex = /\[(Aarav|Priya|Karan|Candidate\s*\d+)\]:?\s*/gi;
    const matches = [...text.matchAll(regex)];

    if (matches.length <= 1) {
      let name = 'AI Candidate';
      let role = 'Peer';
      let avatar = '🤖';
      let color = '#00e5ff';

      if (text.includes('[Aarav]')) {
        name = 'Aarav'; role = 'Assertive'; avatar = '⚡'; color = '#ffaa00';
      } else if (text.includes('[Priya]')) {
        name = 'Priya'; role = 'Analytical'; avatar = '📊'; color = '#00e5ff';
      } else if (text.includes('[Karan]')) {
        name = 'Karan'; role = 'Diplomat'; avatar = '🤝'; color = '#d8b4fe';
      }

      const cleanText = text.replace(/\[(Aarav|Priya|Karan|Candidate\s*\d+)\]:?\s*/gi, '').trim();

      return (
        <div className="gd-candidate-turn-box" style={{ borderLeft: `3px solid ${color}`, paddingLeft: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.9rem' }}>{avatar}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color }}>{name}</span>
            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>{role}</span>
          </div>
          <div className="gd-candidate-text">{cleanText || text}</div>
        </div>
      );
    }

    const blocks = [];
    for (let i = 0; i < matches.length; i++) {
      const rawName = matches[i][1];
      const startIndex = matches[i].index + matches[i][0].length;
      const endIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const segment = text.slice(startIndex, endIndex).trim().replace(/^["']|["']$/g, '');

      let name = rawName;
      let role = 'Peer';
      let avatar = '🤖';
      let color = '#00e5ff';

      if (/aarav/i.test(rawName)) {
        name = 'Aarav'; role = 'Assertive'; avatar = '⚡'; color = '#ffaa00';
      } else if (/priya/i.test(rawName)) {
        name = 'Priya'; role = 'Analytical'; avatar = '📊'; color = '#00e5ff';
      } else if (/karan/i.test(rawName)) {
        name = 'Karan'; role = 'Diplomat'; avatar = '🤝'; color = '#d8b4fe';
      }

      blocks.push(
        <div key={i} className="gd-candidate-turn-box" style={{ borderLeft: `3px solid ${color}`, paddingLeft: '10px', marginTop: i > 0 ? '8px' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.9rem' }}>{avatar}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color }}>{name}</span>
            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>{role}</span>
          </div>
          <div className="gd-candidate-text">{segment}</div>
        </div>
      );
    }
    return <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{blocks}</div>;
  };

  const LANGUAGE_OPTIONS = [
    { value: 'en', label: '🇬🇧 English (Default)' },
    { value: 'te', label: '🇮🇳 తెలుగు (Telugu)' },
    { value: 'auto', label: '🌐 Auto / Bilingual' },
    { value: 'hi', label: 'Hindi' },
    { value: 'ta', label: 'Tamil' },
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
  const endRequestedRef = useRef(false);
  const endEmittedRef = useRef(false);
  const fallbackEndAttemptedRef = useRef(false);

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
            id:            `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            speaker:       'user',
            text:          data.text,
            speakerName:   data.speakerName || null,
            speakerAvatar: data.speakerAvatar || null,
            speakerUserId: data.userId || null,
            seatNumber:    data.seatNumber || null,
            scores:        null,
          },
        ]);
        if (data.seatNumber) {
          setActiveGDSpeaker(`seat-${data.seatNumber}`);
        } else {
          setActiveGDSpeaker('user');
        }
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

        if (token.includes('[Aarav]')) setActiveGDSpeaker('Aarav');
        else if (token.includes('[Priya]')) setActiveGDSpeaker('Priya');
        else if (token.includes('[Karan]')) setActiveGDSpeaker('Karan');

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
        setActiveGDSpeaker(null);
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

      /* Debate ended (forfeit or host terminated for all participants) */
      case 'debate_ended':
        setIsEvaluating(false);
        setDebateInfo((prev) => prev ? { ...prev, status: 'completed' } : prev);
        setEndResult(data || { winner: 'ai' });
        setPhase('ended');
        if (data?.message) toast.info(data.message);
        break;

      case 'debate_joined':
        if (data?.roomCode || data?.participants || data?.status) {
          setDebateInfo((prev) => ({
            ...prev,
            roomCode: data.roomCode || prev?.roomCode,
            participants: data.participants || prev?.participants,
            status: data.status || prev?.status,
          }));
        }
        break;

      case 'gd_table_update':
        if (data?.participants) {
          setDebateInfo((prev) => ({
            ...prev,
            roomCode: data.roomCode || prev?.roomCode,
            participants: data.participants,
            status: data.status || prev?.status,
          }));
        }
        break;

      case 'gd_starting_countdown': {
        const secs = Number(data?.seconds) || 3;
        clearInterval(countdownTimerRef.current);
        setGdCountdown(secs);
        countdownTimerRef.current = setInterval(() => {
          setGdCountdown((c) => {
            if (c == null || c <= 1) {
              clearInterval(countdownTimerRef.current);
              return null;
            }
            return c - 1;
          });
        }, 1000);
        break;
      }

      /* Phase transition (Addition 6) — also update timer max for new phase */
      case 'phase_update':
        setPhaseInfo(data);
        if (data?.timeLimit && data.timeLimit > 0) {
          setTimerMax(data.timeLimit);
          setTimer(data.timeLimit);
        }
        break;

      /* AI Judge verdict (Addition 6 & 9 Report Card) — pick individual user verdict in multiplayer GD */
      case 'judge_verdict': {
        const myUid = userRef.current?.id || userRef.current?._id;
        const myPersonalVerdict = (data?.participantVerdicts && myUid && data.participantVerdicts[myUid])
          ? data.participantVerdicts[myUid]
          : data;
        const mergedVerdict = {
          ...myPersonalVerdict,
          streak: data?.streak || myPersonalVerdict?.streak,
          participantVerdicts: data?.participantVerdicts || null,
        };
        setIsEvaluating(false);
        setEndResult(null);
        setJudgeVerdict(mergedVerdict);
        setDebateInfo((prev) => prev ? { ...prev, status: 'completed' } : prev);
        setPhase('ended');
        if (mergedVerdict?.winner === 'user') {
          setUserWins((w) => w + 1);
          setShowConfetti(true);
          playVictory();
        }
        if (mergedVerdict?.winner === 'ai') setAiWins((w) => w + 1);
        // Streak celebration (Addition 7)
        if (data?.streak?.milestoneReached) {
          setStreakMilestone(data.streak.milestoneReached);
        }
        if (data?.streak?.freezeUsed) {
          setStreakFreezeUsed(true);
        }
        break;
      }

      case 'gd_session_started':
        clearInterval(countdownTimerRef.current);
        setGdCountdown(null);
        setDebateInfo((prev) => prev ? {
          ...prev,
          status: 'active',
          participants: data?.participants || prev.participants,
        } : prev);
        setTimerKey((k) => k + 1);
        toast.success('🚀 Group Discussion started! Round 1 is live.');
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
    broadcastGDCountdown,
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
        .then((r) => {
          if (mounted) {
            const data = r.data?.debate ?? r.data;
            setDebateInfo(data);
            if (data?.language) {
              setDebateLanguage(data.language);
            }
            if (data?.status === 'completed' || data?.endedAt) {
              const myUid = userRef.current?.id || userRef.current?._id;
              const savedVerdict = extractSavedVerdict(data, myUid);
              if (savedVerdict) {
                setJudgeVerdict(savedVerdict);
              } else {
                setEndResult({
                  winner: data.winner || 'ai',
                  userFinalScore: data.userFinalScore ?? 0,
                  forfeit: true,
                });
              }
              setIsEvaluating(false);
              setPhase('ended');
            }
          }
        })
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

  /* ── Real-time sync guard for GD Waiting Room & Host End-Debate termination ──
       Ensures friends waiting on mobile/background tabs automatically enter Round 1
       as soon as host starts AND exit cleanly as soon as host ends the room. ── */
  const gdStatusRef = useRef(debateInfo?.status);
  useEffect(() => { gdStatusRef.current = debateInfo?.status; }, [debateInfo?.status]);

  useEffect(() => {
    if (!debateId || debateInfo?.format !== 'group_discussion' || phase === 'ended') return;
    let cancelled = false;
    const pollIv = setInterval(async () => {
      try {
        const res = await api.get(`/api/debates/${debateId}`);
        if (cancelled) return;
        const fresh = res.data?.debate ?? res.data;
        if (!fresh) return;

        // 1. Transition friend automatically from Waiting Hall into active GD when host starts
        if (gdStatusRef.current === 'waiting' && fresh.status === 'active') {
          clearInterval(countdownTimerRef.current);
          setGdCountdown(null);
          setDebateInfo(fresh);
          setTimerKey((k) => k + 1);
          toast.success('🚀 Group Discussion started! Round 1 is live.');
          return;
        }

        // 2. Sync new human arrivals in Waiting Hall
        if (gdStatusRef.current === 'waiting' && Array.isArray(fresh.participants)) {
          setDebateInfo((prev) => prev ? { ...prev, participants: fresh.participants } : fresh);
        }

        // 3. Terminate friend's session immediately if host ended the discussion
        if (fresh.status === 'completed' || fresh.endedAt) {
          setDebateInfo(fresh);
          const myUid = userRef.current?.id || userRef.current?._id;
          const personalVerdict = extractSavedVerdict(fresh, myUid);
          if (personalVerdict) {
            setJudgeVerdict(personalVerdict);
          } else {
            setEndResult((prev) => prev || {
              winner: fresh.winner || 'ai',
              userFinalScore: fresh.userFinalScore ?? 0,
              endedByHost: true,
            });
          }
          setIsEvaluating(false);
          setPhase('ended');
        }
      } catch { /* ignore transient network blips */ }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(pollIv);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateId, debateInfo?.format, debateInfo?.status, phase]);

  /* ── Handle End Debate / Leave Table with evaluating state ── */
  const myCurrentUid = user?.id || user?._id;
  const canEndDebate =
    debateInfo?.format !== 'group_discussion' ||
    !debateInfo?.userId ||
    !myCurrentUid ||
    (debateInfo.userId?._id || debateInfo.userId) === myCurrentUid;

  const handleEndDebate = useCallback(() => {
    if (isEvaluating || phase === 'ended') return;
    if (!canEndDebate) {
      navigate('/lobby');
      return;
    }
    endRequestedRef.current = true;
    fallbackEndAttemptedRef.current = false;
    setIsEvaluating(true);
    const sent = endDebate();
    endEmittedRef.current = Boolean(sent);
  }, [isEvaluating, phase, canEndDebate, navigate, endDebate]);

  /* ── Polling & HTTP fallback while awaiting AI Judge Score after End Debate ──
       Guarantees the score/report card renders immediately even if a socket event
       is dropped/delayed on mobile or the socket briefly disconnects. ── */
  useEffect(() => {
    if (!debateId || !isEvaluating || judgeVerdict || endResult) return;
    let cancelled = false;
    const startedAt = Date.now();

    if (connected && !endEmittedRef.current) {
      const sent = endDebate();
      if (sent) endEmittedRef.current = true;
    }

    const applyCompletedDebate = (fresh) => {
      if (!fresh || (fresh.status !== 'completed' && !fresh.endedAt)) return false;
      const myUid = userRef.current?.id || userRef.current?._id;
      const savedVerdict = extractSavedVerdict(fresh, myUid);
      setDebateInfo(fresh);
      if (savedVerdict) {
        setJudgeVerdict(savedVerdict);
        if (savedVerdict.winner === 'user') setShowConfetti(true);
      } else {
        setEndResult({
          winner: fresh.winner || 'ai',
          userFinalScore: fresh.userFinalScore ?? 0,
          forfeit: true,
        });
      }
      setIsEvaluating(false);
      setPhase('ended');
      return true;
    };

    const checkDebateStatus = async () => {
      try {
        const res = await api.get(`/api/debates/${debateId}`);
        if (cancelled) return;
        const fresh = res.data?.debate ?? res.data;
        if (applyCompletedDebate(fresh)) return;

        const elapsed = Date.now() - startedAt;
        const shouldUseHttpFallback =
          !fallbackEndAttemptedRef.current &&
          ((!endEmittedRef.current && elapsed > 4000) || elapsed > 25000);

        if (shouldUseHttpFallback) {
          fallbackEndAttemptedRef.current = true;
          try {
            const endRes = await api.post(`/api/debates/${debateId}/end`, {
              tzOffsetMinutes: -new Date().getTimezoneOffset(),
            });
            if (cancelled) return;
            const recheck = await api.get(`/api/debates/${debateId}`).catch(() => null);
            const freshAfterEnd = recheck?.data?.debate ?? recheck?.data;
            if (!applyCompletedDebate(freshAfterEnd)) {
              setEndResult({
                winner: endRes.data?.winner || 'ai',
                userFinalScore: endRes.data?.userFinalScore ?? 0,
                forfeit: true,
                message: endRes.data?.message || 'Debate ended.',
              });
              setIsEvaluating(false);
              setPhase('ended');
            }
          } catch {
            /* keep polling if fallback failed */
          }
        }
      } catch {
        /* ignore transient network blips */
      }
    };

    const initialTimer = setTimeout(checkDebateStatus, 1200);
    const pollTimer = setInterval(checkDebateStatus, 2000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(pollTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateId, isEvaluating, judgeVerdict, endResult, connected, endDebate]);

  /* ── Auto-redirect only for non-host GD guests whose host ended the table ── */
  useEffect(() => {
    if (phase !== 'ended') return;
    if (judgeVerdict) return; // Let user inspect their individual report card manually
    if (endResult?.endedByHost && !endRequestedRef.current) {
      toast.info('Host ended the discussion. Redirecting to dashboard…');
      const fastT = setTimeout(() => navigate('/dashboard'), 3000);
      return () => clearTimeout(fastT);
    }
  }, [phase, navigate, endResult, toast, judgeVerdict]);

  /* ── Keyboard shortcut: Escape to end debate (host only in GD) ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && phase !== 'ended' && !isEvaluating) {
        if (canEndDebate) {
          handleEndDebate();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, isEvaluating, canEndDebate, handleEndDebate]);

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

  const isGDWaiting = debateInfo?.format === 'group_discussion' && debateInfo?.status === 'waiting';

  const handleStartGDFromLobby = () => {
    if (startingGD || gdCountdown != null) return;
    setStartingGD(true);
    broadcastGDCountdown(3);
    clearInterval(countdownTimerRef.current);
    setGdCountdown(3);

    countdownTimerRef.current = setInterval(async () => {
      setGdCountdown((prev) => {
        if (prev != null && prev > 1) return prev - 1;
        clearInterval(countdownTimerRef.current);
        return 0;
      });
    }, 1000);

    setTimeout(async () => {
      clearInterval(countdownTimerRef.current);
      try {
        const res = await api.post(`/api/debates/${debateId}/start-gd`);
        setDebateInfo((prev) => prev ? {
          ...prev,
          status: 'active',
          participants: res.data?.participants || prev.participants,
        } : prev);
        setGdCountdown(null);
        setTimerKey((k) => k + 1);
      } catch (err) {
        setGdCountdown(null);
        toast.error(err.response?.data?.error || 'Could not start discussion.');
      } finally {
        setStartingGD(false);
      }
    }, 3000);
  };

  useEffect(() => {
    // Only run timer during active user phases (and never while waiting in GD lobby)
    if (isGDWaiting || (phase !== 'user_turn' && phase !== 'recording')) {
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
  }, [timerKey, phase === 'recording' ? 'recording' : 'user_turn', timerMax, isGDWaiting]);

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
    setShowShareModal(true);
  }, [judgeVerdict]);

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
        {!connected && !isEnded && !isEvaluating && (
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

        <div className="debate-main">
        <div className="debate-left">

          {/* Top bar */}
          <div className="debate-topbar">
            <div className="debate-topbar-primary">
              <span
                className="debate-topic"
                title={debateInfo?.topicSnapshot ?? debateInfo?.topic?.title ?? ''}
              >
                {debateInfo?.topicSnapshot ?? debateInfo?.topic?.title ?? 'Loading topic…'}
              </span>
              <span className="debate-round">Round {round}</span>
            </div>
            <div className="debate-topbar-controls">
              <select
                value={debateLanguage}
                onChange={(e) => setDebateLanguage(e.target.value)}
                disabled={isRecording || isProcessing || isEvaluating || isEnded || Boolean(judgeVerdict)}
                aria-label="Debate language"
                className="debate-lang-select"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              <button
                type="button"
                className="debate-mobile-settings-btn"
                onClick={() => setShowMobileControls((v) => !v)}
                aria-label="Toggle voice settings"
                aria-expanded={showMobileControls}
              >
                {showMobileControls ? '✕ Voice' : '🎙️ Voice'}
              </button>

              <div className={`debate-voice-controls ${showMobileControls ? 'debate-voice-controls--open' : ''}`}>
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  aria-label="AI Voice"
                  className="debate-voice-select"
                >
                  <option value="">Default AI Voice</option>
                  {availableVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                  ))}
                </select>

                <label className="debate-voice-label">
                  <input
                    type="checkbox"
                    checked={voiceEnabled}
                    onChange={(e) => setVoiceEnabled(e.target.checked)}
                    disabled={isRecording || isProcessing || isEvaluating || isEnded || Boolean(judgeVerdict)}
                    aria-label="AI voice"
                  />
                  <span className="debate-voice-label-text">
                    AI voice
                  </span>
                </label>
              </div>

              <button
                type="button"
                className="debate-end-btn"
                disabled={isEvaluating}
                onClick={handleEndDebate}
              >
                {isEvaluating
                  ? 'Scoring…'
                  : canEndDebate
                    ? <>End Debate <span className="debate-esc-text">(Esc)</span></>
                    : 'Leave Table'}
              </button>
            </div>
          </div>

          {/* Virtual 3D Game Arena Stage */}
          {debateInfo?.format === 'group_discussion' && (
            <div className="arena-stage-container">
              {/* Arena Broadcast Ribbon */}
              <div className="arena-match-ribbon">
                <div className="arena-ribbon-left">
                  <span className="arena-live-indicator">
                    <span className="arena-live-dot" /> LIVE ARENA
                  </span>
                  <span className="arena-ribbon-title">
                    ⚔️ CAMPUS GD TABLE · 4 SEATS
                  </span>
                  {debateInfo?.roomCode && (
                    <span className="arena-room-pill" onClick={() => setShowInviteModal(true)} title="Click to share">
                      🔑 ROOM: {debateInfo.roomCode}
                    </span>
                  )}
                  {debateLanguage === 'te' && (
                    <span className="arena-lang-pill">
                      🇮🇳 తెలుగు మోడ్
                    </span>
                  )}
                </div>

                <div className="arena-ribbon-actions">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(true)}
                    className="arena-invite-btn"
                  >
                    📱 Invite (WhatsApp)
                  </button>
                  <button
                    type="button"
                    disabled={phase !== 'user_turn'}
                    onClick={() => {
                      sendText("Let's hear other perspectives on this topic. Aarav, Priya, what is your counter-argument?");
                    }}
                    className={`arena-crossfire-btn ${phase === 'user_turn' ? 'arena-crossfire-btn--active' : ''}`}
                  >
                    ⚡ Trigger Arena Cross-Fire
                  </button>
                </div>
              </div>

              {/* 3D Circular Arena Ring Stage */}
              <div className="arena-stage-3d">
                <div className="arena-ring-floor">
                  {/* Central Holographic Topic Core */}
                  <div className="arena-center-core">
                    <div className="arena-core-ring ring--outer" />
                    <div className="arena-core-ring ring--inner" />
                    <div className="arena-core-topic">
                      <span className="core-label">CAMPUS PLACEMENT GD</span>
                      <span className="core-topic-text">{debateInfo?.topic?.title || 'Open Topic'}</span>
                    </div>
                  </div>

                  {/* Seats 1 to 4: Real joined humans first; empty '+' invite slots in Waiting Hall; AI auto-fill only when active */}
                  {[1, 2, 3, 4].map((seatNum) => {
                    const theme = SEAT_THEMES[seatNum];
                    const list = debateInfo?.participants || [];
                    const found = list.find((p) => p.seatNumber === seatNum) || list[seatNum - 1];

                    // Fallback Host representation for Seat 1 if list hasn't hydrated yet
                    const participant = found || (seatNum === 1 ? {
                      id: user?.id || user?._id || null,
                      userId: user?.id || user?._id || null,
                      name: user?.username || 'You',
                      avatar: user?.profilePicUrl || null,
                      isAI: false,
                      roleTitle: 'Host',
                      seatNumber: 1,
                    } : null);

                    // Waiting Hall empty slot (shows '+' invite icon instead of premature AI)
                    if (!participant && isGDWaiting) {
                      return (
                        <button
                          key={seatNum}
                          type="button"
                          onClick={() => setShowInviteModal(true)}
                          className={`arena-podium arena-podium--empty ${theme.podiumCls}`}
                          title="Click to invite a friend to this seat"
                        >
                          <div className={`podium-avatar-ring podium-avatar-ring--empty ${theme.ringCls}`}>
                            <span className="podium-avatar-plus">＋</span>
                          </div>
                          <div className="podium-info" style={{ textAlign: 'left' }}>
                            <div className={`podium-name ${theme.nameCls}`}>Open Seat {seatNum}</div>
                            <div className="podium-role">Tap + to Invite Friend</div>
                            <div className="podium-status-pill podium-status-pill--empty">
                              ➕ WAITING FOR FRIEND
                            </div>
                          </div>
                        </button>
                      );
                    }

                    // Backward-compat AI fallback when session is active and slot still null
                    const resolved = participant || (() => {
                      const defaultNames = { 2: 'Aarav', 3: 'Priya', 4: 'Karan' };
                      const aiName = defaultNames[seatNum];
                      return {
                        name: aiName,
                        isAI: true,
                        roleTitle: AI_FALLBACK_INFO[aiName]?.roleTitle || 'AI Peer',
                        seatNumber: seatNum,
                      };
                    })();

                    const isAI = !!resolved.isAI;
                    const myId = user?.id || user?._id;
                    const resolvedId = resolved.id || resolved.userId;
                    const isMe = !isAI && ((myId && resolvedId && resolvedId === myId) || seatNum === 1 && !found);
                    const isSpeaking = isAI
                      ? activeGDSpeaker === resolved.name
                      : (activeGDSpeaker === `seat-${seatNum}` || (isMe && activeGDSpeaker === 'user'));

                    const aiMeta = isAI ? AI_FALLBACK_INFO[resolved.name] : null;
                    const avatarSrc = !isAI ? resolveAvatarUrl(resolved.avatar || (isMe ? user?.profilePicUrl : null)) : null;

                    return (
                      <div key={seatNum} className={`arena-podium ${theme.podiumCls} ${isSpeaking ? 'podium--speaking' : ''}`}>
                        <div className={`podium-spotlight ${theme.spotCls}`} />
                        <div className={`podium-avatar-ring ${theme.ringCls}`} style={{ overflow: 'hidden' }}>
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt={resolved.name}
                              crossOrigin="anonymous"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                            />
                          ) : isAI ? (
                            <span className="podium-avatar-icon">{aiMeta?.icon || '🤖'}</span>
                          ) : (
                            <span className="podium-avatar-initial" style={{ color: theme.color, fontWeight: 900 }}>
                              {(resolved.name || 'U')[0].toUpperCase()}
                            </span>
                          )}
                          {isSpeaking && <span className="podium-speaker-wave" />}
                        </div>
                        <div className="podium-info">
                          <div className={`podium-name ${theme.nameCls}`}>
                            {resolved.name}{isMe ? ' (You)' : ''}
                          </div>
                          <div className="podium-role">
                            {isAI ? (resolved.roleTitle || aiMeta?.roleTitle || 'AI Candidate') : (seatNum === 1 ? `Host · Seat 1` : `Real Peer · Seat ${seatNum}`)}
                          </div>
                          <div className="podium-status-pill">
                            {isSpeaking
                              ? (aiMeta?.speakLabel || '🎙️ SPEAKING')
                              : (isAI ? '🤖 AI AUTO-FILLED' : (seatNum === 1 ? '🟢 HOST JOINED' : '🟢 FRIEND JOINED'))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp Share & Invite Modal */}
          {showInviteModal && debateInfo?.roomCode && (() => {
            const invite = generateInviteDetails();
            return (
              <div className="arena-modal-backdrop" onClick={() => setShowInviteModal(false)}>
                <div className="arena-modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="arena-modal-header">
                    <div>
                      <span className="arena-modal-badge">⚡ MULTIPLAYER GD INVITE</span>
                      <h3 className="arena-modal-title">Invite Friends to Your Table</h3>
                    </div>
                    <button className="arena-modal-close" onClick={() => setShowInviteModal(false)}>✕</button>
                  </div>

                  <p className="arena-modal-topic">
                    📌 <strong>Topic:</strong> {invite.topic}
                  </p>

                  {(() => {
                    const realHumans = (debateInfo?.participants || []).filter((p) => !p.isAI).length || 1;
                    const openSlots = Math.max(0, 4 - realHumans);
                    return (
                      <div className="arena-modal-capacity-bar">
                        <span className="capacity-dot filled" />
                        <span className="capacity-label">
                          {realHumans}/4 Real Users Joined · {openSlots} Empty {openSlots === 1 ? 'Slot' : 'Slots'} Remaining
                        </span>
                      </div>
                    );
                  })()}

                  {/* Big WhatsApp CTA */}
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(invite.whatsappText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="arena-modal-wa-btn"
                  >
                    <span>📱</span> Share on WhatsApp Group
                  </a>

                  {/* 1-Click Link Copy */}
                  <div className="arena-modal-field-row">
                    <div className="arena-modal-field">
                      <span className="field-label">1-Click Direct Join Link</span>
                      <div className="field-val-wrap">
                        <input type="text" readOnly value={invite.directLink} className="field-input" />
                        <button
                          type="button"
                          className="field-copy-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(invite.directLink);
                            toast.success('1-Click Join Link copied to clipboard!');
                          }}
                        >
                          📋 Copy Link
                        </button>
                      </div>
                    </div>

                    <div className="arena-modal-field">
                      <span className="field-label">Room Code Only</span>
                      <div className="field-val-wrap">
                        <input type="text" readOnly value={invite.code} className="field-input code-input" />
                        <button
                          type="button"
                          className="field-copy-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(invite.code);
                            toast.success(`Room Code ${invite.code} copied!`);
                          }}
                        >
                          🔑 Copy Code
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="arena-modal-hint">
                    💡 <strong>How it works:</strong> When your friends tap your link in WhatsApp, DebateForge automatically reads room code <strong>{invite.code}</strong> and connects them straight to Seat 2, Seat 3, or Seat 4!
                  </div>
                </div>
              </div>
            );
          })()}

          {/* GD Waiting Room / Lobby OR Active Chat */}
          {isGDWaiting ? (() => {
            const invite = generateInviteDetails();
            const realParticipants = (debateInfo?.participants || []).filter((p) => !p.isAI);
            const joinedCount = realParticipants.length || 1;
            const emptyCount = Math.max(0, 4 - joinedCount);
            const isHost = !debateInfo?.userId || !user?.id ||
              debateInfo.userId === user.id || debateInfo.userId === user._id;
            return (
              <div className="gd-waiting-lobby">
                <div className="gd-waiting-badge">🏛️ GROUP DISCUSSION WAITING ROOM</div>
                <h2 className="gd-waiting-heading">
                  {debateInfo?.topicSnapshot ?? debateInfo?.topic?.title ?? 'Campus Group Discussion'}
                </h2>
                <p className="gd-waiting-sub">
                  {joinedCount}/4 real participants joined ({emptyCount} empty {emptyCount === 1 ? 'slot' : 'slots'}).
                  Real friends appear in the seats above as soon as they join!
                </p>

                {gdCountdown != null ? (
                  <div className="gd-countdown-box">
                    <div className="gd-countdown-number">{gdCountdown > 0 ? gdCountdown : 'GO!'}</div>
                    <div className="gd-countdown-text">
                      🤖 Auto-filling {emptyCount} empty {emptyCount === 1 ? 'slot' : 'slots'} with AI candidates… Keeping all {joinedCount} real participants!
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="gd-waiting-invite-box">
                      <div className="gd-waiting-code-block">
                        <span className="gd-waiting-code-label">ROOM CODE</span>
                        <span className="gd-waiting-code-value">{invite.code}</span>
                      </div>
                      <div className="gd-waiting-invite-actions">
                        <a
                          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(invite.whatsappText)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gd-waiting-wa-btn"
                        >
                          📱 Share on WhatsApp
                        </a>
                        <button
                          type="button"
                          className="gd-waiting-copy-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(invite.directLink);
                            toast.success('1-Click Join Link copied!');
                          }}
                        >
                          📋 Copy Invite Link
                        </button>
                      </div>
                    </div>

                    {isHost ? (
                      <button
                        type="button"
                        disabled={startingGD}
                        onClick={handleStartGDFromLobby}
                        className="gd-waiting-start-btn"
                      >
                        🚀 Start Discussion ({emptyCount > 0 ? `Fill ${emptyCount} Empty Seat${emptyCount > 1 ? 's' : ''} with AI` : 'All 4 Real Users Ready'})
                      </button>
                    ) : (
                      <div className="gd-waiting-guest-banner">
                        ⏳ You have joined this table! Waiting for the host to click <strong>Start Discussion</strong>…
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })() : (
          <>
          {/* Chat area */}
          <div className="debate-chat">
            {messages.map((msg) => {
              const isGDRoom = debateInfo?.format === 'group_discussion';
              const myId = user?.id || user?._id;

              if (msg.speaker === 'user') {
                const isMe = !msg.speakerUserId || (myId && msg.speakerUserId === myId);
                const matchedParticipant = (debateInfo?.participants || []).find(
                  (p) => (!p.isAI && ((msg.speakerUserId && (p.id || p.userId) === msg.speakerUserId) || (msg.seatNumber && p.seatNumber === msg.seatNumber)))
                );
                const displayName = msg.speakerName || matchedParticipant?.name || (isMe ? (user?.username || 'You') : 'Participant');
                const rawAvatar = msg.speakerAvatar || matchedParticipant?.avatar || (isMe ? user?.profilePicUrl : null);
                const avatarSrc = resolveAvatarUrl(rawAvatar);
                const seatTheme = SEAT_THEMES[msg.seatNumber || (isMe ? 1 : 2)] || SEAT_THEMES[2];

                return (
                  <div
                    key={msg.id}
                    className={`msg-row ${isMe ? 'msg-row--user' : 'msg-row--peer'}`}
                  >
                    <div
                      className={`msg-avatar ${isMe ? 'msg-avatar--user' : 'msg-avatar--peer'}`}
                      style={!isMe ? { borderColor: seatTheme.color, color: seatTheme.color } : undefined}
                    >
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt={displayName}
                          crossOrigin="anonymous"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                          {displayName[0]?.toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                    <div className="msg-body">
                      {isGDRoom && (
                        <div className={`msg-sender-tag ${isMe ? 'msg-sender-tag--me' : ''}`} style={!isMe ? { color: seatTheme.color } : undefined}>
                          {displayName} {isMe ? '(You)' : `· Peer`}
                        </div>
                      )}
                      <div className={`msg-bubble ${isMe ? 'msg-bubble--user' : 'msg-bubble--peer'}`}>
                        {msg.text}
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
                );
              }

              let customAvatar = '🤖';
              if (isGDRoom) {
                if (msg.text?.includes('[Aarav]')) customAvatar = '⚡';
                else if (msg.text?.includes('[Priya]')) customAvatar = '📊';
                else if (msg.text?.includes('[Karan]')) customAvatar = '🤝';
              }
              return (
              <div
                key={msg.id}
                className={`msg-row msg-row--ai`}
              >
                <div className={`msg-avatar msg-avatar--ai`}>
                  {customAvatar}
                </div>
                <div className="msg-body">
                  <div className={`msg-bubble msg-bubble--ai${msg.isPlaceholder ? ' msg-bubble--generating' : ''}`}>
                    {msg.isPlaceholder ? (
                      <span className="generating-dots">
                        <span /><span /><span />
                      </span>
                    ) : isGDRoom ? (
                      renderGDCandidateMessages(msg)
                    ) : !msg.isStreaming ? (
                      <StreamText text={msg.text} />
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              </div>
            );
            })}

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
                disabled={isProcessing || isAISpeaking || isEvaluating || isEnded}
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
                if (!trimmed || phase !== 'user_turn' || isEvaluating) return;
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
                disabled={phase !== 'user_turn' || isEvaluating || isEnded}
              />
              <button
                className="text-input-send"
                type="submit"
                disabled={!textInput.trim() || phase !== 'user_turn' || isEvaluating || isEnded}
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
          </>
          )}
        </div>

        {/* ──── RIGHT PANEL ──── */}
        <div className="debate-right">

          {/* Timer */}
          <div className="timer-section">
            <div className="panel-section-title">
              {timer <= 20 ? '🔥 Adrenaline Countdown' : 'Time Remaining'}
            </div>
            <div className={`timer-ring-wrap ${timer <= 20 ? 'timer-ring-wrap--urgent' : ''}`}>
              <svg className="timer-ring-svg" width="100" height="100" viewBox="0 0 100 100">
                <circle className="timer-ring-bg" cx="50" cy="50" r={RING_R} />
                <circle
                  className={`timer-ring-fg ${timer <= 20 ? 'timer-ring-fg--urgent' : ''}`}
                  cx="50"
                  cy="50"
                  r={RING_R}
                  strokeDasharray={RING_C}
                  strokeDashoffset={timerOffset}
                  stroke={timerColor(timer)}
                />
              </svg>
              <div className={`timer-value ${timer <= 20 ? 'timer-value--urgent' : ''}`} style={{ color: timerColor(timer) }}>
                {timer}
              </div>
            </div>
            {timer <= 20 && (
              <div className="timer-urgent-tag">
                ⚠️ FINAL SECONDS · WRAP UP!
              </div>
            )}
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

      {/* ════════ EVALUATING / CALCULATING SCORE OVERLAY ════════ */}
      {isEvaluating && !judgeVerdict && !endResult && (
        <div className="judge-overlay" role="dialog" aria-modal="true" aria-label="Evaluating debate">
          <div className="judge-card judge-card--evaluating">
            <div className="judge-evaluating-spinner">
              <div className="df-spinner">
                <div className="df-spinner-core" />
                <div className="df-spinner-orbit" />
              </div>
            </div>
            <div className="judge-header">⚖️ Calculating Your Score…</div>
            <p className="judge-evaluating-text">
              Our AI Judge is reviewing your arguments, logic, evidence, and fallacies to build your report card.
            </p>
          </div>
        </div>
      )}

      {/* ════════ EARLY-END SUMMARY OVERLAY (when ended before judge scoring) ════════ */}
      {endResult && !judgeVerdict && (
        <div className="judge-overlay" role="dialog" aria-modal="true" aria-label="Debate summary">
          <div className="judge-card">
            <div className="judge-header">📊 Debate Summary</div>
            <div className={`judge-winner judge-winner--${endResult.winner || 'ai'}`}>
              {endResult.winner === 'user' ? '🏆 You Win!' :
               endResult.winner === 'draw' ? '🤝 Draw' : '🤖 AI Wins'}
            </div>
            <div className="judge-scores">
              <div className="judge-score-col">
                <span className="judge-score-number judge-score-number--user">
                  {endResult.userFinalScore ?? 0}
                </span>
                <span className="judge-score-label">{user?.username || 'You'}</span>
              </div>
            </div>
            <div className="judge-feedback">
              <div className="judge-feedback-title">Summary</div>
              <div className="judge-feedback-text">
                {endResult.message || 'Debate ended early before a full AI Judge report card could be generated. Complete at least one full exchange for detailed judge feedback.'}
              </div>
            </div>
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
                <span className="judge-score-label">{user?.username || 'You'}</span>
              </div>
              <span className="judge-vs">VS</span>
              <div className="judge-score-col">
                <span className="judge-score-number judge-score-number--ai">
                  {judgeVerdict.aiScore}
                </span>
                <span className="judge-score-label">AI Panel</span>
              </div>
            </div>

            {judgeVerdict.participantVerdicts && Object.keys(judgeVerdict.participantVerdicts).length > 1 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '8px',
                margin: '10px 0',
                padding: '10px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}>
                {(debateInfo?.participants || []).filter((p) => !p.isAI && (p.id || p.userId)).map((p) => {
                  const uid = (p.id || p.userId).toString();
                  const pv = judgeVerdict.participantVerdicts[uid];
                  if (!pv) return null;
                  const isMe = uid === (user?.id || user?._id);
                  return (
                    <span
                      key={uid}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        background: isMe ? 'rgba(0, 255, 135, 0.14)' : 'rgba(0, 229, 255, 0.09)',
                        border: `1px solid ${isMe ? '#00ff87' : 'rgba(0, 229, 255, 0.35)'}`,
                        color: isMe ? '#00ff87' : '#e2e8f0',
                      }}
                    >
                      {p.name}{isMe ? ' (You)' : ''}: {pv.userScore}/100
                    </span>
                  );
                })}
              </div>
            )}

            {/* GD Placement Recruiter Verdict */}
            {judgeVerdict.gdVerdict && (
              <div className="judge-gd-card" style={{
                background: 'linear-gradient(135deg, rgba(14, 25, 45, 0.95), rgba(7, 12, 22, 0.95))',
                border: '1px solid rgba(0, 229, 255, 0.35)',
                borderRadius: '12px',
                padding: '16px',
                margin: '16px 0',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e5ff', fontWeight: 700 }}>
                    🎯 Campus Placement GD Verdict
                  </span>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    background: judgeVerdict.gdVerdict.status === 'SELECTED' ? 'rgba(0, 255, 135, 0.2)' : judgeVerdict.gdVerdict.status === 'WAITLISTED' ? 'rgba(255, 204, 0, 0.2)' : 'rgba(255, 51, 102, 0.2)',
                    color: judgeVerdict.gdVerdict.status === 'SELECTED' ? '#00ff87' : judgeVerdict.gdVerdict.status === 'WAITLISTED' ? '#ffcc00' : '#ff3366',
                    border: '1px solid currentColor',
                  }}>
                    {judgeVerdict.gdVerdict.status === 'SELECTED' ? '🟢 SELECTED' : judgeVerdict.gdVerdict.status === 'WAITLISTED' ? '🟡 WAITLISTED' : '🔴 REJECTED'}
                  </span>
                </div>
                <div style={{ fontSize: '1.02rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
                  {judgeVerdict.gdVerdict.selectionTitle}
                </div>
                <p style={{ fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.75)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  {judgeVerdict.gdVerdict.panelRemarks}
                </p>

                {/* GD 4-Dimension Metric Bars */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)' }}>Entry Timing</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#00e5ff' }}>{judgeVerdict.gdVerdict.entryTimingScore || 85}%</div>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)' }}>Content Depth</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#00e5ff' }}>{judgeVerdict.gdVerdict.contentDepthScore || 82}%</div>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)' }}>Active Listening</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#00e5ff' }}>{judgeVerdict.gdVerdict.listeningSynthesisScore || 88}%</div>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)' }}>Leadership</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#00e5ff' }}>{judgeVerdict.gdVerdict.leadershipScore || 84}%</div>
                  </div>
                </div>
              </div>
            )}

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
      {/* Share Debate Modal */}
      <ShareDebateModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        topic={debateInfo?.topicSnapshot || 'Debate Practice'}
        format={debateInfo?.format || 'freeform'}
        userScore={judgeVerdict?.userScore || 0}
        winner={judgeVerdict?.winner || 'draw'}
        debateId={debateId}
        gdVerdict={judgeVerdict?.gdVerdict}
      />
    </>
  );
}
