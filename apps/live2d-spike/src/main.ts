import { Application, Container, VERSION as PIXI_VERSION } from "pixi.js";
import {
  applyModelTransform as applyLive2dModelTransform,
  applyMouthValue as applyLive2dMouthValue,
  clamp01,
  discoverParameterIds,
  findMouthParameter,
  getValidatedDefaultTransform,
  normalizeParameterId,
  type Live2DTransform,
} from "./live2dRuntime";
import {
  cleanupAudioPipeline,
  computeMouthValue,
  computeRmsFromAnalyser,
  createAudioAnalyserPipeline,
  type AudioAnalyserPipeline,
} from "./audioMouthSync";
import "./style.css";

type SpikeStatus = "idle" | "loading" | "loaded" | "error";

const STORAGE_KEYS = {
  viewerWidth: "ai-vtuber.live2dSpike.viewerWidth",
  viewerHeight: "ai-vtuber.live2dSpike.viewerHeight",
  modelScale: "ai-vtuber.live2dSpike.modelScale",
  modelOffsetX: "ai-vtuber.live2dSpike.modelOffsetX",
  modelOffsetY: "ai-vtuber.live2dSpike.modelOffsetY",
} as const;

type SpikeElements = {
  status: HTMLElement;
  modelUrlInput: HTMLInputElement;
  loadButton: HTMLButtonElement;
  forceReloadButton: HTMLButtonElement;
  canvasHost: HTMLElement;
  pixiVersion: HTMLElement;
  engineVersion: HTMLElement;
  cubismCoreLoaded: HTMLElement;
  currentModelUrl: HTMLElement;
  browserUrl: HTMLElement;
  actualLoadedUrl: HTMLElement;
  lastHttpStatus: HTMLElement;
  lastLoadedAt: HTMLElement;
  viewerWidthSlider: HTMLInputElement;
  viewerWidthValue: HTMLElement;
  viewerHeightSlider: HTMLInputElement;
  viewerHeightValue: HTMLElement;
  modelScaleSlider: HTMLInputElement;
  modelScaleValue: HTMLElement;
  modelOffsetXSlider: HTMLInputElement;
  modelOffsetXValue: HTMLElement;
  modelOffsetYSlider: HTMLInputElement;
  modelOffsetYValue: HTMLElement;
  fitToHeightButton: HTMLButtonElement;
  centerModelButton: HTMLButtonElement;
  resetTransformButton: HTMLButtonElement;
  validatedTransformDisplay: HTMLElement;
  currentTransformDisplay: HTMLElement;
  viewerSizeDisplay: HTMLElement;
  modelScaleDisplay: HTMLElement;
  modelOffsetDisplay: HTMLElement;
  modelPositionDisplay: HTMLElement;
  modelRenderedSizeDisplay: HTMLElement;
  parameterCount: HTMLElement;
  parameterIdSource: HTMLElement;
  parameterList: HTMLPreElement;
  candidateMouthParameters: HTMLElement;
  selectedMouthParameter: HTMLElement;
  selectedParameterIndex: HTMLElement;
  setApiUsed: HTMLElement;
  beforeParameterValue: HTMLElement;
  afterParameterValue: HTMLElement;
  mouthParameterInput: HTMLInputElement;
  mouthSlider: HTMLInputElement;
  mouthSliderValue: HTMLElement;
  mouthParameterStatus: HTMLElement;
  audioFileInput: HTMLInputElement;
  audioPlayButton: HTMLButtonElement;
  audioStopButton: HTMLButtonElement;
  mouthSyncEnabled: HTMLInputElement;
  resetMouthOnStop: HTMLInputElement;
  resetManualSliderButton: HTMLButtonElement;
  mouthGainSlider: HTMLInputElement;
  mouthGainValue: HTMLElement;
  mouthSmoothingSlider: HTMLInputElement;
  mouthSmoothingValue: HTMLElement;
  currentRms: HTMLElement;
  currentAudioMouthValue: HTMLElement;
  mouthControlSource: HTMLElement;
  isAudioPlaying: HTMLElement;
  manualMouthValue: HTMLElement;
  audioMouthValue: HTMLElement;
  appliedMouthValue: HTMLElement;
  audioTargetParameter: HTMLElement;
  audioTargetIndex: HTMLElement;
  audioSetApiUsed: HTMLElement;
  audioStatus: HTMLElement;
  lastEndedBehavior: HTMLElement;
  resetAppliedMouthEnabled: HTMLElement;
  lastResetAffected: HTMLElement;
  audioErrorOutput: HTMLPreElement;
  ttsEndpointInput: HTMLInputElement;
  ttsTextInput: HTMLTextAreaElement;
  ttsGeneratePlayButton: HTMLButtonElement;
  ttsStopButton: HTMLButtonElement;
  ttsStatus: HTMLElement;
  ttsLastAudioUrl: HTMLElement;
  ttsRequestDurationMs: HTMLElement;
  ttsErrorOutput: HTMLPreElement;
  errorOutput: HTMLPreElement;
};

type ParameterDiagnostic = {
  count: number | null;
  ids: string[];
  rawIds: unknown[];
  idSource: string;
  idsResolved: boolean;
  candidates: string[];
};

type SetParameterResult =
  | {
      success: true;
      api: string;
      index: number | null;
      beforeValue: number | null;
      afterValue: number | null;
    }
  | {
      success: false;
      reason: string;
      index: number | null;
      beforeValue: number | null;
      afterValue: number | null;
    };

let currentApp: Application | null = null;
let currentModel: Container | null = null;
let currentParameterIds: string[] = [];
let currentParameterRawIds: unknown[] = [];
let audioElement: HTMLAudioElement | null = null;
let audioPipeline: AudioAnalyserPipeline | null = null;
let audioObjectUrl: string | null = null;
let audioAnimationFrameId: number | null = null;
let manualMouthValue = 0;
let audioMouthValue = 0;
let appliedMouthValue = 0;
let isAudioPlaying = false;
let fadeoutAnimationFrameId: number | null = null;
const VALIDATED_DEFAULT_TRANSFORM = getValidatedDefaultTransform();
let viewerWidth = VALIDATED_DEFAULT_TRANSFORM.viewerWidth;
let viewerHeight = VALIDATED_DEFAULT_TRANSFORM.viewerHeight;
let modelScale = VALIDATED_DEFAULT_TRANSFORM.modelScale;
let modelOffsetX = VALIDATED_DEFAULT_TRANSFORM.modelOffsetX;
let modelOffsetY = VALIDATED_DEFAULT_TRANSFORM.modelOffsetY;

