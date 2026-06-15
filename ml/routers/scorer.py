"""
scorer.py — Multi-dimensional argument quality scorer.

Scores each debate argument on three dimensions:
  - Logic (0-100):    Causal structure, reasoning markers, logical flow
  - Evidence (0-100): Statistics, citations, examples, data references
  - Clarity (0-100):  Readability, sentence length, vocabulary variety

Scoring Pipeline:
  1. Feature extraction using regex + keyword markers (Latin scripts)
  2. Universal structural analysis for non-Latin scripts (Telugu, Hindi, etc.)
  3. NLTK VADER sentiment analysis for argument tone assessment
  4. SpaCy linguistic features for enhanced readability scoring
  5. Optional textstat for Flesch reading ease

Technology Stack:
  - NLTK (VADER SentimentIntensityAnalyzer) — sentiment & tone analysis
  - SpaCy (en_core_web_sm) — linguistic feature extraction
  - textstat (optional) — readability scoring
  - NumPy / regex — feature extraction
"""

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

# ── NLTK VADER Sentiment Analyzer (lazy singleton) ──
_vader = None

def _get_vader():
    """Load NLTK VADER sentiment analyzer (lazy singleton).
    Used to assess argument tone — overly emotional arguments may indicate
    appeal_to_emotion fallacies or poor evidence-based reasoning."""
    global _vader
    if _vader is None:
        try:
            import nltk
            from nltk.sentiment.vader import SentimentIntensityAnalyzer
            # Download VADER lexicon if not present
            try:
                nltk.data.find('sentiment/vader_lexicon.zip')
            except LookupError:
                nltk.download('vader_lexicon', quiet=True)
            _vader = SentimentIntensityAnalyzer()
            print("✅ NLTK VADER loaded for sentiment analysis")
        except Exception as e:
            print(f"⚠️  NLTK VADER not available ({e}), skipping sentiment scoring")
            _vader = False  # Mark as attempted but failed
    return _vader if _vader is not False else None

# ── SpaCy NLP pipeline (lazy singleton) ──
_nlp = None

def _get_nlp():
    """Load SpaCy English model for linguistic feature extraction."""
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("en_core_web_sm")
        except Exception:
            _nlp = False
    return _nlp if _nlp is not False else None


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
    sentiment: Dict[str, float] = {}


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


def _is_non_latin(text: str) -> bool:
    """Return True if the text contains a significant amount of non-Latin script."""
    non_latin = sum(1 for c in text if ord(c) > 0x024F)
    return non_latin > len(text) * 0.25  # >25% non-Latin characters


def _analyze_sentiment(text: str) -> Dict[str, float]:
    """
    Analyze argument sentiment using NLTK VADER.

    Returns compound, positive, negative, neutral scores.
    High emotional intensity (|compound| > 0.6) may indicate weak evidence-based reasoning.
    """
    vader = _get_vader()
    if vader is None:
        return {}

    try:
        scores = vader.polarity_scores(text)
        return {
            "compound": round(scores["compound"], 3),
            "positive": round(scores["pos"], 3),
            "negative": round(scores["neg"], 3),
            "neutral": round(scores["neu"], 3),
        }
    except Exception:
        return {}


def _spacy_features(text: str) -> Dict:
    """
    Extract linguistic features using SpaCy for enhanced scoring:
    - Unique POS tag diversity (more diverse = more sophisticated argument)
    - Named entity count (entities suggest evidence usage)
    - Average dependency tree depth (deeper = more complex sentences)
    - Discourse connective count
    """
    nlp = _get_nlp()
    if nlp is None:
        return {}

    try:
        doc = nlp(text)

        # POS diversity — more diverse parts of speech = more sophisticated
        pos_tags = set(token.pos_ for token in doc if not token.is_punct)
        pos_diversity = len(pos_tags)

        # Named entities — suggests concrete evidence
        entity_count = len(doc.ents)

        # Dependency depth — syntactic complexity
        def _tree_depth(token):
            depth = 0
            current = token
            while current.head != current:
                depth += 1
                current = current.head
            return depth

        depths = [_tree_depth(t) for t in doc if not t.is_punct]
        avg_depth = sum(depths) / len(depths) if depths else 0

        return {
            "pos_diversity": pos_diversity,
            "entity_count": entity_count,
            "avg_dep_depth": round(avg_depth, 2),
            "token_count": len(doc),
        }
    except Exception:
        return {}


