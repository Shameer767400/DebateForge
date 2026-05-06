'use strict';

const { Room } = require('../models');

/**
 * POST /api/rooms
 * Create a new multiplayer debate room
 */
async function createRoom(req, res) {
  try {
    const { topic, maxTeamSize = 3, maxRounds = 6, turnTimerSecs = 120 } = req.body;

    if (!topic || topic.trim().length < 5) {
      return res.status(400).json({ error: 'Topic must be at least 5 characters.' });
    }

    // Generate unique room code
    let roomCode;
    let attempts = 0;
    do {
      roomCode = Room.generateRoomCode();
      attempts++;
    } while (await Room.findOne({ roomCode }) && attempts < 10);

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Could not generate unique room code. Try again.' });
    }

    const room = await Room.create({
      roomCode,
      hostId: req.user.id,
      topic: topic.trim(),
      maxTeamSize: Math.min(Math.max(maxTeamSize, 1), 5),
      maxRounds: Math.min(Math.max(maxRounds, 2), 20),
      turnTimerSecs: Math.min(Math.max(turnTimerSecs, 30), 600),
      // Host auto-joins Team For
      teamFor: [{ userId: req.user.id, username: req.user.username }],
    });

    return res.status(201).json({
      roomId: room._id,
      roomCode: room.roomCode,
      topic: room.topic,
      status: room.status,
    });
  } catch (error) {
    console.error('Error creating room:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/rooms/join
 * Join an existing room by code
 */
async function joinRoom(req, res) {
  try {
    const { roomCode } = req.body;

    if (!roomCode) {
      return res.status(400).json({ error: 'Room code is required.' });
    }

    const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    if (room.status !== 'waiting') {
      return res.status(400).json({ error: 'This room is no longer accepting participants.' });
    }

    // Check if user is already in the room
    const allIds = room.getAllParticipantIds();
    if (allIds.includes(req.user.id)) {
      // Already in — just return room info
      return res.json({
        roomId: room._id,
        roomCode: room.roomCode,
        topic: room.topic,
        status: room.status,
      });
    }

    // Default: join as audience
    room.audience.push({ userId: req.user.id, username: req.user.username });
    await room.save();

    return res.json({
      roomId: room._id,
      roomCode: room.roomCode,
      topic: room.topic,
      status: room.status,
    });
  } catch (error) {
    console.error('Error joining room:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/rooms/:id
 * Get room details
 */
async function getRoomById(req, res) {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    return res.json({ room });
  } catch (error) {
    console.error('Error getting room:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/rooms
 * List active / recent rooms
 */
async function listRooms(req, res) {
  try {
    const rooms = await Room.find({ status: { $in: ['waiting', 'in_progress'] } })
      .select('roomCode topic status teamFor teamAgainst audience hostId maxTeamSize createdAt')
      .sort({ createdAt: -1 })
      .limit(20);

    return res.json({ rooms });
  } catch (error) {
    console.error('Error listing rooms:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  createRoom,
  joinRoom,
  getRoomById,
  listRooms,
};