const elements = getElements();
elements.pixiVersion.textContent = PIXI_VERSION;
elements.engineVersion.textContent = "untitled-pixi-live2d-engine/cubism";
updateCubismCoreStatus();
elements.loadButton.addEventListener("click", () => {
  void loadModel();
});
elements.forceReloadButton.addEventListener("click", () => {
  void loadModel();
});
elements.viewerWidthSlider.addEventListener("input", () => {
  updateTransformStateFromInputs();
  resizeViewer();
});
elements.viewerHeightSlider.addEventListener("input", () => {
  updateTransformStateFromInputs();
  resizeViewer();
});
elements.modelScaleSlider.addEventListener("input", () => {
  updateTransformStateFromInputs();
  applyModelTransform();
});
elements.modelOffsetXSlider.addEventListener("input", () => {
  updateTransformStateFromInputs();
  applyModelTransform();
});
elements.modelOffsetYSlider.addEventListener("input", () => {
  updateTransformStateFromInputs();
  applyModelTransform();
});
elements.fitToHeightButton.addEventListener("click", () => {
  fitModelToHeight();
});
elements.centerModelButton.addEventListener("click", () => {
  centerModel();
});
elements.resetTransformButton.addEventListener("click", () => {
  resetTransformToValidatedDefaults();
});
elements.mouthSlider.addEventListener("input", () => {
  updateMouthSliderValue();
  testMouthParameter();
});
elements.mouthParameterInput.addEventListener("change", () => {
  testMouthParameter();
});
elements.audioPlayButton.addEventListener("click", () => {
  void playAudioMouthSync();
});
elements.audioStopButton.addEventListener("click", () => {
  stopAudioMouthSync();
});
elements.mouthSyncEnabled.addEventListener("change", () => {
  updateMouthControlSource();
  applyCurrentMouthControlValue();
});
elements.resetMouthOnStop.addEventListener("change", () => {
  elements.resetAppliedMouthEnabled.textContent = String(elements.resetMouthOnStop.checked);
});
elements.resetManualSliderButton.addEventListener("click", () => {
  resetManualSlider();
});
elements.mouthGainSlider.addEventListener("input", updateAudioControlLabels);
elements.mouthSmoothingSlider.addEventListener("input", updateAudioControlLabels);
elements.ttsGeneratePlayButton.addEventListener("click", () => {
  void generateAndPlayIndexTts();
});
elements.ttsStopButton.addEventListener("click", () => {
  elements.ttsStatus.textContent = "stopped";
  stopAudioMouthSync();
});

setStatus("idle");
initializeTransformState();
resetParameterUi();
resetAudioUi();
resetTtsUi();
console.log("Live2D v8 spike booted", {
  pixiVersion: PIXI_VERSION,
  engine: "untitled-pixi-live2d-engine/cubism",
  package: "@runtime/live2d-spike",
});