def extract_features(argument: str, topic: str, context: List[str]):
    text_lower = argument.lower()

    words = argument.split()
    word_count = len(words) or 1
    sentences = _basic_sentence_split(argument)
    sentence_count = len(sentences) or 1

    # ── Sentiment analysis (applies to all languages) ──
    sentiment = _analyze_sentiment(argument)

    # ── Non-Latin script (Telugu, Hindi, Tamil, etc.) ──────────────────────
    # English keyword markers won't match, so use universal structural signals.
    if _is_non_latin(argument):
        # LOGIC: measured by sentence count and presence of numbers/structure
        logic_score = 45.0
        if sentence_count >= 2:
            logic_score += 10
        if sentence_count >= 4:
            logic_score += 10
        # Presence of numbers suggests cited evidence → boosts logic too
        if re.search(r'\d', argument):
            logic_score += 10
        # Longer arguments tend to be more structured
        if word_count >= 20:
            logic_score += 10
        logic_score = _clamp(logic_score)

        # EVIDENCE: numbers, years, percentages are universal
        has_percentage = bool(re.search(r'\d+\s*%', argument))
        has_year       = bool(re.search(r'\b(19|20)\d{2}\b', argument))
        has_number     = bool(re.search(r'\b\d+\b', argument))
        evidence_score = 35.0
        if has_percentage:
            evidence_score += 25
        if has_year:
            evidence_score += 15
        if has_number:
            evidence_score += 10
        evidence_score = _clamp(evidence_score)

        # CLARITY: use sentence length distribution (universal)
        avg_sent_len = word_count / sentence_count
        if 8 <= avg_sent_len <= 20:
            clarity_score = 75.0
        else:
            clarity_score = _clamp(75.0 - abs(avg_sent_len - 14) * 2.5)
        unique_ratio = len(set(words)) / word_count
        clarity_score = _clamp((clarity_score * 0.7 + unique_ratio * 100 * 0.3))

        if word_count < 10:
            logic_score = min(30.0, logic_score)
            evidence_score = min(20.0, evidence_score)

        return int(round(logic_score)), int(round(evidence_score)), int(round(clarity_score)), sentiment

    # ── Latin-script (English, French, Spanish, etc.) ──────────────────────
    # LOGIC FEATURES
    has_causal = any(marker in text_lower for marker in CAUSAL_MARKERS)
    has_contrast = any(marker in text_lower for marker in CONTRAST_MARKERS)
    has_conclusion = any(marker in text_lower for marker in CONCLUSION_MARKERS)

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

    # SpaCy NLP bonus: syntactic complexity boosts logic score
    spacy_feats = _spacy_features(argument)
    if spacy_feats:
        if spacy_feats.get("avg_dep_depth", 0) > 3:
            logic_score += 5  # Complex sentence structures
        if spacy_feats.get("pos_diversity", 0) >= 8:
            logic_score += 5  # Diverse vocabulary types

    # Sentiment penalty: highly emotional arguments are less logical
    if sentiment and abs(sentiment.get("compound", 0)) > 0.7:
        logic_score -= 5  # Overly emotional = less logical

    logic_score = _clamp(logic_score)

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

    # SpaCy NLP bonus: named entities suggest concrete evidence
    if spacy_feats and spacy_feats.get("entity_count", 0) > 0:
        evidence_score += min(10, spacy_feats["entity_count"] * 5)

    evidence_score = _clamp(evidence_score)

    # CLARITY FEATURES
    if textstat is not None:
        try:
            flesch = float(textstat.flesch_reading_ease(argument))
            flesch_score = _clamp(flesch)
        except Exception:  # pragma: no cover - fallback
            flesch_score = 50.0
    else:
        flesch_score = 50.0

    avg_sent_len = word_count / sentence_count
    if 15 <= avg_sent_len <= 25:
        length_score = 100.0
    else:
        length_score = _clamp(100.0 - abs(avg_sent_len - 20) * 3.0)

    unique_ratio = len(set(words)) / word_count if word_count else 1.0
    repetition_score = unique_ratio * 100.0

    clarity_score = (
        flesch_score * 0.4 + length_score * 0.4 + repetition_score * 0.2
    )
    clarity_score = _clamp(clarity_score)

    if word_count < 10:
        logic_score = min(30.0, logic_score)
        evidence_score = min(20.0, evidence_score)

    return int(round(logic_score)), int(round(evidence_score)), int(round(clarity_score)), sentiment


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
    """
    Score a debate argument across three quality dimensions using a multi-signal
    pipeline: regex feature extraction, NLTK VADER sentiment analysis, SpaCy
    linguistic features, and optional textstat readability scoring.

    Returns per-dimension scores (logic, evidence, clarity), an overall score,
    dimension-specific feedback, and sentiment analysis results.
    """
    result = extract_features(
        payload.argument, payload.topic, payload.context
    )
    logic, evidence, clarity = result[0], result[1], result[2]
    sentiment = result[3] if len(result) > 3 else {}

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
        sentiment=sentiment,
    )
