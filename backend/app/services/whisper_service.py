import logging
import threading
from typing import Optional
import torch
import whisper
from app.core.config import settings

logger = logging.getLogger(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_model_lock = threading.Lock()
_model: Optional[whisper.Whisper] = None

def get_whisper_model() -> whisper.Whisper:
    global _model
    with _model_lock:
        if _model is None:
            model_name = settings.WHISPER_MODEL or "base"
            logger.info(f"Loading Whisper model '{model_name}' on device '{DEVICE}'...")
            _model = whisper.load_model(model_name, device=DEVICE)
            logger.info("Whisper model loaded successfully.")
    return _model

def warm_whisper():
    try:
        get_whisper_model()
        logger.info(f"Whisper model warmed up on device: {DEVICE}")
    except Exception as e:
        logger.warning(f"Failed to warm up Whisper: {e}")

def transcribe_audio(file_path: str) -> str:
    model = get_whisper_model()
    use_fp16 = (DEVICE == "cuda")
    with _model_lock:
        result = model.transcribe(file_path, fp16=use_fp16)
    return result.get("text", "").strip()
