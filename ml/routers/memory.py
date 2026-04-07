import json
import os
import time
from collections import Counter
from typing import Any, Dict, List

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from models.store import model_store

# ── Toggle: FAISS local vs Pinecone ──
USE_LOCAL_MEMORY = os.getenv("USE_LOCAL_MEMORY", "true").lower() == "true"

try:
    from pinecone import Pinecone
except ImportError:  # pragma: no cover - optional
    Pinecone = None

try:
    import faiss
except ImportError:  # pragma: no cover - optional
    faiss = None


router = APIRouter(tags=["memory"])


class StoreRequest(BaseModel):
    user_id: str
    argument_text: str
    scores: Dict[str, Any]
    fallacy_type: str = "no_fallacy"
    topic: str
    debate_id: str


class WeaknessResponse(BaseModel):
    top_fallacy: str
    weak_topics: List[str]
    weakness_summary: str
    avg_weak_score: float


# ═══════════════════════════════════════
#    FAISS LOCAL STORAGE
# ═══════════════════════════════════════

FAISS_DIR = os.path.join(os.path.dirname(__file__), "..", "faiss_data")
os.makedirs(FAISS_DIR, exist_ok=True)

DIMENSION = 384  # all-MiniLM-L6-v2 output dimension


def get_user_index(user_id: str):
    """Load or create FAISS index for a user."""
    index_path = os.path.join(FAISS_DIR, f"{user_id}.index")
    meta_path = os.path.join(FAISS_DIR, f"{user_id}.json")

    if os.path.exists(index_path) and faiss is not None:
        index = faiss.read_index(index_path)
        with open(meta_path, "r") as f:
            metadata = json.load(f)
    else:
        if faiss is not None:
            index = faiss.IndexFlatIP(DIMENSION)
        else:
            index = None
        metadata = []

    return index, metadata


def save_user_index(user_id: str, index, metadata: list):
    """Save FAISS index and metadata to disk."""
    if faiss is None or index is None:
        return
    index_path = os.path.join(FAISS_DIR, f"{user_id}.index")
    meta_path = os.path.join(FAISS_DIR, f"{user_id}.json")
    faiss.write_index(index, index_path)
    with open(meta_path, "w") as f:
        json.dump(metadata, f)


# ═══════════════════════════════════════
#    PINECONE (existing)
# ═══════════════════════════════════════

_pinecone_client = None
_pinecone_index = None


def _get_index():
    global _pinecone_client, _pinecone_index

    if _pinecone_index is not None:
        return _pinecone_index

    if Pinecone is None:
        return None

    api_key = os.getenv("PINECONE_API_KEY")
    index_name = os.getenv("PINECONE_INDEX_NAME", "debateforge-memory")

    if not api_key:
        return None

    _pinecone_client = Pinecone(api_key=api_key)
    _pinecone_index = _pinecone_client.Index(index_name)
    return _pinecone_index


# ═══════════════════════════════════════
#    STORE ENDPOINT
# ═══════════════════════════════════════

@router.post("/store")
async def store_argument(payload: StoreRequest):
    if not model_store.sentence_model:
        return {"stored": False}

    if USE_LOCAL_MEMORY:
        return await _store_faiss(payload)
    else:
        return await _store_pinecone(payload)


async def _store_faiss(payload: StoreRequest):
    """Store argument in local FAISS index."""
    if faiss is None:
        return {"stored": False, "error": "faiss-cpu not installed"}

    try:
        embedding = model_store.sentence_model.encode(
            [payload.argument_text], convert_to_numpy=True
        )[0].astype("float32").reshape(1, -1)

        # Normalize for cosine similarity
        faiss.normalize_L2(embedding)

        index, metadata = get_user_index(payload.user_id)
        if index is None:
            return {"stored": False, "error": "FAISS index could not be created"}

        index.add(embedding)
        scores = payload.scores or {}
        metadata.append(
            {
                "text": payload.argument_text[:300],
                "logic_score": int(scores.get("logic", 0) or 0),
                "evidence_score": int(scores.get("evidence", 0) or 0),
                "clarity_score": int(scores.get("clarity", 0) or 0),
                "overall_score": int(scores.get("overall", 0) or 0),
                "fallacy_type": payload.fallacy_type,
                "topic": payload.topic,
                "debate_id": payload.debate_id,
                "timestamp": str(time.time()),
            }
        )

        save_user_index(payload.user_id, index, metadata)
        return {"stored": True}

    except Exception as exc:
        print(f"[memory] Failed to store in FAISS: {exc}")
        return {"stored": False, "error": str(exc)}


