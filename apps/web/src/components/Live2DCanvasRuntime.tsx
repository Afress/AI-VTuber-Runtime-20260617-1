import { useEffect, useRef, useState, type CSSProperties } from "react";

type Live2DCanvasRuntimeProps = {
  modelUrl?: string;
  mouthValue?: number;
  mouthSyncEnabled?: boolean;
  audioPlaying?: boolean;
};

type Live2DStatus = "idle" | "loading" | "loaded" | "error";
type RuntimeStatus = "mounted" | "loading" | "ready" | "disposed";
type ControlSource = "audio" | "manual";
type FacingMode =
  | "fixed-front"
  | "mouse-follow-eyes-only"
  | "mouse-follow-head-eyes"
  | "mouse-follow-body-head-eyes";
type PointerLeaveBehavior = "return-to-center" | "keep-last";
type PointerTarget = {
  nx: number;
  ny: number;
  active: boolean;
  lastEventAt: number;
  clientX: number;
  clientY: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  insideViewer: boolean;
};

type FacingIndices = {
  angleX: number;
  angleY: number;
  angleZ: number;
  bodyAngleX: number;
  bodyAngleY: number;
  bodyAngleZ: number;
  bodyAngleZ2: number;
  eyeBallX: number;
  eyeBallY: number;
};

type FacingValues = {
  bodyX: number;
  bodyY: number;
  bodyZ: number;
  bodyZ2: number;
  headX: number;
  headY: number;
  headZ: number;
  eyeBallX: number;
  eyeBallY: number;
};

type FacingComputation = {
  branch: string;
  target: FacingValues;
  shouldApply: boolean;
  skipReason: string;
};

const VIEWER_WIDTH = 520;
const VIEWER_HEIGHT = 720;
const MODEL_SCALE = 0.5;
const MODEL_OFFSET_X = 0;
const MODEL_OFFSET_Y = 317;
const MOUTH_PARAMETER_ID = "ParamMouthOpenY";
const MOUTH_PARAMETER_INDEX = 50;
const STORAGE_KEYS = {
  facingMode: "ai-vtuber.live2d.facingMode",
  facingEnabled: "ai-vtuber.live2d.facingEnabled",
  // .v2: 舊 key 曾被 readStoredNumber 的 null→0 bug 寫成 0，換 key 讓預設值重新生效
  bodyFollowStrength: "ai-vtuber.live2d.bodyFollowStrength.v2",
  headFollowStrength: "ai-vtuber.live2d.headFollowStrength.v2",
  eyeFollowStrength: "ai-vtuber.live2d.eyeFollowStrength.v2",
  facingSmoothing: "ai-vtuber.live2d.facingSmoothing.v2",
  mouthSyncEnabled: "ai-vtuber.live2d.mouthSyncEnabled",
  invertFacingX: "ai-vtuber.live2d.invertFacingX",
  invertFacingY: "ai-vtuber.live2d.invertFacingY",
  pointerLeaveBehavior: "ai-vtuber.live2d.pointerLeaveBehavior",
} as const;

const DEFAULT_FACING_INDICES: FacingIndices = {
  angleX: -1,
  angleY: -1,
  angleZ: -1,
  bodyAngleX: -1,
  bodyAngleY: -1,
  bodyAngleZ: -1,
  bodyAngleZ2: -1,
  eyeBallX: -1,
  eyeBallY: -1,
};

const ZERO_FACING: FacingValues = {
  bodyX: 0,
  bodyY: 0,
  bodyZ: 0,
  bodyZ2: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  eyeBallX: 0,
  eyeBallY: 0,
};

let live2dPluginRegistered = false;

