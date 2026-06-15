"""
DebateForge ML Service — AI-powered debate analysis microservice.

Provides four core capabilities via REST API:
  1. /fallacy  — Multi-layer fallacy detection (rule-based + semantic + SpaCy NLP)
  2. /scorer   — Argument quality scoring (logic, evidence, clarity) with NLTK sentiment
  3. /memory   — FAISS / Pinecone vector memory for user weakness tracking & coaching
  4. /transcription — Speech-to-text via Whisper (local) or Gemini API

NLP Technology Stack:
  - SpaCy (en_core_web_sm): tokenization, POS tagging, NER, dependency parsing
  - NLTK (VADER): sentiment analysis for argument tone assessment
  - scikit-learn: TF-IDF embeddings for lightweight semantic similarity
  - FAISS: local vector store for per-user argument memory
  - NumPy: numerical operations for similarity computation

Architecture:
  - FastAPI async framework with Pydantic validation
  - Modular router-per-feature design for easy model swapping
  - Lazy model loading to minimize cold-start memory usage
  - Production-tested under Render free tier 512MB RAM constraint
"""

import os
from dotenv import load_dotenv
load_dotenv()
from pathlib import Path

from fastapi import FastAPI, Depends, Header, HTTPException, status
from typing import Optional

from models.store import model_store

from routers.fallacy import router as fallacy_router
from routers.scorer import router as scorer_router
from routers.memory import router as memory_router
from routers.transcription import router as transcription_router

app = FastAPI(
    title="DebateForge ML Service",
    version="1.0.0",
    description=(
        "AI-powered debate analysis microservice providing fallacy detection, "
        "argument scoring, vector memory for weakness tracking, and speech transcription. "
        "Uses SpaCy for NLP, NLTK VADER for sentiment analysis, and TF-IDF for embeddings."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_URL", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_ml_api_key(x_ml_api_key: Optional[str] = Header(None)):
    expected_key = os.getenv("ML_API_KEY")
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ML_API_KEY environment variable is not configured."
        )
    if x_ml_api_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-ML-API-Key header."
        )


@app.on_event("startup")
async def startup_event() -> None:
    """
    Lightweight startup — loads SpaCy model and NLTK data.
    sentence-transformers/torch removed to stay under 512MB RAM (Render free tier).
    Uses scikit-learn TF-IDF for embeddings instead.
    """
    # Try to load optional XGBoost scoring models if present
    base_dir = Path(__file__).parent
    logic_path = base_dir / "models" / "logic_model.json"
    evidence_path = base_dir / "models" / "evidence_model.json"
    clarity_path = base_dir / "models" / "clarity_model.json"

    if logic_path.exists():
        model_store.logic_model = str(logic_path)
    if evidence_path.exists():
        model_store.evidence_model = str(evidence_path)
    if clarity_path.exists():
        model_store.clarity_model = str(clarity_path)

    # Pre-load SpaCy model for fallacy detection & scoring
    try:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
        print("✅ SpaCy en_core_web_sm loaded")
    except Exception as e:
        print(f"⚠️  SpaCy not available: {e} (fallacy detection will use rule-based only)")

    # Pre-download NLTK VADER lexicon for sentiment analysis
    try:
        import nltk
        nltk.download('vader_lexicon', quiet=True)
        print("✅ NLTK VADER lexicon ready")
    except Exception as e:
        print(f"⚠️  NLTK not available: {e} (sentiment scoring disabled)")

    print("✅ ML Service ready (lightweight mode — TF-IDF embeddings, SpaCy NLP, NLTK sentiment)")


app.include_router(fallacy_router, prefix="/fallacy", dependencies=[Depends(verify_ml_api_key)])
app.include_router(scorer_router, prefix="/scorer", dependencies=[Depends(verify_ml_api_key)])
app.include_router(memory_router, prefix="/memory", dependencies=[Depends(verify_ml_api_key)])
app.include_router(transcription_router, prefix="/transcription", dependencies=[Depends(verify_ml_api_key)])


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mode": "lightweight",
        "embeddings": "tfidf",
        "nlp": "spacy_en_core_web_sm",
        "sentiment": "nltk_vader",
    }

@app.get("/")
async def root():
    return {
        "service": "DebateForge ML",
        "version": "1.0.0",
        "nlp_stack": ["spacy", "nltk", "scikit-learn", "faiss"],
        "endpoints": [
          "/health",
          "/fallacy/detect",
          "/scorer/score",
          "/memory/store",
          "/memory/weaknesses/{user_id}",
          "/memory/coaching-plan/{user_id}",
          "/memory/clear/{user_id}",
          "/transcription/transcribe",
        ],
    }
