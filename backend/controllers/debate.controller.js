const { User, Topic, Debate } = require('../models');

async function startDebate(req, res) {
  try {
    const { topicId, customTopic, side, userSide, difficulty } = req.body;

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

    const debate = new Debate({
      userId: req.user.id,
      topicId: resolvedTopicId,
      topicSnapshot,
      userSide: resolvedSide,
      difficulty: resolvedDifficulty,
      arguments: [],
    });

    await debate.save();

    return res.status(201).json({
      debateId: debate._id,
      topicSnapshot: debate.topicSnapshot,
      userSide: debate.userSide,
      difficulty: debate.difficulty,
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
      userId: req.user.id,
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

async function checkAchievements(userId, user, winner) {
  if (!user) {
    // Reload user if not provided
    // eslint-disable-next-line no-param-reassign
    user = await User.findById(userId);
    if (!user) return;
  }

  const achievementsToAdd = [];

  
  // first_debate
  if (user.totalDebates === 1) {
    achievementsToAdd.push('first_debate');
  }

  // 10_wins
  if (user.wins === 10) {
    achievementsToAdd.push('10_wins');
  }

  // logic_master: avg userFinalScore > 80 in last 5 debates
  const recentDebates = await Debate.find({
    userId,
    userFinalScore: { $ne: null },
  })
    .sort({ endedAt: -1 })
    .limit(5);

  if (recentDebates.length > 0) {
    const avg =
      recentDebates.reduce((sum, d) => sum + (d.userFinalScore || 0), 0) /
      recentDebates.length;

    if (avg > 80) {
      achievementsToAdd.push('logic_master');
    }
  }

  if (achievementsToAdd.length > 0) {
    await User.findByIdAndUpdate(userId, {
      $addToSet: { achievements: { $each: achievementsToAdd } },
    });
  }
}

async function endDebate(req, res) {
  try {
    const { winner, durationSecs } = req.body;
    const debateId = req.params.id;

    const debate = await Debate.findOne({
      _id: debateId,
      userId: req.user.id,
    });

    if (!debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    const avgScore = debate.getAverageScore();

    await Debate.findByIdAndUpdate(debateId, {
      winner,
      userFinalScore: avgScore,
      durationSecs,
      endedAt: new Date(),
    });

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const K = user.totalDebates < 10 ? 32 : user.totalDebates < 50 ? 16 : 8;
    const AI_RATING = 1200;
    const expected = 1 / (1 + Math.pow(10, (AI_RATING - user.eloRating) / 400));
    const actual = winner === 'user' ? 1 : winner === 'draw' ? 0.5 : 0;
    const newElo = Math.round(user.eloRating + K * (actual - expected));

    const statUpdate = {
      totalDebates: 1,
      eloRating: newElo - user.eloRating,
    };

    if (winner === 'user') {
      statUpdate.wins = 1;
    } else if (winner === 'ai') {
      statUpdate.losses = 1;
    } else if (winner === 'draw') {
      statUpdate.draws = 1;
    }

    await User.findByIdAndUpdate(req.user.id, { $inc: statUpdate });

    // Update fallacy profile
    const fallacyInc = {};
    debate.getUserArguments().forEach((arg) => {
      if (arg.fallacy && arg.fallacy.detected && arg.fallacy.type) {
        const key = `fallacyProfile.${arg.fallacy.type}`;
        // eslint-disable-next-line no-unused-expressions
        fallacyInc[key] ? (fallacyInc[key] += 1) : (fallacyInc[key] = 1);
      }
    });

    if (Object.keys(fallacyInc).length > 0) {
      await User.findByIdAndUpdate(req.user.id, { $inc: fallacyInc });
    }

    await checkAchievements(req.user.id, user, winner);

    return res.status(200).json({
      winner,
      userFinalScore: avgScore,
      newElo,
      message: 'Debate ended',
    });
  } catch (error) {
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
};

