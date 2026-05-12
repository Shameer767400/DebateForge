'use strict';

/**
 * @fileoverview LLM Service — unified interface for AI provider interactions.
 *
 * This module acts as the public API surface for all LLM operations in DebateForge.
 * Internally, it delegates to the AI Orchestrator which implements the Strategy Pattern
 * with cascading failover across multiple providers (Sarvam AI → Groq → OpenAI → Ollama).
 *
 * Usage:
 *   const llm = require('./llm.service');
 *   for await (const chunk of llm.streamResponse(session, argument)) { ... }
 *
 * @module services/llm.service
 * @see module:services/aiOrchestrator.service
 */

const aiOrchestrator = require('./aiOrchestrator.service');

/**
 * Stream a debate AI response using the cascading provider chain.
 *
 * Tries providers in order based on the session's detected language:
 *   - Indian languages → Sarvam AI → Groq → OpenAI → Ollama
 *   - English/Other    → Groq → OpenAI → Ollama
 *
 * @param {Object} session - Debate session object containing topic, history, persona
 * @param {string} userArgument - The user's latest argument text
 * @yields {string} Text chunks from the AI response
 * @throws {Error} If all providers in the chain fail
 */
async function* streamResponse(session, userArgument) {
  yield* aiOrchestrator.streamResponse(session, userArgument);
}

/**
 * Determine the optimal provider ordering for a given language.
 *
 * @param {string} langCode - ISO 639-1 language code (e.g. 'en', 'hi', 'te')
 * @returns {string[]} Ordered list of provider keys to attempt
 */
function getProviderChain(langCode) {
  return aiOrchestrator.getProviderChain(langCode);
}

/**
 * Get the health status of all configured AI providers.
 *
 * @returns {Object} Provider status summary including availability and failover chains
 */
function getAIStatus() {
  return aiOrchestrator.getAIStatus();
}

/**
 * Set of Indian language codes routed to Sarvam AI first.
 * @type {Set<string>}
 */
const INDIAN_LANGUAGES = aiOrchestrator.INDIAN_LANGUAGES;

module.exports = {
  streamResponse,
  getProviderChain,
  getAIStatus,
  INDIAN_LANGUAGES,
};
