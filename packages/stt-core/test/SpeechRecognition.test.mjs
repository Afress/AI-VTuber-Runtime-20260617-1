import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "stt-core-test-"));
const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const compiledModulePath = join(temporaryDirectory, "stt-core.mjs");
await writeFile(compiledModulePath, typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 } }).outputText, "utf8");
const { LocalHttpSpeechRecognitionProvider, SpeechRecognitionService, normalizeTranscript, hasPcm16WavHeader } = await import(pathToFileURL(compiledModulePath).href);
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

function wav() { const buffer = new ArrayBuffer(48); const view = new DataView(buffer); for (const [offset, text] of [[0, "RIFF"], [8, "WAVE"]]) for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint16(34, 16, true); return buffer; }
function segment(id = "segment-1", overrides = {}) { return { metadata: { segmentId: id, durationMs: 800, sampleRate: 16000, channelCount: 1, endReason: "silence", vadValidSpeech: true, truncated: false, ...overrides }, wav: wav() }; }
function response(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }
function textResponse(body, status = 500) { return new Response(body, { status, headers: { "Content-Type": "text/plain" } }); }
function controlledProvider() {
  const pending = new Map();
  return {
    pending,
    provider: {
      providerId: "controlled",
      transcribe(request, signal) {
        return new Promise((resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")), { once: true });
          pending.set(request.segmentId, { request, resolve, reject, signal });
        });
      },
    },
  };
}
function transcript(item, text) { return { requestId: item.request.requestId, segmentId: item.request.segmentId, text, processingTimeMs: 10, provider: "controlled" }; }
async function flush() { await Promise.resolve(); await Promise.resolve(); }

test("local provider sends multipart WAV and normalizes a successful response", async () => {
  let captured;
  const provider = new LocalHttpSpeechRecognitionProvider("http://127.0.0.1:7890", "test", async (_url, init) => { captured = init; return response({ text: " 你好，   世界 ", language: "zh", processing_time_ms: 50, segments: [{ start_ms: 0, end_ms: 800, text: "你好，世界" }] }); });
  const service = new SpeechRecognitionService(provider);
  const result = await service.transcribeSegment(segment(), { language: "zh" });
  assert.equal(result.text, "你好，世界"); assert.equal(result.segmentId, "segment-1"); assert.equal(captured.method, "POST"); assert.equal(captured.body.get("language"), "zh"); assert.equal(captured.body.get("audio").type, "audio/wav");
});

test("provider handles network, HTTP, malformed JSON, empty text, timeout and cancellation", async () => {
  const network = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => { throw new TypeError("network"); });
  await assert.rejects(() => network.transcribe({ requestId: "r", segmentId: "s", audio: wav(), mimeType: "audio/wav", sampleRate: 16000, channelCount: 1, durationMs: 800 }), /not reachable/);
  const http = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => response({ error: { code: "MODEL_NOT_READY", message: "not ready", retryable: true } }, 503));
  await assert.rejects(() => http.transcribe({ requestId: "r", segmentId: "s", audio: wav(), mimeType: "audio/wav", sampleRate: 16000, channelCount: 1, durationMs: 800 }), /not ready/);
  const proxyOffline = new LocalHttpSpeechRecognitionProvider("/api/local-stt", "test", async () => textResponse("proxy upstream failure"));
  await assert.rejects(() => proxyOffline.transcribe({ requestId: "r", segmentId: "s", audio: wav(), mimeType: "audio/wav", sampleRate: 16000, channelCount: 1, durationMs: 800 }), (error) => error.code === "NETWORK_UNAVAILABLE" && error.retryable === true && error.status === 500);
  const invalidTranscribe = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => new Response("not json", { status: 200, headers: { "Content-Type": "application/json" } }));
  await assert.rejects(() => invalidTranscribe.transcribe({ requestId: "r", segmentId: "s", audio: wav(), mimeType: "audio/wav", sampleRate: 16000, channelCount: 1, durationMs: 800 }), (error) => error.code === "MALFORMED_JSON");
  const empty = new SpeechRecognitionService(new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => response({ text: "   ", processing_time_ms: 1 })));
  await assert.rejects(() => empty.transcribeSegment(segment()), /empty transcript/);
  const slow = new SpeechRecognitionService(new LocalHttpSpeechRecognitionProvider("http://x", "test", async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("", "AbortError"))))), { requestTimeoutMs: 5 });
  await assert.rejects(() => slow.transcribeSegment(segment()), /cancelled/);
});

