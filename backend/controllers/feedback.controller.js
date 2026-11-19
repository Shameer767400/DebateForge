const Feedback = require('../models/Feedback');
const { Debate, User } = require('../models');

/**
 * Strip HTML tags from a string.
 */
function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * POST / — Submit feedback (one per user).
 * Requires the user to have actually used the platform (at least 1 debate).
 */
exports.submitFeedback = async (req, res) => {
  try {
    const { rating, reviewText, category, isPublic } = req.body;

    // Validate that the user has actually used the platform
    const user = await User.findById(req.user.id);
    const debatesCount = await Debate.countDocuments({ userId: req.user.id });
    const hasUsedApp = (user && user.totalDebates > 0) || debatesCount > 0;

    if (!hasUsedApp) {
      return res.status(403).json({
        error: 'Please explore and participate in at least one debate before submitting a review! We value feedback based on your real experience.',
        requiresActivity: true,
      });
    }

    // Validate rating
    if (rating == null || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Validate reviewText
    if (!reviewText || typeof reviewText !== 'string') {
      return res.status(400).json({ error: 'Review text is required' });
    }
    const sanitized = stripHtml(reviewText).trim();
    if (sanitized.length < 10 || sanitized.length > 1000) {
      return res.status(400).json({ error: 'Review text must be between 10 and 1000 characters' });
    }

    // Validate category
    const validCategories = ['review', 'suggestion', 'feature_request', 'bug_report'];
    if (category && !validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Check for duplicate
    const existing = await Feedback.findOne({ userId: req.user.id });
    if (existing) {
      return res.status(409).json({ error: 'You have already submitted feedback' });
    }

    const feedback = await Feedback.create({
      userId: req.user.id,
      username: req.user.username,
      rating,
      reviewText: sanitized,
      category: category || 'review',
      isPublic: !!isPublic,
    });

    return res.status(201).json({ message: 'Feedback submitted successfully', feedback });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

/**
 * GET /me — Get the authenticated user's feedback and eligibility.
 */
exports.getMyFeedback = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const debatesCount = await Debate.countDocuments({ userId: req.user.id });
    const hasUsedApp = (user && user.totalDebates > 0) || debatesCount > 0;

    const feedback = await Feedback.findOne({ userId: req.user.id });
    return res.status(200).json({
      feedback: feedback || null,
      eligible: hasUsedApp,
      totalDebates: user?.totalDebates || debatesCount || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

/**
 * PUT /me — Update the authenticated user's feedback.
 */
exports.updateMyFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findOne({ userId: req.user.id });
    if (!feedback) {
      return res.status(404).json({ error: 'No feedback found' });
    }

    const { rating, reviewText, category, isPublic } = req.body;

    if (rating != null) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }
      feedback.rating = rating;
    }

    if (reviewText != null) {
      const sanitized = stripHtml(reviewText).trim();
      if (sanitized.length < 10 || sanitized.length > 1000) {
        return res.status(400).json({ error: 'Review text must be between 10 and 1000 characters' });
      }
      feedback.reviewText = sanitized;
    }

    const validCategories = ['review', 'suggestion', 'feature_request', 'bug_report'];
    if (category != null) {
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }
      feedback.category = category;
    }

    if (isPublic != null) {
      feedback.isPublic = !!isPublic;
    }

    await feedback.save();
    return res.status(200).json({ message: 'Feedback updated successfully', feedback });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

/**
 * DELETE /me — Delete the authenticated user's feedback.
 */
exports.deleteMyFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findOneAndDelete({ userId: req.user.id });
    if (!feedback) {
      return res.status(404).json({ error: 'No feedback found' });
    }
    return res.status(200).json({ message: 'Feedback deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

/**
 * GET /public — Get approved public feedback (no auth required).
 */
exports.getPublicFeedback = async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10) || 10;
    if (limit < 1) limit = 1;
    if (limit > 50) limit = 50;

    const feedback = await Feedback.find({
      isPublic: true,
      isApproved: true,
      isHidden: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('username rating reviewText category createdAt');

    return res.status(200).json({ feedback });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

/**
 * GET /stats — Aggregate feedback statistics (no auth required).
 */
exports.getFeedbackStats = async (req, res) => {
  try {
    const [stats] = await Feedback.aggregate([
      { $match: { isHidden: false } },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          averageRating: { $avg: '$rating' },
        },
      },
    ]);

    const ratingCounts = await Feedback.aggregate([
      { $match: { isHidden: false } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);

    const categoryCounts = await Feedback.aggregate([
      { $match: { isHidden: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    // Build rating breakdown (1-5)
    const byRating = {};
    for (let i = 1; i <= 5; i++) byRating[i] = 0;
    for (const r of ratingCounts) byRating[r._id] = r.count;

    // Build category breakdown
    const byCategory = {};
    for (const c of categoryCounts) byCategory[c._id] = c.count;

    return res.status(200).json({
      totalCount: stats ? stats.totalCount : 0,
      averageRating: stats ? Math.round(stats.averageRating * 100) / 100 : 0,
      byRating,
      byCategory,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

/**
 * GET /admin — Admin: get all feedback (paginated, filterable).
 */
exports.adminGetAllFeedback = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.rating) filter.rating = parseInt(req.query.rating, 10);
    if (req.query.category) filter.category = req.query.category;
    if (req.query.isPublic !== undefined) filter.isPublic = req.query.isPublic === 'true';
    if (req.query.isApproved !== undefined) filter.isApproved = req.query.isApproved === 'true';
    if (req.query.isHidden !== undefined) filter.isHidden = req.query.isHidden === 'true';

    const [items, total] = await Promise.all([
      Feedback.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username email'),
      Feedback.countDocuments(filter),
    ]);

    return res.status(200).json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

/**
 * PUT /admin/:id — Admin: moderate a feedback entry.
 */
exports.adminModerateFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    const { isApproved, isHidden, adminNote } = req.body;

    if (isApproved != null) feedback.isApproved = !!isApproved;
    if (isHidden != null) feedback.isHidden = !!isHidden;
    if (adminNote != null) {
      if (adminNote.length > 500) {
        return res.status(400).json({ error: 'Admin note must be 500 characters or fewer' });
      }
      feedback.adminNote = adminNote;
    }

    await feedback.save();
    return res.status(200).json({ message: 'Feedback moderated successfully', feedback });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};

/**
 * GET /admin/export — Admin: export all non-hidden feedback as JSON download.
 */
exports.adminExportFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.find({ isHidden: false }).lean();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="feedback-export.json"');
    return res.status(200).json(feedback);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};
