import io
import logging
import os
import time

import openai


async def transcribe_audio(audio_bytes: bytes, topic: str = "") -> dict:
    """
    Transcribe user's spoken debate argument using OpenAI Whisper.
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
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "debate.webm"

        client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="en",
            prompt=f"This is a formal debate argument about: {topic}" if topic else None,
            response_format="text",
            temperature=0,
        )

        text = transcript.strip()

        # Clean filler words at sentence start
        filler_pattern = r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+"
        import re

        text = re.sub(filler_pattern, "", text, flags=re.IGNORECASE).strip()

        elapsed = round((time.time() - start) * 1000)
        words = len(text.split())
        logging.info(f"[WHISPER] {words} words transcribed in {elapsed}ms")

        return {
            "text": text,
            "duration_ms": elapsed,
            "word_count": words,
            "success": True,
        }

    except Exception as e:  # pragma: no cover - external API
        logging.error(f"[WHISPER] Error: {e}")
        return {
            "text": "",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": str(e),
        }

