require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const mongoose = require('mongoose');
const path = require('path');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/database');
const redisClient = require('./config/redis');

const authRoutes = require('./routes/auth');
const debateRoutes = require('./routes/debates');
const profileRoutes = require('./routes/profile');
const topicRoutes = require('./routes/topics');
const pushRoutes = require('./routes/push.routes');
const roomRoutes = require('./routes/room.routes');
const { scheduleNotificationJobs } = require('./jobs/notifications.job');
const secLogger = require('./services/security-logger.service');

const initWebSocket = require('./websocket/index');

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);

/* ═══════════════════════════════════════════
   0. STARTUP ENVIRONMENT VALIDATION
   — Fail fast if critical secrets are missing
═══════════════════════════════════════════ */
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
const RECOMMENDED_ENV = ['SMTP_USER', 'SMTP_PASS', 'REDIS_URL'];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.error(`❌ FATAL: Missing required env variable: ${key}`);
    process.exit(1);
  }
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.error('❌ FATAL: JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

for (const key of RECOMMENDED_ENV) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  Missing recommended env variable: ${key} — some features may not work`);
  }
}

/* ═══════════════════════════════════════════
   1. SECURITY HEADERS (Helmet)
   — Prevents clickjacking, XSS, MIME sniffing,
     and hides server identity
═══════════════════════════════════════════ */
app.use(helmet({
  contentSecurityPolicy: false,       // Let frontend handle CSP
  crossOriginEmbedderPolicy: false,   // Allow cross-origin audio/images
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

// Hide Express fingerprint — makes it harder for bots to identify the stack
app.disable('x-powered-by');

/* ═══════════════════════════════════════════
   1a. HTTPS ENFORCEMENT (production only)
   — Redirects HTTP → HTTPS when behind a proxy
═══════════════════════════════════════════ */
if (IS_PROD) {
  app.set('trust proxy', 1); // Trust first proxy (Nginx, CloudFlare, etc.)

  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    return next();
  });
}

/* ═══════════════════════════════════════════
   1b. REQUEST ID TRACKING
   — Assigns a unique ID to every request for
     log correlation and debugging
═══════════════════════════════════════════ */
let requestCounter = 0;
app.use((req, _res, next) => {
  requestCounter++;
  req.requestId = req.headers['x-request-id']
    || `${Date.now()}-${requestCounter}`;
  next();
});

/* ═══════════════════════════════════════════
   2. CORS — only allow trusted origins
═══════════════════════════════════════════ */
const ALLOWED_ORIGINS = (
  process.env.FRONTEND_URL ||
  'http://localhost:3000'
).split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      secLogger.logSuspiciousActivity(
        { headers: {}, originalUrl: '/cors', method: 'OPTIONS', ip: 'unknown' },
        `CORS violation from origin: ${origin}`,
        { origin }
      );
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

/* ═══════════════════════════════════════════
   3. BODY PARSING — limit payload sizes to
      prevent DoS via large payloads
═══════════════════════════════════════════ */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Structured access logging (combined format in prod, dev format in dev)
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

/* ═══════════════════════════════════════════
   4. BOT DETECTION MIDDLEWARE
   — Blocks requests with no User-Agent,
     known bot signatures, and suspicious patterns
═══════════════════════════════════════════ */
const BLOCKED_USER_AGENTS = [
  /curl/i, /wget/i, /python-requests/i, /scrapy/i, /httpclient/i,
  /bot(?!.*googlebot)/i, /spider/i, /crawler/i, /scraper/i,
  /phantom/i, /headless/i, /selenium/i, /puppeteer/i,
];

function botGuard(req, res, next) {
  const ua = req.headers['user-agent'] || '';

  // Block requests with no User-Agent (automated scripts)
  if (!ua || ua.length < 10) {
    secLogger.logBotBlocked(req);
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Block known bot/scraper User-Agents
  for (const pattern of BLOCKED_USER_AGENTS) {
    if (pattern.test(ua)) {
      secLogger.logBotBlocked(req);
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  return next();
}

// Apply bot guard to API routes only (not health check)
app.use('/api', botGuard);

/* ═══════════════════════════════════════════
   5. RATE LIMITING — layered defense
   with security logging on hits
═══════════════════════════════════════════ */

function rateLimitHandler(endpoint) {
  return (req, res) => {
    secLogger.logRateLimitHit(req, endpoint);
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
  };
}

// 5a. Global limiter: 2000 requests per 15 minutes per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('global'),
}));

// 5b. Auth routes: 500 attempts per 15 min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('auth'),
});

// 5c. Account creation: 100 registrations per hour per IP
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('registration'),
});

// 5d. Password reset: 20 requests per 15 min
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('password-reset'),
});

// 5e. Debate creation (AI generation): 50 per hour per IP
const debateCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('debate-creation'),
});

// 5f. Topic proposal: 30 per hour per IP
const topicProposalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('topic-proposal'),
});

// 5g. Profile upload: 30 per hour
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('avatar-upload'),
});

/* ═══════════════════════════════════════════
   6. ROUTES — with targeted rate limiters
═══════════════════════════════════════════ */

// Serve uploaded files (profile pics, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Apply targeted limiters before route handlers
app.use('/api/auth/forgot-password', passwordResetLimiter);
app.use('/api/auth/reset-password', passwordResetLimiter);
app.use('/api/auth/register', registrationLimiter);
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/debates/start', debateCreationLimiter);
app.use('/api/debates', debateRoutes);

app.use('/api/profile/avatar', uploadLimiter);
app.use('/api/profile', profileRoutes);

app.use('/api/topics/propose', topicProposalLimiter);
app.use('/api/topics', topicRoutes);

app.use('/api/push', pushRoutes);

app.use('/api/rooms', roomRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: NODE_ENV,
    uptime: Math.round(process.uptime()),
  });
});

/* ═══════════════════════════════════════════
   7. GLOBAL ERROR HANDLER
   — Structured error logging + sanitized responses
═══════════════════════════════════════════ */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  secLogger.logAPIError(req, err, statusCode);

  // Never leak stack traces or internal error messages in production
  const message = IS_PROD && statusCode >= 500
    ? 'Internal server error'
    : err.message || 'Internal server error';

  res.status(statusCode).json({ error: message });
});

/* ═══════════════════════════════════════════
   8. STARTUP + GRACEFUL SHUTDOWN
═══════════════════════════════════════════ */
if (require.main === module) {
  connectDB()
    .then(() => {
      /* ── MongoDB reconnect logging ── */
      mongoose.connection.on('disconnected', () =>
        // eslint-disable-next-line no-console
        console.warn('⚠️  MongoDB disconnected. Mongoose will auto-reconnect.')
      );
      mongoose.connection.on('reconnected', () =>
        // eslint-disable-next-line no-console
        console.log('✅ MongoDB reconnected.')
      );

      initWebSocket(server);
      scheduleNotificationJobs();

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // eslint-disable-next-line no-console
          console.error(`❌ Port ${PORT} is already in use. Run: lsof -ti :${PORT} | xargs kill -9`);
        } else {
          // eslint-disable-next-line no-console
          console.error('Server error:', err);
        }
        process.exit(1);
      });

      server.listen(PORT, '0.0.0.0', () => {
        secLogger.logStartup(PORT, NODE_ENV);
        // eslint-disable-next-line no-console
        console.log(`🚀 DebateForge running on port ${PORT} [${NODE_ENV}]`);
        // eslint-disable-next-line no-console
        console.log(`🛡️  Security: Helmet, rate limiters, bot guard, security logger active`);
        if (IS_PROD) {
          // eslint-disable-next-line no-console
          console.log(`🔒 HTTPS enforcement enabled (behind proxy)`);
        }
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server:', error);
      process.exit(1);
    });

  /* ── Graceful shutdown ── */
  function shutdown(signal) {
    secLogger.logShutdown(signal);
    // eslint-disable-next-line no-console
    console.log(`\n🛑 ${signal} received — shutting down gracefully…`);

    server.close(() => {
      // eslint-disable-next-line no-console
      console.log('   ✅ HTTP server closed');

      mongoose.connection.close(false).then(() => {
        // eslint-disable-next-line no-console
        console.log('   ✅ MongoDB disconnected');
        process.exit(0);
      });
    });

    // Force kill if graceful shutdown takes too long
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('   ❌ Forced shutdown (timeout)');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch uncaught exceptions / rejections and log them
  process.on('uncaughtException', (err) => {
    secLogger.log(
      secLogger.LEVELS.CRITICAL, 'SYSTEM',
      `Uncaught exception: ${err.message}`,
      { stack: err.stack }
    );
    // eslint-disable-next-line no-console
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    secLogger.log(
      secLogger.LEVELS.CRITICAL, 'SYSTEM',
      `Unhandled rejection: ${reason}`,
      { reason: String(reason) }
    );
    // eslint-disable-next-line no-console
    console.error('UNHANDLED REJECTION:', reason);
  });
}

module.exports = { app, server };
