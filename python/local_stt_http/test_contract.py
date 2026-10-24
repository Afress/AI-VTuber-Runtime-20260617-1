import io
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import server
from fastapi.testclient import TestClient


def pcm16_wav(sample_rate: int = 16000, samples: int = 1600) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\x00\x00" * samples)
    return buffer.getvalue()


class LocalSttContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = {**server.DEFAULT_CONFIG, "maximum_duration_ms": 1000, "maximum_audio_bytes": 4096}
        self.client = TestClient(server.app)
        server._model = None
        server._model_error = None
        server._model_status = "not_loaded"

    def test_valid_synthetic_wav_is_accepted_without_model_load(self) -> None:
        sample_rate, duration_ms = server.validate_wav(pcm16_wav(), self.config)
        self.assertEqual(sample_rate, 16000)
        self.assertEqual(duration_ms, 100)

    def test_empty_and_oversized_wav_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            server.validate_wav(b"", self.config)
        with self.assertRaises(ValueError):
            server.validate_wav(b"x" * 5000, self.config)

    def test_non_wav_data_is_rejected(self) -> None:
        with self.assertRaises((ValueError, wave.Error, EOFError)):
            server.validate_wav(b"not-a-wav", self.config)

    def test_health_reports_running_and_not_loaded_without_model_download(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["service_status"], "running")
        self.assertEqual(payload["status"], "not_loaded")
        self.assertFalse(payload["model_loaded"])

    def test_cors_allows_packaged_electron_health_and_vite_development(self) -> None:
        electron = self.client.get("/health", headers={"Origin": "app://runtime"})
        self.assertEqual(electron.status_code, 200)
        self.assertEqual(electron.headers.get("access-control-allow-origin"), "app://runtime")
        self.assertEqual(electron.json()["service_status"], "running")

        vite = self.client.get("/health", headers={"Origin": "http://localhost:5173"})
        self.assertEqual(vite.status_code, 200)
        self.assertEqual(vite.headers.get("access-control-allow-origin"), "http://localhost:5173")

        remote = self.client.get("/health", headers={"Origin": "https://evil.example"})
        self.assertEqual(remote.status_code, 200)
        self.assertNotEqual(remote.headers.get("access-control-allow-origin"), "https://evil.example")

    def test_cors_allows_electron_transcribe_preflight_and_response_without_model_load(self) -> None:
        origin = "app://runtime"
        preflight = self.client.options(
            "/transcribe",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers.get("access-control-allow-origin"), origin)
        self.assertIn("POST", preflight.headers.get("access-control-allow-methods", ""))

        fake_model = SimpleNamespace(
            transcribe=lambda *_args, **_kwargs: (
                [SimpleNamespace(start=0.0, end=0.1, text="test")],
                SimpleNamespace(language="en"),
            )
        )
        with patch.object(server, "get_model", return_value=fake_model):
            response = self.client.post(
                "/transcribe",
                headers={"Origin": origin},
                files={"audio": ("valid.wav", pcm16_wav(), "audio/wav")},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
        self.assertEqual(response.json()["text"], "test")

    def test_upload_contract_rejects_invalid_empty_and_oversized_audio(self) -> None:
        invalid_type = self.client.post("/transcribe", files={"audio": ("sample.txt", b"x", "text/plain")})
        self.assertEqual(invalid_type.status_code, 400)
        self.assertEqual(invalid_type.json()["error"]["code"], "UNSUPPORTED_AUDIO")
        empty = self.client.post("/transcribe", files={"audio": ("empty.wav", b"", "audio/wav")})
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(empty.json()["error"]["code"], "INVALID_AUDIO")
        with patch.object(server, "load_config", return_value={**self.config, "maximum_audio_bytes": 10}):
            oversized = self.client.post("/transcribe", files={"audio": ("large.wav", pcm16_wav(), "audio/wav")})
        self.assertEqual(oversized.status_code, 400)
        self.assertEqual(oversized.json()["error"]["code"], "INVALID_AUDIO")

    def test_model_unavailable_uses_json_error_and_cleans_temp_file(self) -> None:
        before = set(Path(tempfile.gettempdir()).glob("local-stt-*.wav"))
        with patch.object(server, "get_model", side_effect=RuntimeError("model unavailable")):
            response = self.client.post("/transcribe", files={"audio": ("valid.wav", pcm16_wav(), "audio/wav")})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "MODEL_NOT_READY")
        after = set(Path(tempfile.gettempdir()).glob("local-stt-*.wav"))
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
