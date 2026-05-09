/**
 * Shared CORS origins configuration.
 * Used by both Express CORS middleware and WebSocket CORS.
 */
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const ALLOWED_ORIGINS = IS_PROD
  ? (process.env.FRONTEND_URL || '').split(',').map((o) => o.trim()).filter(Boolean)
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:5173',
      ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map((o) => o.trim()) : []),
    ];

module.exports = { ALLOWED_ORIGINS, IS_PROD, NODE_ENV };
