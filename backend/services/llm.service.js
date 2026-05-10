const axios = require('axios');

/* ── Local Ollama Config (Addition 4) ── */
const OLLAMA_URL    = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL || 'llama3';

/* ── Wait helper ── */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── ISO 639-1 language code → human-readable name ── */
const LANGUAGE_NAMES = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam',
  mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', ur: 'Urdu',
  fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', it: 'Italian',
  nl: 'Dutch', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', tr: 'Turkish', pl: 'Polish', sv: 'Swedish', da: 'Danish',
  fi: 'Finnish', no: 'Norwegian', el: 'Greek', th: 'Thai', vi: 'Vietnamese',
  id: 'Indonesian', ms: 'Malay', ro: 'Romanian', uk: 'Ukrainian', cs: 'Czech',
  hu: 'Hungarian', he: 'Hebrew', sw: 'Swahili', sn: 'Shona',
};

function formatFallacyProfile(profile) {
  if (!profile || Object.keys(profile).length === 0) return 'No history yet';
  return Object.entries(profile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type}: ${count} times`)
    .join(', ');
}

function formatWeaknessList(items, limit = 8) {
  if (!Array.isArray(items) || items.length === 0) return 'None yet';
  return items
    .filter(Boolean)
    .slice(-limit)
    .join('; ');
}

function buildSystemPrompt(session) {
  const personaStyles = {
    balanced:   'Argue in a balanced, measured style. Be firm but fair.',
    socratic:   "Use the Socratic method: respond mostly with probing questions that expose contradictions in the user's reasoning.",
    aggressive: 'Be rhetorically aggressive and assertive. Use sharp wit, pointed challenges, and rapid-fire rebuttals.',
    academic:   'Argue like a university professor: cite specific studies, use precise terminology, and maintain a scholarly tone.',
    casual:     'Argue in a casual, conversational tone — like a sharp friend debating over coffee.',
  };
  const personaInstruction = personaStyles[session.persona] || personaStyles.balanced;

  // Build adaptive coaching section if coaching plan is available
  let coachingSection = '';
  const plan = session.coachingPlan;
  if (plan && plan.drill_fallacy && plan.drill_fallacy !== 'none') {
    const fallacyReadable = plan.drill_fallacy.replace(/_/g, ' ');
    coachingSection = `
=== ADAPTIVE COACHING MISSION ===
You are not just a debate opponent — you are this user's COACH.
TARGET WEAKNESS: ${fallacyReadable} (committed ${plan.drill_fallacy_count || 0} times in past debates)
WEAK PHASE: ${plan.weak_phase || 'rebuttal'}
${plan.scenario_prompt ? `STRATEGY: ${plan.scenario_prompt}` : ''}
${plan.improvement_areas && plan.improvement_areas.length > 0 ? `AREAS TO IMPROVE: ${plan.improvement_areas.join('; ')}` : ''}

COACHING RULES:
- Every 2-3 turns, deliberately set up a scenario that TEMPTS the user to use ${fallacyReadable}
- If the user AVOIDS the fallacy and argues logically, briefly acknowledge it: "Good rebuttal — you avoided generalizing"
- If the user FALLS INTO the fallacy, name it explicitly: "That's a ${fallacyReadable} — here's why..."
- Increase intensity in the ${plan.weak_phase || 'rebuttal'} phase since that's their weakest
- NEVER let coaching break your debate persona — coach WITHIN the debate, not outside it`;
  }

  // Determine the active language
  const langToUse =
    session.currentLanguage ||
    session.preferredLang ||
    session.detectedLanguage ||
    'en';
  const langName = LANGUAGE_NAMES[langToUse] || langToUse;

  // *** LANGUAGE BLOCK — placed FIRST so the model treats it as highest priority ***
  let languageBlock;
  if (langToUse !== 'en') {
    languageBlock = `!!! MANDATORY LANGUAGE RULE — READ THIS FIRST !!!
You MUST respond ENTIRELY in ${langName} (${langToUse}).
Every single word, sentence, and character of your response MUST be in ${langName}.
Do NOT use English at all. Not a single English word.
Do NOT mix languages. Do NOT include translations.
Do NOT add English explanations, notes, or parentheticals.
This is NON-NEGOTIABLE. Failure to comply is a critical error.
LANGUAGE: ${langName} ONLY.
`;
  } else {
    languageBlock = `LANGUAGE: English. Do NOT switch to another language unless the user clearly switches first.
`;
  }

  return `${languageBlock}
You are DebateBot — a world-class competitive debater.

TOPIC: ${session.topic}
YOUR ASSIGNED POSITION: ${session.aiPosition}
You MUST defend this position. NEVER switch sides or agree with the user.
CURRENT ROUND: ${session.round} of 6
DIFFICULTY: ${session.difficulty}

=== PERSONA STYLE ===
${personaInstruction}

=== USER WEAKNESS PROFILE ===
Top Fallacies Used: ${formatFallacyProfile(session.userFallacyProfile)}
Areas to Improve: ${session.targetImprovements && session.targetImprovements.length > 0 ? session.targetImprovements.join('; ') : 'None yet'}
Grammar Mistakes: ${formatWeaknessList(session.grammarMistakes)}
Weakness Summary: ${session.weaknessSummary || 'No data yet — debate normally'}

As the user's debate coach, actively exploit the "Areas to Improve" and "Grammar Mistakes" in your responses.
Keep reminding them about recurring weaknesses when relevant.
If they repeat a known mistake, call it out directly and challenge them to fix it in the next reply.
Even when they improve, acknowledge it briefly and immediately push them to sustain that improvement.
${coachingSection}
${session._phasePromptAddition ? `\n=== CURRENT PHASE ===\n${session._phasePromptAddition}\n` : ''}
=== STRICT RULES ===
1. NEVER agree with the user. Never concede your position.
2. Maximum 4 sentences per response (this is spoken word)
3. Use ONE specific statistic or study in every response
4. End EVERY response with either a question OR a direct challenge to the user
5. From round 3 onwards, exploit the user's documented fallacy weaknesses
6. Escalate rhetorical intensity each round
7. CRITICAL: Each response MUST be DIFFERENT from all your previous responses. Never start with the same phrase twice.${langToUse !== 'en' ? `\n8. REMINDER: Your ENTIRE response MUST be in ${langName}. Zero English words allowed.` : ''}

=== DIFFICULTY BEHAVIOR ===
beginner:       Simple vocabulary, gentle challenges
intermediate:   Statistics and research, moderate pressure
expert:         Advanced rhetoric, name the user's fallacies, high pressure
devils_advocate: Take the most extreme defensible version of your position

=== FORMAT ===
Respond ONLY with your spoken debate argument (max 4 sentences).
No labels, stage directions, or meta-commentary.`;
}

/* ─── Ollama streaming (local LLM) ─── */
async function* streamOllama(session, userArgument) {
  const history = (session.conversationHistory || []).slice(-6);

  try {
    // Build a summary of what we've already said to prevent repetition
    const previousAiReplies = history
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .slice(-3);

    const systemPrompt = buildSystemPrompt(session) +
      (previousAiReplies.length > 0
        ? `\n\n=== YOUR PREVIOUS RESPONSES (DO NOT REPEAT THESE) ===\n${previousAiReplies.map((r, i) => `Round ${i + 1}: ${r.slice(0, 100)}...`).join('\n')}`
        : '');

    const response = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          { role: 'user', content: userArgument },
        ],
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 160,
          top_p: 0.92,
          repeat_penalty: 1.25,
          seed: Math.floor(Math.random() * 2147483647), // random seed = unique response each call
        },
      },
      {
        responseType: 'stream',
        timeout: 60000,
      }
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
    // eslint-disable-next-line no-console
    console.error(`[OLLAMA] ${isConnRefused ? 'Connection refused — is Ollama running?' : 'Error:'} ${e.message}`);
    if (isConnRefused) {
      // Don't yield fallback text — let the caller know the service is down
      throw new Error('AI_SERVICE_OFFLINE');
    }
    yield "That's an interesting point, but I must strongly disagree. " +
          "Your argument lacks the empirical foundation needed to be convincing. " +
          "Can you provide specific evidence to support that claim?";
  }
}

/* ─── OpenAI key rotation pool ─── */
/**
 * Loads all available OpenAI API keys from environment.
 * Supports OPENAI_API_KEY, OPENAI_API_KEY_2 through OPENAI_API_KEY_6.
 */
function getOpenAIKeys() {
  const keys = [];
  const primary = process.env.OPENAI_API_KEY;
  if (primary) keys.push(primary);
  for (let i = 2; i <= 6; i++) {
    const k = process.env[`OPENAI_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys;
}

