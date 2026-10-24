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
const temporaryDirectory = await mkdtemp(join(tmpdir(), "audio-core-vad-test-"));
const compiledModulePath = join(temporaryDirectory, "audio-core.mjs");
const source = await readFile(sourcePath, "utf8");
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 },
  fileName: "index.ts",
});
await writeFile(compiledModulePath, compiled.outputText, "utf8");
const { AdaptiveEnergyVad, BrowserVoiceActivityDetector } = await import(pathToFileURL(compiledModulePath).href);

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

function createVad(overrides = {}) {
  let now = 0;
  const vad = new AdaptiveEnergyVad({
    calibrationDurationMs: 100,
    minimumNoiseFloor: 0.01,
    maximumNoiseFloor: 0.1,
    thresholdMultiplier: 2,
    thresholdOffset: 0.01,
    speechStartDurationMs: 40,
    speechEndSilenceMs: 80,
    minimumSpeechDurationMs: 100,
    maximumSpeechDurationMs: 500,
    smoothingFactor: 0,
    noiseFloorAdaptationRate: 0.05,
    ...overrides,
  }, () => now);
  return {
    vad,
    frame(level, timestamp, clipped = false) {
      now = timestamp;
      return vad.processFrame(level, timestamp, clipped);
    },
    setNow(value) {
      now = value;
    },
  };
}

function calibrate(harness) {
  harness.vad.start();
  harness.frame(0.01, 0);
  harness.frame(0.01, 100);
  assert.equal(harness.vad.getSnapshot().state, "silence");
}

function createFakeVadSource() {
  const analyser = {
    fftSize: 512,
    getByteTimeDomainData(target) {
      target.fill(128);
    },
    disconnect() {},
  };
  return {
    context: { createAnalyser: () => analyser },
    connect() {},
    disconnect() {},
  };
}

test("calibration enters silence with a bounded noise floor and ignores loud outliers", () => {
  const harness = createVad();
  harness.vad.start();
  harness.frame(0.01, 0);
  harness.frame(0.9, 30, true);
  harness.frame(0.012, 100);
  const snapshot = harness.vad.getSnapshot();
  assert.equal(snapshot.state, "silence");
  assert.ok(snapshot.noiseFloor >= 0.01 && snapshot.noiseFloor < 0.02);
  assert.ok(snapshot.threshold > snapshot.noiseFloor);
});

test("silence and a one-frame spike do not start speech", () => {
  const harness = createVad();
  const starts = [];
  harness.vad.onSpeechStart((event) => starts.push(event));
  calibrate(harness);
  harness.frame(0.02, 110);
  harness.frame(0.06, 120);
  harness.frame(0.01, 130);
  assert.equal(starts.length, 0);
  assert.equal(harness.vad.getSnapshot().state, "silence");
});

test("sustained energy triggers one debounced speech start", () => {
  const harness = createVad();
  const starts = [];
  harness.vad.onSpeechStart((event) => starts.push(event));
  calibrate(harness);
  harness.frame(0.06, 110);
  harness.frame(0.06, 149);
  assert.equal(starts.length, 0);
  harness.frame(0.06, 150);
  harness.frame(0.07, 180);
  assert.equal(starts.length, 1);
  assert.equal(harness.vad.getSnapshot().speechStartCount, 1);
  assert.equal(harness.vad.getSnapshot().state, "speech");
});

test("short silence does not end speech and timeout emits one valid segment", () => {
  const harness = createVad();
  const ends = [];
  harness.vad.onSpeechEnd((event) => ends.push(event));
  calibrate(harness);
  harness.frame(0.06, 110);
  harness.frame(0.06, 150);
  harness.frame(0.06, 230);
  harness.frame(0.01, 240);
  harness.frame(0.06, 300);
  assert.equal(ends.length, 0);
  harness.frame(0.01, 310);
  harness.frame(0.01, 390);
  harness.frame(0.01, 420);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].reason, "silence");
  assert.equal(ends[0].validSpeech, true);
  assert.equal(harness.vad.getSnapshot().state, "silence");
});

