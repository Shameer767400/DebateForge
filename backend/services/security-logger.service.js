'use strict';

/**
 * Security Logger — structured logging for auth attempts,
 * API errors, rate-limit violations, and suspicious patterns.
 *
 * In development: logs to console with color-coded severity.
 * In production: logs structured JSON to stdout (ready for
 *   CloudWatch, Datadog, ELK, etc.)
 */

const fs = require('fs');
const path = require('path');

const IS_PROD = process.env.NODE_ENV === 'production';

/* ── Log file path (append mode) ── */
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const securityLogStream = fs.createWriteStream(
  path.join(LOG_DIR, 'security.log'),
  { flags: 'a' }
);

/* ── Severity levels ── */

// Handle write stream errors gracefully
securityLogStream.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[SECURITY LOGGER ERROR]', err.message);
});
const LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ALERT: 'ALERT',   // Needs attention
  CRITICAL: 'CRITICAL', // Immediate action required
};

const COLORS = {
  INFO: '\x1b[36m',     // Cyan
  WARN: '\x1b[33m',     // Yellow
  ALERT: '\x1b[31m',    // Red
  CRITICAL: '\x1b[35m', // Magenta
  RESET: '\x1b[0m',
};

/**
 * Core log function — writes to both console and file.
 * @param {string} level - 'INFO' | 'WARN' | 'ALERT' | 'CRITICAL'
 * @param {string} category - e.g. 'AUTH', 'RATE_LIMIT', 'API_ERROR'
 * @param {string} message - Human-readable description
 * @param {object} [meta] - Extra data (IP, email, userId, etc.)
 */
function log(level, category, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...meta,
  };

  // Write structured JSON to log file
  securityLogStream.write(JSON.stringify(entry) + '\n');

  // Console output
  if (IS_PROD) {
    // Production: structured JSON to stdout (for log aggregators)
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    // Development: human-readable colored output
    const color = COLORS[level] || COLORS.RESET;
    // eslint-disable-next-line no-console
    console.log(
      `${color}[SECURITY:${level}]${COLORS.RESET} [${category}] ${message}`,
      Object.keys(meta).length > 0 ? meta : ''
    );
  }
}

/* ═══════════════════════════════════════════
   Helper functions for common security events
═══════════════════════════════════════════ */

/**
 * Extract client IP from request — handles proxies (X-Forwarded-For).
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.connection?.remoteAddress
    || req.ip
    || 'unknown';
}

/* ── Auth events ── */

function logLoginSuccess(req, user) {
  log(LEVELS.INFO, 'AUTH', `Login success: ${user.email}`, {
    ip: getClientIP(req),
    userId: user._id?.toString(),
    username: user.username,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  });
}

function logLoginFailed(req, email, reason, attemptsRemaining) {
  const level = attemptsRemaining <= 1 ? LEVELS.WARN : LEVELS.INFO;
  log(level, 'AUTH', `Login failed: ${email} — ${reason}`, {
    ip: getClientIP(req),
    email,
    attemptsRemaining,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  });
}

function logAccountLocked(req, email) {
  log(LEVELS.ALERT, 'AUTH', `Account LOCKED due to failed attempts: ${email}`, {
    ip: getClientIP(req),
    email,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  });
}

function logRegistration(req, username, email) {
  log(LEVELS.INFO, 'AUTH', `New registration: ${username} (${email})`, {
    ip: getClientIP(req),
    username,
    email,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  });
}

function logPasswordReset(req, email) {
  log(LEVELS.INFO, 'AUTH', `Password reset requested: ${email}`, {
    ip: getClientIP(req),
    email,
  });
}

function logPasswordChanged(req, userId) {
  log(LEVELS.INFO, 'AUTH', `Password changed by user`, {
    ip: getClientIP(req),
    userId,
  });
}

/* ── Rate limit events ── */

function logRateLimitHit(req, endpoint) {
  log(LEVELS.WARN, 'RATE_LIMIT', `Rate limit exceeded on ${endpoint}`, {
    ip: getClientIP(req),
    endpoint,
    method: req.method,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  });
}

/* ── Bot detection ── */

function logBotBlocked(req) {
  log(LEVELS.WARN, 'BOT_DEFENSE', `Bot blocked`, {
    ip: getClientIP(req),
    path: req.originalUrl,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  });
}

function logHoneypotTriggered(req, endpoint) {
  log(LEVELS.ALERT, 'BOT_DEFENSE', `Honeypot triggered on ${endpoint}`, {
    ip: getClientIP(req),
    endpoint,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  });
}

/* ── API errors ── */

function logAPIError(req, error, statusCode) {
  const level = statusCode >= 500 ? LEVELS.ALERT : LEVELS.WARN;
  log(level, 'API_ERROR', `${req.method} ${req.originalUrl} → ${statusCode}`, {
    ip: getClientIP(req),
    method: req.method,
    path: req.originalUrl,
    statusCode,
    error: error?.message || String(error),
    stack: IS_PROD ? undefined : error?.stack?.split('\n').slice(0, 3).join(' | '),
  });
}

/* ── Suspicious patterns ── */

function logSuspiciousActivity(req, reason, meta = {}) {
  log(LEVELS.ALERT, 'SUSPICIOUS', reason, {
    ip: getClientIP(req),
    path: req.originalUrl,
    method: req.method,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    ...meta,
  });
}

/* ── Startup / shutdown ── */

function logStartup(port, nodeEnv) {
  log(LEVELS.INFO, 'SYSTEM', `Server started on port ${port} [env=${nodeEnv}]`, {
    port,
    nodeEnv,
    nodeVersion: process.version,
  });
}

function logShutdown(signal) {
  log(LEVELS.INFO, 'SYSTEM', `Server shutting down (${signal})`);
}

module.exports = {
  log,
  LEVELS,
  getClientIP,
  logLoginSuccess,
  logLoginFailed,
  logAccountLocked,
  logRegistration,
  logPasswordReset,
  logPasswordChanged,
  logRateLimitHit,
  logBotBlocked,
  logHoneypotTriggered,
  logAPIError,
  logSuspiciousActivity,
  logStartup,
  logShutdown,
};
