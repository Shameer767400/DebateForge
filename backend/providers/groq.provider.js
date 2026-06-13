'use strict';

/**
 * @fileoverview Groq provider for DebateForge AI debates.
 *
 * Model: llama-3.3-70b-versatile
 * Key advantages:
 *   - FREE tier with generous rate limits
 *   - Ultra-fast inference (~500ms response time)
 *   - Good multilingual support
 *
 * @module providers/groq.provider
 */

const axios = require('axios');
const BaseProvider = require('./base.provider');
const { buildSystemPrompt } = require('../utils/llm.utils');

class GroqProvider extends BaseProvider {
  constructor() {
    super();
    this.keys = this._loadKeys('GROQ_API_KEY', 10);
    this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.timeout = 10_000;
  }

  getName() { return 'Groq'; }

  isAvailable() { return this.keys.length > 0; }

  /**
   * Generate debate response using Groq (Llama 3.3 70B).
   * Ultra-fast inference — typically responds in under 1 second.
   */
  async generate(session, userArgument) {
    if (!this.isAvailable()) return null;

    const { messages } = this._buildMessages(session, userArgument);

    for (let attempt = 0; attempt < this.keys.length; attempt++) {
      const keyIndex = this._getNextAvailableKeyIndex(this.keys);
      if (keyIndex === -1) {
        console.warn(`[GROQ] All ${this.keys.length} keys rate-limited`); // eslint-disable-line no-console
        break;
      }

      const keyLabel = keyIndex === 0 ? 'primary' : `key-${keyIndex + 1}`;

      try {
        const response = await Promise.race([
          axios.post(this.apiUrl, {
            model: this.model,
            messages,
            max_tokens: 500,
            temperature: 0.7,
          }, {
            headers: {
              'Authorization': `Bearer ${this.keys[keyIndex]}`,
              'Content-Type': 'application/json',
            },
            timeout: this.timeout,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Groq timed out')), this.timeout)
          ),
        ]);

        const text = response.data?.choices?.[0]?.message?.content;
        if (text?.trim()) {
          console.log(`[GROQ] Generated ${text.trim().length} chars via ${keyLabel}`); // eslint-disable-line no-console
          return text.trim();
        }
      } catch (e) {
        const status = e.response?.status;
        console.warn(`[GROQ] ${keyLabel} failed (${status || 'timeout'}): ${(e.response?.data?.error?.message || e.message).slice(0, 120)}`); // eslint-disable-line no-console

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
    const lang = session.currentLanguage || 'en';
    const langNames = {
      te: 'Telugu', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada',
      ml: 'Malayalam', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati',
      pa: 'Punjabi', ur: 'Urdu', es: 'Spanish', fr: 'French',
      de: 'German', pt: 'Portuguese', ar: 'Arabic', zh: 'Chinese',
      ja: 'Japanese', ko: 'Korean', ru: 'Russian',
    };
    const history = (session.conversationHistory || []).slice(-6);
    const previousAiReplies = history
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .slice(-3);

    // For non-English debates: strongly instruct Groq to respond in target language
    const langInstruction = lang !== 'en' && langNames[lang]
      ? `\n\nIMPORTANT: The user is debating in ${langNames[lang]}. Respond in ${langNames[lang]} if possible.`
      : '';

    const systemPrompt = buildSystemPrompt(session) +
      langInstruction +
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

module.exports = GroqProvider;
