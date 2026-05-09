import os
from dotenv import load_dotenv
load_dotenv()
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.store import model_store

from routers.fallacy import router as fallacy_router
from routers.scorer import router as scorer_router
from routers.memory import router as memory_router
from routers.transcription import router as transcription_router

app = FastAPI(title="DebateForge ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_URL", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    """
    Lightweight startup — no heavy model loading.
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

    print("✅ ML Service ready (lightweight mode — TF-IDF embeddings)")


app.include_router(fallacy_router, prefix="/fallacy")
app.include_router(scorer_router, prefix="/scorer")
app.include_router(memory_router, prefix="/memory")
app.include_router(transcription_router, prefix="/transcription")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mode": "lightweight",
        "embeddings": "tfidf",
    }

@app.get("/")
async def root():
    return {
        "service": "DebateForge ML",
        "endpoints": [
          "/health",
          "/fallacy",
          "/scorer",
          "/memory",
          "/transcription",
        ],
    }
