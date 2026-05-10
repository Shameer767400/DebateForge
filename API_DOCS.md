# DebateForge API Documentation

## Overview

DebateForge exposes two communication interfaces:

1. **REST API** — Standard HTTP endpoints for authentication, debate management, profiles, and topics
2. **WebSocket API** — Real-time Socket.IO events for live debate sessions

Interactive REST API docs are available at **`/api-docs`** (Swagger UI).

---

## Architecture

```
┌──────────────┐     REST / WebSocket      ┌──────────────────┐
│   React SPA  │ ◄─────────────────────── ► │  Express Backend │
│  (Vercel)    │                            │   (Render)       │
└──────────────┘                            └────────┬─────────┘
                                                     │
                                          ┌──────────┼──────────┐
                                          ▼          ▼          ▼
                                    ┌──────────┐ ┌───────┐ ┌────────────┐
                                    │ MongoDB  │ │ Redis │ │ ML Service │
                                    │ (Atlas)  │ │       │ │ (FastAPI)  │
                                    └──────────┘ └───────┘ └────────────┘
                                                                │
                                                     ┌──────────┼──────────┐
                                                     ▼          ▼          ▼
                                               ┌──────────┐ ┌───────┐ ┌──────┐
                                               │ SpaCy    │ │ NLTK  │ │ FAISS│
                                               │ NLP      │ │ VADER │ │      │
                                               └──────────┘ └───────┘ └──────┘
```

## AI Provider Chain

The LLM service uses a cascading failover chain:

| Priority | Provider | Model | Use Case |
|----------|----------|-------|----------|
| 1 (Indian langs) | Sarvam AI | sarvam-m | Telugu, Hindi, Tamil, etc. |
| 2 | Groq | llama-3.3-70b-versatile | Free, ultra-fast (~500ms) |
| 3 | OpenAI | gpt-4o-mini | Paid, reliable fallback |
| 4 | Ollama | llama3 | Local, no API key needed |

Each provider supports up to 6 API keys with automatic rotation on rate-limit (429).

---

## WebSocket Event Protocol

### Connection

```javascript
const socket = io('https://debateforge-backend.onrender.com', {
  auth: { token: 'JWT_TOKEN' },
});
```

Authentication is performed via JWT token in the `auth.token` field or via HTTP-only cookie.

### Client → Server Events

#### `join_debate`
Join or reconnect to a debate room.

```javascript
socket.emit('join_debate', {
  debateId: '6789abcdef012345',
  tzOffsetMinutes: -330,        // IST = UTC+5:30
  preferredLang: 'te',          // Optional: ISO 639-1 language code
});
```

#### `audio_chunk`
Stream audio data during recording.

```javascript
socket.emit('audio_chunk', {
  debateId: '6789abcdef012345',
  chunk: audioArrayBuffer,
});
```

#### `audio_end`
Signal end of audio recording. Triggers transcription + AI response.

```javascript
socket.emit('audio_end', {
  debateId: '6789abcdef012345',
  transcriptFallback: 'Browser speech-to-text result',  // Optional fallback
});
```

#### `transcript_direct`
Send text directly (for text-mode debates or when mic is unavailable).

```javascript
socket.emit('transcript_direct', {
  debateId: '6789abcdef012345',
  text: 'My argument is that...',
});
```

#### `set_language`
Override the debate language at any time.

```javascript
socket.emit('set_language', {
  debateId: '6789abcdef012345',
  lang: 'hi',  // Switch to Hindi
});
```

#### `end_debate`
End the debate early (triggers judge scoring if enough rounds played).

```javascript
socket.emit('end_debate', {
  debateId: '6789abcdef012345',
  tzOffsetMinutes: -330,
});
```

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `debate_joined` | `{ topic, userSide, aiPosition, difficulty, format }` | Confirmation after joining |
| `transcript_final` | `{ text, language }` | User's transcribed text |
| `ai_thinking` | `{ language }` | AI is generating a response |
| `ai_text_chunk` | `{ text, turnId, isPlaceholder? }` | Streaming AI text chunk |
| `ai_turn_complete` | `{ fullText, round, detectedLanguage, turnId }` | Complete AI response |
| `ai_translating` | `{ language }` | Translation in progress |
| `fallacy_detected` | `{ detected, fallacy_type, confidence, explanation }` | Real-time fallacy alert |
| `scores_update` | `{ logic, evidence, clarity, overall, feedback }` | Per-turn scores |
| `phase_update` | `{ phase, phaseName, timeLimit, instruction, ... }` | Format phase transition |
| `judge_verdict` | `{ userScore, aiScore, winner, feedback, ... }` | End-of-debate report card |
| `debate_ended` | `{ winner, userFinalScore, forfeit }` | Debate concluded |
| `error` | `{ message }` | Error notification |

### Rate Limits

| Event | Max | Window |
|-------|-----|--------|
| `join_debate` | 20 | 60s |
| `audio_chunk` | 600 | 60s |
| `audio_end` | 60 | 60s |
| `transcript_direct` | 60 | 60s |
| `set_language` | 60 | 60s |
| `end_debate` | 20 | 60s |

---

## ML Service API

The ML microservice (FastAPI) provides four endpoint groups:

### Fallacy Detection

```http
POST /fallacy/detect
Content-Type: application/json

{
  "argument": "Everyone knows this is wrong",
  "context": ["Previous argument text"],
  "user_id": "user123"
}
```

**Response:**
```json
{
  "detected": true,
  "fallacy_type": "hasty_generalization",
  "confidence": 68.0,
  "explanation": "Your reasoning draws a broad conclusion from too few examples.",
  "triggered_phrase": "everyone knows"
}
```

Detection pipeline: Rule-based → Semantic similarity → SpaCy NLP analysis

### Argument Scoring

```http
POST /scorer/score
Content-Type: application/json

{
  "argument": "Studies show that 73% of participants...",
  "topic": "AI regulation",
  "context": [],
  "turn_number": 3
}
```

**Response:**
```json
{
  "logic": 75,
  "evidence": 85,
  "clarity": 70,
  "overall": 77,
  "feedback": {
    "logic": "Solid reasoning with clear causal structure.",
    "evidence": "Strong use of specific data.",
    "clarity": "Mostly clear, some sentences could be shorter."
  },
  "sentiment": {
    "compound": 0.234,
    "positive": 0.15,
    "negative": 0.05,
    "neutral": 0.80
  }
}
```

### Memory / Coaching

```http
GET /memory/weaknesses/{user_id}
GET /memory/coaching-plan/{user_id}
POST /memory/store
DELETE /memory/clear/{user_id}
```

### Transcription

```http
POST /transcription/transcribe
Content-Type: multipart/form-data

file: audio.webm
topic: "AI regulation"
```

---

## Debate Formats

| Format | Phases | Description |
|--------|--------|-------------|
| **Freeform** | 1 | Open debate, no phase restrictions |
| **Oxford Union** | 5 | Opening → Rebuttals → Cross-Exam → Closing → Judging |
| **Lincoln-Douglas** | 8 | Classic values-based individual debate |
| **Parliamentary** | 7 | Government vs Opposition with formal speaking order |

Each phase has configurable time limits and AI behavior instructions.
