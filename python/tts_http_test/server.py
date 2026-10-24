from __future__ import annotations

import io
import math
import struct
import wave
from typing import Any

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field


SAMPLE_RATE = 24_000


class TTSRequest(BaseModel):
    text: str = Field(default="")
    voice: str | None = None
    language: str | None = None
    speed: float | None = None
    emotion: str | None = None
    referenceAudioUrl: str | None = None
    extra: dict[str, Any] | None = None


app = FastAPI(title="Minimal HTTP TTS Test Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/tts")
def synthesize(request: TTSRequest) -> Response:
    duration_ms = estimate_duration_ms(request.text)
    wav_bytes = create_speech_like_wav(request.text, duration_ms)

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "X-Provider-Name": "minimal-http-tts-test",
            "X-Duration-Ms": str(duration_ms),
        },
    )


def estimate_duration_ms(text: str) -> int:
    duration_ms = 600 + (len(text.strip()) / 8) * 1000
    return int(clamp(duration_ms, 800, 12_000))


def create_speech_like_wav(text: str, duration_ms: int) -> bytes:
    sample_count = max(1, int(SAMPLE_RATE * duration_ms / 1000))
    seed = hash(text) & 0xFFFFFFFF
    phase = 0.0

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)

        for index in range(sample_count):
            time_s = index / SAMPLE_RATE
            progress = index / sample_count
            envelope = speech_like_envelope(time_s, progress, seed)
            frequency = 220 + math.sin(time_s * 7.1) * 32 + math.sin(time_s * 2.7) * 14
            phase += 2 * math.pi * frequency / SAMPLE_RATE

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


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=7860)
