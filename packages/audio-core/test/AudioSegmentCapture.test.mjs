import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../node_modules/typescript/lib/typescript.js";

globalThis.window = {
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};

const sourcePath = new URL("../src/index.ts", import.meta.url);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "audio-core-capture-test-"));
const compiledModulePath = join(temporaryDirectory, "audio-core.mjs");
const source = await readFile(sourcePath, "utf8");
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 },
  fileName: "index.ts",
});
await writeFile(compiledModulePath, compiled.outputText, "utf8");
const { AdaptiveAudioSegmentCapture, encodePcm16Wav } = await import(pathToFileURL(compiledModulePath).href);

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

function createCapture(config = {}) {
  let now = 0;
  const capture = new AdaptiveAudioSegmentCapture({
    preRollMs: 400,
    postRollMs: 120,
    maximumSegmentDurationMs: 1_000,
    maximumBufferedDurationMs: 500,
    retainLastSegment: true,
    ...config,
  }, () => now);
  return {
    capture,
    frame(timestamp, samples = [0.1, -0.1, 0.2, -0.2]) {
      now = timestamp;
      capture.pushFrame({
        timestamp,
        sampleRate: 1000,
        channelCount: 1,
        samples: new Float32Array(samples),
      });
    },
    now(value) {
      now = value;
    },
  };
}

function startEvent(timestamp = 350) {
  return { timestamp, noiseFloor: 0.01, threshold: 0.03, initialScore: 0.5 };
}

function endEvent(overrides = {}) {
  return {
    startedAt: 350,
    endedAt: 500,
    durationMs: 150,
    trailingSilenceMs: 120,
    validSpeech: true,
    reason: "silence",
    ...overrides,
  };
}

test("pre-roll ring buffer is bounded and included when speech starts", () => {
  const harness = createCapture({ preRollMs: 200, maximumBufferedDurationMs: 200 });
  harness.capture.start();
  harness.frame(0);
  harness.frame(100);
  harness.frame(200);
  harness.frame(300);
  assert.ok(harness.capture.getSnapshot().preRollBufferedMs <= 200);
  const segments = [];
  harness.capture.onSegment((segment) => segments.push(segment));
  harness.capture.handleSpeechStart(startEvent(350));
  harness.frame(400);
  harness.capture.handleSpeechEnd(endEvent());
  assert.equal(segments.length, 1);
  assert.equal(segments[0].metadata.preRollMs, 8);
  assert.equal(segments[0].metadata.frameCount, 3);
});

test("duplicate VAD events do not create duplicate segments", () => {
  const harness = createCapture();
  const segments = [];
  harness.capture.onSegment((segment) => segments.push(segment));
  harness.capture.start();
  harness.frame(0);
  harness.capture.handleSpeechStart(startEvent(10));
  harness.capture.handleSpeechStart(startEvent(11));
  harness.frame(20);
  harness.capture.handleSpeechEnd(endEvent({ endedAt: 20, trailingSilenceMs: 200 }));
  harness.capture.handleSpeechEnd(endEvent({ endedAt: 21, trailingSilenceMs: 200 }));
  assert.equal(segments.length, 1);
  assert.equal(harness.capture.getSnapshot().segmentCount, 1);
});

test("manual segment public API finalizes one captured segment without VAD events", () => {
  const harness = createCapture();
  const segments = [];
  harness.capture.onSegment((segment) => segments.push(segment));
  harness.capture.start();
  harness.frame(0);

  assert.equal(harness.capture.startManualSegment(10), true);
  harness.frame(20);
  assert.equal(harness.capture.stopManualSegment(30), true);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].metadata.endReason, "stopped");
  assert.equal(harness.capture.stopManualSegment(40), false);
});

test("post-roll waits only for silence not already included by VAD", () => {
  const harness = createCapture({ postRollMs: 120 });
  const segments = [];
  harness.capture.onSegment((segment) => segments.push(segment));
  harness.capture.start();
  harness.frame(0);
  harness.capture.handleSpeechStart(startEvent(10));
  harness.frame(20);
  harness.capture.handleSpeechEnd(endEvent({ endedAt: 20, trailingSilenceMs: 20 }));
  assert.equal(harness.capture.getSnapshot().state, "finalizing");
  harness.frame(140);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].metadata.endReason, "silence");
});

test("mute, reset, and stop finish active segments with explicit reasons", () => {
  const harness = createCapture();
  const reasons = [];
  harness.capture.onSegment((segment) => reasons.push(segment.metadata.endReason));
  harness.capture.start();
  harness.frame(0);
  harness.capture.handleSpeechStart(startEvent(1));
  harness.frame(2);
  harness.capture.handleInputReset("muted");
  harness.capture.handleSpeechStart(startEvent(3));
  harness.frame(4);
  harness.capture.reset();
  harness.capture.handleSpeechStart(startEvent(5));
  harness.frame(6);
  harness.capture.stop("stopped");
  assert.deepEqual(reasons, ["muted", "reset", "stopped"]);
  assert.equal(harness.capture.getSnapshot().state, "idle");
});

test("sample rate replacement and non-monotonic frames do not mix segments", () => {
  const harness = createCapture();
  const segments = [];
  harness.capture.onSegment((segment) => segments.push(segment));
  harness.capture.start();
  harness.frame(0);
  harness.capture.handleSpeechStart(startEvent(1));
  harness.frame(2);
  harness.capture.pushFrame({ timestamp: 1, sampleRate: 1000, channelCount: 1, samples: new Float32Array([0.1]) });
  assert.equal(harness.capture.getSnapshot().droppedFrameCount, 1);
  harness.capture.pushFrame({ timestamp: 3, sampleRate: 2000, channelCount: 1, samples: new Float32Array([0.1]) });
  assert.equal(segments[0].metadata.endReason, "device-lost");
  assert.equal(harness.capture.getSnapshot().sampleRate, 2000);
});

test("maximum segment duration truncates safely and releases active buffers", () => {
  const harness = createCapture({ maximumSegmentDurationMs: 1_000 });
  const segments = [];
  harness.capture.onSegment((segment) => segments.push(segment));
  harness.capture.start();
  harness.frame(0, Array.from({ length: 1_000 }, () => 0.1));
  harness.capture.handleSpeechStart(startEvent(1));
  harness.frame(2, Array.from({ length: 1_000 }, () => 0.1));
  assert.equal(segments.length, 1);
  assert.equal(segments[0].metadata.truncated, true);
  assert.equal(harness.capture.getSnapshot().activeSampleCount, 0);
});

test("WAV encoder writes PCM16 mono RIFF headers and clamps samples", () => {
  const wav = encodePcm16Wav(new Float32Array([-2, -1, 0, 1, 2]), 16_000);
  const view = new DataView(wav);
  const ascii = (offset, length) => String.fromCharCode(...new Uint8Array(wav, offset, length));
  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(ascii(12, 4), "fmt ");
  assert.equal(ascii(36, 4), "data");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getInt16(44, true), -32_768);
  assert.equal(view.getInt16(52, true), 32_767);
  assert.throws(() => encodePcm16Wav(new Float32Array(), 16_000), /empty PCM/);
});

test("dispose prevents future frame or segment emission", () => {
  const harness = createCapture();
  let emitted = 0;
  harness.capture.onSegment(() => {
    emitted += 1;
  });
  harness.capture.start();
  harness.frame(0);
  harness.capture.handleSpeechStart(startEvent(1));
  harness.frame(2);
  harness.capture.dispose();
  harness.frame(3);
  harness.capture.handleSpeechEnd(endEvent());
  assert.equal(emitted, 1);
});
