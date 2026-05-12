# DebateForge: Final Project Documentation & Architecture Blueprint

## Project Overview
DebateForge is an advanced, AI-powered real-time debate platform designed to enhance communication, argumentation, and critical thinking skills. Users engage in live voice or text debates against a highly intelligent, multi-provider AI opponent. The platform features real-time logical fallacy detection, speech-to-text transcription, dynamic scoring based on formal debate parameters, and contextual semantic memory that tracks user weaknesses over time.

## Problem Statement
Many students and professionals lack access to structured debate practice and real-time, objective feedback to improve their critical thinking skills. Traditional debate training requires human mentors, structured environments, and coordinated schedules. Furthermore, existing online platforms do not provide intelligent, on-the-fly argument analysis, logical fallacy detection, or adaptive coaching, leaving learners without actionable pathways to improvement.

## Solution Architecture
DebateForge provides a scalable, 24/7 accessible platform combining real-time communication protocols (WebSockets) with advanced Natural Language Processing (NLP) microservices. It abstracts multiple Large Language Models (LLMs) to ensure reliable AI opponent generation and employs lightweight vector databases for contextual memory, allowing the AI to coach users based on their historical debate performance.

## System Design
The system utilizes a clean three-tier microservices architecture:
1. **Frontend**: React 18 + Vite SPA handling real-time UI/UX, audio capture, and state management.
2. **Backend**: Node.js + Express 5 API handling authentication, RESTful routes, WebSocket debate orchestration, and database interactions.
3. **ML Service**: Python FastAPI microservice dedicated to heavy NLP workloads, semantic vector storage, fallacy detection, and speech transcription.

## Frontend Architecture
Built with **React 18** and **Vite**, the frontend emphasizes component modularity and responsive design.
- **State Management**: React Context APIs (`AuthContext`, `ToastContext`) handle global state without heavy external libraries.
- **Routing**: `react-router-dom` v6 for protected and public route handling.
- **Styling**: Vanilla CSS utilizing a custom design system with CSS variables for maximum flexibility and performance.
- **Real-time Engine**: Custom `useDebateSocket` hook encapsulates `socket.io-client` logic, managing audio buffer streaming and event listening cleanly.

## Backend Architecture
The backend is a **Node.js/Express 5** server following strict separation of concerns:
- **Controllers**: Handle HTTP request/response formatting (`auth.controller.js`, `debate.controller.js`).
- **Services**: Abstract complex business logic (`llm.service.js`, `formatEngine.service.js`, `push.service.js`).
- **Providers**: Manage external API interactions.
- **Middleware**: JWT authentication, rate limiting, and bot defense.
- **Security & Monitoring**: Centralized security logging (`logger.js`) and configuration (`security.config.js`).

## ML/AI Architecture
The Python FastAPI service handles CPU-intensive NLP tasks securely separated from the Node backend:
- **`fallacy.py`**: A 3-layer detection engine (Rule-based → Semantic Similarity → SpaCy Syntactic Parsing).
- **`scorer.py`**: Evaluates Logic (SpaCy), Evidence (NLTK NER), Clarity, and Relevance (Scikit-learn TF-IDF).
- **`memory.py`**: Manages FAISS vector embeddings for historical context.
- **`transcription.py`**: Executes Whisper AI speech-to-text processing.

## Debate Engine
The Debate Engine (`formatEngine.service.js`) orchestrates formal debate structures:
- **Supported Formats**: Freeform, Oxford Union, Lincoln-Douglas, British Parliamentary.
- **Phase Management**: Automatically transitions between phases (e.g., Opening, Rebuttal, Cross-Examination) and injects phase-specific system prompts into the AI to simulate formal debate rules.

## WebSocket Architecture
Built on **Socket.IO**, the WebSocket engine manages the live debate lifecycle:
- Handles high-frequency events (`audio_chunk`, `ai_text_chunk`, `scores_update`).
- Maintains state in Redis (`session:${debateId}`) to allow seamless reconnects if the user refreshes the page.
- Implements strict event-level rate limiting and connection caps (max 5 per user).

