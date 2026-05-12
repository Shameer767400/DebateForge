Name: DebateForge

githubUrl: https://github.com/Shameer767400/DebateForge

description: An AI-powered real-time debate platform that enables users to engage in voice or text debates against a highly intelligent opponent, featuring real-time logical fallacy detection, speech-to-text transcription, dynamic scoring, and semantic memory tracking.

Functional Requirements
Authentication
• Register, login, logout with stateless JWT support
• Account management and secure session handling
• Role-based access control (admin, editor, viewer)
Debate Engine
• Live voice or text debates against multi-provider AI opponents
• Support for multiple formal debate formats (Freeform, Oxford, etc.)
• Browser-based text-to-speech (TTS) streaming via Web Speech API
Analytics & Scoring
• Real-time logical fallacy detection and categorization (11 fallacies)
• Granular objective scoring based on Logic, Evidence, and Clarity
• ELO-based ranking and competitive global leaderboard
• Post-debate report cards highlighting grammatical and structural weaknesses
User Profiles
• Dashboard tracking win rate, average scores, and recent fallacy frequency
• Semantic memory retrieving past arguments to track and coach specific weaknesses

Non-Functional Requirements
• Scalable architecture with Python NLP cleanly separated from Node WebSocket server
• Real-time bi-directional WebSocket communication via Socket.IO
• 512MB RAM constraint optimization via Scikit-learn TF-IDF instead of heavy vector embeddings
• JWT HTTP-only cookies, bcrypt password hashing, and strict CORS policies
• Event-level rate limiting and connection caps (max 5 per user) for DoS defense
• Robust test coverage (59 backend tests passing) with Cypress E2E scaffolding
• Sub-second latency mitigation using streaming LLM chunking

problem_statement: Many students and professionals lack access to structured debate practice and real-time, objective feedback to improve critical thinking skills. Traditional training requires human mentors, and existing platforms lack intelligent on-the-fly argument analysis, fallacy detection, or adaptive coaching.

proposed_solution: A scalable, 24/7 platform combining a React 18 frontend with a Node.js WebSocket backend and a Python FastAPI microservice to deliver real-time AI debate opponents, logical fallacy detection, and contextual semantic memory coaching.

technologies_used: React 18, Vite, Node.js, Express 5, Socket.IO, Python, FastAPI, MongoDB Atlas, Redis, SpaCy, NLTK, Scikit-learn, FAISS, Whisper AI, Cypress, Jest, Supertest, Vercel, Render

system_architecture: Three-tier microservices architecture. A React 18 SPA frontend communicates via WebSockets to a Node.js backend. The Node backend orchestrates real-time state using Redis and delegates heavy NLP tasks (fallacy detection, TF-IDF scoring, Whisper STT) to a Python FastAPI service. Authentication is JWT-based.

in_scope: Real-time voice and text debates against AI, logical fallacy detection, dynamic debate scoring, multilingual debate support via translation pipelines, ELO-based ranking system, semantic memory tracking of user weaknesses, debate analytics dashboard, and multiple formal debate formats.

out_scope: Real-time multiplayer User vs. User debates (Multiplayer Rooms), WebRTC peer-to-peer video streaming, mobile application, enterprise SSO, and tournament brackets.

future_enhancements:
Day 1-2: P2P Multiplayer Debates (WebSocket room infrastructure already supports multi-user via socket.join)
Day 4: Deep Analytics Dashboard (timeSeries.service.js provides Redis sorted-set foundations for real-time Recharts visualizations)

conclusion: DebateForge is a well-architected educational tool demonstrating significant engineering discipline in managing real-time WebSocket state alongside asynchronous NLP processing. Its core challenge is scaling the ML service inference under heavy concurrent loads, successfully mitigated by the modular multi-provider LLM abstraction and lightweight TF-IDF algorithms.

projectType: SaaS-web-app
