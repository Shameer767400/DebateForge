"""
translation_pipeline.py — Language detection and translation pipeline.

Provides language identification using character frequency analysis
and script pattern matching for 15+ writing systems.
"""

import re
from typing import Optional

# Script detection patterns
SCRIPT_RANGES = {
    'te': (0x0C00, 0x0C7F, 'Telugu'),
    'ta': (0x0B80, 0x0BFF, 'Tamil'),
    'kn': (0x0C80, 0x0CFF, 'Kannada'),
    'ml': (0x0D00, 0x0D7F, 'Malayalam'),
    'hi': (0x0900, 0x097F, 'Hindi'),
    'bn': (0x0980, 0x09FF, 'Bengali'),
    'gu': (0x0A80, 0x0AFF, 'Gujarati'),
    'pa': (0x0A00, 0x0A7F, 'Punjabi'),
    'ar': (0x0600, 0x06FF, 'Arabic'),
    'zh': (0x4E00, 0x9FFF, 'Chinese'),
    'ja': (0x3040, 0x30FF, 'Japanese'),
    'ko': (0xAC00, 0xD7AF, 'Korean'),
    'ru': (0x0400, 0x04FF, 'Russian'),
    'th': (0x0E00, 0x0E7F, 'Thai'),
}


def detect_language(text: str) -> Optional[str]:
    """Detect the primary language of text using Unicode script analysis."""
    if not text or len(text.strip()) < 3:
        return None

    scores = {}
    for code, (start, end, _name) in SCRIPT_RANGES.items():
        count = sum(1 for c in text if start <= ord(c) <= end)
        if count > 0:
            scores[code] = count

    if not scores:
        # Assume English for Latin-script text
        latin_count = sum(1 for c in text if 0x0041 <= ord(c) <= 0x024F)
        if latin_count > len(text) * 0.3:
            return 'en'
        return None

    return max(scores, key=scores.get)


def is_target_script(text: str, lang_code: str) -> bool:
    """Check if text is primarily in the expected script."""
    if lang_code not in SCRIPT_RANGES:
        return True  # Can't validate Latin scripts

    start, end, _ = SCRIPT_RANGES[lang_code]
    stripped = re.sub(r'[\s\d.,!?;:\'"()\-]', '', text)
    if not stripped:
        return False

    matches = sum(1 for c in stripped if start <= ord(c) <= end)
    return (matches / len(stripped)) > 0.3