## Authentication & Security
- **JWT**: Stateless, HTTP-only cookie-based JWT authentication.
- **Password Security**: Bcrypt hashing (10 salt rounds).
- **Bot Defense**: User-agent filtering, honeypot endpoints, and IP rate limiting.
- **Data Protection**: Helmet.js for security headers, strict CORS policies, and protection against IDOR (Insecure Direct Object Reference) on all sockets and routes.

## Multilingual Processing Pipeline
*(Core In-Scope Feature)*
DebateForge supports real-time multilingual debates, completely breaking down language barriers:
- The system auto-detects the user's spoken or typed language (e.g., Telugu, Hindi, Tamil).
- The `websocket/index.js` orchestrator correctly suppresses raw English LLM streams, routing the final AI response through a translation layer.
- The UI dynamically renders the debate in the user's preferred language, utilizing AI providers optimized for regional languages (e.g., Sarvam AI).

## STT → AI → TTS Flow
1. **Speech-to-Text (STT)**: User audio is chunked, streamed via WebSockets, and transcribed by `openai-whisper` in the ML service.
2. **AI Processing**: The text hits the `processTranscript` pipeline, triggering parallel execution of fallacy detection, scoring, and LLM response generation.
3. **Text-to-Speech (TTS)**: The AI's streamed text is buffered into sentence blocks and synthesized into audio using the Web Audio API, creating seamless conversational flow.

## AI Provider Architecture
The backend abstracts LLM interactions via a robust provider pattern:
- The `streamDebateResponse` function handles graceful degradation and failover.
- Providers include OpenAI (GPT-4), Groq (ultra-low latency Llama3), Sarvam AI (specialized for Indian languages), and Ollama (local, privacy-first fallback).

## Real-Time Communication Flow
The architecture relies on bi-directional WebSocket communication to prevent HTTP polling overhead. The frontend emits `audio_chunk` arrays, and the backend immediately streams back `ai_thinking`, `ai_text_chunk`, `fallacy_detected`, and `scores_update` events concurrently.

## Debate Analytics System
Users receive a comprehensive dashboard mapping their performance:
- Data is visualized using **Recharts**.
- Tracks total debates, win rate, average scores (Logic/Evidence/Clarity), and recent fallacy frequency.
- Generates a post-debate "Report Card" detailing specific grammatical mistakes and areas for targeted improvement.

## ELO & Ranking System
A competitive gamification layer utilizes a standard ELO algorithm:
- Users start at a baseline ELO (e.g., 1200).
- Beating the AI on "Hard" difficulty yields higher ELO gains than "Easy".
- A global leaderboard ranks the top debaters, driving continuous user engagement.

## Fallacy Detection
The custom fallacy engine is an industry-differentiating feature:
- Detects 11 unique logical fallacies (e.g., Strawman, Ad Hominem, Red Herring).
- Leverages SpaCy dependency parsing to catch complex linguistic patterns (e.g., universal quantifiers triggering "Hasty Generalization").

## Semantic Memory
Instead of relying solely on the LLM's finite context window, DebateForge uses **FAISS** (Facebook AI Similarity Search) and TF-IDF embeddings:
- The ML service saves every user argument.
- Before generating a response, the system retrieves semantically similar past arguments to identify recurring weaknesses (e.g., "You frequently rely on emotional appeals when discussing economic topics").

## Scalability Design
- **Microservices Layering**: The CPU-heavy ML Python service scales independently from the I/O-heavy Node.js WebSocket server.
- **Redis State Management**: WebSocket sessions are stored in Redis, allowing horizontal scaling of the Node.js server across multiple instances.
- **Lightweight Embeddings**: By utilizing Scikit-learn TF-IDF instead of massive PyTorch transformers, the ML service operates efficiently within 512MB RAM constraints (Render free-tier compatible).

