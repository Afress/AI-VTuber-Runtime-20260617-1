import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const directory = await mkdtemp(join(tmpdir(), "stage-presentation-test-"));
const stateSource = await readFile(new URL("../src/stagePresentationState.ts", import.meta.url), "utf8");
const backgroundSource = await readFile(new URL("../src/stageBackground.ts", import.meta.url), "utf8");
await writeFile(join(directory, "state.mjs"), typescript.transpileModule(stateSource, { compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 } }).outputText, "utf8");
await writeFile(join(directory, "background.mjs"), typescript.transpileModule(backgroundSource, { compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 } }).outputText, "utf8");
const state = await import(pathToFileURL(join(directory, "state.mjs")).href);
const background = await import(pathToFileURL(join(directory, "background.mjs")).href);
after(() => rm(directory, { recursive: true, force: true }));

test("stage defaults keep controls collapsed and debug overlays closed", () => {
  assert.equal(state.getNextControlsExpanded(false), true);
  assert.equal(state.getTopStageOverlay({ motion: false, transcript: false, developer: false, settings: false }), null);
  assert.equal(state.getTopStageOverlay({ motion: false, transcript: false, developer: true, settings: true }), "developer");
});

test("stage microphone and transcript review state use existing runtime signals", () => {
  assert.equal(state.getStageMicrophoneState("active", false, false), "idle");
  assert.equal(state.getStageMicrophoneState("active", false, true), "capturing");
  assert.equal(state.getStageMicrophoneState("active", true, true), "processing");
  assert.equal(state.getStageMicrophoneState("error", false, true), "unavailable");
  assert.equal(state.shouldOpenTranscriptReview(null, 1, "語音草稿"), true);
  assert.equal(state.shouldOpenTranscriptReview("1:語音草稿", 1, "語音草稿"), false);
});

test("stage microphone control keeps a fixed, labelled stop action while capture is active", () => {
  const idle = state.getStageMicrophoneControl("idle", false, false);
  assert.equal(idle.ariaLabel, "Start recording");
  assert.equal(idle.disabled, false);

  const recording = state.getStageMicrophoneControl("capturing", true, false);
  assert.equal(recording.ariaLabel, "Stop recording");
  assert.equal(recording.title, "停止錄音");
  assert.equal(recording.icon, "stop");
  assert.equal(recording.disabled, false);

  const listening = state.getStageMicrophoneControl("listening", true, true);
  assert.equal(listening.ariaLabel, "Stop listening");
  assert.equal(listening.title, "停止監聽");
  assert.equal(listening.icon, "stop");

  const processingWhileListening = state.getStageMicrophoneControl("processing", true, true);
  assert.equal(processingWhileListening.ariaLabel, "Stop listening");
  assert.equal(processingWhileListening.disabled, false);

  const completedWhileListening = state.getStageMicrophoneControl("success", true, true);
  assert.equal(completedWhileListening.ariaLabel, "Stop listening");

  const processingWhileRecording = state.getStageMicrophoneControl("processing", true, false);
  assert.equal(processingWhileRecording.ariaLabel, "Stop recording");
  assert.equal(processingWhileRecording.disabled, false);

  const startListening = state.getStageMicrophoneControl("idle", false, true);
  assert.equal(startListening.ariaLabel, "Start listening");

  const processing = state.getStageMicrophoneControl("processing", false, false);
  assert.equal(processing.ariaLabel, "Processing voice turn");
  assert.equal(processing.disabled, true);

  const unavailable = state.getStageMicrophoneControl("unavailable", false, false);
  assert.equal(unavailable.ariaLabel, "Microphone unavailable");
  assert.equal(unavailable.disabled, true);
});

test("background choices and local-image limits are deterministic", () => {
  assert.equal(background.getBundledStageBackground("aurora"), "/backgrounds/stage-aurora.svg");
  assert.equal(background.getBundledStageBackground("studio"), "/backgrounds/stage-studio.svg");
  assert.equal(background.validateStageBackgroundFile({ type: "text/plain", size: 10 }), "Choose an image file.");
  assert.match(background.validateStageBackgroundFile({ type: "image/png", size: 9 * 1024 * 1024 }), /8 MB/);
  assert.equal(background.validateStageBackgroundFile({ type: "image/png", size: 1024 }), null);
  assert.deepEqual(state.constrainStageMenuPosition(2000, 2000, 1000, 700), { x: 780, y: 540 });
});
