'use strict';

/**
 * @fileoverview Scoring service — wraps ML scorer and manages argument quality tracking.
 *
 * Integrates with the Python FastAPI ML service (/scorer/score) to evaluate
 * debate arguments across three dimensions:
 *   - Logic (0-100): causal structure, reasoning markers
 *   - Evidence (0-100): statistics, citations, examples
 *   - Clarity (0-100): readability, sentence structure, vocabulary
 *
 * Also provides local score aggregation for debate summaries and trends.
 *
 * @module services/scoring.service
 */

const axios = require('axios');

const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Score a debate argument via the ML service.
 *
 * @param {Object} params
 * @param {string} params.argument — the argument text to score
 * @param {string} params.topic — debate topic for context
 * @param {string[]} [params.context] — previous arguments for context
 * @param {number} [params.turnNumber] — current turn number
 * @returns {Promise<Object>} scores { logic, evidence, clarity, overall, feedback, sentiment }
 */
async function scoreArgument({ argument, topic, context = [], turnNumber = 1 }) {
  try {
    const response = await axios.post(`${ML_BASE_URL}/scorer/score`, {
      argument,
      topic,
      context,
      turn_number: turnNumber,
    }, {
      timeout: 10_000,
      headers: {
        'X-ML-API-Key': process.env.ML_API_KEY,
      },
    });

    return response.data;
  } catch (e) {
    console.warn(`[SCORING] ML scorer unavailable: ${e.message}`); // eslint-disable-line no-console
    return _fallbackScore(argument);
  }
}

/**
 * Aggregate scores across multiple arguments.
 *
 * @param {Object[]} arguments — array of argument objects with scores
 * @returns {Object} average scores
 */
function aggregateScores(args) {
  const scored = args.filter(a => a.scores?.overall != null);
  if (scored.length === 0) return { logic: 0, evidence: 0, clarity: 0, overall: 0 };

  const avg = (field) => Math.round(
    scored.reduce((sum, a) => sum + (a.scores[field] || 0), 0) / scored.length
  );

  return {
    logic: avg('logic'),
    evidence: avg('evidence'),
    clarity: avg('clarity'),
    overall: avg('overall'),
  };
}

/**
 * Calculate score trend (improving, stable, declining) based on recent arguments.
 *
 * @param {Object[]} args — ordered array of scored arguments (oldest first)
 * @param {number} [windowSize=3] — comparison window
 * @returns {string} 'improving' | 'stable' | 'declining'
 */
function calculateTrend(args, windowSize = 3) {
  const scored = args.filter(a => a.scores?.overall != null);
  if (scored.length < windowSize * 2) return 'stable';

  const recent = scored.slice(-windowSize);
  const previous = scored.slice(-(windowSize * 2), -windowSize);

  const recentAvg = recent.reduce((s, a) => s + a.scores.overall, 0) / windowSize;
  const prevAvg = previous.reduce((s, a) => s + a.scores.overall, 0) / windowSize;

  if (recentAvg > prevAvg + 5) return 'improving';
  if (recentAvg < prevAvg - 5) return 'declining';
  return 'stable';
}

/**
 * Fallback scoring when ML service is unavailable.
 * Uses basic heuristics instead of the full NLP pipeline.
 */
function _fallbackScore(argument) {
  const words = argument.split(/\s+/).length;
  const sentences = argument.split(/[.!?]+/).filter(Boolean).length;

  return {
    logic: Math.min(70, 40 + sentences * 5),
    evidence: Math.min(60, 30 + (argument.match(/\d/g) || []).length * 10),
    clarity: Math.min(80, words > 10 && words < 100 ? 65 : 45),
    overall: 50,
    feedback: {
      logic: 'ML service unavailable — basic scoring applied',
      evidence: 'ML service unavailable — basic scoring applied',
      clarity: 'ML service unavailable — basic scoring applied',
    },
    sentiment: {},
  };
}

module.exports = {
  scoreArgument,
  aggregateScores,
  calculateTrend,
};
