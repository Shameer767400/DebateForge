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

/* ══════════════════════════════════════════════
   PUBLIC ROUTES
═══════════════════════════════════════════════ */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     description: |
 *       Creates a new user with bcrypt-hashed password. Sends a 6-digit OTP to
 *       the user's email for verification. Includes honeypot field detection for
 *       bot prevention. If an unverified account with the same email exists, it
 *       is replaced.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *                 example: debater42
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: SecurePass1!
 *     responses:
 *       201:
 *         description: User registered successfully. JWT token returned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error (weak password, missing fields)
 *       409:
 *         description: Email or username already taken
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     description: |
 *       Authenticates the user. Returns a JWT token in both the response body
 *       and an HTTP-only cookie. Implements account lockout after 10 consecutive
 *       failed attempts (30-minute lockout window).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked due to too many failed attempts
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and clear auth cookie
 *     responses:
 *       200:
 *         description: Cookie cleared
 */
router.post('/logout', logout);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     description: Sends a password reset link via email. Token is SHA-256 hashed and expires in 1 hour.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent (returns 200 even if email not found for security)
 */
router.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using the emailed token
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password/:token', resetPassword);

/**
 * @swagger
 * /api/auth/verify-email-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email address using 6-digit OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/verify-email-otp', verifyEmailOTP);

/**
 * @swagger
 * /api/auth/session:
 *   get:
 *     tags: [Auth]
 *     summary: Check current authentication status
 *     description: Returns whether the user is authenticated. Always returns 200 (never 401).
 *     responses:
 *       200:
 *         description: Session status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authenticated:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 */
router.get('/session', checkSession);

/* ══════════════════════════════════════════════
   PROTECTED ROUTES (require JWT)
═══════════════════════════════════════════════ */

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user's profile
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *       401:
 *         description: Not authenticated
 */
router.get('/me', protect, getMe);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh JWT token
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: New token issued
 *       401:
 *         description: Invalid or expired token
 */
router.post('/refresh', protect, refresh);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password (requires current password)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed
 *       401:
 *         description: Current password incorrect
 */
router.post('/change-password', protect, changePassword);

/**
 * @swagger
 * /api/auth/resend-verification-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend email verification OTP
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: OTP resent
 *       429:
 *         description: Rate limited (too many resend attempts)
 */
router.post('/resend-verification-otp', protect, resendVerificationOTP);

module.exports = router;
