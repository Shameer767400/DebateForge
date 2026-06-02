import asyncio
import logging
import os
import tempfile
from typing import AsyncIterator

# ── Toggle: local Coqui TTS vs API/Frontend ──
USE_LOCAL_TTS = os.getenv("USE_LOCAL_TTS", "false").lower() == "true"

_tts_model = None

def get_tts_model():
    """Load Coqui TTS model once (singleton)."""
    global _tts_model
    if _tts_model is None:
        from TTS.api import TTS as CoquiTTS

        logging.info("[TTS LOCAL] Loading Coqui TTS model...")
        _tts_model = CoquiTTS("tts_models/en/ljspeech/tacotron2-DDC")
        logging.info("[TTS LOCAL] Model loaded ✅")
    return _tts_model

async def synthesize_full(text: str) -> bytes:
    """
    Convert text to speech using local Coqui TTS.
    Returns full audio as bytes (WAV format).
    No API key. No cost. Runs locally.
    """
    if not text or not text.strip():
        return b""

    if not USE_LOCAL_TTS:
        return b""

    try:
        tts = get_tts_model()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        # Run in thread to avoid blocking async event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, lambda: tts.tts_to_file(text=text, file_path=tmp_path)
        )

        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()

        os.unlink(tmp_path)
        logging.info(f"[TTS LOCAL] Generated {len(audio_bytes)} bytes")
        return audio_bytes

    except Exception as e:
        logging.error(f"[TTS LOCAL] Error: {e}")
        return b""


async def stream_speech(text: str) -> AsyncIterator[bytes]:
    """
    Coqui TTS doesn't support true streaming.
    Generate full audio then yield in chunks
    to maintain a streaming interface.
    """
    if not USE_LOCAL_TTS:
        return
    audio_bytes = await synthesize_full(text)
    if not audio_bytes:
        return

    # Yield in 4096-byte chunks
    chunk_size = 4096
    for i in range(0, len(audio_bytes), chunk_size):
        yield audio_bytes[i : i + chunk_size]
        await asyncio.sleep(0)  # Allow other tasks to run
