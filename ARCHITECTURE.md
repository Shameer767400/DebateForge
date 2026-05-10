# DebateForge Architecture

## System Overview

DebateForge is a microservices-based AI debate platform with three primary services communicating via REST and WebSocket protocols.

```mermaid
graph TB
    subgraph "Frontend (Vercel)"
        FE[React SPA<br/>React 18 + Router v6]
    end

    subgraph "Backend (Render)"
        API[Express API Server]
        WS[WebSocket Engine<br/>Socket.IO]
        ORC[AI Orchestrator]
        
        subgraph "Providers"
            SAR[Sarvam AI<br/>Indian Languages]
            GRQ[Groq<br/>Llama 3.3 70B]
            OAI[OpenAI<br/>GPT-4o-mini]
            OLL[Ollama<br/>Local LLM]
        end
        
        subgraph "Services"
            DE[Debate Engine]
            SC[Scoring Service]
            FD[Fallacy Detection]
            TR[Translation]
            RK[Ranking/ELO]
            SS[Session Manager]
            AN[Analytics]
        end
    end

    subgraph "ML Service (Render)"
        FA[FastAPI Server]
        
        subgraph "NLP Stack"
            SP[SpaCy<br/>en_core_web_sm]
            NL[NLTK VADER<br/>Sentiment]
            TF[TF-IDF<br/>Embeddings]
        end
        
        subgraph "ML Routers"
            FLD[/fallacy/detect]
            SCS[/scorer/score]
            MEM[/memory/*]
            STT[/transcription/*]
        end
    end

    subgraph "Data Layer"
        MG[(MongoDB Atlas)]
        RD[(Redis/Upstash)]
        VS[(FAISS Vectors)]
    end

    FE <-->|REST + WebSocket| API
    FE <-->|Socket.IO| WS
    API --> ORC
    ORC --> SAR & GRQ & OAI & OLL
    WS --> DE & SC & FD
    SC --> FA
    FD --> FA
    API --> MG
    SS --> RD
    MEM --> VS
```

## AI Provider Architecture

The provider layer implements the **Strategy Pattern** for clean provider abstraction:

```mermaid
classDiagram
    class BaseProvider {
        <<abstract>>
        +getName() string
        +isAvailable() boolean
        +supportsLanguage(langCode) boolean
        +generate(session, argument) string
        +stream(session, argument) AsyncGenerator
        #_loadKeys(prefix, max) string[]
        #_getNextAvailableKeyIndex(keys) number
        #_markKeyLimited(index) void
    }

    class OpenAIProvider {
        -keys: string[]
        -model: "gpt-4o-mini"
        +generate() string
    }

    class GroqProvider {
        -keys: string[]
        -model: "llama-3.3-70b-versatile"
        +generate() string
    }

    class SarvamProvider {
        -keys: string[]
        -model: "sarvam-m"
        +supportsLanguage() boolean
        +generate() string
    }

    class OllamaProvider {
        -baseUrl: string
        -model: "llama3"
        +stream() AsyncGenerator
    }

    class AIOrchestrator {
        +streamResponse(session, argument) AsyncGenerator
        +getProviderChain(langCode) string[]
        +getAIStatus() Object
    }

    BaseProvider <|-- OpenAIProvider
    BaseProvider <|-- GroqProvider
    BaseProvider <|-- SarvamProvider
    BaseProvider <|-- OllamaProvider
    AIOrchestrator --> BaseProvider : uses
```

## Failover Chain

```mermaid
flowchart LR
    START([User Argument]) --> LANG{Language?}
    LANG -->|Indian| SAR[Sarvam AI]
    LANG -->|Other| GRQ1[Groq]
    SAR -->|fail| GRQ2[Groq]
    GRQ1 -->|fail| OAI1[OpenAI]
    GRQ2 -->|fail| OAI2[OpenAI]
    OAI1 -->|fail| OLL1[Ollama]
    OAI2 -->|fail| OLL2[Ollama]
    SAR -->|success| DONE([AI Response])
    GRQ1 -->|success| DONE
    GRQ2 -->|success| DONE
    OAI1 -->|success| DONE
    OAI2 -->|success| DONE
    OLL1 -->|success| DONE
    OLL2 -->|success| DONE
```