// Track rate-limited keys: { keyIndex: failedAtTimestamp }
const _rateLimitedKeys = new Map();
const RATE_LIMIT_COOLDOWN_MS = 60000; // 60s cooldown before retrying a failed key

function getNextAvailableKeyIndex(keys) {
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const failedAt = _rateLimitedKeys.get(i);
    if (!failedAt || (now - failedAt) > RATE_LIMIT_COOLDOWN_MS) {
      _rateLimitedKeys.delete(i); // Cooldown expired, key is available again
      return i;
    }
  }
  return -1; // All keys exhausted
}

/* ─── OpenAI direct generation (all languages — fast + reliable) ─── */
/**
 * Generate a debate response using OpenAI GPT-4o-mini.
 * Works for ALL languages — generates natively in the target language.
 * Automatically rotates through multiple API keys on rate-limit (429).
 */
async function generateOpenAIDirect(session, userArgument) {
  const keys = getOpenAIKeys();
  if (keys.length === 0) return null;

  const systemPrompt = buildSystemPrompt(session);
  const history = (session.conversationHistory || []).slice(-6);

  const previousAiReplies = history
    .filter(m => m.role === 'assistant')
    .map(m => m.content)
    .slice(-3);

  const fullSystemPrompt = systemPrompt +
    (previousAiReplies.length > 0
      ? `\n\n=== YOUR PREVIOUS RESPONSES (DO NOT REPEAT THESE) ===\n${previousAiReplies.map((r, i) => `Round ${i + 1}: ${r.slice(0, 100)}...`).join('\n')}`
      : '');

  const messages = [
    { role: 'system', content: fullSystemPrompt },
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: userArgument },
  ];

  // Try each available key until one works
  let lastError = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIndex = getNextAvailableKeyIndex(keys);
    if (keyIndex === -1) {
      console.warn(`[OPENAI] All ${keys.length} API keys are rate-limited`); // eslint-disable-line no-console
      break;
    }

    const apiKey = keys[keyIndex];
    const keyLabel = keyIndex === 0 ? 'primary' : `key-${keyIndex + 1}`;

    try {
      const response = await Promise.race([
        axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 300,
          temperature: 0.7,
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI timed out')), 15000)),
      ]);

      const text = response.data?.choices?.[0]?.message?.content;
      if (text?.trim()) {
        console.log(`[OPENAI] Generated ${text.trim().length} chars via ${keyLabel} (lang: ${session.currentLanguage || 'en'})`); // eslint-disable-line no-console
        return text.trim();
      }
    } catch (e) {
      const status = e.response?.status;
      const errMsg = e.response?.data?.error?.message || e.message?.slice(0, 120);
      console.warn(`[OPENAI] ${keyLabel} failed (${status || 'timeout'}): ${errMsg}`); // eslint-disable-line no-console
      lastError = e;

      // Mark key as rate-limited on 429 or auth errors
      if (status === 429 || status === 401 || status === 403) {
        _rateLimitedKeys.set(keyIndex, Date.now());
        continue; // Try next key
      }
      // For other errors (network, timeout), don't rotate — likely a general issue
      break;
    }
  }

  return null;
}

