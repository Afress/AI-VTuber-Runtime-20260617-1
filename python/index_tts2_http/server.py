from __future__ import annotations

import io
import json
import math
import struct
import tempfile
import threading
import traceback
import wave
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field


DEFAULT_CONFIG = {
    "mode": "mock",
    "host": "127.0.0.1",
    "port": 7861,
    "indextts2_repo_dir": "",
    "model_dir": "",
    "reference_audio": "",
    "reference_text": "",
    "output_sample_rate": 24_000,
    "device": "cuda",
    "use_fp16": False,
    "use_cuda_kernel": False,
    "use_deepspeed": False,
    "prewarm_on_startup": False,
    "prewarm_text": "你好。",
    "prewarm_output_path": "",
    "postprocess_audio": True,
    "audio_pre_roll_ms": 120,
    "audio_normalize_peak": True,
    "audio_target_peak": 0.95,
    "audio_head_boost_ms": 300,
    "audio_head_boost_gain": 1.35,
    "text_normalization": True,
    "traditional_to_simplified": True,
}

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "config.json"
CONFIG_EXAMPLE_PATH = SCRIPT_DIR / "config.example.json"
_tts_instance: Any | None = None
_tts_signature: tuple[str, str, bool, bool, bool] | None = None
_tts_lock = threading.Lock()
_infer_lock = threading.Lock()
_opencc: Any | None = None
_opencc_unavailable = False
_opencc_lock = threading.Lock()


class TTSRequest(BaseModel):
    text: str = Field(default="", max_length=300)
    voice: str | None = None
    language: str | None = None
    speed: float | None = None
    emotion: str | None = None
    referenceAudioUrl: str | None = None
    extra: dict[str, Any] | None = None


app = FastAPI(title="IndexTTS2 HTTP Wrapper")

# 公開版由 gateway 同源代理，瀏覽器不再跨來源呼叫，因此不開 CORS。


@app.on_event("startup")
def log_startup_config() -> None:
    config_path = resolve_config_path()
    config = load_config()

    print(f"Using config: {config_path}")
    print(f"Config mode: {config.get('mode', 'mock')}")
    print(f"indextts2_repo_dir: {config.get('indextts2_repo_dir', '')}")
    print(f"model_dir: {config.get('model_dir', '')}")
    print(f"reference_audio: {config.get('reference_audio', '')}")
    print(f"use_fp16: {bool(config.get('use_fp16', False))}")
    print(f"use_cuda_kernel: {bool(config.get('use_cuda_kernel', False))}")
    print(f"use_deepspeed: {bool(config.get('use_deepspeed', False))}")
    print(f"prewarm_on_startup: {bool(config.get('prewarm_on_startup', False))}")
    print(f"prewarm_text: {config.get('prewarm_text', '你好。')}")
    print(f"text_normalization: {bool(config.get('text_normalization', True))}")
    print(f"traditional_to_simplified: {bool(config.get('traditional_to_simplified', True))}")

    if (
        str(config.get("mode", "mock")).lower() == "indextts2"
        and bool(config.get("prewarm_on_startup", False))
    ):
        print("Prewarm enabled")
        thread = threading.Thread(target=run_indextts2_prewarm, args=(config,), daemon=True)
        thread.start()


@app.post("/tts", response_model=None)
def synthesize(request: TTSRequest):
    config: dict[str, Any] = {}
    mode = "unknown"

    try:
        config = load_config()
        mode = str(config.get("mode", "mock")).lower()

        if mode == "mock":
            wav_bytes = synthesize_mock(request, config)
        elif mode == "indextts2":
            wav_bytes = synthesize_with_indextts2(request, config)
        else:
            raise TTSWrapperError(f"Unsupported mode: {mode}. Use 'mock' or 'indextts2'.")

        duration_ms = estimate_duration_ms(request.text)
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-Provider-Name": "indextts2-http-wrapper",
                "X-TTS-Mode": mode,
                "X-Duration-Ms": str(duration_ms),
            },
        )
    except Exception as error:
        print("IndexTTS2 /tts failed:")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "internal error"},
        )