test("service rejects invalid or duplicate segments and preserves segment IDs", async () => {
  const provider = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => response({ text: "ok", processing_time_ms: 1 }));
  const service = new SpeechRecognitionService(provider);
  await assert.rejects(() => service.transcribeSegment(segment("bad", { vadValidSpeech: false })), /valid speech/);
  const first = await service.transcribeSegment(segment("same")); assert.equal(first.segmentId, "same");
  await assert.rejects(() => service.transcribeSegment(segment("same")), /already been submitted/);
});

test("deterministic queue, cancellation, late result, and overflow policies remain isolated", async () => {
  const queueControl = controlledProvider();
  const queueService = new SpeechRecognitionService(queueControl.provider, { maximumPending: 3 });
  const requestA = queueService.transcribeSegment(segment("segment-A"));
  assert.equal(queueService.getSnapshot().activeSegmentId, "segment-A");
  const requestB = queueService.transcribeSegment(segment("segment-B"));
  assert.equal(queueService.getSnapshot().queueLength, 1); assert.equal(queueService.getSnapshot().requestCount, 2);
  queueControl.pending.get("segment-A").resolve(transcript(queueControl.pending.get("segment-A"), "alpha"));
  const resultA = await requestA; await flush();
  assert.equal(resultA.segmentId, "segment-A"); assert.equal(queueService.getSnapshot().activeSegmentId, "segment-B");
  queueControl.pending.get("segment-B").resolve(transcript(queueControl.pending.get("segment-B"), "bravo"));
  const resultB = await requestB;
  assert.equal(resultB.segmentId, "segment-B"); assert.equal(queueService.getSnapshot().completedCount, 2); assert.equal(queueService.getSnapshot().queueLength, 0); assert.equal(queueService.getSnapshot().activeRequestId, null); assert.equal(queueService.getSnapshot().activeSegmentId, null); assert.equal(queueService.getSnapshot().status, "idle");
  assert.deepEqual(queueService.getSnapshot().transcriptHistory.map((item) => [item.segmentId, item.text]), [["segment-A", "alpha"], ["segment-B", "bravo"]]);

  const cancelControl = controlledProvider();
  const cancelService = new SpeechRecognitionService(cancelControl.provider, { maximumPending: 2 });
  const requestC = cancelService.transcribeSegment(segment("segment-C"));
  const pendingC = cancelControl.pending.get("segment-C");
  cancelService.cancelActive(); assert.equal(pendingC.signal.aborted, true);
  await assert.rejects(() => requestC, (error) => error.code === "CANCELLED");
  pendingC.resolve(transcript(pendingC, "late-c")); await flush();
  assert.equal(cancelService.getSnapshot().cancelledCount, 1); assert.equal(cancelService.getSnapshot().completedCount, 0); assert.equal(cancelService.getSnapshot().transcriptHistory.length, 0); assert.equal(cancelService.getSnapshot().activeRequestId, null); assert.equal(cancelService.getSnapshot().status, "idle");
  const requestD = cancelService.transcribeSegment(segment("segment-D"));
  const pendingD = cancelControl.pending.get("segment-D"); pendingD.resolve(transcript(pendingD, "delta"));
  assert.equal((await requestD).segmentId, "segment-D"); assert.equal(cancelService.getSnapshot().completedCount, 1); assert.equal(cancelService.getSnapshot().status, "idle");

  const rejectControl = controlledProvider();
  const rejectService = new SpeechRecognitionService(rejectControl.provider, { maximumPending: 2, queueOverflowPolicy: "reject" });
  const rejectA = rejectService.transcribeSegment(segment("reject-A")); const rejectB = rejectService.transcribeSegment(segment("reject-B"));
  await assert.rejects(() => rejectService.transcribeSegment(segment("reject-C")), (error) => error.code === "QUEUE_FULL");
  rejectControl.pending.get("reject-A").resolve(transcript(rejectControl.pending.get("reject-A"), "a")); await rejectA; await flush(); rejectControl.pending.get("reject-B").resolve(transcript(rejectControl.pending.get("reject-B"), "b")); await rejectB;

  const oldestControl = controlledProvider();
  const oldestService = new SpeechRecognitionService(oldestControl.provider, { maximumPending: 2, queueOverflowPolicy: "drop-oldest" });
  const oldestA = oldestService.transcribeSegment(segment("oldest-A")); const oldestB = oldestService.transcribeSegment(segment("oldest-B")); const oldestBDropped = assert.rejects(oldestB, (error) => error.code === "QUEUE_DROPPED"); const oldestC = oldestService.transcribeSegment(segment("oldest-C"));
  await oldestBDropped; oldestControl.pending.get("oldest-A").resolve(transcript(oldestControl.pending.get("oldest-A"), "a")); await oldestA; await flush(); oldestControl.pending.get("oldest-C").resolve(transcript(oldestControl.pending.get("oldest-C"), "c")); await oldestC;

  const newestControl = controlledProvider();
  const newestService = new SpeechRecognitionService(newestControl.provider, { maximumPending: 2, queueOverflowPolicy: "drop-newest" });
  const newestA = newestService.transcribeSegment(segment("newest-A")); const newestB = newestService.transcribeSegment(segment("newest-B"));
  await assert.rejects(() => newestService.transcribeSegment(segment("newest-C")), (error) => error.code === "QUEUE_FULL");
  newestControl.pending.get("newest-A").resolve(transcript(newestControl.pending.get("newest-A"), "a")); await newestA; await flush(); newestControl.pending.get("newest-B").resolve(transcript(newestControl.pending.get("newest-B"), "b")); await newestB;
});

