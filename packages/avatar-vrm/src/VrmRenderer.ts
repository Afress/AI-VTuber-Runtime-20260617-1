import type { AvatarRenderer, AvatarRenderInput, AvatarRenderOutput } from "@runtime/avatar-core";
import { VRMLoaderPlugin, type VRM } from "@pixiv/three-vrm";
import {
  createVRMAnimationClip,
  VRMAnimationLoaderPlugin,
} from "@pixiv/three-vrm-animation";
import {
  AmbientLight,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Clock,
  DirectionalLight,
  Euler,
  PerspectiveCamera,
  Quaternion,
  Scene,
  WebGLRenderer,
} from "three";
import { GLTFLoader, type GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VrmAutonomousBehaviorController,
  type VrmAutonomousBehaviorDebugState,
  type VrmAutonomousBehaviorFrame,
} from "./VrmAutonomousBehaviorController";
import { convertGazeYToVrmPitch } from "./VrmGazeCoordinates";

type FacingDirection = "front" | "back";
type BaseMotionState = "none" | "idle" | "dance" | "custom";
type ReactionState = "idle" | "thinking" | "talking" | "reacting";
export type CameraPreset = "fullBody" | "upperBody" | "face";
export type MouthDrivingMode = "auto" | "external";
export type ThinkingLookDirection = "left" | "right" | "down" | "up" | "center";

const CAPABILITY_EXPRESSION_NAMES = [
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "blink",
  "Blink",
  "blinkLeft",
  "blinkRight",
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "A",
  "I",
  "U",
  "E",
  "O",
  "mouthOpen",
] as const;

const CAPABILITY_BONE_NAMES = [
  "head",
  "neck",
  "chest",
  "spine",
  "hips",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
] as const;

const THINKING_OVERLAY_EPSILON = 0.001;
const LOOP_BOUNDARY_THRESHOLD = 0.05;
const LOOP_BOUNDARY_RECOVERY_THRESHOLD = 0.12;

type CapabilityBoneName = (typeof CAPABILITY_BONE_NAMES)[number];

export type VrmRendererDebugState = {
  hasVrm: boolean;
  hasAnimation: boolean;
  animationName: string | null;
  baseMotionState: BaseMotionState;
  currentAnimationDuration: number | null;
  facingDirection: FacingDirection;
  isAnimationPlaying: boolean;
  lastLoadedModelUrl: string | null;
  lastLoadedAnimationUrl: string | null;
  lastError: string | null;
  mixerTime: number | null;
  modelRotationY: number | null;
  normalizedAnimationTime: number | null;
  isNearLoopBoundary: boolean;
  loopBoundaryBlendWeight: number;
  mouthExpressionName: string;
  mouthStrength: number;
  mouthSpeed: number;
  mouthDrivingMode: MouthDrivingMode;
  externalMouthValue: number;
  currentMouthValue: number;
  thinkingLookDirection: ThinkingLookDirection;
  thinkingLookStrength: number;
  currentHeadYaw: number;
  currentHeadPitch: number;
  currentNeckYaw: number;
  currentNeckPitch: number;
  isHeadOverlayActive: boolean;
  isTalkingOverlayActive: boolean;
  isMouthOnlyOverlayActive: boolean;
  isThinkingOverlayActive: boolean;
  isReactingOverlayActive: boolean;
  reactingExpressionName: string;
  reactingExpressionStrength: number;
  reactingDurationMs: number;
  reactingMotionEnabled: boolean;
  reactingMotionStrength: number;
  currentReactingExpressionValue: number;
  reactionState: ReactionState;
  cameraPreset: CameraPreset;
  cameraPosition: {
    x: number;
    y: number;
    z: number;
  } | null;
  rendererRafActiveCount: number;
  lastFrameDeltaMs: number;
  hasLookAt: boolean;
  hasExpressionManager: boolean;
  isVrmMixerActive: boolean;
  blinkExpressionName: string | null;
  autonomousBehavior: VrmAutonomousBehaviorDebugState;
};

export type VrmRendererCapabilities = {
  hasVrm: boolean;
  availableExpressions: string[];
  hasExpressionManager: boolean;
  humanoidBones: Record<CapabilityBoneName, boolean>;
  overlayTargets: {
    canControlMouth: boolean;
    canBlink: boolean;
    canControlHead: boolean;
    canControlNeck: boolean;
  };
};

