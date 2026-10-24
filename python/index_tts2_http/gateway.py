"""公開版 gateway：把 web 前端、TTS、Ollama 收成同一個來源。

只綁 127.0.0.1，對外一律由 Cloudflare Tunnel 進來（存取控制交給 Cloudflare Access）。
前端因此只需要相對路徑 /api/tts、/api/chat，不再有 localhost 硬編碼。
"""

from __future__ import annotations

import os
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

SCRIPT_DIR = Path(__file__).resolve().parent
WEB_DIST = Path(os.environ.get("WEB_DIST", SCRIPT_DIR.parents[1] / "apps" / "web" / "dist"))
TTS_URL = os.environ.get("TTS_URL", "http://127.0.0.1:7861/tts")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
PORT = int(os.environ.get("GATEWAY_PORT", "8080"))

app = FastAPI(title="vtuber-gateway")


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/tts")
async def tts(request: Request) -> Response:
    payload = await request.body()
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            upstream = await client.post(TTS_URL, content=payload, headers={"content-type": "application/json"})
    except httpx.HTTPError:
        return JSONResponse(status_code=502, content={"error": "tts unavailable"})
    if upstream.status_code != 200:
        return JSONResponse(status_code=502, content={"error": "tts failed"})
    return Response(content=upstream.content, media_type="audio/wav")


@app.post("/api/chat")
async def chat(request: Request) -> Response:
    payload = await request.body()

    async def relay():
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                async with client.stream("POST", OLLAMA_URL, content=payload, headers={"content-type": "application/json"}) as upstream:
                    if upstream.status_code != 200:
                        yield b'{"error":"chat failed"}'
                        return
                    async for chunk in upstream.aiter_raw():
                        yield chunk
        except httpx.HTTPError:
            yield b'{"error":"chat unavailable"}'

    return StreamingResponse(relay(), media_type="application/x-ndjson")


if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
