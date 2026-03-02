const express = require('express');

const {
  getAllTopics,
  voteOnTopic,
  proposeTopic,
} = require('../controllers/topics.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', getAllTopics);
router.post('/vote/:id', protect, voteOnTopic);
router.post('/propose', protect, proposeTopic);

module.exports = router;

