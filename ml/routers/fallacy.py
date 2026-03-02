from typing import List, Dict, Optional, Tuple

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from models.store import model_store


router = APIRouter(tags=["fallacy"])


class FallacyRequest(BaseModel):
  argument: str
  context: List[str] = []
  user_id: str = ""


class FallacyResponse(BaseModel):
  detected: bool
  fallacy_type: str
  confidence: float
  explanation: str
  triggered_phrase: str


PATTERNS: Dict[str, Dict] = {
  "slippery_slope": {
    "keywords": [
      "will lead to",
      "next thing you know",
      "before long",
      "eventually this will",
      "first step toward",
      "opens the door to",
      "if we allow",
      "where does it end",
    ],
    "confidence": 70,
  },
  "hasty_generalization": {
    "keywords": [
      "all ",
      "everyone knows",
      "always",
      "never happens",
      "nobody believes",
      "everyone agrees",
      "all people",
    ],
    "confidence": 68,
  },
  "appeal_to_emotion": {
    "keywords": [
      "think of the children",
      "devastating",
      "heartbreaking",
      "how could anyone",
      "it's obvious that",
      "clearly anyone",
    ],
    "confidence": 65,
    "extra_check": "exclamations",
  },
  "strawman": {
    "keywords": [
      "you're saying that",
      "so you believe",
      "your argument means",
      "what you're really claiming",
    ],
    "confidence": 72,
  },
  "ad_hominem": {
    "keywords": [
      "you clearly don't understand",
      "only someone who",
      "typical of people who",
      "you would think that",
    ],
    "confidence": 75,
  },
  "false_dichotomy": {
    "keywords": [
      "either we",
      "there are only two",
      "you're either with",
      "it's one or the other",
      "only two options",
    ],
    "confidence": 73,
  },
  "circular_reasoning": {
    "detect": "subject_in_conclusion",
    "confidence": 67,
  },
  "appeal_to_authority": {
    "keywords": [
      "experts say",
      "scientists all agree",
      "studies prove",
      "it's scientifically proven",
    ],
    "confidence": 60,
  },
}


FALLACY_EXAMPLES: Dict[str, List[str]] = {
  "slippery_slope": [
    "If we allow this policy, it will lead to complete chaos in society.",
    "Letting students use calculators is the first step toward academic laziness.",
    "If we legalize this, next thing you know everything will be legal.",
    "Allowing one exception opens the door to endless abuses.",
    "If we accept this argument, it will eventually destroy our freedoms.",
  ],
  "hasty_generalization": [
    "I met two rude teenagers, so all teenagers are disrespectful.",
    "This product failed once, so it's always unreliable.",
    "I had a bad experience, therefore this service is always terrible.",
    "Everyone knows that politicians are corrupt.",
    "My friend struggled with online classes, so online learning never works.",
  ],
  "appeal_to_emotion": [
    "Think of the children who will suffer if we don't act.",
    "It's heartbreaking to imagine the consequences, so we must agree.",
    "How could anyone support this without feeling guilty?",
    "Only a heartless person would disagree with this proposal.",
    "The devastation caused should be enough to convince you.",
  ],
  "strawman": [
    "You're saying that we should just ignore the problem entirely.",
    "So you believe that money is the only thing that matters.",
    "Your argument means we should get rid of all rules.",
    "What you're really claiming is that people can't be trusted at all.",
    "So you're saying we should never take precautions.",
  ],
  "ad_hominem": [
    "You clearly don't understand basic economics, so your argument is invalid.",
    "Only someone who is ignorant would say something like that.",
    "Typical of people like you to think that way.",
    "You would think that, given your background.",
    "No one should take you seriously on this topic.",
  ],
  "false_dichotomy": [
    "Either we ban this completely or we accept total chaos.",
    "There are only two options: support this plan or you hate progress.",
    "You're either with us or against us.",
    "It's one or the other; there is no middle ground.",
    "We either raise taxes or the economy will collapse.",
  ],
  "circular_reasoning": [
    "This law is necessary because it's important that we have this law.",
    "We must trust the leader because they are trustworthy.",
    "The policy is fair because it's a fair policy.",
    "He is a good teacher because he teaches well.",
    "The Bible is true because it says so in the Bible.",
  ],
  "appeal_to_authority": [
    "Experts say this is the only solution.",
    "Scientists all agree that this is correct.",
    "Studies prove that this method is always best.",
    "It's scientifically proven, so there's no need to question it.",
    "All the top analysts endorse this idea.",
  ],
}

_example_embeddings: Dict[str, np.ndarray] = {}


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
  if a is None or b is None:
    return 0.0
  denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1e-9
  return float(np.dot(a, b) / denom)


