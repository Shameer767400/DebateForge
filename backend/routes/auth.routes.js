const express = require('express');

const {
  register,
  login,
  getMe,
  refresh,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

/* ── Public routes ── */
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.get('/verify-email/:token', verifyEmail);

/* ── Protected routes ── */
router.get('/me', protect, getMe);
router.post('/refresh', protect, refresh);
router.post('/change-password', protect, changePassword);
router.post('/resend-verification', protect, resendVerification);

module.exports = router;