async def _store_pinecone(payload: StoreRequest):
    """Store argument in Pinecone (original implementation)."""
    index = _get_index()

    if not index:
        return {"stored": False}

    try:
        embedding = model_store.sentence_model.encode(
            [payload.argument_text], convert_to_numpy=True
        )[0]
        timestamp = int(time.time())
        user_id = payload.user_id
        debate_id = payload.debate_id
        scores = payload.scores or {}

        metadata = {
            "user_id": user_id,
            "text": payload.argument_text[:500],
            "logic_score": int(scores.get("logic", 0) or 0),
            "evidence_score": int(scores.get("evidence", 0) or 0),
            "clarity_score": int(scores.get("clarity", 0) or 0),
            "overall_score": int(scores.get("overall", 0) or 0),
            "fallacy_type": payload.fallacy_type,
            "topic": payload.topic,
            "debate_id": debate_id,
            "timestamp": timestamp,
        }

        index.upsert(
            vectors=[
                {
                    "id": f"{user_id}_{debate_id}_{timestamp}",
                    "values": embedding.tolist(),
                    "metadata": metadata,
                }
            ]
        )

        return {"stored": True}
    except Exception as exc:
        print(f"[memory] Failed to store in Pinecone: {exc}")
        return {"stored": False}


# ═══════════════════════════════════════
#    WEAKNESSES ENDPOINT
# ═══════════════════════════════════════

@router.get("/weaknesses/{user_id}", response_model=WeaknessResponse)
async def get_weaknesses(user_id: str) -> WeaknessResponse:
    if USE_LOCAL_MEMORY:
        return await _weaknesses_faiss(user_id)
    else:
        return await _weaknesses_pinecone(user_id)


async def _weaknesses_faiss(user_id: str) -> WeaknessResponse:
    """Get weakness analysis from FAISS local data."""
    try:
        _, metadata = get_user_index(user_id)

        if not metadata:
            return WeaknessResponse(
                top_fallacy="none",
                weak_topics=[],
                weakness_summary="",
                avg_weak_score=50.0,
            )

        weak_args = [m for m in metadata if int(m.get("logic_score", 100) or 100) < 50]

        if not weak_args:
            return WeaknessResponse(
                top_fallacy="none",
                weak_topics=[],
                weakness_summary="No significant weaknesses detected yet.",
                avg_weak_score=70.0,
            )

        # Count fallacies
        fallacy_counts = {}
        for arg in weak_args:
            ft = arg.get("fallacy_type", "no_fallacy")
            if ft != "no_fallacy":
                fallacy_counts[ft] = fallacy_counts.get(ft, 0) + 1

        top_fallacy = (
            max(fallacy_counts, key=fallacy_counts.get) if fallacy_counts else "none"
        )

        # Find weak topics
        topic_scores = {}
        for arg in metadata:
            topic = arg.get("topic", "general")
            score = int(arg.get("logic_score", 50) or 50)
            if topic not in topic_scores:
                topic_scores[topic] = []
            topic_scores[topic].append(score)

        weak_topics = [
            t
            for t, scores in topic_scores.items()
            if sum(scores) / len(scores) < 55
        ][:2]

        avg_weak_score = round(
            sum(int(a.get("logic_score", 0) or 0) for a in weak_args) / len(weak_args)
        )

        summary = ""
        if top_fallacy != "none":
            count = fallacy_counts[top_fallacy]
            summary = f"User frequently uses {top_fallacy} ({count} times). "
        if weak_topics:
            summary += f"Weakest topics: {', '.join(weak_topics)}. "
        summary += "Target these areas specifically to exploit weaknesses."

        return WeaknessResponse(
            top_fallacy=top_fallacy,
            weak_topics=weak_topics,
            weakness_summary=summary,
            avg_weak_score=float(avg_weak_score),
        )

    except Exception as exc:
        print(f"[memory] FAISS weakness query error: {exc}")
        return WeaknessResponse(
            top_fallacy="none",
            weak_topics=[],
            weakness_summary="",
            avg_weak_score=50.0,
        )


