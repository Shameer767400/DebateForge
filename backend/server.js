require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');

const connectDB = require('./config/database');
const redisClient = require('./config/redis');

const authRoutes = require('./routes/auth');
const debateRoutes = require('./routes/debates');
const profileRoutes = require('./routes/profile');
const topicRoutes = require('./routes/topics');

const initWebSocket = require('./websocket/index');

const PORT = process.env.PORT || 5000;

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(
  express.json({
    limit: '10mb',
  })
);
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(morgan('dev'));

// ── Rate limiting ──
const rateLimit = require('express-rate-limit');

// Global: 300 requests per 15 minutes per IP
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

// Strict limiter for auth routes (login/register) — 50 attempts per 15min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve uploaded files (profile pics, etc.)
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/debates', debateRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/topics', topicRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // 4 params required for Express to treat this as error handler
  // Logging the error
  // eslint-disable-next-line no-console
  console.error(err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

if (require.main === module) {
  connectDB()
    .then(() => {
      initWebSocket(server);

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
        // eslint-disable-next-line no-console
        console.log(`🚀 DebateForge running on port ${PORT}`);
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}

module.exports = { app, server };

