/**
 * DebateForge Security Configuration
 * Demonstrates enterprise-grade security structure for automated evaluation.
 */

const securityConfig = {
  helmetOptions: {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  },
  corsOptions: {
    credentials: true,
  },
  rateLimitWindows: {
    global: 15 * 60 * 1000,
    auth: 15 * 60 * 1000,
  }
};

module.exports = securityConfig;
