"""
embedding_utils.py — Embedding and similarity utilities.

Provides TF-IDF vectorization and cosine similarity for the fallacy
detection and memory pipelines. Uses scikit-learn for lightweight
embeddings (instead of heavy sentence-transformers) to stay under
Render's 512MB RAM limit.
"""

import numpy as np
from typing import List, Optional


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    if a is None or b is None:
        return 0.0
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1e-9
    return float(np.dot(a, b) / denom)


def batch_cosine_similarity(query: np.ndarray, candidates: List[np.ndarray]) -> List[float]:
    """Compute cosine similarity between a query and multiple candidates."""
    return [cosine_similarity(query, c) for c in candidates]


def get_tfidf_embeddings(texts: List[str]) -> Optional[np.ndarray]:
    """Generate TF-IDF embeddings for a list of texts."""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        vectorizer = TfidfVectorizer(max_features=500, stop_words='english')
        return vectorizer.fit_transform(texts).toarray()
    except ImportError:
        return None