/* ─── Groq generation (FREE, ultra-fast, multilingual) ─── */
/**
 * Generate a debate response using Groq's free API.
 * Groq runs on custom LPU chips — responses come in ~500ms-2s.
 * Uses llama-3.3-70b-versatile which handles multilingual well.
 */
async function generateGroqDirect(session, userArgument) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = buildSystemPrompt(session);
  const history = (session.conversationHistory || []).slice(-6);

  const previousAiReplies = history
    .filter(m => m.role === 'assistant')
    .map(m => m.content)
    .slice(-3);

  const fullSystemPrompt = systemPrompt +
    (previousAiReplies.length > 0
      ? `\n\n=== YOUR PREVIOUS RESPONSES (DO NOT REPEAT THESE) ===\n${previousAiReplies.map((r, i) => `Round ${i + 1}: ${r.slice(0, 100)}...`).join('\n')}`
      : '');

  const messages = [
    { role: 'system', content: fullSystemPrompt },
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: userArgument },
  ];

  try {
    const response = await Promise.race([
      axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 300,
        temperature: 0.7,
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Groq timed out')), 10000)),
    ]);

    const text = response.data?.choices?.[0]?.message?.content;
    if (text?.trim()) {
      console.log(`[GROQ] Generated ${text.trim().length} chars (lang: ${session.currentLanguage || 'en'})`); // eslint-disable-line no-console
      return text.trim();
    }
    return null;
  } catch (e) {
    const status = e.response?.status;
    const errMsg = e.response?.data?.error?.message || e.message?.slice(0, 150);
    console.warn(`[GROQ] Failed (${status || 'timeout'}): ${errMsg}`); // eslint-disable-line no-console
    return null;
  }
}

