'use strict';

/**
 * Multiplayer WebSocket Handler
 *
 * Handles: room joining, team selection, turn management, live debate,
 * audience chat, voting, and AI moderation.
 *
 * This uses a Socket.IO namespace: /multiplayer
 */

const jwt   = require('jsonwebtoken');
const axios = require('axios');
const { Room, User } = require('../models');
const { streamDebateResponse, trimHistory } = require('../services/llm.service');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

/* ── In-memory room sessions (keyed by roomId) ── */
const roomSessions = new Map();

function getRoomSession(roomId) {
  if (!roomSessions.has(roomId)) {
    roomSessions.set(roomId, {
      conversationHistory: [],
      currentTurn: 0,
      turnTimer: null,
    });
  }
  return roomSessions.get(roomId);
}

/* ── ML service helper ── */
async function callML(path, data, method = 'POST') {
  const url = `${ML_SERVICE_URL}${path}`;
  const config = { timeout: 10000 };
  const response = method === 'GET'
    ? await axios.get(url, config)
    : await axios.post(url, data, config);
  return response.data;
}

/* ═══════════════════════════════════════════════════════════════
   Initialize the /multiplayer namespace on the Socket.IO server
═══════════════════════════════════════════════════════════════ */
function initMultiplayerWS(io) {
  const mpNs = io.of('/multiplayer');

  /* ── JWT auth middleware ── */
  mpNs.use((socket, next) => {
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

  /* ── Connection handler ── */
  mpNs.on('connection', (socket) => {
    console.log(`[MP-WS] User connected: ${socket.user.username}`);

    /* ────────────────────────────────────────
       join_room — Enter a multiplayer room
    ─────────────────────────────────────── */
    socket.on('join_room', async ({ roomId }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room) return socket.emit('error', { message: 'Room not found' });

        socket.join(roomId);
        socket.roomId = roomId;

        // Send current room state to the joining user
        socket.emit('room_state', sanitizeRoom(room));

        // Notify others
        mpNs.to(roomId).emit('user_joined', {
          userId: socket.user.id,
          username: socket.user.username,
        });

        console.log(`[MP-WS] ${socket.user.username} joined room ${room.roomCode}`);
      } catch (e) {
        console.error('[MP-WS] join_room error:', e.message);
        socket.emit('error', { message: e.message });
      }
    });

    /* ────────────────────────────────────────
       select_team — Switch team/audience
    ─────────────────────────────────────── */
    socket.on('select_team', async ({ roomId, team }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room || room.status !== 'waiting') {
          return socket.emit('error', { message: 'Cannot change team now.' });
        }

        const uid = socket.user.id;
        const uname = socket.user.username;

        // Remove from all lists
        room.teamFor     = room.teamFor.filter(m => m.userId.toString() !== uid);
        room.teamAgainst = room.teamAgainst.filter(m => m.userId.toString() !== uid);
        room.audience    = room.audience.filter(m => m.userId.toString() !== uid);

        // Add to chosen team
        if (team === 'for') {
          if (room.teamFor.length >= room.maxTeamSize) {
            return socket.emit('error', { message: 'Team FOR is full.' });
          }
          room.teamFor.push({ userId: uid, username: uname });
        } else if (team === 'against') {
          if (room.teamAgainst.length >= room.maxTeamSize) {
            return socket.emit('error', { message: 'Team AGAINST is full.' });
          }
          room.teamAgainst.push({ userId: uid, username: uname });
        } else {
          room.audience.push({ userId: uid, username: uname });
        }

        await room.save();

        // Broadcast updated room state
        mpNs.to(roomId).emit('room_state', sanitizeRoom(room));
      } catch (e) {
        console.error('[MP-WS] select_team error:', e.message);
        socket.emit('error', { message: e.message });
      }
    });

    /* ────────────────────────────────────────
       start_match — Host starts the debate
    ─────────────────────────────────────── */
    socket.on('start_match', async ({ roomId }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room) return socket.emit('error', { message: 'Room not found' });
        if (room.hostId.toString() !== socket.user.id) {
          return socket.emit('error', { message: 'Only the host can start the match.' });
        }
        if (room.teamFor.length === 0 || room.teamAgainst.length === 0) {
          return socket.emit('error', { message: 'Both teams need at least one member.' });
        }
        if (room.status !== 'waiting') {
          return socket.emit('error', { message: 'Match already started.' });
        }

        room.status = 'in_progress';
        room.startedAt = new Date();
        room.currentTurn = 1;

        // First speaker: Team For, first member
        room.currentSpeaker = {
          userId: room.teamFor[0].userId,
          username: room.teamFor[0].username,
          team: 'for',
        };
        room.turnStartedAt = new Date();
        await room.save();

        // Initialize session
        const session = getRoomSession(roomId);
        session.currentTurn = 1;
        session.conversationHistory = [];

        mpNs.to(roomId).emit('match_started', {
          status: 'in_progress',
          currentTurn: 1,
          currentSpeaker: room.currentSpeaker,
          turnTimerSecs: room.turnTimerSecs,
        });

        // AI Moderator opening
        const openingMsg = `Welcome to this debate! The topic is: "${room.topic}". Team FOR will present their opening argument first. ${room.currentSpeaker.username}, you have ${room.turnTimerSecs} seconds. Begin!`;
        mpNs.to(roomId).emit('moderator_message', { content: openingMsg });

        await Room.findByIdAndUpdate(roomId, {
          $push: { moderatorComments: { content: openingMsg, afterTurn: 0 } },
        });

        // Start turn timer
        startTurnTimer(mpNs, roomId, room.turnTimerSecs);

        console.log(`[MP-WS] Match started in room ${room.roomCode}`);
      } catch (e) {
        console.error('[MP-WS] start_match error:', e.message);
        socket.emit('error', { message: e.message });
      }
    });

    /* ────────────────────────────────────────
       submit_argument — Debater submits their turn
    ─────────────────────────────────────── */
    socket.on('submit_argument', async ({ roomId, text }) => {
      try {
        if (!text?.trim()) return;

        const room = await Room.findById(roomId);
        if (!room || room.status !== 'in_progress') {
          return socket.emit('error', { message: 'Debate is not active.' });
        }

        // Check if this user is the current speaker
        if (room.currentSpeaker?.userId?.toString() !== socket.user.id) {
          return socket.emit('error', { message: 'It is not your turn to speak.' });
        }

        const session = getRoomSession(roomId);

        // Clear turn timer
        clearTurnTimer(roomId);

        const team = room.currentSpeaker.team;
        const turnNumber = room.currentTurn;

        // Broadcast the argument to all
        mpNs.to(roomId).emit('argument_submitted', {
          userId: socket.user.id,
          username: socket.user.username,
          team,
          content: text.trim(),
          turnNumber,
        });

        // Run ML pipeline in parallel (fallacy detection + scoring)
        const historyCtx = session.conversationHistory.slice(-4).map(m => m.content);

        let fallacyResult = {};
        let scoresResult = {};

        const fallacyPromise = callML('/fallacy/detect', {
          argument: text.trim(),
          context: historyCtx,
          user_id: socket.user.id,
        }).then(res => {
          if (res?.detected) {
            mpNs.to(roomId).emit('fallacy_detected', {
              ...res,
              userId: socket.user.id,
              username: socket.user.username,
              team,
            });
          }
          fallacyResult = res || {};
        }).catch(err => console.error('[MP-WS] Fallacy error:', err.message));

        const scorerPromise = callML('/scorer/score', {
          argument: text.trim(),
          topic: room.topic,
          context: historyCtx,
          turn_number: turnNumber,
        }).then(res => {
          if (res) {
            mpNs.to(roomId).emit('scores_update', {
              ...res,
              userId: socket.user.id,
              username: socket.user.username,
              team,
            });
            scoresResult = res;
          }
        }).catch(err => console.error('[MP-WS] Scorer error:', err.message));

        await Promise.allSettled([fallacyPromise, scorerPromise]);

        // Save argument to DB
        const argDoc = {
          userId: socket.user.id,
          username: socket.user.username,
          team,
          content: text.trim(),
          turnNumber,
          scores: {
            logic:    scoresResult.logic    ?? null,
            evidence: scoresResult.evidence ?? null,
            clarity:  scoresResult.clarity  ?? null,
            overall:  scoresResult.overall  ?? null,
          },
          fallacy: {
            detected:    fallacyResult.detected    ?? false,
            type:        fallacyResult.fallacy_type ?? null,
            confidence:  fallacyResult.confidence   ?? null,
            explanation: fallacyResult.explanation  ?? null,
          },
        };

        // Add to conversation history
        session.conversationHistory.push({
          role: team === 'for' ? 'user' : 'assistant',
          content: `[${socket.user.username} - Team ${team.toUpperCase()}]: ${text.trim()}`,
        });
        session.conversationHistory = trimHistory(session.conversationHistory);

        // Save to room
        await Room.findByIdAndUpdate(roomId, {
          $push: { arguments: argDoc },
        });

        // Advance to next speaker
        await advanceTurn(mpNs, roomId, room, session);

      } catch (e) {
        console.error('[MP-WS] submit_argument error:', e.message);
        socket.emit('error', { message: e.message });
      }
    });

    /* ────────────────────────────────────────
       chat_message — Audience & debater chat
    ─────────────────────────────────────── */
    socket.on('chat_message', async ({ roomId, text }) => {
      try {
        if (!text?.trim() || text.trim().length > 500) return;

        const msg = {
          userId: socket.user.id,
          username: socket.user.username,
          text: text.trim(),
          createdAt: new Date(),
        };

        // Save to DB
        await Room.findByIdAndUpdate(roomId, {
          $push: {
            chatMessages: {
              $each: [msg],
              $slice: -200,  // Keep last 200 messages
            },
          },
        });

        // Broadcast
        mpNs.to(roomId).emit('chat_message', msg);
      } catch (e) {
        console.error('[MP-WS] chat_message error:', e.message);
      }
    });

    /* ────────────────────────────────────────
       submit_vote — Audience votes
    ─────────────────────────────────────── */
    socket.on('submit_vote', async ({ roomId, vote }) => {
      try {
        if (!['for', 'against'].includes(vote)) return;

        const room = await Room.findById(roomId);
        if (!room || !['in_progress', 'voting'].includes(room.status)) {
          return socket.emit('error', { message: 'Voting is not open.' });
        }

        // Check if user already voted
        if (room.votedUsers.some(id => id.toString() === socket.user.id)) {
          return socket.emit('error', { message: 'You have already voted.' });
        }

        // Check that voter is not a debater
        const isDebater = room.teamFor.some(m => m.userId.toString() === socket.user.id)
          || room.teamAgainst.some(m => m.userId.toString() === socket.user.id);
        if (isDebater) {
          return socket.emit('error', { message: 'Debaters cannot vote.' });
        }

        const updateField = vote === 'for' ? 'votes.for' : 'votes.against';
        await Room.findByIdAndUpdate(roomId, {
          $inc: { [updateField]: 1 },
          $push: { votedUsers: socket.user.id },
        });

        const updatedRoom = await Room.findById(roomId);
        mpNs.to(roomId).emit('vote_update', {
          for: updatedRoom.votes.for,
          against: updatedRoom.votes.against,
          totalVotes: updatedRoom.votedUsers.length,
        });
      } catch (e) {
        console.error('[MP-WS] submit_vote error:', e.message);
        socket.emit('error', { message: e.message });
      }
    });

    /* ────────────────────────────────────────
       disconnect
    ─────────────────────────────────────── */
    socket.on('disconnect', () => {
      if (socket.roomId) {
        mpNs.to(socket.roomId).emit('user_left', {
          userId: socket.user.id,
          username: socket.user.username,
        });
      }
      console.log(`[MP-WS] User disconnected: ${socket.user.username}`);
    });
  });

  return mpNs;
}

