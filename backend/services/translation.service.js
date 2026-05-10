'use strict';

/**
 * @fileoverview Translation service — multilingual support for DebateForge.
 *
 * @module services/translation.service
 */

const { translateText, LANGUAGE_NAMES } = require('./llm.service');

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
