const { GoogleGenerativeAI } = require('@google/generative-ai');

/* Lazy singleton — created on first use so a missing key doesn't crash startup */
let _genAI = null;
function getModel() {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  }
  // Use Gemini 2.0 Flash — much higher free-tier quota (1500 RPD vs 20 RPD for 2.5)
  return _genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

function formatFallacyProfile(profile) {
  if (!profile || Object.keys(profile).length === 0) return 'No history yet';

  return Object.entries(profile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type}: ${count} times`)
    .join(', ');
}

function buildSystemPrompt(session) {
  return `You are DebateBot — a world-class competitive debater.

TOPIC: ${session.topic}
YOUR ASSIGNED POSITION: ${session.aiPosition}
You MUST defend this position. NEVER switch sides or agree with the user.
CURRENT ROUND: ${session.round} of 6
DIFFICULTY: ${session.difficulty}

=== USER WEAKNESS PROFILE ===
Based on past debates, this user has these documented weaknesses:
Top Fallacies Used: ${formatFallacyProfile(session.userFallacyProfile)}
Weakness Summary: ${session.weaknessSummary || 'No data yet — debate normally'}

=== STRICT RULES ===
1. NEVER agree with the user. Never concede your position.
2. Maximum 4 sentences per response (this is spoken word)
3. Use ONE specific statistic or study in every response
4. End EVERY response with either a question OR a direct challenge to the user
5. From round 3 onwards: actively exploit the user's documented fallacy weaknesses
6. Escalate rhetorical intensity each round

=== DIFFICULTY BEHAVIOR ===
beginner:       Simple vocabulary, gentle challenges, forgiving
intermediate:   Statistics and research, moderate pressure
expert:         Advanced rhetoric, directly name the user's fallacies, high pressure
devils_advocate: Take the most extreme defensible version of your position

=== FORMAT ===
Respond ONLY with your spoken debate argument.
No labels, stage directions, or meta-commentary.
Speak as if physically present at a debate podium.`;
}

async function* streamDebateResponse(session, userArgument) {
  const history = (session.conversationHistory || []).slice(-10);

  // Convert OpenAI-style history to Gemini-style
  const contents = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  // Gemini handles "system" instructions via the systemInstruction parameter in getGenerativeModel
  // But for simple replacement in this streaming function, we'll prepend it to the first message or use chat history
  const model = getModel();
  const chat = model.startChat({
    history: contents,
    systemInstruction: {
      role: 'system',
      parts: [{ text: buildSystemPrompt(session) }],
    },
    generationConfig: {
      maxOutputTokens: 180,
      temperature: 0.85,
    },
  });

  const result = await chat.sendMessageStream(userArgument);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      yield text;
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