def load_config() -> dict[str, Any]:
    config_path = resolve_config_path()
    if config_path is None:
        return dict(DEFAULT_CONFIG)

    try:
        with config_path.open("r", encoding="utf-8") as file:
            loaded = json.load(file)
    except json.JSONDecodeError as error:
        raise TTSWrapperError(f"Invalid config JSON at {config_path}: {error}") from error

    return {**DEFAULT_CONFIG, **loaded}


def resolve_config_path() -> Path | None:
    if CONFIG_PATH.exists():
        return CONFIG_PATH

    if CONFIG_EXAMPLE_PATH.exists():
        return CONFIG_EXAMPLE_PATH

    return None


def synthesize_mock(request: TTSRequest, config: dict[str, Any]) -> bytes:
    sample_rate = int(config.get("output_sample_rate", 24_000))
    duration_ms = estimate_duration_ms(request.text)
    return create_speech_like_wav(request.text, duration_ms, sample_rate)


def run_indextts2_prewarm(config: dict[str, Any]) -> None:
    try:
        print("Starting IndexTTS2 prewarm...")
        prewarm_text = str(config.get("prewarm_text", "你好。")).strip() or "你好。"
        configured_output_path = str(config.get("prewarm_output_path", "")).strip()
        prewarm_output_path = (
            Path(configured_output_path)
            if configured_output_path
            else Path(tempfile.gettempdir()) / "index_tts2_http_prewarm.wav"
        )
        print(f"Prewarm output path: {prewarm_output_path}")
        synthesize_with_indextts2(
            TTSRequest(text=prewarm_text),
            config,
            label="prewarm",
            output_path=prewarm_output_path,
        )
        print("Prewarm completed.")
    except Exception:
        print("Prewarm failed:")
        print("Warning: IndexTTS2 prewarm failed; server will continue running.")
        traceback.print_exc()


def synthesize_with_indextts2(
    request: TTSRequest,
    config: dict[str, Any],
    label: str = "request",
    output_path: Path | None = None,
) -> bytes:
    runtime = prepare_indextts2_runtime(config)
    repo_dir = runtime["repo_dir"]
    model_dir = runtime["model_dir"]
    cfg_path = runtime["cfg_path"]
    reference_audio = runtime["reference_audio"]
    use_fp16 = runtime["use_fp16"]
    use_cuda_kernel = runtime["use_cuda_kernel"]
    use_deepspeed = runtime["use_deepspeed"]

    output_path = output_path or Path(tempfile.gettempdir()) / f"index_tts2_http_{label}.wav"

    print("IndexTTS2 /tts request:")
    print(f"request text length: {len(request.text)}")
    print(f"cfg_path: {cfg_path}")
    print(f"model_dir: {model_dir}")
    print(f"reference_audio: {reference_audio}")
    print(f"output temp wav path: {output_path}")
    print(f"use_fp16: {use_fp16}")
    print(f"use_cuda_kernel: {use_cuda_kernel}")
    print(f"use_deepspeed: {use_deepspeed}")
    normalized_text = normalize_tts_text(request.text, config)
    print(f"normalized text length: {len(normalized_text)}")
    log_audio_postprocess_config(config)

    _tts = get_indextts2_model(runtime)

    try:
        print("Starting IndexTTS2 inference...")
        with _infer_lock:
            _tts.infer(
                spk_audio_prompt=str(reference_audio),
                text=normalized_text,
                output_path=str(output_path),
                verbose=True,
            )
    except Exception as error:
        raise TTSWrapperError(f"IndexTTS2 inference failed: {error}") from error

    if not output_path.exists():
        raise TTSWrapperError(f"IndexTTS2 inference failed: output wav was not created: {output_path}")

    wav_bytes = output_path.read_bytes()
    if bool(config.get("postprocess_audio", True)):
        return postprocess_wav_audio(wav_bytes, config)

    return wav_bytes


