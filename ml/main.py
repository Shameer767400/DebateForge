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

try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # pragma: no cover - optional at runtime
    SentenceTransformer = None

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
    # Load sentence transformer
    if SentenceTransformer is not None and model_store.sentence_model is None:
        model_store.sentence_model = SentenceTransformer("all-MiniLM-L6-v2")
        print("✅ Sentence transformer loaded")

    # Try to load XGBoost or other models if files exist
    base_dir = Path(__file__).parent
    logic_path = base_dir / "models" / "logic_model.json"
    evidence_path = base_dir / "models" / "evidence_model.json"
    clarity_path = base_dir / "models" / "clarity_model.json"

    if logic_path.exists():
        # Placeholder for real XGBoost loading
        model_store.logic_model = str(logic_path)

    if evidence_path.exists():
        model_store.evidence_model = str(evidence_path)

    if clarity_path.exists():
        model_store.clarity_model = str(clarity_path)

    print("✅ All models ready")


app.include_router(fallacy_router, prefix="/fallacy")
app.include_router(scorer_router, prefix="/scorer")
app.include_router(memory_router, prefix="/memory")
app.include_router(transcription_router, prefix="/transcription")


@app.get("/health")
async def health():
    models_loaded = model_store.sentence_model is not None
    return {"status": "ok", "models_loaded": models_loaded}

@app.get("/")
async def root():
    return {
        "service": "DebateForge ML",
        "endpoints": [
          "/health",
          "/fallacy",
          "/scorer",
          "/memory",
        ],
    }
