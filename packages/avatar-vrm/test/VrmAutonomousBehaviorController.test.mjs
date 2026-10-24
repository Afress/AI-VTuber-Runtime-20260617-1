import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../node_modules/typescript/lib/typescript.js";

const sourcePath = new URL("../src/VrmAutonomousBehaviorController.ts", import.meta.url);
const coordinatesSourcePath = new URL("../src/VrmGazeCoordinates.ts", import.meta.url);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "avatar-vrm-behavior-test-"));
const compiledModulePath = join(temporaryDirectory, "VrmAutonomousBehaviorController.mjs");
const compiledCoordinatesPath = join(temporaryDirectory, "VrmGazeCoordinates.mjs");
const source = await readFile(sourcePath, "utf8");
const coordinatesSource = await readFile(coordinatesSourcePath, "utf8");
const compiled = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.ESNext,
    target: typescript.ScriptTarget.ES2020,
  },
  fileName: "VrmAutonomousBehaviorController.ts",
});
await writeFile(compiledModulePath, compiled.outputText, "utf8");
const compiledCoordinates = typescript.transpileModule(coordinatesSource, {
  compilerOptions: {
    module: typescript.ModuleKind.ESNext,
    target: typescript.ScriptTarget.ES2020,
  },
  fileName: "VrmGazeCoordinates.ts",
});
await writeFile(compiledCoordinatesPath, compiledCoordinates.outputText, "utf8");
const { VrmAutonomousBehaviorController } = await import(pathToFileURL(compiledModulePath).href);
const { convertGazeYToVrmPitch, normalizePointerToGaze } = await import(
  pathToFileURL(compiledCoordinatesPath).href,
);

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

function createController(random = () => 0) {
  return new VrmAutonomousBehaviorController({ random });
}

function randomFrom(values) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

function update(controller, seconds, options = {}) {
  return controller.update(seconds, {
    hasBaseMotion: false,
    interactionGazeActive: false,
    ...options,
  });
}

function advance(controller, totalSeconds, stepSeconds = 0.05, options = {}) {
  let frame;
  for (let elapsed = 0; elapsed < totalSeconds; elapsed += stepSeconds) {
    frame = update(controller, Math.min(stepSeconds, totalSeconds - elapsed), options);
  }
  return frame;
}

test("blink starts open, follows closing/opening, and returns to zero", () => {
  const controller = createController();
  assert.equal(update(controller, 0).blinkPhase, "waiting");
  assert.equal(controller.getDebugState().appliedBlinkValue, 0);

  advance(controller, 2);
  assert.equal(controller.getDebugState().blinkPhase, "closing");
  update(controller, 0.025);
  assert.equal(controller.getDebugState().blinkPhase, "closing");
  assert.ok(controller.getDebugState().appliedBlinkValue > 0);
  update(controller, 0.05);
  assert.equal(controller.getDebugState().blinkPhase, "opening");
  advance(controller, 0.2);
  assert.equal(controller.getDebugState().blinkPhase, "waiting");
  assert.equal(controller.getDebugState().appliedBlinkValue, 0);
});

test("disable and manual override neutralize blink output", () => {
  const controller = createController();
  advance(controller, 2.05);
  assert.ok(controller.getDebugState().appliedBlinkValue > 0);

  controller.setManualOverrideActive(true);
  update(controller, 0.05);
  assert.equal(controller.getDebugState().blinkPhase, "paused");
  assert.equal(controller.getDebugState().appliedBlinkValue, 0);

  controller.setEnabled(false);
  update(controller, 0.1);
  assert.equal(controller.getDebugState().enabled, false);
  assert.equal(controller.getDebugState().appliedBlinkValue, 0);
  assert.equal(controller.getDebugState().currentGazeYaw, 0);
});

test("large delta is clamped and cannot leave blink stuck", () => {
  const controller = createController();
  advance(controller, 2);
  update(controller, 10);
  assert.notEqual(controller.getDebugState().blinkPhase, "paused");
  advance(controller, 0.3);
  assert.equal(controller.getDebugState().blinkPhase, "waiting");
  assert.equal(controller.getDebugState().appliedBlinkValue, 0);
});

test("autonomous targets are bounded and remain stable before their hold expires", () => {
  const controller = createController(() => 0.75);
  const first = update(controller, 0.05);
  const second = update(controller, 0.05);
  assert.equal(first.gazeOwner, "autonomous");
  assert.ok(first.rawGazeTargetYaw >= -14 && first.rawGazeTargetYaw <= 14);
  assert.ok(first.rawGazeTargetPitch >= -7 && first.rawGazeTargetPitch <= 7);
  assert.equal(second.rawGazeTargetYaw, first.rawGazeTargetYaw);
  assert.equal(second.rawGazeTargetPitch, first.rawGazeTargetPitch);
  assert.ok(second.autonomousTargetRemainingMs < first.autonomousTargetRemainingMs);
});