export class VrmRenderer implements AvatarRenderer {
  private animationFrameId?: number;
  private baseMotionState: BaseMotionState = "none";
  private autonomousBehavior = new VrmAutonomousBehaviorController();
  private elapsedTime = 0;
  private mixer: AnimationMixer | null = null;
  private camera?: PerspectiveCamera;
  private cameraDistance = 2;
  private cameraPreset: CameraPreset = "upperBody";
  private clock = new Clock();
  private container?: HTMLElement;
  private currentVrm?: VRM;
  private currentAction: AnimationAction | null = null;
  private animationClip: AnimationClip | null = null;
  private animationName: string | null = null;
  private autonomousGazeWasApplied = false;
  private debugReactionStrength = 1;
  private facingDirection: FacingDirection = "front";
  private facingTransition:
    | {
        startedAt: number;
        durationMs: number;
        fromRotationY: number;
        toRotationY: number;
      }
    | null = null;
  private isExpressionTestActive = false;
  private lastError: string | null = null;
  private lastLoadedAnimationUrl: string | null = null;
  private lastLoadedModelUrl: string | null = null;
  private mouthExpressionName = "aa";
  private mouthStrength = 0.75;
  private mouthSpeed = 8;
  private mouthDrivingMode: MouthDrivingMode = "auto";
  private externalMouthValue = 0;
  private currentMouthValue = 0;
  private lastFrameDeltaMs = 0;
  private thinkingLookDirection: ThinkingLookDirection = "left";
  private thinkingLookStrength = 0.5;
  private headYawTarget = 0;
  private headPitchTarget = 0;
  private neckYawTarget = 0;
  private neckPitchTarget = 0;
  private currentHeadYaw = 0;
  private currentHeadPitch = 0;
  private currentNeckYaw = 0;
  private currentNeckPitch = 0;
  private isHeadOverlayActive = false;
  private previousMixerTime: number | null = null;
  private normalizedAnimationTime: number | null = null;
  private isNearLoopBoundary = false;
  private loopBoundaryBlendWeight = 1;
  private isTalkingOverlayActive = false;
  private isMouthOnlyOverlayActive = false;
  private isThinkingOverlayActive = false;
  private isReactingOverlayActive = false;
  private reactingExpressionName = "surprised";
  private reactingExpressionStrength = 0.8;
  private reactingDurationMs = 2000;
  private reactingStartedAt: number | null = null;
  private currentReactingExpressionValue = 0;
  private reactingMotionEnabled = false;
  private reactingMotionStrength = 0.15;
  private renderer?: WebGLRenderer;
  private reactionState: ReactionState = "idle";
  private scene?: Scene;
  private targetIntensity = 0;

  async initialize(container: HTMLElement): Promise<void> {
    this.dispose();

    this.container = container;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(30, getAspectRatio(container), 0.1, 100);
    this.applyCameraPreset();

    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene.add(new AmbientLight(0xffffff, 1));
    const mainLight = new DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(1, 2, 3);
    this.scene.add(mainLight);

    container.appendChild(this.renderer.domElement);
    this.clock.start();
    this.startLoop();
    this.lastError = null;
  }