export function Live2DCanvasRuntime({
  modelUrl = "/live2d/model.model3.json",
  mouthValue,
  mouthSyncEnabled = false,
  audioPlaying = false,
}: Live2DCanvasRuntimeProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const coreModelRef = useRef<any>(null);
  const mouthParameterIndexRef = useRef(MOUTH_PARAMETER_INDEX);
  const parameterIdsRef = useRef<string[]>([]);
  const facingIndicesRef = useRef<FacingIndices>(DEFAULT_FACING_INDICES);
  const targetFacingRef = useRef<FacingValues>(ZERO_FACING);
  const currentFacingRef = useRef<FacingValues>(ZERO_FACING);
  const manualMouthValueRef = useRef(0);
  const incomingMouthValueRef = useRef<number | undefined>(mouthValue);
  const mouthSyncEnabledRef = useRef(false);
  const audioPlayingRef = useRef(false);
  const facingEnabledRef = useRef(true);
  const facingModeRef = useRef<FacingMode>("mouse-follow-head-eyes");
  const bodyFollowStrengthRef = useRef(0.8);
  const headFollowStrengthRef = useRef(0.75);
  const eyeFollowStrengthRef = useRef(0.9);
  const facingSmoothingRef = useRef(0.65);
  const invertFacingXRef = useRef(false);
  const invertFacingYRef = useRef(false);
  const facingStatusRef = useRef("idle");
  const pointerTargetRef = useRef<PointerTarget>({
    nx: 0,
    ny: 0,
    active: false,
    lastEventAt: 0,
    clientX: 0,
    clientY: 0,
    rectLeft: 0,
    rectTop: 0,
    rectWidth: 0,
    rectHeight: 0,
    insideViewer: false,
  });
  const pointerLeaveBehaviorRef = useRef<PointerLeaveBehavior>("return-to-center");
  const disposedRef = useRef(false);
  const cleanupDoneRef = useRef(false);
  const tickerCallbackRef = useRef<((ticker: unknown) => void) | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const loadTokenRef = useRef<symbol | null>(null);
  const [status, setStatus] = useState<Live2DStatus>("idle");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("mounted");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastCleanup, setLastCleanup] = useState("none");
  const [manualMouthValue, setManualMouthValue] = useState(0);
  const [appliedMouthValue, setAppliedMouthValue] = useState(0);
  const [applyStatus, setApplyStatus] = useState("idle");
  const [lastApplySource, setLastApplySource] = useState<ControlSource | "none">("none");
  const [lastApplySkippedReason, setLastApplySkippedReason] = useState("none");
  const [setApiUsed, setSetApiUsed] = useState("none");
  const [beforeValue, setBeforeValue] = useState<number | null>(null);
  const [afterValue, setAfterValue] = useState<number | null>(null);
  const [currentParameterValue, setCurrentParameterValue] = useState<number | null>(null);
  const [localMouthSyncEnabled, setLocalMouthSyncEnabled] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.mouthSyncEnabled, mouthSyncEnabled ?? true),
  );
  const [facingMode, setFacingMode] = useState<FacingMode>(() =>
    readStoredFacingMode(STORAGE_KEYS.facingMode, "mouse-follow-head-eyes"),
  );
  const [facingEnabled, setFacingEnabled] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.facingEnabled, true),
  );
  const [bodyFollowStrength, setBodyFollowStrength] = useState(() =>
    readStoredNumber(STORAGE_KEYS.bodyFollowStrength, 0.8, 0, 1),
  );
  const [headFollowStrength, setHeadFollowStrength] = useState(() =>
    readStoredNumber(STORAGE_KEYS.headFollowStrength, 0.75, 0, 1),
  );
  const [eyeFollowStrength, setEyeFollowStrength] = useState(() =>
    readStoredNumber(STORAGE_KEYS.eyeFollowStrength, 0.9, 0, 1),
  );
  const [facingSmoothing, setFacingSmoothing] = useState(() =>
    readStoredNumber(STORAGE_KEYS.facingSmoothing, 0.65, 0, 0.95),
  );
  const [invertFacingX, setInvertFacingX] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.invertFacingX, false),
  );
  const [invertFacingY, setInvertFacingY] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.invertFacingY, false),
  );
  const [pointerLeaveBehavior, setPointerLeaveBehavior] = useState<PointerLeaveBehavior>(() =>
    readStoredPointerLeaveBehavior(STORAGE_KEYS.pointerLeaveBehavior, "return-to-center"),
  );
  const [facingIndices, setFacingIndices] = useState<FacingIndices>(DEFAULT_FACING_INDICES);
  const [facingStatus, setFacingStatus] = useState("idle");
  const [builtInFocusDisabled, setBuiltInFocusDisabled] = useState("unknown");
  const [pointerActive, setPointerActive] = useState(false);
  const [normalizedPointer, setNormalizedPointer] = useState({ x: 0, y: 0 });
  const [lastPointerEventTime, setLastPointerEventTime] = useState("none");
  const [containerRect, setContainerRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [pointerClient, setPointerClient] = useState({ x: 0, y: 0 });
  const [pointerEventCount, setPointerEventCount] = useState(0);
  const [pointerInsideViewer, setPointerInsideViewer] = useState(false);
  const [targetFacingDebug, setTargetFacingDebug] = useState<FacingValues>(ZERO_FACING);
  const [smoothedFacingDebug, setSmoothedFacingDebug] = useState<FacingValues>(ZERO_FACING);
  const [appliedFacingDebug, setAppliedFacingDebug] = useState<FacingValues>(ZERO_FACING);
  const [facingSource, setFacingSource] = useState("fixed-front");
  const [manualDebugMode, setManualDebugMode] = useState(false);
  const [mouthApplySkippedReason, setMouthApplySkippedReason] = useState("none");
  const [facingSkipReason, setFacingSkipReason] = useState("none");
  const [lastFacingBranchUsed, setLastFacingBranchUsed] = useState("none");

  useEffect(() => {
    disposedRef.current = false;
    cleanupDoneRef.current = false;
    setRuntimeStatus("mounted");
    const loadToken = Symbol("live2d-load");
    loadTokenRef.current = loadToken;
    void loadLive2D(loadToken);

    return () => {
      loadTokenRef.current = null;
      cleanupRuntime({ updateState: false });
    };
  }, [modelUrl]);

  useEffect(() => {
    incomingMouthValueRef.current = mouthValue;
  }, [mouthValue]);

  useEffect(() => {
    mouthSyncEnabledRef.current = localMouthSyncEnabled;
    writeStoredBoolean(STORAGE_KEYS.mouthSyncEnabled, localMouthSyncEnabled);
  }, [localMouthSyncEnabled]);

  useEffect(() => {
    facingModeRef.current = facingMode;
    writeStoredString(STORAGE_KEYS.facingMode, facingMode);
  }, [facingMode]);

  useEffect(() => {
    facingEnabledRef.current = facingEnabled;
    writeStoredBoolean(STORAGE_KEYS.facingEnabled, facingEnabled);
  }, [facingEnabled]);

  useEffect(() => {
    bodyFollowStrengthRef.current = bodyFollowStrength;
    writeStoredNumber(STORAGE_KEYS.bodyFollowStrength, bodyFollowStrength);
  }, [bodyFollowStrength]);

  useEffect(() => {
    headFollowStrengthRef.current = headFollowStrength;
    writeStoredNumber(STORAGE_KEYS.headFollowStrength, headFollowStrength);
  }, [headFollowStrength]);

  useEffect(() => {
    eyeFollowStrengthRef.current = eyeFollowStrength;
    writeStoredNumber(STORAGE_KEYS.eyeFollowStrength, eyeFollowStrength);
  }, [eyeFollowStrength]);

  useEffect(() => {
    facingSmoothingRef.current = facingSmoothing;
    writeStoredNumber(STORAGE_KEYS.facingSmoothing, facingSmoothing);
  }, [facingSmoothing]);

  useEffect(() => {
    audioPlayingRef.current = audioPlaying;
  }, [audioPlaying]);

  useEffect(() => {
    invertFacingXRef.current = invertFacingX;
    writeStoredBoolean(STORAGE_KEYS.invertFacingX, invertFacingX);
  }, [invertFacingX]);

  useEffect(() => {
    invertFacingYRef.current = invertFacingY;
    writeStoredBoolean(STORAGE_KEYS.invertFacingY, invertFacingY);
  }, [invertFacingY]);

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.pointerLeaveBehavior, pointerLeaveBehavior);
    pointerLeaveBehaviorRef.current = pointerLeaveBehavior;
  }, [pointerLeaveBehavior]);

  useEffect(() => {
    window.addEventListener("pointermove", handleWindowPointerMove, { passive: true });
    window.addEventListener("blur", handleWindowPointerInactive);
    document.addEventListener("visibilitychange", handleDocumentVisibilityChange);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("blur", handleWindowPointerInactive);
      document.removeEventListener("visibilitychange", handleDocumentVisibilityChange);
    };
  }, []);

  async function loadLive2D(loadToken: symbol) {
    const host = hostRef.current;
    if (!host) {
      setStatus("error");
      setLastError("Live2D container is not ready.");
      return;
    }

    setLastError(null);
    setAppliedMouthValue(0);
    cleanupRuntime({ updateState: true, prepareForReload: true });
    setStatus("loading");
    setRuntimeStatus("loading");
    host.replaceChildren();

    try {
      if (!(window as any).Live2DCubismCore) {
        throw new Error(
          "Live2D Cubism Core is missing. Please place live2dcubismcore.min.js at /live2d/core/live2dcubismcore.min.js.",
        );
      }

      const pixi = await import("pixi.js");
      if (!isCurrentLoad(loadToken)) {
        console.warn("[Live2DCanvasRuntime] Abandoned Pixi import after dispose.");
        return;
      }

      const { Application, extensions } = pixi;
      const live2d = await import("untitled-pixi-live2d-engine/cubism");
      if (!isCurrentLoad(loadToken)) {
        console.warn("[Live2DCanvasRuntime] Abandoned Live2D engine import after dispose.");
        return;
      }

      const { Live2DModel } = live2d;
      try {
        const live2dPlugin = (live2d as { Live2DPlugin?: unknown }).Live2DPlugin;
        if (!live2dPluginRegistered && live2dPlugin) {
          (extensions as any).add(live2dPlugin);
          live2dPluginRegistered = true;
        } else {
          if (!live2dPlugin) {
            console.warn("Live2DPlugin export is unavailable; using engine lazy registration.");
          }
        }
      } catch (error) {
        console.warn("Live2DPlugin explicit registration failed:", error);
      }
      if (!isCurrentLoad(loadToken)) {
        console.warn("[Live2DCanvasRuntime] Abandoned Live2D plugin registration after dispose.");
        return;
      }

      const app = new Application();
      await app.init({
        width: VIEWER_WIDTH,
        height: VIEWER_HEIGHT,
        backgroundAlpha: 0,
        preference: "webgl",
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
      if (!isCurrentLoad(loadToken)) {
        console.warn("[Live2DCanvasRuntime] Abandoned Pixi app after dispose.");
        safeDestroyPixiApp(app);
        return;
      }

      appRef.current = app;
      host.appendChild(app.canvas);
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      app.canvas.style.pointerEvents = "auto";

      const model = await Live2DModel.from(modelUrl);
      if (!isCurrentLoad(loadToken)) {
        console.warn("[Live2DCanvasRuntime] Abandoned loaded model after dispose.");
        safeRemoveModelFromStage(app, model);
        safeDestroyPixiApp(app);
        return;
      }

      modelRef.current = model;
      coreModelRef.current = model?.internalModel?.coreModel ?? null;
      mouthParameterIndexRef.current = MOUTH_PARAMETER_INDEX;
      parameterIdsRef.current = discoverParameterIds(coreModelRef.current);
      facingIndicesRef.current = discoverFacingIndices(parameterIdsRef.current);
      setFacingIndices(facingIndicesRef.current);
      setBuiltInFocusDisabled(disableBuiltInFocus(model));
      app.stage.addChild(model);
      model.anchor?.set?.(0.5, 0.5);
      applyValidatedTransform(model, app);
      renderFrame(app);

      (window as any).__webLive2dModel = model;
      (window as any).__webLive2dCoreModel = coreModelRef.current;
      (window as any).__webLive2dApp = app;
      (window as any).__live2dModel = model;
      (window as any).__live2dCoreModel = coreModelRef.current;
      (window as any).__live2dApp = app;
      (window as any).__live2dMouthIndex = MOUTH_PARAMETER_INDEX;

      setStatus("loaded");
      setRuntimeStatus("ready");
      setCurrentParameterValue(readMouthParameterValue(coreModelRef.current));
      startRuntimeLoop();
    } catch (error) {
      if (disposedRef.current) {
        return;
      }

      console.error("Live2D web runtime failed:", error);
      cleanupRuntime({ updateState: true, prepareForReload: true });
      setStatus("error");
      setRuntimeStatus("mounted");
      setLastError(getErrorMessage(error));
    }
  }

  function isCurrentLoad(loadToken: symbol) {
    return !disposedRef.current && loadTokenRef.current === loadToken;
  }

  function cleanupRuntime(
    options: { updateState: boolean; prepareForReload?: boolean } = { updateState: false },
  ) {
    if (cleanupDoneRef.current && !options.prepareForReload) {
      return;
    }

    console.log("[Live2DCanvasRuntime] cleanup started");
    cleanupDoneRef.current = true;
    disposedRef.current = true;
    const model = modelRef.current;
    const app = appRef.current;

    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    try {
      if (tickerCallbackRef.current) {
        app?.ticker?.remove?.(tickerCallbackRef.current);
        tickerCallbackRef.current = null;
        console.log("[Live2DCanvasRuntime] ticker removed");
      }
      app?.stop?.();
      app?.ticker?.stop?.();
    } catch (error) {
      console.warn("Failed to stop Live2D ticker:", error);
    }

    safeRemoveModelFromStage(app, model);
    safeDestroyPixiApp(app);

    modelRef.current = null;
    coreModelRef.current = null;
    appRef.current = null;
    parameterIdsRef.current = [];
    facingIndicesRef.current = DEFAULT_FACING_INDICES;
    targetFacingRef.current = ZERO_FACING;
    currentFacingRef.current = ZERO_FACING;
    hostRef.current?.replaceChildren();
    console.log("[Live2DCanvasRuntime] cleanup completed");

    if (options.prepareForReload) {
      disposedRef.current = false;
      cleanupDoneRef.current = false;
    }

    if (options.updateState && !disposedRef.current) {
      setLastCleanup("completed");
      setRuntimeStatus("disposed");
    }
  }

  function handleManualMouthValueChange(value: number) {
    const nextValue = clamp01(value);
    manualMouthValueRef.current = nextValue;
    setManualMouthValue(nextValue);
  }

  function handleMouthSyncEnabledChange(enabled: boolean) {
    mouthSyncEnabledRef.current = enabled;
    setLocalMouthSyncEnabled(enabled);
  }

  function applyMouthValue(value: number, source: "manual" | "audio") {
    if (disposedRef.current) {
      markApplySkipped("skipped: disposed", source);
      return;
    }

    if (!coreModelRef.current) {
      markApplySkipped("skipped: coreModel missing", source);
      return;
    }

    if (!appRef.current) {
      markApplySkipped("skipped: app missing", source);
      return;
    }

    if (!modelRef.current) {
      markApplySkipped("skipped: model missing", source);
      return;
    }

    const nextValue = clamp01(value);
    const coreModel = coreModelRef.current;
    const index = mouthParameterIndexRef.current;

    try {
      if (typeof coreModel.setParameterValueByIndex !== "function") {
        throw new Error("setParameterValueByIndex is missing on coreModel.");
      }

      const before = readMouthParameterValue(coreModel);
      coreModel.setParameterValueByIndex(index, nextValue);
      const after = readMouthParameterValue(coreModel);
      setAppliedMouthValue(nextValue);
      setCurrentParameterValue(after);
      setLastApplySource(source);
      setLastApplySkippedReason("none");
      setMouthApplySkippedReason("none");
      setBeforeValue(before);
      setAfterValue(after);
      setSetApiUsed("setParameterValueByIndex");
      setApplyStatus("success");
      setLastError(null);
    } catch (error) {
      console.error("Live2D manual mouth test failed:", error);
      setStatus("error");
      setApplyStatus(`failed: ${getErrorMessage(error)}`);
      setLastError(getErrorMessage(error));
    }
  }

  function shouldUseAudioMouth() {
    const incomingMouthValue = incomingMouthValueRef.current;
    return (
      mouthSyncEnabledRef.current === true &&
      audioPlayingRef.current === true &&
      typeof incomingMouthValue === "number" &&
      Number.isFinite(incomingMouthValue)
    );
  }

  function getControlSource(): ControlSource {
    return shouldUseAudioMouth() ? "audio" : "manual";
  }

  function markApplySkipped(reason: string, source: ControlSource) {
    if (disposedRef.current) {
      return;
    }

    setLastApplySource(source);
    setLastApplySkippedReason(reason);
    setMouthApplySkippedReason(reason);
    setApplyStatus(reason);
  }

  function startRuntimeLoop() {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const tick = () => {
      if (disposedRef.current) {
        return;
      }

      runLive2DControlFrame();
      rafIdRef.current = window.requestAnimationFrame(tick);
    };

    rafIdRef.current = window.requestAnimationFrame(tick);
  }

  function runLive2DControlFrame() {
    if (disposedRef.current || !appRef.current || !coreModelRef.current) {
      return;
    }

    if (isManualDebugModeEnabled()) {
      setManualDebugMode(true);
      setMouthApplySkippedReason("manual-debug-mode");
      setFacingSkipReason("manual-debug-mode");
      setLastFacingBranchUsed("manual-debug-mode");
      renderFrame(appRef.current);
      return;
    }

    setManualDebugMode(false);
    setMouthApplySkippedReason("none");
    setFacingSkipReason("none");

    if (shouldUseAudioMouth()) {
      applyMouthValue(incomingMouthValueRef.current ?? 0, "audio");
    } else {
      applyMouthValue(manualMouthValueRef.current, "manual");
    }

    applyFacingFrame();
    renderFrame(appRef.current);
  }

  function applyFacingFrame() {
    if (disposedRef.current || !appRef.current || !coreModelRef.current) {
      return;
    }

    const computed = computeFacingTargets();
    setFacingSource(computed.branch);
    setFacingSkipReason(computed.skipReason);
    setLastFacingBranchUsed(computed.branch);
    targetFacingRef.current = computed.target;
    setTargetFacingDebug(computed.target);

    if (!computed.shouldApply) {
      return;
    }

    if (computed.branch === "fixed-front") {
      currentFacingRef.current = ZERO_FACING;
      setSmoothedFacingDebug(ZERO_FACING);
      applyFacingValue(ZERO_FACING, "fixed-front");
      return;
    }

    const target = computed.target;
    const current = currentFacingRef.current;
    const smoothing = Number.isFinite(facingSmoothingRef.current)
      ? clamp(facingSmoothingRef.current, 0, 0.95)
      : 0.65;
    const next = {
      bodyX: current.bodyX * smoothing + target.bodyX * (1 - smoothing),
      bodyY: current.bodyY * smoothing + target.bodyY * (1 - smoothing),
      bodyZ: current.bodyZ * smoothing + target.bodyZ * (1 - smoothing),
      bodyZ2: current.bodyZ2 * smoothing + target.bodyZ2 * (1 - smoothing),
      headX: current.headX * smoothing + target.headX * (1 - smoothing),
      headY: current.headY * smoothing + target.headY * (1 - smoothing),
      headZ: current.headZ * smoothing + target.headZ * (1 - smoothing),
      eyeBallX: current.eyeBallX * smoothing + target.eyeBallX * (1 - smoothing),
      eyeBallY: current.eyeBallY * smoothing + target.eyeBallY * (1 - smoothing),
    };
    currentFacingRef.current = next;
    setSmoothedFacingDebug(next);
    applyFacingValue(next, facingModeRef.current);
  }

  function computeFacingTargets(): FacingComputation {
    const mode = facingModeRef.current;
    if (!facingEnabledRef.current) {
      return {
        branch: "disabled",
        target: ZERO_FACING,
        shouldApply: false,
        skipReason: "facing-disabled",
      };
    }

    if (mode === "fixed-front") {
      return {
        branch: "fixed-front",
        target: ZERO_FACING,
        shouldApply: true,
        skipReason: "none",
      };
    }

    const pointer = pointerTargetRef.current;
    const nx = Number.isFinite(pointer?.nx) ? pointer.nx : 0;
    const ny = Number.isFinite(pointer?.ny) ? pointer.ny : 0;
    const sx = invertFacingXRef.current ? -nx : nx;
    const sy = invertFacingYRef.current ? ny : -ny;
    const bodyStrength = Number.isFinite(bodyFollowStrengthRef.current)
      ? bodyFollowStrengthRef.current
      : 0.8;
    const headStrength = Number.isFinite(headFollowStrengthRef.current)
      ? headFollowStrengthRef.current
      : 0.75;
    const eyeStrength = Number.isFinite(eyeFollowStrengthRef.current)
      ? eyeFollowStrengthRef.current
      : 0.9;

    if (mode === "mouse-follow-eyes-only") {
      return {
        branch: "mouse-follow-eyes-only",
        target: {
          ...ZERO_FACING,
          eyeBallX: sx * eyeStrength,
          eyeBallY: sy * eyeStrength,
        },
        shouldApply: true,
        skipReason: "none",
      };
    }

    if (mode === "mouse-follow-head-eyes") {
      return {
        branch: "mouse-follow-head-eyes",
        target: {
          bodyX: 0,
          bodyY: 0,
          bodyZ: 0,
          bodyZ2: 0,
          headX: sx * 25 * headStrength,
          headY: sy * 25 * headStrength,
          headZ: sx * 8 * headStrength,
          eyeBallX: sx * eyeStrength,
          eyeBallY: sy * eyeStrength,
        },
        shouldApply: true,
        skipReason: "none",
      };
    }

    if (mode === "mouse-follow-body-head-eyes") {
      return {
        branch: "mouse-follow-body-head-eyes",
        target: {
          bodyX: sx * 7 * bodyStrength,
          bodyY: sy * 7 * bodyStrength,
          bodyZ: sx * 5 * bodyStrength,
          bodyZ2: 0,
          headX: sx * 25 * headStrength,
          headY: sy * 25 * headStrength,
          headZ: sx * 8 * headStrength,
          eyeBallX: sx * eyeStrength,
          eyeBallY: sy * eyeStrength,
        },
        shouldApply: true,
        skipReason: "none",
      };
    }

    return {
      branch: "unknown-mode",
      target: ZERO_FACING,
      shouldApply: false,
      skipReason: `unknown-facing-mode:${mode}`,
    };
  }

  function applyFacingValue(values: FacingValues, mode: FacingMode) {
    const coreModel = coreModelRef.current;
    if (!coreModel || typeof coreModel.setParameterValueByIndex !== "function") {
      updateFacingStatus("skipped: coreModel missing");
      return;
    }

    try {
      const indices = facingIndicesRef.current;
      if (mode === "fixed-front" || mode === "mouse-follow-body-head-eyes") {
        setFacingParameter(coreModel, indices.bodyAngleX, values.bodyX);
        setFacingParameter(coreModel, indices.bodyAngleY, values.bodyY);
        setFacingParameter(coreModel, indices.bodyAngleZ, values.bodyZ);
        setFacingParameter(coreModel, indices.bodyAngleZ2, values.bodyZ2);
      }

      if (
        mode === "fixed-front" ||
        mode === "mouse-follow-head-eyes" ||
        mode === "mouse-follow-body-head-eyes"
      ) {
        setFacingParameter(coreModel, indices.angleX, values.headX);
        setFacingParameter(coreModel, indices.angleY, values.headY);
        setFacingParameter(coreModel, indices.angleZ, values.headZ);
      }

      setFacingParameter(coreModel, indices.eyeBallX, values.eyeBallX);
      setFacingParameter(coreModel, indices.eyeBallY, values.eyeBallY);
      setAppliedFacingDebug(readActualFacingValues(coreModel, indices, values));
      updateFacingStatus("applied");
    } catch (error) {
      updateFacingStatus(`failed: ${getErrorMessage(error)}`);
    }
  }

  function handleWindowPointerMove(event: PointerEvent) {
    if (disposedRef.current) {
      return;
    }

    const rect = viewerContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      setPointerActive(false);
      setContainerRect({
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      });
      setLastPointerEventTime("invalid rect");
      return;
    }

    const nx = clamp(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1, -1, 1);
    const ny = clamp(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1, -1, 1);
    const now = Date.now();
    const insideViewer =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    pointerTargetRef.current = {
      nx,
      ny,
      active: true,
      lastEventAt: now,
      clientX: event.clientX,
      clientY: event.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      insideViewer,
    };
    setPointerActive(true);
    setNormalizedPointer({ x: nx, y: ny });
    setPointerClient({ x: event.clientX, y: event.clientY });
    setContainerRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    setPointerInsideViewer(insideViewer);
    setLastPointerEventTime(new Date(now).toLocaleTimeString());
    setPointerEventCount((count) => count + 1);
  }

  function handleWindowPointerInactive() {
    pointerTargetRef.current = {
      ...pointerTargetRef.current,
      active: false,
      lastEventAt: Date.now(),
      insideViewer: false,
    };
    setPointerActive(false);
    setPointerInsideViewer(false);
    if (pointerLeaveBehaviorRef.current !== "return-to-center") {
      return;
    }

    pointerTargetRef.current = {
      ...pointerTargetRef.current,
      nx: 0,
      ny: 0,
      active: false,
      lastEventAt: Date.now(),
    };
    targetFacingRef.current = ZERO_FACING;
    setNormalizedPointer({ x: 0, y: 0 });
    setTargetFacingDebug(ZERO_FACING);
  }

  function handleDocumentVisibilityChange() {
    if (document.visibilityState === "hidden") {
      handleWindowPointerInactive();
    }
  }

  function resetFacing() {
    targetFacingRef.current = ZERO_FACING;
    currentFacingRef.current = ZERO_FACING;
    setTargetFacingDebug(ZERO_FACING);
    setSmoothedFacingDebug(ZERO_FACING);
    setBodyFollowStrength(0.8);
    setHeadFollowStrength(0.75);
    setEyeFollowStrength(0.9);
    setFacingSmoothing(0.65);
  }

  function updateFacingStatus(nextStatus: string) {
    if (facingStatusRef.current === nextStatus) {
      return;
    }

    facingStatusRef.current = nextStatus;
    setFacingStatus(nextStatus);
  }

  return (
    <section style={styles.panel} aria-label="Live2D v8 canvas runtime">
      <div style={styles.header}>
        <h3 style={styles.title}>Live2D v8 Display Baseline</h3>
        <span style={styles.statusText}>{status}</span>
      </div>

      <div
        ref={viewerContainerRef}
        style={styles.viewer}
      >
        <div ref={hostRef} style={styles.canvasHost} />
        {status === "loading" ? <div style={styles.overlay}>Loading Live2D...</div> : null}
        {status === "error" ? <div style={styles.overlay}>Live2D load failed</div> : null}
      </div>

      <label style={styles.field}>
        <span>
          Manual Mouth Slider: <strong>{manualMouthValue.toFixed(2)}</strong>
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={manualMouthValue}
          onChange={(event) => handleManualMouthValueChange(Number(event.target.value))}
          style={styles.range}
        />
      </label>

      <label style={styles.inlineField}>
        <input
          type="checkbox"
          checked={localMouthSyncEnabled}
          onChange={(event) => handleMouthSyncEnabledChange(event.target.checked)}
        />
        <span>Mouth Sync enabled</span>
      </label>

      <section style={styles.subPanel}>
        <h4 style={styles.subTitle}>Live2D Facing Control</h4>
        <label style={styles.field}>
          <span>Facing Mode</span>
          <select
            value={facingMode}
            onChange={(event) => setFacingMode(event.target.value as FacingMode)}
            style={styles.select}
          >
            <option value="fixed-front">Fixed front</option>
            <option value="mouse-follow-eyes-only">Mouse follow eyes only</option>
            <option value="mouse-follow-head-eyes">Mouse follow head + eyes</option>
            <option value="mouse-follow-body-head-eyes">Mouse follow body + head + eyes</option>
          </select>
        </label>
        <label style={styles.inlineField}>
          <input
            type="checkbox"
            checked={facingEnabled}
            onChange={(event) => setFacingEnabled(event.target.checked)}
          />
          <span>Facing enabled</span>
        </label>
        <label style={styles.field}>
          <span>Body follow strength: <strong>{bodyFollowStrength.toFixed(2)}</strong></span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={bodyFollowStrength}
            onChange={(event) => setBodyFollowStrength(Number(event.target.value))}
            style={styles.range}
          />
        </label>
        <label style={styles.field}>
          <span>Head follow strength: <strong>{headFollowStrength.toFixed(2)}</strong></span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={headFollowStrength}
            onChange={(event) => setHeadFollowStrength(Number(event.target.value))}
            style={styles.range}
          />
        </label>
        <label style={styles.field}>
          <span>Eye follow strength: <strong>{eyeFollowStrength.toFixed(2)}</strong></span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={eyeFollowStrength}
            onChange={(event) => setEyeFollowStrength(Number(event.target.value))}
            style={styles.range}
          />
        </label>
        <label style={styles.field}>
          <span>Facing smoothing: <strong>{facingSmoothing.toFixed(2)}</strong></span>
          <input
            type="range"
            min="0"
            max="0.95"
            step="0.01"
            value={facingSmoothing}
            onChange={(event) => setFacingSmoothing(Number(event.target.value))}
            style={styles.range}
          />
        </label>
        <label style={styles.inlineField}>
          <input
            type="checkbox"
            checked={invertFacingX}
            onChange={(event) => setInvertFacingX(event.target.checked)}
          />
          <span>Invert X</span>
        </label>
        <label style={styles.inlineField}>
          <input
            type="checkbox"
            checked={invertFacingY}
            onChange={(event) => setInvertFacingY(event.target.checked)}
          />
          <span>Invert Y</span>
        </label>
        <label style={styles.field}>
          <span>Pointer leave behavior</span>
          <select
            value={pointerLeaveBehavior}
            onChange={(event) =>
              setPointerLeaveBehavior(event.target.value as PointerLeaveBehavior)
            }
            style={styles.select}
          >
            <option value="return-to-center">return-to-center</option>
            <option value="keep-last">keep-last</option>
          </select>
        </label>
        <button type="button" onClick={resetFacing} style={styles.button}>
          Reset Facing
        </button>
      </section>

      <dl style={styles.debugGrid}>
        <DebugItem label="Model URL" value={modelUrl} />
        <DebugItem label="Mouth sync enabled" value={String(localMouthSyncEnabled)} />
        <DebugItem label="effectiveMouthSyncEnabled" value={String(localMouthSyncEnabled)} />
        <DebugItem label="Audio playing" value={String(audioPlaying)} />
        <DebugItem label="Control source" value={getControlSource()} />
        <DebugItem label="Incoming mouthValue" value={typeof mouthValue === "number" ? clamp01(mouthValue).toFixed(2) : "none"} />
        <DebugItem label="Manual mouth value" value={manualMouthValue.toFixed(2)} />
        <DebugItem label="Target parameter" value={MOUTH_PARAMETER_ID} />
        <DebugItem label="Target index" value={String(mouthParameterIndexRef.current)} />
        <DebugItem label="Applied mouth value" value={appliedMouthValue.toFixed(2)} />
        <DebugItem label="_parameterValues[50]" value={formatNullableNumber(currentParameterValue)} />
        <DebugItem label="Set API used" value={setApiUsed} />
        <DebugItem label="Update status" value={applyStatus} />
        <DebugItem label="Manual debug mode" value={String(manualDebugMode)} />
        <DebugItem label="Mouth apply skipped reason" value={mouthApplySkippedReason} />
        <DebugItem label="Facing skip reason" value={facingSkipReason} />
        <DebugItem label="Last facing branch used" value={lastFacingBranchUsed} />
        <DebugItem label="Last apply source" value={lastApplySource} />
        <DebugItem label="Last apply skipped reason" value={lastApplySkippedReason} />
        <DebugItem label="Last mouth apply called model.update" value="false" />
        <DebugItem label="Last mouth apply called coreModel.update" value="false" />
        <DebugItem label="Before value" value={formatNullableNumber(beforeValue)} />
        <DebugItem label="After value" value={formatNullableNumber(afterValue)} />
        <DebugItem label="disposedRef.current" value={String(disposedRef.current)} />
        <DebugItem label="has appRef" value={String(Boolean(appRef.current))} />
        <DebugItem label="has modelRef" value={String(Boolean(modelRef.current))} />
        <DebugItem label="has coreModelRef" value={String(Boolean(coreModelRef.current))} />
        <DebugItem label="ParamAngleX index" value={String(facingIndices.angleX)} />
        <DebugItem label="ParamAngleY index" value={String(facingIndices.angleY)} />
        <DebugItem label="ParamAngleZ index" value={String(facingIndices.angleZ)} />
        <DebugItem label="ParamBodyAngleX index" value={String(facingIndices.bodyAngleX)} />
        <DebugItem label="ParamBodyAngleY index" value={String(facingIndices.bodyAngleY)} />
        <DebugItem label="ParamBodyAngleZ index" value={String(facingIndices.bodyAngleZ)} />
        <DebugItem label="ParamBodyAngleZ2 index" value={String(facingIndices.bodyAngleZ2)} />
        <DebugItem label="ParamEyeBallX index" value={String(facingIndices.eyeBallX)} />
        <DebugItem label="ParamEyeBallY index" value={String(facingIndices.eyeBallY)} />
        <DebugItem label="Built-in focus disabled" value={builtInFocusDisabled} />
        <DebugItem label="Facing mode UI value" value={facingMode} />
        <DebugItem label="Facing mode ref value" value={facingModeRef.current} />
        <DebugItem label="Effective body strength" value={bodyFollowStrengthRef.current.toFixed(2)} />
        <DebugItem label="Effective head strength" value={headFollowStrengthRef.current.toFixed(2)} />
        <DebugItem label="Effective eye strength" value={eyeFollowStrengthRef.current.toFixed(2)} />
        <DebugItem label="Effective smoothing" value={facingSmoothingRef.current.toFixed(2)} />
        <DebugItem label="Effective invert X" value={String(invertFacingXRef.current)} />
        <DebugItem label="Effective invert Y" value={String(invertFacingYRef.current)} />
        <DebugItem label="Facing source" value={facingSource} />
        <DebugItem label="Pointer tracking source" value="window" />
        <DebugItem label="Pointer active" value={pointerActive ? "yes" : "no"} />
        <DebugItem label="Pointer inside viewer" value={pointerInsideViewer ? "yes" : "no"} />
        <DebugItem label="Normalized pointer nx / ny" value={`${normalizedPointer.x.toFixed(2)} / ${normalizedPointer.y.toFixed(2)}`} />
        <DebugItem label="Last pointer event time" value={lastPointerEventTime} />
        <DebugItem label="Pointer event count" value={String(pointerEventCount)} />
        <DebugItem label="Event clientX / clientY" value={`${pointerClient.x.toFixed(0)} / ${pointerClient.y.toFixed(0)}`} />
        <DebugItem label="Rect left / top" value={`${containerRect.left.toFixed(0)} / ${containerRect.top.toFixed(0)}`} />
        <DebugItem label="Rect width / height" value={`${containerRect.width.toFixed(0)} / ${containerRect.height.toFixed(0)}`} />
        <DebugItem label="Target body X / Y / Z / Z2" value={`${targetFacingDebug.bodyX.toFixed(2)} / ${targetFacingDebug.bodyY.toFixed(2)} / ${targetFacingDebug.bodyZ.toFixed(2)} / ${targetFacingDebug.bodyZ2.toFixed(2)}`} />
        <DebugItem label="Applied body X / Y / Z / Z2" value={`${appliedFacingDebug.bodyX.toFixed(2)} / ${appliedFacingDebug.bodyY.toFixed(2)} / ${appliedFacingDebug.bodyZ.toFixed(2)} / ${appliedFacingDebug.bodyZ2.toFixed(2)}`} />
        <DebugItem label="Target head X / Y / Z" value={`${targetFacingDebug.headX.toFixed(2)} / ${targetFacingDebug.headY.toFixed(2)} / ${targetFacingDebug.headZ.toFixed(2)}`} />
        <DebugItem label="Applied head X / Y / Z" value={`${appliedFacingDebug.headX.toFixed(2)} / ${appliedFacingDebug.headY.toFixed(2)} / ${appliedFacingDebug.headZ.toFixed(2)}`} />
        <DebugItem label="Target eye X / Y" value={`${targetFacingDebug.eyeBallX.toFixed(2)} / ${targetFacingDebug.eyeBallY.toFixed(2)}`} />
        <DebugItem label="Applied eye X / Y" value={`${appliedFacingDebug.eyeBallX.toFixed(2)} / ${appliedFacingDebug.eyeBallY.toFixed(2)}`} />
        <DebugItem label="Smoothed body X / Y / Z / Z2" value={`${smoothedFacingDebug.bodyX.toFixed(2)} / ${smoothedFacingDebug.bodyY.toFixed(2)} / ${smoothedFacingDebug.bodyZ.toFixed(2)} / ${smoothedFacingDebug.bodyZ2.toFixed(2)}`} />
        <DebugItem label="Smoothed head X / Y / Z" value={`${smoothedFacingDebug.headX.toFixed(2)} / ${smoothedFacingDebug.headY.toFixed(2)} / ${smoothedFacingDebug.headZ.toFixed(2)}`} />
        <DebugItem label="Smoothed eye X / Y" value={`${smoothedFacingDebug.eyeBallX.toFixed(2)} / ${smoothedFacingDebug.eyeBallY.toFixed(2)}`} />
        <DebugItem label="Facing status" value={facingStatus} />
        <DebugItem
          label="Validated transform"
          value={`${VIEWER_WIDTH} x ${VIEWER_HEIGHT}, scale ${MODEL_SCALE.toFixed(2)}, offset (${MODEL_OFFSET_X}, ${MODEL_OFFSET_Y})`}
        />
        <DebugItem label="Runtime status" value={runtimeStatus} />
        <DebugItem label="Last cleanup" value={lastCleanup} />
        <DebugItem label="Last error" value={lastError ?? "none"} />
      </dl>
    </section>
  );
}

