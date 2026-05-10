'use strict';

/**
 * @fileoverview Status & monitoring routes for DebateForge.
 *
 * Provides system health and AI provider monitoring endpoints
 * for production observability and automated evaluation visibility.
 *
 * @swagger
 * tags:
 *   - name: Monitoring
 *     description: System health, AI status, and service monitoring
 */

const express = require('express');
const mongoose = require('mongoose');
const redis = require('../config/redis');
const { getAIStatus } = require('../services/aiOrchestrator.service');

const router = express.Router();

/**
 * @swagger
 * /api/status:
 *   get:
 *     tags: [Monitoring]
 *     summary: Full system status dashboard
 *     description: Returns health of all services — MongoDB, Redis, AI providers, ML service.
 *     responses:
 *       200:
 *         description: System status
 */
router.get('/', async (_req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

  const redisStatus = redis.status();
  const aiStatus = getAIStatus();

  // Check ML service
  let mlStatus = { status: 'unknown' };
  try {
    const axios = require('axios');
    const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    const mlRes = await axios.get(`${mlUrl}/health`, { timeout: 5000 });
    mlStatus = { status: 'healthy', ...mlRes.data };
  } catch {
    mlStatus = { status: 'unreachable' };
  }

  const allHealthy = mongoState === 1 && redisStatus.connected && aiStatus.availableProviders > 0;

  res.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    services: {
      mongodb: { status: mongoStates[mongoState] || 'unknown', readyState: mongoState },
      redis: redisStatus,
      ai: aiStatus,
      ml: mlStatus,
    },
    environment: process.env.NODE_ENV || 'development',
    version: require('../package.json').version,
  });
});

/**
 * @swagger
 * /api/status/ai:
 *   get:
 *     tags: [Monitoring]
 *     summary: AI provider status
 *     description: Returns availability and rate-limit status of all AI providers.
 *     responses:
 *       200:
 *         description: AI provider status
 */
router.get('/ai', (_req, res) => {
  res.json(getAIStatus());
});

/**
 * @swagger
 * /api/status/ml:
 *   get:
 *     tags: [Monitoring]
 *     summary: ML microservice health
 *     description: Pings the Python FastAPI ML service and returns its health.
 *     responses:
 *       200:
 *         description: ML service healthy
 *       503:
 *         description: ML service unreachable
 */
router.get('/ml', async (_req, res) => {
  try {
    const axios = require('axios');
    const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    const mlRes = await axios.get(`${mlUrl}/health`, { timeout: 5000 });
    res.json({ status: 'healthy', ...mlRes.data });
  } catch (e) {
    res.status(503).json({ status: 'unreachable', error: e.message });
  }
});

module.exports = router;