## WebSocket Debate Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant WS as WebSocket Engine
    participant AI as AI Orchestrator
    participant ML as ML Service
    participant DB as MongoDB

    U->>WS: join_debate(debateId)
    WS->>DB: Load debate + user profile
    WS-->>U: debate_joined

    loop Each Turn
        U->>WS: audio_end / transcript_direct
        WS->>ML: POST /fallacy/detect
        ML-->>WS: Fallacy result
        WS-->>U: fallacy_detected (if any)

        WS->>ML: POST /scorer/score
        ML-->>WS: Scores
        WS-->>U: scores_update

        WS->>AI: streamResponse(session, argument)
        AI-->>WS: AI text chunks
        WS-->>U: ai_text_chunk (streaming)
        WS-->>U: ai_turn_complete

        WS->>DB: Save argument + scores
    end

    U->>WS: end_debate
    WS->>AI: Generate judge verdict
    WS->>DB: Finalize (ELO, streak, achievements)
    WS-->>U: judge_verdict
```

## ML Detection Pipeline

```mermaid
flowchart TB
    INPUT([Argument Text]) --> L1[Layer 1: Rule-Based<br/>Keyword Matching]
    L1 -->|confidence ≥ 62%| RESULT([Detection Result])
    L1 -->|low confidence| L2[Layer 2: Semantic<br/>TF-IDF Similarity]
    L2 -->|confidence ≥ 52%| RESULT
    L2 -->|low confidence| L3[Layer 3: SpaCy NLP<br/>Dep Parsing + NER + POS]
    L3 --> RESULT
```

## Deployment Architecture

```mermaid
graph LR
    subgraph "Vercel"
        FE[React Frontend<br/>Static SPA]
    end

    subgraph "Render"
        BE[Backend<br/>Node.js Web Service]
        ML[ML Service<br/>Python Web Service]
    end

    subgraph "Managed Services"
        MG[(MongoDB Atlas<br/>M0 Free Tier)]
        RD[(Redis/Upstash<br/>Free Tier)]
    end

    FE -->|HTTPS| BE
    BE -->|HTTP| ML
    BE --> MG
    BE --> RD
```

## Directory Structure

```
debateforge/
├── backend/
│   ├── config/          # Database, Redis, Swagger, constants
│   ├── controllers/     # Route handlers (auth, debate, profile, topics)
│   ├── middleware/       # Auth, rate limiting, bot defense
│   ├── models/          # Mongoose schemas (User, Debate, Topic)
│   ├── providers/       # AI provider abstraction (Strategy Pattern)
│   │   ├── base.provider.js
│   │   ├── openai.provider.js
│   │   ├── groq.provider.js
│   │   ├── sarvam.provider.js
│   │   └── ollama.provider.js
│   ├── routes/          # Express route definitions with Swagger docs
│   ├── services/        # Business logic layer
│   │   ├── aiOrchestrator.service.js
│   │   ├── debateEngine.service.js
│   │   ├── scoring.service.js
│   │   ├── fallacyDetection.service.js
│   │   ├── translation.service.js
│   │   ├── ranking.service.js
│   │   ├── session.service.js
│   │   └── analytics.service.js
│   ├── tests/           # Jest test suites
│   ├── websocket/       # Socket.IO real-time debate engine
│   └── server.js        # Express app entry point
├── frontend/
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── context/     # React context providers
│   │   ├── hooks/       # Custom hooks (useDebateSocket, useApi)
│   │   ├── pages/       # Route-level page components
│   │   └── styles/      # CSS design system
│   └── public/
├── ml/
│   ├── routers/         # FastAPI endpoints (fallacy, scorer, memory, transcription)
│   ├── services/        # ML service logic (whisper, TTS)
│   ├── models/          # Model store and embeddings
│   ├── pipelines/       # NLP pipelines (language detection, translation)
│   ├── utils/           # Shared utilities (text processing, embeddings)
│   └── tests/           # pytest test suite
├── .github/
│   ├── workflows/ci.yml # GitHub Actions CI pipeline
│   └── dependabot.yml   # Automated dependency updates
├── ARCHITECTURE.md      # This file
├── API_DOCS.md          # REST + WebSocket API documentation
├── ROADMAP.md           # Feature roadmap
└── README.md            # Project overview
```
