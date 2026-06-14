"""
Transcription router — Speech-to-text endpoints for DebateForge.

Provides Whisper AI and Gemini-based audio transcription with:
  - Automatic language detection for 30+ languages
  - Filler word removal (um, uh, like, you know)
  - Debate-context-aware transcription prompting
  - Dual-mode operation: local Whisper or Gemini API

Endpoints:
  POST /transcription/transcribe — Transcribe audio file to text
  POST /transcription/detect-language — Detect spoken language from audio
  GET  /transcription/status — Transcription service health check
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from services.whisper_service import transcribe_audio
import os
import logging

router = APIRouter(tags=["transcription"])

# Transcription mode
STT_MODE = "local-whisper" if os.getenv("USE_LOCAL_STT", "false").lower() == "true" else "gemini-api"


@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(..., description="Audio file (webm, wav, mp3, m4a)"),
    topic: str = Form("", description="Debate topic for context-aware transcription"),
):
    """
    Transcribe a spoken debate argument to text.

    Accepts audio in webm, wav, mp3, or m4a format.
    Returns transcribed text with detected language and timing metadata.

    Uses local Whisper model (when USE_LOCAL_STT=true) or
    Google Gemini API (default) for transcription.
    """
    audio_bytes = await file.read()

    if len(audio_bytes) < 500:
        raise HTTPException(status_code=400, detail="Audio file too short or empty")

    content_type = file.content_type or "audio/webm"
    result = await transcribe_audio(audio_bytes, topic, content_type)

    if not result.get("success"):
        logging.warning(f"[TRANSCRIPTION] Failed: {result.get('error', 'unknown')}")

    return result


@router.post("/detect-language")
async def detect_language(
    file: UploadFile = File(..., description="Audio file for language detection"),
):
    """
    Detect the spoken language from an audio file.

    Returns ISO 639-1 language code (e.g., 'en', 'hi', 'te').
    Used by the frontend to auto-set the debate language.
    """
    audio_bytes = await file.read()

    if len(audio_bytes) < 500:
        raise HTTPException(status_code=400, detail="Audio file too short")

    content_type = file.content_type or "audio/webm"
    result = await transcribe_audio(audio_bytes, "", content_type)

    return {
        "language": result.get("language", "en"),
        "confidence": 1.0 if result.get("success") else 0.0,
        "success": result.get("success", False),
    }


@router.get("/status")
async def transcription_status():
    """Check transcription service health and configuration."""
    return {
        "status": "available",
        "mode": STT_MODE,
        "supported_formats": ["webm", "wav", "mp3", "m4a"],
        "features": [
            "auto-language-detection",
            "filler-word-removal",
            "context-aware-prompting",
            "multilingual-support",
        ],
    }