async def _weaknesses_pinecone(user_id: str) -> WeaknessResponse:
    """Get weakness analysis from Pinecone (original implementation)."""
    index = _get_index()

    if not index:
        return WeaknessResponse(
            top_fallacy="none",
            weak_topics=[],
            weakness_summary="",
            avg_weak_score=50.0,
        )

    try:
        neutral_vec = [0.0] * 384

        results = index.query(
            vector=neutral_vec,
            filter={"user_id": {"$eq": user_id}},
            top_k=20,
            include_metadata=True,
        )

        matches = results.get("matches") or []
        if not matches:
            return WeaknessResponse(
                top_fallacy="none",
                weak_topics=[],
                weakness_summary="",
                avg_weak_score=50.0,
            )
        weak_args = []
        fallacies = []
        topics = []
        scores = []

        for m in matches:
            meta = m.get("metadata") or {}
            logic_score = int(meta.get("logic_score", 0) or 0)
            topic = meta.get("topic")
            fallacy = meta.get("fallacy_type", "no_fallacy")

            if logic_score < 50:
                weak_args.append(meta)
                scores.append(logic_score)
                if topic:
                    topics.append(topic)
                if fallacy and fallacy != "no_fallacy":
                    fallacies.append(fallacy)

        if not weak_args:
            return WeaknessResponse(
                top_fallacy="none",
                weak_topics=[],
                weakness_summary="",
                avg_weak_score=50.0,
            )

        fallacy_counter = Counter(fallacies)
        topic_counter = Counter(topics)

        top_fallacy = fallacy_counter.most_common(1)[0][0] if fallacies else "none"
        weak_topics = [t for t, _ in topic_counter.most_common(3)]
        avg_score = sum(scores) / len(scores) if scores else 50.0

        weak_topic_str = weak_topics[0] if weak_topics else "various topics"
        summary = (
            f"This user frequently uses {top_fallacy} arguments (seen {fallacy_counter[top_fallacy]} times) "
            f"and scores lowest on {weak_topic_str} debates (avg {avg_score:.1f}/100). "
            "Target these areas specifically."
        )

        return WeaknessResponse(
            top_fallacy=top_fallacy,
            weak_topics=weak_topics,
            weakness_summary=summary,
            avg_weak_score=round(avg_score, 2),
        )

    except Exception as exc:
        print(f"[memory] Failed to query Pinecone: {exc}")
        return WeaknessResponse(
            top_fallacy="none",
            weak_topics=[],
            weakness_summary="",
            avg_weak_score=50.0,
        )


# ═══════════════════════════════════════
#    CLEAR ENDPOINT
# ═══════════════════════════════════════

@router.delete("/clear/{user_id}")
async def clear_memory(user_id: str):
    if USE_LOCAL_MEMORY:
        return await _clear_faiss(user_id)
    else:
        return await _clear_pinecone(user_id)


async def _clear_faiss(user_id: str):
    """Clear FAISS data for a user."""
    try:
        index_path = os.path.join(FAISS_DIR, f"{user_id}.index")
        meta_path = os.path.join(FAISS_DIR, f"{user_id}.json")
        if os.path.exists(index_path):
            os.remove(index_path)
        if os.path.exists(meta_path):
            os.remove(meta_path)
        return {"deleted": True}
    except Exception as exc:
        return {"deleted": False, "error": str(exc)}


async def _clear_pinecone(user_id: str):
    """Clear Pinecone data (original implementation)."""
    index = _get_index()

    if not index:
        return {"deleted": False}

    try:
        index.delete(filter={"user_id": {"$eq": user_id}})
        return {"deleted": True}
    except Exception as exc:
        print(f"[memory] Failed to clear user memory in Pinecone: {exc}")
        return {"deleted": False}
