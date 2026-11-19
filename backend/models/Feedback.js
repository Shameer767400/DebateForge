const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 1000,
    },
    category: {
      type: String,
      enum: ['review', 'suggestion', 'feature_request', 'bug_report'],
      default: 'review',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    adminNote: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// Indexes
feedbackSchema.index({ isPublic: 1, isApproved: 1, isHidden: 1 });
feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