  async loadModel(url: string): Promise<void> {
    try {
      if (!this.scene) {
        throw new Error("VrmRenderer must be initialized before loading a model.");
      }

      const loader = new GLTFLoader();
      loader.register((parser: GLTFParser) => new VRMLoaderPlugin(parser));

      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) {
        throw new Error("Loaded model does not contain VRM data.");
      }

      if (this.currentVrm) {
        this.scene.remove(this.currentVrm.scene);
      }

      this.mixer?.stopAllAction();
      this.baseMotionState = "none";
      this.mixer = null;
      this.currentAction = null;
      this.animationClip = null;
      this.animationName = null;
      this.resetAnimationLoopSeamState();
      this.currentVrm = vrm;
      this.autonomousGazeWasApplied = false;
      this.currentVrm.scene.position.set(0, 0, 0);
      this.currentVrm.scene.scale.setScalar(1);
      this.facingDirection = "front";
      this.isExpressionTestActive = false;
      this.currentMouthValue = 0;
      this.resetThinkingOverlayState();
      this.autonomousBehavior.reset();
      this.applyFacingDirection();

      this.scene.add(vrm.scene);
      this.lastLoadedModelUrl = url;
      this.lastLoadedAnimationUrl = null;
      this.lastError = null;
      this.drawFrame();
    } catch (error) {
      this.lastError = getErrorMessage(error);
      throw error;
    }
  }

  async loadAnimation(url: string): Promise<void> {
    try {
      if (!this.currentVrm) {
        throw new Error("VrmRenderer must load a VRM model before loading animation.");
      }

      const loader = new GLTFLoader();
      loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));

      const gltf = await loader.loadAsync(url);
      const vrmAnimation = gltf.userData.vrmAnimations?.[0];
      if (!vrmAnimation) {
        throw new Error("Loaded file does not contain VRMA animation data.");
      }

      const clip = createVRMAnimationClip(vrmAnimation, this.currentVrm);
      this.mixer?.stopAllAction();
      this.mixer = new AnimationMixer(this.currentVrm.scene);
      this.animationClip = clip;
      this.currentAction = this.mixer.clipAction(clip);
      this.currentAction.reset();
      this.currentAction.play();
      this.resetAnimationLoopSeamState();
      this.baseMotionState = "custom";
      this.animationName = clip.name || url;
      this.lastLoadedAnimationUrl = url;
      this.lastError = null;
    } catch (error) {
      this.lastError = getErrorMessage(error);
      throw error;
    }
  }

  render(input: AvatarRenderInput): AvatarRenderOutput {
    this.applyRenderOverlayFlags(input.animationState);
    this.targetIntensity = clampIntensity(input.intensity);

    return {
      renderState: {
        mode: this.reactionState,
        animationState: input.animationState,
        baseMotionState: this.baseMotionState,
        intensity: this.targetIntensity,
        reactionState: this.reactionState,
        isTalkingOverlayActive: this.isTalkingOverlayActive,
        isMouthOnlyOverlayActive: this.isMouthOnlyOverlayActive,
        isThinkingOverlayActive: this.isThinkingOverlayActive,
        isReactingOverlayActive: this.isReactingOverlayActive,
        emotion: { ...input.emotion },
        bodyState: input.bodyState,
      },
    };
  }

  setFacingDirection(direction: FacingDirection): void {
    this.facingDirection = direction;
    this.facingTransition = null;
    this.applyFacingDirection();
  }

  toggleFacingDirection(): void {
    this.facingDirection = this.facingDirection === "front" ? "back" : "front";
    this.facingTransition = null;
    this.applyFacingDirection();
  }

  setFacingDirectionSmooth(direction: FacingDirection, durationMs = 1000): void {
    const toRotationY = getFacingDirectionRotationY(direction);
    this.facingDirection = direction;

    if (!this.currentVrm) {
      return;
    }

    this.facingTransition = {
      startedAt: performance.now(),
      durationMs: Math.max(100, Math.min(3000, durationMs)),
      fromRotationY: normalizeRotationY(this.currentVrm.scene.rotation.y),
      toRotationY,
    };
  }

  setCameraPreset(preset: CameraPreset): void {
    this.cameraPreset = preset;
    this.applyCameraPreset();
  }

  setCameraDistance(distance: number): void {
    this.cameraDistance = Math.max(0.1, distance);
    if (this.camera) {
      this.camera.position.z = this.cameraDistance;
      this.camera.updateProjectionMatrix();
    }
  }

  setDebugReactionStrength(value: number): void {
    this.debugReactionStrength = clampDebugReactionStrength(value);
  }

  setTalkingOverlayActive(active: boolean): void {
    this.isTalkingOverlayActive = active;
    this.updateReactionStateAfterOverlayChange(active ? "talking" : undefined);
  }

  setMouthOnlyOverlayActive(active: boolean): void {
    this.isMouthOnlyOverlayActive = active;
    if (!active) {
      this.externalMouthValue = 0;
    }
  }

  setThinkingOverlayActive(active: boolean): void {
    this.isThinkingOverlayActive = active;
    this.updateReactionStateAfterOverlayChange(active ? "thinking" : undefined);
  }

  setReactingOverlayActive(active: boolean): void {
    this.isReactingOverlayActive = active;
    if (active) {
      this.reactingStartedAt = performance.now();
    }
    this.updateReactionStateAfterOverlayChange(active ? "reacting" : undefined);
  }

  clearReactionOverlays(): void {
    this.isTalkingOverlayActive = false;
    this.isMouthOnlyOverlayActive = false;
    this.isThinkingOverlayActive = false;
    this.isReactingOverlayActive = false;
    this.reactionState = "idle";
  }

  setMouthExpression(name: string): void {
    this.mouthExpressionName = name;
    this.lastError = null;
  }

  setMouthStrength(value: number): void {
    this.mouthStrength = clampIntensity(value);
  }

  setMouthSpeed(value: number): void {
    this.mouthSpeed = clampMouthSpeed(value);
  }

  setMouthDrivingMode(mode: MouthDrivingMode): void {
    this.mouthDrivingMode = mode;
  }

  setExternalMouthValue(value: number): void {
    this.externalMouthValue = clampIntensity(value);
  }

  setThinkingLookDirection(direction: ThinkingLookDirection): void {
    this.thinkingLookDirection = direction;
  }

  setThinkingLookStrength(value: number): void {
    this.thinkingLookStrength = clampIntensity(value);
  }

  setAutonomousBehaviorEnabled(enabled: boolean): void {
    this.autonomousBehavior.setEnabled(enabled);
    if (!enabled) {
      this.resetAutonomousGaze();
    }
  }

  setAutoBlinkEnabled(enabled: boolean): void {
    this.autonomousBehavior.setAutoBlinkEnabled(enabled);
  }

  setAutonomousGazeEnabled(enabled: boolean): void {
    this.autonomousBehavior.setAutonomousGazeEnabled(enabled);
  }

  setMouseFollowEnabled(enabled: boolean): void {
    this.autonomousBehavior.setMouseFollowEnabled(enabled);
  }

  setIdleEyeMovementEnabled(enabled: boolean): void {
    this.autonomousBehavior.setIdleEyeMovementEnabled(enabled);
  }

  setBehaviorManualOverrideActive(active: boolean): void {
    this.autonomousBehavior.setManualOverrideActive(active);
  }

  setMouseFollowTarget(gazeX: number, gazeY: number): void {
    this.autonomousBehavior.setMouseTarget(gazeX, gazeY);
  }

  clearMouseFollowTarget(): void {
    this.autonomousBehavior.clearMouseTarget();
  }

  setReactingExpression(name: string): void {
    const expressionManager = this.currentVrm?.expressionManager;
    if (expressionManager && name !== this.reactingExpressionName) {
      safeSetExpression(expressionManager, this.reactingExpressionName, 0);
    }

    this.reactingExpressionName = name;
    this.currentReactingExpressionValue = 0;
  }

  setReactingExpressionStrength(value: number): void {
    this.reactingExpressionStrength = clampIntensity(value);
  }

  setReactingDurationMs(value: number): void {
    this.reactingDurationMs = Math.max(100, value);
  }

  setReactingMotionEnabled(enabled: boolean): void {
    this.reactingMotionEnabled = enabled;
  }

  setReactingMotionStrength(value: number): void {
    this.reactingMotionStrength = clampIntensity(value);
  }

  triggerReaction(expressionName?: string): void {
    if (expressionName) {
      this.setReactingExpression(expressionName);
    }

    this.isReactingOverlayActive = true;
    this.reactionState = "reacting";
    this.reactingStartedAt = performance.now();
  }

  setExpression(name: string, value: number): void {
    const expressionManager = this.currentVrm?.expressionManager;
    if (!this.currentVrm || !expressionManager) {
      this.lastError = `Expression skipped: ${name} is unavailable because no VRM expression manager is loaded.`;
      return;
    }

    try {
      expressionManager.setValue(name, clampIntensity(value));
      if (isExpressionTestLockExpression(name)) {
        this.isExpressionTestActive = true;
      }
      this.lastError = null;
    } catch (error) {
      this.lastError = `Expression set failed: ${name}: ${getErrorMessage(error)}`;
    }
  }

  clearExpressions(): void {
    const expressionManager = this.currentVrm?.expressionManager;
    if (!this.currentVrm || !expressionManager) {
      this.lastError = "Expression clear skipped because no VRM expression manager is loaded.";
      return;
    }

    for (const expressionName of CAPABILITY_EXPRESSION_NAMES) {
      try {
        expressionManager.setValue(expressionName, 0);
      } catch {
        continue;
      }
    }

    this.isExpressionTestActive = false;
    this.lastError = null;
  }

  dispose(): void {
    if (this.animationFrameId !== undefined) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    this.currentVrm?.scene.parent?.remove(this.currentVrm.scene);
    this.mixer?.stopAllAction();
    this.renderer?.domElement.remove();
    this.renderer?.dispose();

    this.camera = undefined;
    this.container = undefined;
    this.baseMotionState = "none";
    this.currentAction = null;
    this.animationClip = null;
    this.animationName = null;
    this.currentVrm = undefined;
    this.autonomousGazeWasApplied = false;
    this.lastLoadedAnimationUrl = null;
    this.lastLoadedModelUrl = null;
    this.mixer = null;
    this.resetAnimationLoopSeamState();
    this.renderer = undefined;
    this.scene = undefined;
    this.targetIntensity = 0;
    this.reactionState = "idle";
    this.clearReactionOverlays();
    this.isExpressionTestActive = false;
    this.currentMouthValue = 0;
    this.currentReactingExpressionValue = 0;
    this.reactingStartedAt = null;
    this.resetThinkingOverlayState();
    this.autonomousBehavior.reset();
  }

  getDebugState(): VrmRendererDebugState {
    return {
      hasVrm: Boolean(this.currentVrm),
      hasAnimation: this.mixer !== null && this.currentAction !== null,
      animationName: this.animationName,
      baseMotionState: this.baseMotionState,
      currentAnimationDuration: this.animationClip?.duration ?? null,
      facingDirection: this.facingDirection,
      isAnimationPlaying: this.currentAction !== null && this.currentAction.enabled === true,
      lastLoadedModelUrl: this.lastLoadedModelUrl,
      lastLoadedAnimationUrl: this.lastLoadedAnimationUrl,
      lastError: this.lastError,
      mixerTime: this.mixer !== null ? this.mixer.time : null,
      modelRotationY: this.currentVrm?.scene.rotation.y ?? null,
      normalizedAnimationTime: this.normalizedAnimationTime,
      isNearLoopBoundary: this.isNearLoopBoundary,
      loopBoundaryBlendWeight: this.loopBoundaryBlendWeight,
      mouthExpressionName: this.mouthExpressionName,
      mouthStrength: this.mouthStrength,
      mouthSpeed: this.mouthSpeed,
      mouthDrivingMode: this.mouthDrivingMode,
      externalMouthValue: this.externalMouthValue,
      currentMouthValue: this.currentMouthValue,
      thinkingLookDirection: this.thinkingLookDirection,
      thinkingLookStrength: this.thinkingLookStrength,
      currentHeadYaw: this.currentHeadYaw,
      currentHeadPitch: this.currentHeadPitch,
      currentNeckYaw: this.currentNeckYaw,
      currentNeckPitch: this.currentNeckPitch,
      isHeadOverlayActive: this.isHeadOverlayActive,
      isTalkingOverlayActive: this.isTalkingOverlayActive,
      isMouthOnlyOverlayActive: this.isMouthOnlyOverlayActive,
      isThinkingOverlayActive: this.isThinkingOverlayActive,
      isReactingOverlayActive: this.isReactingOverlayActive,
      reactingExpressionName: this.reactingExpressionName,
      reactingExpressionStrength: this.reactingExpressionStrength,
      reactingDurationMs: this.reactingDurationMs,
      reactingMotionEnabled: this.reactingMotionEnabled,
      reactingMotionStrength: this.reactingMotionStrength,
      currentReactingExpressionValue: this.currentReactingExpressionValue,
      reactionState: this.reactionState,
      cameraPreset: this.cameraPreset,
      cameraPosition: this.camera
        ? {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z,
          }
        : null,
      rendererRafActiveCount: this.animationFrameId === undefined ? 0 : 1,
      lastFrameDeltaMs: this.lastFrameDeltaMs,
      hasLookAt: Boolean(this.currentVrm?.lookAt),
      hasExpressionManager: Boolean(this.currentVrm?.expressionManager),
      isVrmMixerActive: this.mixer !== null && this.currentAction !== null,
      blinkExpressionName: getBlinkExpressionName(this.currentVrm),
      autonomousBehavior: this.autonomousBehavior.getDebugState(),
    };
  }

  getCapabilities(): VrmRendererCapabilities {
    const availableExpressions = getAvailableExpressions(this.currentVrm);
    const humanoidBones = getHumanoidBoneCapabilities(this.currentVrm);

    return {
      hasVrm: Boolean(this.currentVrm),
      availableExpressions,
      hasExpressionManager: Boolean(this.currentVrm?.expressionManager),
      humanoidBones,
      overlayTargets: {
        canControlMouth: hasAnyExpression(availableExpressions, ["aa", "mouthOpen", "A"]),
        canBlink: hasAnyExpression(availableExpressions, [
          "blink",
          "Blink",
          "blinkLeft",
          "blinkRight",
        ]),
        canControlHead: humanoidBones.head,
        canControlNeck: humanoidBones.neck,
      },
    };
  }

  private applyRenderOverlayFlags(animationState: string): void {
    if (animationState === "mouth-active") {
      this.isTalkingOverlayActive = true;
      this.reactionState = "talking";
      return;
    }

    if (animationState === "gaze-away") {
      this.isThinkingOverlayActive = true;
      this.reactionState = "thinking";
      return;
    }

    if (animationState === "expressive") {
      if (!this.isReactingOverlayActive) {
        this.reactingStartedAt = performance.now();
      }

      this.isReactingOverlayActive = true;
      this.reactionState = "reacting";
      return;
    }

    if (animationState === "idle") {
      this.reactionState = "idle";
    }
  }

  private updateReactionStateAfterOverlayChange(nextState?: ReactionState): void {
    if (nextState) {
      this.reactionState = nextState;
      return;
    }

    if (this.isThinkingOverlayActive) {
      this.reactionState = "thinking";
      return;
    }

    if (this.isTalkingOverlayActive) {
      this.reactionState = "talking";
      return;
    }

    if (this.isReactingOverlayActive) {
      this.reactionState = "reacting";
      return;
    }

    this.reactionState = "idle";
  }

  private startLoop() {
    if (this.animationFrameId !== undefined) {
      return;
    }

    const tick = () => {
      this.drawFrame();
      this.animationFrameId = window.requestAnimationFrame(tick);
    };

    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  private drawFrame() {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }

    const delta = this.clock.getDelta();
    this.elapsedTime += delta;
    this.lastFrameDeltaMs = Math.round(delta * 1000 * 1000) / 1000;
    this.previousMixerTime = this.mixer?.time ?? null;
    this.mixer?.update(delta);
    this.updateAnimationLoopSeamState();
    const autonomousBehaviorFrame = this.autonomousBehavior.update(delta, {
      hasBaseMotion: this.baseMotionState !== "none",
      interactionGazeActive: this.isThinkingOverlayActive,
    });
    if (!this.isExpressionTestActive) {
      setBlinkExpression(this.currentVrm, autonomousBehaviorFrame.appliedBlinkValue);
    }
    if (!this.isExpressionTestActive) {
      this.updateMouthOverlay();
    }
    this.applyThinkingHeadNeckOverlay(delta);
    this.updateReactingExpressionOverlay();
    this.applyReactionOverlay();
    this.applyAutonomousGaze(autonomousBehaviorFrame);
    this.currentVrm?.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  private applyReactionOverlay() {
    const reactionMultiplier = getDebugReactionMultiplier(this.debugReactionStrength);

    if (!this.currentVrm) {
      return;
    }

    const idleScale = this.isTalkingOverlayActive ? 0.45 : 1;
    const hasBaseMotion = this.baseMotionState !== "none";
    const idleFloat = hasBaseMotion ? 0 : Math.sin(this.elapsedTime * 1.2) * 0.012 * idleScale;
    const idleSway = hasBaseMotion ? 0 : Math.sin(this.elapsedTime * 0.8) * 0.018 * idleScale;
    const thinkingOffset =
      this.isThinkingOverlayActive && !hasThinkingBoneTarget(this.currentVrm)
        ? 0.012 * reactionMultiplier
        : 0;
    const reactionBounce =
      this.isReactingOverlayActive && this.reactingMotionEnabled
        ? Math.abs(Math.sin(this.elapsedTime * 8)) *
          this.reactingMotionStrength *
          0.1 *
          reactionMultiplier
        : 0;
    const reactionScale =
      this.isReactingOverlayActive && this.reactingMotionEnabled
        ? 1 +
          this.targetIntensity * this.reactingMotionStrength * 0.2 * reactionMultiplier +
          reactionBounce
        : 1;

    this.currentVrm.scene.position.set(thinkingOffset, idleFloat, 0);
    this.applyFacingDirection();
    this.currentVrm.scene.rotation.x = 0;
    this.currentVrm.scene.rotation.y += idleSway;
    this.currentVrm.scene.rotation.z = 0;
    this.currentVrm.scene.scale.setScalar(reactionScale);
  }

  private updateMouthOverlay(): void {
    const expressionManager = this.currentVrm?.expressionManager;
    if (!expressionManager) {
      this.currentMouthValue = 0;
      return;
    }

    const isTalking = this.isTalkingOverlayActive || this.isMouthOnlyOverlayActive;
    const maxMouthValue = clampIntensity(this.mouthStrength);
    const minMouthValue = Math.min(0.15, maxMouthValue);
    const wave = (Math.sin(this.elapsedTime * this.mouthSpeed) + 1) / 2;
    const talkingTarget = minMouthValue + wave * (maxMouthValue - minMouthValue);
    const externalTarget = this.externalMouthValue * maxMouthValue;
    const targetValue =
      isTalking && this.mouthDrivingMode === "external"
        ? externalTarget
        : isTalking
          ? talkingTarget
          : 0;

    this.currentMouthValue += (targetValue - this.currentMouthValue) * 0.28;
    safeSetExpression(expressionManager, this.mouthExpressionName, this.currentMouthValue);
  }

  private updateReactingExpressionOverlay(): void {
    const expressionManager = this.currentVrm?.expressionManager;
    if (!expressionManager) {
      this.currentReactingExpressionValue = 0;
      return;
    }

    const elapsedMs =
      this.isReactingOverlayActive && this.reactingStartedAt !== null
        ? performance.now() - this.reactingStartedAt
        : 0;
    const progress = Math.min(1, elapsedMs / this.reactingDurationMs);
    const envelope = this.isReactingOverlayActive ? getReactingEnvelope(progress) : 0;
    const targetValue = this.reactingExpressionStrength * envelope;
    this.currentReactingExpressionValue +=
      (targetValue - this.currentReactingExpressionValue) * 0.35;

    safeSetExpression(
      expressionManager,
      this.reactingExpressionName,
      this.currentReactingExpressionValue,
    );

    if (!this.isReactingOverlayActive && this.currentReactingExpressionValue < 0.001) {
      this.currentReactingExpressionValue = 0;
      safeSetExpression(expressionManager, this.reactingExpressionName, 0);
    }

    if (this.isReactingOverlayActive && progress >= 1) {
      this.setReactingOverlayActive(false);
      this.reactingStartedAt = null;
    }
  }

  private applyThinkingHeadNeckOverlay(delta: number): void {
    const previousHeadYaw = this.currentHeadYaw;
    const previousHeadPitch = this.currentHeadPitch;
    const previousNeckYaw = this.currentNeckYaw;
    const previousNeckPitch = this.currentNeckPitch;
    const nextTargets =
      this.isThinkingOverlayActive
        ? getThinkingLookTargets(
            this.thinkingLookDirection,
            this.thinkingLookStrength * this.loopBoundaryBlendWeight,
          )
        : getThinkingLookTargets("center", 0);
    const smoothAmount = 1 - Math.exp(-delta * 8);

    this.headYawTarget = nextTargets.headYaw;
    this.headPitchTarget = nextTargets.headPitch;
    this.neckYawTarget = nextTargets.neckYaw;
    this.neckPitchTarget = nextTargets.neckPitch;
    this.currentHeadYaw = lerp(this.currentHeadYaw, this.headYawTarget, smoothAmount);
    this.currentHeadPitch = lerp(this.currentHeadPitch, this.headPitchTarget, smoothAmount);
    this.currentNeckYaw = lerp(this.currentNeckYaw, this.neckYawTarget, smoothAmount);
    this.currentNeckPitch = lerp(this.currentNeckPitch, this.neckPitchTarget, smoothAmount);

    if (!this.isThinkingOverlayActive && this.isThinkingOverlayNearZero()) {
      if (this.currentVrm && this.mixer === null) {
        const head = getHumanoidBoneNode(this.currentVrm, "head");
        const neck = getHumanoidBoneNode(this.currentVrm, "neck");

        if (head) {
          head.quaternion.multiply(
            createBoneOverlayQuaternion(previousHeadYaw, previousHeadPitch).invert(),
          );
        }

        if (neck) {
          neck.quaternion.multiply(
            createBoneOverlayQuaternion(previousNeckYaw, previousNeckPitch).invert(),
          );
        }
      }

      this.resetThinkingOverlayState();
      this.isHeadOverlayActive = false;
      return;
    }

    if (!this.currentVrm) {
      this.isHeadOverlayActive = false;
      return;
    }

    const head = getHumanoidBoneNode(this.currentVrm, "head");
    const neck = getHumanoidBoneNode(this.currentVrm, "neck");
    const shouldRemovePreviousOverlay = this.mixer === null;
    this.isHeadOverlayActive = Boolean(head || neck);

    if (head) {
      if (shouldRemovePreviousOverlay) {
        head.quaternion.multiply(
          createBoneOverlayQuaternion(previousHeadYaw, previousHeadPitch).invert(),
        );
      }

      head.quaternion.multiply(
        createBoneOverlayQuaternion(this.currentHeadYaw, this.currentHeadPitch),
      );
    }

    if (neck) {
      if (shouldRemovePreviousOverlay) {
        neck.quaternion.multiply(
          createBoneOverlayQuaternion(previousNeckYaw, previousNeckPitch).invert(),
        );
      }

      neck.quaternion.multiply(
        createBoneOverlayQuaternion(this.currentNeckYaw, this.currentNeckPitch),
      );
    }
  }

  private isThinkingOverlayNearZero(): boolean {
    return (
      Math.abs(this.currentHeadYaw) < THINKING_OVERLAY_EPSILON &&
      Math.abs(this.currentHeadPitch) < THINKING_OVERLAY_EPSILON &&
      Math.abs(this.currentNeckYaw) < THINKING_OVERLAY_EPSILON &&
      Math.abs(this.currentNeckPitch) < THINKING_OVERLAY_EPSILON
    );
  }

  private resetThinkingOverlayState(): void {
    this.headYawTarget = 0;
    this.headPitchTarget = 0;
    this.neckYawTarget = 0;
    this.neckPitchTarget = 0;
    this.currentHeadYaw = 0;
    this.currentHeadPitch = 0;
    this.currentNeckYaw = 0;
    this.currentNeckPitch = 0;
    this.isHeadOverlayActive = false;
  }

  private updateAnimationLoopSeamState(): void {
    if (!this.mixer || !this.animationClip?.duration) {
      this.resetAnimationLoopSeamState();
      return;
    }

    this.normalizedAnimationTime =
      (this.mixer.time % this.animationClip.duration) / this.animationClip.duration;
    this.isNearLoopBoundary =
      this.normalizedAnimationTime < LOOP_BOUNDARY_THRESHOLD ||
      this.normalizedAnimationTime > 1 - LOOP_BOUNDARY_THRESHOLD;
    this.loopBoundaryBlendWeight = getLoopBoundaryBlendWeight(this.normalizedAnimationTime);
  }

  private resetAnimationLoopSeamState(): void {
    this.previousMixerTime = null;
    this.normalizedAnimationTime = null;
    this.isNearLoopBoundary = false;
    this.loopBoundaryBlendWeight = 1;
  }

  private applyFacingDirection(): void {
    if (!this.currentVrm) {
      return;
    }

    if (this.facingTransition) {
      const elapsedMs = performance.now() - this.facingTransition.startedAt;
      const progress = Math.min(1, elapsedMs / this.facingTransition.durationMs);
      const easedProgress = easeInOutCubic(progress);
      this.currentVrm.scene.rotation.y = lerpRotationY(
        this.facingTransition.fromRotationY,
        this.facingTransition.toRotationY,
        easedProgress,
      );
      if (progress >= 1) {
        this.facingTransition = null;
      }
      return;
    }

    this.currentVrm.scene.rotation.y = getFacingDirectionRotationY(this.facingDirection);
  }

  private applyCameraPreset(): void {
    if (!this.camera) {
      return;
    }

    if (this.cameraPreset === "fullBody") {
      this.camera.position.set(0, 1.25, 3);
      this.camera.lookAt(0, 1.1, 0);
    }

    if (this.cameraPreset === "upperBody") {
      this.camera.position.set(0, 1.35, 2);
      this.camera.lookAt(0, 1.35, 0);
    }

    if (this.cameraPreset === "face") {
      this.camera.position.set(0, 1.45, 1.25);
      this.camera.lookAt(0, 1.45, 0);
    }

    this.cameraDistance = this.camera.position.z;
    this.camera.updateProjectionMatrix();
  }

  private applyAutonomousGaze(frame: VrmAutonomousBehaviorFrame): void {
    const lookAt = this.currentVrm?.lookAt;
    if (!lookAt) {
      return;
    }

    if (frame.gazeOwner === "manual" || frame.gazeOwner === "interaction") {
      if (this.autonomousGazeWasApplied) {
        lookAt.reset();
        this.autonomousGazeWasApplied = false;
      }
      return;
    }

    lookAt.yaw = frame.currentGazeYaw;
    lookAt.pitch = convertGazeYToVrmPitch(frame.currentGazePitch);
    this.autonomousGazeWasApplied = true;
  }

  private resetAutonomousGaze(): void {
    this.currentVrm?.lookAt?.reset();
    this.autonomousGazeWasApplied = false;
  }
}