async function loadModel() {
  const modelUrl = elements.modelUrlInput.value.trim() || "/live2d/model.model3.json";
  const actualModelUrl = addCacheBuster(modelUrl);
  setStatus("loading");
  setError(null);
  elements.currentModelUrl.textContent = modelUrl;
  elements.browserUrl.textContent = `${window.location.origin}${modelUrl}`;
  elements.actualLoadedUrl.textContent = actualModelUrl;
  elements.lastHttpStatus.textContent = "checking";
  elements.lastLoadedAt.textContent = "none";
  updateCubismCoreStatus();
  elements.loadButton.disabled = true;
  elements.forceReloadButton.disabled = true;

  try {
    await destroyCurrentRuntime();
    const response = await fetch(actualModelUrl, { cache: "no-store" });
    elements.lastHttpStatus.textContent = `${response.status} ${response.statusText}`.trim();
    if (!response.ok) {
      throw new Error(`Model URL not found: ${actualModelUrl} returned ${response.status}`);
    }

    if (!isCubismCoreLoaded()) {
      setStatus("error");
      setError(
        "Cubism Core is missing. Please place live2dcubismcore.min.js at /live2d/core/live2dcubismcore.min.js",
      );
      return;
    }

    const { Live2DModel } = await import("untitled-pixi-live2d-engine/cubism");
    const app = new Application();
    await app.init({
      width: viewerWidth,
      height: viewerHeight,
      backgroundAlpha: 0,
      preference: "webgl",
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    currentApp = app;

    elements.canvasHost.replaceChildren(app.canvas);
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";

    const model = await Live2DModel.from(actualModelUrl);
    currentModel = model as Container;
    app.stage.addChild(currentModel);
    if ("anchor" in currentModel && typeof (currentModel as any).anchor?.set === "function") {
      (currentModel as any).anchor.set(0.5, 0.5);
    }
    applyModelTransform();
    const parameterDiagnostic = exploreParameters(model);
    updateParameterUi(parameterDiagnostic);
    exposeModelForDebug(model, app, parameterDiagnostic.ids, parameterDiagnostic.rawIds);

    elements.lastLoadedAt.textContent = new Date().toLocaleString();
    setStatus("loaded");
    console.log("Live2D v8 spike model loaded", {
      modelUrl,
      actualModelUrl,
      pixiVersion: PIXI_VERSION,
      engine: "untitled-pixi-live2d-engine/cubism",
    });
  } catch (error) {
    console.error("Live2D v8 spike failed:", error);
    setStatus("error");
    setError(getErrorDetails(error));
    await destroyCurrentRuntime();
  } finally {
    elements.loadButton.disabled = false;
    elements.forceReloadButton.disabled = false;
  }
}

function initializeTransformState() {
  viewerWidth = readStoredNumber(
    STORAGE_KEYS.viewerWidth,
    VALIDATED_DEFAULT_TRANSFORM.viewerWidth,
    320,
    1200,
  );
  viewerHeight = readStoredNumber(
    STORAGE_KEYS.viewerHeight,
    VALIDATED_DEFAULT_TRANSFORM.viewerHeight,
    400,
    1200,
  );
  modelScale = readStoredNumber(
    STORAGE_KEYS.modelScale,
    VALIDATED_DEFAULT_TRANSFORM.modelScale,
    0.2,
    3,
  );
  modelOffsetX = readStoredNumber(
    STORAGE_KEYS.modelOffsetX,
    VALIDATED_DEFAULT_TRANSFORM.modelOffsetX,
    -400,
    400,
  );
  modelOffsetY = readStoredNumber(
    STORAGE_KEYS.modelOffsetY,
    VALIDATED_DEFAULT_TRANSFORM.modelOffsetY,
    -400,
    400,
  );
  syncTransformInputs();
  applyViewerHostSize();
  updateTransformDebug();
}

function updateTransformStateFromInputs() {
  viewerWidth = clamp(Number(elements.viewerWidthSlider.value), 320, 1200);
  viewerHeight = clamp(Number(elements.viewerHeightSlider.value), 400, 1200);
  modelScale = clamp(Number(elements.modelScaleSlider.value), 0.2, 3);
  modelOffsetX = clamp(Number(elements.modelOffsetXSlider.value), -400, 400);
  modelOffsetY = clamp(Number(elements.modelOffsetYSlider.value), -400, 400);
  persistTransformState();
  syncTransformLabels();
}

function resizeViewer() {
  applyViewerHostSize();
  try {
    const app = currentApp as any;
    app?.renderer?.resize?.(viewerWidth, viewerHeight);
  } catch (error) {
    console.warn("Live2D viewer resize failed:", error);
  }
  applyModelTransform();
}

function applyModelTransform() {
  const app = currentApp;
  const model = currentModel;
  if (!app || !model) {
    updateTransformDebug();
    return;
  }

  applyLive2dModelTransform(model, app, getCurrentTransform());
  renderLive2dFrame();
  updateTransformDebug();
}

function fitModelToHeight() {
  if (!currentModel) {
    return;
  }

  const currentHeight = Math.max(currentModel.height, 1);
  const fitScale = clamp((viewerHeight / currentHeight) * currentModel.scale.x * 0.9, 0.2, 3);
  modelScale = fitScale;
  elements.modelScaleSlider.value = String(fitScale);
  persistTransformState();
  syncTransformLabels();
  applyModelTransform();
}

function centerModel() {
  modelOffsetX = 0;
  modelOffsetY = 0;
  elements.modelOffsetXSlider.value = "0";
  elements.modelOffsetYSlider.value = "0";
  persistTransformState();
  syncTransformLabels();
  applyModelTransform();
}

function resetTransformToValidatedDefaults() {
  viewerWidth = VALIDATED_DEFAULT_TRANSFORM.viewerWidth;
  viewerHeight = VALIDATED_DEFAULT_TRANSFORM.viewerHeight;
  modelScale = VALIDATED_DEFAULT_TRANSFORM.modelScale;
  modelOffsetX = VALIDATED_DEFAULT_TRANSFORM.modelOffsetX;
  modelOffsetY = VALIDATED_DEFAULT_TRANSFORM.modelOffsetY;
  persistTransformState();
  syncTransformInputs();
  applyViewerHostSize();
  resizeViewer();
}

function applyViewerHostSize() {
  elements.canvasHost.style.width = `${viewerWidth}px`;
  elements.canvasHost.style.height = `${viewerHeight}px`;
}

function syncTransformInputs() {
  elements.viewerWidthSlider.value = String(viewerWidth);
  elements.viewerHeightSlider.value = String(viewerHeight);
  elements.modelScaleSlider.value = String(modelScale);
  elements.modelOffsetXSlider.value = String(modelOffsetX);
  elements.modelOffsetYSlider.value = String(modelOffsetY);
  syncTransformLabels();
}

function syncTransformLabels() {
  elements.viewerWidthValue.textContent = String(Math.round(viewerWidth));
  elements.viewerHeightValue.textContent = String(Math.round(viewerHeight));
  elements.modelScaleValue.textContent = modelScale.toFixed(2);
  elements.modelOffsetXValue.textContent = String(Math.round(modelOffsetX));
  elements.modelOffsetYValue.textContent = String(Math.round(modelOffsetY));
  updateTransformDebug();
}

function updateTransformDebug() {
  elements.validatedTransformDisplay.textContent = formatTransform(VALIDATED_DEFAULT_TRANSFORM);
  elements.currentTransformDisplay.textContent = formatTransform(getCurrentTransform());
  elements.viewerSizeDisplay.textContent = `${Math.round(viewerWidth)} x ${Math.round(viewerHeight)}`;
  elements.modelScaleDisplay.textContent = modelScale.toFixed(2);
  elements.modelOffsetDisplay.textContent = `${Math.round(modelOffsetX)} / ${Math.round(modelOffsetY)}`;

  if (!currentModel) {
    elements.modelPositionDisplay.textContent = "none";
    elements.modelRenderedSizeDisplay.textContent = "none";
    return;
  }

  elements.modelPositionDisplay.textContent = `${currentModel.position.x.toFixed(1)}, ${currentModel.position.y.toFixed(1)}`;
  elements.modelRenderedSizeDisplay.textContent = `${currentModel.width.toFixed(1)} x ${currentModel.height.toFixed(1)}`;
}

function persistTransformState() {
  writeStoredNumber(STORAGE_KEYS.viewerWidth, viewerWidth);
  writeStoredNumber(STORAGE_KEYS.viewerHeight, viewerHeight);
  writeStoredNumber(STORAGE_KEYS.modelScale, modelScale);
  writeStoredNumber(STORAGE_KEYS.modelOffsetX, modelOffsetX);
  writeStoredNumber(STORAGE_KEYS.modelOffsetY, modelOffsetY);
}

function getCurrentTransform(): Live2DTransform {
  return {
    viewerWidth,
    viewerHeight,
    modelScale,
    modelOffsetX,
    modelOffsetY,
  };
}

function formatTransform(transform: Live2DTransform) {
  return `${Math.round(transform.viewerWidth)} x ${Math.round(transform.viewerHeight)}, scale ${transform.modelScale.toFixed(2)}, offset (${Math.round(transform.modelOffsetX)}, ${Math.round(transform.modelOffsetY)})`;
}

function readStoredNumber(key: string, fallback: number, min: number, max: number) {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function writeStoredNumber(key: string, value: number) {
  window.localStorage.setItem(key, String(value));
}

async function destroyCurrentRuntime() {
  stopAudioMouthSync();
  if (fadeoutAnimationFrameId !== null) {
    window.cancelAnimationFrame(fadeoutAnimationFrameId);
    fadeoutAnimationFrameId = null;
  }

  if (currentModel) {
    try {
      if (typeof currentModel.destroy === "function") {
        currentModel.destroy({
          children: true,
        });
      }
    } catch (error) {
      console.warn("Failed to destroy Live2D spike model:", error);
    }
    currentModel = null;
  }

  if (currentApp) {
    currentApp.destroy(true);
    currentApp = null;
  }

  elements.canvasHost.replaceChildren();
  resetParameterUi();
}

function getElements(): SpikeElements {
  return {
    status: getElement("status", HTMLElement),
    modelUrlInput: getElement("model-url", HTMLInputElement),
    loadButton: getElement("load-button", HTMLButtonElement),
    forceReloadButton: getElement("force-reload-button", HTMLButtonElement),
    canvasHost: getElement("canvas-host", HTMLElement),
    pixiVersion: getElement("pixi-version", HTMLElement),
    engineVersion: getElement("engine-version", HTMLElement),
    cubismCoreLoaded: getElement("cubism-core-loaded", HTMLElement),
    currentModelUrl: getElement("current-model-url", HTMLElement),
    browserUrl: getElement("browser-url", HTMLElement),
    actualLoadedUrl: getElement("actual-loaded-url", HTMLElement),
    lastHttpStatus: getElement("last-http-status", HTMLElement),
    lastLoadedAt: getElement("last-loaded-at", HTMLElement),
    viewerWidthSlider: getElement("viewer-width-slider", HTMLInputElement),
    viewerWidthValue: getElement("viewer-width-value", HTMLElement),
    viewerHeightSlider: getElement("viewer-height-slider", HTMLInputElement),
    viewerHeightValue: getElement("viewer-height-value", HTMLElement),
    modelScaleSlider: getElement("model-scale-slider", HTMLInputElement),
    modelScaleValue: getElement("model-scale-value", HTMLElement),
    modelOffsetXSlider: getElement("model-offset-x-slider", HTMLInputElement),
    modelOffsetXValue: getElement("model-offset-x-value", HTMLElement),
    modelOffsetYSlider: getElement("model-offset-y-slider", HTMLInputElement),
    modelOffsetYValue: getElement("model-offset-y-value", HTMLElement),
    fitToHeightButton: getElement("fit-to-height-button", HTMLButtonElement),
    centerModelButton: getElement("center-model-button", HTMLButtonElement),
    resetTransformButton: getElement("reset-transform-button", HTMLButtonElement),
    validatedTransformDisplay: getElement("validated-transform-display", HTMLElement),
    currentTransformDisplay: getElement("current-transform-display", HTMLElement),
    viewerSizeDisplay: getElement("viewer-size-display", HTMLElement),
    modelScaleDisplay: getElement("model-scale-display", HTMLElement),
    modelOffsetDisplay: getElement("model-offset-display", HTMLElement),
    modelPositionDisplay: getElement("model-position-display", HTMLElement),
    modelRenderedSizeDisplay: getElement("model-rendered-size-display", HTMLElement),
    parameterCount: getElement("parameter-count", HTMLElement),
    parameterIdSource: getElement("parameter-id-source", HTMLElement),
    parameterList: getElement("parameter-list", HTMLPreElement),
    candidateMouthParameters: getElement("candidate-mouth-parameters", HTMLElement),
    selectedMouthParameter: getElement("selected-mouth-parameter", HTMLElement),
    selectedParameterIndex: getElement("selected-parameter-index", HTMLElement),
    setApiUsed: getElement("set-api-used", HTMLElement),
    beforeParameterValue: getElement("before-parameter-value", HTMLElement),
    afterParameterValue: getElement("after-parameter-value", HTMLElement),
    mouthParameterInput: getElement("mouth-parameter-input", HTMLInputElement),
    mouthSlider: getElement("mouth-slider", HTMLInputElement),
    mouthSliderValue: getElement("mouth-slider-value", HTMLElement),
    mouthParameterStatus: getElement("mouth-parameter-status", HTMLElement),
    audioFileInput: getElement("audio-file-input", HTMLInputElement),
    audioPlayButton: getElement("audio-play-button", HTMLButtonElement),
    audioStopButton: getElement("audio-stop-button", HTMLButtonElement),
    mouthSyncEnabled: getElement("mouth-sync-enabled", HTMLInputElement),
    resetMouthOnStop: getElement("reset-mouth-on-stop", HTMLInputElement),
    resetManualSliderButton: getElement("reset-manual-slider-button", HTMLButtonElement),
    mouthGainSlider: getElement("mouth-gain-slider", HTMLInputElement),
    mouthGainValue: getElement("mouth-gain-value", HTMLElement),
    mouthSmoothingSlider: getElement("mouth-smoothing-slider", HTMLInputElement),
    mouthSmoothingValue: getElement("mouth-smoothing-value", HTMLElement),
    currentRms: getElement("current-rms", HTMLElement),
    currentAudioMouthValue: getElement("current-audio-mouth-value", HTMLElement),
    mouthControlSource: getElement("mouth-control-source", HTMLElement),
    isAudioPlaying: getElement("is-audio-playing", HTMLElement),
    manualMouthValue: getElement("manual-mouth-value", HTMLElement),
    audioMouthValue: getElement("audio-mouth-value", HTMLElement),
    appliedMouthValue: getElement("applied-mouth-value", HTMLElement),
    audioTargetParameter: getElement("audio-target-parameter", HTMLElement),
    audioTargetIndex: getElement("audio-target-index", HTMLElement),
    audioSetApiUsed: getElement("audio-set-api-used", HTMLElement),
    audioStatus: getElement("audio-status", HTMLElement),
    lastEndedBehavior: getElement("last-ended-behavior", HTMLElement),
    resetAppliedMouthEnabled: getElement("reset-applied-mouth-enabled", HTMLElement),
    lastResetAffected: getElement("last-reset-affected", HTMLElement),
    audioErrorOutput: getElement("audio-error-output", HTMLPreElement),
    ttsEndpointInput: getElement("tts-endpoint-input", HTMLInputElement),
    ttsTextInput: getElement("tts-text-input", HTMLTextAreaElement),
    ttsGeneratePlayButton: getElement("tts-generate-play-button", HTMLButtonElement),
    ttsStopButton: getElement("tts-stop-button", HTMLButtonElement),
    ttsStatus: getElement("tts-status", HTMLElement),
    ttsLastAudioUrl: getElement("tts-last-audio-url", HTMLElement),
    ttsRequestDurationMs: getElement("tts-request-duration-ms", HTMLElement),
    ttsErrorOutput: getElement("tts-error-output", HTMLPreElement),
    errorOutput: getElement("error-output", HTMLPreElement),
  };
}

function getElement<T extends HTMLElement>(
  id: string,
  constructor: {
    new (): T;
  },
) {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing #${id} element.`);
  }

  return element;
}

function setStatus(status: SpikeStatus) {
  elements.status.textContent = status;
}

function setError(error: string | null) {
  elements.errorOutput.hidden = error === null;
  elements.errorOutput.textContent = error ?? "";
}

function addCacheBuster(modelUrl: string) {
  return modelUrl.includes("?") ? `${modelUrl}&v=${Date.now()}` : `${modelUrl}?v=${Date.now()}`;
}

function isCubismCoreLoaded() {
  return Boolean((window as any).Live2DCubismCore);
}

function updateCubismCoreStatus() {
  elements.cubismCoreLoaded.textContent = isCubismCoreLoaded() ? "yes" : "no";
}

function exposeModelForDebug(
  model: unknown,
  app: Application,
  parameterIds: string[],
  parameterRawIds: unknown[],
) {
  const internalModel = (model as any)?.internalModel;
  const coreModel = internalModel?.coreModel;
  (window as any).__live2dModel = model;
  (window as any).__live2dInternalModel = internalModel;
  (window as any).__live2dCoreModel = coreModel;
  (window as any).__live2dApp = app;
  (window as any).__live2dParameterIds = parameterIds;
  (window as any).__live2dParameterRawIds = parameterRawIds;
  (window as any).__parameterIds = parameterIds;
}

function exploreParameters(model: unknown): ParameterDiagnostic {
  const internalModel = safeGetObject(model, "internalModel");
  const coreModel = safeGetObject(internalModel, "coreModel");
  const rawCoreModel = safeGetObject(coreModel, "_model");
  const settings = safeGetObject(internalModel, "settings");
  const count = safeCallNumber(coreModel, "getParameterCount");
  const idResult = extractParameterIds(model, internalModel, coreModel, count);
  const ids = idResult.ids;
  const candidates = ids.filter(isMouthParameterId);

  console.log("Live2D parameter exploration", {
    model,
    modelKeys: safeKeys(model),
    internalModel,
    internalModelKeys: safeKeys(internalModel),
    coreModel,
    coreModelKeys: safeKeys(coreModel),
    rawCoreModel,
    rawCoreModelKeys: safeKeys(rawCoreModel),
    settings,
    settingsKeys: safeKeys(settings),
    parameterCount: count,
    parameterIdSource: idResult.source,
    parameterIdsResolved: idResult.resolved,
    parameterIds: ids,
    parameterValues: safeCallArrayLike(coreModel, "getParameterValues"),
    parameterMinimumValues: safeCallArrayLike(coreModel, "getParameterMinimumValues"),
    parameterMaximumValues: safeCallArrayLike(coreModel, "getParameterMaximumValues"),
    parameterDefaultValues: safeCallArrayLike(coreModel, "getParameterDefaultValues"),
    candidateMouthParameters: candidates,
  });

  return {
    count,
    ids,
    rawIds: idResult.rawIds,
    idSource: idResult.source,
    idsResolved: idResult.resolved,
    candidates,
  };
}

function updateParameterUi(diagnostic: ParameterDiagnostic) {
  currentParameterIds = diagnostic.idsResolved ? diagnostic.ids : [];
  currentParameterRawIds = diagnostic.idsResolved ? diagnostic.rawIds : [];
  elements.parameterCount.textContent =
    diagnostic.count === null ? "unknown" : String(diagnostic.count);
  elements.parameterIdSource.textContent = diagnostic.idSource;
  elements.parameterList.textContent = diagnostic.idsResolved
    ? diagnostic.ids.join("\n")
    : "Parameter IDs could not be resolved from engine API.";
  elements.candidateMouthParameters.textContent =
    diagnostic.candidates.length > 0 ? diagnostic.candidates.join(", ") : "none";

  const mouthParameter = findMouthParameter(diagnostic.ids);
  if (mouthParameter.parameterId) {
    elements.mouthParameterInput.value = mouthParameter.parameterId;
  }

  updateSelectedParameterUi(elements.mouthParameterInput.value.trim());
}

function resetParameterUi() {
  currentParameterIds = [];
  currentParameterRawIds = [];
  elements.parameterCount.textContent = "none";
  elements.parameterIdSource.textContent = "none";
  elements.parameterList.textContent = "none";
  elements.candidateMouthParameters.textContent = "none";
  elements.selectedMouthParameter.textContent = "none";
  elements.selectedParameterIndex.textContent = "none";
  elements.setApiUsed.textContent = "none";
  elements.beforeParameterValue.textContent = "none";
  elements.afterParameterValue.textContent = "none";
  elements.mouthParameterStatus.textContent = "idle";
}

function resetAudioUi() {
  audioMouthValue = 0;
  appliedMouthValue = 0;
  isAudioPlaying = false;
  elements.isAudioPlaying.textContent = "false";
  elements.currentRms.textContent = "0.0000";
  elements.currentAudioMouthValue.textContent = "0.0000";
  elements.manualMouthValue.textContent = manualMouthValue.toFixed(4);
  elements.audioMouthValue.textContent = "0.0000";
  elements.appliedMouthValue.textContent = "0.0000";
  elements.audioTargetParameter.textContent = "ParamMouthOpenY";
  elements.audioTargetIndex.textContent = "50";
  elements.audioSetApiUsed.textContent = "setParameterValueByIndex";
  elements.audioStatus.textContent = "idle";
  elements.lastEndedBehavior.textContent = "none";
  elements.resetAppliedMouthEnabled.textContent = String(elements.resetMouthOnStop.checked);
  elements.lastResetAffected.textContent = "none";
  setAudioError(null);
  updateAudioControlLabels();
  updateMouthControlSource();
}

function updateAudioControlLabels() {
  elements.mouthGainValue.textContent = Number(elements.mouthGainSlider.value).toFixed(1);
  elements.mouthSmoothingValue.textContent = Number(elements.mouthSmoothingSlider.value).toFixed(2);
}

function resetTtsUi() {
  elements.ttsStatus.textContent = "idle";
  elements.ttsLastAudioUrl.textContent = "none";
  elements.ttsRequestDurationMs.textContent = "none";
  setTtsError(null);
}

async function generateAndPlayIndexTts() {
  const endpoint = elements.ttsEndpointInput.value.trim() || "http://localhost:7861/tts";
  const text = elements.ttsTextInput.value.trim();
  setTtsError(null);
  elements.ttsLastAudioUrl.textContent = "none";
  elements.ttsRequestDurationMs.textContent = "none";

  if (!text) {
    elements.ttsStatus.textContent = "error";
    setTtsError("TTS text is empty.");
    return;
  }

  const startedAt = performance.now();
  elements.ttsStatus.textContent = "requesting";
  elements.ttsGeneratePlayButton.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const durationMs = performance.now() - startedAt;
    elements.ttsRequestDurationMs.textContent = durationMs.toFixed(0);

    if (!response.ok) {
      const responseText = await safeReadResponseText(response);
      throw new Error(`IndexTTS2 HTTP ${response.status}: ${responseText}`);
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    if (!isAudioResponseContentType(contentType)) {
      const responseText = await safeReadResponseText(response.clone());
      throw new Error(`IndexTTS2 response is not audio. Content-Type: ${contentType || "unknown"}. ${responseText}`);
    }

    const audioBlob = await response.blob();
    if (audioBlob.size <= 0) {
      throw new Error("IndexTTS2 returned an empty audio blob.");
    }

    const blobUrl = URL.createObjectURL(audioBlob);
    elements.ttsLastAudioUrl.textContent = blobUrl;
    elements.ttsStatus.textContent = "playing";
    await playAudioUrlWithAnalyser(blobUrl);
  } catch (error) {
    console.error("IndexTTS2 Generate & Play failed:", error);
    elements.ttsStatus.textContent = "error";
    if (isLikelyNetworkError(error)) {
      setTtsError(`IndexTTS2 server not reachable: ${endpoint}`);
    } else {
      setTtsError(getErrorDetails(error));
    }
    stopAudioMouthSync("error");
  } finally {
    elements.ttsGeneratePlayButton.disabled = false;
  }
}

async function playAudioMouthSync() {
  setAudioError(null);

  try {
    const file = elements.audioFileInput.files?.[0];
    if (!file) {
      setAudioStatus("error");
      setAudioError("Please choose a .wav, .mp3, or .ogg file first.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    await playAudioUrlWithAnalyser(objectUrl);
  } catch (error) {
    console.error("Audio mouth sync play failed:", error);
    setAudioStatus("error");
    setAudioError(getErrorDetails(error));
    stopAudioMouthSync("error");
  }
}

async function playAudioUrlWithAnalyser(url: string) {
  stopAudioMouthSync("idle", { applyEndedBehavior: false });
  if (fadeoutAnimationFrameId !== null) {
    window.cancelAnimationFrame(fadeoutAnimationFrameId);
    fadeoutAnimationFrameId = null;
  }
  audioObjectUrl = url;

  audioElement = new Audio(url);
  audioElement.crossOrigin = "anonymous";
  audioElement.addEventListener("ended", handleAudioEnded);
  audioElement.addEventListener("error", handleAudioElementError);

  audioPipeline = await createAudioAnalyserPipeline(audioElement);

  audioMouthValue = 0;
  isAudioPlaying = true;
  elements.isAudioPlaying.textContent = "true";
  updateMouthControlSource();
  setAudioStatus("playing");
  audioAnimationFrameId = window.requestAnimationFrame(updateAudioMouthSyncFrame);
  await audioElement.play();
}

function stopAudioMouthSync(
  nextStatus = "idle",
  options: { applyEndedBehavior: boolean; reason?: "stop" | "ended" | "error" } = {
    applyEndedBehavior: true,
    reason: "stop",
  },
) {
  const wasMouthSyncEnabled = elements.mouthSyncEnabled.checked;
  cleanupAudioPlaybackResources();
  if (options.applyEndedBehavior) {
    handleAudioStoppedMouthTransition(options.reason ?? "stop", wasMouthSyncEnabled);
  }
  setAudioStatus(nextStatus);
}

function cleanupAudioPlaybackResources() {
  if (audioAnimationFrameId !== null) {
    window.cancelAnimationFrame(audioAnimationFrameId);
    audioAnimationFrameId = null;
  }

  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.removeEventListener("ended", handleAudioEnded);
    audioElement.removeEventListener("error", handleAudioElementError);
    audioElement = null;
  }

  cleanupAudioPipeline(audioPipeline);
  audioPipeline = null;

  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = null;
  }

  isAudioPlaying = false;
  elements.isAudioPlaying.textContent = "false";
  audioMouthValue = 0;
  elements.currentRms.textContent = "0.0000";
  elements.currentAudioMouthValue.textContent = "0.0000";
  elements.audioMouthValue.textContent = "0.0000";
  updateMouthControlSource();
}

function handleAudioEnded() {
  if (elements.ttsStatus.textContent === "playing") {
    elements.ttsStatus.textContent = "finished";
  }
  stopAudioMouthSync("idle", { applyEndedBehavior: true, reason: "ended" });
}

function handleAudioElementError() {
  setAudioStatus("error");
  setAudioError("Audio load error.");
  stopAudioMouthSync("error", { applyEndedBehavior: true, reason: "error" });
}

function handleAudioStoppedMouthTransition(reason: "stop" | "ended" | "error", wasMouthSyncEnabled: boolean) {
  if (reason === "ended" && !wasMouthSyncEnabled) {
    elements.lastEndedBehavior.textContent = "return to manual";
    elements.lastResetAffected.textContent = "none";
    applyMouthValue(manualMouthValue, "manual");
    return;
  }

  if (elements.resetMouthOnStop.checked) {
    elements.lastEndedBehavior.textContent = "fadeout to zero";
    elements.lastResetAffected.textContent = "applied only";
    startMouthFadeout(appliedMouthValue, 0, 160);
    return;
  }

  elements.lastEndedBehavior.textContent = "return to manual";
  elements.lastResetAffected.textContent = "none";
  applyMouthValue(manualMouthValue, "manual");
}

function startMouthFadeout(fromValue: number, toValue: number, durationMs: number) {
  if (fadeoutAnimationFrameId !== null) {
    window.cancelAnimationFrame(fadeoutAnimationFrameId);
    fadeoutAnimationFrameId = null;
  }

  const startedAt = performance.now();
  const from = clamp(fromValue, 0, 1);
  const to = clamp(toValue, 0, 1);

  const tick = (now: number) => {
    const progress = clamp((now - startedAt) / durationMs, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = from + (to - from) * eased;
    applyMouthValue(value, "fadeout");

    if (progress < 1) {
      fadeoutAnimationFrameId = window.requestAnimationFrame(tick);
      return;
    }

    fadeoutAnimationFrameId = null;
    applyMouthValue(to, "reset");
  };

  fadeoutAnimationFrameId = window.requestAnimationFrame(tick);
}

function updateAudioMouthSyncFrame() {
  try {
    if (!audioElement || !audioPipeline) {
      return;
    }

    const rms = computeRmsFromAnalyser(audioPipeline.analyser);
    const gain = Number(elements.mouthGainSlider.value);
    const smoothing = clamp(Number(elements.mouthSmoothingSlider.value), 0, 0.95);
    audioMouthValue = computeMouthValue(rms, gain, smoothing, audioMouthValue);

    elements.currentRms.textContent = rms.toFixed(4);
    elements.currentAudioMouthValue.textContent = audioMouthValue.toFixed(4);
    elements.audioMouthValue.textContent = audioMouthValue.toFixed(4);

    applyCurrentMouthControlValue();
  } catch (error) {
    console.error("Audio analyser error:", error);
    setAudioStatus("error");
    setAudioError(getErrorDetails(error));
  } finally {
    if (audioElement && audioPipeline) {
      audioAnimationFrameId = window.requestAnimationFrame(updateAudioMouthSyncFrame);
    }
  }
}

function applyMouthValue(value: number, source: "manual" | "audio" | "reset" | "fadeout") {
  const coreModel = (currentModel as any)?.internalModel?.coreModel;
  elements.mouthControlSource.textContent = formatMouthSource(source);
  elements.audioSetApiUsed.textContent = "setParameterValueByIndex";

  try {
    const clampedValue = applyLive2dMouthValue(coreModel, 50, value);
    appliedMouthValue = clampedValue;
    elements.appliedMouthValue.textContent = appliedMouthValue.toFixed(4);
    renderLive2dFrame();
  } catch (error) {
    console.warn("Live2D mouth value write failed:", error);
    setAudioError(getErrorDetails(error));
  }
}

function getMouthControlSource() {
  if (elements.mouthSyncEnabled.checked && isAudioPlaying) {
    return "audio";
  }

  return "manual";
}

function applyCurrentMouthControlValue() {
  if (getMouthControlSource() === "audio") {
    applyMouthValue(audioMouthValue, "audio");
    return;
  }

  applyMouthValue(manualMouthValue, "manual");
}

function updateMouthControlSource() {
  elements.mouthControlSource.textContent = formatMouthSource(getMouthControlSource());
}

function formatMouthSource(source: "manual" | "audio" | "reset" | "fadeout") {
  switch (source) {
    case "audio":
      return "audio";
    case "fadeout":
      return "fadeout";
    case "reset":
      return "reset";
    case "manual":
    default:
      return "manual";
  }
}

function renderLive2dFrame() {
  try {
    const app = currentApp as any;
    app?.render?.();
    app?.renderer?.render?.(app.stage);
  } catch (error) {
    console.warn("Live2D render failed after mouth value update:", error);
  }
}

function setAudioStatus(status: string) {
  elements.audioStatus.textContent = status;
}

function setAudioError(error: string | null) {
  elements.audioErrorOutput.hidden = error === null;
  elements.audioErrorOutput.textContent = error ?? "";
}

function setTtsError(error: string | null) {
  elements.ttsErrorOutput.hidden = error === null;
  elements.ttsErrorOutput.textContent = error ?? "";
}

async function safeReadResponseText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function isAudioResponseContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("audio/") ||
    normalized.includes("application/octet-stream")
  );
}

function isLikelyNetworkError(error: unknown) {
  return error instanceof TypeError;
}

function updateMouthSliderValue() {
  manualMouthValue = clamp01(Number(elements.mouthSlider.value));
  elements.mouthSliderValue.textContent = manualMouthValue.toFixed(2);
  elements.manualMouthValue.textContent = manualMouthValue.toFixed(4);
}

function resetManualSlider() {
  manualMouthValue = 0;
  elements.mouthSlider.value = "0";
  updateMouthSliderValue();
  elements.lastResetAffected.textContent = "manual slider";

  if (getMouthControlSource() === "manual") {
    applyMouthValue(0, "manual");
  }
}

function testMouthParameter() {
  if (getMouthControlSource() === "audio") {
    elements.mouthParameterStatus.textContent =
      "Manual slider paused: audio analyser controls the mouth";
    return;
  }

  const parameterId = elements.mouthParameterInput.value.trim();
  const value = clamp01(Number(elements.mouthSlider.value));

  if (!currentModel) {
    elements.mouthParameterStatus.textContent = "Mouth parameter update failed: model is not loaded";
    return;
  }

  if (!parameterId) {
    elements.mouthParameterStatus.textContent =
      "Mouth parameter update failed: parameter id is empty";
    return;
  }

  updateSelectedParameterUi(parameterId);
  const index = currentParameterIds.indexOf(parameterId);
  const beforeValue = readParameterValue(currentModel, parameterId, index);
  if (index < 0) {
    elements.mouthParameterStatus.textContent = "Mouth parameter update failed: parameter id not found";
    elements.selectedParameterIndex.textContent = "none";
    elements.setApiUsed.textContent = "none";
    elements.beforeParameterValue.textContent = formatNullableNumber(beforeValue);
    elements.afterParameterValue.textContent = formatNullableNumber(beforeValue);
    return;
  }

  applyCurrentMouthControlValue();
  const afterValue = readParameterValue(currentModel, parameterId, index);
  elements.selectedParameterIndex.textContent = formatNullableNumber(index);
  elements.setApiUsed.textContent = "coreModel.setParameterValueByIndex";
  elements.beforeParameterValue.textContent = formatNullableNumber(beforeValue);
  elements.afterParameterValue.textContent = formatNullableNumber(afterValue);
  elements.mouthParameterStatus.textContent = "Mouth parameter update: success (setParameterValueByIndex)";
  console.log("Live2D mouth parameter test", {
    selectedMouthParameter: parameterId,
    selectedParameterIndex: index,
    value,
    api: "coreModel.setParameterValueByIndex",
    beforeValue,
    afterValue,
  });
}

function setLive2dParameter(model: unknown, parameterId: string, value: number): SetParameterResult {
  const internalModel = safeGetObject(model, "internalModel");
  const coreModel = safeGetObject(internalModel, "coreModel");
  const index = currentParameterIds.indexOf(parameterId);
  const beforeValue = readParameterValue(model, parameterId, index);

  if (index < 0) {
    return {
      success: false,
      reason: "parameter id not found",
      index,
      beforeValue,
      afterValue: beforeValue,
    };
  }

  const setByIndex = safeGetFunction(coreModel, "setParameterValueByIndex");
  if (setByIndex) {
    try {
      setByIndex.call(coreModel, index, value);
      const afterValue = readParameterValue(model, parameterId, index);
      const isApplied = afterValue !== null && Math.abs(afterValue - value) < 0.001;
      console.log("Live2D set parameter API used", {
        api: "coreModel.setParameterValueByIndex",
        parameterId,
        index,
        beforeValue,
        afterValue,
        expectedValue: value,
        isApplied,
      });

      if (isApplied) {
        return {
          success: true,
          api: "coreModel.setParameterValueByIndex",
          index,
          beforeValue,
          afterValue,
        };
      }

      return {
        success: false,
        reason: "setParameterValueByIndex did not update _parameterValues",
        index,
        beforeValue,
        afterValue,
      };
    } catch (error) {
      console.warn("Live2D coreModel.setParameterValueByIndex failed:", error);
    }
  }

  const fallbackResult = setLive2dParameterByIdFallback(model, coreModel, internalModel, parameterId, value, index, beforeValue);
  if (fallbackResult.success) {
    return fallbackResult;
  }

  return {
    success: false,
    reason: fallbackResult.reason,
    index,
    beforeValue,
    afterValue: readParameterValue(model, parameterId, index),
  };
}

function setLive2dParameterByIdFallback(
  model: unknown,
  coreModel: unknown,
  internalModel: unknown,
  parameterId: string,
  value: number,
  index: number,
  beforeValue: number | null,
): SetParameterResult {
  const rawId = currentParameterRawIds[index] ?? null;
  const attempts: Array<{
    owner: unknown;
    method: string;
    api: string;
    args: unknown[];
  }> = [
    {
      owner: coreModel,
      method: "setParameterValueById",
      api: "coreModel.setParameterValueById",
      args: [parameterId, value],
    },
    {
      owner: rawId ? coreModel : null,
      method: "setParameterValueById",
      api: "coreModel.setParameterValueById(rawId)",
      args: [rawId, value],
    },
    {
      owner: internalModel,
      method: "setParameterValueById",
      api: "internalModel.setParameterValueById",
      args: [parameterId, value],
    },
    {
      owner: model,
      method: "setParameterValueById",
      api: "model.setParameterValueById",
      args: [parameterId, value],
    },
  ];

  for (const attempt of attempts) {
    const fn = safeGetFunction(attempt.owner, attempt.method);
    if (!fn) {
      continue;
    }

    try {
      fn.apply(attempt.owner, attempt.args);
      const afterValue = readParameterValue(model, parameterId, index);
      if (afterValue !== null && Math.abs(afterValue - value) < 0.001) {
        return { success: true, api: attempt.api, index, beforeValue, afterValue };
      }
    } catch (error) {
      console.warn(`Live2D ${attempt.api} fallback failed:`, error);
    }
  }

  return {
    success: false,
    reason: "setParameterValueByIndex unavailable or failed; id fallback did not update value",
    index,
    beforeValue,
    afterValue: readParameterValue(model, parameterId, index),
  };
}

function requestRender() {
  try {
    const model = currentModel as any;
    model?.update?.(0);
  } catch (error) {
    console.warn("Live2D model update failed after parameter test:", error);
  }

  try {
    const coreModel = (currentModel as any)?.internalModel?.coreModel;
    coreModel?.update?.();
  } catch (error) {
    console.warn("Live2D core model update failed after parameter test:", error);
  }

  try {
    const app = currentApp as any;
    app?.render?.();
    app?.renderer?.render?.(app.stage);
  } catch (error) {
    console.warn("Live2D render request failed after parameter test:", error);
  }
}

function extractParameterIds(
  model: unknown,
  internalModel: unknown,
  coreModel: unknown,
  count: number | null,
) {
  const discovered = discoverParameterIds(coreModel);
  if (discovered.parameterIds.length > 0) {
    return {
      ids: discovered.parameterIds,
      rawIds: discovered.rawIds,
      source: "discoverParameterIds(coreModel._model.parameters.ids)",
      resolved: true,
    };
  }

  const sources: Array<{ source: string; read: () => unknown[] }> = [
    {
      source: "coreModel._model.parameters.ids",
      read: () => safeGetPathArrayLike(coreModel, ["_model", "parameters", "ids"]),
    },
    {
      source: "coreModel._model.parameters.Ids",
      read: () => safeGetPathArrayLike(coreModel, ["_model", "parameters", "Ids"]),
    },
    {
      source: "coreModel.getParameterIds",
      read: () => safeCallArrayLike(coreModel, "getParameterIds"),
    },
    {
      source: "coreModel.getParameterId(index)",
      read: () => readIdsWithGetParameterId(coreModel, count),
    },
    {
      source: "coreModel._parameterIds",
      read: () => safeGetArrayLike(coreModel, "_parameterIds"),
    },
    {
      source: "coreModel.parameterIds",
      read: () => safeGetArrayLike(coreModel, "parameterIds"),
    },
    {
      source: "internalModel.parameterIds",
      read: () => safeGetArrayLike(internalModel, "parameterIds"),
    },
    {
      source: "model.parameterIds",
      read: () => safeGetArrayLike(model, "parameterIds"),
    },
  ];

  for (const source of sources) {
    try {
      const rawIds = source.read();
      const normalizedPairs = rawIds
        .map((rawId) => ({ rawId, id: normalizeParameterId(rawId) }))
        .filter((entry) => isUsableParameterId(entry.id));
      const ids = normalizedPairs.map((entry) => entry.id);
      if (ids.length > 0) {
        return {
          ids,
          rawIds: normalizedPairs.map((entry) => entry.rawId),
          source: source.source,
          resolved: true,
        };
      }
    } catch (error) {
      console.warn(`Live2D parameter ID source failed: ${source.source}`, error);
    }
  }

  return { ids: [], rawIds: [], source: "unresolved", resolved: false };
}

function isMouthParameterId(parameterId: string) {
  const lowerId = parameterId.toLowerCase();
  return (
    lowerId.includes("mouth") ||
    lowerId.includes("lip") ||
    parameterId.includes("\u53e3") ||
    lowerId.includes("kuchi")
  );
}

function readIdsWithGetParameterId(coreModel: unknown, count: number | null) {
  const fn = safeGetFunction(coreModel, "getParameterId");
  if (!fn || typeof count !== "number" || count <= 0) {
    return [];
  }

  const ids: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    try {
      ids.push(fn.call(coreModel, index));
    } catch (error) {
      console.warn(`Live2D getParameterId(${index}) failed:`, error);
    }
  }

  return ids;
}

