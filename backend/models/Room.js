const mongoose = require('mongoose');

const { Schema } = mongoose;

/* ── Room Argument (multiplayer variant) ── */
const RoomArgumentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    team: { type: String, enum: ['for', 'against'], required: true },
    content: { type: String, required: true },
    scores: {
      logic:    { type: Number, min: 0, max: 100, default: null },
      evidence: { type: Number, min: 0, max: 100, default: null },
      clarity:  { type: Number, min: 0, max: 100, default: null },
      overall:  { type: Number, min: 0, max: 100, default: null },
    },
    fallacy: {
      detected:    { type: Boolean, default: false },
      type:        { type: String, default: null },
      confidence:  { type: Number, default: null },
      explanation: { type: String, default: null },
    },
    turnNumber: { type: Number, required: true },
    createdAt:  { type: Date, default: Date.now },
  },
  { _id: true }
);

/* ── Chat message (audience + debaters) ── */
const ChatMessageSchema = new Schema(
  {
    userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    text:     { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* ── AI Moderator comment ── */
const ModeratorCommentSchema = new Schema(
  {
    content:    { type: String, required: true },
    afterTurn:  { type: Number, default: null },
    createdAt:  { type: Date, default: Date.now },
  },
  { _id: false }
);

/* ── Main Room Schema ── */
const RoomSchema = new Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    hostId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    topic: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: 'waiting',
      enum: ['waiting', 'in_progress', 'voting', 'finished'],
    },

    /* ── Teams ── */
    teamFor: [{
      userId:   { type: Schema.Types.ObjectId, ref: 'User' },
      username: { type: String },
    }],
    teamAgainst: [{
      userId:   { type: Schema.Types.ObjectId, ref: 'User' },
      username: { type: String },
    }],
    audience: [{
      userId:   { type: Schema.Types.ObjectId, ref: 'User' },
      username: { type: String },
    }],

    /* ── Room config ── */
    maxTeamSize: {
      type: Number,
      default: 3,
      min: 1,
      max: 5,
    },
    maxRounds: {
      type: Number,
      default: 6,
      min: 2,
      max: 20,
    },
    turnTimerSecs: {
      type: Number,
      default: 120,  // 2 min per turn
      min: 30,
      max: 600,
    },

    /* ── Turn management ── */
    currentTurn: {
      type: Number,
      default: 0,
    },
    currentSpeaker: {
      userId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
      username: { type: String, default: null },
      team:     { type: String, enum: ['for', 'against'], default: null },
    },
    turnStartedAt: {
      type: Date,
      default: null,
    },

    /* ── Debate content ── */
    arguments:         [RoomArgumentSchema],
    chatMessages:      [ChatMessageSchema],
    moderatorComments: [ModeratorCommentSchema],

    /* ── Voting ── */
    votes: {
      for:     { type: Number, default: 0 },
      against: { type: Number, default: 0 },
    },
    votedUsers: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],

    /* ── Results ── */
    winner: {
      type: String,
      default: null,
      enum: ['for', 'against', 'draw', null],
    },
    teamForScore: {
      type: Number,
      default: null,
    },
    teamAgainstScore: {
      type: Number,
      default: null,
    },
    aiFeedback: {
      type: String,
      default: null,
    },

    /* ── Timestamps ── */
    startedAt: { type: Date, default: null },
    endedAt:   { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

/* ── Indexes ── */
RoomSchema.index({ hostId: 1, createdAt: -1 });
RoomSchema.index({ status: 1 });

/* ── Helpers ── */
RoomSchema.methods.getAllParticipantIds = function getAllParticipantIds() {
  const ids = new Set();
  ids.add(this.hostId.toString());
  this.teamFor.forEach(m => ids.add(m.userId.toString()));
  this.teamAgainst.forEach(m => ids.add(m.userId.toString()));
  this.audience.forEach(m => ids.add(m.userId.toString()));
  return [...ids];
};

RoomSchema.methods.getTeamAvgScore = function getTeamAvgScore(team) {
  const teamArgs = this.arguments.filter(a => a.team === team && a.scores?.overall != null);
  if (!teamArgs.length) return 0;
  return Math.round(teamArgs.reduce((s, a) => s + a.scores.overall, 0) / teamArgs.length);
};

RoomSchema.statics.generateRoomCode = function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I for clarity
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const Room = mongoose.models.Room || mongoose.model('Room', RoomSchema);

module.exports = Room;
