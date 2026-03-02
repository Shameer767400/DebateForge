const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { User, Debate } = require('../models');
const redisClient = require('../config/redis');

/* ── Multer config for avatar uploads ── */
const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${req.user.id}_${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
    }
  },
}).single('avatar');

async function uploadProfilePic(req, res) {
  avatarUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    try {
      const picUrl = `/uploads/avatars/${req.file.filename}`;
      await User.findByIdAndUpdate(req.user.id, { profilePicUrl: picUrl });
      return res.status(200).json({ profilePicUrl: picUrl });
    } catch (error) {
      console.error('Error uploading profile pic:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}

async function removeProfilePic(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (user?.profilePicUrl) {
      const filePath = path.join(__dirname, '..', user.profilePicUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      user.profilePicUrl = null;
      await user.save();
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error removing profile pic:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateBio(req, res) {
  try {
    const bio = (req.body.bio ?? '').slice(0, 200);
    await User.findByIdAndUpdate(req.user.id, { bio });
    return res.status(200).json({ bio });
  } catch (error) {
    console.error('Error updating bio:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getMyProfile(req, res) {
  try {
    const userPromise = User.findById(req.user.id).select('-passwordHash');

    const statsPromise = Debate.aggregate([
      {
        $match: { userId: new mongoose.Types.ObjectId(req.user.id) },
      },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$userFinalScore' },
          totalDebates: { $sum: 1 },
        },
      },
    ]);

    const [user, stats] = await Promise.all([userPromise, statsPromise]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const aggregated = stats[0] || { avgScore: null, totalDebates: 0 };

    return res.status(200).json({
      user,
      stats: {
        avgScore: aggregated.avgScore,
        totalDebates: aggregated.totalDebates,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in getMyProfile controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getFallacyProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select('fallacyProfile');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const map = user.fallacyProfile || new Map();
    const entries =
      map instanceof Map ? Array.from(map.entries()) : Object.entries(map.toObject ? map.toObject() : map);

    if (!entries.length) {
      return res.status(200).json({ fallacies: [] });
    }

    const total = entries.reduce((sum, [, count]) => sum + (count || 0), 0) || 1;

    const fallacies = entries
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round(((count || 0) / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    return res.status(200).json({ fallacies });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in getFallacyProfile controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getLeaderboard(req, res) {
  try {
    if (redisClient) {
      const cached = await redisClient.get('leaderboard');
      if (cached) {
        const parsed = JSON.parse(cached);
        return res.status(200).json({ leaderboard: parsed, cached: true });
      }
    }

    const users = await User.find({})
      .select('username eloRating wins losses totalDebates')
      .sort({ eloRating: -1 })
      .limit(50);

    const ranked = users.map((u, index) => ({
      rank: index + 1,
      username: u.username,
      eloRating: u.eloRating,
      wins: u.wins,
      losses: u.losses,
      totalDebates: u.totalDebates,
    }));

    if (redisClient) {
      redisClient.setex('leaderboard', 60, JSON.stringify(ranked));
    }

    return res.status(200).json({ leaderboard: ranked, cached: false });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in getLeaderboard controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getMyProfile,
  getFallacyProfile,
  getLeaderboard,
  uploadProfilePic,
  removeProfilePic,
  updateBio,
};

