const mongoose = require('mongoose');

const { Schema } = mongoose;

const topicSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 200,
    },
    category: {
      type: String,
      required: true,
      enum: ['technology', 'society', 'politics', 'education', 'environment', 'economy'],
    },
    difficulty: {
      type: String,
      required: true,
      enum: ['easy', 'medium', 'hard'],
    },
    voteCount: {
      type: Number,
      default: 0,
    },
    debateCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

topicSchema.statics.getByCategory = function getByCategory(category) {
  return this.find({ isActive: true, category }).sort({ debateCount: -1 });
};

topicSchema.statics.getAll = function getAll() {
  return this.find({ isActive: true }).sort({ category: 1, debateCount: -1 });
};

const Topic = mongoose.models.Topic || mongoose.model('Topic', topicSchema);

module.exports = Topic;

