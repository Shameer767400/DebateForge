const { User, Topic, Debate } = require('../models');
const { updateStreak } = require('../services/streak.service');
const debateEngine = require('../services/debateEngine.service');

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
      participants.push({
        userId: req.user.id,
        name: req.user.name || 'Candidate 1 (Host)',
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
      (p) => p.userId && p.userId.toString() === req.user.id
    );

    let seatNumber;
    if (existingIndex !== -1) {
      seatNumber = debate.participants[existingIndex].seatNumber;
    } else {
      if ((debate.participants || []).length >= (debate.capacity || 4)) {
        return res.status(400).json({ error: 'This GD table is already full (maximum 4 participants)' });
      }
      seatNumber = (debate.participants || []).length + 1;
      debate.participants.push({
        userId: req.user.id,
        name: req.user.name || `Candidate ${seatNumber}`,
        seatNumber,
      });
      await debate.save();
    }

    return res.status(200).json({
      debateId: debate._id,
      roomCode: debate.roomCode,
      topicSnapshot: debate.topicSnapshot,
      format: debate.format,
      status: debate.status,
      language: debate.language,
      seatNumber,
      participants: debate.participants,
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

    debate.status = 'active';
    await debate.save();

    const io = req.app.get('io');
    if (io) {
      io.to(debate._id.toString()).emit('gd_session_started', {
        debateId: debate._id.toString(),
        status: 'active',
        participants: debate.participants,
      });
    }

    return res.status(200).json({
      debateId: debate._id,
      status: debate.status,
      participants: debate.participants,
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