function getAspectRatio(container: HTMLElement) {
  if (container.clientHeight === 0) {
    return 1;
  }

  return container.clientWidth / container.clientHeight;
}

function clampIntensity(intensity: number) {
  return Math.min(1, Math.max(0, intensity));
}

function clampDebugReactionStrength(value: number) {
  return Math.min(3, Math.max(0, Math.round(value)));
}

function clampMouthSpeed(value: number) {
  return Math.min(20, Math.max(0.1, value));
}

function getDebugReactionMultiplier(strength: number) {
  if (strength <= 0) {
    return 0;
  }

  if (strength === 1) {
    return 1;
  }

  if (strength === 2) {
    return 1.8;
  }

  return 2.8;
}

function getAvailableExpressions(vrm: VRM | undefined) {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) {
    return [];
  }

  return CAPABILITY_EXPRESSION_NAMES.filter((expressionName) =>
    hasExpression(expressionManager, expressionName),
  );
}

function getHumanoidBoneCapabilities(vrm: VRM | undefined) {
  return CAPABILITY_BONE_NAMES.reduce(
    (bones, boneName) => ({
      ...bones,
      [boneName]: hasHumanoidBone(vrm, boneName),
    }),
    {} as Record<CapabilityBoneName, boolean>,
  );
}

function hasHumanoidBone(vrm: VRM | undefined, boneName: CapabilityBoneName) {
  try {
    return Boolean(getHumanoidBoneNode(vrm, boneName));
  } catch {
    return false;
  }
}