def _rule_based_detection(text: str) -> Optional[Tuple[str, float, str]]:
  lower = text.lower()
  best: Tuple[Optional[str], float, str] = (None, 0.0, "")

  # Check keyword-based patterns
  for fallacy, cfg in PATTERNS.items():
    if fallacy == "circular_reasoning":
      continue

    for keyword in cfg.get("keywords", []):
      kw_lower = keyword.lower()
      if kw_lower in lower:
        conf = float(cfg["confidence"])

        if cfg.get("extra_check") == "exclamations":
          exclamations = text.count("!")
          if exclamations > 2:
            conf = min(conf + 5, 100.0)

        if conf > best[1]:
          best = (fallacy, conf, keyword)

  # Special case: circular reasoning
  if PATTERNS.get("circular_reasoning"):
    sentences = [s.strip() for s in text.split(".") if s.strip()]
    if len(sentences) >= 2:
      first, last = sentences[0], sentences[-1]
      subject = " ".join(first.split()[:5])
      if subject and subject in last:
        conf = float(PATTERNS["circular_reasoning"]["confidence"])
        if conf > best[1]:
          best = ("circular_reasoning", conf, subject)

  if best[0] is None:
    return None

  return best  # (fallacy_type, confidence, triggered_phrase)


def _ensure_example_embeddings() -> None:
  if not model_store.sentence_model or _example_embeddings:
    return

  model = model_store.sentence_model
  for fallacy, examples in FALLACY_EXAMPLES.items():
    embeddings = model.encode(examples, convert_to_numpy=True)
    _example_embeddings[fallacy] = np.mean(embeddings, axis=0)


def _semantic_detection(text: str) -> Optional[Tuple[str, float, str]]:
  if not model_store.sentence_model:
    return None

  _ensure_example_embeddings()

  model = model_store.sentence_model
  arg_emb = model.encode([text], convert_to_numpy=True)[0]

  best_type: Optional[str] = None
  best_conf: float = 0.0

  for fallacy, emb in _example_embeddings.items():
    sim = _cosine_similarity(arg_emb, emb)
    conf = sim * 100.0
    if conf > best_conf:
      best_conf = conf
      best_type = fallacy

  if best_type is None:
    return None

  return best_type, best_conf, ""


EXPLANATIONS: Dict[str, str] = {
  "slippery_slope": (
    "Your argument assumes that {triggered_phrase} will inevitably lead to an "
    "extreme outcome without providing evidence for each step in the chain."
  ),
  "hasty_generalization": (
    "Your reasoning draws a broad conclusion from too few examples, which is a hasty generalization."
  ),
  "appeal_to_emotion": (
    "The argument relies heavily on emotional language rather than logical reasons or evidence."
  ),
  "strawman": (
    "The position you address is a simplified or distorted version of the actual argument."
  ),
  "ad_hominem": (
    "The focus is on attacking the person instead of addressing the substance of their argument."
  ),
  "false_dichotomy": (
    "The argument presents only two options while ignoring reasonable alternatives."
  ),
  "circular_reasoning": (
    "The conclusion repeats part of the premise, so the argument effectively assumes what it tries to prove."
  ),
  "appeal_to_authority": (
    "The argument relies mainly on authority figures instead of presenting independent reasons or evidence."
  ),
}


@router.post("/detect", response_model=FallacyResponse)
async def detect_fallacy(payload: FallacyRequest) -> FallacyResponse:
  text_parts = [payload.argument.strip()]
  if payload.context:
    text_parts.extend([c.strip() for c in payload.context if c.strip()])
  full_text = " ".join(text_parts).strip()

  if not full_text:
    return FallacyResponse(
      detected=False,
      fallacy_type="no_fallacy",
      confidence=0.0,
      explanation="No logical fallacy detected",
      triggered_phrase="",
    )

  # Layer 1: rule-based
  rule_result = _rule_based_detection(full_text)
  if rule_result:
    fallacy_type, conf, phrase = rule_result
    if conf >= 60.0:
      explanation_template = EXPLANATIONS.get(
        fallacy_type,
        "This argument exhibits characteristics of {fallacy_type}.",
      )
      explanation = explanation_template.format(
        triggered_phrase=phrase, fallacy_type=fallacy_type
      )
      if conf >= 65.0:
        return FallacyResponse(
          detected=True,
          fallacy_type=fallacy_type,
          confidence=round(conf, 2),
          explanation=explanation,
          triggered_phrase=phrase,
        )

  # Layer 2: semantic similarity (if rule-based is weak or absent)
  semantic_result = _semantic_detection(full_text)
  if semantic_result:
    fallacy_type, conf, phrase = semantic_result
    if conf >= 60.0:
      explanation_template = EXPLANATIONS.get(
        fallacy_type,
        "This argument exhibits characteristics of {fallacy_type}.",
      )
      explanation = explanation_template.format(
        triggered_phrase=phrase or "",
        fallacy_type=fallacy_type,
      )
      return FallacyResponse(
        detected=True,
        fallacy_type=fallacy_type,
        confidence=round(conf, 2),
        explanation=explanation,
        triggered_phrase=phrase or "",
      )

  # No fallacy detected with sufficient confidence
  return FallacyResponse(
    detected=False,
    fallacy_type="no_fallacy",
    confidence=0.0,
    explanation="No logical fallacy detected",
    triggered_phrase="",
  )

