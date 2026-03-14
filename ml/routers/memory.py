import os
import time
from collections import Counter
from typing import List, Dict, Any

from fastapi import APIRouter
from pydantic import BaseModel

from models.store import model_store

try:
    from pinecone import Pinecone
except ImportError:  # pragma: no cover - optional
    Pinecone = None


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


@router.post("/store")
async def store_argument(payload: StoreRequest):
    index = _get_index()

    if not index or not model_store.sentence_model:
        # Treat as non-critical: just report not stored
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
    except Exception as exc:  # pragma: no cover - non-critical
        print(f"[memory] Failed to store argument in Pinecone: {exc}")
        return {"stored": False}


@router.get("/weaknesses/{user_id}", response_model=WeaknessResponse)
async def get_weaknesses(user_id: str) -> WeaknessResponse:
    index = _get_index()

    if not index:
        return WeaknessResponse(
            top_fallacy="none",
            weak_topics=[],
            weakness_summary="",
            avg_weak_score=50.0,
        )

    try:
        # neutral vector; dimension 384 for all-MiniLM-L6-v2
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

    except Exception as exc:  # pragma: no cover - fallback
        print(f"[memory] Failed to query Pinecone: {exc}")
        return WeaknessResponse(
            top_fallacy="none",
            weak_topics=[],
            weakness_summary="",
            avg_weak_score=50.0,
        )

@router.delete("/clear/{user_id}")
async def clear_memory(user_id: str):
    index = _get_index()

    if not index:
        return {"deleted": False}

    try:
        index.delete(filter={"user_id": {"$eq": user_id}})
        return {"deleted": True}
    except Exception as exc:  # pragma: no cover
        print(f"[memory] Failed to clear user memory in Pinecone: {exc}")
        return {"deleted": False}

