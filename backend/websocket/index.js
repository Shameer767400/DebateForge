'use strict';

const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const { Debate, User } = require('../models');
const { streamDebateResponse, buildSystemPrompt, trimHistory } = require('../services/llm.service');
const DebateFormatEngine = require('../services/formatEngine.service');
const axios      = require('axios');
const redisClient = require('../config/redis');
const { SCORE_THRESHOLDS, MAX_ROUNDS } = require('../config/constants');
const { finalizeDebateStats } = require('../controllers/debate.controller');
const initMultiplayerWS = require('./multiplayer');

// Export immediately to prevent CommonJS circular dependency issues
module.exports = initWebSocket;

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
  };
}

/* ── WebSocket rate limiter ── */
const WS_RATE_LIMITS = {
  join_debate:        { max: 20,  windowMs: 60000 },   // 20 joins per min
  audio_chunk:        { max: 600, windowMs: 60000 },   // 600 chunks per min (10/sec)
  audio_end:          { max: 60, windowMs: 60000 },    // 60 per min
  transcript_direct:  { max: 60, windowMs: 60000 },    // 60 per min
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
const MAX_CONNECTIONS_PER_USER = 2;

/* ─────────────────────────────────────────────────────────────
   Entry point — attach Socket.IO to the HTTP server
───────────────────────────────────────────────────────────── */
function initWebSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(o => o.trim()),
      credentials: true,
    },
    maxHttpBufferSize: 1e7,  // 10 MB (audio chunks)
    pingTimeout: 30000,      // Disconnect idle sockets faster
    pingInterval: 15000,
  });

  /* ── Initialize multiplayer namespace ── */
  initMultiplayerWS(io);

  /* ── JWT auth middleware ── */
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
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
    console.log(`[WS] User connected: ${socket.user.username}`);

    /* ────────────────────────────────────────
       join_debate
    ─────────────────────────────────────── */
    socket.on('join_debate', async ({ debateId }) => {
      if (!wsRateLimiter(socket, 'join_debate')) return;
      console.log(`[WS] INCOMING: join_debate for debateId: ${debateId} from user: ${socket.user.username}`);
      try {
        const debate = await Debate.findOne({
          _id:    debateId,
          userId: socket.user.id,
        });
        if (!debate) {
          console.error(`[WS] ERROR: Debate ${debateId} not found for user ${socket.user.id}`);
          return socket.emit('error', { message: 'Debate not found' });
        }

        const user               = await User.findById(socket.user.id);
        const fallacyProfile     = Object.fromEntries(user.fallacyProfile || new Map());
        const targetImprovements = user.targetImprovements || [];
        const grammarMistakes    = user.grammarMistakes || [];
        const aiPosition         = debate.userSide === 'for' ? 'against' : 'for';

        /* ── Fetch coaching plan from ML memory service ── */
        let coachingPlan = null;
        try {
          coachingPlan = await callMLService(`/memory/coaching-plan/${socket.user.id}`, null, 'GET');
        } catch { /* non-critical */ }

        /* ── Format Engine: initialize phase state ── */
        const debateFormat = debate.format || 'freeform';
        const phaseInfo    = DebateFormatEngine.getCurrentPhaseInfo(debateFormat, 0);

        const sessionState = {
          debateId,
          userId:              socket.user.id,
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
        };

        await redisClient.setex(
          `session:${debateId}`,
          3600,
          JSON.stringify(sessionState)
        );

        socket.join(debateId);
        console.log(`[WS] SUCCESS: User joined debate channel ${debateId}`);
        socket.emit('debate_joined', {
          topic:      debate.topicSnapshot,
          userSide:   debate.userSide,
          aiPosition,
          difficulty: debate.difficulty,
          format:     debateFormat,
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
      } catch (e) {
        console.error(`[WS] ERROR in join_debate:`, e);
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
        console.error('[WS] audio_chunk error:', e.message);
      }
    });

    /* ────────────────────────────────────────
       audio_end — transcribe + process turn
    ─────────────────────────────────────── */
    socket.on('audio_end', async ({ debateId }) => {
      if (!wsRateLimiter(socket, 'audio_end')) return;
      console.log(`[WS] INCOMING: audio_end for debate: ${debateId}`);
      const sessionRaw = await redisClient.get(`session:${debateId}`);
      if (!sessionRaw) {
        return socket.emit('error', { message: 'Session expired' });
      }
      const session = JSON.parse(sessionRaw);

      /* ── Ownership check: prevent IDOR ── */
      if (session.userId !== socket.user.id) {
        return socket.emit('error', { message: 'Unauthorized' });
      }
      
      const chunks = socket.audioBuffer || [];
      socket.audioBuffer = []; // Clear current buffer
      
      if (chunks.length === 0) {
        console.log(`[WS] WARNING: audio_end received but socket buffer was empty`);
        return;
      }
      
      session.audioBuffer = chunks;
      await processTurn(socket, session, debateId);
    });

    /* ────────────────────────────────────────
       transcript_direct — fallback (no MediaRecorder)
    ─────────────────────────────────────── */
    socket.on('transcript_direct', async ({ debateId, text }) => {
      if (!wsRateLimiter(socket, 'transcript_direct')) return;
      console.log(`[WS] INCOMING: transcript_direct. Debate: ${debateId}, Text length: ${text?.length || 0}`);
      const sessionRaw = await redisClient.get(`session:${debateId}`);
      if (!sessionRaw) {
         console.log(`[WS] ERROR: Ignoring transcript_direct because session missing from Redis`);
         return;
      }
      const session = JSON.parse(sessionRaw);

      /* ── Ownership check: prevent IDOR ── */
      if (session.userId !== socket.user.id) {
        return socket.emit('error', { message: 'Unauthorized' });
      }

      socket.emit('transcript_final', { text });
      await processTranscript(socket, session, debateId, text);
    });

    /* ────────────────────────────────────────
       end_debate — manual end by user
    ─────────────────────────────────────── */
    socket.on('end_debate', async ({ debateId, tzOffsetMinutes }) => {
      if (!wsRateLimiter(socket, 'end_debate')) return;
      try {
        const sessionRaw = await redisClient.get(`session:${debateId}`);
        if (!sessionRaw) return;

        /* ── Ownership check on session ── */
        const session = JSON.parse(sessionRaw);
        if (session.userId !== socket.user.id) {
          return socket.emit('error', { message: 'Unauthorized' });
        }

        /* Store user timezone offset for streak calculation */
        const tzOffset = typeof tzOffsetMinutes === 'number' ? tzOffsetMinutes : 0;

        /* ── Ownership check on debate document ── */
        const debate = await Debate.findOne({ _id: debateId, userId: socket.user.id });
        if (!debate) {
          socket.emit('error', { message: 'Debate not found' });
          return;
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
          await redisClient.del(`session:${debateId}`);
          return;
        }

        const avgScore = debate.getAverageScore();
        const winner =
          avgScore >= SCORE_THRESHOLDS.WIN  ? 'user' :
          avgScore >= SCORE_THRESHOLDS.DRAW ? 'draw' : 'ai';

        const result = await finalizeDebateStats(socket.user.id, debateId, winner, 0, tzOffset);
        socket.emit('debate_ended', { winner, userFinalScore: result.avgScore });
        await redisClient.del(`session:${debateId}`);
      } catch (e) {
        socket.emit('error', { message: e.message });
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
      console.log(`[WS] User disconnected: ${socket.user.username}`);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   processTurn — transcribe audio then hand off to processTranscript
═══════════════════════════════════════════════════════════════ */
async function processTurn(socket, session, debateId) {
  try {
    /* Reconstruct audio blob from stored chunks */
    const storedChunks = session.audioBuffer.map((b) => Buffer.from(b));
    const audioBuffer  = Buffer.concat(storedChunks);
    session.audioBuffer = [];  // clear to save Redis space

    let transcript = '';
    let detectedLanguage = 'en';
    if (audioBuffer.length > 1000) {
      const result = await transcribeAudio(audioBuffer, session.topic);
      transcript   = result.text;
      detectedLanguage = result.language || 'en';
    }

    if (!transcript.trim()) {
      socket.emit('error', { message: 'Could not transcribe audio. Please try again.' });
      return;
    }

    /* Store detected language on session for AI response language */
    session.detectedLanguage = detectedLanguage;

    socket.emit('transcript_final', { text: transcript, language: detectedLanguage });
    await processTranscript(socket, session, debateId, transcript);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[WS] processTurn error:', e);
    socket.emit('error', { message: 'Processing error. Please try again.' });
  }
}

/* ═══════════════════════════════════════════════════════════════
   processTranscript — ML pipeline → GPT-4 stream → TTS stream
═══════════════════════════════════════════════════════════════ */
async function processTranscript(socket, session, debateId, transcript) {
  try {
    socket.emit('ai_thinking', {});

    const historyCtx = session.conversationHistory.slice(-4).map((m) => m.content);

    /* ── 1. Run ML tasks in parallel (non-blocking) ── */
    let fallacyResult = {};
    const fallacyPromise = callMLService('/fallacy/detect', {
      argument: transcript,
      context:  historyCtx,
      user_id:  session.userId,
    }).then((res) => {
      if (res?.detected) socket.emit('fallacy_detected', res);
      if (res) fallacyResult = res;
    }).catch(err => console.error('[WS] Fallacy error:', err.message));

    let scoresResult = {};
    const scorerPromise = callMLService('/scorer/score', {
      argument:    transcript,
      topic:       session.topic,
      context:     historyCtx,
      turn_number: session.round,
    }).then((res) => {
      if (res) {
        socket.emit('scores_update', res);
        scoresResult = res;
      }
    }).catch(err => console.error('[WS] Scorer error:', err.message));

    const weaknessPromise = callMLService(`/memory/weaknesses/${session.userId}`, null, 'GET')
      .then((res) => {
        if (res?.weakness_summary) session.weaknessSummary = res.weakness_summary;
      }).catch(err => console.error('[WS] Weakness error:', err.message));

    // ensure errors don't crash
    Promise.allSettled([fallacyPromise, scorerPromise, weaknessPromise]);

    /* ── 5. Append user turn to history ── */
    session.conversationHistory.push({ role: 'user', content: transcript });
    session.conversationHistory = trimHistory(session.conversationHistory);

    /* ── 5.5 Inject phase-specific prompt (Addition 6) ── */
    const phasePrompt = DebateFormatEngine.getPhaseSystemPromptAddition(
      session.format || 'freeform',
      session.phaseIndex || 0,
      session.userSide
    );
    if (phasePrompt) {
      // Temporarily inject phase context into session for buildSystemPrompt
      session._phasePromptAddition = phasePrompt;
    }

    /* ── 6. Stream GPT-4 + sentence-level TTS ── */
    let fullAiText    = '';
    let sentenceBuffer = '';

    for await (const chunk of streamDebateResponse(session, transcript)) {
      fullAiText     += chunk;
      sentenceBuffer += chunk;
      socket.emit('ai_text_chunk', { text: chunk });

      /* Fire TTS as soon as we have a complete sentence */
      if (/[.!?]$/.test(sentenceBuffer)) {
        streamTTSToSocket(socket, sentenceBuffer).catch(console.error);  // eslint-disable-line no-console
        sentenceBuffer = '';
      }
    }

    /* Flush any trailing text */
    if (sentenceBuffer.trim()) {
      await streamTTSToSocket(socket, sentenceBuffer);
    }

    // Clean up temp phase prompt
    delete session._phasePromptAddition;

    /* ── 7. Append AI turn to history ── */
    session.conversationHistory.push({ role: 'assistant', content: fullAiText });

    /* ── wait for ML tasks to finish before saving to Mongo ── */
    await Promise.all([fallacyPromise, scorerPromise]);

    /* ── 8. Persist turn to MongoDB (non-blocking) ── */
    saveTurnToMongo(debateId, transcript, fullAiText, session.round, scoresResult, fallacyResult)
      .catch(console.error);  // eslint-disable-line no-console

    /* ── 8.5 Increment cumulative per-dimension scores on User ── */
    if (scoresResult && (scoresResult.logic || scoresResult.evidence || scoresResult.clarity)) {
      User.findByIdAndUpdate(session.userId, {
        $inc: {
          totalLogicScore:    scoresResult.logic    || 0,
          totalEvidenceScore: scoresResult.evidence || 0,
          totalClarityScore:  scoresResult.clarity  || 0,
          totalScoredTurns:   1,
        },
      }).catch(console.error);  // eslint-disable-line no-console
    }

    /* ── 9. Store embedding in vector DB (non-blocking) ── */
    callMLService('/memory/store', {
      user_id:       session.userId,
      argument_text: transcript,
      scores:        scoresResult,
      fallacy_type:  fallacyResult?.fallacy_type || 'no_fallacy',
      topic:         session.topic,
      debate_id:     debateId,
      turn_number:   session.round,
    }).catch(console.error);  // eslint-disable-line no-console

    /* ── 10. Persist updated session ── */
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
            socket.emit('phase_update', {
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

    await redisClient.setex(`session:${debateId}`, 3600, JSON.stringify(session));

    /* ── 11. Signal turn complete ── */
    socket.emit('ai_turn_complete', {
      fullText: fullAiText,
      round: session.round,
      detectedLanguage: session.detectedLanguage || 'en',
    });

    /* ── 12. Auto-end after MAX_ROUNDS (freeform only) ── */
    if (fmt === 'freeform' && session.round > MAX_ROUNDS) {
      // Instead of calculating scores locally, use the unified LLM judge for the Report Card
      await runJudgeScoring(socket, session, debateId, false, session.tzOffset || 0);
      await redisClient.del(`session:${debateId}`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[WS] processTranscript error:', e);
    const isQuota = e.message?.startsWith('QUOTA_EXHAUSTED');
    socket.emit('error', {
      message: isQuota
        ? 'AI rate limit reached. Please wait 1–2 minutes and try again.'
        : 'Error generating AI response.',
    });
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
    const userFallacies = debate.arguments
      .filter(a => a.speaker === 'user' && a.fallacy && a.fallacy.detected && a.fallacy.type)
      .map(a => a.fallacy.type.replace(/_/g, ' '));
    const uniqueFallacies = [...new Set(userFallacies)];

    let forfeitContext = '';
    if (isForfeit) {
      forfeitContext = `\n\nCRITICAL CONTEXT: The user FORFEITED the debate by ending it early before all rounds were completed. Therefore, you MUST declare the "ai" as the winner and heavily penalize the user's score for quitting early.`;
    }

    const judgePrompt = `You are an impartial debate judge.
Review this complete debate transcript and score both sides.${forfeitContext}

TOPIC: ${session.topic}
USER POSITION: ${session.userSide}
AI POSITION: ${session.aiPosition}
FORMAT: ${session.format}

FULL TRANSCRIPT:
${debate.arguments.map(a =>
  `[${a.speaker.toUpperCase()}]: ${a.content}`
).join('\n\n')}

Score each debater 0-100 on:
- Argument quality
- Use of evidence
- Rebuttal effectiveness
- Adherence to debate format

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
  "fallacies": ["hasty generalization", "ad hominem"]
}`;

    // Use the LLM to get judge response
    let judgeText = '';
    for await (const chunk of streamDebateResponse(
      { ...session, round: 1, conversationHistory: [] },
      judgePrompt
    )) {
      judgeText += chunk;
    }

    // Parse JSON from response
    let judgeResponse;
    try {
      // Try to extract JSON from the response
      const jsonMatch = judgeText.match(/\{[\s\S]*\}/);
      judgeResponse = JSON.parse(jsonMatch ? jsonMatch[0] : judgeText);
    } catch {
      judgeResponse = {
        reportCardHeadline: 'You finished the debate, but there are still weaknesses you need to fix.',
        userScore: 65,
        aiScore: 60,
        winner: 'user',
        feedback: judgeText,
        userStrengths: 'Good argumentation',
        userWeaknesses: 'Room for improvement',
        areasToImprove: [],
        grammarMistakes: [],
        fallacies: [],
      };
    }

    judgeResponse = sanitizeJudgeResponse(judgeResponse, judgeText);

    const persistedProfile = await persistReportCard(session.userId, judgeResponse);

    await Debate.findByIdAndUpdate(debateId, {
      judgeScore: judgeResponse,
      currentPhase: 'judging',
    });
    
    // Process final stats (wins, streaks, etc.)
    const statsResult = await finalizeDebateStats(session.userId, debateId, judgeResponse.winner, 0, tzOffset);
    const streakResult = statsResult?.streakResult || {};

    // Emit judge results to client
    socket.emit('judge_verdict', {
      ...judgeResponse,
      savedFocusAreas: persistedProfile.savedFocusAreas,
      savedGrammarPatterns: persistedProfile.savedGrammarPatterns,
      streak: {
        new:              streakResult.newStreak        || 0,
        milestoneReached: streakResult.milestoneReached || null,
        freezeUsed:       streakResult.freezeUsed       || false,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[WS] Judge scoring error:', e.message);
    socket.emit('error', { message: 'Judge scoring failed.' });
  }
}

/* ═══════════════════════════════════════════════════════════════
   Helper: Whisper transcription
═══════════════════════════════════════════════════════════════ */
async function transcribeAudio(audioBuffer, topic) {
  const FormData = require('form-data');
  const form     = new FormData();

  form.append('file', audioBuffer, {
    filename:    'debate.webm',
    contentType: 'audio/webm',
  });
  if (topic) {
    form.append('topic', topic);
  }

  const response = await callMLService('/transcription/transcribe', form);
  return { text: response.text || '' };
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
  const url = `${process.env.ML_SERVICE_URL}${path}`;
  const config = { timeout: 10000 }; // Prevent infinite hangs if ML service freezes

  if (data && typeof data.getHeaders === 'function') {
    config.headers = data.getHeaders();
  }

  const response = method === 'GET'
    ? await axios.get(url, config)
    : await axios.post(url, data, config);
  return response.data;
}

/* ═══════════════════════════════════════════════════════════════
   Helper: Persist one debate turn to MongoDB
═══════════════════════════════════════════════════════════════ */
async function saveTurnToMongo(debateId, userText, aiText, round, scores, fallacy) {
  const userArg = {
    speaker:     'user',
    content:     userText,
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
