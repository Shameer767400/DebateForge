import io
import logging
import os
import re
import tempfile
import time

import google.generativeai as genai

# ── Toggle: local Whisper vs Gemini API ──
USE_LOCAL_STT = os.getenv("USE_LOCAL_STT", "false").lower() == "true"

# Configure Gemini (only if using API mode)
if not USE_LOCAL_STT:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY"))

# ── Local Whisper model (lazy singleton) ──
_whisper_model = None


def get_whisper_model():
    """Load the local Whisper model once on first call."""
    global _whisper_model
    if _whisper_model is None:
        import whisper

        logging.info("[WHISPER LOCAL] Loading model...")
        _whisper_model = whisper.load_model("base")
        logging.info("[WHISPER LOCAL] Model loaded ✅")
    return _whisper_model


async def _transcribe_local(audio_bytes: bytes, topic: str = "") -> dict:
    """Transcribe audio using local Whisper model. No API key needed."""
    start = time.time()

    try:
        # Whisper needs a file path, not raw bytes
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        model = get_whisper_model()

        result = model.transcribe(
            tmp_path,
            language="en",
            initial_prompt=f"Formal debate about: {topic}" if topic else None,
            fp16=False,  # Set True if you have a GPU
        )

        os.unlink(tmp_path)
        text = result["text"].strip()

        # Remove filler words
        text = re.sub(
            r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

        elapsed = round((time.time() - start) * 1000)
        words = len(text.split())
        logging.info(f"[WHISPER LOCAL] {words} words in {elapsed}ms")

        return {
            "text": text,
            "duration_ms": elapsed,
            "word_count": words,
            "success": True,
        }

    except Exception as e:
        logging.error(f"[WHISPER LOCAL] Error: {e}")
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        return {
            "text": "",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": str(e),
        }


async def _transcribe_gemini(audio_bytes: bytes, topic: str = "") -> dict:
    """Transcribe using Google Gemini API (original implementation)."""
    start = time.time()

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")

        audio_part = {"mime_type": "audio/webm", "data": audio_bytes}

        prompt = (
            f"Transcribe this audio. Context: This is a formal debate argument about: {topic}"
            if topic
            else "Transcribe this audio."
        )

        response = await model.generate_content_async([prompt, audio_part])
        text = response.text.strip()

        # Clean filler words
        text = re.sub(
            r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

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


async def transcribe_audio(audio_bytes: bytes, topic: str = "") -> dict:
    """
    Transcribe user's spoken debate argument.
    Uses local Whisper when USE_LOCAL_STT=true, otherwise Gemini API.
    """
    if len(audio_bytes) < 1000:
        return {
            "text": "",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": "Audio too short",
        }

    if USE_LOCAL_STT:
        return await _transcribe_local(audio_bytes, topic)
    else:
        return await _transcribe_gemini(audio_bytes, topic)
