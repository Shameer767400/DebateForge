'use strict';

/**
 * @fileoverview Session service — Redis-backed debate session management.
 *
 * Manages ephemeral debate state (conversation history, scores, fallacy profile)
 * stored in Redis with automatic fallback to in-memory store.
 *
 * @module services/session.service
 */

const redis = require('../config/redis');

const SESSION_TTL = 7200; // 2 hours

async function getSession(debateId) {
  const raw = await redis.get(`debate:${debateId}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveSession(debateId, session) {
  await redis.setex(`debate:${debateId}`, SESSION_TTL, JSON.stringify(session));
}

async function deleteSession(debateId) {
  await redis.del(`debate:${debateId}`);
}

async function sessionExists(debateId) {
  return !!(await redis.get(`debate:${debateId}`));
}

module.exports = { getSession, saveSession, deleteSession, sessionExists, SESSION_TTL };