/* ═══════════════════════════════════════════════════════════════
   Turn management helpers
═══════════════════════════════════════════════════════════════ */
const turnTimers = new Map();

function startTurnTimer(mpNs, roomId, seconds) {
  clearTurnTimer(roomId);
  const timer = setTimeout(async () => {
    try {
      const room = await Room.findById(roomId);
      if (!room || room.status !== 'in_progress') return;

      mpNs.to(roomId).emit('turn_timeout', {
        userId: room.currentSpeaker?.userId,
        username: room.currentSpeaker?.username,
      });

      const session = getRoomSession(roomId);
      await advanceTurn(mpNs, roomId, room, session);
    } catch (e) {
      console.error('[MP-WS] Turn timer error:', e.message);
    }
  }, seconds * 1000);

  turnTimers.set(roomId, timer);
}

function clearTurnTimer(roomId) {
  if (turnTimers.has(roomId)) {
    clearTimeout(turnTimers.get(roomId));
    turnTimers.delete(roomId);
  }
}

/* ═══════════════════════════════════════════════════════════════
   advanceTurn — Move to next speaker or end debate
═══════════════════════════════════════════════════════════════ */
async function advanceTurn(mpNs, roomId, room, session) {
  const freshRoom = await Room.findById(roomId);
  const nextTurn = freshRoom.currentTurn + 1;

  // Check if debate should end
  if (nextTurn > freshRoom.maxRounds * 2) {
    // Each "round" = 1 turn per team = 2 turns total
    await endMultiplayerDebate(mpNs, roomId, freshRoom, session);
    return;
  }

  // Alternate between teams: odd turns = for, even turns = against
  const nextTeam = nextTurn % 2 === 1 ? 'for' : 'against';
  const teamMembers = nextTeam === 'for' ? freshRoom.teamFor : freshRoom.teamAgainst;

  if (teamMembers.length === 0) {
    await endMultiplayerDebate(mpNs, roomId, freshRoom, session);
    return;
  }

  // Round-robin within team
  const memberIdx = Math.floor((nextTurn - 1) / 2) % teamMembers.length;
  const nextSpeaker = teamMembers[memberIdx];

  freshRoom.currentTurn = nextTurn;
  freshRoom.currentSpeaker = {
    userId: nextSpeaker.userId,
    username: nextSpeaker.username,
    team: nextTeam,
  };
  freshRoom.turnStartedAt = new Date();
  await freshRoom.save();

  // AI Moderator transition
  const modMsg = `Team ${nextTeam.toUpperCase()}, it's your turn. ${nextSpeaker.username}, you have ${freshRoom.turnTimerSecs} seconds.`;
  mpNs.to(roomId).emit('moderator_message', { content: modMsg });
  await Room.findByIdAndUpdate(roomId, {
    $push: { moderatorComments: { content: modMsg, afterTurn: nextTurn - 1 } },
  });

  // Emit turn change
  mpNs.to(roomId).emit('turn_change', {
    currentTurn: nextTurn,
    currentSpeaker: freshRoom.currentSpeaker,
    turnTimerSecs: freshRoom.turnTimerSecs,
  });

  // Restart timer
  startTurnTimer(mpNs, roomId, freshRoom.turnTimerSecs);
}

