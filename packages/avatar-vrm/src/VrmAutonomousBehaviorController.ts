export type VrmBehaviorGazeOwner =
  | "manual"
  | "interaction"
  | "mouse-follow"
  | "autonomous"
  | "idle-eyes"
  | "neutral";

export type VrmBlinkPhase = "waiting" | "closing" | "opening" | "paused";

export type VrmIdleMotionOwner = "vrma" | "procedural-fallback" | "disabled";

export type VrmAutonomousBehaviorControllerOptions = {
  random?: () => number;
};

export type VrmAutonomousBehaviorDebugState = {
  instanceId: number;
  resetCount: number;
  lastUpdateDeltaMs: number;
  enabled: boolean;
  manualOverrideActive: boolean;
  autoBlinkEnabled: boolean;
  blinkPhase: VrmBlinkPhase;
  nextBlinkInMs: number;
  appliedBlinkValue: number;
  autonomousGazeEnabled: boolean;
  mouseFollowEnabled: boolean;
  idleEyeMovementEnabled: boolean;
  gazeMode: VrmBehaviorGazeOwner;
  gazeOwner: VrmBehaviorGazeOwner;
  rawGazeTargetYaw: number;
  rawGazeTargetPitch: number;
  gazeTargetYaw: number;
  gazeTargetPitch: number;
  currentGazeYaw: number;
  currentGazePitch: number;
  autonomousTargetRemainingMs: number;
  mouseOverrideActive: boolean;
  idleMotionOwner: VrmIdleMotionOwner;
  activeControllerCount: number;
};

export type VrmAutonomousBehaviorFrame = Pick<
  VrmAutonomousBehaviorDebugState,
  | "blinkPhase"
  | "appliedBlinkValue"
  | "gazeMode"
  | "gazeOwner"
  | "rawGazeTargetYaw"
  | "rawGazeTargetPitch"
  | "gazeTargetYaw"
  | "gazeTargetPitch"
  | "currentGazeYaw"
  | "currentGazePitch"
  | "autonomousTargetRemainingMs"
  | "mouseOverrideActive"
  | "idleMotionOwner"
  | "activeControllerCount"
>;

let nextControllerInstanceId = 1;

export class VrmAutonomousBehaviorController {
  private readonly instanceId = nextControllerInstanceId++;
  private readonly random: () => number;
  private enabled = true;
  private manualOverrideActive = false;
  private autoBlinkEnabled = true;
  private autonomousGazeEnabled = true;
  private mouseFollowEnabled = true;
  private idleEyeMovementEnabled = true;
  private blinkPhase: VrmBlinkPhase = "waiting";
  private blinkDurationSeconds = 0.15;
  private blinkElapsedSeconds = 0;
  private nextBlinkInSeconds = 0;
  private appliedBlinkValue = 0;
  private elapsedSeconds = 0;
  private lastUpdateDeltaSeconds = 0;
  private mouseTarget = { yaw: 0, pitch: 0 };
  private mouseIdleSeconds = Number.POSITIVE_INFINITY;
  private autonomousTarget = { yaw: 0, pitch: 0 };
  private autonomousTargetRemainingSeconds = 0;
  private currentGaze = { yaw: 0, pitch: 0 };
  private currentGazeTarget = { yaw: 0, pitch: 0 };
  private rawGazeTarget = { yaw: 0, pitch: 0 };
  private lastGazeOwner: VrmBehaviorGazeOwner = "neutral";
  private lastIdleMotionOwner: VrmIdleMotionOwner = "procedural-fallback";
  private resetCount = 0;

