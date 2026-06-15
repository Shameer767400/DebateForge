import io
import logging
import os
import re
import tempfile
import time

import google.generativeai as genai

def detect_lang_from_text(text: str) -> str:
    raw = text.strip()
    if not raw:
        return 'en'
    # Telugu
    if re.search(r'[\u0C00-\u0C7F]', raw):
        return 'te'
    # Tamil
    if re.search(r'[\u0B80-\u0BFF]', raw):
        return 'ta'
    # Kannada
    if re.search(r'[\u0C80-\u0CFF]', raw):
        return 'kn'
    # Malayalam
    if re.search(r'[\u0D00-\u0D7F]', raw):
        return 'ml'
    # Hindi/Devanagari
    if re.search(r'[\u0900-\u097F]', raw):
        return 'hi'
    # Bengali
    if re.search(r'[\u0980-\u09FF]', raw):
        return 'bn'
    # Gujarati
    if re.search(r'[\u0A80-\u0AFF]', raw):
        return 'gu'
    # Punjabi
    if re.search(r'[\u0A00-\u0A7F]', raw):
        return 'pa'
    # Urdu/Arabic script
    if re.search(r'[\u0600-\u06FF]', raw):
        return 'ur'
    return 'en'

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


async def _transcribe_local(audio_bytes: bytes, topic: str = "", mime_type: str = "audio/webm") -> dict:
    """Transcribe audio using local Whisper model. Auto-detects language."""
    start = time.time()

    try:
        # Determine file suffix based on mime_type
        ext = ".webm"
        if "mp4" in mime_type or "m4a" in mime_type:
            ext = ".mp4"
        elif "wav" in mime_type:
            ext = ".wav"
        elif "mpeg" in mime_type or "mp3" in mime_type:
            ext = ".mp3"
        elif "ogg" in mime_type:
            ext = ".ogg"
        elif "aac" in mime_type:
            ext = ".aac"

        # Whisper needs a file path, not raw bytes
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        model = get_whisper_model()

        # language=None lets Whisper auto-detect the spoken language
        result = model.transcribe(
            tmp_path,
            language=None,
            initial_prompt=f"Formal debate about: {topic}" if topic else None,
            fp16=False,  # Set True if you have a GPU
        )

        os.unlink(tmp_path)
        text = result["text"].strip()
        detected_lang = result.get("language", "en")  # e.g. 'hi', 'fr', 'en'

        # Remove filler words
        text = re.sub(
            r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

        elapsed = round((time.time() - start) * 1000)
        words = len(text.split())
        logging.info(f"[WHISPER LOCAL] {words} words in {elapsed}ms | lang={detected_lang}")

        return {
            "text": text,
            "language": detected_lang,
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
            "language": "en",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": str(e),
        }


async def _transcribe_gemini(audio_bytes: bytes, topic: str = "", mime_type: str = "audio/webm") -> dict:
    """Transcribe using Google Gemini API with language detection."""
    start = time.time()

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")

        # Map typical content types to standard ones supported by Gemini API
        gemini_mime = mime_type
        if "mp4" in mime_type or "m4a" in mime_type:
            gemini_mime = "audio/mp4"
        elif "wav" in mime_type:
            gemini_mime = "audio/wav"
        elif "mpeg" in mime_type or "mp3" in mime_type:
            gemini_mime = "audio/mp3"
        elif "ogg" in mime_type:
            gemini_mime = "audio/ogg"
        elif "aac" in mime_type:
            gemini_mime = "audio/aac"
        else:
            gemini_mime = "audio/webm"

        audio_part = {"mime_type": gemini_mime, "data": audio_bytes}

        prompt = (
            f"Transcribe this audio. Context: This is a formal debate argument about: {topic}. "
            "Also detect the spoken language. "
            "Respond in this exact format:\n"
            "LANG: <iso-639-1 code>\n"
            "TEXT: <transcribed text>"
            if topic
            else "Transcribe this audio. Also detect the spoken language. "
                 "Respond in this exact format:\n"
                 "LANG: <iso-639-1 code>\n"
                 "TEXT: <transcribed text>"
        )

        response = await model.generate_content_async([prompt, audio_part])
        raw_text = response.text.strip()

        # Parse LANG: and TEXT: from response
        detected_lang = "en"
        text = raw_text
        raw_upper = raw_text.upper()
        if "LANG:" in raw_upper or "TEXT:" in raw_upper:
            import re as _re
            lang_match = _re.search(r'LANG:\s*([a-zA-Z]{2,3})', raw_text, _re.IGNORECASE)
            text_match = _re.search(r'TEXT:\s*(.+)', raw_text, _re.IGNORECASE | _re.DOTALL)
            if lang_match:
                detected_lang = lang_match.group(1).lower()
            if text_match:
                text = text_match.group(1).strip()
            else:
                if lang_match:
                    text = raw_text.replace(lang_match.group(0), "").strip()
        else:
            detected_lang = detect_lang_from_text(raw_text)

        # Secondary verification: if detected_lang is 'en' but text contains non-Latin characters
        text_detected = detect_lang_from_text(text)
        if text_detected != 'en':
            detected_lang = text_detected

        # Clean filler words
        text = re.sub(
            r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

        elapsed = round((time.time() - start) * 1000)
        words = len(text.split())
        logging.info(f"[GEMINI-TRANSCRIPTION] {words} words transcribed in {elapsed}ms | lang={detected_lang}")

        return {
            "text": text,
            "language": detected_lang,
            "duration_ms": elapsed,
            "word_count": words,
            "success": True,
        }

    except Exception as e:
        logging.error(f"[GEMINI-TRANSCRIPTION] Error: {e}")
        return {
            "text": "",
            "language": "en",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": str(e),
        }


async def _transcribe_openai_whisper(audio_bytes: bytes, topic: str = "", mime_type: str = "audio/webm") -> dict:
    """Transcribe using OpenAI Whisper API as a fallback."""
    start = time.time()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return {
            "text": "",
            "language": "en",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": "No OpenAI API key configured",
        }

    try:
        import httpx

        # Determine clean extension
        ext = "webm"
        clean_mime = mime_type.lower()
        if "mp4" in clean_mime or "m4a" in clean_mime:
            ext = "mp4"
        elif "wav" in clean_mime:
            ext = "wav"
        elif "mpeg" in clean_mime or "mp3" in clean_mime:
            ext = "mp3"
        elif "ogg" in clean_mime:
            ext = "ogg"
        elif "aac" in clean_mime:
            ext = "aac"

        files = {
            "file": (f"audio.{ext}", audio_bytes, mime_type)
        }
        data = {
            "model": "whisper-1",
            "response_format": "verbose_json",
        }
        if topic:
            data["prompt"] = f"Formal debate about: {topic}"

        headers = {
            "Authorization": f"Bearer {api_key}"
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers=headers,
                data=data,
                files=files,
                timeout=30.0
            )

        if response.status_code != 200:
            logging.error(f"[OPENAI-TRANSCRIPTION] API error: {response.text}")
            return {
                "text": "",
                "language": "en",
                "duration_ms": 0,
                "word_count": 0,
                "success": False,
                "error": f"OpenAI API error: {response.text}",
            }

        res_json = response.json()
        text = res_json.get("text", "").strip()

        # Extract language from verbose_json response
        detected_lang = res_json.get("language", "en").lower()
        # Normalize language code to ISO 639-1 if full name returned
        if len(detected_lang) > 2:
            mapping = {
                "english": "en", "spanish": "es", "french": "fr", "german": "de",
                "italian": "it", "portuguese": "pt", "chinese": "zh", "japanese": "ja",
                "korean": "ko", "russian": "ru", "hindi": "hi", "telugu": "te"
            }
            detected_lang = mapping.get(detected_lang, "en")

        # Secondary verification: if detected_lang is 'en' but text contains non-Latin characters
        text_detected = detect_lang_from_text(text)
        if text_detected != 'en':
            detected_lang = text_detected

        # Clean filler words
        text = re.sub(
            r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

        elapsed = round((time.time() - start) * 1000)
        words = len(text.split())
        logging.info(f"[OPENAI-TRANSCRIPTION] {words} words transcribed in {elapsed}ms | lang={detected_lang}")

        return {
            "text": text,
            "language": detected_lang,
            "duration_ms": elapsed,
            "word_count": words,
            "success": True,
        }
    except Exception as e:
        logging.error(f"[OPENAI-TRANSCRIPTION] Exception: {e}")
        return {
            "text": "",
            "language": "en",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": str(e),
        }


async def transcribe_audio(audio_bytes: bytes, topic: str = "", mime_type: str = "audio/webm") -> dict:
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
        return await _transcribe_local(audio_bytes, topic, mime_type)
    else:
        res = await _transcribe_gemini(audio_bytes, topic, mime_type)
        if not res.get("success"):
            logging.warning("[TRANSCRIPTION] Gemini failed, falling back to OpenAI Whisper API")
            openai_res = await _transcribe_openai_whisper(audio_bytes, topic, mime_type)
            if openai_res.get("success"):
                return openai_res
        return res