def prepare_indextts2_runtime(config: dict[str, Any]) -> dict[str, Any]:
    repo_dir = str(config.get("indextts2_repo_dir", "")).strip()
    model_dir_value = str(config.get("model_dir", "")).strip()
    reference_audio_value = str(config.get("reference_audio", "")).strip()

    if not repo_dir:
        raise TTSWrapperError(
            "IndexTTS2 mode requires config.indextts2_repo_dir. Install IndexTTS2 separately, "
            "copy config.example.json to config.json, and set indextts2_repo_dir."
        )

    if not Path(repo_dir).exists():
        raise TTSWrapperError(f"IndexTTS2 repo_dir does not exist: {repo_dir}")

    if not model_dir_value:
        raise TTSWrapperError(
            "IndexTTS2 mode requires config.model_dir. Copy config.example.json to "
            "config.json and set model_dir."
        )

    model_dir = Path(model_dir_value)
    cfg_path = model_dir / "config.yaml"

    if not model_dir.exists():
        raise TTSWrapperError(f"IndexTTS2 model_dir does not exist: {model_dir}")

    if not cfg_path.exists():
        raise TTSWrapperError(f"IndexTTS2 cfg_path does not exist: {cfg_path}")

    if not reference_audio_value:
        raise TTSWrapperError(
            "IndexTTS2 mode requires config.reference_audio. Set a local reference WAV path "
            "after verifying official IndexTTS2 inference independently."
        )

    reference_audio = Path(reference_audio_value)

    if not Path(reference_audio).exists():
        raise TTSWrapperError(f"IndexTTS2 reference_audio does not exist: {reference_audio}")

    return {
        "repo_dir": repo_dir,
        "model_dir": model_dir,
        "cfg_path": cfg_path,
        "reference_audio": reference_audio,
        "use_fp16": bool(config.get("use_fp16", False)),
        "use_cuda_kernel": bool(config.get("use_cuda_kernel", False)),
        "use_deepspeed": bool(config.get("use_deepspeed", False)),
    }


def log_audio_postprocess_config(config: dict[str, Any]) -> None:
    print(f"postprocess_audio: {bool(config.get('postprocess_audio', True))}")
    print(f"audio_pre_roll_ms: {int(config.get('audio_pre_roll_ms', 120))}")
    print(f"audio_normalize_peak: {bool(config.get('audio_normalize_peak', True))}")
    print(f"audio_target_peak: {float(config.get('audio_target_peak', 0.95))}")
    print(f"audio_head_boost_ms: {int(config.get('audio_head_boost_ms', 300))}")
    print(f"audio_head_boost_gain: {float(config.get('audio_head_boost_gain', 1.35))}")


def normalize_tts_text(text: str, config: dict[str, Any]) -> str:
    text_normalization = bool(config.get("text_normalization", True))
    traditional_to_simplified = bool(config.get("traditional_to_simplified", True))
    print(f"text_normalization: {text_normalization}")
    print(f"traditional_to_simplified: {traditional_to_simplified}")

    if not text_normalization:
        return text

    normalized_text = text
    if traditional_to_simplified:
        converter = get_opencc_converter()
        if converter is not None:
            normalized_text = converter.convert(normalized_text)

    if not normalized_text.strip():
        return text

    return normalized_text


def get_opencc_converter() -> Any | None:
    global _opencc, _opencc_unavailable

    with _opencc_lock:
        if _opencc is not None:
            return _opencc

        if _opencc_unavailable:
            return None

        try:
            from opencc import OpenCC  # type: ignore[import-not-found]

            _opencc = OpenCC("t2s")
            return _opencc
        except ImportError:
            _opencc_unavailable = True
            print("OpenCC is not installed; traditional_to_simplified normalization is disabled.")
            return None


