const mongoose = require('mongoose');

const { Schema } = mongoose;

const ArgumentSchema = new Schema(
  {
    speaker: {
      type: String,
      required: true,
      enum: ['user', 'ai'],
    },
    content: {
      type: String,
      required: true,
    },
    scores: {
      logic: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },
      evidence: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },
      clarity: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },
      overall: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },
      // overall = Math.round((logic + evidence + clarity) / 3)
      // computed and stored when scores are saved
    },
    fallacy: {
      detected: {
        type: Boolean,
        default: false,
      },
      type: {
        type: String,
        default: null,
      },
      confidence: {
        type: Number,
        default: null, // 0-100
      },
      explanation: {
        type: String,
        default: null,
      },
    },
    turnNumber: {
      type: Number,
      required: true,
    },
    audioDuration: {
      type: Number,
      default: null, // seconds of audio
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const DebateSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    topicId: {
      type: Schema.Types.ObjectId,
      ref: 'Topic',
      default: null,
    },
    topicSnapshot: {
      type: String,
      required: true,
      // Store the topic title at debate start
      // so if topic is deleted, we still have the text
    },
    userSide: {
      type: String,
      required: true,
      enum: ['for', 'against'],
    },
    difficulty: {
      type: String,
      required: true,
      enum: ['beginner', 'intermediate', 'expert', 'devils_advocate'],
    },
    persona: {
      type: String,
      default: 'balanced',
      enum: ['balanced', 'socratic', 'aggressive', 'academic', 'casual'],
    },
    arguments: [ArgumentSchema], // EMBEDDED array of all turns
    totalRounds: {
      type: Number,
      default: 0,
    },
    winner: {
      type: String,
      default: null,
      enum: ['user', 'ai', 'draw', null],
    },
    userFinalScore: {
      type: Number,
      default: null,
    },
    durationSecs: {
      type: Number,
      default: null,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

DebateSchema.index({ userId: 1, startedAt: -1 });

DebateSchema.methods.getUserArguments = function getUserArguments() {
  return this.arguments.filter((a) => a.speaker === 'user');
};

DebateSchema.methods.getAverageScore = function getAverageScore() {
  const userArgs = this.getUserArguments().filter(
    (a) => a.scores && a.scores.overall != null
  );
  if (!userArgs.length) return 0;

  const total = userArgs.reduce((sum, a) => sum + a.scores.overall, 0);
  return Math.round(total / userArgs.length);
};

const Debate = mongoose.models.Debate || mongoose.model('Debate', DebateSchema);

module.exports = Debate;