/* ═══════════════════════════════════════════════════════════════
   endMultiplayerDebate — AI judges, scoring, voting
═══════════════════════════════════════════════════════════════ */
async function endMultiplayerDebate(mpNs, roomId, room, session) {
  clearTurnTimer(roomId);

  // Move to voting phase
  await Room.findByIdAndUpdate(roomId, { status: 'voting' });
  mpNs.to(roomId).emit('voting_phase', {
    message: 'The debate has concluded! Audience members, cast your votes now.',
    duration: 30, // 30 seconds to vote
  });

  const votingMsg = 'The debate has concluded. Audience, you have 30 seconds to cast your vote for the winning team!';
  mpNs.to(roomId).emit('moderator_message', { content: votingMsg });
  await Room.findByIdAndUpdate(roomId, {
    $push: { moderatorComments: { content: votingMsg } },
  });

  // After 30 seconds, finalize
  setTimeout(async () => {
    try {
      const finalRoom = await Room.findById(roomId);
      if (!finalRoom || finalRoom.status === 'finished') return;

      const teamForScore = finalRoom.getTeamAvgScore('for');
      const teamAgainstScore = finalRoom.getTeamAvgScore('against');

      // AI generates final verdict
      let aiFeedback = '';
      try {
        const judgePrompt = `You are an impartial debate moderator giving a brief final verdict.

TOPIC: ${finalRoom.topic}

TEAM FOR Arguments:
${finalRoom.arguments.filter(a => a.team === 'for').map(a => `[${a.username}]: ${a.content}`).join('\n')}

TEAM AGAINST Arguments:
${finalRoom.arguments.filter(a => a.team === 'against').map(a => `[${a.username}]: ${a.content}`).join('\n')}

Team FOR avg score: ${teamForScore}/100
Team AGAINST avg score: ${teamAgainstScore}/100
Audience votes — FOR: ${finalRoom.votes.for}, AGAINST: ${finalRoom.votes.against}

Give a 2-3 sentence verdict summarizing who argued better and why. Be constructive.`;

        for await (const chunk of streamDebateResponse(
          { round: 1, conversationHistory: [], topic: finalRoom.topic, userSide: 'for', aiPosition: 'against', difficulty: 'intermediate', persona: 'balanced', format: 'freeform' },
          judgePrompt
        )) {
          aiFeedback += chunk;
        }
      } catch (err) {
        console.error('[MP-WS] AI judge error:', err.message);
        aiFeedback = 'Both teams showed strong effort. Review the scores to see detailed feedback.';
      }

      // Determine winner
      const totalForPoints = teamForScore + (finalRoom.votes.for * 5);
      const totalAgainstPoints = teamAgainstScore + (finalRoom.votes.against * 5);
      let winner = 'draw';
      if (totalForPoints > totalAgainstPoints + 5) winner = 'for';
      else if (totalAgainstPoints > totalForPoints + 5) winner = 'against';

      await Room.findByIdAndUpdate(roomId, {
        status: 'finished',
        winner,
        teamForScore,
        teamAgainstScore,
        aiFeedback,
        endedAt: new Date(),
      });

      mpNs.to(roomId).emit('match_ended', {
        winner,
        teamForScore,
        teamAgainstScore,
        votes: finalRoom.votes,
        aiFeedback,
      });

      // Clean up session
      roomSessions.delete(roomId);

      console.log(`[MP-WS] Match ended in room ${finalRoom.roomCode}. Winner: ${winner}`);
    } catch (e) {
      console.error('[MP-WS] endMultiplayerDebate error:', e.message);
    }
  }, 30000); // 30s voting window
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════════ */
function sanitizeRoom(room) {
  return {
    roomId: room._id,
    roomCode: room.roomCode,
    topic: room.topic,
    status: room.status,
    hostId: room.hostId,
    teamFor: room.teamFor,
    teamAgainst: room.teamAgainst,
    audience: room.audience,
    maxTeamSize: room.maxTeamSize,
    maxRounds: room.maxRounds,
    turnTimerSecs: room.turnTimerSecs,
    currentTurn: room.currentTurn,
    currentSpeaker: room.currentSpeaker,
    arguments: room.arguments,
    chatMessages: (room.chatMessages || []).slice(-50),
    moderatorComments: room.moderatorComments,
    votes: room.votes,
    winner: room.winner,
    teamForScore: room.teamForScore,
    teamAgainstScore: room.teamAgainstScore,
    aiFeedback: room.aiFeedback,
  };
}

module.exports = initMultiplayerWS;