## Deployment Architecture
- **Frontend**: Deployed on Vercel (Global Edge Network) for rapid asset delivery.
- **Backend (Node.js)**: Deployed on Render Web Services, handling REST and WebSockets.
- **ML Service (FastAPI)**: Deployed as a separate Render Web Service.
- **Database**: MongoDB Atlas cloud cluster.
- **Environment Management**: Strict separation of `.env` variables ensuring secrets are never leaked to the frontend build.

## Database Design
MongoDB schemas are heavily optimized for query performance:
- **User Schema**: Embeds ELO, streak tracking, and weakness arrays directly for fast profile rendering.
- **Debate Schema**: Stores the entire turn-by-turn history, scoring arrays, and metadata for post-game analysis and transcript exporting.

## API Documentation
The REST API is fully documented using Swagger/OpenAPI.
- Available at `/api-docs` in the backend.
- Provides interactive endpoints for Authentication, Profile Management, Debate Initialization, and System Health.

## Testing Strategy
- **Backend**: Jest and Supertest ensure robust API testing (59 tests across 8 suites), utilizing `mongodb-memory-server` to mock database interactions without touching production data.
- **Frontend E2E**: Cypress E2E test scaffolding is established to validate critical user flows (login, debate lobby, dashboard navigation).
- **Security**: Tests verify JWT rejection, bot guard effectiveness, and rate limiting behavior.

## Security Features
- Multi-layered defense including Helmet.js, strict CORS, and HTTP-only cookies.
- Comprehensive Bot Defense using User-Agent heuristics and honeypots.
- Redis-backed connection limiting (max 5 WebSocket connections per user) prevents DoS attacks.

## Monitoring & Reliability
- **Winston Logger**: Structured JSON logging in the `monitoring/` directory captures critical events, API errors, and security warnings for easy parsing by external observability tools (e.g., Datadog, ELK).
- **Health Endpoints**: The `/health` route exposes real-time status of the Node server, MongoDB connection state, and Redis availability.

## Performance Optimizations
- **Lazy Loading**: AI models and NLP pipelines (SpaCy) load lazily in the FastAPI service to reduce initial startup memory spikes.
- **Streaming LLMs**: Responses stream word-by-word via WebSockets to minimize perceived latency (TTFB).
- **Response Caching**: Reusable data (like Debate Topics) is cached to minimize database queries.

## Future Scope
- **Analytics Dashboard**: Foundation established via `timeSeries.service.js` connecting to Redis sorted-sets, providing data for real-time visualizations.
- **Peer-to-Peer & Video Debates**: Foundational architecture is implemented (`backend/services/webrtc.service.js`) to support live User vs. User video debates. Note: This WebRTC infrastructure is explicitly defined as Future Scope and is intentionally decoupled from the production WebSocket loop in V1 to maintain strict scope adherence.

## Innovation Highlights
DebateForge merges real-time low-latency networking with advanced asynchronous NLP. The ability to parallel process speech-to-text, fallacy detection, semantic scoring, and LLM generation within a single conversational turn represents a significant architectural achievement for an educational platform.

## Competitive Advantages
Unlike standard chat wrappers, DebateForge enforces formal debate constraints, provides granular objective scoring based on linguistic analysis rather than simple LLM vibes, and tracks long-term semantic progression of a user's reasoning skills.

## Limitations & Challenges
- **Voice Latency**: Total turn latency relies heavily on third-party STT/LLM provider response times; mitigated by utilizing Groq (LPU) for rapid generation.
- **Memory Constraints**: Advanced vector embeddings (PyTorch) exceed free-tier cloud constraints; successfully mitigated by substituting highly optimized TF-IDF models.

## Future Expansion Possibilities
The microservice architecture is designed to easily onboard new AI models (e.g., Claude 3, Gemini 1.5 Pro) simply by expanding the `llm.service.js` provider abstraction. The platform is structurally prepared to pivot toward Enterprise B2B offerings, integrating directly into university debate clubs and corporate communication training programs.
