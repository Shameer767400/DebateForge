# DebateForge ML Service Architecture

This microservice handles the heavy NLP and Machine Learning workloads for the DebateForge platform. 
It uses a FastAPI architecture with specialized routers to maintain modularity.

## NLP Routers Overview

These routers contain the core computational logic for the platform's AI features. **They are fully implemented and are not stubs.**

### 1. `fallacy.py` (Logical Fallacy Detection)
Implements a sophisticated 3-layer fallacy detection engine:
- **Layer 1:** Rule-based keyword matching for high-precision, fast detection.
- **Layer 2:** Semantic similarity using lightweight embeddings (comparing against known fallacy signatures).
- **Layer 3:** Advanced NLP using **SpaCy** (`en_core_web_sm`). Performs dependency parsing, part-of-speech (POS) tagging, and Named Entity Recognition (NER) to detect complex syntactic patterns (e.g., ad hominem attacks where the user is the subject of a negative predicate).

### 2. `scorer.py` (Argument Scoring)
Calculates real-time debate scores across three dimensions:
- **Logic:** Uses **SpaCy** dependency trees to evaluate argument coherence.
- **Evidence:** Uses **NLTK** and SpaCy NER to identify factual citations, statistics, and named entities.
- **Clarity:** Evaluates lexical diversity and grammatical structure.
- **Relevance:** Uses **Scikit-learn TF-IDF** (Term Frequency-Inverse Document Frequency) to compute the cosine similarity between the user's argument and the current debate topic.

### 3. `memory.py` (Vector Memory Storage)
Provides contextual memory to track user weaknesses over time:
- Uses **FAISS** (Facebook AI Similarity Search) for fast, local vector retrieval.
- Can be configured to use **Pinecone** for cloud-based scalable vector storage.
- Stores historical arguments as TF-IDF embeddings to stay within the 512MB RAM constraints of free-tier cloud deployments (avoiding heavy PyTorch transformers).

### 4. `transcription.py` (Speech-to-Text)
Handles real-time audio transcription:
- Uses **OpenAI Whisper** (`openai-whisper` package) as the core transcription engine.
- Supports fallback transcription using Google Gemini via the `google-generativeai` package.
- Processes raw PCM/webm audio chunks streamed via WebSockets from the frontend.
