import math
import random
import re
from typing import List, Dict

from fastapi import APIRouter
from pydantic import BaseModel

try:
    from textstat import textstat  # type: ignore
except ImportError:  # pragma: no cover - optional
    textstat = None


router = APIRouter(tags=["scorer"])


class ScorerRequest(BaseModel):
    argument: str
    topic: str
    context: List[str] = []
    turn_number: int = 1


class ScorerResponse(BaseModel):
    logic: int
    evidence: int
    clarity: int
    overall: int
    feedback: Dict[str, str]


CAUSAL_MARKERS = [
    "therefore",
    "because",
    "thus",
    "hence",
    "consequently",
    "as a result",
    "this proves",
    "it follows",
]

CONTRAST_MARKERS = [
    "however",
    "although",
    "despite",
    "on the other hand",
    "whereas",
    "yet",
    "nevertheless",
]

CONCLUSION_MARKERS = [
    "in conclusion",
    "therefore",
    "thus",
    "this shows",
]


def _clamp(value: float, min_value: float = 0.0, max_value: float = 100.0) -> float:
    return max(min_value, min(max_value, value))


def _basic_sentence_split(text: str) -> List[str]:
    parts = re.split(r"[.!?]+", text)
    return [p.strip() for p in parts if p.strip()]


def extract_features(argument: str, topic: str, context: List[str]):
    text_lower = argument.lower()

    # LOGIC FEATURES
    has_causal = any(marker in text_lower for marker in CAUSAL_MARKERS)
    has_contrast = any(marker in text_lower for marker in CONTRAST_MARKERS)
    has_conclusion = any(marker in text_lower for marker in CONCLUSION_MARKERS)

    words = argument.split()
    word_count = len(words)
    sentences = _basic_sentence_split(argument)
    sentence_count = len(sentences) or 1

    structure_score = 0
    if sentence_count >= 3:
        structure_score += 1  # has intro/middle/end by length
    if has_causal:
        structure_score += 1
    if has_conclusion:
        structure_score += 1

    logic_score = 40
    if has_causal:
        logic_score += 15
    if has_contrast:
        logic_score += 10
    if has_conclusion:
        logic_score += 15
    logic_score += min(20, structure_score * (20 / 3.0))

    logic_score = _clamp(logic_score + random.uniform(-5, 5))

    # EVIDENCE FEATURES
    has_percentage = bool(re.search(r"\d+\s*%|\d+\s*percent", argument, re.IGNORECASE))
    has_number = bool(
        re.search(r"\b\d{4}\b", argument)
        or re.search(r"\b\d+\s*(million|billion|thousand)\b", argument, re.IGNORECASE)
    )
    has_citation = any(
        phrase in text_lower
        for phrase in [
            "study",
            "research",
            "according to",
            "data",
            "evidence shows",
            "report",
            "survey",
        ]
    )
    has_example = any(
        phrase in text_lower
        for phrase in [
            "for example",
            "for instance",
            "such as",
            "to illustrate",
            "consider",
        ]
    )
    has_year = bool(re.search(r"\b(19|20)\d{2}\b", argument))

    evidence_score = 30
    if has_percentage:
        evidence_score += 20
    if has_citation:
        evidence_score += 15
    if has_example:
        evidence_score += 15
    if has_number:
        evidence_score += 10
    if has_year:
        evidence_score += 10

    evidence_score = _clamp(evidence_score + random.uniform(-5, 5))

    # CLARITY FEATURES
    if textstat is not None:
        try:
            flesch = float(textstat.flesch_reading_ease(argument))
            flesch_score = _clamp(flesch)
        except Exception:  # pragma: no cover - fallback
            flesch_score = 50.0
    else:
        flesch_score = 50.0

    sent_count = len(sentences) or 1
    avg_sent_len = word_count / sent_count
    if 15 <= avg_sent_len <= 25:
        length_score = 100.0
    else:
        length_score = _clamp(100.0 - abs(avg_sent_len - 20) * 3.0)

    unique_ratio = len(set(words)) / word_count if word_count else 1.0
    repetition_score = unique_ratio * 100.0

    clarity_score = (
        flesch_score * 0.4 + length_score * 0.4 + repetition_score * 0.2
    )
    clarity_score = _clamp(clarity_score + random.uniform(-5, 5))

    return int(round(logic_score)), int(round(evidence_score)), int(round(clarity_score))


def _feedback_for_dimension(name: str, score: int) -> str:
    if name == "logic":
        if score < 50:
            return "Your reasoning lacks clear causal structure. Try using connectors like 'therefore' or 'because' to make the argument flow."
        if score <= 75:
            return "Solid reasoning, but you could strengthen the conclusion and make the logical chain more explicit."
        return "Well-structured logical argument with a clear chain of reasoning from premises to conclusion."

    if name == "evidence":
        if score < 50:
            return "Your argument would benefit from concrete evidence such as statistics, dates, or references to studies."
        if score <= 75:
            return "You use some evidence, but adding more specific data or credible sources would make the case stronger."
        return "Strong use of evidence with specific data and references that support your claims."

    if name == "clarity":
        if score < 50:
            return "The argument is hard to follow. Try using shorter sentences and clearer wording to express each point."
        if score <= 75:
            return "Mostly clear, but simplifying sentence structure and avoiding repetition would improve readability."
        return "Very clear and easy to follow, with concise sentences and well-structured paragraphs."

    return ""


@router.post("/score", response_model=ScorerResponse)
async def score_argument(payload: ScorerRequest) -> ScorerResponse:
    logic, evidence, clarity = extract_features(
        payload.argument, payload.topic, payload.context
    )
    overall = int(round((logic + evidence + clarity) / 3.0))

    feedback = {
        "logic": _feedback_for_dimension("logic", logic),
        "evidence": _feedback_for_dimension("evidence", evidence),
        "clarity": _feedback_for_dimension("clarity", clarity),
    }

    return ScorerResponse(
        logic=logic,
        evidence=evidence,
        clarity=clarity,
        overall=overall,
        feedback=feedback,
    )