def postprocess_wav_audio(wav_bytes: bytes, config: dict[str, Any]) -> bytes:
    try:
        import numpy as np
    except ImportError as error:
        raise TTSWrapperError(
            "postprocess_audio requires numpy. Install requirements.txt or set postprocess_audio=false."
        ) from error

    with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        sample_rate = wav.getframerate()
        frame_count = wav.getnframes()
        compression_type = wav.getcomptype()
        frames = wav.readframes(frame_count)

    if compression_type != "NONE":
        raise TTSWrapperError(f"postprocess_audio only supports PCM WAV, got compression={compression_type}")

    if sample_width != 2:
        raise TTSWrapperError(f"postprocess_audio only supports 16-bit PCM WAV, got sample_width={sample_width}")

    if channels < 1:
        raise TTSWrapperError(f"postprocess_audio invalid channel count: {channels}")

    samples = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels)
    else:
        samples = samples.reshape(-1, 1)

    pre_roll_ms = max(0, int(config.get("audio_pre_roll_ms", 120)))
    pre_roll_frames = int(sample_rate * pre_roll_ms / 1000)
    if pre_roll_frames > 0:
        silence = np.zeros((pre_roll_frames, channels), dtype=np.float32)
        samples = np.concatenate([silence, samples], axis=0)

    head_boost_ms = max(0, int(config.get("audio_head_boost_ms", 300)))
    head_boost_gain = max(0.0, float(config.get("audio_head_boost_gain", 1.35)))
    head_boost_frames = min(int(sample_rate * head_boost_ms / 1000), samples.shape[0] - pre_roll_frames)
    if head_boost_frames > 0 and head_boost_gain != 1.0:
        start = pre_roll_frames
        end = pre_roll_frames + head_boost_frames
        samples[start:end] *= head_boost_gain

    samples = np.clip(samples, -1.0, 1.0)

    if bool(config.get("audio_normalize_peak", True)):
        target_peak = min(max(float(config.get("audio_target_peak", 0.95)), 0.01), 1.0)
        current_peak = float(np.max(np.abs(samples))) if samples.size else 0.0
        if current_peak > 0:
            normalize_gain = min(target_peak / current_peak, 1.0 / current_peak)
            samples *= normalize_gain

    samples = np.clip(samples, -1.0, 1.0)
    int_samples = (samples * 32767.0).astype("<i2")

    output_buffer = io.BytesIO()
    with wave.open(output_buffer, "wb") as output_wav:
        output_wav.setnchannels(channels)
        output_wav.setsampwidth(sample_width)
        output_wav.setframerate(sample_rate)
        output_wav.writeframes(int_samples.reshape(-1).tobytes())

    return output_buffer.getvalue()


def get_indextts2_model(runtime: dict[str, Any]) -> Any:
    global _tts_instance, _tts_signature

    repo_dir = runtime["repo_dir"]
    model_dir = runtime["model_dir"]
    cfg_path = runtime["cfg_path"]
    use_fp16 = runtime["use_fp16"]
    use_cuda_kernel = runtime["use_cuda_kernel"]
    use_deepspeed = runtime["use_deepspeed"]
    signature = (
        str(cfg_path),
        str(model_dir),
        use_fp16,
        use_cuda_kernel,
        use_deepspeed,
    )

    with _tts_lock:
        if _tts_instance is not None and _tts_signature == signature:
            print("Reusing initialized IndexTTS2 model.")
            return _tts_instance

        print("Starting IndexTTS2 model initialization...")
        _tts_instance = initialize_indextts2_model(
            repo_dir=repo_dir,
            cfg_path=cfg_path,
            model_dir=model_dir,
            use_fp16=use_fp16,
            use_cuda_kernel=use_cuda_kernel,
            use_deepspeed=use_deepspeed,
        )
        _tts_signature = signature
        print("IndexTTS2 model initialization succeeded.")
        return _tts_instance


