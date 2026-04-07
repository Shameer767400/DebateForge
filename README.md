# ⚔ DebateForge

**Sharpen your arguments against AI.** Real-time voice & text debate platform with live scoring, fallacy detection, formal debate formats, and competitive ELO rankings.

---

## ✨ Features

### 🎤 Core Debate
| Feature | Description |
|---------|-------------|
| 🎤 **Voice Debates** | Speak your arguments in real-time via browser mic — transcribed by Whisper |
| 📝 **Text Debates** | Full text-based debate mode as an alternative to voice |
| 🤖 **AI Opponent** | GPT/Gemini-powered responses with streaming text + TTS voice output |
| 📊 **Live Scoring** | Logic, Evidence, and Clarity scored after each round |
| 🔍 **Fallacy Detection** | Real-time detection of logical fallacies (strawman, ad hominem, slippery slope, etc.) |
| 🧠 **AI Memory** | FAISS / Pinecone vector store tracks your argument history and weaknesses across debates |
| 🏛 **Formal Debate Formats** | Freeform, Oxford Union, Lincoln-Douglas, and British Parliamentary formats |
| ⏱ **Phase Timers** | Per-phase time limits with automatic phase progression |

### 🏆 Competitive & Progress
| Feature | Description |
|---------|-------------|
| 🏆 **ELO Leaderboard** | Competitive ranking system — climb the global leaderboard |
| 📈 **Analytics Dashboard** | Score trends, win rate, debate history, fallacy radar chart |
| 🔥 **Daily Streaks** | Track consecutive debate days with milestone rewards (3, 7, 14, 30, 50, 100, 365 days) |
| 🧊 **Streak Freeze** | One free streak freeze per week if you miss a day |
| 🎊 **Streak Celebrations** | Animated milestone celebration at streak achievements |
| 🏅 **Achievements** | Unlock badges: first_debate, no_fallacy_streak_3, logic_master, evidence_king, 10_wins, comeback_king |
| 📋 **AI Report Card** | End-of-debate report tracking grammar mistakes and improvement targets |

### 👤 User & Account
| Feature | Description |
|---------|-------------|
| 👤 **User Profiles** | Avatar upload, bio, stats overview |
| ✉ **Email Verification** | Secure email verification on sign-up with token-based confirmation |
| 🔑 **Password Reset** | Self-service forgot-password / reset flow via email |
| 🔔 **Push Notifications** | Web Push API for debate reminders and streak alerts |
| 🔒 **Account Lockout** | Auto-lock after repeated failed login attempts |

### 🛡 Security & Infrastructure
| Feature | Description |
|---------|-------------|
| 🛡 **Security Logging** | Structured JSON security logs: auth events, rate limits, bot blocks, API errors |
| 🤖 **Bot Defense** | User-agent filtering + honeypot endpoints to block automated abuse |
| 🚦 **Rate Limiting** | Per-route + global rate limits on all REST and WebSocket endpoints |
| 🔒 **JWT Auth** | Stateless authentication with bcrypt password hashing |

### 🎨 UI / UX
| Feature | Description |
|---------|-------------|
| 🎊 **Victory Confetti** | CSS particle burst + victory fanfare when you win |
| 🔊 **Sound Effects** | Audio cues via Web Audio API — no external files |
| 🔔 **Toast Notifications** | Glassmorphic slide-in alerts for login, errors, and results |
| ⌨ **Keyboard Shortcuts** | `Esc` to end debate |
| 📱 **Fully Responsive** | Mobile-optimized on all pages (6 breakpoints) |
| ♿ **Accessible** | `prefers-reduced-motion` support, semantic HTML |
| 🚧 **Error Boundary** | React error boundary prevents full app crashes |

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
| **Vector Memory** | FAISS (local) or Pinecone (cloud) for argument history |
| **Email** | Nodemailer (SMTP) — verification & password reset |
| **Push** | Web Push API (VAPID) — browser push notifications |
| **Testing** | Jest, Supertest, MongoDB Memory Server |

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18
- MongoDB (local or Atlas URI)
- Python ≥ 3.9 (for the ML microservice)
- Redis (optional)
- SMTP credentials (for email verification & password reset)
- VAPID keys (for push notifications — generate with `npx web-push generate-vapid-keys`)

### 1. Clone

```bash
git clone https://github.com/Shameer767400/DebateForge.git
cd DebateForge/debateforge
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in MongoDB URI, JWT secret, SMTP, VAPID keys, etc.
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

### 4. ML Service (optional — required for voice + AI)

```bash
cd ml
cp .env.example .env   # set FRONTEND_URL, OPENAI_API_KEY / GEMINI_API_KEY
pip install -r requirements.txt
uvicorn main:app --port 8001
```

---

## ⚙ Environment Variables

### Backend `.env`

```env
MONGODB_URI=mongodb://localhost:27017/debateforge
JWT_SECRET=your_jwt_secret
PORT=5001
FRONTEND_URL=http://localhost:3000

