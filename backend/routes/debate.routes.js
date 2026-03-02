const express = require('express');

const {
  startDebate,
  getDebateHistory,
  getDebateById,
  endDebate,
} = require('../controllers/debate.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes use protect middleware
router.use(protect);

router.post('/start', startDebate);
router.get('/history', getDebateHistory);
router.get('/:id', getDebateById);
router.post('/:id/end', endDebate);

module.exports = router;

