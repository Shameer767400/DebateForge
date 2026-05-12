'use strict';

/**
 * @fileoverview OpenAI provider for DebateForge AI debates.
 *
 * Model: gpt-4o-mini (fast, cost-effective, multilingual)
 * Features:
 *   - Multi-key rotation (up to 6 keys) with 60s cooldown
 *   - 15s request timeout with race condition guard
 *   - Native multilingual generation
 *
 * @module providers/openai.provider
 */

const axios = require('axios');
const BaseProvider = require('./base.provider');
const { buildSystemPrompt } = require('../utils/llm.utils');

class OpenAIProvider extends BaseProvider {
  constructor() {
    super();
    this.keys = this._loadKeys('OPENAI_API_KEY');
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.timeout = 15_000;
  }

  getName() { return 'OpenAI'; }

  isAvailable() { return this.keys.length > 0; }

  /**
   * Generate debate response using OpenAI GPT-4o-mini.
   * Automatically rotates through API keys on 429/401/403.
   */
  async generate(session, userArgument) {
    if (!this.isAvailable()) return null;

    const { messages } = this._buildMessages(session, userArgument);

    for (let attempt = 0; attempt < this.keys.length; attempt++) {
      const keyIndex = this._getNextAvailableKeyIndex(this.keys);
      if (keyIndex === -1) {
        console.warn(`[OPENAI] All ${this.keys.length} API keys are rate-limited`); // eslint-disable-line no-console
        break;
      }

      const keyLabel = keyIndex === 0 ? 'primary' : `key-${keyIndex + 1}`;

      try {
        const response = await Promise.race([
          axios.post(this.apiUrl, {
            model: this.model,
            messages,
            max_tokens: 300,
            temperature: 0.7,
          }, {
            headers: {
              'Authorization': `Bearer ${this.keys[keyIndex]}`,
              'Content-Type': 'application/json',
            },
            timeout: this.timeout,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OpenAI timed out')), this.timeout)
          ),
        ]);

        const text = response.data?.choices?.[0]?.message?.content;
        if (text?.trim()) {
          console.log(`[OPENAI] Generated ${text.trim().length} chars via ${keyLabel}`); // eslint-disable-line no-console
          return text.trim();
        }
      } catch (e) {
        const status = e.response?.status;
        console.warn(`[OPENAI] ${keyLabel} failed (${status || 'timeout'}): ${(e.response?.data?.error?.message || e.message).slice(0, 120)}`); // eslint-disable-line no-console

        if (status === 429 || status === 401 || status === 403) {
          this._markKeyLimited(keyIndex);
          continue;
        }
        break;
      }
    }

    return null;
  }

  /** Build OpenAI-compatible messages array with anti-repetition injection */
  _buildMessages(session, userArgument) {
    const history = (session.conversationHistory || []).slice(-6);
    const previousAiReplies = history
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .slice(-3);

    const systemPrompt = buildSystemPrompt(session) +
      (previousAiReplies.length > 0
        ? `\n\n=== YOUR PREVIOUS RESPONSES (DO NOT REPEAT THESE) ===\n${previousAiReplies.map((r, i) => `Round ${i + 1}: ${r.slice(0, 100)}...`).join('\n')}`
        : '');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      { role: 'user', content: userArgument },
    ];

    return { messages, systemPrompt };
  }
}

module.exports = OpenAIProvider;