function isUsableParameterId(id: string) {
  return Boolean(id.trim()) && !id.startsWith("#") && id !== "[object Object]";
}

function readParameterValue(model: unknown, parameterId: string, index: number) {
  const internalModel = safeGetObject(model, "internalModel");
  const coreModel = safeGetObject(internalModel, "coreModel");
  const rawId = index >= 0 ? currentParameterRawIds[index] : null;

  if (index >= 0) {
    const directValue = safeGetPathArrayLike(coreModel, ["_parameterValues"])[index];
    if (typeof directValue === "number") {
      return directValue;
    }
  }

  const idReaders: Array<{ owner: unknown; method: string; args: unknown[] }> = [
    { owner: coreModel, method: "getParameterValueById", args: [parameterId] },
    { owner: rawId ? coreModel : null, method: "getParameterValueById", args: [rawId] },
    { owner: internalModel, method: "getParameterValueById", args: [parameterId] },
    { owner: rawId ? internalModel : null, method: "getParameterValueById", args: [rawId] },
    { owner: model, method: "getParameterValueById", args: [parameterId] },
    { owner: rawId ? model : null, method: "getParameterValueById", args: [rawId] },
  ];

  for (const reader of idReaders) {
    const value = safeCallNumberWithArgs(reader.owner, reader.method, reader.args);
    if (value !== null) {
      return value;
    }
  }

  if (index >= 0) {
    const indexReaders: Array<{ owner: unknown; method: string }> = [
      { owner: coreModel, method: "getParameterValueByIndex" },
      { owner: internalModel, method: "getParameterValueByIndex" },
      { owner: model, method: "getParameterValueByIndex" },
    ];

    for (const reader of indexReaders) {
      const value = safeCallNumberWithArgs(reader.owner, reader.method, [index]);
      if (value !== null) {
        return value;
      }
    }

    const valueArrays = [
      safeCallArrayLike(coreModel, "getParameterValues"),
      safeGetPathArrayLike(coreModel, ["_model", "parameters", "values"]),
      safeGetPathArrayLike(coreModel, ["_model", "parameters", "Values"]),
    ];

    for (const values of valueArrays) {
      const value = values[index];
      if (typeof value === "number") {
        return value;
      }
    }
  }

  return null;
}

