'use strict';

/**
 * @fileoverview Abstract base class for AI providers in DebateForge.
 *
 * All AI providers (OpenAI, Groq, Sarvam AI, Ollama) implement this interface,
 * enabling the AI Orchestrator to swap providers transparently via the
 * Strategy Pattern.
 *
 * @module providers/base.provider
 */

/**
 * BaseProvider — abstract AI provider interface.
 *
 * Subclasses must implement:
 *   - getName()         → provider display name
 *   - isAvailable()     → true if API keys / service is configured
 *   - generate(session, userArgument) → full text response (or null on failure)
 *   - supportsLanguage(langCode)      → true if provider is optimized for this language
 *
 * Optional:
 *   - stream(session, userArgument)   → async generator yielding text chunks
 */
class BaseProvider {
  constructor() {
    /** @type {Map<number, number>} Tracks rate-limited key indices → timestamp */
    this._rateLimitedKeys = new Map();

    /** @type {number} Cooldown before retrying a failed key (ms) */
    this.RATE_LIMIT_COOLDOWN_MS = 60_000;
  }

  /**
   * Human-readable provider name (e.g. 'OpenAI', 'Groq').
   * @returns {string}
   */
  getName() {
    throw new Error('Subclasses must implement getName()');
  }

  /**
   * Whether this provider is configured and ready to accept requests.
   * @returns {boolean}
   */
  isAvailable() {
    throw new Error('Subclasses must implement isAvailable()');
  }

  /**
   * Whether this provider is optimized for a specific language.
   * @param {string} _langCode — ISO 639-1 code
   * @returns {boolean}
   */
  supportsLanguage(_langCode) {
    return true; // Most providers support all languages
  }

  /**
   * Generate a complete debate response.
   * @param {Object} session — debate session with topic, history, persona, etc.
   * @param {string} userArgument — the user's latest argument text
   * @returns {Promise<string|null>} — response text, or null if generation failed
   */
  async generate(_session, _userArgument) {
    throw new Error('Subclasses must implement generate()');
  }

  /**
   * Stream a debate response as an async generator.
   * Default implementation wraps generate() in a single yield.
   * @param {Object} session
   * @param {string} userArgument
   * @yields {string} text chunks
   */
  async *stream(session, userArgument) {
    const result = await this.generate(session, userArgument);
    if (result) yield result;
  }

  /**
   * Load API keys from environment variables.
   * Supports key rotation: ENV_KEY, ENV_KEY_2 … ENV_KEY_N.
   *
   * @param {string} envPrefix — e.g. 'OPENAI_API_KEY'
   * @param {number} maxKeys — maximum keys to check (default 6)
   * @returns {string[]}
   */
  _loadKeys(envPrefix, maxKeys = 6) {
    const keys = [];
    const primary = process.env[envPrefix];
    if (primary) keys.push(primary);
    for (let i = 2; i <= maxKeys; i++) {
      const k = process.env[`${envPrefix}_${i}`];
      if (k) keys.push(k);
    }
    return keys;
  }

  /**
   * Get the next available (non-rate-limited) key index.
   * @param {string[]} keys — array of API keys
   * @returns {number} — key index, or -1 if all exhausted
   */
  _getNextAvailableKeyIndex(keys) {
    const now = Date.now();
    for (let i = 0; i < keys.length; i++) {
      const failedAt = this._rateLimitedKeys.get(i);
      if (!failedAt || (now - failedAt) > this.RATE_LIMIT_COOLDOWN_MS) {
        this._rateLimitedKeys.delete(i);
        return i;
      }
    }
    return -1;
  }

  /**
   * Mark a key as rate-limited.
   * @param {number} keyIndex
   */
  _markKeyLimited(keyIndex) {
    this._rateLimitedKeys.set(keyIndex, Date.now());
  }
}

module.exports = BaseProvider;
