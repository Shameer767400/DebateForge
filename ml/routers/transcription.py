from fastapi import APIRouter, UploadFile, File, Form
from services.whisper_service import transcribe_audio

router = APIRouter(tags=["transcription"])

@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    topic: str = Form("")
):
    audio_bytes = await file.read()
    result = await transcribe_audio(audio_bytes, topic)
    return result
