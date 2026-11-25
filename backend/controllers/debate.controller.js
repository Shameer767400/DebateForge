const { User, Topic, Debate } = require('../models');
const { updateStreak } = require('../services/streak.service');
const debateEngine = require('../services/debateEngine.service');
const redisClient = require('../config/redis');

const AI_GD_PERSONAS = [
  { name: 'Aarav', roleTitle: 'Assertive Challenger' },
  { name: 'Priya', roleTitle: 'Analytical Evaluator' },
  { name: 'Karan', roleTitle: 'Diplomatic Mediator' },
];

function serializeParticipants(list) {
  return (list || []).map((p) => ({
    id: p.userId ? p.userId.toString() : null,
    userId: p.userId ? p.userId.toString() : null,
    name: p.name || 'Candidate',
    avatar: p.avatar || null,
    isAI: !!p.isAI,
    roleTitle: p.roleTitle || null,
    seatNumber: p.seatNumber || 1,
  }));
}

async function syncRedisParticipants(debate) {
  try {
    const key = `session:${debate._id.toString()}`;
    const raw = await redisClient.get(key);
    if (raw) {
      const session = JSON.parse(raw);
      session.participants = serializeParticipants(debate.participants);
      session.status = debate.status || session.status;
      await redisClient.setex(key, 3600, JSON.stringify(session));
    }
  } catch { /* non-critical */ }
}