/* ─── Public: generate response via Groq (primary) → OpenAI → Ollama (fallback) ─── */
async function* streamDebateResponse(session, userArgument) {
  const lang = session.currentLanguage || 'en';

  // 1. Try Groq first — FREE, ultra-fast (~500ms-2s)
  console.log(`[LLM] Trying Groq (lang: ${lang})`); // eslint-disable-line no-console
  const groqResponse = await generateGroqDirect(session, userArgument);
  if (groqResponse) {
    yield groqResponse;
    return;
  }

  // 2. Try OpenAI — paid but reliable
  console.log(`[LLM] Groq unavailable, trying OpenAI (lang: ${lang})`); // eslint-disable-line no-console
  const openaiResponse = await generateOpenAIDirect(session, userArgument);
  if (openaiResponse) {
    yield openaiResponse;
    return;
  }

  // 3. Last resort — local Ollama
  console.warn(`[LLM] All cloud APIs failed, falling back to Ollama`); // eslint-disable-line no-console
  try {
    yield* streamOllama(session, userArgument);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[LLM] Ollama also failed:`, err?.message);
    if (err.message === 'AI_SERVICE_OFFLINE') {
      throw new Error('AI service is offline. Please start Ollama (`ollama serve`) and try again.');
    }
    throw new Error('All AI services failed. Please check your API keys and try again.');
  }
}

function trimHistory(history, maxTurns = 10) {
  return (history || []).slice(-maxTurns);
}

/* ═══════════════════════════════════════════════════════════════
   Gemini Translation — translates Ollama's English debate output
   into the user's selected language.
   ═══════════════════════════════════════════════════════════════ */
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
    // eslint-disable-next-line no-console
    console.error('[GEMINI] Failed to initialize:', e.message);
    return null;
  }
}

/**
 * Translate text to a target language using Gemini (primary) or Ollama (fallback).
 * Returns the translated text, or the original if all translation methods fail.
 *
 * @param {string} text      — English text to translate
 * @param {string} langCode  — ISO 639-1 code (e.g. 'te', 'hi', 'ta')
 * @returns {Promise<string>}
 */
async function translateText(text, langCode) {
  if (!text || !langCode || langCode === 'en') return text;

  const langName = LANGUAGE_NAMES[langCode] || langCode;

  // Script-based validation: check if output contains characters from the target language
  const SCRIPT_PATTERNS = {
    te: /[\u0C00-\u0C7F]/,  // Telugu
    ta: /[\u0B80-\u0BFF]/,  // Tamil
    kn: /[\u0C80-\u0CFF]/,  // Kannada
    ml: /[\u0D00-\u0D7F]/,  // Malayalam
    hi: /[\u0900-\u097F]/,  // Devanagari (Hindi/Marathi)
    mr: /[\u0900-\u097F]/,  // Marathi (also Devanagari)
    bn: /[\u0980-\u09FF]/,  // Bengali
    gu: /[\u0A80-\u0AFF]/,  // Gujarati
    pa: /[\u0A00-\u0A7F]/,  // Punjabi (Gurmukhi)
    ur: /[\u0600-\u06FF]/,  // Urdu (Arabic script)
    ar: /[\u0600-\u06FF]/,  // Arabic
    zh: /[\u4E00-\u9FFF]/,  // Chinese
    ja: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/,  // Japanese
    ko: /[\uAC00-\uD7AF\u1100-\u11FF]/,  // Korean
    ru: /[\u0400-\u04FF]/,  // Russian/Cyrillic
  };

  function isInTargetLanguage(output) {
    const pattern = SCRIPT_PATTERNS[langCode];
    if (!pattern) return true; // Can't validate Latin-script languages
    // At least 30% of non-whitespace characters should be in the target script
    const stripped = output.replace(/[\s\d.,!?;:'"()\-—–…\u0000-\u007F]/g, '');
    if (stripped.length === 0) return false;
    const matches = (stripped.match(new RegExp(pattern.source, 'g')) || []).length;
    return (matches / stripped.length) > 0.3;
  }

  function stripEnglishLeakage(output) {
    // Remove any leading/trailing English sentences before/after the target language text
    const pattern = SCRIPT_PATTERNS[langCode];
    if (!pattern) return output;
    const lines = output.split(/\n/).filter(l => l.trim());
    return lines.filter(line => {
      // Keep line if it contains target-script characters
      return pattern.test(line);
    }).join('\n') || output;
  }

  const primaryPrompt = `You are a professional translator. Translate the following text into ${langName}.

CRITICAL RULES:
1. Output ONLY the ${langName} translation. Nothing else.
2. Every single word must be in ${langName}. ZERO English words allowed.
3. Do NOT include the original English text.
4. Do NOT add notes, explanations, or labels like "Translation:" or "Here is the translation".
5. Translate proper nouns and technical terms into ${langName} equivalents.
6. Preserve the argumentative tone.

TEXT:
${text}`;

  const retryPrompt = `TRANSLATE TO ${langName.toUpperCase()} ONLY. Your previous translation contained English. This time output ONLY ${langName} text. No English at all. Not even one English word.

${text}`;

  async function attemptGemini(prompt) {
    const model = getGeminiModel();
    if (!model) return null;
    try {
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini translation timed out')), 15000)),
      ]);
      const translated = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
      return translated?.trim() || null;
    } catch (e) {
      console.warn(`[GEMINI] Translation failed: ${e.message?.slice(0, 120)}`); // eslint-disable-line no-console
      return null;
    }
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
      console.error(`[OLLAMA] Translation failed:`, e.message?.slice(0, 120)); // eslint-disable-line no-console
      return null;
    }
  }

  // Attempt 1: Gemini primary translation
  let translated = await attemptGemini(primaryPrompt);
  if (translated && translated.length > 0) {
    // Validate: does the output actually contain target-language script?
    if (isInTargetLanguage(translated)) {
      translated = stripEnglishLeakage(translated);
      console.log(`[TRANSLATE] Gemini → ${langName}: ${text.length} → ${translated.length} chars`); // eslint-disable-line no-console
      return translated;
    }
    // First attempt returned English/mixed — retry with stricter prompt
    console.warn(`[TRANSLATE] Gemini returned mixed/English output, retrying with stricter prompt`); // eslint-disable-line no-console
    const retry = await attemptGemini(retryPrompt);
    if (retry && isInTargetLanguage(retry)) {
      console.log(`[TRANSLATE] Gemini retry → ${langName}: ${retry.length} chars`); // eslint-disable-line no-console
      return stripEnglishLeakage(retry);
    }
  }

  // Attempt 2: Ollama fallback
  console.log(`[TRANSLATE] Falling back to Ollama for ${langName} translation`); // eslint-disable-line no-console
  const ollamaResult = await attemptOllama(primaryPrompt);
  if (ollamaResult && isInTargetLanguage(ollamaResult)) {
    console.log(`[TRANSLATE] Ollama → ${langName}: ${ollamaResult.length} chars`); // eslint-disable-line no-console
    return stripEnglishLeakage(ollamaResult);
  }

  // All attempts failed — return whatever we got (even if mixed) rather than pure English
  const bestAttempt = translated || ollamaResult;
  if (bestAttempt && bestAttempt !== text) {
    console.warn(`[TRANSLATE] Returning best-effort translation (may contain English)`); // eslint-disable-line no-console
    return stripEnglishLeakage(bestAttempt);
  }

  console.error(`[TRANSLATE] All translation methods failed for ${langName}`); // eslint-disable-line no-console
  return text;
}

module.exports = {
  streamDebateResponse,
  buildSystemPrompt,
  trimHistory,
  translateText,
  LANGUAGE_NAMES,
};
