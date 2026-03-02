const express = require('express');

const {
  getMyProfile,
  getFallacyProfile,
  getLeaderboard,
  uploadProfilePic,
  removeProfilePic,
  updateBio,
} = require('../controllers/profile.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/me', protect, getMyProfile);
router.get('/fallacies', protect, getFallacyProfile);
router.get('/leaderboard', protect, getLeaderboard);
router.post('/avatar', protect, uploadProfilePic);
router.delete('/avatar', protect, removeProfilePic);
router.put('/bio', protect, updateBio);

module.exports = router;