# Email (verification + password reset)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=your_smtp_password
EMAIL_FROM=DebateForge <no-reply@debateforge.app>

# Push notifications (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:you@example.com
```

### ML `.env`

```env
FRONTEND_URL=http://localhost:3000
OPENAI_API_KEY=sk-...        # for GPT responses
GEMINI_API_KEY=...           # or Gemini
USE_LOCAL_MEMORY=true        # true = FAISS local, false = Pinecone
PINECONE_API_KEY=...         # only needed if USE_LOCAL_MEMORY=false
PINECONE_INDEX_NAME=debateforge-memory
```

---

## 📁 Project Structure

```
debateforge/
├── backend/
│   ├── config/          # database.js, redis.js
│   ├── controllers/     # auth, debate, profile, topic
│   ├── jobs/            # notifications.job.js (push reminders)
│   ├── middleware/       # JWT auth middleware
│   ├── models/          # Mongoose schemas (User, Debate, Topic)
│   ├── routes/          # auth, debates, profile, topics, push
│   ├── seeds/           # mark-existing-verified migration script
│   ├── services/
│   │   ├── email.service.js          # Nodemailer — verification & reset
│   │   ├── formatEngine.service.js   # Debate format rules (Oxford, LD, Parl.)
│   │   ├── llm.service.js            # GPT / Gemini integration
│   │   ├── push.service.js           # Web Push (VAPID) notifications
│   │   ├── security-logger.service.js # Structured auth/security logging
│   │   └── streak.service.js         # Daily streak + freeze logic
│   ├── websocket/       # Real-time debate engine
│   ├── tests/           # Jest + Supertest API tests
│   └── server.js
├── frontend/
│   ├── public/
│   │   ├── sw.js        # Service worker for push notifications
│   │   └── index.html
│   └── src/
│       ├── components/
│       │   ├── EmailVerificationBanner.jsx
│       │   ├── StreakBadge.jsx
│       │   ├── StreakCelebration.jsx
│       │   ├── ErrorBoundary.jsx
│       │   ├── Confetti.jsx
│       │   ├── PageLoader.jsx
│       │   ├── ProtectedRoute.jsx
│       │   └── ToastContainer.jsx
│       ├── context/     # AuthContext, ToastContext
│       ├── hooks/
│       │   ├── useDebateSocket.js
│       │   └── usePushNotifications.js
│       ├── pages/
│       │   ├── LandingPage.jsx
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx
│       │   ├── ForgotPasswordPage.jsx
│       │   ├── ResetPasswordPage.jsx
│       │   ├── VerifyEmailPage.jsx
│       │   ├── LobbyPage.jsx
│       │   ├── DebateRoomPage.jsx
│       │   ├── DashboardPage.jsx
│       │   ├── LeaderboardPage.jsx
│       │   ├── ProfilePage.jsx
│       │   ├── DebateHistoryPage.jsx
│       │   └── NotFoundPage.jsx
│       └── styles/      # Page-specific CSS + theme.css
└── ml/
    ├── routers/
    │   ├── fallacy.py       # Rule-based + semantic fallacy detection
    │   ├── memory.py        # FAISS / Pinecone argument memory
    │   ├── scorer.py        # Argument scoring (logic, evidence, clarity)
    │   └── transcription.py # Whisper endpoint
    ├── services/
    │   ├── whisper_service.py
    │   └── tts_service.py
    └── main.py
```

---

## 🧪 Running Tests

```bash
cd backend
npm test    # Jest + Supertest with MongoDB Memory Server
```

---

## 🏛 Debate Formats

DebateForge supports four structured formats with automatic phase transitions:

| Format | Phases | Description |
|--------|--------|-------------|
| **Freeform** | 1 | Open debate — no phase restrictions |
| **Oxford Union** | 5 | Opening → Rebuttals → Cross-Exam → Closing → Judging |
| **Lincoln-Douglas** | 8 | Classic values-based individual debate format |
| **British Parliamentary** | 7 | Government vs Opposition with formal speaking order |

Each phase has a configurable time limit and AI instructions tuned for that phase type.

---

## 🔒 Security

- JWT token authentication on all protected routes
- Password hashing with bcrypt (salt rounds = 10)
- Email verification required after registration
- Account lockout after repeated failed login attempts
- Token-based password reset (SHA-256 hashed, 1-hour expiry)
- Rate limiting: 15 req / 15 min on auth routes; 100 req / 15 min globally
- Bot defense: user-agent filtering + honeypot endpoints
- Structured security logs: auth events, rate limits, bot blocks, API errors
- All secrets loaded exclusively from environment variables

---

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Shameer767400/Shameer767400?utm_source=oss&utm_medium=github&utm_campaign=Shameer767400%2FShameer767400&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

## 📜 License

MIT

---

<p align="center">
  Built with ☕ and competitive spirit<br/>
  <strong>DebateForge</strong> — because arguments should be won with logic, not volume.
</p>
