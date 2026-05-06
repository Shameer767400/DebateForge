const express = require('express');
const {
  createRoom,
  joinRoom,
  getRoomById,
  listRooms,
} = require('../controllers/room.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// All room routes require authentication
router.use(protect);

router.post('/', createRoom);
router.post('/join', joinRoom);
router.get('/', listRooms);
router.get('/:id', getRoomById);

module.exports = router;
