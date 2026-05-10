"""
text_utils.py — Shared text processing utilities for ML pipelines.

Provides reusable helpers for sentence splitting, non-Latin detection,
and text normalization used across fallacy detection and scoring.
"""

import re
from typing import List


def split_sentences(text: str) -> List[str]:
    """Split text into sentences using punctuation markers."""
    parts = re.split(r'[.!?]+', text)
    return [p.strip() for p in parts if p.strip()]


def is_non_latin(text: str) -> bool:
    """Return True if >25% of characters are non-Latin script."""
    non_latin = sum(1 for c in text if ord(c) > 0x024F)
    return non_latin > len(text) * 0.25


def word_count(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def unique_word_ratio(text: str) -> float:
    """Calculate ratio of unique words to total words."""
    words = text.lower().split()
    if not words:
        return 0.0
    return len(set(words)) / len(words)


def normalize_whitespace(text: str) -> str:
    """Collapse multiple whitespace into single spaces."""
    return re.sub(r'\s+', ' ', text).strip()
