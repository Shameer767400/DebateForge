import io
import logging
import os
import time
import google.generativeai as genai

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY"))

async def transcribe_audio(audio_bytes: bytes, topic: str = "") -> dict:
    """
    Transcribe user's spoken debate argument using Google Gemini.
    Returns dict with: { text, duration_ms, word_count, success }
    """
    start = time.time()

    if len(audio_bytes) < 1000:
        return {
            "text": "",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": "Audio too short",
        }

    try:
        # Gemini 2.0 Flash — higher free-tier quota (1500 RPD vs 20 for 2.5)
        model = genai.GenerativeModel("gemini-2.0-flash")
        
        # Audio bytes to Gemini format
        # MIME type for webm is 'audio/webm'
        audio_part = {
            "mime_type": "audio/webm",
            "data": audio_bytes
        }
        
        prompt = f"Transcribe this audio. Context: This is a formal debate argument about: {topic}" if topic else "Transcribe this audio."
        
        response = await model.generate_content_async([prompt, audio_part])
        text = response.text.strip()

        # Clean filler words at sentence start (reused logic)
        filler_pattern = r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+"
        import re

        text = re.sub(filler_pattern, "", text, flags=re.IGNORECASE).strip()

        elapsed = round((time.time() - start) * 1000)
        words = len(text.split())
        logging.info(f"[GEMINI-TRANSCRIPTION] {words} words transcribed in {elapsed}ms")

        return {
            "text": text,
            "duration_ms": elapsed,
            "word_count": words,
            "success": True,
        }

    except Exception as e:
        logging.error(f"[GEMINI-TRANSCRIPTION] Error: {e}")
        return {
            "text": "",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": str(e),
        }