function safeRemoveModelFromStage(app: any, model: any) {
  if (!app || !model) {
    return;
  }

  try {
    if (app.stage?.children?.includes?.(model)) {
      app.stage.removeChild(model);
      console.log("[Live2DCanvasRuntime] model removed from stage without destroy");
    } else {
      model.parent?.removeChild?.(model);
    }
  } catch (error) {
    console.warn("[Live2DCanvasRuntime] model remove warning", error);
  }
}

function safeDestroyPixiApp(app: any) {
  if (!app) {
    return;
  }

  try {
    app.stop?.();
    app.ticker?.stop?.();
    app.destroy(true, { children: false, texture: false, textureSource: false });
    console.log("[Live2DCanvasRuntime] app destroyed");
  } catch (error) {
    console.warn("[Live2DCanvasRuntime] Pixi app destroy warning", error);
  }
}

function disableBuiltInFocus(model: any): string {
  let disabled = false;
  let unsupported = true;

  const attempts: Array<() => void> = [
    () => model?.focusController?.focus?.(0, 0),
    () => model?.focusController?.stop?.(),
    () => model?.internalModel?.focusController?.stop?.(),
    () => {
      if ("interactive" in model) {
        model.interactive = false;
        disabled = true;
        unsupported = false;
      }
    },
    () => {
      if ("eventMode" in model) {
        model.eventMode = "none";
        disabled = true;
        unsupported = false;
      }
    },
  ];

  for (const attempt of attempts) {
    try {
      attempt();
    } catch (error) {
      console.debug("[Live2DCanvasRuntime] optional focus disable API failed", error);
    }
  }

  if (model?.focusController || model?.internalModel?.focusController) {
    disabled = true;
    unsupported = false;
  }

  if (unsupported) {
    return "unsupported";
  }

  return disabled ? "yes" : "no";
}