test("mouse follow overrides autonomous gaze and returns after timeout", () => {
  const controller = createController(() => 0.75);
  update(controller, 0.05);
  controller.setMouseTarget(1, 1);
  const mouseFrame = update(controller, 0.05);
  assert.equal(mouseFrame.gazeOwner, "mouse-follow");
  assert.equal(mouseFrame.rawGazeTargetYaw, 24);
  assert.equal(mouseFrame.rawGazeTargetPitch, 14);

  const autonomousFrame = advance(controller, 1.25);
  assert.equal(autonomousFrame.gazeOwner, "autonomous");
});

test("abstract autonomous gaze preserves positive-up and negative-down Y semantics", () => {
  const positiveY = createController(randomFrom([0, 0, 0.5, 1, 0]));
  const negativeY = createController(randomFrom([0, 0, 0.5, 0, 0]));
  const positiveFrame = update(positiveY, 0.05);
  const negativeFrame = update(negativeY, 0.05);

  assert.equal(positiveFrame.rawGazeTargetPitch, 7);
  assert.equal(negativeFrame.rawGazeTargetPitch, -7);
});

test("pointer top and bottom normalize to the same abstract Y convention", () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  const top = normalizePointerToGaze(110, 20, rect);
  const bottom = normalizePointerToGaze(110, 120, rect);
  assert.equal(top.gazeX, 0);
  assert.equal(top.gazeY, 1);
  assert.equal(bottom.gazeX, 0);
  assert.equal(bottom.gazeY, -1);
});

test("VRM pitch conversion is the only vertical sign inversion", () => {
  assert.equal(convertGazeYToVrmPitch(7), -7);
  assert.equal(convertGazeYToVrmPitch(-7), 7);
  assert.equal(convertGazeYToVrmPitch(0), 0);
});

test("vertical correction does not change X and smoothing preserves the Y sign", () => {
  const controller = createController(randomFrom([0, 0, 1, 1, 0]));
  controller.setIdleEyeMovementEnabled(false);
  const frame = update(controller, 0.05);
  assert.equal(frame.rawGazeTargetYaw, 14);
  assert.equal(frame.rawGazeTargetPitch, 7);
  assert.ok(frame.currentGazeYaw > 0);
  assert.ok(frame.currentGazePitch > 0);
});

test("manual override wins over mouse follow and reset clears model-specific state", () => {
  const controller = createController(() => 0.75);
  controller.setMouseTarget(1, 1);
  controller.setManualOverrideActive(true);
  const manualFrame = update(controller, 0.05);
  assert.equal(manualFrame.gazeOwner, "manual");
  assert.equal(manualFrame.currentGazeYaw, 0);

  const resetCountBefore = controller.getDebugState().resetCount;
  controller.reset();
  const debug = controller.getDebugState();
  assert.equal(debug.resetCount, resetCountBefore + 1);
  assert.equal(debug.mouseOverrideActive, false);
  assert.equal(debug.rawGazeTargetYaw, 0);
  assert.equal(debug.currentGazeYaw, 0);
});

test("releasing manual override resumes autonomous output without retaining the mouse target", () => {
  const controller = createController(() => 0.75);
  controller.setMouseTarget(1, 1);
  controller.setManualOverrideActive(true);
  assert.equal(update(controller, 0.05).gazeOwner, "manual");

  controller.clearMouseTarget();
  controller.setManualOverrideActive(false);
  const resumed = update(controller, 0.05);
  assert.equal(resumed.gazeOwner, "autonomous");
  assert.notEqual(resumed.rawGazeTargetYaw, 24);
});

test("gaze interpolation uses delta time rather than a fixed frame count", () => {
  const oneStep = createController(() => 0.75);
  const tenSteps = createController(() => 0.75);
  oneStep.setAutoBlinkEnabled(false);
  tenSteps.setAutoBlinkEnabled(false);
  oneStep.setIdleEyeMovementEnabled(false);
  tenSteps.setIdleEyeMovementEnabled(false);
  update(oneStep, 0.1);
  for (let index = 0; index < 10; index += 1) {
    update(tenSteps, 0.01);
  }
  assert.ok(Math.abs(oneStep.getDebugState().currentGazeYaw - tenSteps.getDebugState().currentGazeYaw) < 0.001);
});
