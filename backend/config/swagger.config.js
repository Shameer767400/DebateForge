'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

/**
 * @fileoverview OpenAPI 3.0 specification for DebateForge REST API.
 *
 * Provides interactive API documentation at /api-docs.
 * Covers all authentication, debate lifecycle, profile management,
 * topic discovery, and push notification endpoints.
 *
 * WebSocket events are documented separately in API_DOCS.md.
 */

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'DebateForge API',
      version: '1.0.0',
      description:
        'AI-powered debate practice platform with real-time voice/text debates, ' +
        'fallacy detection, intelligent counterarguments, ELO ranking, and adaptive coaching.\n\n' +
        '## Architecture\n' +
        '- **Backend**: Node.js / Express 5 / Socket.IO\n' +
        '- **Database**: MongoDB (Mongoose ODM)\n' +
        '- **Cache**: Redis (with in-memory fallback)\n' +
        '- **ML Service**: Python FastAPI (fallacy detection, scoring, memory, transcription)\n' +
        '- **AI Providers**: Sarvam AI → Groq → OpenAI → Ollama (cascading fallback)\n\n' +
        '## Authentication\n' +
        'All protected routes require a JWT token sent via:\n' +
        '- HTTP-only cookie (`token`), or\n' +
        '- `Authorization: Bearer <token>` header',
      contact: {
        name: 'DebateForge Team',
        url: 'https://github.com/Shameer767400/DebateForge',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      { url: 'http://localhost:5001', description: 'Local development' },
      { url: 'https://debateforge-backend.onrender.com', description: 'Production (Render)' },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication, registration, email verification, password management' },
      { name: 'Debates', description: 'Debate lifecycle — creation, history, scoring' },
      { name: 'Profile', description: 'User profile, avatar, stats, leaderboard' },
      { name: 'Topics', description: 'Debate topic discovery and proposal' },
      { name: 'Push', description: 'Web Push notification subscription management' },
      { name: 'Health', description: 'Service health and readiness checks' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'JWT token set as HTTP-only cookie on login',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'MongoDB ObjectId' },
            username: { type: 'string', example: 'debater42' },
            email: { type: 'string', format: 'email' },
            eloRating: { type: 'number', example: 1200 },
            wins: { type: 'integer', example: 5 },
            losses: { type: 'integer', example: 3 },
            draws: { type: 'integer', example: 1 },
            streak: { type: 'integer', example: 4 },
            achievements: {
              type: 'array',
              items: { type: 'string' },
              example: ['first_debate', 'logic_master'],
            },
          },
        },
        Debate: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            topicSnapshot: { type: 'string', example: 'AI will replace most jobs' },
            userSide: { type: 'string', enum: ['for', 'against'] },
            difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'expert', 'devils_advocate'] },
            format: { type: 'string', enum: ['freeform', 'oxford', 'lincoln_douglas', 'parliamentary'] },
            persona: { type: 'string', enum: ['balanced', 'socratic', 'aggressive', 'academic', 'casual'] },
            status: { type: 'string', enum: ['active', 'completed', 'forfeited'] },
            totalRounds: { type: 'integer' },
            arguments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  speaker: { type: 'string', enum: ['user', 'ai'] },
                  content: { type: 'string' },
                  scores: {
                    type: 'object',
                    properties: {
                      logic: { type: 'integer' },
                      evidence: { type: 'integer' },
                      clarity: { type: 'integer' },
                      overall: { type: 'integer' },
                    },
                  },
                  fallacy: {
                    type: 'object',
                    properties: {
                      detected: { type: 'boolean' },
                      type: { type: 'string' },
                      confidence: { type: 'number' },
                      explanation: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        Topic: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            title: { type: 'string', example: 'Social media does more harm than good' },
            category: { type: 'string', example: 'technology' },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            isActive: { type: 'boolean' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Unauthorized' },
          },
        },
      },
    },
  },
  apis: [
    './routes/*.js',
    './server.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
