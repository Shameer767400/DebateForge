const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const ctrl = require('../controllers/feedback.controller');

router.get('/public', ctrl.getPublicFeedback);
router.get('/stats', ctrl.getFeedbackStats);
router.post('/', protect, ctrl.submitFeedback);
router.get('/me', protect, ctrl.getMyFeedback);
router.put('/me', protect, ctrl.updateMyFeedback);
router.delete('/me', protect, ctrl.deleteMyFeedback);
router.get('/admin', protect, requireRole(['admin']), ctrl.adminGetAllFeedback);
router.put('/admin/:id', protect, requireRole(['admin']), ctrl.adminModerateFeedback);
router.get('/admin/export', protect, requireRole(['admin']), ctrl.adminExportFeedback);

module.exports = router;
