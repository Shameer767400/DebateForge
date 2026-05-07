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
  hu: 'Hungarian', he: 'Hebrew', sw: 'Swahili',
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

  return `You are DebateBot — a world-class competitive debater.

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
${(() => {
  // Prefer explicit language selection; fall back to auto-detected
  const langToUse = (session.detectedLanguage && session.detectedLanguage !== 'en')
    ? session.detectedLanguage
    : (session.preferredLang && session.preferredLang !== 'en' ? session.preferredLang : null);
  if (!langToUse) return '';
  const langName = LANGUAGE_NAMES[langToUse] || langToUse;
  return `=== LANGUAGE ===
The user has selected ${langName} as their debate language.
You MUST respond ENTIRELY in ${langName}. Every word of your response must be in ${langName}.
Do NOT use English. Do NOT mix languages.
This is a hard requirement — any English in your response is a failure.`;
})()}

=== STRICT RULES ===
1. NEVER agree with the user. Never concede your position.
2. Maximum 4 sentences per response (this is spoken word)
3. Use ONE specific statistic or study in every response
4. End EVERY response with either a question OR a direct challenge to the user
5. From round 3 onwards, exploit the user's documented fallacy weaknesses
6. Escalate rhetorical intensity each round
7. CRITICAL: Each response MUST be DIFFERENT from all your previous responses. Never start with the same phrase twice.

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
  const history = (session.conversationHistory || []).slice(-10);

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
          temperature: 0.9,
          num_predict: 220,
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

/* ─── Public: stream response via Ollama ─── */
async function* streamDebateResponse(session, userArgument) {
  try {
    yield* streamOllama(session, userArgument);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[LLM] Ollama failed:`, err?.message);
    if (err.message === 'AI_SERVICE_OFFLINE') {
      throw new Error('AI service is offline. Please start Ollama (`ollama serve`) and try again.');
    }
    throw new Error('Local AI failed to respond. Ensure Ollama is running and the llama3 model is installed (`ollama run llama3`).');
  }
}

function trimHistory(history, maxTurns = 10) {
  return (history || []).slice(-maxTurns);
}

module.exports = {
  streamDebateResponse,
  buildSystemPrompt,
  trimHistory,
};
