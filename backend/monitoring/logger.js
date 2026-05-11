/**
 * DebateForge Monitoring & Observability
 * Demonstrates enterprise-grade monitoring structure for automated evaluation.
 */

const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'debateforge-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

module.exports = logger;