function hasThinkingBoneTarget(vrm: VRM | undefined) {
  return Boolean(getHumanoidBoneNode(vrm, "head") || getHumanoidBoneNode(vrm, "neck"));
}

function getHumanoidBoneNode(vrm: VRM | undefined, boneName: CapabilityBoneName) {
  try {
    return vrm?.humanoid?.getNormalizedBoneNode?.(boneName) ?? null;
  } catch {
    return null;
  }
}

function hasAnyExpression(availableExpressions: string[], expressionNames: string[]) {
  return expressionNames.some((expressionName) =>
    availableExpressions.includes(expressionName),
  );
}

function setBlinkExpression(vrm: VRM | undefined, value: number) {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) {
    return;
  }

  const expressionName = ["blink", "Blink"].find((name) =>
    hasExpression(expressionManager, name),
  );
  if (expressionName) {
    safeSetExpression(expressionManager, expressionName, value);
    return;
  }

  const hasBlinkLeft = hasExpression(expressionManager, "blinkLeft");
  const hasBlinkRight = hasExpression(expressionManager, "blinkRight");

  if (hasBlinkLeft) {
    safeSetExpression(expressionManager, "blinkLeft", value);
  }

  if (hasBlinkRight) {
    safeSetExpression(expressionManager, "blinkRight", value);
  }
}