  constructor(options: VrmAutonomousBehaviorControllerOptions = {}) {
    this.random = options.random ?? Math.random;
    this.reset();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.resetAppliedValues();
    }
  }

  setManualOverrideActive(active: boolean): void {
    this.manualOverrideActive = active;
    if (active) {
      this.appliedBlinkValue = 0;
      this.blinkPhase = "paused";
    } else if (this.blinkPhase === "paused") {
      this.blinkPhase = "waiting";
      this.nextBlinkInSeconds = this.randomBlinkInterval();
    }
  }

  setAutoBlinkEnabled(enabled: boolean): void {
    this.autoBlinkEnabled = enabled;
    if (!enabled) {
      this.appliedBlinkValue = 0;
      this.blinkPhase = "paused";
    } else if (!this.manualOverrideActive) {
      this.blinkPhase = "waiting";
      this.nextBlinkInSeconds = this.randomBlinkInterval();
    }
  }

  setAutonomousGazeEnabled(enabled: boolean): void {
    this.autonomousGazeEnabled = enabled;
  }

  setMouseFollowEnabled(enabled: boolean): void {
    this.mouseFollowEnabled = enabled;
    if (!enabled) {
      this.mouseIdleSeconds = Number.POSITIVE_INFINITY;
    }
  }

  setIdleEyeMovementEnabled(enabled: boolean): void {
    this.idleEyeMovementEnabled = enabled;
  }

  setMouseTarget(gazeX: number, gazeY: number): void {
    this.mouseTarget = {
      yaw: clamp(gazeX, -1, 1) * 24,
      pitch: clamp(gazeY, -1, 1) * 14,
    };
    this.mouseIdleSeconds = 0;
  }

  clearMouseTarget(): void {
    this.mouseIdleSeconds = Number.POSITIVE_INFINITY;
  }

  reset(): void {
    this.resetCount += 1;
    this.elapsedSeconds = 0;
    this.lastUpdateDeltaSeconds = 0;
    this.mouseTarget = { yaw: 0, pitch: 0 };
    this.mouseIdleSeconds = Number.POSITIVE_INFINITY;
    this.autonomousTarget = { yaw: 0, pitch: 0 };
    this.autonomousTargetRemainingSeconds = 0;
    this.currentGaze = { yaw: 0, pitch: 0 };
    this.currentGazeTarget = { yaw: 0, pitch: 0 };
    this.rawGazeTarget = { yaw: 0, pitch: 0 };
    this.blinkDurationSeconds = this.randomBlinkDuration();
    this.blinkElapsedSeconds = 0;
    this.nextBlinkInSeconds = this.randomBlinkInterval();
    this.appliedBlinkValue = 0;
    this.lastGazeOwner = "neutral";
    this.lastIdleMotionOwner = "procedural-fallback";
    this.blinkPhase = this.autoBlinkEnabled && !this.manualOverrideActive ? "waiting" : "paused";
  }

  update(
    deltaSeconds: number,
    options: { hasBaseMotion: boolean; interactionGazeActive: boolean },
  ): VrmAutonomousBehaviorFrame {
    const delta = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.1);
    this.lastUpdateDeltaSeconds = delta;
    this.elapsedSeconds += delta;
    this.mouseIdleSeconds += delta;

    const behaviorPaused = !this.enabled || this.manualOverrideActive;
    this.updateBlink(delta, behaviorPaused);
    const gaze = this.updateGaze(delta, behaviorPaused, options.interactionGazeActive);
    this.lastGazeOwner = gaze.owner;
    this.lastIdleMotionOwner = !this.enabled
      ? "disabled"
      : options.hasBaseMotion
        ? "vrma"
        : "procedural-fallback";

    return this.getFrame();
  }

  getDebugState(): VrmAutonomousBehaviorDebugState {
    const frame = this.getFrame();
    return {
      instanceId: this.instanceId,
      resetCount: this.resetCount,
      lastUpdateDeltaMs: Math.round(this.lastUpdateDeltaSeconds * 1000 * 1000) / 1000,
      enabled: this.enabled,
      manualOverrideActive: this.manualOverrideActive,
      autoBlinkEnabled: this.autoBlinkEnabled,
      blinkPhase: frame.blinkPhase,
      nextBlinkInMs: Math.max(0, Math.round(this.nextBlinkInSeconds * 1000)),
      appliedBlinkValue: frame.appliedBlinkValue,
      autonomousGazeEnabled: this.autonomousGazeEnabled,
      mouseFollowEnabled: this.mouseFollowEnabled,
      idleEyeMovementEnabled: this.idleEyeMovementEnabled,
      gazeMode: frame.gazeMode,
      gazeOwner: frame.gazeOwner,
      rawGazeTargetYaw: frame.rawGazeTargetYaw,
      rawGazeTargetPitch: frame.rawGazeTargetPitch,
      gazeTargetYaw: frame.gazeTargetYaw,
      gazeTargetPitch: frame.gazeTargetPitch,
      currentGazeYaw: frame.currentGazeYaw,
      currentGazePitch: frame.currentGazePitch,
      autonomousTargetRemainingMs: frame.autonomousTargetRemainingMs,
      mouseOverrideActive: frame.mouseOverrideActive,
      idleMotionOwner: frame.idleMotionOwner,
      activeControllerCount: frame.activeControllerCount,
    };
  }

  private getFrame(): VrmAutonomousBehaviorFrame {
    return {
      blinkPhase: this.blinkPhase,
      appliedBlinkValue: this.appliedBlinkValue,
      gazeMode: this.lastGazeOwner,
      gazeOwner: this.lastGazeOwner,
      rawGazeTargetYaw: this.rawGazeTarget.yaw,
      rawGazeTargetPitch: this.rawGazeTarget.pitch,
      gazeTargetYaw: this.currentGazeTarget.yaw,
      gazeTargetPitch: this.currentGazeTarget.pitch,
      currentGazeYaw: this.currentGaze.yaw,
      currentGazePitch: this.currentGaze.pitch,
      autonomousTargetRemainingMs: Math.max(0, Math.round(this.autonomousTargetRemainingSeconds * 1000)),
      mouseOverrideActive: this.lastGazeOwner === "mouse-follow",
      idleMotionOwner: this.lastIdleMotionOwner,
      activeControllerCount: countActiveControllers({
        behaviorEnabled: this.enabled,
      }),
    };
  }

  private updateBlink(delta: number, paused: boolean): void {
    if (paused || !this.autoBlinkEnabled) {
      this.appliedBlinkValue = 0;
      this.blinkPhase = "paused";
      return;
    }

    if (this.blinkPhase === "paused") {
      this.blinkPhase = "waiting";
      this.nextBlinkInSeconds = this.randomBlinkInterval();
    }

    if (this.blinkPhase === "waiting") {
      this.nextBlinkInSeconds -= delta;
      this.appliedBlinkValue = 0;
      if (this.nextBlinkInSeconds <= 0) {
        this.blinkPhase = "closing";
        this.blinkElapsedSeconds = 0;
        this.blinkDurationSeconds = this.randomBlinkDuration();
      }
      return;
    }

    this.blinkElapsedSeconds += delta;
    const progress = clamp(this.blinkElapsedSeconds / this.blinkDurationSeconds, 0, 1);
    this.blinkPhase = progress < 0.5 ? "closing" : "opening";
    this.appliedBlinkValue = Math.sin(progress * Math.PI);

    if (progress >= 1) {
      this.blinkPhase = "waiting";
      this.blinkElapsedSeconds = 0;
      this.appliedBlinkValue = 0;
      this.nextBlinkInSeconds = this.randomBlinkInterval();
    }
  }

  private updateGaze(
    delta: number,
    paused: boolean,
    interactionGazeActive: boolean,
  ): { owner: VrmBehaviorGazeOwner } {
    let owner: VrmBehaviorGazeOwner = "neutral";
    let target = { yaw: 0, pitch: 0 };

    if (paused) {
      owner = "manual";
    } else if (interactionGazeActive) {
      owner = "interaction";
    } else if (this.mouseFollowEnabled && this.mouseIdleSeconds <= 1.2) {
      owner = "mouse-follow";
      target = this.mouseTarget;
    } else if (this.autonomousGazeEnabled) {
      owner = "autonomous";
      this.autonomousTargetRemainingSeconds -= delta;
      if (this.autonomousTargetRemainingSeconds <= 0) {
        this.autonomousTarget = {
          yaw: this.randomBetween(-14, 14),
          pitch: this.randomBetween(-7, 7),
        };
        this.autonomousTargetRemainingSeconds = this.randomBetween(1.8, 4.2);
      }
      target = { ...this.autonomousTarget };
      this.rawGazeTarget = { ...target };
      if (this.idleEyeMovementEnabled) {
        target.yaw += Math.sin(this.elapsedSeconds * 0.55) * 1.8;
        target.pitch += Math.sin(this.elapsedSeconds * 0.37 + 0.8) * 0.9;
      }
    } else if (this.idleEyeMovementEnabled) {
      owner = "idle-eyes";
      target = {
        yaw: Math.sin(this.elapsedSeconds * 0.55) * 3,
        pitch: Math.sin(this.elapsedSeconds * 0.37 + 0.8) * 1.5,
      };
      this.rawGazeTarget = { ...target };
    }

    if (owner !== "autonomous" && owner !== "idle-eyes") {
      this.rawGazeTarget = { ...target };
    }

    this.currentGazeTarget = target;
    const smoothing = 1 - Math.exp(-delta * 5);
    this.currentGaze.yaw += (target.yaw - this.currentGaze.yaw) * smoothing;
    this.currentGaze.pitch += (target.pitch - this.currentGaze.pitch) * smoothing;
    return { owner };
  }

  private resetAppliedValues(): void {
    this.appliedBlinkValue = 0;
    this.currentGaze = { yaw: 0, pitch: 0 };
    this.currentGazeTarget = { yaw: 0, pitch: 0 };
    this.rawGazeTarget = { yaw: 0, pitch: 0 };
    this.blinkPhase = "paused";
  }

  private randomBetween(min: number, max: number): number {
    return min + clamp(this.random(), 0, 1) * (max - min);
  }

  private randomBlinkInterval(): number {
    return this.randomBetween(2, 5);
  }

  private randomBlinkDuration(): number {
    return this.randomBetween(0.1, 0.2);
  }
}

function countActiveControllers({
  behaviorEnabled,
}: {
  behaviorEnabled: boolean;
}): number {
  return Number(behaviorEnabled);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
