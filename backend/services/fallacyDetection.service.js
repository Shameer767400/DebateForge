'use strict';

/**
 * @fileoverview Fallacy Detection service — wraps ML fallacy detector.
 *
 * Integrates with the Python FastAPI ML service (/fallacy/detect) to identify
 * logical fallacies in debate arguments using a 3-layer detection pipeline:
 *   1. Rule-based keyword matching (fastest)
 *   2. Semantic similarity via embeddings
 *   3. SpaCy NLP analysis (dependency parsing, NER, POS tagging)
 *
 * Supported Fallacy Types (11):
 *   slippery_slope, hasty_generalization, appeal_to_emotion, strawman,
 *   ad_hominem, false_dichotomy, circular_reasoning, appeal_to_authority,
 *   bandwagon, appeal_to_nature, red_herring
 *
 * @module services/fallacyDetection.service
 */

const axios = require('axios');

const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Detect logical fallacies in a debate argument via the ML service.
 *
 * @param {Object} params
 * @param {string} params.argument — the argument text to analyze
 * @param {string[]} [params.context] — previous arguments for context
 * @param {string} [params.userId] — user ID for personalization
 * @returns {Promise<Object>} detection result { detected, fallacy_type, confidence, explanation, triggered_phrase }
 */
async function detectFallacy({ argument, context = [], userId = '' }) {
  try {
    const response = await axios.post(`${ML_BASE_URL}/fallacy/detect`, {
      argument,
      context,
      user_id: userId,
    }, { timeout: 10_000 });

    return response.data;
  } catch (e) {
    console.warn(`[FALLACY] ML service unavailable: ${e.message}`); // eslint-disable-line no-console
    return {
      detected: false,
      fallacy_type: 'no_fallacy',
      confidence: 0,
      explanation: 'Fallacy detection service temporarily unavailable',
      triggered_phrase: '',
    };
  }
}

/**
 * Build a user's fallacy profile from their debate history.
 *
 * @param {Object[]} debates — user's completed debates
 * @returns {Object} fallacy counts { ad_hominem: 3, strawman: 1, ... }
 */
function buildFallacyProfile(debates) {
  const profile = {};

  for (const debate of debates) {
    const userArgs = debate.arguments?.filter(a => a.speaker === 'user') || [];
    for (const arg of userArgs) {
      if (arg.fallacy?.detected && arg.fallacy?.type) {
        profile[arg.fallacy.type] = (profile[arg.fallacy.type] || 0) + 1;
      }
    }
  }

  return profile;
}

/**
 * Get the user's most common fallacy type.
 *
 * @param {Object} profile — fallacy profile { type: count }
 * @returns {string|null} most frequent fallacy type, or null
 */
function getTopFallacy(profile) {
  const entries = Object.entries(profile || {});
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

module.exports = {
  detectFallacy,
  buildFallacyProfile,
  getTopFallacy,
};
