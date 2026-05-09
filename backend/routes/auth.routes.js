const express = require('express');

const {
  register,
  login,
  logout,
  checkSession,
  getMe,
  refresh,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmailOTP,
  resendVerificationOTP,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

/* ── Public routes ── */
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/verify-email-otp', verifyEmailOTP);

// Session check — always returns 200 (no 401 errors in console)
router.get('/session', checkSession);

/* ── Protected routes ── */
router.get('/me', protect, getMe);
router.post('/refresh', protect, refresh);
router.post('/change-password', protect, changePassword);
router.post('/resend-verification-otp', protect, resendVerificationOTP);

module.exports = router;
