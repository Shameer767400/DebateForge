"""
fallacy.py — Multi-layer logical fallacy detection engine.

Detection Pipeline:
  Layer 1: Rule-based keyword matching (fast, high precision)
  Layer 2: Semantic similarity via sentence embeddings (when available)
  Layer 3: SpaCy NLP analysis — dependency parsing, named entity recognition,
           and syntactic pattern detection for advanced fallacy identification

Supported Fallacy Types (11):
  - slippery_slope, hasty_generalization, appeal_to_emotion
  - strawman, ad_hominem, false_dichotomy, circular_reasoning
  - appeal_to_authority, bandwagon, appeal_to_nature, red_herring

Technology Stack:
  - SpaCy (en_core_web_sm) — tokenization, POS tagging, NER, dependency parsing
  - NumPy — cosine similarity for semantic detection
  - Pydantic — request/response validation
"""

from typing import List, Dict, Optional, Tuple

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from models.store import model_store

# ── SpaCy NLP pipeline (loaded lazily) ──
_nlp = None

def _get_nlp():
    """Load SpaCy English model (lazy singleton). Uses en_core_web_sm for
    tokenization, POS tagging, Named Entity Recognition, and dependency parsing."""
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("en_core_web_sm")
            print("✅ SpaCy en_core_web_sm loaded for fallacy NLP analysis")
        except Exception as e:
            print(f"⚠️  SpaCy not available ({e}), using rule-based detection only")
            _nlp = False  # Mark as attempted but failed
    return _nlp if _nlp is not False else None


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
      "this will snowball",
      "it won't stop there",
      "mark my words",
      "give them an inch",
      "the floodgates",
      "slippery slope",
      "down the road this",
      "one step away from",
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
      "every single",
      "none of them",
      "they always",
      "they never",
      "people always",
      "no one ever",
      "literally everyone",
      "i've seen it happen",
      "that's just how it is",
      "100 percent of the time",
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
      "don't you care",
      "you should be ashamed",
      "unforgivable",
      "disgusting",
      "horrifying",
      "it's outrageous",
      "any decent person",
      "are you heartless",
      "imagine the suffering",
      "this is a tragedy",
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
      "so basically you want",
      "you think we should just",
      "that's like saying",
      "so you're telling me",
      "in other words you",
      "you want to",
    ],
    "confidence": 72,
  },
  "ad_hominem": {
    "keywords": [
      "you clearly don't understand",
      "only someone who",
      "typical of people who",
      "you would think that",
      "you're not qualified",
      "what do you know about",
      "you're biased",
      "that's naive",
      "spoken like someone who",
      "you obviously don't",
      "people like you",
      "of course you'd say that",
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
      "it's black or white",
      "there's no middle ground",
      "you have to choose",
      "pick a side",
      "no alternative",
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
      "research confirms",
      "everybody in the field",
      "the experts have spoken",
      "authorities agree",
      "trust the science",
      "qualified people say",
    ],
    "confidence": 60,
  },
  "bandwagon": {
    "keywords": [
      "everyone is doing it",
      "most people agree",
      "the majority believes",
      "popular opinion",
      "it's the trend",
      "jump on the bandwagon",
      "get with the times",
      "nobody disagrees",
      "widely accepted",
      "the consensus is",
      "millions of people",
    ],
    "confidence": 66,
  },
  "appeal_to_nature": {
    "keywords": [
      "it's natural",
      "nature intended",
      "unnatural",
      "against nature",
      "naturally",
      "the natural way",
      "organic is better",
      "that's not how nature works",
      "humans were designed to",
      "we evolved to",
    ],
    "confidence": 63,
  },
  "red_herring": {
    "keywords": [
      "but what about",
      "the real issue is",
      "let's talk about something",
      "that's not the point but",
      "forget about that",
      "more importantly",
      "you're ignoring the fact",
      "let me change the subject",
      "speaking of which",
      "anyway",
    ],
    "confidence": 62,
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
  "bandwagon": [
    "Everyone's buying this product, so it must be great.",
    "Millions of people can't be wrong about this.",
    "It's the most popular opinion, so it must be correct.",
    "Get with the times — everybody supports this now.",
    "Most people agree with me, so I must be right.",
  ],
  "appeal_to_nature": [
    "It's natural, so it must be good for you.",
    "Humans were designed to live this way.",
    "That chemical is unnatural, so it must be harmful.",
    "Nature intended for us to eat only plants.",
    "Going against nature is always wrong.",
  ],
  "red_herring": [
    "Sure the economy matters, but what about the environment?",
    "Forget about the budget — the real issue is leadership.",
    "That's an interesting point, but let's talk about education instead.",
    "You're ignoring the fact that people are suffering elsewhere.",
    "More importantly, we should focus on something entirely different.",
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


# ═══════════════════════════════════════
#    LAYER 3: SpaCy NLP-Based Detection
# ═══════════════════════════════════════

def _nlp_based_detection(text: str) -> Optional[Tuple[str, float, str]]:
    """
    Use SpaCy's NLP pipeline (dependency parsing, POS tagging, NER) to detect
    fallacies based on syntactic and semantic patterns.

    This layer catches fallacies that keyword matching misses, e.g.:
    - Ad hominem: second-person pronouns as nsubj of negative predicates
    - Hasty generalization: universal quantifiers (DET) + absolute adverbs
    - Appeal to authority: PERSON/ORG entities + verbs like 'says', 'proves'
    - Circular reasoning: high token overlap between first and last clauses
    - False dichotomy: coordinating conjunctions with 'or' as exclusive structure
    """
    nlp = _get_nlp()
    if nlp is None:
        return None

    try:
        doc = nlp(text)

        # ── Ad Hominem: "you" as subject of negative/dismissive predicate ──
        ad_hominem_verbs = {"understand", "know", "qualified", "capable", "competent"}
        for token in doc:
            if token.dep_ == "nsubj" and token.text.lower() in ("you", "your"):
                head = token.head
                # Check for negation + dismissive verb
                has_neg = any(c.dep_ == "neg" for c in head.children)
                if has_neg and head.lemma_.lower() in ad_hominem_verbs:
                    return ("ad_hominem", 68.0, f"'{head.text}' targeting 'you'")

        # ── Hasty Generalization: universal quantifiers + absolute language ──
        universal_dets = {"all", "every", "each", "no", "none"}
        absolute_advs = {"always", "never", "constantly", "invariably"}
        for token in doc:
            if token.pos_ == "DET" and token.text.lower() in universal_dets:
                return ("hasty_generalization", 64.0, f"universal quantifier '{token.text}'")
            if token.pos_ == "ADV" and token.text.lower() in absolute_advs:
                return ("hasty_generalization", 62.0, f"absolute adverb '{token.text}'")

        # ── Appeal to Authority: PERSON/ORG entity + authority verbs ──
        authority_verbs = {"say", "prove", "confirm", "agree", "show", "demonstrate"}
        entities = [ent for ent in doc.ents if ent.label_ in ("PERSON", "ORG")]
        if entities:
            for token in doc:
                if token.lemma_.lower() in authority_verbs:
                    return ("appeal_to_authority", 58.0, f"authority '{entities[0].text}' + '{token.text}'")

        # ── Circular Reasoning (NLP-enhanced): token overlap between clauses ──
        sents = list(doc.sents)
        if len(sents) >= 2:
            first_lemmas = set(t.lemma_.lower() for t in sents[0] if t.pos_ not in ("DET", "ADP", "PUNCT", "AUX"))
            last_lemmas = set(t.lemma_.lower() for t in sents[-1] if t.pos_ not in ("DET", "ADP", "PUNCT", "AUX"))
            if first_lemmas and last_lemmas:
                overlap = len(first_lemmas & last_lemmas) / max(len(first_lemmas), len(last_lemmas))
                if overlap > 0.6:
                    shared = ", ".join(list(first_lemmas & last_lemmas)[:3])
                    return ("circular_reasoning", 65.0, f"high lemma overlap: {shared}")

        # ── False Dichotomy: "either...or" syntactic structure ──
        text_lower = text.lower()
        if "either" in text_lower and " or " in text_lower:
            # Check if 'or' is acting as a coordinating conjunction (cc)
            for token in doc:
                if token.text.lower() == "or" and token.dep_ == "cc":
                    return ("false_dichotomy", 66.0, "'either...or' structure")

    except Exception as e:
        print(f"[fallacy] SpaCy NLP analysis error: {e}")

    return None


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
  "bandwagon": (
    "The argument assumes something is true or correct because many people believe it or do it."
  ),
  "appeal_to_nature": (
    "The argument assumes that what is 'natural' is inherently good or correct, which is not necessarily true."
  ),
  "red_herring": (
    "The argument introduces an unrelated topic to divert attention from the actual issue being discussed."
  ),
}

# Lowered threshold from 60 → 52 for better detection of short debate utterances
SEMANTIC_THRESHOLD = 52.0


@router.post("/detect", response_model=FallacyResponse)
async def detect_fallacy(payload: FallacyRequest) -> FallacyResponse:
  """
  Detect logical fallacies in a debate argument using a multi-layer pipeline:

  1. **Rule-based** — keyword pattern matching (fastest, highest precision)
  2. **Semantic** — embedding similarity against known fallacy examples
  3. **NLP** — SpaCy dependency parsing, POS tagging, and entity recognition

  Returns the highest-confidence detection across all layers.
  """
  argument_text = payload.argument.strip()

  if not argument_text:
    return FallacyResponse(
      detected=False,
      fallacy_type="no_fallacy",
      confidence=0.0,
      explanation="No logical fallacy detected",
      triggered_phrase="",
    )

  # Layer 1: rule-based
  rule_result = _rule_based_detection(argument_text)
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
      if conf >= 62.0:
        return FallacyResponse(
          detected=True,
          fallacy_type=fallacy_type,
          confidence=round(conf, 2),
          explanation=explanation,
          triggered_phrase=phrase,
        )

  # Layer 2: semantic similarity (if rule-based is weak or absent)
  semantic_result = _semantic_detection(argument_text)
  if semantic_result:
    fallacy_type, conf, phrase = semantic_result
    if conf >= SEMANTIC_THRESHOLD:
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

  # Layer 3: SpaCy NLP-based detection (catches what keywords miss)
  nlp_result = _nlp_based_detection(argument_text)
  if nlp_result:
    fallacy_type, conf, phrase = nlp_result
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
