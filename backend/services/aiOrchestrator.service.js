'use strict';

/**
 * @fileoverview AI Orchestrator — central brain for DebateForge AI responses.
 *
 * Responsibilities:
 *   - Provider selection based on language and availability
 *   - Cascading failover chain with automatic fallback
 *   - Multilingual routing (Indian languages → Sarvam AI first)
 *   - Streaming response coordination
 *   - Provider health monitoring
 *
 * Failover Chain:
 *   Indian Languages → Sarvam AI → Groq → OpenAI → Ollama (local)
 *   English/Other    → Groq → OpenAI → Ollama (local)
 *
 * @module services/aiOrchestrator.service
 */

const { getProvider, getAvailableProviders, getProviderStatus } = require('../providers');

/** Indian language codes that should route to Sarvam AI first */
const INDIAN_LANGUAGES = new Set([
  'te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa', 'ur',
]);

/**
 * Determine the optimal provider ordering for a given debate session.
 *
 * @param {string} langCode — ISO 639-1 language code
 * @returns {string[]} — ordered list of provider keys to try
 */
function getProviderChain(langCode) {
  const isIndian = INDIAN_LANGUAGES.has(langCode);

  if (isIndian) {
    return ['sarvam', 'groq', 'openai', 'ollama'];
  }

  return ['groq', 'openai', 'ollama'];
}

/**
 * Stream a debate response using the cascading provider chain.
 *
 * Tries each provider in order based on the debate language.
 * Falls back to the next provider on failure.
 *
 * @param {Object} session — debate session object
 * @param {string} userArgument — user's latest argument text
 * @yields {string} text chunks from the AI response
 * @throws {Error} if all providers fail
 */
async function* streamResponse(session, userArgument) {
  const lang = session.currentLanguage || 'en';
  const chain = getProviderChain(lang);

  for (const providerKey of chain) {
    const provider = getProvider(providerKey);
    if (!provider || !provider.isAvailable()) continue;

    // Skip Sarvam for non-Indian languages
    if (providerKey === 'sarvam' && !provider.supportsLanguage(lang)) continue;

    console.log(`[ORCHESTRATOR] Trying ${provider.getName()} (lang: ${lang})`); // eslint-disable-line no-console

    try {
      // For Ollama, use streaming; for cloud providers, use generate
      if (providerKey === 'ollama') {
        yield* provider.stream(session, userArgument);
        return;
      }

      const response = await provider.generate(session, userArgument);
      if (response) {
        yield response;
        return;
      }

      console.warn(`[ORCHESTRATOR] ${provider.getName()} returned empty — trying next`); // eslint-disable-line no-console
    } catch (e) {
      console.error(`[ORCHESTRATOR] ${provider.getName()} failed: ${e.message}`); // eslint-disable-line no-console

      if (e.message === 'AI_SERVICE_OFFLINE') {
        throw new Error('AI service is offline. Please start Ollama (`ollama serve`) and try again.');
      }
      // Continue to next provider
    }
  }

  throw new Error('All AI services failed. Please check your API keys and try again.');
}

/**
 * Get the health status of all AI providers.
 * Used by the /api/ai/status monitoring endpoint.
 *
 * @returns {Object} provider status summary
 */
function getAIStatus() {
  const providers = getProviderStatus();
  const available = providers.filter(p => p.available);

  return {
    status: available.length > 0 ? 'operational' : 'degraded',
    totalProviders: providers.length,
    availableProviders: available.length,
    providers,
    failoverChain: {
      english: getProviderChain('en'),
      indian: getProviderChain('hi'),
    },
  };
}

module.exports = {
  streamResponse,
  getProviderChain,
  getAIStatus,
  INDIAN_LANGUAGES,
};
