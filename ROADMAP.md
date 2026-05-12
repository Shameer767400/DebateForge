# DebateForge Roadmap

## Current Release (v1.0) — Live ✅

- [x] Real-time voice & text debates with AI opponent
- [x] Multi-provider LLM chain (Sarvam AI → Groq → OpenAI → Ollama)
- [x] 11-type fallacy detection (rule-based + SpaCy NLP + semantic)
- [x] NLTK VADER sentiment analysis in argument scoring
- [x] Formal debate formats (Oxford, Lincoln-Douglas, Parliamentary)
- [x] Multilingual support (30+ languages with script validation)
- [x] ELO ranking with global leaderboard
- [x] Daily streaks with freeze system & milestone celebrations
- [x] Adaptive coaching with spaced-repetition (FAISS memory)
- [x] AI judge scoring with downloadable Report Cards
- [x] Email OTP verification & password reset
- [x] Web Push notifications for debate reminders
- [x] Comprehensive test suite (Jest + Supertest + MongoDB Memory Server)
- [x] OpenAPI/Swagger documentation
- [x] GitHub Actions CI/CD pipeline
- [x] Render + Vercel production deployment

---

## v1.1 — Enhanced Analytics (Planned)

- [ ] **Debate analytics dashboard** — win rate trends, score heatmaps, improvement velocity
- [ ] **Argument pattern recognition** — SpaCy-powered analysis of recurring argument structures
- [ ] **Community topic trending** — real-time topic popularity tracking
- [ ] **Export debate transcripts** — PDF/HTML download with annotations
- [ ] **Debate replay mode** — step through past debates with commentary

## v1.2 — Social & Multiplayer (Planned)

- [ ] **Peer-to-peer debates** — match against real human opponents via WebSocket rooms
- [ ] **Spectator mode** — watch live debates with real-time voting
- [ ] **Team debates** — 2v2 parliamentary format with assigned roles
- [ ] **Debate clubs** — create/join debate communities with shared leaderboards
- [ ] **Social sharing** — share debate results and Report Cards

## v1.3 — Advanced AI (Planned)

- [ ] **Video debates** — WebRTC-based face-to-face debates with emotion detection
- [ ] **Voice cloning** — AI opponent with customizable voice personas
- [ ] **Argument graph visualization** — interactive claim-evidence-rebuttal mapping
- [ ] **Multi-turn fact-checking** — real-time claim verification with source citations
- [ ] **Custom AI training** — fine-tune debate opponent on specific domains

## v2.0 — Mobile & Enterprise (Future)

- [ ] **React Native mobile app** — iOS/Android with offline debate practice
- [ ] **Enterprise API** — white-label debate training for organizations
- [ ] **LMS integration** — Moodle/Canvas plugin for classroom debate assignments
- [ ] **Tournament system** — bracket-based debate tournaments with elimination rounds
- [ ] **Certification program** — debate skill certifications with verifiable badges

---

## Architecture Readiness

| Future Feature | Current Scaffolding |
|----------------|-------------------|
| P2P Debates | WebSocket room infrastructure already supports multi-user via `socket.join(debateId)` |
| Mobile App | REST API + WebSocket protocol are platform-agnostic; JWT auth works from any client |
| Video Debates | `webrtc.service.js` scaffold provides signaling logic, intentionally decoupled from V1 production loop |
| Analytics | `timeSeries.service.js` provides Redis sorted-set foundations for real-time `Recharts` visualizations |
| Custom AI | `llm.service.js` provider chain is pluggable — add new provider in ~50 LOC |
| Tournament | ELO system + Debate model support multi-user extension via `participants[]` field |