function applyValidatedTransform(model: any, app: any) {
  const x = app.screen.width / 2 + MODEL_OFFSET_X;
  const y = app.screen.height * 0.9 + MODEL_OFFSET_Y;
  model.scale?.set?.(MODEL_SCALE);
  model.position?.set?.(x, y);
}

function renderFrame(app: any) {
  try {
    if (typeof app?.render === "function") {
      app.render();
    } else {
      app?.renderer?.render?.(app.stage);
    }
  } catch (error) {
    console.warn("Live2D web render failed:", error);
  }
}

function readMouthParameterValue(coreModel: any): number | null {
  const value = coreModel?._parameterValues?.[MOUTH_PARAMETER_INDEX];
  return typeof value === "number" ? value : null;
}

function discoverParameterIds(coreModel: any): string[] {
  const rawIds = Array.from((coreModel?._model?.parameters?.ids ?? []) as ArrayLike<unknown>);
  return rawIds.map(normalizeParameterId).filter(Boolean);
}

function discoverFacingIndices(parameterIds: string[]): FacingIndices {
  return {
    angleX: parameterIds.indexOf("ParamAngleX"),
    angleY: parameterIds.indexOf("ParamAngleY"),
    angleZ: parameterIds.indexOf("ParamAngleZ"),
    bodyAngleX: parameterIds.indexOf("ParamBodyAngleX"),
    bodyAngleY: parameterIds.indexOf("ParamBodyAngleY"),
    bodyAngleZ: parameterIds.indexOf("ParamBodyAngleZ"),
    bodyAngleZ2: parameterIds.indexOf("ParamBodyAngleZ2"),
    eyeBallX: parameterIds.indexOf("ParamEyeBallX"),
    eyeBallY: parameterIds.indexOf("ParamEyeBallY"),
  };
}