def initialize_indextts2_model(
    repo_dir: str,
    cfg_path: Path,
    model_dir: Path,
    use_fp16: bool,
    use_cuda_kernel: bool,
    use_deepspeed: bool,
) -> Any:
    import sys

    if repo_dir not in sys.path:
        sys.path.insert(0, repo_dir)

    try:
        print("Importing IndexTTS2...")
        from indextts.infer_v2 import IndexTTS2  # type: ignore[import-not-found]
        print("Successfully imported IndexTTS2.")
    except ImportError as error:
        raise TTSWrapperError(
            "Failed to import indextts.infer_v2.IndexTTS2. Install the IndexTTS2 repository "
            "and its model dependencies in this Python environment."
        ) from error

    try:
        return IndexTTS2(
            cfg_path=str(cfg_path),
            model_dir=str(model_dir),
            use_fp16=use_fp16,
            use_cuda_kernel=use_cuda_kernel,
            use_deepspeed=use_deepspeed,
        )
    except Exception as error:
        raise TTSWrapperError(f"Failed to initialize IndexTTS2: {error}") from error


def estimate_duration_ms(text: str) -> int:
    duration_ms = 600 + (len(text.strip()) / 8) * 1000
    return int(clamp(duration_ms, 800, 12_000))


def create_speech_like_wav(text: str, duration_ms: int, sample_rate: int) -> bytes:
    sample_count = max(1, int(sample_rate * duration_ms / 1000))
    seed = hash(text) & 0xFFFFFFFF
    phase = 0.0

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)

        for index in range(sample_count):
            time_s = index / sample_rate
            progress = index / sample_count
            envelope = speech_like_envelope(time_s, progress, seed)
            frequency = 220 + math.sin(time_s * 7.1) * 32 + math.sin(time_s * 2.7) * 14
            phase += 2 * math.pi * frequency / sample_rate

            tone = math.sin(phase) * 0.42
            harmonic = math.sin(phase * 2 + 0.4) * 0.12
            breath_noise = deterministic_noise(index + seed) * 0.015
            sample = clamp((tone + harmonic + breath_noise) * envelope, -1, 1)
            wav.writeframes(struct.pack("<h", int(sample * 32767)))

    return buffer.getvalue()


def speech_like_envelope(time_s: float, progress: float, seed: int) -> float:
    seed_phase = (seed % 997) / 997
    syllable_duration = 0.16 + (0.5 + math.sin(seed_phase * math.pi * 2) * 0.5) * 0.06
    phrase_duration = 1.2 + (0.5 + math.cos(seed_phase * math.pi * 2) * 0.5) * 0.35
    syllable_position = (time_s % syllable_duration) / syllable_duration
    phrase_position = (time_s % phrase_duration) / phrase_duration

    if phrase_position > 0.82:
        return 0.0

    attack = smoothstep(0, 0.18, syllable_position)
    decay = 1 - smoothstep(0.35, 1, syllable_position)
    syllable_shape = attack * decay
    syllable_index = math.floor(time_s / syllable_duration)
    syllable_variation = 0.5 + math.sin(syllable_index * 1.7) * 0.35
    phrase_shape = 0.15 + 0.7 * smoothstep(0, 0.2, phrase_position)
    ending_fade = 1 - smoothstep(0.82, 1, progress)
    amplitude = 0.15 + syllable_shape * syllable_variation * phrase_shape * 0.7

    return clamp(amplitude * ending_fade, 0, 0.85)


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0

    x = clamp((value - edge0) / (edge1 - edge0), 0, 1)
    return x * x * (3 - 2 * x)


def deterministic_noise(index: int) -> float:
    value = math.sin(index * 12.9898) * 43758.5453
    return (value - math.floor(value)) * 2 - 1


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


class TTSWrapperError(Exception):
    pass


if __name__ == "__main__":
    server_config = load_config()
    uvicorn.run(
        app,
        host=str(server_config.get("host", "127.0.0.1")),
        port=int(server_config.get("port", 7861)),
    )
