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
    // eslint-disable-next-line no-param-reassign
    user = await User.findById(userId);
    if (!user) return;
  }

  // Moved Debate import to top of file or assumed it's already available via closure
  // const { Debate } = require('../models'); // This line is removed as Debate is already imported at the top
  const achievementsToAdd = [];

  /* first_debate */
  if (user.totalDebates === 1) {
    achievementsToAdd.push('first_debate');
  }

  /* 10_wins */
  if (user.wins === 10) {
    achievementsToAdd.push('10_wins');
  }

  /* Fetch recent debates once for multi-achievement checks */
  const recentDebates = await Debate.find({
    userId,
    userFinalScore: { $ne: null },
  })
    .sort({ endedAt: -1 })
    .limit(10);

  /* logic_master: avg overall score > 80 in last 5 debates */
  const last5 = recentDebates.slice(0, 5);
  if (last5.length > 0) {
    const avgOverall = last5.reduce((sum, d) => sum + (d.userFinalScore || 0), 0) / last5.length;
    if (avgOverall > 80) achievementsToAdd.push('logic_master');
  }

  /* evidence_king: avg evidence score > 85 in last 5 debates */
  const evidenceScores = last5
    .flatMap((d) => d.getUserArguments ? d.getUserArguments() : [])
    .map((a) => a.scores?.evidence)
    .filter((s) => s != null);
  if (evidenceScores.length > 0) {
    const avgEvidence = evidenceScores.reduce((s, v) => s + v, 0) / evidenceScores.length;
    if (avgEvidence > 85) achievementsToAdd.push('evidence_king');
  }

  /* no_fallacy_streak_3: last 3 completed debates had zero fallacies */
  const last3 = recentDebates.slice(0, 3);
  if (last3.length === 3) {
    const allClean = last3.every((d) => {
      const userArgs = d.getUserArguments ? d.getUserArguments() : [];
      return userArgs.every((a) => !a.fallacy?.detected);
    });
    if (allClean) achievementsToAdd.push('no_fallacy_streak_3');
  }

  /* comeback_king: won this debate after having a score < DRAW threshold in round 3 */
  if (winner === 'user' && recentDebates.length > 0) {
    const latestDebate = await Debate.findOne({ userId }).sort({ endedAt: -1 });
    if (latestDebate) {
      const userArgs = latestDebate.getUserArguments ? latestDebate.getUserArguments() : [];
      const round3Arg = userArgs.find((a) => a.turnNumber === 3);
      if (round3Arg && (round3Arg.scores?.overall ?? 100) < SCORE_THRESHOLDS.DRAW) {
        achievementsToAdd.push('comeback_king');
      }
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
    const { AI_ELO_RATING } = require('../config/constants');
    const expected = 1 / (1 + Math.pow(10, (AI_ELO_RATING - user.eloRating) / 400));
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