function normalizeParameterId(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (!raw || typeof raw !== "object") {
    return "";
  }

  const rawObject = raw as Record<string, unknown>;
  const nestedId = rawObject._id;
  if (nestedId && typeof nestedId === "object") {
    const nestedObject = nestedId as Record<string, unknown>;
    for (const property of ["s", "id", "value"]) {
      const nestedValue = nestedObject[property];
      if (typeof nestedValue === "string") {
        return nestedValue;
      }
    }
  }

  for (const property of ["id", "s", "value", "name"]) {
    const value = rawObject[property];
    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function setFacingParameter(coreModel: any, index: number, value: number) {
  if (index < 0) {
    return;
  }

  coreModel.setParameterValueByIndex(index, value);
}

function readFacingParameter(coreModel: any, index: number, fallback: number) {
  if (index < 0) {
    return fallback;
  }

  const value = coreModel?._parameterValues?.[index];
  return typeof value === "number" ? value : fallback;
}

function readActualFacingValues(
  coreModel: any,
  indices: FacingIndices,
  fallback: FacingValues,
): FacingValues {
  return {
    bodyX: readFacingParameter(coreModel, indices.bodyAngleX, fallback.bodyX),
    bodyY: readFacingParameter(coreModel, indices.bodyAngleY, fallback.bodyY),
    bodyZ: readFacingParameter(coreModel, indices.bodyAngleZ, fallback.bodyZ),
    bodyZ2: readFacingParameter(coreModel, indices.bodyAngleZ2, fallback.bodyZ2),
    headX: readFacingParameter(coreModel, indices.angleX, fallback.headX),
    headY: readFacingParameter(coreModel, indices.angleY, fallback.headY),
    headZ: readFacingParameter(coreModel, indices.angleZ, fallback.headZ),
    eyeBallX: readFacingParameter(coreModel, indices.eyeBallX, fallback.eyeBallX),
    eyeBallY: readFacingParameter(coreModel, indices.eyeBallY, fallback.eyeBallY),
  };
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "none" : value.toFixed(4);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function isManualDebugModeEnabled() {
  return typeof window !== "undefined" && (window as any).__live2dManualDebugMode === true;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function readStoredString(key: string, fallback: string) {
  return window.localStorage.getItem(key) ?? fallback;
}

function writeStoredString(key: string, value: string) {
  window.localStorage.setItem(key, value);
}

function readStoredBoolean(key: string, fallback: boolean) {
  const value = window.localStorage.getItem(key);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return fallback;
}

function writeStoredBoolean(key: string, value: boolean) {
  window.localStorage.setItem(key, String(value));
}

function readStoredNumber(key: string, fallback: number, min: number, max: number) {
  // 未存過的值必須走 fallback：Number(null) 是 0，不能當成合法值。
  const raw = window.localStorage.getItem(key);
  if (raw === null || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function writeStoredNumber(key: string, value: number) {
  window.localStorage.setItem(key, String(value));
}

function readStoredFacingMode(key: string, fallback: FacingMode): FacingMode {
  const value = readStoredString(key, fallback);
  return value === "fixed-front" ||
    value === "mouse-follow-eyes-only" ||
    value === "mouse-follow-head-eyes" ||
    value === "mouse-follow-body-head-eyes"
    ? value
    : fallback;
}

function readStoredPointerLeaveBehavior(
  key: string,
  fallback: PointerLeaveBehavior,
): PointerLeaveBehavior {
  const value = readStoredString(key, fallback);
  return value === "return-to-center" || value === "keep-last" ? value : fallback;
}

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.debugItem}>
      <dt style={styles.debugLabel}>{label}</dt>
      <dd style={styles.debugValue}>{value}</dd>
    </div>
  );
}

const styles = {
  panel: {
    display: "grid",
    gap: 12,
    padding: 12,
    border: "1px solid #d8deea",
    borderRadius: 8,
    background: "#ffffff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0,
  },
  statusText: {
    color: "#5c667a",
    fontSize: 13,
  },
  viewer: {
    position: "relative",
    width: VIEWER_WIDTH,
    height: VIEWER_HEIGHT,
    maxWidth: "100%",
    overflow: "hidden",
    pointerEvents: "auto",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    background: "#101828",
  },
  canvasHost: {
    position: "absolute",
    inset: 0,
    pointerEvents: "auto",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 16,
    color: "#f8fafc",
    background: "rgba(16, 24, 40, 0.55)",
    fontSize: 13,
    pointerEvents: "none",
  },
  field: {
    display: "grid",
    gap: 8,
    color: "#5c667a",
    fontSize: 13,
  },
  inlineField: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#5c667a",
    fontSize: 13,
  },
  range: {
    width: "100%",
  },
  subPanel: {
    display: "grid",
    gap: 10,
    padding: 12,
    border: "1px solid #e0e5ef",
    borderRadius: 8,
    background: "#f8fafc",
  },
  subTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0,
  },
  select: {
    minWidth: 0,
    padding: "8px 10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#c8d0df",
    borderRadius: 8,
    background: "#ffffff",
    font: "inherit",
  },
  button: {
    justifySelf: "start",
    padding: "8px 12px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#1f5eff",
    borderRadius: 8,
    background: "#1f5eff",
    color: "#ffffff",
    font: "inherit",
    cursor: "pointer",
  },
  debugGrid: {
    margin: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  debugItem: {
    display: "grid",
    gap: 4,
    minWidth: 0,
    padding: 10,
    border: "1px solid #e0e5ef",
    borderRadius: 8,
    background: "#f8fafc",
  },
  debugLabel: {
    color: "#5c667a",
    fontSize: 12,
  },
  debugValue: {
    margin: 0,
    color: "#172033",
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    fontSize: 13,
    overflowWrap: "anywhere",
  },
} satisfies Record<string, CSSProperties>;