test("short burst produces an invalid speech end event", () => {
  const harness = createVad({ minimumSpeechDurationMs: 200 });
  const ends = [];
  harness.vad.onSpeechEnd((event) => ends.push(event));
  calibrate(harness);
  harness.frame(0.06, 110);
  harness.frame(0.06, 150);
  harness.frame(0.01, 160);
  harness.frame(0.01, 240);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].validSpeech, false);
});

test("maximum duration ends speech once even with a large frame delta", () => {
  const harness = createVad({ maximumSpeechDurationMs: 120 });
  const ends = [];
  harness.vad.onSpeechEnd((event) => ends.push(event));
  calibrate(harness);
  harness.frame(0.06, 110);
  harness.frame(0.06, 150);
  harness.frame(0.07, 500);
  harness.frame(0.07, 800);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].reason, "maximum-duration");
});

test("mute, stop, and reset end active speech with explicit reasons", () => {
  const harness = createVad();
  const reasons = [];
  harness.vad.onSpeechEnd((event) => reasons.push(event.reason));
  calibrate(harness);
  harness.frame(0.06, 110);
  harness.frame(0.06, 150);
  harness.setNow(160);
  harness.vad.stop("muted");
  assert.deepEqual(reasons, ["muted"]);
  harness.vad.start();
  harness.frame(0.01, 200);
  harness.frame(0.01, 300);
  harness.frame(0.06, 310);
  harness.frame(0.06, 350);
  harness.setNow(360);
  harness.vad.reset();
  assert.deepEqual(reasons, ["muted", "reset"]);
  assert.equal(harness.vad.getSnapshot().state, "calibrating");
});

test("duplicate start does not reset an active calibration or emit duplicate starts", () => {
  const harness = createVad();
  const starts = [];
  harness.vad.onSpeechStart((event) => starts.push(event));
  harness.vad.start();
  harness.frame(0.01, 0);
  harness.vad.start();
  harness.frame(0.01, 100);
  harness.frame(0.06, 110);
  harness.frame(0.06, 150);
  harness.frame(0.07, 190);
  assert.equal(starts.length, 1);
});

test("invalid and clipped frames stay finite", () => {
  const harness = createVad();
  calibrate(harness);
  const result = harness.frame(Number.NaN, 110, true);
  assert.equal(result.rawLevel, 0);
  assert.equal(result.clipped, true);
  assert.ok(Number.isFinite(result.threshold));
  assert.ok(Number.isFinite(result.score));
});

test("dispose clears listeners and no longer emits events", () => {
  const harness = createVad();
  let snapshots = 0;
  harness.vad.subscribe(() => {
    snapshots += 1;
  });
  harness.vad.dispose();
  const afterDispose = snapshots;
  harness.frame(0.8, 10);
  assert.equal(snapshots, afterDispose);
});

test("browser adapter keeps one processing loop across enable, mute, and source replacement", () => {
  let now = 0;
  const vad = new BrowserVoiceActivityDetector({
    processingIntervalMs: 50,
    now: () => now,
    config: { calibrationDurationMs: 100 },
  });
  const firstSource = createFakeVadSource();
  vad.setInputSource(firstSource, 1);
  vad.setEnabled(true);
  assert.equal(vad.getSnapshot().activeProcessingLoopCount, 1);
  vad.setEnabled(true);
  assert.equal(vad.getSnapshot().activeProcessingLoopCount, 1);
  vad.setInputMuted(true);
  assert.equal(vad.getSnapshot().activeProcessingLoopCount, 0);
  vad.setInputMuted(false);
  assert.equal(vad.getSnapshot().activeProcessingLoopCount, 1);
  now = 10;
  vad.setInputSource(createFakeVadSource(), 2);
  assert.equal(vad.getSnapshot().activeProcessingLoopCount, 1);
  vad.dispose();
  assert.equal(vad.getSnapshot().activeProcessingLoopCount, 0);
});