function updateSelectedParameterUi(parameterId: string) {
  const index = currentParameterIds.indexOf(parameterId);
  elements.selectedMouthParameter.textContent = parameterId || "none";
  elements.selectedParameterIndex.textContent = formatNullableNumber(index >= 0 ? index : null);
}

function formatNullableNumber(value: number | null) {
  return value === null ? "none" : String(Number.isInteger(value) ? value : Number(value).toFixed(4));
}

function safeGetObject(owner: unknown, property: string) {
  try {
    const value = (owner as any)?.[property];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function safeGetFunction(owner: unknown, property: string) {
  try {
    const value = (owner as any)?.[property];
    return typeof value === "function" ? value : null;
  } catch {
    return null;
  }
}

function safeCallNumber(owner: unknown, method: string) {
  try {
    const fn = safeGetFunction(owner, method);
    if (!fn) {
      return null;
    }

    const value = fn.call(owner);
    return typeof value === "number" ? value : null;
  } catch (error) {
    console.warn(`Live2D ${method} failed:`, error);
    return null;
  }
}

function safeCallNumberWithArgs(owner: unknown, method: string, args: unknown[]) {
  try {
    const fn = safeGetFunction(owner, method);
    if (!fn) {
      return null;
    }

    const value = fn.apply(owner, args);
    return typeof value === "number" ? value : null;
  } catch (error) {
    console.warn(`Live2D ${method} failed:`, error);
    return null;
  }
}

function safeCallArrayLike(owner: unknown, method: string) {
  try {
    const fn = safeGetFunction(owner, method);
    if (!fn) {
      return [];
    }

    return toArray(fn.call(owner));
  } catch (error) {
    console.warn(`Live2D ${method} failed:`, error);
    return [];
  }
}

function safeGetArrayLike(owner: unknown, property: string) {
  try {
    return toArray((owner as any)?.[property]);
  } catch {
    return [];
  }
}

function safeGetPathArrayLike(owner: unknown, pathParts: string[]) {
  try {
    let value = owner as any;
    for (const pathPart of pathParts) {
      value = value?.[pathPart];
    }

    return toArray(value);
  } catch {
    return [];
  }
}

function toArray(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return Array.from(value as ArrayLike<unknown>);
  }

  if (typeof value === "object" && typeof (value as any).get === "function") {
    const size = Number((value as any).size ?? (value as any).length ?? 0);
    return Array.from({ length: size }, (_, index) => (value as any).get(index));
  }

  if (typeof value === "object" && typeof (value as any).length === "number") {
    return Array.from(value as ArrayLike<unknown>);
  }

  return [];
}

function safeKeys(value: unknown) {
  try {
    return value && typeof value === "object" ? Object.keys(value) : [];
  } catch {
    return [];
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? ""}`.trim();
  }

  return String(error);
}

window.addEventListener("beforeunload", () => {
  void destroyCurrentRuntime();
});
