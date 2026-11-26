const secLogger = require('../services/security-logger.service');
/**
 * @fileoverview Real-time WebSocket debate engine for DebateForge.
 *
 * Built on Socket.IO, this module manages the full lifecycle of a live debate session:
 *   1. JWT authentication middleware
 *   2. Connection limiting (max 5 per user)
 *   3. Debate session management (Redis-backed state)
 *   4. Audio transcription pipeline (ML service → Whisper/Gemini)
 *   5. Real-time fallacy detection and argument scoring
 *   6. Multi-provider LLM response streaming
 *   7. Multilingual debate support with translation
 *   8. Formal debate format engine (Oxford, Lincoln-Douglas, Parliamentary)
 *   9. AI judge scoring with Report Card generation
 *   10. ELO, streak, and achievement updates
 *
 * WebSocket Event Protocol:
 *
 *   Client → Server:
 *     join_debate      — Join a debate room (creates/restores session)
 *     audio_chunk      — Stream raw audio data (PCM/webm)
 *     audio_end        — Signal end of audio recording → triggers transcription
 *     transcript_direct — Send text directly (fallback for no-mic)
 *     set_language     — Override debate language
 *     end_debate       — End debate early (may trigger forfeit)
 *
 *   Server → Client:
 *     debate_joined    — Confirmation with topic, side, difficulty, format
 *     transcript_final — Transcribed user text
 *     ai_thinking      — AI is generating a response
 *     ai_text_chunk    — Streaming AI response text
 *     ai_turn_complete — Full AI response ready
 *     ai_translating   — Translation in progress (non-English)
 *     fallacy_detected — Real-time fallacy alert
 *     scores_update    — Per-turn scores (logic, evidence, clarity)
 *     phase_update     — Formal debate phase transition
 *     judge_verdict    — End-of-debate judge scoring and report card
 *     debate_ended     — Debate concluded (forfeit case)
 *     error            — Error message
 *
 * Security:
 *   - JWT token verification on every connection
 *   - Per-event rate limiting (configurable per event type)
 *   - IDOR prevention: session.userId === socket.user.id on every event
 *   - Turn-in-flight guard: prevents double-processing
 *   - Connection limiting: max 5 sockets per user
 *
 * @module websocket/index
 */

'use strict';

const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const { Debate, User } = require('../models');
const axios      = require('axios');
const redisClient = require('../config/redis');
const { SCORE_THRESHOLDS, MAX_ROUNDS } = require('../config/constants');

// Services
const DebateFormatEngine = require('../services/formatEngine.service');
const aiOrchestrator = require('../services/aiOrchestrator.service');
const fallacyService = require('../services/fallacyDetection.service');
const scoringService = require('../services/scoring.service');
const translationService = require('../services/translation.service');
const { trimHistory } = require('../utils/llm.utils');


const { finalizeDebate } = require('../services/debateEngine.service');
const timeSeries = require('../services/timeSeries.service');

// Export immediately to prevent CommonJS circular dependency issues
module.exports = initWebSocket;

// Track in-flight deferred MongoDB turn saves & active end_debate scoring runs
const pendingTurnSaves = new Map();
const endingDebates = new Set();

function emitCompletedDebateToSocket(socket, debate) {
  if (!debate || (debate.status !== 'completed' && !debate.endedAt)) return false;
  const userId = socket.user?.id;
  const myPart = (debate.participants || []).find(
    (p) => !p.isAI && p.userId && userId && p.userId.toString() === userId
  );
  const savedVerdict = myPart?.judgeScoreSnapshot || (
    debate.judgeScore && (debate.judgeScore.feedback || debate.judgeScore.userScore != null)
      ? debate.judgeScore
      : null
  );
  if (savedVerdict) {
    socket.emit('judge_verdict', savedVerdict);
  } else {
    socket.emit('debate_ended', {
      winner: debate.winner || 'ai',
      userFinalScore: debate.userFinalScore ?? 0,
      forfeit: true,
      endedByHost: true,
    });
  }
  return true;
}

function normalizeList(items, limit = 25) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const cleaned = [];

  for (const item of items) {
    const value = String(item || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
    if (cleaned.length >= limit) break;
  } 

  return cleaned;
}

function normalizeLangIso(lang) {
  const raw = String(lang || '').trim();
  if (!raw) return 'en';
  // BCP-47 -> iso-639-1 (en-US -> en)
  return raw.split('-')[0].toLowerCase();
}

function normalizeOptionalLang(lang) {
  const raw = String(lang || '').trim().toLowerCase();
  if (!raw || raw === 'auto' || raw === 'detect' || raw === 'detected') {
    return null;
  }
  return normalizeLangIso(raw);
}

function detectLanguageFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return 'en';

  if (/[\u0C00-\u0C7F]/.test(raw)) return 'te'; // Telugu script
  // Transliterated Telugu (Tenglish commonly spoken by students)
  if (/\b(nenu|meeru|cheppandi|cheptunna|kaadu|avunu|enduku|ekkada|ippudu|kada|kani|mari|bagundi|undali|chesaru|alochinchandi|vishayam|chudandi|manaki|vaallu|mithrulara|namaskaram|matladali|antanu)\b/i.test(raw)) return 'te';
  if (/[\u0B80-\u0BFF]/.test(raw)) return 'ta'; // Tamil
  if (/[\u0C80-\u0CFF]/.test(raw)) return 'kn'; // Kannada
  if (/[\u0D00-\u0D7F]/.test(raw)) return 'ml'; // Malayalam
  if (/[\u0900-\u097F]/.test(raw)) return 'hi'; // Devanagari → Hindi/Marathi fallback
  if (/[\u0980-\u09FF]/.test(raw)) return 'bn'; // Bengali
  if (/[\u0A80-\u0AFF]/.test(raw)) return 'gu'; // Gujarati
  if (/[\u0A00-\u0A7F]/.test(raw)) return 'pa'; // Gurmukhi Punjabi
  if (/[\u0600-\u06FF]/.test(raw)) return 'ur'; // Arabic script → Urdu fallback

  return 'en';
}

function resolveActiveLanguage(session, detectedLanguage = null) {
  const preferred = normalizeOptionalLang(session?.preferredLang);
  if (preferred) return preferred;

  const detected = normalizeOptionalLang(detectedLanguage || session?.detectedLanguage);
  if (detected) return detected;

  const current = normalizeOptionalLang(session?.currentLanguage);
  return current || 'en';
}

