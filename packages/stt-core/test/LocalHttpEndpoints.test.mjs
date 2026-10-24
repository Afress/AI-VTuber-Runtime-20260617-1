import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "local-http-endpoints-test-"));
const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const modulePath = join(temporaryDirectory, "stt-core.mjs");
await writeFile(
  modulePath,
  typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 },
  }).outputText,
  "utf8",
);
const { LocalHttpSpeechRecognitionProvider } = await import(pathToFileURL(modulePath).href);
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

function healthPayload() {
  return {
    status: "loaded",
    service_status: "running",
    model: "small",
    device: "cuda",
    compute_type: "float16",
    model_configured: true,
    model_loaded: true,
    version: "v1",
    error: null,
  };
}

function wav() {
  const buffer = new ArrayBuffer(48);
  const view = new DataView(buffer);
  for (const [offset, text] of [[0, "RIFF"], [8, "WAVE"]]) {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset, text.charCodeAt(index));
  }
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint16(34, 16, true);
  return buffer;
}

test("direct Local STT provider uses explicit health and transcribe URLs", async () => {
  const urls = [];
  const provider = new LocalHttpSpeechRecognitionProvider("http://127.0.0.1:7890", "test", async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(url.endsWith("/health") ? healthPayload() : { text: "ok", processing_time_ms: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  await provider.healthCheck();
  await provider.transcribe({
    requestId: "request-1",
    segmentId: "segment-1",
    audio: wav(),
    mimeType: "audio/wav",
    sampleRate: 16000,
    channelCount: 1,
    durationMs: 800,
  });

  assert.deepEqual(urls, ["http://127.0.0.1:7890/health", "http://127.0.0.1:7890/transcribe"]);
});

test("invalid JSON diagnostics include bounded request context", async () => {
  const provider = new LocalHttpSpeechRecognitionProvider("http://127.0.0.1:7890", "test", async () =>
    new Response(`<html>${"x".repeat(300)}</html>`, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }),
  );

  await assert.rejects(
    () => provider.healthCheck(),
    (error) =>
      error.code === "INVALID_RESPONSE" &&
      error.message.includes("url=http://127.0.0.1:7890/health") &&
      error.message.includes("status=200") &&
      error.message.includes("content-type=text/html") &&
      error.message.includes("body=<html>" ) &&
      error.message.length < 500,
  );
});
