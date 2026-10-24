import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const directory = await mkdtemp(join(process.cwd(), ".stage-presentation-render-test-"));
const stateSource = await readFile(new URL("../src/stagePresentationState.ts", import.meta.url), "utf8");
const shellSource = (await readFile(new URL("../src/components/StagePresentationShell.tsx", import.meta.url), "utf8"))
  .replace('from "../stagePresentationState"', 'from "./stagePresentationState.mjs"');

await writeFile(
  join(directory, "stagePresentationState.mjs"),
  typescript.transpileModule(stateSource, {
    compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 },
  }).outputText,
  "utf8",
);
await writeFile(
  join(directory, "StagePresentationShell.mjs"),
  typescript.transpileModule(shellSource, {
    compilerOptions: {
      module: typescript.ModuleKind.ESNext,
      target: typescript.ScriptTarget.ES2020,
      jsx: typescript.JsxEmit.ReactJSX,
    },
  }).outputText,
  "utf8",
);

const { StagePresentationShell } = await import(pathToFileURL(join(directory, "StagePresentationShell.mjs")).href);
after(() => rm(directory, { recursive: true, force: true }));

function createProps(overrides = {}) {
  return {
    backgroundImage: null,
    backgroundFit: "cover",
    avatar: null,
    controlsExpanded: false,
    microphoneState: "idle",
    microphoneCaptureActive: false,
    settingsOpen: false,
    developerOpen: false,
    transcriptReviewOpen: false,
    onControlsExpandedChange() {},
    onMicrophoneClick() {},
    onSettingsOpenChange() {},
    onDeveloperOpenChange() {},
    onTranscriptReviewOpenChange() {},
    onAvatarTypeChange() {},
    avatarType: "vrm",
    vadEnabled: false,
    onVadEnabledChange() {},
    settings: null,
    developer: null,
    transcriptReview: null,
    motionMenu: null,
    chat: null,
    ...overrides,
  };
}

function findButton(element, ariaLabel) {
  if (!React.isValidElement(element)) return null;
  if (element.type === "button" && element.props["aria-label"] === ariaLabel) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findButton(child, ariaLabel);
    if (found) return found;
  }
  return null;
}

test("capturing renders a fixed stop-recording button instead of the raw state", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StagePresentationShell, createProps({ microphoneState: "capturing", microphoneCaptureActive: true })),
  );
  assert.match(markup, /停止錄音/);
  assert.match(markup, /■/);
  assert.doesNotMatch(markup, /Mic capturing/);
});

test("listening renders stop-listening while controls are collapsed", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StagePresentationShell, createProps({ microphoneState: "listening", microphoneCaptureActive: true, vadEnabled: true })),
  );
  assert.match(markup, /停止監聽/);
  assert.match(markup, /aria-label="Stop listening"/);
});

test("active capture takes priority over processing and binds the existing toggle once", () => {
  let clicks = 0;
  const props = createProps({
    microphoneState: "processing",
    microphoneCaptureActive: true,
    vadEnabled: false,
    onMicrophoneClick() {
      clicks += 1;
    },
  });
  const element = StagePresentationShell(props);
  const button = findButton(element, "Stop recording");

  assert.ok(button);
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  assert.equal(clicks, 1);
});