function shouldTranslateFallback(text, targetLang) {
  if (!targetLang || targetLang === 'en') return false;

  const scriptDetectableLangs = new Set(['te', 'ta', 'kn', 'ml', 'hi', 'bn', 'gu', 'pa', 'ur', 'ar', 'zh', 'ja', 'ko']);
  if (scriptDetectableLangs.has(targetLang)) {
    return detectLanguageFromText(text) !== targetLang;
  }

  // For Latin-script languages, only fall back when the output looks purely ASCII,
  // which usually means the model answered in English.
  return /^[\x00-\x7F\s.,!?'"%\-:;()0-9/]+$/.test(String(text || '').trim());
}

function buildImprovementSummary(areasToImprove, grammarMistakes) {
  const topAreas = areasToImprove.slice(0, 2);
  const topGrammar = grammarMistakes.slice(0, 2);
  const segments = [];

  if (topAreas.length > 0) {
    segments.push(`Main debate weaknesses: ${topAreas.join('; ')}`);
  }
  if (topGrammar.length > 0) {
    segments.push(`Grammar issues to fix: ${topGrammar.join('; ')}`);
  }

  return segments.join(' | ') || 'Keep sharpening your rebuttals, evidence, and clarity.';
}

async function persistReportCard(userId, judgeResponse) {
  const user = await User.findById(userId).select('targetImprovements grammarMistakes');
  if (!user) return { savedFocusAreas: [], savedGrammarPatterns: [] };

  const mergedFocusAreas = normalizeList([
    ...(user.targetImprovements || []),
    ...(judgeResponse.areasToImprove || []),
  ], 50);
  const mergedGrammarPatterns = normalizeList([
    ...(user.grammarMistakes || []),
    ...(judgeResponse.grammarMistakes || []),
  ], 50);

  user.targetImprovements = mergedFocusAreas;
  user.grammarMistakes = mergedGrammarPatterns;
  await user.save();

  return {
    savedFocusAreas: mergedFocusAreas,
    savedGrammarPatterns: mergedGrammarPatterns,
  };
}

function sanitizeJudgeResponse(judgeResponse, fallbackFeedback = '') {
  const areasToImprove = normalizeList(judgeResponse?.areasToImprove);
  const grammarMistakes = normalizeList(judgeResponse?.grammarMistakes);
  const fallacies = normalizeList(judgeResponse?.fallacies);
  const userWeaknesses = String(judgeResponse?.userWeaknesses || '').trim();
  const reportCardHeadline = String(
    judgeResponse?.reportCardHeadline ||
    (areasToImprove[0]
      ? `Your next biggest upgrade is: ${areasToImprove[0]}`
      : 'Solid effort, but there are still clear weaknesses to tighten up.')
  ).trim();

  let gdVerdict = null;
  if (judgeResponse?.gdVerdict && typeof judgeResponse.gdVerdict === 'object') {
    const g = judgeResponse.gdVerdict;
    const userScore = Number(judgeResponse?.userScore ?? 65);
    const defaultStatus = userScore >= 75 ? 'SELECTED' : userScore >= 60 ? 'WAITLISTED' : 'REJECTED';
    gdVerdict = {
      status: ['SELECTED', 'WAITLISTED', 'REJECTED'].includes(g.status) ? g.status : defaultStatus,
      selectionTitle: String(
        g.selectionTitle ||
        (defaultStatus === 'SELECTED'
          ? 'Selected for Next Round (Technical Interview)'
          : defaultStatus === 'WAITLISTED'
          ? 'Waitlisted for Final Placement Review'
          : 'Needs Practice in Content & Structure')
      ).trim(),
      entryTimingScore: Math.min(100, Math.max(0, Number(g.entryTimingScore ?? Math.round(userScore * 0.95)))),
      contentDepthScore: Math.min(100, Math.max(0, Number(g.contentDepthScore ?? Math.round(userScore * 0.98)))),
      listeningSynthesisScore: Math.min(100, Math.max(0, Number(g.listeningSynthesisScore ?? Math.round(userScore * 1.02)))),
      leadershipScore: Math.min(100, Math.max(0, Number(g.leadershipScore ?? Math.round(userScore * 0.92)))),
      panelRemarks: String(g.panelRemarks || 'Actively contributed to the group discussion. Continue refining structured points and crisp summaries.').trim(),
    };
  }

  return {
    userScore: Number(judgeResponse?.userScore ?? 65),
    aiScore: Number(judgeResponse?.aiScore ?? 60),
    winner: ['user', 'ai', 'draw'].includes(judgeResponse?.winner) ? judgeResponse.winner : 'draw',
    feedback: String(judgeResponse?.feedback || fallbackFeedback || 'Good effort, but your case still needs tighter execution.').trim(),
    userStrengths: String(judgeResponse?.userStrengths || 'You showed effort and stayed engaged.').trim(),
    userWeaknesses: userWeaknesses || (areasToImprove[0] || 'Your rebuttals and clarity still need more discipline.'),
    areasToImprove,
    grammarMistakes,
    fallacies,
    reportCardHeadline,
    improvementSummary: buildImprovementSummary(areasToImprove, grammarMistakes),
    gdVerdict,
  };
}

/* ── WebSocket rate limiter ── */
const WS_RATE_LIMITS = {
  join_debate:        { max: 20,  windowMs: 60000 },   // 20 joins per min
  audio_chunk:        { max: 600, windowMs: 60000 },   // 600 chunks per min (10/sec)
  audio_end:          { max: 60, windowMs: 60000 },    // 60 per min
  transcript_direct:  { max: 60, windowMs: 60000 },    // 60 per min
  set_language:       { max: 60, windowMs: 60000 },    // 60 per min
  end_debate:         { max: 20, windowMs: 60000 },    // 20 per min
};

function wsRateLimiter(socket, eventName) {
  if (!WS_RATE_LIMITS[eventName]) return true; // No limit defined = allow

  if (!socket._rateLimits) socket._rateLimits = {};
  if (!socket._rateLimits[eventName]) {
    socket._rateLimits[eventName] = { count: 0, resetAt: Date.now() + WS_RATE_LIMITS[eventName].windowMs };
  }

  const limit = socket._rateLimits[eventName];
  const now = Date.now();

  // Reset window if expired
  if (now > limit.resetAt) {
    limit.count = 0;
    limit.resetAt = now + WS_RATE_LIMITS[eventName].windowMs;
  }

  limit.count++;

  if (limit.count > WS_RATE_LIMITS[eventName].max) {
    socket.emit('error', { message: `Rate limit exceeded for ${eventName}. Slow down.` });
    return false;
  }

  return true;
}

/* ── Track active connections per user ── */
const userConnections = new Map(); // userId → Set<socketId>
const MAX_CONNECTIONS_PER_USER = 5;

/* ─────────────────────────────────────────────────────────────
   Entry point — attach Socket.IO to the HTTP server
───────────────────────────────────────────────────────────── */
function initWebSocket(server) {
  // Reuse the same CORS origins as the HTTP server (from shared config)
  const { isOriginAllowed } = require('../config/cors');

  const io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        if (isOriginAllowed(origin)) return cb(null, true);
        cb(new Error(`WebSocket CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    },
    maxHttpBufferSize: 1e7,  // 10 MB (audio chunks)
    pingTimeout: 30000,      // Disconnect idle sockets faster
    pingInterval: 15000,
  });


  /* ── JWT auth middleware ── */
  io.use((socket, next) => {
    // Try cookie first (set by HTTP-only cookie on login), then fall back to auth.token
    const cookieHeader = socket.handshake.headers?.cookie || '';
    const tokenFromCookie = cookieHeader.split(';').map(c => c.trim())
      .find(c => c.startsWith('token='));
    // Use substring to handle tokens containing '=' (Base64 padding)
    const cookieToken = tokenFromCookie ? tokenFromCookie.substring('token='.length) : null;
    const token = cookieToken || socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  /* ── Connection limiter middleware ── */
  io.use((socket, next) => {
    const userId = socket.user?.id;
    if (!userId) return next(new Error('No user'));

    const conns = userConnections.get(userId) || new Set();
    if (conns.size >= MAX_CONNECTIONS_PER_USER) {
      return next(new Error('Too many connections. Close other tabs.'));
    }
    conns.add(socket.id);
    userConnections.set(userId, conns);
    next();
  });

  /* ── Connection handler ── */
  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console

    socket._turnInFlight = false;
    socket._io = io;


    /* ────────────────────────────────────────
       join_debate
    ─────────────────────────────────────── */
    socket.on('join_debate', async ({ debateId, tzOffsetMinutes, preferredLang } = {}) => {
      if (!wsRateLimiter(socket, 'join_debate')) return;
      // Also reset turnInFlight on every join so reconnects don't stay blocked.
      socket._turnInFlight = false;

      try {
        const debate = await Debate.findOne({
          _id: debateId,
          $or: [
            { userId: socket.user.id },
            { 'participants.userId': socket.user.id },
          ],
        });
        if (!debate) {
          secLogger.error(`[WS] ERROR: Debate ${debateId} not found for user ${socket.user.id}`);
          return socket.emit('error', { message: 'Debate not found' });
        }

        const preferredLangIso = normalizeOptionalLang(preferredLang) || normalizeOptionalLang(debate.language);

        /* ── Check for existing session (reconnect case) ── */
        const existingRaw = await redisClient.get(`session:${debateId}`);
        if (existingRaw) {
          const existing = JSON.parse(existingRaw);
          // Sync latest participants & status from MongoDB so newly joined friends are recognized
          const syncedParticipants = (debate.participants && debate.participants.length > 0)
            ? debate.participants.map((p) => ({
                id: p.userId ? p.userId.toString() : null,
                userId: p.userId ? p.userId.toString() : null,
                name: p.name || 'Candidate',
                avatar: p.avatar || null,
                isAI: !!p.isAI,
                roleTitle: p.roleTitle || null,
                seatNumber: p.seatNumber || 1,
              }))
            : existing.participants || [];
          existing.participants = syncedParticipants;
          existing.status = debate.status || existing.status || 'active';

          const isParticipant =
            existing.userId === socket.user.id ||
            syncedParticipants.some((p) => p.id === socket.user.id);

          if (isParticipant) {
            // Restore existing session — do NOT overwrite round/history.
            // Just update language and tzOffset if they changed.
            if (preferredLang !== undefined || debate.language) {
              existing.preferredLang = preferredLangIso;
              existing.currentLanguage = resolveActiveLanguage(existing, preferredLangIso);
            }
            if (typeof tzOffsetMinutes === 'number') {
              existing.tzOffset = tzOffsetMinutes;
            }
            await redisClient.setex(`session:${debateId}`, 3600, JSON.stringify(existing));
            socket.join(debateId);

            socket.emit('debate_joined', {
              topic:        debate.topicSnapshot,
              userSide:     debate.userSide,
              aiPosition:   existing.aiPosition,
              difficulty:   debate.difficulty,
              format:       debate.format || 'freeform',
              status:       existing.status,
              language:     existing.currentLanguage || 'en',
              roomCode:     debate.roomCode || null,
              participants: existing.participants || [],
            });

            // Broadcast updated table state to all participants
            io.to(debateId).emit('gd_table_update', {
              participants: existing.participants || [],
              roomCode:     debate.roomCode || null,
              capacity:     debate.capacity || 4,
              status:       existing.status,
            });
            emitCompletedDebateToSocket(socket, debate);
            return;
          }
        }

        /* ── No existing session — create a fresh one ── */
        const user               = await User.findById(socket.user.id);
        const fallacyProfile     = Object.fromEntries(user.fallacyProfile || new Map());
        const targetImprovements = user.targetImprovements || [];
        const grammarMistakes    = user.grammarMistakes || [];
        const aiPosition         = debate.userSide === 'for' ? 'against' : 'for';
        const tzOffset           = typeof tzOffsetMinutes === 'number' ? tzOffsetMinutes : 0;

        /* ── Fetch coaching plan from ML memory service ── */
        let coachingPlan = null;
        try {
          coachingPlan = await callMLService(`/memory/coaching-plan/${socket.user.id}`, null, 'GET');
        } catch { /* non-critical */ }

        /* ── Format Engine: initialize phase state ── */
        const debateFormat = debate.format || 'freeform';
        const phaseInfo    = DebateFormatEngine.getCurrentPhaseInfo(debateFormat, 0);

        const initialParticipants = (debate.participants && debate.participants.length > 0)
          ? debate.participants.map((p) => ({
              id: p.userId ? p.userId.toString() : null,
              userId: p.userId ? p.userId.toString() : null,
              name: p.name || 'Candidate',
              avatar: p.avatar || null,
              isAI: !!p.isAI,
              roleTitle: p.roleTitle || null,
              seatNumber: p.seatNumber || 1,
            }))
          : [{
              id: socket.user.id,
              userId: socket.user.id,
              name: user?.username || socket.user.username || 'Host',
              avatar: user?.profilePicUrl || null,
              isAI: false,
              roleTitle: 'Host',
              seatNumber: 1,
            }];

        const sessionState = {
          debateId,
          userId:              debate.userId ? debate.userId.toString() : socket.user.id,
          participants:        initialParticipants,
          roomCode:            debate.roomCode || null,
          capacity:            debate.capacity || 4,
          topic:               debate.topicSnapshot,
          userSide:            debate.userSide,
          aiPosition,
          difficulty:          debate.difficulty,
          persona:             debate.persona || 'balanced',
          round:               1,
          conversationHistory: [],
          userFallacyProfile:  fallacyProfile,
          targetImprovements,
          grammarMistakes,
          weaknessSummary:     '',
          coachingPlan,
          audioBuffer:         [],
          // Addition 6: Format state
          format:              debateFormat,
          phaseIndex:          0,
          roundsInPhase:       0,
          tzOffset, // minutes, where local = UTC + tzOffsetMinutes
          preferredLang:       preferredLangIso,
          detectedLanguage:    null,
          currentLanguage:     preferredLangIso || 'en',
        };

        await redisClient.setex(
          `session:${debateId}`,
          3600,
          JSON.stringify(sessionState)
        );

        socket.join(debateId);

        socket.emit('debate_joined', {
          topic:        debate.topicSnapshot,
          userSide:     debate.userSide,
          aiPosition,
          difficulty:   debate.difficulty,
          format:       debateFormat,
          status:       debate.status || 'active',
          language:     sessionState.currentLanguage,
          roomCode:     debate.roomCode || null,
          participants: initialParticipants,
        });

        // Broadcast to all connected sockets in this debate room
        io.to(debateId).emit('gd_table_update', {
          participants: initialParticipants,
          roomCode:     debate.roomCode || null,
          capacity:     debate.capacity || 4,
          status:       debate.status || 'active',
        });

        /* ── Emit initial phase info for format debates ── */
        if (debateFormat !== 'freeform') {
          socket.emit('phase_update', {
            phase:       phaseInfo.phaseKey,
            phaseName:   phaseInfo.phaseName,
            timeLimit:   phaseInfo.timeLimit,
            instruction: phaseInfo.instruction,
            phaseNumber: phaseInfo.phaseNumber,
            totalPhases: phaseInfo.totalPhases,
            phases:      DebateFormatEngine.getPhaseList(debateFormat),
          });
        }
        emitCompletedDebateToSocket(socket, debate);
      } catch (e) {
        secLogger.error(`[WS] ERROR in join_debate:`, e);
        socket.emit('error', { message: e.message });
      }
    });

    /* ────────────────────────────────────────
       set_language — client UI override
    ─────────────────────────────────────── */
    socket.on('set_language', async ({ debateId, lang } = {}) => {
      if (!wsRateLimiter(socket, 'set_language')) return;
      try {
        const sessionRaw = await redisClient.get(`session:${debateId}`);
        // If the session doesn't exist yet, silently return.
        // This commonly happens when set_language fires before join_debate
        // has finished creating the Redis session (race condition).
        if (!sessionRaw) return;

        const session = JSON.parse(sessionRaw);
        if (session.userId !== socket.user.id) {
          return socket.emit('error', { message: 'Unauthorized' });
        }

        const iso = normalizeOptionalLang(lang);
        session.preferredLang = iso;
        session.currentLanguage = resolveActiveLanguage(session, session.detectedLanguage);

        await redisClient.setex(`session:${debateId}`, 3600, JSON.stringify(session));
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });

    /* ────────────────────────────────────────
       audio_chunk — buffer incoming PCM/webm
    ─────────────────────────────────────── */
    socket.on('audio_chunk', ({ debateId, chunk }) => {
      if (!wsRateLimiter(socket, 'audio_chunk')) return;
      try {
        if (!socket.audioBuffer) socket.audioBuffer = [];
        socket.audioBuffer.push(Buffer.from(chunk));
      } catch (e) {
        // eslint-disable-next-line no-console
        secLogger.error('[WS] audio_chunk error:', e.message);
      }
    });

    /* ────────────────────────────────────────
       audio_end — transcribe + process turn
    ─────────────────────────────────────── */
    socket.on('audio_end', async ({ debateId, transcriptFallback, mimeType } = {}) => {
      if (!wsRateLimiter(socket, 'audio_end')) return;
      if (socket._turnInFlight) {
        return socket.emit('error', { message: 'Still processing your previous turn. Please wait.' });
      }

      const sessionRaw = await redisClient.get(`session:${debateId}`);
      if (!sessionRaw) {
        const closedDebate = await Debate.findById(debateId).select('status endedAt');
        if (closedDebate && (closedDebate.status === 'completed' || closedDebate.endedAt)) {
          return socket.emit('debate_ended', {
            endedByHost: true,
            message: 'This discussion has already ended.',
          });
        }
        return socket.emit('error', { message: 'Session expired' });
      }
      const session = JSON.parse(sessionRaw);

      /* ── Ownership check: allow host or joined participants ── */
      const isAuthorizedUser =
        session.userId === socket.user.id ||
        (session.participants && session.participants.some((p) => p.id === socket.user.id));
      if (!isAuthorizedUser) {
        return socket.emit('error', { message: 'Unauthorized' });
      }
      
      const chunks = socket.audioBuffer || [];
      socket.audioBuffer = []; // Clear current buffer
      
      const currentParticipant = (session.participants || []).find((p) => (p.id || p.userId) === socket.user.id);
      const speakerName = currentParticipant?.name || socket.user.username || 'You';
      const speakerAvatar = currentParticipant?.avatar || null;
      const seatNumber = currentParticipant?.seatNumber || 1;

      /* If no audio chunks but we have a transcript fallback from SpeechRecognition,
         use it directly via transcript_direct path instead of silently dropping */
      if (chunks.length === 0) {
        const fallbackText = String(transcriptFallback || '').trim();
        if (fallbackText) {
          /* Route through processTranscript (same as transcript_direct) */
          const detectedLanguage = detectLanguageFromText(fallbackText) || session.detectedLanguage || session.currentLanguage || 'en';
          session.detectedLanguage = detectedLanguage;
          session.currentLanguage = resolveActiveLanguage(session, detectedLanguage);
          io.to(debateId).emit('transcript_final', {
            text: fallbackText,
            language: session.currentLanguage,
            speakerName,
            speakerAvatar,
            seatNumber,
            userId: socket.user.id,
          });
          socket._turnInFlight = true;
          try {
            await processTranscript(socket, session, debateId, fallbackText, speakerName);
          } finally {
            socket._turnInFlight = false;
          }
        }
        return;
      }

      session.audioBuffer = chunks;
      session.mimeType = mimeType || 'audio/webm';
      socket._turnInFlight = true;
      try {
        await processTurn(socket, session, debateId, String(transcriptFallback || '').trim());
      } finally {
        socket._turnInFlight = false;
      }
    });

    /* ────────────────────────────────────────
       transcript_direct — fallback (no MediaRecorder)
    ─────────────────────────────────────── */
    socket.on('transcript_direct', async ({ debateId, text }) => {
      if (!wsRateLimiter(socket, 'transcript_direct')) return;
      if (socket._turnInFlight) {
        return socket.emit('error', { message: 'Still processing your previous turn. Please wait.' });
      }

      const sessionRaw = await redisClient.get(`session:${debateId}`);
      if (!sessionRaw) {
        const closedDebate = await Debate.findById(debateId).select('status endedAt');
        if (closedDebate && (closedDebate.status === 'completed' || closedDebate.endedAt)) {
          return socket.emit('debate_ended', {
            endedByHost: true,
            message: 'This discussion has already ended.',
          });
        }
        return;
      }
      const session = JSON.parse(sessionRaw);

      /* ── Ownership check: allow host or joined participants ── */
      const isAuthorizedUser =
        session.userId === socket.user.id ||
        (session.participants && session.participants.some((p) => p.id === socket.user.id));
      if (!isAuthorizedUser) {
        return socket.emit('error', { message: 'Unauthorized' });
      }

      if (!String(text || '').trim()) {
        return socket.emit('error', { message: 'Could not transcribe. Please try again.' });
      }

      const currentParticipant = (session.participants || []).find((p) => (p.id || p.userId) === socket.user.id);
      const speakerName = currentParticipant?.name || socket.user.username || 'You';
      const speakerAvatar = currentParticipant?.avatar || null;
      const seatNumber = currentParticipant?.seatNumber || 1;

      const detectedLanguage = detectLanguageFromText(text) || session.detectedLanguage || session.currentLanguage || 'en';
      session.detectedLanguage = detectedLanguage;
      session.currentLanguage = resolveActiveLanguage(session, detectedLanguage);

      io.to(debateId).emit('transcript_final', {
        text,
        language: session.currentLanguage,
        speakerName,
        speakerAvatar,
        seatNumber,
        userId: socket.user.id,
      });
      socket._turnInFlight = true;
      try {
        await processTranscript(socket, session, debateId, text, speakerName);
      } finally {
        socket._turnInFlight = false;
      }
    });

    /* ────────────────────────────────────────
       gd_starting_countdown — broadcast 3s lobby countdown to all peers
    ─────────────────────────────────────── */
    socket.on('gd_starting_countdown', async ({ debateId, seconds = 3 } = {}) => {
      if (!debateId) return;
      io.to(debateId).emit('gd_starting_countdown', {
        debateId,
        seconds,
      });
    });

    /* ────────────────────────────────────────
       end_debate — manual end by user
    ─────────────────────────────────────── */
    socket.on('end_debate', async ({ debateId, tzOffsetMinutes }) => {
      if (!wsRateLimiter(socket, 'end_debate')) return;
      if (!debateId) return;
      if (endingDebates.has(debateId)) return;
      endingDebates.add(debateId);

      try {
        // Ensure any just-completed turn finishes persisting before checking arguments.length
        const pendingSave = pendingTurnSaves.get(debateId);
        if (pendingSave) {
          await pendingSave.catch(() => {});
        }

        /* Store user timezone offset for streak calculation */
        const tzOffset = typeof tzOffsetMinutes === 'number' ? tzOffsetMinutes : 0;

        /* ── Ownership check on debate document ── */
        const debate = await Debate.findOne({ _id: debateId, userId: socket.user.id });
        if (!debate) {
          socket.emit('error', { message: 'Debate not found' });
          return;
        }

        // If debate already ended (e.g. reconnect or double-tap), return the saved verdict/result
        if (emitCompletedDebateToSocket(socket, debate)) {
          await redisClient.del(`session:${debateId}`).catch(() => {});
          return;
        }

        const sessionRaw = await redisClient.get(`session:${debateId}`);
        let session = sessionRaw ? JSON.parse(sessionRaw) : null;
        if (session && session.userId !== socket.user.id) {
          return socket.emit('error', { message: 'Unauthorized' });
        }

        // Reconstruct minimal session from MongoDB if Redis session expired/evicted
        if (!session) {
          session = {
            debateId,
            userId: socket.user.id,
            topic: debate.topicSnapshot,
            userSide: debate.userSide,
            aiPosition: debate.userSide === 'for' ? 'against' : 'for',
            difficulty: debate.difficulty,
            persona: debate.persona || 'balanced',
            format: debate.format || 'freeform',
            round: (debate.totalRounds || 0) + 1,
            phaseIndex: 0,
            currentLanguage: debate.language || 'en',
            participants: (debate.participants || []).map((p) => ({
              id: p.userId ? p.userId.toString() : null,
              userId: p.userId ? p.userId.toString() : null,
              name: p.name || 'Candidate',
              avatar: p.avatar || null,
              isAI: !!p.isAI,
              roleTitle: p.roleTitle || null,
              seatNumber: p.seatNumber || 1,
            })),
            tzOffset,
          };
        }

        if (debate.arguments.length >= 2) {
          let isForfeit = false;
          // Determine if user ended debate before completing required rounds/phases
          if (session.format === 'freeform' && session.round <= MAX_ROUNDS) {
            isForfeit = true;
          } else if (session.format !== 'freeform' && session.phaseIndex !== -1) {
            isForfeit = true;
          }
          await runJudgeScoring(socket, session, debateId, isForfeit, tzOffset);
          await redisClient.del(`session:${debateId}`).catch(() => {});
          return;
        }
        /* Too few arguments for a proper judge evaluation — instant forfeit */
        const winner = 'ai';
        const result = await finalizeDebate(socket.user.id, debateId, winner, 0, tzOffset);
        const endPayload = {
          winner,
          userFinalScore: result?.avgScore ?? 0,
          forfeit: true,
          endedByHost: true,
          message: debate.format === 'group_discussion'
            ? 'The host ended the Group Discussion.'
            : 'Debate ended early.',
        };
        io.to(debateId).emit('debate_ended', endPayload);
        if (!socket.rooms?.has(debateId)) {
          socket.emit('debate_ended', endPayload);
        }
        await redisClient.del(`session:${debateId}`).catch(() => {});
      } catch (e) {
        socket.emit('error', { message: e.message });
      } finally {
        endingDebates.delete(debateId);
      }
    });


    socket.on('disconnect', () => {
      // Clean up connection tracking
      const userId = socket.user?.id;
      if (userId && userConnections.has(userId)) {
        const conns = userConnections.get(userId);
        conns.delete(socket.id);
        if (conns.size === 0) userConnections.delete(userId);
      }
      // eslint-disable-next-line no-console

    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   processTurn — transcribe audio then hand off to processTranscript
═══════════════════════════════════════════════════════════════ */
async function processTurn(socket, session, debateId, transcriptFallback = '') {
  try {
    /* Reconstruct audio blob from stored chunks */
    const storedChunks = session.audioBuffer.map((b) => Buffer.from(b));
    const audioBuffer  = Buffer.concat(storedChunks);
    session.audioBuffer = [];  // clear to save Redis space

    let transcript = '';
    let detectedLanguage = session.detectedLanguage || session.currentLanguage || 'en';

    /* Try ML transcription first; gracefully fall back to browser transcript */
    if (audioBuffer.length > 1000) {
      try {
        const result = await transcribeAudio(audioBuffer, session.topic, session.mimeType);
        transcript   = result.text;
        detectedLanguage = result.language || detectedLanguage;
        // Second-pass text script check for non-English characters
        if (transcript) {
          const textDetected = detectLanguageFromText(transcript);
          if (textDetected !== 'en') {
            detectedLanguage = textDetected;
          }
        }
      } catch (mlErr) {
        // ML service is unreachable — fall through to transcriptFallback
        secLogger.warn(`[WS] ML transcription failed (${mlErr.message}), using browser fallback`);
      }
    }

    if (!transcript.trim() && transcriptFallback) {
      transcript = transcriptFallback;
      detectedLanguage = detectLanguageFromText(transcriptFallback) || detectedLanguage;

    }

    if (!transcript.trim()) {
      socket.emit('error', { message: 'Could not transcribe audio. Please speak louder or type your argument.' });
      return;
    }

    /* Store detected language on session for AI response language */
    session.detectedLanguage = detectedLanguage;
    session.currentLanguage = resolveActiveLanguage(session, detectedLanguage);

    const currentParticipant = (session.participants || []).find((p) => (p.id || p.userId) === socket.user.id);
    const speakerName = currentParticipant?.name || socket.user?.username || 'You';
    const speakerAvatar = currentParticipant?.avatar || null;
    const seatNumber = currentParticipant?.seatNumber || 1;

    const roomTarget = socket._io ? socket._io.to(debateId) : socket;
    roomTarget.emit('transcript_final', {
      text: transcript,
      language: session.currentLanguage,
      speakerName,
      speakerAvatar,
      seatNumber,
      userId: socket.user?.id || null,
    });
    await processTranscript(socket, session, debateId, transcript, speakerName);
  } catch (e) {
    // eslint-disable-next-line no-console
    secLogger.error('[WS] processTurn error:', e);
    socket.emit('error', { message: 'Processing error. Please try again.' });
  }
}

/* ═══════════════════════════════════════════════════════════════
   processTranscript — ML pipeline → GPT-4 stream → TTS stream
═══════════════════════════════════════════════════════════════ */
async function processTranscript(socket, session, debateId, transcript, speakerName = null) {
  const roomTarget = socket._io ? socket._io.to(debateId) : socket;
  try {
    session.currentLanguage = resolveActiveLanguage(session);
    roomTarget.emit('ai_thinking', { language: session.currentLanguage });

    const historyCtx = session.conversationHistory.slice(-4).map((m) => m.content);

    /* ── 1. Run ML tasks in parallel via specialized services ── */
    let fallacyResult = {};
    const fallacyPromise = fallacyService.detectFallacy({
      argument: transcript,
      context:  historyCtx,
      userId:   session.userId,
    }).then((res) => {
      if (res?.detected) socket.emit('fallacy_detected', res);
      if (res) fallacyResult = res;
    }).catch(err => secLogger.error('[WS] Fallacy error:', err.message));

    let scoresResult = {};
    const scorerPromise = scoringService.scoreArgument({
      argument:    transcript,
      topic:       session.topic,
      context:     historyCtx,
      turnNumber: session.round,
    }).then(async (res) => {
      if (res) {
        // Evaluate semantic relevance rapidly (Logic score adjustment if off-topic)
        // checkRelevanceWithLLM is still in llm.service or move to scoring?
        // For now keep it as is but via orchestrator later.
        socket.emit('scores_update', res);
        scoresResult = res;

        // Record score to time-series analytics
        const overall = Math.round(((res.logic || 0) + (res.evidence || 0) + (res.clarity || 0)) / 3);
        timeSeries.recordDebateScore(session.userId, overall, session.format).catch(() => {});
      }
    }).catch(err => secLogger.error('[WS] Scorer error:', err.message));

    const weaknessPromise = callMLService(`/memory/weaknesses/${session.userId}`, null, 'GET')
      .then((res) => {
        if (res?.weakness_summary) session.weaknessSummary = res.weakness_summary;
      }).catch(err => secLogger.error('[WS] Weakness error:', err.message));

    // ensure errors don't crash
    Promise.allSettled([fallacyPromise, scorerPromise, weaknessPromise]);

    /* ── 5. Append user turn to history ── */
    const historyContent = session.format === 'group_discussion' && speakerName
      ? `${speakerName}: ${transcript}`
      : transcript;
    session.conversationHistory.push({ role: 'user', content: historyContent });
    session.conversationHistory = trimHistory(session.conversationHistory);

    /* ── 5.5 Inject phase-specific prompt (Addition 6) ── */
    const phasePrompt = DebateFormatEngine.getPhaseSystemPromptAddition(
      session.format || 'freeform',
      session.phaseIndex || 0,
      session.userSide,
      session.participants || []
    );
    if (phasePrompt) {
      // Temporarily inject phase context into session for buildSystemPrompt
      session._phasePromptAddition = phasePrompt;
    }

    /* ── 6. Stream LLM + sentence-level TTS (with 45s timeout) ── */
    let fullAiText    = '';
    let cleanAiText   = '';
    let sentenceBuffer = '';
    let streamTimedOut = false;

    const targetLang = resolveActiveLanguage(session);
    const turnId = `turn-${session.round}-${Date.now()}`;
    session._currentTurnId = turnId;

    // *** CRITICAL: Suppress raw English streaming for non-English debates ***
    // The LLM (llama3) generates primarily in English. For non-English targets,
    // we MUST NOT stream raw chunks to the UI — the user would see English text.
    // Instead, show a single placeholder bubble. The final translated text is
    // delivered via ai_turn_complete.
    const suppressRawStream = !!(targetLang && targetLang !== 'en');

    if (suppressRawStream) {
      roomTarget.emit('ai_text_chunk', { text: '\u2026', isPlaceholder: true, turnId });
    }

    // Strip parenthetical meta-notes Ollama tends to add e.g. "(Note: I've used the APA study...)"
    function sanitizeAiChunk(text) {
      return text
        .replace(/\([^)]{0,300}\)/g, ' ')   // remove (Note: ...) style asides
        .replace(/\[[^\]]{0,300}\]/g, ' ')   // remove [Note: ...] style asides
        .replace(/\s{2,}/g, ' ');            // collapse double spaces
    }

    const streamTimeout = setTimeout(() => { streamTimedOut = true; }, 45000);
    try {
      // Use the AI Orchestrator for the response stream (handles failover)
      for await (const chunk of aiOrchestrator.streamResponse(session, transcript)) {
        if (streamTimedOut) {
          secLogger.warn('[WS] LLM stream exceeded 45s timeout, aborting');
          break;
        }
        fullAiText += chunk; // keep raw text for conversation history
        const cleanChunk = sanitizeAiChunk(chunk);
        cleanAiText += cleanChunk;
        sentenceBuffer += cleanChunk;

        // *** Only stream raw chunks when language is English ***
        if (!suppressRawStream && cleanChunk.trim()) {
          roomTarget.emit('ai_text_chunk', { text: cleanChunk, turnId });
        }

        // *** Only do sentence-level TTS for English ***
        // For non-English, TTS happens AFTER translation below.
        if (!suppressRawStream && /[.!?]\s*$/.test(sentenceBuffer.trim())) {
          streamTTSToSocket(socket, sentenceBuffer.trim()).catch((e) => secLogger.error(e.message, e));  // eslint-disable-line no-console
          sentenceBuffer = '';
        }
      }
    } finally {
      clearTimeout(streamTimeout);
    }

    // Flush trailing English TTS (only for English debates)
    if (!suppressRawStream && sentenceBuffer.trim()) {
      await streamTTSToSocket(socket, sentenceBuffer.trim());
    }


    // Clean up temp phase prompt
    delete session._phasePromptAddition;

    /* ── 7. Append AI turn to history ── */
    session.conversationHistory.push({ role: 'assistant', content: fullAiText });

    /* ── 8. Persist updated session and unblock the UI immediately ── */
    session.round++;

    /* ── 10.5 Phase advancement (Addition 6) ── */
    const fmt = session.format || 'freeform';
    if (fmt !== 'freeform') {
      session.roundsInPhase = (session.roundsInPhase || 0) + 1;

      if (DebateFormatEngine.shouldAdvancePhase(fmt, session.phaseIndex || 0, session.roundsInPhase)) {
        const nextIdx = DebateFormatEngine.getNextPhaseIndex(fmt, session.phaseIndex || 0);

        if (nextIdx === -1) {
          // Debate ended
          session.phaseIndex = -1;
        } else {
          session.phaseIndex = nextIdx;
          session.roundsInPhase = 0;

          const nextInfo = DebateFormatEngine.getCurrentPhaseInfo(fmt, nextIdx);

          if (nextInfo.phaseKey === 'judging') {
            // Trigger AI judge scoring
            await runJudgeScoring(socket, session, debateId, false, session.tzOffset || 0);
          } else {
            roomTarget.emit('phase_update', {
              phase:       nextInfo.phaseKey,
              phaseName:   nextInfo.phaseName,
              timeLimit:   nextInfo.timeLimit,
              instruction: nextInfo.instruction,
              phaseNumber: nextInfo.phaseNumber,
              totalPhases: nextInfo.totalPhases,
              phases:      DebateFormatEngine.getPhaseList(fmt),
            });
          }
        }
      }
    }

    let finalText = (cleanAiText || fullAiText).trim();

    // *** ALWAYS translate for non-English debates — BUT skip if Gemini already
    //     generated directly in the target language (saves 5-10s) ***
    if (targetLang && targetLang !== 'en') {
      // Quick script check: is the response already in the target language?
      const alreadyInTarget = (() => {
        const SCRIPT_CHECKS = {
          te: /[\u0C00-\u0C7F]/, ta: /[\u0B80-\u0BFF]/, kn: /[\u0C80-\u0CFF]/,
          ml: /[\u0D00-\u0D7F]/, hi: /[\u0900-\u097F]/, mr: /[\u0900-\u097F]/,
          bn: /[\u0980-\u09FF]/, gu: /[\u0A80-\u0AFF]/, pa: /[\u0A00-\u0A7F]/,
          ur: /[\u0600-\u06FF]/, ar: /[\u0600-\u06FF]/, zh: /[\u4E00-\u9FFF]/,
          ja: /[\u3040-\u309F\u30A0-\u30FF]/, ko: /[\uAC00-\uD7AF]/,
          ru: /[\u0400-\u04FF]/,
        };
        const pattern = SCRIPT_CHECKS[targetLang];
        if (!pattern) return false; // Can't check Latin-script languages
        // If >40% of non-ASCII chars are in target script, it's already translated
        const nonAscii = finalText.replace(/[\x00-\x7F\s]/g, '');
        if (nonAscii.length < 5) return false;
        const matches = (nonAscii.match(new RegExp(pattern.source, 'g')) || []).length;
        return (matches / nonAscii.length) > 0.4;
      })();

      if (alreadyInTarget) {

      } else {
        socket.emit('ai_translating', { language: translationService.getLanguageName(targetLang) });
        try {
          const translated = await translationService.translate(finalText, targetLang);
          if (translated && translated.trim().length > 0) {
            finalText = translated.trim();
          }
        } catch (e) {
          secLogger.error('[WS] Translation failed, sending original response:', e.message); // eslint-disable-line no-console
        }
      }
      // Send TTS for the final text (whether translated or already in target language)
      streamTTSToSocket(socket, finalText).catch((e) => secLogger.error(e.message, e)); // eslint-disable-line no-console
    }

    session.conversationHistory[session.conversationHistory.length - 1] = {
      role: 'assistant',
      content: finalText,
    };

    // Save session — wrapped so Redis failure never blocks ai_turn_complete
    try {
      await redisClient.setex(`session:${debateId}`, 3600, JSON.stringify(session));
    } catch (redisErr) {
      secLogger.warn('[WS] Redis session save failed (non-fatal):', redisErr.message);
    }

    /* ── 9. Signal turn complete — ALWAYS fires regardless of upstream errors ── */
    roomTarget.emit('ai_turn_complete', {
      fullText: finalText,
      round: session.round,
      detectedLanguage: targetLang || session.currentLanguage || session.detectedLanguage || 'en',
      turnId: session._currentTurnId || null,
    });
    // Clear the turnId after use
    delete session._currentTurnId;

    const savePromise = Promise.allSettled([fallacyPromise, scorerPromise]).then(async () => {
      try {
        const speakerUserId = socket.user?.id || null;
        await saveTurnToMongo(debateId, transcript, finalText, session.round - 1, scoresResult, fallacyResult, speakerUserId, speakerName);

        const targetStatsUserId = speakerUserId || session.userId;
        if (scoresResult && (scoresResult.logic || scoresResult.evidence || scoresResult.clarity)) {
          User.findByIdAndUpdate(targetStatsUserId, {
            $inc: {
              totalLogicScore:    scoresResult.logic    || 0,
              totalEvidenceScore: scoresResult.evidence || 0,
              totalClarityScore:  scoresResult.clarity  || 0,
              totalScoredTurns:   1,
            },
          }).catch((e) => secLogger.error(e.message, e));  // eslint-disable-line no-console
        }

        callMLService('/memory/store', {
          user_id:       session.userId,
          argument_text: transcript,
          scores:        scoresResult,
          fallacy_type:  fallacyResult?.fallacy_type || 'no_fallacy',
          topic:         session.topic,
          debate_id:     debateId,
          turn_number:   session.round - 1,
        }).catch((e) => secLogger.error(e.message, e));  // eslint-disable-line no-console
      } catch (persistErr) {
        secLogger.error('[WS] Deferred persistence error:', persistErr); // eslint-disable-line no-console
      }
    }).finally(() => {
      if (pendingTurnSaves.get(debateId) === savePromise) {
        pendingTurnSaves.delete(debateId);
      }
    });
    pendingTurnSaves.set(debateId, savePromise);

    /* ── 10. Auto-end after MAX_ROUNDS (freeform only) ── */
    if (fmt === 'freeform' && session.round > MAX_ROUNDS) {
      // Instead of calculating scores locally, use the unified LLM judge for the Report Card
      await runJudgeScoring(socket, session, debateId, false, session.tzOffset || 0);
      await redisClient.del(`session:${debateId}`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    secLogger.error('[WS] processTranscript error:', e);
    const isQuota   = e.message?.startsWith('QUOTA_EXHAUSTED');
    const isOffline = e.message?.includes('AI service is offline') || e.message?.includes('AI_SERVICE_OFFLINE');
    let userMessage = 'Error generating AI response. Please try again.';
    if (isQuota) {
      userMessage = 'AI rate limit reached. Please wait 1–2 minutes and try again.';
    } else if (isOffline) {
      userMessage = 'AI service is currently offline. Please ensure Ollama is running and try again.';
    }
    socket.emit('error', { message: userMessage });
  }
}

/* ═══════════════════════════════════════════════════════════════
   runJudgeScoring — AI judge evaluates the full debate (Addition 6)
═══════════════════════════════════════════════════════════════ */
async function runJudgeScoring(socket, session, debateId, isForfeit = false, tzOffset = 0) {
  try {
    const debate = await Debate.findById(debateId);
    if (!debate) return;

    // Extract fallacies from the debate arguments identified by ML
    const userArgs = debate.arguments.filter(a => a.speaker === 'user');
    const userFallacies = userArgs
      .filter(a => a.fallacy && a.fallacy.detected && a.fallacy.type)
      .map(a => a.fallacy.type.replace(/_/g, ' '));
    const uniqueFallacies = [...new Set(userFallacies)];

    // Calculate Average ML Scores for the user
    const scoredArgs = userArgs.filter(a => a.scores && a.scores.overall != null);
    let avgLogic = 0;
    let avgEvidence = 0;
    let avgClarity = 0;
    let avgOverall = 0;

    if (scoredArgs.length > 0) {
      avgLogic = Math.round(scoredArgs.reduce((sum, a) => sum + (a.scores.logic || 0), 0) / scoredArgs.length);
      avgEvidence = Math.round(scoredArgs.reduce((sum, a) => sum + (a.scores.evidence || 0), 0) / scoredArgs.length);
      avgClarity = Math.round(scoredArgs.reduce((sum, a) => sum + (a.scores.clarity || 0), 0) / scoredArgs.length);
      avgOverall = Math.round(scoredArgs.reduce((sum, a) => sum + (a.scores.overall || 0), 0) / scoredArgs.length);
    }

    let mlScoresText = '';
    if (scoredArgs.length > 0) {
      mlScoresText = `
REAL-TIME ML SCORES (Out of 100):
Our real-time analytics engine has already scored the user's arguments across the debate.
- Logic Score: ${avgLogic}
- Evidence Score: ${avgEvidence}
- Clarity Score: ${avgClarity}
- Overall ML Average: ${avgOverall}

CRITICAL: Your final 'userScore' MUST be closely aligned with this Overall ML Average (${avgOverall}). Do not invent a vastly different score. Base your qualitative feedback (strengths/weaknesses) heavily on these dimensions (e.g., if the Evidence score is low, critique their lack of factual backing).`;
    } else {
      mlScoresText = `
No real-time ML scores are available for this debate. You must determine the user's score entirely based on the transcript.`;
    }

    let forfeitContext = '';
    if (isForfeit) {
      forfeitContext = `\n\nCRITICAL CONTEXT: The user FORFEITED the debate by ending it early before all rounds were completed. Therefore, you MUST declare the "ai" as the winner and heavily penalize the user's score for quitting early.`;
    }

    const isGD = session.format === 'group_discussion';
    const humanParticipants = (debate.participants || []).filter((p) => !p.isAI && p.userId);
    const isMultiplayerGD = isGD && humanParticipants.length > 1;

    let perParticipantBreakdown = '';
    if (isMultiplayerGD) {
      perParticipantBreakdown = '\n\nINDIVIDUAL HUMAN PARTICIPANT DATA:\n' + humanParticipants.map((p) => {
        const uid = p.userId.toString();
        const pArgs = userArgs.filter(
          (a) => (a.speakerUserId && a.speakerUserId.toString() === uid) || (a.speakerName && a.speakerName === p.name)
        );
        const pScored = pArgs.filter((a) => a.scores && a.scores.overall != null);
        const pAvg = pScored.length
          ? Math.round(pScored.reduce((s, a) => s + (a.scores.overall || 0), 0) / pScored.length)
          : (pArgs.length ? 65 : 20);
        const pLogic = pScored.length
          ? Math.round(pScored.reduce((s, a) => s + (a.scores.logic || 0), 0) / pScored.length)
          : pAvg;
        const pEvidence = pScored.length
          ? Math.round(pScored.reduce((s, a) => s + (a.scores.evidence || 0), 0) / pScored.length)
          : pAvg;
        const pClarity = pScored.length
          ? Math.round(pScored.reduce((s, a) => s + (a.scores.clarity || 0), 0) / pScored.length)
          : pAvg;
        return `- User "${p.name}" (userId: "${uid}", Seat ${p.seatNumber}): spoke ${pArgs.length} time(s). ML Avg=${pAvg}, Logic=${pLogic}, Evidence=${pEvidence}, Clarity=${pClarity}.`;
      }).join('\n');
    }

    const gdPromptContext = isGD
      ? `\n\nCAMPUS PLACEMENT & GROUP DISCUSSION EVALUATION:
This session is a simulated 4-person Campus Placement / MBA Admissions Group Discussion.
In addition to the standard fields, you MUST evaluate the candidate's performance as a Senior Campus Recruiter and include a "gdVerdict" object in the JSON with:
- "status": "SELECTED" (if userScore >= 75), "WAITLISTED" (if userScore between 60 and 74), or "REJECTED" (if userScore < 60)
- "selectionTitle": "Selected for Round 2 (Technical & HR Interview)" or "Waitlisted for Placement Review" or "Needs Improvement in Argument Structure"
- "entryTimingScore": score out of 100 on how effectively they timed their entrances and interjections
- "contentDepthScore": score out of 100 on facts, market data, and depth of arguments
- "listeningSynthesisScore": score out of 100 on actively listening, synthesizing peers' points, and avoiding talking over others
- "leadershipScore": score out of 100 on group moderation, steering discussions back on track, and building consensus
- "panelRemarks": 2-3 sentences of direct, actionable recruiter feedback on hiring potential.${isMultiplayerGD ? `

MULTIPLAYER INDIVIDUAL EVALUATION REQUIREMENT:
Because multiple real human students participated in this GD, you MUST ALSO include a top-level "participantVerdicts" JSON object keyed by each user's exact "userId" string shown above. Each entry MUST have the exact same schema (userScore, aiScore, winner, reportCardHeadline, feedback, userStrengths, userWeaknesses, areasToImprove, grammarMistakes, fallacies, gdVerdict) reflecting ONLY that specific student's spoken turns and weaknesses! If a student spoke 0 times, score them low (<40) and explain they need to speak up in GDs.${perParticipantBreakdown}` : ''}`
      : '';

    const judgePrompt = `You are an impartial debate judge and corporate evaluator.
Review this complete debate transcript and score both sides.${forfeitContext}${gdPromptContext}

TOPIC: ${session.topic}
USER POSITION: ${session.userSide}
AI POSITION: ${session.aiPosition}
FORMAT: ${session.format}

FULL TRANSCRIPT:
${debate.arguments.map(a =>
  `[${(a.speakerName || a.speaker).toUpperCase()}]: ${a.content}`
).join('\n\n')}
${mlScoresText}

Provide a strict but constructive report card for the user.
Identify their strongest points, their weakest habits, grammatical mistakes, and the exact things they must improve next time.
The following fallacies were identified by our ML model during the debate: ${uniqueFallacies.length ? uniqueFallacies.join(', ') : 'None detected'}. You MUST incorporate these into your critique and include them in the JSON output under 'fallacies' if they appear in the transcript.
Do not soften recurring weaknesses. If the same weakness appears multiple times, stress that they must fix it.

Respond ONLY in this JSON format:
{
  "reportCardHeadline": "Your clearest weakness tonight was weak rebuttal targeting.",
  "userScore": 72,
  "aiScore": 68,
  "winner": ${isForfeit ? '"ai"' : '"user"'},
  "feedback": "The user demonstrated stronger evidence use...",
  "userStrengths": "Clear structure, good use of statistics...",
  "userWeaknesses": "Could improve rebuttal directness...",
  "areasToImprove": ["Rebuttals need more evidence", "Avoid ad hominem attacks"],
  "grammarMistakes": ["'their' instead of 'there'", "missing commas in compound sentences"],
  "fallacies": ["hasty generalization", "ad hominem"]${isGD ? `,
  "gdVerdict": {
    "status": "SELECTED",
    "selectionTitle": "Selected for Round 2 (Technical & HR Interview)",
    "entryTimingScore": 86,
    "contentDepthScore": 82,
    "listeningSynthesisScore": 88,
    "leadershipScore": 84,
    "panelRemarks": "Strong articulation and respectful mediation between polarizing viewpoints."
  }` : ''}
}`;

    // Use the AI Orchestrator to get judge response (cascading failover),
    // falling back to ML scores if all AI providers fail.
    let judgeText = '';
    try {
      for await (const chunk of aiOrchestrator.streamResponse(
        { ...session, round: 1, conversationHistory: [] },
        judgePrompt
      )) {
        judgeText += chunk;
      }
    } catch (llmErr) {
      secLogger.warn('[WS] Judge LLM failed, using ML score fallback:', llmErr.message);
    }

    // Parse JSON from response (or build fallback from ML scores)
    let judgeResponse;
    try {
      if (!judgeText.trim()) throw new Error('Empty judge response');
      // Try to extract JSON from the response
      const jsonMatch = judgeText.match(/\{[\s\S]*\}/);
      judgeResponse = JSON.parse(jsonMatch ? jsonMatch[0] : judgeText);
    } catch {
      const fallbackUserScore = scoredArgs.length > 0 ? avgOverall : (isForfeit ? 45 : 65);
      const fallbackAiScore = isForfeit ? Math.max(70, fallbackUserScore + 10) : 60;
      const fallbackWinner = isForfeit ? 'ai' : (fallbackUserScore >= fallbackAiScore ? 'user' : 'ai');
      judgeResponse = {
        reportCardHeadline: isForfeit
          ? 'Debate ended early — complete all rounds for a higher score.'
          : 'You finished the debate — keep sharpening your evidence and rebuttals.',
        userScore: fallbackUserScore,
        aiScore: fallbackAiScore,
        winner: fallbackWinner,
        feedback: judgeText.trim() || (scoredArgs.length > 0
          ? `Score calculated from your ${scoredArgs.length} argument(s): Logic ${avgLogic}/100, Evidence ${avgEvidence}/100, Clarity ${avgClarity}/100.`
          : 'Debate concluded. Continue supporting claims with clear evidence and direct rebuttals.'),
        userStrengths: avgLogic >= avgEvidence ? 'Consistent logical structure.' : 'Good supporting points.',
        userWeaknesses: avgEvidence < 65 ? 'Back claims with concrete facts and examples.' : 'Tighten counter-rebuttals.',
        areasToImprove: avgEvidence < 65 ? ['Include more specific evidence or data'] : ['Sharpen rebuttal focus'],
        grammarMistakes: [],
        fallacies: uniqueFallacies,
      };
    }

    const rawParticipantVerdicts = (judgeResponse && typeof judgeResponse.participantVerdicts === 'object' && judgeResponse.participantVerdicts)
      ? judgeResponse.participantVerdicts
      : {};

    judgeResponse = sanitizeJudgeResponse(judgeResponse, judgeText);

    const participantVerdicts = {};
    if (isGD && humanParticipants.length > 0) {
      for (const p of humanParticipants) {
        const uid = p.userId.toString();
        const pArgs = userArgs.filter(
          (a) => (a.speakerUserId && a.speakerUserId.toString() === uid) || (a.speakerName && a.speakerName === p.name)
        );
        const pScored = pArgs.filter((a) => a.scores && a.scores.overall != null);
        const fallbackScore = pScored.length
          ? Math.round(pScored.reduce((s, a) => s + (a.scores.overall || 0), 0) / pScored.length)
          : (pArgs.length ? (judgeResponse.userScore || 65) : 35);

        const rawPv = rawParticipantVerdicts[uid];
        const fallbackPv = {
          userScore: fallbackScore,
          aiScore: judgeResponse.aiScore || 65,
          winner: (isForfeit ? 'ai' : (fallbackScore >= 60 ? 'user' : 'ai')),
          reportCardHeadline: pArgs.length > 0
            ? `${p.name}: You made ${pArgs.length} contribution(s) — focus on structured data & stronger counter-rebuttals.`
            : `${p.name}: You stayed quiet during the Group Discussion. Active entry and speaking up are essential!`,
          feedback: pArgs.length > 0
            ? `Based on ${p.name}'s ${pArgs.length} turn(s), average logic/evidence/clarity score was ${fallbackScore}/100.`
            : `${p.name} did not contribute spoken/written points during the GD rounds.`,
          userStrengths: pArgs.length > 0 ? 'Attentive to the ongoing group thread.' : 'Observed peer flow.',
          userWeaknesses: pArgs.length > 0 ? 'Could interject more decisively with factual evidence.' : 'Zero verbal/text participation recorded.',
          areasToImprove: pArgs.length > 0 ? ['Quote concrete facts', 'Interject proactively'] : ['Initiate at least 1–2 clear points per round'],
          grammarMistakes: [],
          fallacies: pArgs.filter((a) => a.fallacy?.detected && a.fallacy?.type).map((a) => a.fallacy.type.replace(/_/g, ' ')),
          gdVerdict: {
            status: fallbackScore >= 75 ? 'SELECTED' : fallbackScore >= 60 ? 'WAITLISTED' : 'REJECTED',
            selectionTitle: fallbackScore >= 75 ? 'Selected for Round 2' : fallbackScore >= 60 ? 'Waitlisted for Review' : 'Needs Improvement',
            entryTimingScore: pArgs.length ? fallbackScore : 25,
            contentDepthScore: pArgs.length ? fallbackScore : 25,
            listeningSynthesisScore: pArgs.length ? Math.min(100, fallbackScore + 5) : 40,
            leadershipScore: pArgs.length ? fallbackScore : 20,
            panelRemarks: pArgs.length > 0 ? 'Good participation; sharpen factual backing.' : 'Step into the discussion early to demonstrate leadership.',
          },
        };

        const sanitizedPv = rawPv
          ? sanitizeJudgeResponse({ ...fallbackPv, ...rawPv }, JSON.stringify(rawPv))
          : fallbackPv;
        if (!sanitizedPv.gdVerdict) sanitizedPv.gdVerdict = fallbackPv.gdVerdict;

        participantVerdicts[uid] = sanitizedPv;
        p.score = sanitizedPv.userScore;
        p.verdict = sanitizedPv.gdVerdict?.status || null;
        p.feedback = sanitizedPv.feedback || null;
        p.judgeScoreSnapshot = sanitizedPv;

        // Save individualized weaknesses/focus areas for this user
        await persistReportCard(uid, sanitizedPv).catch(() => {});
      }
    }

    const hostVerdict = participantVerdicts[session.userId] || judgeResponse;
    const persistedProfile = await persistReportCard(session.userId, hostVerdict).catch(() => ({
      savedFocusAreas: [],
      savedGrammarPatterns: [],
    }));

    await Debate.findByIdAndUpdate(debateId, {
      judgeScore: hostVerdict,
      participants: debate.participants,
      currentPhase: 'judging',
      status: 'completed',
    });

    // Process final stats (wins, streaks, etc.) for host — non-fatal so verdict still delivers
    let streakResult = {};
    try {
      const statsResult = await finalizeDebate(session.userId, debateId, hostVerdict.winner, 0, tzOffset);
      streakResult = statsResult?.streakResult || {};
    } catch (finErr) {
      secLogger.warn('[WS] finalizeDebate fallback after judgeScore save:', finErr.message);
      await Debate.findByIdAndUpdate(debateId, {
        winner: hostVerdict.winner,
        userFinalScore: hostVerdict.userScore ?? 0,
        endedAt: new Date(),
        status: 'completed',
      }).catch(() => {});
    }

    const verdictPayload = {
      ...hostVerdict,
      participantVerdicts,
      endedByHost: true,
      savedFocusAreas: persistedProfile.savedFocusAreas,
      savedGrammarPatterns: persistedProfile.savedGrammarPatterns,
      streak: {
        new:              streakResult.newStreak        || 0,
        milestoneReached: streakResult.milestoneReached || null,
        freezeUsed:       streakResult.freezeUsed       || false,
      },
    };

    // Emit judge results to EVERYONE in the debate room AND directly to caller if not in room
    const roomTarget = socket._io ? socket._io.to(debateId) : socket;
    roomTarget.emit('judge_verdict', verdictPayload);
    if (socket._io && !socket.rooms?.has(debateId)) {
      socket.emit('judge_verdict', verdictPayload);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    secLogger.error('[WS] Judge scoring error:', e.message);
    socket.emit('error', { message: 'Judge scoring failed.' });
  }
}

/* ═══════════════════════════════════════════════════════════════
   Helper: Whisper transcription
═══════════════════════════════════════════════════════════════ */
async function transcribeAudio(audioBuffer, topic, mimeType = 'audio/webm') {
  const FormData = require('form-data');
  const form     = new FormData();

  let ext = 'webm';
  const cleanMime = String(mimeType || '').toLowerCase();
  if (cleanMime.includes('mp4') || cleanMime.includes('m4a')) ext = 'mp4';
  else if (cleanMime.includes('wav')) ext = 'wav';
  else if (cleanMime.includes('mpeg') || cleanMime.includes('mp3')) ext = 'mp3';
  else if (cleanMime.includes('aac')) ext = 'aac';

  form.append('file', audioBuffer, {
    filename:    `debate.${ext}`,
    contentType: mimeType || 'audio/webm',
  });
  if (topic) {
    form.append('topic', topic);
  }

  const response = await callMLService('/transcription/transcribe', form);
  return { text: response.text || '', language: response.language || 'en' };
}

/* ═══════════════════════════════════════════════════════════════
   Helper: TTS (handled client-side via Web Speech API)
═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line no-unused-vars
async function streamTTSToSocket(_socket, _text) {
  /* TTS is handled on the frontend using the Web Speech API. */
}

/* ═══════════════════════════════════════════════════════════════
   Helper: ML microservice call
═══════════════════════════════════════════════════════════════ */
async function callMLService(path, data, method = 'POST') {
  const baseUrl = (process.env.ML_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  const url = `${baseUrl}${path}`;
  const config = {
    timeout: 10000,
    headers: {
      'X-ML-API-Key': process.env.ML_API_KEY,
    },
  };

  if (data && typeof data.getHeaders === 'function') {
    config.headers = {
      ...config.headers,
      ...data.getHeaders(),
    };
  }

  const response = method === 'GET'
    ? await axios.get(url, config)
    : await axios.post(url, data, config);
  return response.data;
}

/* ═══════════════════════════════════════════════════════════════
   Helper: Persist one debate turn to MongoDB
═══════════════════════════════════════════════════════════════ */
async function saveTurnToMongo(debateId, userText, aiText, round, scores, fallacy, speakerUserId = null, speakerName = null) {
  const userArg = {
    speaker:       'user',
    speakerName:   speakerName || null,
    speakerUserId: speakerUserId || null,
    content:       userText,
    scores: {
      logic:     scores.logic     ?? null,
      evidence:  scores.evidence  ?? null,
      clarity:   scores.clarity   ?? null,
      overall:   scores.overall   ?? null,
    },
    fallacy: {
      detected:    fallacy.detected    ?? false,
      type:        fallacy.fallacy_type ?? null,
      confidence:  fallacy.confidence  ?? null,
      explanation: fallacy.explanation ?? null,
    },
    turnNumber: round,
  };

  const aiArg = {
    speaker:    'ai',
    content:    aiText,
    turnNumber: round,
  };

  await Debate.findByIdAndUpdate(debateId, {
    $push: { arguments: { $each: [userArg, aiArg] } },
    $inc:  { totalRounds: 1 },
  });
}
