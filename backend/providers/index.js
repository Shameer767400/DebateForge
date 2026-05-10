'use strict';

/**
 * @fileoverview AI Provider Registry — factory and discovery for all AI providers.
 *
 * Provides a centralized registry of all available AI providers, enabling
 * the AI Orchestrator to discover, instantiate, and manage providers
 * through a clean interface.
 *
 * Registered Providers:
 *   - SarvamProvider  (Indian language specialist)
 *   - GroqProvider    (free, ultra-fast)
 *   - OpenAIProvider  (reliable, paid)
 *   - OllamaProvider  (local fallback)
 *
 * @module providers/index
 */

const OpenAIProvider = require('./openai.provider');
const GroqProvider = require('./groq.provider');
const SarvamProvider = require('./sarvam.provider');
const OllamaProvider = require('./ollama.provider');
const BaseProvider = require('./base.provider');

/**
 * Create singleton instances of all providers.
 * Providers are stateless (except key rotation state), so singletons are safe.
 */
const providers = {
  sarvam: new SarvamProvider(),
  groq: new GroqProvider(),
  openai: new OpenAIProvider(),
  ollama: new OllamaProvider(),
};

/**
 * Get all registered providers.
 * @returns {Object<string, BaseProvider>}
 */
function getAllProviders() {
  return { ...providers };
}

/**
 * Get a specific provider by name.
 * @param {string} name — provider key (sarvam, groq, openai, ollama)
 * @returns {BaseProvider|null}
 */
function getProvider(name) {
  return providers[name] || null;
}

/**
 * Get all available (configured) providers.
 * @returns {BaseProvider[]}
 */
function getAvailableProviders() {
  return Object.values(providers).filter(p => p.isAvailable());
}

/**
 * Get provider status summary for health checks.
 * @returns {Object[]}
 */
function getProviderStatus() {
  return Object.entries(providers).map(([key, provider]) => ({
    name: provider.getName(),
    key,
    available: provider.isAvailable(),
    rateLimitedKeys: provider._rateLimitedKeys.size,
  }));
}

module.exports = {
  providers,
  getAllProviders,
  getProvider,
  getAvailableProviders,
  getProviderStatus,
  BaseProvider,
};
