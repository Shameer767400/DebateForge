const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const ctrl = require('../controllers/feedback.controller');

// Rate limit feedback write submissions to 10 per hour per IP
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feedback submissions. Please try again later.' },
});

router.get('/public', ctrl.getPublicFeedback);
router.get('/stats', ctrl.getFeedbackStats);
router.post('/', protect, feedbackLimiter, ctrl.submitFeedback);
router.get('/me', protect, ctrl.getMyFeedback);
router.put('/me', protect, feedbackLimiter, ctrl.updateMyFeedback);
router.delete('/me', protect, ctrl.deleteMyFeedback);
router.get('/admin', protect, requireRole(['admin']), ctrl.adminGetAllFeedback);
router.put('/admin/:id', protect, requireRole(['admin']), ctrl.adminModerateFeedback);
router.get('/admin/export', protect, requireRole(['admin']), ctrl.adminExportFeedback);

module.exports = router;
