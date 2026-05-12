'use strict';

/**
 * @fileoverview Ollama provider — local LLM fallback for DebateForge.
 *
 * Model: llama3 (configurable via OLLAMA_MODEL env)
 * Runs locally — no API key required, no rate limits.
 * Supports true streaming via chunked HTTP response.
 *
 * Used as the last-resort fallback when all cloud providers fail.
 *
 * @module providers/ollama.provider
 */

const axios = require('axios');
const BaseProvider = require('./base.provider');
const { buildSystemPrompt } = require('../utils/llm.utils');

class OllamaProvider extends BaseProvider {
  constructor() {
    super();
    this.baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3';
  }

  getName() { return 'Ollama (Local)'; }

  /**
   * Ollama is available if the server is reachable.
   * Always returns true — availability is checked at runtime.
   */
  isAvailable() { return true; }

  /**
   * Generate a complete debate response using local Ollama.
   */
  async generate(session, userArgument) {
    try {
      const { messages } = this._buildMessages(session, userArgument);

      const response = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: this.model,
          messages,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 160,
            top_p: 0.92,
            repeat_penalty: 1.25,
            seed: Math.floor(Math.random() * 2147483647),
          },
        },
        { timeout: 60_000 }
      );

      return response.data?.message?.content?.trim() || null;
    } catch (e) {
      const isConnRefused = e.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED');
      if (isConnRefused) {
        throw new Error('AI_SERVICE_OFFLINE');
      }
      console.error(`[OLLAMA] Error: ${e.message}`); // eslint-disable-line no-console
      return null;
    }
  }

  /**
   * Stream debate response chunks via Ollama's streaming API.
   * True streaming — yields individual text tokens as they arrive.
   */
  async *stream(session, userArgument) {
    const { messages } = this._buildMessages(session, userArgument);

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: this.model,
          messages,
          stream: true,
          options: {
            temperature: 0.7,
            num_predict: 160,
            top_p: 0.92,
            repeat_penalty: 1.25,
            seed: Math.floor(Math.random() * 2147483647),
          },
        },
        { responseType: 'stream', timeout: 60_000 }
      );

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
            if (parsed.done) return;
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } catch (e) {
      const isConnRefused = e.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED');
      if (isConnRefused) {
        throw new Error('AI_SERVICE_OFFLINE');
      }
      console.error(`[OLLAMA] Streaming error: ${e.message}`); // eslint-disable-line no-console
      yield "That's an interesting point, but I must strongly disagree. " +
            "Your argument lacks the empirical foundation needed to be convincing. " +
            "Can you provide specific evidence to support that claim?";
    }
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

module.exports = OllamaProvider;