test("health and transcript helpers are safe", async () => {
  const lazyHealth = { status: "not_loaded", service_status: "running", model: "small", device: "cuda", compute_type: "float16", model_configured: true, model_loaded: false, version: "v1", error: null };
  const loadedHealth = { ...lazyHealth, status: "loaded", model_loaded: true };
  const provider = new LocalHttpSpeechRecognitionProvider("http://x", "test", async (url) => response(url.endsWith("/health") ? lazyHealth : { text: "x", processing_time_ms: 1 }));
  const service = new SpeechRecognitionService(provider); const health = await service.healthCheck(); assert.equal(health.model, "small"); assert.equal(health.status, "not_loaded"); assert.equal(health.available, true); assert.equal(health.modelLoaded, false);
  const loadedProvider = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => response(loadedHealth));
  const loaded = await loadedProvider.healthCheck(); assert.equal(loaded.status, "loaded"); assert.equal(loaded.available, true); assert.equal(loaded.modelLoaded, true);
  const invalidProvider = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => response({ ...loadedHealth, error: {} }));
  await assert.rejects(() => invalidProvider.healthCheck(), (error) => error.code === "INVALID_RESPONSE");
  const unhealthyProvider = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => response({ ...loadedHealth, status: "unavailable", error: "model failed" }));
  await assert.rejects(() => unhealthyProvider.healthCheck(), (error) => error.code === "BACKEND_UNHEALTHY");
  const offlineProvider = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => { throw new TypeError("network"); });
  await assert.rejects(() => offlineProvider.healthCheck(), (error) => error.code === "NETWORK_UNAVAILABLE");
  const proxyOffline = new LocalHttpSpeechRecognitionProvider("/api/local-stt", "test", async () => textResponse("proxy upstream failure"));
  await assert.rejects(() => proxyOffline.healthCheck(), (error) => error.code === "NETWORK_UNAVAILABLE" && error.retryable === true && error.status === 500);
  const jsonHttpFailure = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => response({ message: "gateway failed" }, 500));
  await assert.rejects(() => jsonHttpFailure.healthCheck(), (error) => error.code === "HTTP_ERROR");
  const invalidHealth = new LocalHttpSpeechRecognitionProvider("http://x", "test", async () => new Response("not json", { status: 200, headers: { "Content-Type": "application/json" } }));
  await assert.rejects(() => invalidHealth.healthCheck(), (error) => error.code === "INVALID_RESPONSE" && error.message.includes("url=http://x/health") && error.message.includes("status=200") && error.message.includes("content-type=application/json") && error.message.includes("body=not json"));
  let healthAttempt = 0;
  const recoveringProvider = new LocalHttpSpeechRecognitionProvider("/api/local-stt", "test", async () => ++healthAttempt === 1 ? textResponse("proxy upstream failure") : response(loadedHealth));
  const recoveringService = new SpeechRecognitionService(recoveringProvider);
  await assert.rejects(() => recoveringService.healthCheck(), (error) => error.code === "NETWORK_UNAVAILABLE");
  assert.equal(recoveringService.getSnapshot().health?.available, false); assert.equal(recoveringService.getSnapshot().lastError?.code, "NETWORK_UNAVAILABLE");
  const recoveredHealth = await recoveringService.healthCheck();
  assert.equal(recoveredHealth.available, true); assert.equal(recoveringService.getSnapshot().lastError, null);
  assert.equal(normalizeTranscript(" a\n  b "), "a b"); assert.equal(hasPcm16WavHeader(wav()), true);
});
