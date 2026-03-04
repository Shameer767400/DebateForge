# ⚔ DebateForge

**Sharpen your arguments against AI.** Real-time voice debate platform with live scoring, fallacy detection, and competitive ELO rankings.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎤 **Voice Debates** | Speak your arguments in real-time via browser mic — transcribed by Whisper |
| 🤖 **AI Opponent** | GPT/Gemini-powered responses with streaming text + TTS voice output |
| 📊 **Live Scoring** | Logic, Evidence, and Clarity scored after each round |
| 🔍 **Fallacy Detection** | Real-time detection of logical fallacies (strawman, ad hominem, etc.) |
| 🏆 **ELO Leaderboard** | Competitive ranking system — climb the global leaderboard |
| 📈 **Analytics Dashboard** | Score trends, win rate, debate history, fallacy radar chart |
| 👤 **User Profiles** | Avatar upload, bio, stats overview |
| 🎊 **Victory Confetti** | CSS particle burst + victory fanfare when you win |
| 🔊 **Sound Effects** | Audio cues via Web Audio API — no external files |
| 🔔 **Toast Notifications** | Glassmorphic slide-in alerts for login, errors, and results |
| ⌨ **Keyboard Shortcuts** | `Esc` to end debate |
| 📱 **Fully Responsive** | Mobile-optimized on all pages (6 breakpoints) |
| ♿ **Accessible** | `prefers-reduced-motion` support, semantic HTML |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, React Router v6, Axios, Recharts |
| **Backend** | Node.js, Express 5, Mongoose, JWT auth |
| **Database** | MongoDB (Atlas or local) |
| **Cache** | Redis (optional, for ELO + leaderboard) |
| **WebSocket** | ws — real-time debate events |
| **AI/ML** | Python FastAPI — Whisper transcription, GPT/Gemini responses, TTS |
| **Testing** | Jest, Supertest, MongoDB Memory Server |

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18
- MongoDB (local or Atlas URI)
- Python ≥ 3.9 (for the ML microservice)
- Redis (optional)

### 1. Clone

```bash
git clone https://github.com/Shameer767400/DebateForge.git
cd DebateForge/debateforge
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in your MongoDB URI, JWT secret, API keys, etc.
npm install
npm start              # runs on http://localhost:5001
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # set REACT_APP_API_URL=http://localhost:5001
npm install
npm start              # runs on http://localhost:3000
```

### 4. ML Service (optional, for voice + AI)

```bash
cd ml
cp .env.example .env   # set FRONTEND_URL
pip install -r requirements.txt
uvicorn main:app --port 8001
```

---

## 📁 Project Structure

```
debateforge/
├── backend/
│   ├── config/          # database.js, redis.js
│   ├── controllers/     # auth, debate, profile, topic
│   ├── middleware/       # JWT auth middleware
│   ├── models/          # Mongoose schemas
│   ├── routes/          # Express routes
│   ├── services/        # LLM, TTS, Whisper integrations
│   ├── websocket/       # Real-time debate engine
│   ├── tests/           # Jest + Supertest API tests
│   └── server.js
├── frontend/
│   ├── public/          # favicon, index.html, manifest
│   └── src/
│       ├── components/  # PageLoader, Confetti, ErrorBoundary, Toast
│       ├── context/     # AuthContext, ToastContext
│       ├── hooks/       # useDebateSocket
│       ├── pages/       # Landing, Login, Register, Lobby, Debate,
│       │                  Dashboard, Leaderboard, Profile, History, 404
│       └── styles/      # Page-specific CSS + theme.css
└── ml/
    ├── routers/         # transcription, tts, debate
    ├── services/        # whisper, gpt, tts
    └── main.py
```

---

## 🧪 Running Tests

```bash
cd backend
npm test    # Jest + Supertest with MongoDB Memory Server
```

---

## 🔒 Security

- JWT token authentication
- Password hashing with bcrypt
- Rate limiting on auth routes (15 req / 15 min)
- Global rate limiting (100 req / 15 min)
- Input validation on all endpoints

---

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Shameer767400/Shameer767400?utm_source=oss&utm_medium=github&utm_campaign=Shameer767400%2FShameer767400&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

## 📜 License

MIT

---

<p align="center">
  Built with ☕ and competitive spirit<br/>
  <strong>DebateForge</strong> — because arguments should be won with logic, not volume.
</p>
