const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { User } = require('../models');
const redisClient = require('../config/redis');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email.service');
const secLogger = require('../services/security-logger.service');

/* ── Config (from env with sane defaults) ── */
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1d';
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5;
const LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES, 10) || 15;

/* ═══════════════════════════════════════════
   Validators
═══════════════════════════════════════════ */
function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Password must be >= 8 chars with at least 1 uppercase, 1 digit, 1 special character.
 * This mirrors the frontend validation to prevent bypassing via direct API calls.
 */
function isStrongPassword(password) {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return false;
  return true;
}

/* ═══════════════════════════════════════════
   Helper: mint a JWT
═══════════════════════════════════════════ */
function mintToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/* ═══════════════════════════════════════════
   Helper: per-account login lockout (Redis-backed)
═══════════════════════════════════════════ */
async function getLoginAttempts(email) {
  try {
    const val = await redisClient.get(`loginAttempts:${email}`);
    return parseInt(val, 10) || 0;
  } catch {
    return 0; // If Redis is down, don't block logins
  }
}

async function incrementLoginAttempts(email) {
  try {
    const key = `loginAttempts:${email}`;
    const attempts = (await getLoginAttempts(email)) + 1;
    await redisClient.setex(key, LOCKOUT_MINUTES * 60, String(attempts));
    return attempts;
  } catch {
    /* noop — graceful degradation */
  }
}

async function clearLoginAttempts(email) {
  try {
    await redisClient.del(`loginAttempts:${email}`);
  } catch {
    /* noop */
  }
}

/* ═══════════════════════════════════════════
   POST /api/auth/register
═══════════════════════════════════════════ */
async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    /* ── Honeypot: invisible fields that only bots fill ── */
    if (req.body.website || req.body.phone) {
      secLogger.logHoneypotTriggered(req, 'register');
      // Return 200 to waste bot's time — it thinks it succeeded
      return res.status(200).json({ message: 'Registration successful' });
    }

    if (!username || !isValidUsername(username)) {
      return res
        .status(400)
        .json({ error: 'Username must be 3-30 characters, alphanumeric or underscore only' });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase letter, 1 number, and 1 special character',
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = new User({
      username,
      email,
      passwordHash,
      emailVerified: false,
    });

    // Generate email verification token
    const verificationToken = user.createEmailVerificationToken();
    await user.save();

    // Send verification email (non-blocking — don't let email failure block registration)
    sendVerificationEmail(email, verificationToken).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to send verification email:', err.message);
    });

    const token = mintToken(user);

    secLogger.logRegistration(req, username, email);

    return res.status(201).json({
      token,
      user: user.toSafeObject(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in register controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/auth/login
═══════════════════════════════════════════ */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    /* ── Honeypot: invisible fields that only bots fill ── */
    if (req.body.website || req.body.phone) {
      secLogger.logHoneypotTriggered(req, 'login');
      return res.status(200).json({ message: 'Login successful' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    /* ── Check per-account lockout ── */
    const attempts = await getLoginAttempts(email);
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      return res.status(429).json({
        error: `Account temporarily locked. Please try again in ${LOCKOUT_MINUTES} minutes.`,
        locked: true,
        lockoutMinutes: LOCKOUT_MINUTES,
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Increment even for non-existent users to prevent user enumeration timing attacks
      await incrementLoginAttempts(email);
      secLogger.logLoginFailed(req, email, 'user not found', MAX_LOGIN_ATTEMPTS - (attempts + 1));
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    /* ── Check DB-level lockout (fallback if Redis was down when lock was set) ── */
    if (user.isLocked()) {
      return res.status(429).json({
        error: `Account temporarily locked. Please try again later.`,
        locked: true,
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      const newAttempts = await incrementLoginAttempts(email);

      // Also track in DB as fallback
      const update = { $inc: { loginAttempts: 1 } };
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        update.lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }
      await User.findByIdAndUpdate(user._id, update);

      const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;

      if (remaining <= 0) {
        secLogger.logAccountLocked(req, email);
      } else {
        secLogger.logLoginFailed(req, email, 'wrong password', remaining);
      }

      return res.status(401).json({
        error: remaining > 0
          ? `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : `Account locked. Please try again in ${LOCKOUT_MINUTES} minutes.`,
        attemptsRemaining: Math.max(0, remaining),
      });
    }

    /* ── Successful login — reset counters ── */
    await clearLoginAttempts(email);
    await User.findByIdAndUpdate(user._id, {
      lastActive: new Date(),
      loginAttempts: 0,
      lockUntil: null,
    });

    const token = mintToken(user);

    secLogger.logLoginSuccess(req, user);

    return res.status(200).json({
      token,
      user: user.toSafeObject(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in login controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════
   GET /api/auth/me
═══════════════════════════════════════════ */
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in getMe controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/auth/refresh
═══════════════════════════════════════════ */
async function refresh(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const token = mintToken(user);
    return res.status(200).json({ token, user });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in refresh controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/auth/change-password (protected)
═══════════════════════════════════════════ */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters with 1 uppercase letter, 1 number, and 1 special character',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    secLogger.logPasswordChanged(req, req.user.id);

    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in changePassword controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/auth/forgot-password (public)
═══════════════════════════════════════════ */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Always respond with success to prevent user enumeration
    const successMsg = 'If an account with that email exists, a reset link has been sent.';

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ message: successMsg });
    }

    const rawToken = user.createPasswordResetToken();
    await user.save();

    await sendPasswordResetEmail(email, rawToken);

    secLogger.logPasswordReset(req, email);

    return res.status(200).json({ message: successMsg });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in forgotPassword controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/auth/reset-password/:token (public)
═══════════════════════════════════════════ */
async function resetPassword(req, res) {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase letter, 1 number, and 1 special character',
      });
    }

    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Clear Redis lockout too
    await clearLoginAttempts(user.email);

    return res.status(200).json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in resetPassword controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════
   GET /api/auth/verify-email/:token (public)
═══════════════════════════════════════════ */
async function verifyEmail(req, res) {
  try {
    const { token } = req.params;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({ emailVerificationToken: hashedToken });

    if (!user) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    if (user.emailVerified) {
      return res.status(200).json({ message: 'Email already verified' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    await user.save();

    return res.status(200).json({ message: 'Email verified successfully!' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in verifyEmail controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/auth/resend-verification (protected)
═══════════════════════════════════════════ */
async function resendVerification(req, res) {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    const verificationToken = user.createEmailVerificationToken();
    await user.save();

    await sendVerificationEmail(user.email, verificationToken);

    return res.status(200).json({ message: 'Verification email sent' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in resendVerification controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  register,
  login,
  getMe,
  refresh,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
};