function getBlinkExpressionName(vrm: VRM | undefined): string | null {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) {
    return null;
  }

  const expressionName = ["blink", "Blink"].find((name) =>
    hasExpression(expressionManager, name),
  );
  if (expressionName) {
    return expressionName;
  }

  const blinkExpressions = ["blinkLeft", "blinkRight"].filter((name) =>
    hasExpression(expressionManager, name),
  );
  return blinkExpressions.length > 0 ? blinkExpressions.join("+") : null;
}

function hasExpression(
  expressionManager: NonNullable<VRM["expressionManager"]>,
  expressionName: string,
) {
  return expressionManager.getExpression(expressionName) !== null;
}

function isExpressionTestLockExpression(expressionName: string) {
  return [
    "aa",
    "ih",
    "ou",
    "ee",
    "oh",
    "A",
    "I",
    "U",
    "E",
    "O",
    "mouthOpen",
    "blink",
    "Blink",
    "blinkLeft",
    "blinkRight",
  ].includes(expressionName);
}

function safeSetExpression(
  expressionManager: NonNullable<VRM["expressionManager"]>,
  expressionName: string,
  value: number,
) {
  try {
    expressionManager.setValue(expressionName, clampIntensity(value));
  } catch {
    return;
  }
}

function getThinkingLookTargets(
  direction: ThinkingLookDirection,
  strength: number,
) {
  const headYawAmount = 0.22 * strength;
  const headPitchAmount = 0.12 * strength;
  const neckYawAmount = headYawAmount * 0.42;
  const neckPitchAmount = headPitchAmount * 0.38;

  if (direction === "left") {
    return {
      headYaw: headYawAmount,
      headPitch: 0,
      neckYaw: neckYawAmount,
      neckPitch: 0,
    };
  }

  if (direction === "right") {
    return {
      headYaw: -headYawAmount,
      headPitch: 0,
      neckYaw: -neckYawAmount,
      neckPitch: 0,
    };
  }

  if (direction === "down") {
    return {
      headYaw: 0,
      headPitch: headPitchAmount,
      neckYaw: 0,
      neckPitch: neckPitchAmount,
    };
  }

  if (direction === "up") {
    return {
      headYaw: 0,
      headPitch: -headPitchAmount,
      neckYaw: 0,
      neckPitch: -neckPitchAmount,
    };
  }

  return {
    headYaw: 0,
    headPitch: 0,
    neckYaw: 0,
    neckPitch: 0,
  };
}

