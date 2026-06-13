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

/* ── Phase history sub-document (Addition 6) ── */
const PhaseEntrySchema = new Schema(
  {
    phase: { type: String, required: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    roundsInPhase: { type: Number, default: 0 },
  },
  { _id: false }
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

    /* ── Addition 6: Formal Debate Format Fields ── */
    format: {
      type: String,
      default: 'freeform',
      enum: ['freeform', 'oxford', 'lincoln_douglas', 'parliamentary'],
    },
    currentPhase: {
      type: String,
      default: 'opening',
      enum: ['opening', 'rebuttal', 'cross_examination', 'closing', 'judging', 'ended'],
    },
    judgeScore: {
      userScore: { type: Number, default: null },
      aiScore: { type: Number, default: null },
      feedback: { type: String, default: null },
      winner: { type: String, default: null },
      userStrengths: { type: String, default: null },
      userWeaknesses: { type: String, default: null },
      areasToImprove: {
        type: [String],
        default: [],
      },
      grammarMistakes: {
        type: [String],
        default: [],
      },
      reportCardHeadline: { type: String, default: null },
      improvementSummary: { type: String, default: null },
    },
    phaseHistory: [PhaseEntrySchema],
    /* ── End Addition 6 ── */

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

// Winner filter (win/loss stats, admin analytics)
DebateSchema.index({ winner: 1 });

// Topic analytics (which topics get debated most)
DebateSchema.index({ topicId: 1 });

// Format analytics (institution reporting: Oxford vs parliamentary usage)
DebateSchema.index({ format: 1, startedAt: -1 });

// organizationId placeholder — add this when multi-tenancy is implemented
// DebateSchema.index({ organizationId: 1, startedAt: -1 });


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