async function startDebate(req, res) {
  try {
    const { topicId, customTopic, side, userSide, difficulty, persona, format, language } = req.body;

    // Frontend sends "side", model expects "userSide"
    const resolvedSide = userSide || side;
    // Frontend sends "devil", model expects "devils_advocate"
    const resolvedDifficulty = difficulty === 'devil' ? 'devils_advocate' : difficulty;

    let topicSnapshot;
    let resolvedTopicId = topicId || null;

    if (customTopic && customTopic.trim()) {
      // Custom topic path — no DB lookup needed
      topicSnapshot = customTopic.trim();
    } else {
      // Preset topic path — look up from DB
      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ error: 'Topic not found' });
      }
      topicSnapshot = topic.title;
      // Increment debateCount for preset topics
      await Topic.findByIdAndUpdate(topicId, { $inc: { debateCount: 1 } });
    }

    const crypto = require('crypto');
    let roomCode = null;
    const participants = [];
    if (format === 'group_discussion') {
      roomCode = 'GD' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const hostUser = await User.findById(req.user.id).select('username profilePicUrl');
      participants.push({
        userId: req.user.id,
        name: hostUser?.username || req.user.username || 'Host',
        avatar: hostUser?.profilePicUrl || null,
        isAI: false,
        roleTitle: 'Host',
        seatNumber: 1,
      });
    }

    const isGD = format === 'group_discussion';
    const debate = new Debate({
      userId: req.user.id,
      topicId: resolvedTopicId,
      topicSnapshot,
      userSide: resolvedSide,
      difficulty: resolvedDifficulty,
      persona: persona || 'balanced',
      format: format || 'freeform',
      status: isGD ? 'waiting' : 'active',
      language: language || 'en',
      roomCode,
      capacity: 4,
      participants,
      arguments: [],
    });

    await debate.save();

    return res.status(201).json({
      debateId: debate._id,
      topicSnapshot: debate.topicSnapshot,
      userSide: debate.userSide,
      difficulty: debate.difficulty,
      persona: debate.persona,
      format: debate.format,
      status: debate.status,
      language: debate.language,
      roomCode: debate.roomCode,
      participants: debate.participants,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in startDebate controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getDebateHistory(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const [debates, total] = await Promise.all([
      Debate.find({ userId: req.user.id })
        .select('topicSnapshot userSide winner userFinalScore totalRounds startedAt endedAt')
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit),
      Debate.countDocuments({ userId: req.user.id }),
    ]);

    const pages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      debates,
      total,
      page,
      pages,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in getDebateHistory controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getDebateById(req, res) {
  try {
    const debate = await Debate.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user.id },
        { 'participants.userId': req.user.id },
      ],
    });

    if (!debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    return res.status(200).json({ debate });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in getDebateById controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function joinGDRoomByCode(req, res) {
  try {
    const { roomCode } = req.body;
    if (!roomCode || !roomCode.trim()) {
      return res.status(400).json({ error: 'Room code is required' });
    }
    const cleanCode = roomCode.trim().toUpperCase();
    const debate = await Debate.findOne({ roomCode: cleanCode, format: 'group_discussion' });
    if (!debate) {
      return res.status(404).json({ error: 'Campus GD room not found. Check the room code and try again.' });
    }
    if (debate.endedAt) {
      return res.status(400).json({ error: 'This GD session has already concluded.' });
    }

    const existingIndex = (debate.participants || []).findIndex(
      (p) => !p.isAI && p.userId && p.userId.toString() === req.user.id
    );

    let seatNumber;
    if (existingIndex !== -1) {
      seatNumber = debate.participants[existingIndex].seatNumber;
    } else {
      const humanCount = (debate.participants || []).filter((p) => !p.isAI).length;
      const capacity = debate.capacity || 4;
      if (humanCount >= capacity) {
        return res.status(400).json({ error: `This GD table is already full (maximum ${capacity} participants)` });
      }
      const joinUser = await User.findById(req.user.id).select('username profilePicUrl');
      const takenSeats = new Set((debate.participants || []).map((p) => p.seatNumber));
      seatNumber = 1;
      while (takenSeats.has(seatNumber)) seatNumber += 1;

      debate.participants.push({
        userId: req.user.id,
        name: joinUser?.username || req.user.username || `Participant ${seatNumber}`,
        avatar: joinUser?.profilePicUrl || null,
        isAI: false,
        roleTitle: 'Peer',
        seatNumber,
      });
      await debate.save();
    }

    await syncRedisParticipants(debate);

    const io = req.app.get('io');
    if (io) {
      io.to(debate._id.toString()).emit('gd_table_update', {
        participants: serializeParticipants(debate.participants),
        roomCode: debate.roomCode,
        capacity: debate.capacity || 4,
        status: debate.status,
      });
    }

    return res.status(200).json({
      debateId: debate._id,
      roomCode: debate.roomCode,
      topicSnapshot: debate.topicSnapshot,
      format: debate.format,
      status: debate.status,
      language: debate.language,
      seatNumber,
      participants: serializeParticipants(debate.participants),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in joinGDRoomByCode controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function startGDFromLobby(req, res) {
  try {
    const debate = await Debate.findOne({ _id: req.params.id, userId: req.user.id });
    if (!debate) {
      return res.status(404).json({ error: 'GD room not found or only the host can start the discussion.' });
    }
    if (debate.endedAt) {
      return res.status(400).json({ error: 'This GD session has already ended.' });
    }

    // Preserve all real joined users; fill ONLY remaining empty slots with AI personas
    const capacity = debate.capacity || 4;
    const realParticipants = (debate.participants || []).filter((p) => !p.isAI);
    const takenSeats = new Set(realParticipants.map((p) => p.seatNumber));
    const existingAINames = new Set(
      (debate.participants || []).filter((p) => p.isAI).map((p) => p.name)
    );

    const filledParticipants = [...debate.participants];
    let aiIdx = 0;
    for (let seat = 1; seat <= capacity; seat += 1) {
      if (takenSeats.has(seat)) continue;
      // Pick next unused AI personality
      while (aiIdx < AI_GD_PERSONAS.length && existingAINames.has(AI_GD_PERSONAS[aiIdx].name)) {
        aiIdx += 1;
      }
      if (aiIdx < AI_GD_PERSONAS.length) {
        const aiPersona = AI_GD_PERSONAS[aiIdx];
        aiIdx += 1;
        existingAINames.add(aiPersona.name);
        filledParticipants.push({
          userId: null,
          name: aiPersona.name,
          avatar: null,
          isAI: true,
          roleTitle: aiPersona.roleTitle,
          seatNumber: seat,
        });
      }
    }

    debate.participants = filledParticipants.sort((a, b) => a.seatNumber - b.seatNumber);
    debate.status = 'active';
    await debate.save();

    await syncRedisParticipants(debate);

    const serialized = serializeParticipants(debate.participants);
    const io = req.app.get('io');
    if (io) {
      io.to(debate._id.toString()).emit('gd_table_update', {
        participants: serialized,
        roomCode: debate.roomCode,
        capacity,
        status: 'active',
      });
      io.to(debate._id.toString()).emit('gd_session_started', {
        debateId: debate._id.toString(),
        status: 'active',
        participants: serialized,
      });
    }

    return res.status(200).json({
      debateId: debate._id,
      status: debate.status,
      participants: serialized,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in startGDFromLobby controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}



async function endDebate(req, res) {
  try {
    const { durationSecs, tzOffsetMinutes } = req.body;
    const debateId = req.params.id;
    const tzOffset = typeof tzOffsetMinutes === 'number' ? tzOffsetMinutes : 0;

    const debate = await Debate.findOne({ _id: debateId, userId: req.user.id });
    if (!debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    if (debate.endedAt) {
      return res.status(400).json({ error: 'Debate already ended' });
    }

    // Determine winner securely:
    // If debate already has a judge verdict (from the WebSocket AI judge), use it.
    // Otherwise, this is a forfeit or early exit via HTTP endpoint, so force 'ai' as winner.
    let resolvedWinner = 'ai';
    if (debate.judgeScore && debate.judgeScore.winner) {
      resolvedWinner = debate.judgeScore.winner;
    }

    const result = await debateEngine.finalizeDebate(req.user.id, debateId, resolvedWinner, durationSecs, tzOffset);

    const io = req.app.get('io');
    if (io) {
      io.to(debateId).emit('debate_ended', {
        winner: resolvedWinner,
        userFinalScore: result.avgScore,
        endedByHost: true,
        message: 'The host has ended the Group Discussion session.',
      });
    }

    return res.status(200).json({
      winner: resolvedWinner,
      userFinalScore: result.avgScore,
      newElo: result.newElo,
      streak: {
        current: result.freshUser.streak?.current || 0,
        longest: result.freshUser.streak?.longest || 0,
        milestoneReached: result.streakResult.milestoneReached,
        freezeUsed: result.streakResult.freezeUsed,
      },
      message: 'Debate ended',
    });
  } catch (error) {
    if (error.message === 'Debate not found' || error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    // eslint-disable-next-line no-console
    console.error('Error in endDebate controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  startDebate,
  getDebateHistory,
  getDebateById,
  endDebate,
  joinGDRoomByCode,
  startGDFromLobby,
};

