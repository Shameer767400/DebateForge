"""
language_detector.py — Script-based language detection for debate text.

Used by the fallacy detection and scoring pipelines to route text
to the appropriate NLP model (SpaCy for English, heuristic for others).
"""

from pipelines import detect_language, is_target_script, SCRIPT_RANGES

__all__ = ['detect_language', 'is_target_script', 'SCRIPT_RANGES']