function lerp(current: number, target: number, amount: number) {
  return current + (target - current) * amount;
}

function getFacingDirectionRotationY(direction: FacingDirection) {
  return direction === "front" ? 0 : Math.PI;
}

function normalizeRotationY(rotationY: number) {
  const fullTurn = Math.PI * 2;
  let normalized = rotationY % fullTurn;
  if (normalized > Math.PI) {
    normalized -= fullTurn;
  }
  if (normalized < -Math.PI) {
    normalized += fullTurn;
  }

  return normalized;
}

function lerpRotationY(fromRotationY: number, toRotationY: number, amount: number) {
  const fullTurn = Math.PI * 2;
  let delta = toRotationY - fromRotationY;
  if (delta > Math.PI) {
    delta -= fullTurn;
  }
  if (delta < -Math.PI) {
    delta += fullTurn;
  }

  return fromRotationY + delta * amount;
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function getLoopBoundaryBlendWeight(normalizedAnimationTime: number) {
  const edgeDistance = Math.min(
    normalizedAnimationTime,
    1 - normalizedAnimationTime,
  );

  if (edgeDistance < LOOP_BOUNDARY_THRESHOLD) {
    return 0.3 * smoothstep(0, LOOP_BOUNDARY_THRESHOLD, edgeDistance);
  }

  if (edgeDistance < LOOP_BOUNDARY_RECOVERY_THRESHOLD) {
    return lerp(
      0.3,
      1,
      smoothstep(
        LOOP_BOUNDARY_THRESHOLD,
        LOOP_BOUNDARY_RECOVERY_THRESHOLD,
        edgeDistance,
      ),
    );
  }

  return 1;
}

function getReactingEnvelope(progress: number) {
  if (progress < 0.2) {
    return smoothstep(0, 0.2, progress);
  }

  if (progress < 0.8) {
    return 1;
  }

  return 1 - smoothstep(0.8, 1, progress);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function createBoneOverlayQuaternion(yaw: number, pitch: number) {
  return new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, "XYZ"));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
