/**
 * Shared CORS origins configuration.
 * Used by both Express CORS middleware and WebSocket CORS.
 */
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// Production trusted domains
const DEFAULT_PROD_ORIGINS = [
  'https://debateforge.tech',
  'https://www.debateforge.tech',
  'https://debateforge.app',
  'https://www.debateforge.app',
];

const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  ...DEFAULT_PROD_ORIGINS,
  ...envOrigins,
  ...(IS_PROD
    ? []
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002',
        'http://127.0.0.1:5173',
      ]),
];

/**
 * Validates whether an incoming origin is allowed.
 * Supports exact matches and *.vercel.app preview deployments.
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // server-to-server, curl, mobile apps
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow all Vercel deployments (preview branches & production)
  if (/^https:\/\/[a-z0-9-]+(\.vercel\.app)$/i.test(origin) || /^https:\/\/.*\.vercel\.app$/i.test(origin)) {
    return true;
  }
  return false;
}

module.exports = { ALLOWED_ORIGINS, isOriginAllowed, IS_PROD, NODE_ENV };

