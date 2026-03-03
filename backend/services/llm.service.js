const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI }              = require('openai');

/* ── Lazy singletons ── */
let _genAI  = null;
let _openai = null;

function getGemini() {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/* ── Wait helper ── */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function formatFallacyProfile(profile) {
  if (!profile || Object.keys(profile).length === 0) return 'No history yet';
  return Object.entries(profile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type}: ${count} times`)
    .join(', ');
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
Weakness Summary: ${session.weaknessSummary || 'No data yet — debate normally'}

=== STRICT RULES ===
1. NEVER agree with the user. Never concede your position.
2. Maximum 4 sentences per response (this is spoken word)
3. Use ONE specific statistic or study in every response
4. End EVERY response with either a question OR a direct challenge to the user
5. From round 3 onwards, exploit the user's documented fallacy weaknesses
6. Escalate rhetorical intensity each round

=== DIFFICULTY BEHAVIOR ===
beginner:       Simple vocabulary, gentle challenges
intermediate:   Statistics and research, moderate pressure
expert:         Advanced rhetoric, name the user's fallacies, high pressure
devils_advocate: Take the most extreme defensible version of your position

=== FORMAT ===
Respond ONLY with your spoken debate argument (max 4 sentences).
No labels, stage directions, or meta-commentary.`;
}

/* ─── Gemini streaming (with one retry on 429) ─── */
async function* streamGemini(session, userArgument) {
  const history  = (session.conversationHistory || []).slice(-10);

  const model = getGemini();
  const chat  = model.startChat({
    history: history.map(msg => ({
      role:  msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })),
    systemInstruction: {
      role:  'system',
      parts: [{ text: buildSystemPrompt(session) }],
    },
    generationConfig: { maxOutputTokens: 180, temperature: 0.85 },
  });

  let attempts = 0;
  while (attempts < 2) {
    try {
      const result = await chat.sendMessageStream(userArgument);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
      }
      return; // success
    } catch (e) {
      if (e?.status === 429 && attempts === 0) {
        // Parse retry delay from error details
        const retryDelay = e.errorDetails?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay;
        const delaySec = retryDelay ? parseInt(retryDelay, 10) : 5;
        const delayMs  = Math.min(delaySec * 1000, 15000); // cap at 15s
        // eslint-disable-next-line no-console
        console.warn(`[LLM] Gemini 429, retrying after ${delayMs}ms...`);
        await wait(delayMs);
        attempts++;
      } else {
        throw e;
      }
    }
  }
}

/* ─── OpenAI streaming fallback ─── */
async function* streamOpenAI(session, userArgument) {
  const systemPrompt = buildSystemPrompt(session);
  const history      = (session.conversationHistory || []).slice(-10);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: userArgument },
  ];

  const stream = await getOpenAI().chat.completions.create({
    model:       'gpt-4o-mini',
    messages,
    max_tokens:  200,
    temperature: 0.85,
    stream:      true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

/* ─── Public: Gemini first, OpenAI fallback ─── */
async function* streamDebateResponse(session, userArgument) {
  try {
    yield* streamGemini(session, userArgument);
  } catch (geminiErr) {
    const isQuota = geminiErr?.status === 429;
    const is404   = geminiErr?.status === 404;
    if (isQuota || is404) {
      // eslint-disable-next-line no-console
      console.warn(`[LLM] Gemini ${geminiErr.status}, falling back to OpenAI gpt-4o-mini`);
      try {
        yield* streamOpenAI(session, userArgument);
      } catch (openaiErr) {
        if (openaiErr?.status === 429) {
          throw new Error('QUOTA_EXHAUSTED: Both Gemini and OpenAI rate limits are currently exceeded. Please wait a few minutes and try again.');
        }
        throw openaiErr;
      }
    } else {
      throw geminiErr;
    }
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
