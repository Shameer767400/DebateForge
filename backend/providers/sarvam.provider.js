'use strict';

/**
 * @fileoverview Sarvam AI provider for DebateForge — optimized for Indian languages.
 *
 * Model: sarvam-m
 * Specialized for: Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Urdu
 *
 * This provider is prioritized in the failover chain when the debate language
 * is an Indian language, providing superior quality compared to generic LLMs.
 *
 * @module providers/sarvam.provider
 */

const axios = require('axios');
const BaseProvider = require('./base.provider');
const { buildSystemPrompt } = require('../utils/llm.utils');

/** Indian languages supported by Sarvam AI */
const INDIAN_LANGUAGES = new Set([
  'te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa', 'ur',
]);

class SarvamProvider extends BaseProvider {
  constructor() {
    super();
    this.keys = this._loadKeys('SARVAM_API_KEY', 5);
    this.model = 'sarvam-m';
    this.apiUrl = 'https://api.sarvam.ai/v1/chat/completions';
    this.timeout = 15_000;
  }

  getName() { return 'Sarvam AI'; }

  isAvailable() { return this.keys.length > 0; }

  /**
   * Sarvam AI is specialized for Indian languages.
   * Returns true only for supported Indian language codes.
   */
  supportsLanguage(langCode) {
    return INDIAN_LANGUAGES.has(langCode);
  }

  /**
   * Generate debate response using Sarvam AI (sarvam-m model).
   * Optimized for native Indian language generation without translation.
   */
  async generate(session, userArgument) {
    if (!this.isAvailable()) return null;

    const { messages } = this._buildMessages(session, userArgument);

    for (let attempt = 0; attempt < this.keys.length; attempt++) {
      const keyIndex = this._getNextAvailableKeyIndex(this.keys);
      if (keyIndex === -1) {
        console.warn(`[SARVAM] All ${this.keys.length} keys rate-limited`); // eslint-disable-line no-console
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
            setTimeout(() => reject(new Error('Sarvam timed out')), this.timeout)
          ),
        ]);

        const text = response.data?.choices?.[0]?.message?.content;
        if (text?.trim()) {
          console.log(`[SARVAM] Generated ${text.trim().length} chars via ${keyLabel}`); // eslint-disable-line no-console
          return text.trim();
        }
      } catch (e) {
        const status = e.response?.status;
        console.warn(`[SARVAM] ${keyLabel} failed (${status || 'timeout'}): ${(e.response?.data?.error?.message || e.message).slice(0, 120)}`); // eslint-disable-line no-console

        if (status === 429 || status === 401 || status === 403) {
          this._markKeyLimited(keyIndex);
          continue;
        }
        break;
      }
    }

    return null;
  }

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

    return {
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content: userArgument },
      ],
      systemPrompt,
    };
  }
}

module.exports = SarvamProvider;
