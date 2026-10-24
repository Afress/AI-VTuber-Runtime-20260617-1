from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import wave
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "config.json"
CONFIG_EXAMPLE_PATH = SCRIPT_DIR / "config.example.json"
DEFAULT_CONFIG: dict[str, Any] = {
    "host": "127.0.0.1",
    "port": 7890,
    "model": "small",
    "device": "cuda",
    "compute_type": "float16",
    "language": "auto",
    "maximum_audio_bytes": 8 * 1024 * 1024,
    "maximum_duration_ms": 35_000,
    "maximum_concurrent_requests": 1,
}

ALLOWED_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "app://runtime",
]
ALLOWED_CORS_METHODS = ["GET", "POST", "OPTIONS"]
ALLOWED_CORS_HEADERS = ["Content-Type"]

app = FastAPI(title="Local STT HTTP Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=ALLOWED_CORS_METHODS,
    allow_headers=ALLOWED_CORS_HEADERS,
)
_model: Any | None = None
_model_error: str | None = None
_model_status = "not_loaded"
_model_lock = threading.Lock()
_request_lock = threading.BoundedSemaphore(1)


def load_config() -> dict[str, Any]:
    path = CONFIG_PATH if CONFIG_PATH.exists() else CONFIG_EXAMPLE_PATH
    try:
        content = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except (OSError, json.JSONDecodeError) as error:
        print(f"Config warning: {error}")
        content = {}
    return {**DEFAULT_CONFIG, **content}


def error_response(code: str, message: str, retryable: bool, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message, "retryable": retryable}})


def get_model(config: dict[str, Any]) -> Any:
    global _model, _model_error, _model_status
    with _model_lock:
        if _model is not None:
            return _model
        try:
            _model_status = "loading"
            from faster_whisper import WhisperModel

            _model = WhisperModel(str(config["model"]), device=str(config["device"]), compute_type=str(config["compute_type"]))
            _model_error = None
            _model_status = "loaded"
            return _model
        except Exception as error:  # no model download or startup crash
            _model_error = str(error)
            _model_status = "unavailable"
            raise RuntimeError(f"Failed to load faster-whisper model: {_model_error}") from error


def validate_wav(payload: bytes, config: dict[str, Any]) -> tuple[int, int]:
    if not payload:
        raise ValueError("Audio file is empty")
    if len(payload) > int(config["maximum_audio_bytes"]):
        raise ValueError("Audio file exceeds maximum_audio_bytes")
    with tempfile.NamedTemporaryFile(prefix="local-stt-", suffix=".wav", delete=False) as temporary:
        temporary.write(payload)
        temporary_path = temporary.name
    try:
        with wave.open(temporary_path, "rb") as wav:
            if wav.getcomptype() != "NONE" or wav.getsampwidth() != 2 or wav.getnchannels() != 1:
                raise ValueError("Audio must be mono PCM16 WAV")
            duration_ms = round(wav.getnframes() / wav.getframerate() * 1000)
            if duration_ms <= 0 or duration_ms > int(config["maximum_duration_ms"]):
                raise ValueError("Audio duration is outside the accepted range")
            return wav.getframerate(), duration_ms
    except wave.Error as error:
        raise ValueError("Audio must be a valid WAV file") from error
    finally:
        Path(temporary_path).unlink(missing_ok=True)


@app.get("/health")
def health() -> JSONResponse:
    config = load_config()
    return JSONResponse(content={"status": _model_status, "service_status": "running", "model": config["model"], "device": config["device"], "compute_type": config["compute_type"], "model_configured": True, "model_loaded": _model is not None, "version": "v1", "error": _model_error})


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str | None = Form(default=None),
    prompt: str | None = Form(default=None),
    task: str = Form(default="transcribe"),
    segment_id: str = Form(default=""),
    request_id: str = Form(default=""),
) -> JSONResponse:
    config = load_config()
    if task != "transcribe":
        return error_response("UNSUPPORTED_TASK", "Only task=transcribe is supported", False, 400)
    if audio.content_type not in {"audio/wav", "audio/x-wav", "application/octet-stream"}:
        return error_response("UNSUPPORTED_AUDIO", "audio must be a WAV upload", False, 400)
    payload = await audio.read()
    try:
        _sample_rate, duration_ms = validate_wav(payload, config)
    except ValueError as error:
        return error_response("INVALID_AUDIO", str(error), False, 400)
    if not _request_lock.acquire(blocking=False):
        return error_response("SERVICE_BUSY", "Another transcription is already running", True, 429)
    temporary_path: str | None = None
    started_at = time.perf_counter()
    try:
        with tempfile.NamedTemporaryFile(prefix="local-stt-", suffix=".wav", delete=False) as temporary:
            temporary.write(payload)
            temporary_path = temporary.name
        model = get_model(config)
        selected_language = language if language and language != "auto" else (None if config.get("language") == "auto" else config.get("language"))
        segments, info = model.transcribe(temporary_path, language=selected_language, initial_prompt=prompt or None, task="transcribe")
        transcript_segments = [{"start_ms": round(item.start * 1000), "end_ms": round(item.end * 1000), "text": item.text.strip()} for item in segments if item.text.strip()]
        text = " ".join(item["text"] for item in transcript_segments).strip()
        processing_time_ms = round((time.perf_counter() - started_at) * 1000)
        return JSONResponse(content={"text": text, "language": getattr(info, "language", selected_language), "duration_ms": duration_ms, "processing_time_ms": processing_time_ms, "segments": transcript_segments, "request_id": request_id, "segment_id": segment_id})
    except RuntimeError as error:
        return error_response("MODEL_NOT_READY", str(error), True, 503)
    except Exception as error:
        print(f"STT transcription failed: {type(error).__name__}: {error}")
        return error_response("TRANSCRIPTION_FAILED", str(error), True, 500)
    finally:
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)
        _request_lock.release()


if __name__ == "__main__":
    settings = load_config()
    print(f"Starting Local STT HTTP service: http://{settings['host']}:{settings['port']}")
    print(f"Model: {settings['model']}; device: {settings['device']}; compute_type: {settings['compute_type']}")
    uvicorn.run(app, host=str(settings["host"]), port=int(settings["port"]))
