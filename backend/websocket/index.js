'use strict';

const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const { Debate, User } = require('../models');
const { streamDebateResponse, trimHistory } = require('../services/llm.service');
const axios      = require('axios');
const redisClient = require('../config/redis');
const { SCORE_THRESHOLDS, MAX_ROUNDS } = require('../config/constants');

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
  });

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

  /* ── Connection handler ── */
  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log(`[WS] User connected: ${socket.user.username}`);

    /* ────────────────────────────────────────
       join_debate
    ─────────────────────────────────────── */
    socket.on('join_debate', async ({ debateId }) => {
      try {
        const debate = await Debate.findOne({
          _id:    debateId,
          userId: socket.user.id,
        });
        if (!debate) {
          return socket.emit('error', { message: 'Debate not found' });
        }

        const user            = await User.findById(socket.user.id);
        const fallacyProfile  = Object.fromEntries(user.fallacyProfile || new Map());
        const aiPosition      = debate.userSide === 'for' ? 'against' : 'for';

        const sessionState = {
          debateId,
          userId:              socket.user.id,
          topic:               debate.topicSnapshot,
          userSide:            debate.userSide,
          aiPosition,
          difficulty:          debate.difficulty,
          round:               1,
          conversationHistory: [],
          userFallacyProfile:  fallacyProfile,
          weaknessSummary:     '',
          audioBuffer:         [],
        };

        await redisClient.setex(
          `session:${debateId}`,
          3600,
          JSON.stringify(sessionState)
        );

        socket.join(debateId);
        socket.emit('debate_joined', {
          topic:      debate.topicSnapshot,
          userSide:   debate.userSide,
          aiPosition,
          difficulty: debate.difficulty,
        });
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });

    /* ────────────────────────────────────────
       audio_chunk — buffer incoming PCM/webm
    ─────────────────────────────────────── */
    socket.on('audio_chunk', async ({ debateId, chunk }) => {
      try {
        const sessionRaw = await redisClient.get(`session:${debateId}`);
        if (!sessionRaw) return;
        const session = JSON.parse(sessionRaw);
        /* chunk arrives as a Buffer from the socket layer */
        session.audioBuffer.push(Buffer.from(chunk));
        await redisClient.setex(`session:${debateId}`, 3600, JSON.stringify(session));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[WS] audio_chunk error:', e.message);
      }
    });

    /* ────────────────────────────────────────
       audio_end — transcribe + process turn
    ─────────────────────────────────────── */
    socket.on('audio_end', async ({ debateId }) => {
      const sessionRaw = await redisClient.get(`session:${debateId}`);
      if (!sessionRaw) {
        return socket.emit('error', { message: 'Session expired' });
      }
      const session = JSON.parse(sessionRaw);
      await processTurn(socket, session, debateId);
    });

    /* ────────────────────────────────────────
       transcript_direct — fallback (no MediaRecorder)
    ─────────────────────────────────────── */
    socket.on('transcript_direct', async ({ debateId, text }) => {
      const sessionRaw = await redisClient.get(`session:${debateId}`);
      if (!sessionRaw) return;
      const session = JSON.parse(sessionRaw);
      await processTranscript(socket, session, debateId, text);
    });

    /* ────────────────────────────────────────
       end_debate — manual end by user
    ─────────────────────────────────────── */
    socket.on('end_debate', async ({ debateId }) => {
      try {
        const sessionRaw = await redisClient.get(`session:${debateId}`);
        if (!sessionRaw) return;

        const debate = await Debate.findById(debateId);
        if (!debate) {
          socket.emit('error', { message: 'Debate not found' });
          return;
        }

        const avgScore = debate.getAverageScore();
        const winner =
          avgScore >= SCORE_THRESHOLDS.WIN  ? 'user' :
          avgScore >= SCORE_THRESHOLDS.DRAW ? 'draw' : 'ai';

        socket.emit('debate_ended', { winner, userFinalScore: avgScore });
        await redisClient.del(`session:${debateId}`);
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });
    /* ── typed text argument (text debate mode) ── */
    socket.on('transcript_direct', async ({ debateId, text }) => {
      try {
        const sessionRaw = await redisClient.get(`session:${debateId}`);
        if (!sessionRaw) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }
        const session = JSON.parse(sessionRaw);
        // Emit as a transcript_final so the UI stays consistent
        socket.emit('transcript_final', { text });
        // Process through the same pipeline as voice transcripts
        await processTranscript(socket, session, debateId, text);
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });

    socket.on('disconnect', () => {
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
    if (audioBuffer.length > 1000) {
      const result = await transcribeAudio(audioBuffer, session.topic);
      transcript   = result.text;
    }

    if (!transcript.trim()) {
      socket.emit('error', { message: 'Could not transcribe audio. Please try again.' });
      return;
    }

    socket.emit('transcript_final', { text: transcript });
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

    /* ── 1. Run ML tasks in parallel ── */
    const [fallacyResult, scoreResult, weaknessResult] = await Promise.allSettled([
      callMLService('/fallacy/detect', {
        argument: transcript,
        context:  historyCtx,
        user_id:  session.userId,
      }),
      callMLService('/scorer/score', {
        argument:    transcript,
        topic:       session.topic,
        context:     historyCtx,
        turn_number: session.round,
      }),
      callMLService(`/memory/weaknesses/${session.userId}`, null, 'GET'),
    ]);

    /* ── 2. Emit fallacy (if detected) ── */
    if (fallacyResult.status === 'fulfilled' && fallacyResult.value?.detected) {
      socket.emit('fallacy_detected', fallacyResult.value);
    }

    /* ── 3. Emit scores ── */
    if (scoreResult.status === 'fulfilled') {
      socket.emit('scores_update', scoreResult.value);
    }

    /* ── 4. Update weakness context ── */
    if (weaknessResult.status === 'fulfilled') {
      session.weaknessSummary = weaknessResult.value?.weakness_summary || '';
    }

    /* ── 5. Append user turn to history ── */
    session.conversationHistory.push({ role: 'user', content: transcript });
    session.conversationHistory = trimHistory(session.conversationHistory);

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

    /* ── 7. Append AI turn to history ── */
    session.conversationHistory.push({ role: 'assistant', content: fullAiText });

    /* ── 8. Persist turn to MongoDB (non-blocking) ── */
    const scores  = scoreResult.status  === 'fulfilled' ? scoreResult.value  : {};
    const fallacy = fallacyResult.status === 'fulfilled' ? fallacyResult.value : {};
    saveTurnToMongo(debateId, transcript, fullAiText, session.round, scores, fallacy)
      .catch(console.error);  // eslint-disable-line no-console

    /* ── 9. Store embedding in vector DB (non-blocking) ── */
    callMLService('/memory/store', {
      user_id:       session.userId,
      argument_text: transcript,
      scores,
      fallacy_type:  fallacy.fallacy_type || 'no_fallacy',
      topic:         session.topic,
      debate_id:     debateId,
    }).catch(console.error);  // eslint-disable-line no-console

    /* ── 10. Persist updated session ── */
    session.round++;
    await redisClient.setex(`session:${debateId}`, 3600, JSON.stringify(session));

    /* ── 11. Signal turn complete ── */
    socket.emit('ai_turn_complete', { fullText: fullAiText, round: session.round });

    /* ── 12. Auto-end after MAX_ROUNDS ── */
    if (session.round > MAX_ROUNDS) {
      const debate   = await Debate.findById(debateId);
      if (debate) {
        const avgScore = debate.getAverageScore();
        const winner =
          avgScore >= SCORE_THRESHOLDS.WIN  ? 'user' :
          avgScore >= SCORE_THRESHOLDS.DRAW ? 'draw' : 'ai';

        socket.emit('debate_ended', { winner, userFinalScore: avgScore });
        await redisClient.del(`session:${debateId}`);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[WS] processTranscript error:', e);
    socket.emit('error', { message: 'Error generating AI response.' });
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
  const config = {};

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

module.exports = initWebSocket;
