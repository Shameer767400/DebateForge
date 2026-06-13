'use strict';

/**
 * @fileoverview Translation service — multilingual support for DebateForge.
 *
 * @module services/translation.service
 */

const { LANGUAGE_NAMES } = require('../utils/llm.utils');
const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

const groqKeys = [];
if (process.env.GROQ_API_KEY) groqKeys.push(process.env.GROQ_API_KEY);
for (let i = 2; i <= 5; i++) {
  const k = process.env[`GROQ_API_KEY_${i}`];
  if (k) groqKeys.push(k);
}

let _geminiModel = null;
function getGeminiModel() {
  if (_geminiModel) return _geminiModel;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    _geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    return _geminiModel;
  } catch (e) {
    console.error('[GEMINI] Failed to initialize:', e.message);
    return null;
  }
}

async function translateText(text, langCode) {
  if (!text || !langCode || langCode === 'en') return text;
  const langName = LANGUAGE_NAMES[langCode] || langCode;

  function stripEnglishLeakage(output) {
    const pattern = SCRIPT_PATTERNS[langCode];
    if (!pattern) return output;
    const lines = output.split(/\n/).filter(l => l.trim());
    return lines.filter(line => pattern.test(line)).join('\n') || output;
  }

  const primaryPrompt = `You are a professional translator. Translate the following text into ${langName}.
CRITICAL RULES:
1. Output ONLY the ${langName} translation. Nothing else.
2. Every single word must be in ${langName}. ZERO English words allowed.
3. Do NOT include the original English text.
4. Do NOT add notes, explanations, or labels like "Translation:".
TEXT:
${text}`;

  const retryPrompt = `TRANSLATE TO ${langName.toUpperCase()} ONLY. Your previous translation contained English. This time output ONLY ${langName} text. No English at all.
${text}`;

  async function attemptGemini(prompt) {
    const model = getGeminiModel();
    if (!model) return null;
    try {
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini timed out')), 15000)),
      ]);
      const translated = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
      return translated?.trim() || null;
    } catch (e) {
      console.warn(`[GEMINI] Translation failed: ${e.message?.slice(0, 120)}`);
      return null;
    }
  }

  async function attemptGroq(prompt) {
    if (groqKeys.length === 0) return null;
    for (const key of groqKeys) {
      try {
        const response = await Promise.race([
          axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: `You are a translator. Output ONLY the ${langName} translation. No English.` },
              { role: 'user', content: prompt },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }, {
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Groq timed out')), 10000)),
        ]);
        const content = response.data?.choices?.[0]?.message?.content?.trim();
        if (content) return content;
      } catch (e) {
        console.warn(`[GROQ] Translation failed: ${e.message?.slice(0, 120)}`);
      }
    }
    return null;
  }

  async function attemptOllama(prompt) {
    try {
      const response = await axios.post(
        `${OLLAMA_URL}/api/chat`,
        {
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: `You are a translator. Output ONLY the ${langName} translation. No English.` },
            { role: 'user', content: prompt },
          ],
          stream: false,
          options: { temperature: 0.3, num_predict: 500 },
        },
        { timeout: 45000 }
      );
      return response.data?.message?.content?.trim() || null;
    } catch (e) {
      console.error(`[OLLAMA] Translation failed:`, e.message?.slice(0, 120));
      return null;
    }
  }

  let translated = await attemptGemini(primaryPrompt);
  if (translated && translated.length > 0) {
    if (isInTargetScript(translated, langCode)) return stripEnglishLeakage(translated);
    const retry = await attemptGemini(retryPrompt);
    if (retry && isInTargetScript(retry, langCode)) return stripEnglishLeakage(retry);
  }

  const groqResult = await attemptGroq(primaryPrompt);
  if (groqResult && isInTargetScript(groqResult, langCode)) return stripEnglishLeakage(groqResult);

  const ollamaResult = await attemptOllama(primaryPrompt);
  if (ollamaResult && isInTargetScript(ollamaResult, langCode)) return stripEnglishLeakage(ollamaResult);

  const bestAttempt = translated || groqResult || ollamaResult;
  if (bestAttempt && bestAttempt !== text) return stripEnglishLeakage(bestAttempt);

  return text;
}

const SCRIPT_PATTERNS = {
  te: /[\u0C00-\u0C7F]/, ta: /[\u0B80-\u0BFF]/, kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/, hi: /[\u0900-\u097F]/, mr: /[\u0900-\u097F]/,
  bn: /[\u0980-\u09FF]/, gu: /[\u0A80-\u0AFF]/, pa: /[\u0A00-\u0A7F]/,
  ur: /[\u0600-\u06FF]/, ar: /[\u0600-\u06FF]/, zh: /[\u4E00-\u9FFF]/,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/, ko: /[\uAC00-\uD7AF]/,
  ru: /[\u0400-\u04FF]/,
};

function detectScript(text) {
  return Object.entries(SCRIPT_PATTERNS)
    .filter(([, p]) => p.test(text)).map(([l]) => l);
}

function isInTargetScript(text, langCode) {
  const p = SCRIPT_PATTERNS[langCode];
  if (!p) return true;
  const s = text.replace(/[\s\d.,!?;:'"()\-\u0000-\u007F]/g, '');
  if (!s.length) return false;
  return ((s.match(new RegExp(p.source, 'g')) || []).length / s.length) > 0.3;
}

async function translate(text, langCode) { return translateText(text, langCode); }
function getLanguageName(c) { return LANGUAGE_NAMES[c] || c; }
function isIndianLanguage(c) { return ['te','hi','ta','kn','ml','mr','bn','gu','pa','ur'].includes(c); }

module.exports = { translate, detectScript, isInTargetScript, getLanguageName, isIndianLanguage, SCRIPT_PATTERNS, LANGUAGE_NAMES };
