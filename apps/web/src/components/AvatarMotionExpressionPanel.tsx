import type { CSSProperties } from "react";
import type { AvatarRenderOutput } from "@runtime/avatar-core";
import type {
  CameraPreset,
  ThinkingLookDirection,
  VrmRendererCapabilities,
  VrmRendererDebugState,
} from "@runtime/avatar-vrm";

type EmotionExpressionMode = "pulse" | "holdDuringSpeech" | "off";
type ExpressionSource = "assistant-response" | "manual" | "none";
type AssistantEmotionName = "neutral" | "happy" | "surprised" | "sad" | "angry" | "thinking" | "calm";
type AutoAvatarPhase =
  | "idle"
  | "waitingForAssistant"
  | "assistantTalking"
  | "assistantFinished"
  | "listeningPose";

type AvatarLoadSettings = {
  autoLoadAvatar: boolean;
  avatarUrl: string;
  idleMotionUrl: string;
};

type EmotionMappingDebug = {
  currentEmotionMood: string;
  mappedExpression: string | null;
  lastEmotionReactionTurnId: number | null;
  lastTriggeredEmotionMood: string | null;
  lastTriggeredExpression: string | null;
  autoAvatarStatus: string;
  currentAutoAvatarPhase: AutoAvatarPhase;
};

type AvatarMotionExpressionPanelProps = {
  avatarLoadSettings: AvatarLoadSettings;
  onAvatarLoadSettingsChange: (settings: AvatarLoadSettings) => void;
  debugState: VrmRendererDebugState;
  capabilities: VrmRendererCapabilities;
  emotionMappingDebug: EmotionMappingDebug;
  autoAvatarControlEnabled: boolean;
  onAutoAvatarControlEnabledChange: (enabled: boolean) => void;
  emotionReactionEnabled: boolean;
  onEmotionReactionEnabledChange: (enabled: boolean) => void;
  emotionExpressionMode: EmotionExpressionMode;
  onEmotionExpressionModeChange: (mode: EmotionExpressionMode) => void;
  heldEmotionExpression: string | null;
  heldEmotionExpressionValue: number;
  detectedAssistantEmotion: AssistantEmotionName;
  detectedAssistantEmotionIntensity: number;
  activeAssistantExpression: string | null;
  expressionSource: ExpressionSource;
  enableListeningPoseAfterReply: boolean;
  onListeningPoseAfterReplyChange: (enabled: boolean) => void;
  minimumTalkingDurationMs: number;
  onMinimumTalkingDurationChange: (durationMs: number) => void;
  manualRenderState: AvatarRenderOutput["renderState"];
  expressionStrength: number;
  reactionExpression: string;
  onClearReactionOverlays: () => void;
  onTestThinking: () => void;
  onTestTalking: () => void;
  onTestReacting: () => void;
  onStopReacting: () => void;
  onFlipFacing: () => void;
  onDebugStrength: (value: number, label: string) => void;
  onLoadModel: () => void;
  onLoadAnimation: () => void;
  onCameraPreset: (preset: CameraPreset, label: string) => void;
  onMouthStrength: (value: number) => void;
  onMouthSpeed: (value: number, label: string) => void;
  onStopTalking: () => void;
  onThinkingDirection: (direction: ThinkingLookDirection, label: string) => void;
  onThinkingStrength: (value: number) => void;
  onStopThinking: () => void;
  onAutonomousBehaviorEnabled: (enabled: boolean) => void;
  onAutoBlinkEnabled: (enabled: boolean) => void;
  onAutonomousGazeEnabled: (enabled: boolean) => void;
  onMouseFollowEnabled: (enabled: boolean) => void;
  onIdleEyeMovementEnabled: (enabled: boolean) => void;
  onBehaviorManualOverrideActive: (active: boolean) => void;
  onReactionExpression: (expressionName: string) => void;
  onReactionStrength: (value: number) => void;
  onReactionDuration: (value: number) => void;
  onReactionMotionEnabled: (enabled: boolean) => void;
  onReactionMotionStrength: (value: number) => void;
  onExpressionStrengthChange: (value: number) => void;
  onExpressionTest: (expressionName: string) => void;
  onClearExpressions: () => void;
};

const EXPRESSION_TEST_NAMES = [
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "blink",
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "mouthOpen",
] as const;

const EXPRESSION_STRENGTH_OPTIONS = [0.25, 0.5, 0.75, 1] as const;
const MOUTH_STRENGTH_OPTIONS = [0.25, 0.5, 0.75, 1] as const;
const MOUTH_SPEED_OPTIONS = [
  { label: "Slow", value: 4 },
  { label: "Normal", value: 8 },
  { label: "Fast", value: 12 },
] as const;
const THINKING_LOOK_DIRECTIONS = [
  { label: "Left", value: "left" },
  { label: "Right", value: "right" },
  { label: "Down", value: "down" },
  { label: "Up", value: "up" },
  { label: "Center", value: "center" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: ThinkingLookDirection;
}>;
const THINKING_LOOK_STRENGTH_OPTIONS = [0.25, 0.5, 0.75, 1] as const;
const REACTION_EXPRESSION_OPTIONS = [
  "surprised",
  "happy",
  "relaxed",
  "angry",
  "sad",
] as const;
const REACTION_STRENGTH_OPTIONS = [0.25, 0.5, 0.75, 1] as const;
const REACTION_DURATION_OPTIONS = [800, 1200, 2000, 3000] as const;
const REACTION_MOTION_STRENGTH_OPTIONS = [0.05, 0.1, 0.15, 0.25] as const;
const MINIMUM_TALKING_DURATION_OPTIONS = [1000, 1500, 2000, 3000] as const;
const EMOTION_EXPRESSION_MODE_OPTIONS = [
  { label: "Off", value: "off" },
  { label: "Pulse", value: "pulse" },
  { label: "Hold During Speech", value: "holdDuringSpeech" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: EmotionExpressionMode;
}>;
const CAMERA_PRESETS = [
  { label: "Full Body", value: "fullBody" },
  { label: "Upper Body", value: "upperBody" },
  { label: "Face", value: "face" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: CameraPreset;
}>;

export function AvatarMotionExpressionPanel({
  avatarLoadSettings,
  onAvatarLoadSettingsChange,
  debugState,
  capabilities,
  emotionMappingDebug,
  autoAvatarControlEnabled,
  onAutoAvatarControlEnabledChange,
  emotionReactionEnabled,
  onEmotionReactionEnabledChange,
  emotionExpressionMode,
  onEmotionExpressionModeChange,
  heldEmotionExpression,
  heldEmotionExpressionValue,
  detectedAssistantEmotion,
  detectedAssistantEmotionIntensity,
  activeAssistantExpression,
  expressionSource,
  enableListeningPoseAfterReply,
  onListeningPoseAfterReplyChange,
  minimumTalkingDurationMs,
  onMinimumTalkingDurationChange,
  manualRenderState,
  expressionStrength,
  reactionExpression,
  onClearReactionOverlays,
  onTestThinking,
  onTestTalking,
  onTestReacting,
  onStopReacting,
  onFlipFacing,
  onDebugStrength,
  onLoadModel,
  onLoadAnimation,
  onCameraPreset,
  onMouthStrength,
  onMouthSpeed,
  onStopTalking,
  onThinkingDirection,
  onThinkingStrength,
  onStopThinking,
  onAutonomousBehaviorEnabled,
  onAutoBlinkEnabled,
  onAutonomousGazeEnabled,
  onMouseFollowEnabled,
  onIdleEyeMovementEnabled,
  onBehaviorManualOverrideActive,
  onReactionExpression,
  onReactionStrength,
  onReactionDuration,
  onReactionMotionEnabled,
  onReactionMotionStrength,
  onExpressionStrengthChange,
  onExpressionTest,
  onClearExpressions,
}: AvatarMotionExpressionPanelProps) {
  return (
    <>
      <div style={styles.motionControls} aria-label="Avatar motion debug controls">
        <button type="button" onClick={onClearReactionOverlays} style={styles.secondaryButton}>
          Idle
        </button>
        <button type="button" onClick={onTestThinking} style={styles.secondaryButton}>
          Thinking
        </button>
        <button type="button" onClick={onTestTalking} style={styles.secondaryButton}>
          Talking
        </button>
        <button type="button" onClick={onTestReacting} style={styles.secondaryButton}>
          Reacting
        </button>
        <button type="button" onClick={onStopReacting} style={styles.secondaryButton}>
          Stop Reacting
        </button>
      </div>

      <button type="button" onClick={onFlipFacing} style={styles.secondaryButton}>
        Flip Facing
      </button>

      <div style={styles.motionControls} aria-label="Debug reaction strength controls">
        <button type="button" onClick={() => onDebugStrength(0, "Off")} style={styles.secondaryButton}>
          Off
        </button>
        <button type="button" onClick={() => onDebugStrength(1, "Normal")} style={styles.secondaryButton}>
          Normal
        </button>
        <button type="button" onClick={() => onDebugStrength(2, "Strong")} style={styles.secondaryButton}>
          Strong
        </button>
        <button type="button" onClick={() => onDebugStrength(3, "Extreme")} style={styles.secondaryButton}>
          Extreme
        </button>
      </div>

      <div style={styles.vrmControls}>
        <input
          aria-label="VRM model URL"
          value={avatarLoadSettings.avatarUrl}
          onChange={(event) =>
            onAvatarLoadSettingsChange({
              ...avatarLoadSettings,
              avatarUrl: event.target.value,
            })
          }
          style={styles.input}
        />
        <button type="button" onClick={onLoadModel} style={styles.button}>
          Load VRM
        </button>
      </div>

      <div style={styles.vrmControls}>
        <input
          aria-label="VRMA animation URL"
          value={avatarLoadSettings.idleMotionUrl}
          onChange={(event) =>
            onAvatarLoadSettingsChange({
              ...avatarLoadSettings,
              idleMotionUrl: event.target.value,
            })
          }
          style={styles.input}
        />
        <button type="button" onClick={onLoadAnimation} style={styles.button}>
          Load Idle Animation
        </button>
      </div>

      <p style={styles.helperText}>
        Place the default model at apps/web/public/models/default.vrm and idle animation at
        apps/web/public/motions/idle.vrma
      </p>

      <section style={styles.debugPanel} aria-label="Avatar auto load settings">
        <h3 style={styles.debugTitle}>Avatar Load Settings</h3>
        <dl style={styles.debugGrid}>
          <DebugItem
            label="Auto Load Avatar"
            value={avatarLoadSettings.autoLoadAvatar ? "on" : "off"}
          />
          <DebugItem label="Avatar URL" value={avatarLoadSettings.avatarUrl} />
          <DebugItem label="Idle Motion URL" value={avatarLoadSettings.idleMotionUrl} />
        </dl>
        <div style={styles.motionControls}>
          <button
            type="button"
            onClick={() =>
              onAvatarLoadSettingsChange({
                ...avatarLoadSettings,
                autoLoadAvatar: true,
              })
            }
            style={{
              ...styles.secondaryButton,
              ...(avatarLoadSettings.autoLoadAvatar ? styles.activeButton : undefined),
            }}
          >
            Auto Load On
          </button>
          <button
            type="button"
            onClick={() =>
              onAvatarLoadSettingsChange({
                ...avatarLoadSettings,
                autoLoadAvatar: false,
              })
            }
            style={{
              ...styles.secondaryButton,
              ...(!avatarLoadSettings.autoLoadAvatar ? styles.activeButton : undefined),
            }}
          >
            Auto Load Off
          </button>
        </div>
      </section>

      <section style={styles.debugPanel} aria-label="VRM animation debug info">
        <h3 style={styles.debugTitle}>Animation Debug</h3>
        <dl style={styles.debugGrid}>
          <DebugItem label="hasVrm" value={String(debugState.hasVrm)} />
          <DebugItem label="hasAnimation" value={String(debugState.hasAnimation)} />
          <DebugItem label="animationName" value={debugState.animationName ?? "none"} />
          <DebugItem label="baseMotionState" value={debugState.baseMotionState} />
          <DebugItem label="reactionState" value={debugState.reactionState} />
          <DebugItem label="isTalkingOverlayActive" value={String(debugState.isTalkingOverlayActive)} />
          <DebugItem label="isThinkingOverlayActive" value={String(debugState.isThinkingOverlayActive)} />
          <DebugItem label="isReactingOverlayActive" value={String(debugState.isReactingOverlayActive)} />
          <DebugItem label="reactingExpression" value={debugState.reactingExpressionName} />
          <DebugItem
            label="reactingStrength"
            value={formatExpressionStrength(debugState.reactingExpressionStrength)}
          />
          <DebugItem label="reactingDurationMs" value={String(debugState.reactingDurationMs)} />
          <DebugItem
            label="reactingValue"
            value={debugState.currentReactingExpressionValue.toFixed(3)}
          />
          <DebugItem label="reactingMotion" value={String(debugState.reactingMotionEnabled)} />
          <DebugItem
            label="reactingMotionStrength"
            value={formatExpressionStrength(debugState.reactingMotionStrength)}
          />
          <DebugItem label="isHeadOverlayActive" value={String(debugState.isHeadOverlayActive)} />
          <DebugItem
            label="normalizedAnimationTime"
            value={
              debugState.normalizedAnimationTime === null
                ? "none"
                : debugState.normalizedAnimationTime.toFixed(3)
            }
          />
          <DebugItem label="isNearLoopBoundary" value={String(debugState.isNearLoopBoundary)} />
          <DebugItem
            label="loopBoundaryBlendWeight"
            value={debugState.loopBoundaryBlendWeight.toFixed(3)}
          />
          <DebugItem
            label="mixerTime"
            value={debugState.mixerTime === null ? "none" : debugState.mixerTime.toFixed(2)}
          />
          <DebugItem
            label="animationDuration"
            value={
              debugState.currentAnimationDuration === null
                ? "none"
                : debugState.currentAnimationDuration.toFixed(2)
            }
          />
          <DebugItem label="facingDirection" value={debugState.facingDirection} />
          <DebugItem
            label="modelRotationY"
            value={debugState.modelRotationY === null ? "none" : debugState.modelRotationY.toFixed(3)}
          />
          <DebugItem label="isAnimationPlaying" value={String(debugState.isAnimationPlaying)} />
          <DebugItem label="lastLoadedModelUrl" value={debugState.lastLoadedModelUrl ?? "none"} />
          <DebugItem label="lastLoadedAnimationUrl" value={debugState.lastLoadedAnimationUrl ?? "none"} />
          <DebugItem label="lastError" value={debugState.lastError ?? "none"} />
        </dl>
      </section>

      <section style={styles.debugPanel} aria-label="VRM autonomous behavior controls">
        <h3 style={styles.debugTitle}>Autonomous Behavior</h3>
        <dl style={styles.debugGrid}>
          <DebugItem label="behavior enabled" value={String(debugState.autonomousBehavior.enabled)} />
          <DebugItem label="controller instance" value={String(debugState.autonomousBehavior.instanceId)} />
          <DebugItem label="controller resets" value={String(debugState.autonomousBehavior.resetCount)} />
          <DebugItem label="controller delta" value={`${debugState.autonomousBehavior.lastUpdateDeltaMs.toFixed(3)}ms`} />
          <DebugItem label="renderer RAF active" value={String(debugState.rendererRafActiveCount)} />
          <DebugItem label="renderer delta" value={`${debugState.lastFrameDeltaMs.toFixed(3)}ms`} />
          <DebugItem label="lookAt available" value={String(debugState.hasLookAt)} />
          <DebugItem label="expression manager" value={String(debugState.hasExpressionManager)} />
          <DebugItem label="VRMA mixer active" value={String(debugState.isVrmMixerActive)} />
          <DebugItem label="manual override" value={String(debugState.autonomousBehavior.manualOverrideActive)} />
          <DebugItem label="blink enabled" value={String(debugState.autonomousBehavior.autoBlinkEnabled)} />
          <DebugItem label="blink phase" value={debugState.autonomousBehavior.blinkPhase} />
          <DebugItem label="next blink" value={`${debugState.autonomousBehavior.nextBlinkInMs}ms`} />
          <DebugItem label="blink value" value={debugState.autonomousBehavior.appliedBlinkValue.toFixed(3)} />
          <DebugItem label="blink expression" value={debugState.blinkExpressionName ?? "unavailable"} />
          <DebugItem label="gaze mode" value={debugState.autonomousBehavior.gazeMode} />
          <DebugItem label="gaze owner" value={debugState.autonomousBehavior.gazeOwner} />
          <DebugItem
            label="raw gaze target"
            value={`${debugState.autonomousBehavior.rawGazeTargetYaw.toFixed(1)}, ${debugState.autonomousBehavior.rawGazeTargetPitch.toFixed(1)}`}
          />
          <DebugItem
            label="gaze target"
            value={`${debugState.autonomousBehavior.gazeTargetYaw.toFixed(1)}, ${debugState.autonomousBehavior.gazeTargetPitch.toFixed(1)}`}
          />
          <DebugItem
            label="applied gaze"
            value={`${debugState.autonomousBehavior.currentGazeYaw.toFixed(1)}, ${debugState.autonomousBehavior.currentGazePitch.toFixed(1)}`}
          />
          <DebugItem label="mouse override" value={String(debugState.autonomousBehavior.mouseOverrideActive)} />
          <DebugItem
            label="autonomous target remaining"
            value={`${debugState.autonomousBehavior.autonomousTargetRemainingMs}ms`}
          />
          <DebugItem label="idle animation owner" value={debugState.autonomousBehavior.idleMotionOwner} />
          <DebugItem
            label="body procedural fallback"
            value={String(debugState.autonomousBehavior.idleMotionOwner === "procedural-fallback")}
          />
          <DebugItem label="active controllers" value={String(debugState.autonomousBehavior.activeControllerCount)} />
          <DebugItem label="mouth applied" value={debugState.currentMouthValue.toFixed(3)} />
        </dl>
        <div style={styles.motionControls} aria-label="Autonomous behavior enabled controls">
          <button
            type="button"
            onClick={() => onAutonomousBehaviorEnabled(true)}
            style={{
              ...styles.secondaryButton,
              ...(debugState.autonomousBehavior.enabled ? styles.activeButton : undefined),
            }}
          >
            Behavior On
          </button>
          <button
            type="button"
            onClick={() => onAutonomousBehaviorEnabled(false)}
            style={{
              ...styles.secondaryButton,
              ...(!debugState.autonomousBehavior.enabled ? styles.activeButton : undefined),
            }}
          >
            Behavior Off
          </button>
          <button
            type="button"
            onClick={() => onBehaviorManualOverrideActive(true)}
            style={{
              ...styles.secondaryButton,
              ...(debugState.autonomousBehavior.manualOverrideActive ? styles.activeButton : undefined),
            }}
          >
            Manual Override On
          </button>
          <button
            type="button"
            onClick={() => onBehaviorManualOverrideActive(false)}
            style={{
              ...styles.secondaryButton,
              ...(!debugState.autonomousBehavior.manualOverrideActive ? styles.activeButton : undefined),
            }}
          >
            Manual Override Off
          </button>
        </div>
        <div style={styles.motionControls} aria-label="Autonomous behavior feature controls">
          <ToggleButton
            label="Auto Blink"
            enabled={debugState.autonomousBehavior.autoBlinkEnabled}
            onChange={onAutoBlinkEnabled}
          />
          <ToggleButton
            label="Autonomous Gaze"
            enabled={debugState.autonomousBehavior.autonomousGazeEnabled}
            onChange={onAutonomousGazeEnabled}
          />
          <ToggleButton
            label="Mouse Follow"
            enabled={debugState.autonomousBehavior.mouseFollowEnabled}
            onChange={onMouseFollowEnabled}
          />
          <ToggleButton
            label="Idle Eyes"
            enabled={debugState.autonomousBehavior.idleEyeMovementEnabled}
            onChange={onIdleEyeMovementEnabled}
          />
        </div>
        <p style={styles.helperText}>
          Mouse movement over the VRM viewer temporarily overrides autonomous gaze; it returns after a short idle delay.
        </p>
      </section>

      <section style={styles.debugPanel} aria-label="VRM camera debug controls">
        <h3 style={styles.debugTitle}>Camera Debug</h3>
        <dl style={styles.debugGrid}>
          <DebugItem label="currentCameraPreset" value={debugState.cameraPreset} />
          <DebugItem label="cameraPosition" value={formatCameraPosition(debugState.cameraPosition)} />
          <DebugItem
            label="cameraPositionZ"
            value={debugState.cameraPosition === null ? "none" : debugState.cameraPosition.z.toFixed(2)}
          />
        </dl>
        <div style={styles.motionControls} aria-label="Camera preset controls">
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onCameraPreset(preset.value, preset.label)}
              style={{
                ...styles.secondaryButton,
                ...(debugState.cameraPreset === preset.value ? styles.activeButton : undefined),
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section style={styles.debugPanel} aria-label="VRM capability debug info">
        <h3 style={styles.debugTitle}>Capability Debug</h3>
        <dl style={styles.debugGrid}>
          <DebugItem label="hasVrm" value={String(capabilities.hasVrm)} />
          <DebugItem
            label="availableExpressions"
            value={
              capabilities.availableExpressions.length === 0
                ? "none"
                : capabilities.availableExpressions.join(", ")
            }
          />
          <DebugItem label="canControlMouth" value={String(capabilities.overlayTargets.canControlMouth)} />
          <DebugItem label="canBlink" value={String(capabilities.overlayTargets.canBlink)} />
          <DebugItem label="canControlHead" value={String(capabilities.overlayTargets.canControlHead)} />
          <DebugItem label="canControlNeck" value={String(capabilities.overlayTargets.canControlNeck)} />
        </dl>
        <dl style={styles.debugGrid}>
          {Object.entries(capabilities.humanoidBones).map(([boneName, isAvailable]) => (
            <DebugItem key={boneName} label={boneName} value={String(isAvailable)} />
          ))}
        </dl>
      </section>

      <section style={styles.debugPanel} aria-label="Emotion expression mapping debug panel">
        <h3 style={styles.debugTitle}>Emotion Mapping Debug</h3>
        <dl style={styles.debugGrid}>
          <DebugItem label="currentEmotionMood" value={emotionMappingDebug.currentEmotionMood} />
          <DebugItem label="mappedExpression" value={emotionMappingDebug.mappedExpression ?? "none"} />
          <DebugItem
            label="lastEmotionReactionTurnId"
            value={
              emotionMappingDebug.lastEmotionReactionTurnId === null
                ? "none"
                : String(emotionMappingDebug.lastEmotionReactionTurnId)
            }
          />
          <DebugItem label="lastTriggeredEmotionMood" value={emotionMappingDebug.lastTriggeredEmotionMood ?? "none"} />
          <DebugItem label="lastTriggeredExpression" value={emotionMappingDebug.lastTriggeredExpression ?? "none"} />
          <DebugItem label="autoAvatarControlEnabled" value={autoAvatarControlEnabled ? "on" : "off"} />
          <DebugItem label="emotionReactionEnabled" value={emotionReactionEnabled ? "on" : "off"} />
          <DebugItem label="Expression Mode" value={emotionExpressionMode} />
          <DebugItem label="Detected Emotion" value={detectedAssistantEmotion} />
          <DebugItem label="Emotion Intensity" value={detectedAssistantEmotionIntensity.toFixed(2)} />
          <DebugItem label="Active Expression" value={activeAssistantExpression ?? "none"} />
          <DebugItem label="Expression Source" value={expressionSource} />
          <DebugItem label="heldEmotionExpression" value={heldEmotionExpression ?? "none"} />
          <DebugItem label="heldEmotionExpressionValue" value={heldEmotionExpressionValue.toFixed(2)} />
          <DebugItem label="autoAvatarStatus" value={emotionMappingDebug.autoAvatarStatus} />
          <DebugItem label="currentAutoAvatarPhase" value={emotionMappingDebug.currentAutoAvatarPhase} />
        </dl>
        <div style={styles.motionControls} aria-label="Auto avatar control controls">
          <button
            type="button"
            onClick={() => onAutoAvatarControlEnabledChange(true)}
            style={{
              ...styles.secondaryButton,
              ...(autoAvatarControlEnabled ? styles.activeButton : undefined),
            }}
          >
            On
          </button>
          <button
            type="button"
            onClick={() => onAutoAvatarControlEnabledChange(false)}
            style={{
              ...styles.secondaryButton,
              ...(!autoAvatarControlEnabled ? styles.activeButton : undefined),
            }}
          >
            Off
          </button>
        </div>
        <div style={styles.motionControls} aria-label="Emotion reaction controls">
          <button
            type="button"
            onClick={() => onEmotionReactionEnabledChange(true)}
            style={{
              ...styles.secondaryButton,
              ...(emotionReactionEnabled ? styles.activeButton : undefined),
            }}
          >
            Emotion Reaction On
          </button>
          <button
            type="button"
            onClick={() => onEmotionReactionEnabledChange(false)}
            style={{
              ...styles.secondaryButton,
              ...(!emotionReactionEnabled ? styles.activeButton : undefined),
            }}
          >
            Emotion Reaction Off
          </button>
        </div>
        <div style={styles.motionControls} aria-label="Emotion expression mode controls">
          {EMOTION_EXPRESSION_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onEmotionExpressionModeChange(option.value)}
              style={{
                ...styles.secondaryButton,
                ...(emotionExpressionMode === option.value ? styles.activeButton : undefined),
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <dl style={styles.debugGrid}>
          <DebugItem label="minimumTalkingDurationMs" value={`${minimumTalkingDurationMs}ms`} />
          <DebugItem
            label="enableListeningPoseAfterReply"
            value={enableListeningPoseAfterReply ? "on" : "off"}
          />
        </dl>
        <div style={styles.motionControls} aria-label="Minimum talking duration controls">
          {MINIMUM_TALKING_DURATION_OPTIONS.map((durationMs) => (
            <button
              key={durationMs}
              type="button"
              onClick={() => onMinimumTalkingDurationChange(durationMs)}
              style={{
                ...styles.secondaryButton,
                ...(minimumTalkingDurationMs === durationMs ? styles.activeButton : undefined),
              }}
            >
              {durationMs}ms
            </button>
          ))}
        </div>
        <div style={styles.motionControls} aria-label="Listening pose after reply controls">
          <button
            type="button"
            onClick={() => onListeningPoseAfterReplyChange(true)}
            style={{
              ...styles.secondaryButton,
              ...(enableListeningPoseAfterReply ? styles.activeButton : undefined),
            }}
          >
            Listening Pose On
          </button>
          <button
            type="button"
            onClick={() => onListeningPoseAfterReplyChange(false)}
            style={{
              ...styles.secondaryButton,
              ...(!enableListeningPoseAfterReply ? styles.activeButton : undefined),
            }}
          >
            Listening Pose Off
          </button>
        </div>
      </section>

      <section style={styles.debugPanel} aria-label="VRM mouth debug panel">
        <h3 style={styles.debugTitle}>Mouth Debug</h3>
        <dl style={styles.debugGrid}>
          <DebugItem label="mouthExpression" value={debugState.mouthExpressionName} />
          <DebugItem label="mouthStrength" value={formatExpressionStrength(debugState.mouthStrength)} />
          <DebugItem label="mouthSpeed" value={debugState.mouthSpeed.toFixed(1)} />
          <DebugItem label="currentMouthValue" value={debugState.currentMouthValue.toFixed(3)} />
        </dl>
        <div style={styles.motionControls} aria-label="Mouth strength controls">
          {MOUTH_STRENGTH_OPTIONS.map((strength) => (
            <button
              key={strength}
              type="button"
              onClick={() => onMouthStrength(strength)}
              style={{
                ...styles.secondaryButton,
                ...(debugState.mouthStrength === strength ? styles.activeButton : undefined),
              }}
            >
              {formatExpressionStrength(strength)}
            </button>
          ))}
        </div>
        <div style={styles.motionControls} aria-label="Mouth speed controls">
          {MOUTH_SPEED_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onMouthSpeed(option.value, option.label)}
              style={{
                ...styles.secondaryButton,
                ...(debugState.mouthSpeed === option.value ? styles.activeButton : undefined),
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={styles.motionControls}>
          <button type="button" onClick={onTestTalking} style={styles.secondaryButton}>
            Test Talking
          </button>
          <button type="button" onClick={onStopTalking} style={styles.secondaryButton}>
            Stop Talking
          </button>
        </div>
      </section>

      <section style={styles.debugPanel} aria-label="VRM thinking debug panel">
        <h3 style={styles.debugTitle}>Thinking Debug</h3>
        <dl style={styles.debugGrid}>
          <DebugItem label="lookDirection" value={debugState.thinkingLookDirection} />
          <DebugItem label="lookStrength" value={formatExpressionStrength(debugState.thinkingLookStrength)} />
          <DebugItem label="headYaw" value={debugState.currentHeadYaw.toFixed(3)} />
          <DebugItem label="headPitch" value={debugState.currentHeadPitch.toFixed(3)} />
          <DebugItem label="neckYaw" value={debugState.currentNeckYaw.toFixed(3)} />
          <DebugItem label="neckPitch" value={debugState.currentNeckPitch.toFixed(3)} />
        </dl>
        <div style={styles.expressionControls} aria-label="Thinking look direction controls">
          {THINKING_LOOK_DIRECTIONS.map((direction) => (
            <button
              key={direction.value}
              type="button"
              onClick={() => onThinkingDirection(direction.value, direction.label)}
              style={{
                ...styles.secondaryButton,
                ...(debugState.thinkingLookDirection === direction.value ? styles.activeButton : undefined),
              }}
            >
              {direction.label}
            </button>
          ))}
        </div>
        <div style={styles.motionControls} aria-label="Thinking look strength controls">
          {THINKING_LOOK_STRENGTH_OPTIONS.map((strength) => (
            <button
              key={strength}
              type="button"
              onClick={() => onThinkingStrength(strength)}
              style={{
                ...styles.secondaryButton,
                ...(debugState.thinkingLookStrength === strength ? styles.activeButton : undefined),
              }}
            >
              {formatExpressionStrength(strength)}
            </button>
          ))}
        </div>
        <div style={styles.motionControls}>
          <button type="button" onClick={onTestThinking} style={styles.secondaryButton}>
            Test Thinking
          </button>
          <button type="button" onClick={onStopThinking} style={styles.secondaryButton}>
            Stop Thinking
          </button>
        </div>
      </section>

      <section style={styles.debugPanel} aria-label="VRM reacting debug panel">
        <h3 style={styles.debugTitle}>Reacting Debug</h3>
        <dl style={styles.debugGrid}>
          <DebugItem label="reactionExpression" value={debugState.reactingExpressionName} />
          <DebugItem label="reactionStrength" value={formatExpressionStrength(debugState.reactingExpressionStrength)} />
          <DebugItem label="reactionDuration" value={`${debugState.reactingDurationMs}ms`} />
          <DebugItem label="currentReactionValue" value={debugState.currentReactingExpressionValue.toFixed(3)} />
          <DebugItem label="reactingOverlay" value={String(debugState.isReactingOverlayActive)} />
          <DebugItem label="motionEnabled" value={String(debugState.reactingMotionEnabled)} />
          <DebugItem label="motionStrength" value={formatExpressionStrength(debugState.reactingMotionStrength)} />
        </dl>
        <div style={styles.expressionControls} aria-label="Reaction expression controls">
          {REACTION_EXPRESSION_OPTIONS.map((expressionName) => (
            <button
              key={expressionName}
              type="button"
              onClick={() => onReactionExpression(expressionName)}
              style={{
                ...styles.secondaryButton,
                ...(reactionExpression === expressionName ? styles.activeButton : undefined),
              }}
            >
              {expressionName}
            </button>
          ))}
        </div>
        <div style={styles.motionControls} aria-label="Reaction strength controls">
          {REACTION_STRENGTH_OPTIONS.map((strength) => (
            <button
              key={strength}
              type="button"
              onClick={() => onReactionStrength(strength)}
              style={{
                ...styles.secondaryButton,
                ...(debugState.reactingExpressionStrength === strength ? styles.activeButton : undefined),
              }}
            >
              {formatExpressionStrength(strength)}
            </button>
          ))}
        </div>
        <div style={styles.motionControls} aria-label="Reaction duration controls">
          {REACTION_DURATION_OPTIONS.map((durationMs) => (
            <button
              key={durationMs}
              type="button"
              onClick={() => onReactionDuration(durationMs)}
              style={{
                ...styles.secondaryButton,
                ...(debugState.reactingDurationMs === durationMs ? styles.activeButton : undefined),
              }}
            >
              {durationMs}ms
            </button>
          ))}
        </div>
        <div style={styles.motionControls} aria-label="Reacting motion enabled controls">
          <button
            type="button"
            onClick={() => onReactionMotionEnabled(false)}
            style={{
              ...styles.secondaryButton,
              ...(!debugState.reactingMotionEnabled ? styles.activeButton : undefined),
            }}
          >
            Off
          </button>
          <button
            type="button"
            onClick={() => onReactionMotionEnabled(true)}
            style={{
              ...styles.secondaryButton,
              ...(debugState.reactingMotionEnabled ? styles.activeButton : undefined),
            }}
          >
            On
          </button>
        </div>
        <div style={styles.motionControls} aria-label="Reacting motion strength controls">
          {REACTION_MOTION_STRENGTH_OPTIONS.map((strength) => (
            <button
              key={strength}
              type="button"
              onClick={() => onReactionMotionStrength(strength)}
              style={{
                ...styles.secondaryButton,
                ...(debugState.reactingMotionStrength === strength ? styles.activeButton : undefined),
              }}
            >
              {formatExpressionStrength(strength)}
            </button>
          ))}
        </div>
        <div style={styles.motionControls}>
          <button type="button" onClick={onTestReacting} style={styles.secondaryButton}>
            Trigger Reaction
          </button>
          <button type="button" onClick={onStopReacting} style={styles.secondaryButton}>
            Stop Reacting
          </button>
        </div>
      </section>

      <section style={styles.debugPanel} aria-label="VRM expression test panel">
        <h3 style={styles.debugTitle}>Expression Test</h3>
        <div style={styles.motionControls} aria-label="Expression strength controls">
          {EXPRESSION_STRENGTH_OPTIONS.map((strength) => (
            <button
              key={strength}
              type="button"
              onClick={() => onExpressionStrengthChange(strength)}
              style={{
                ...styles.secondaryButton,
                ...(expressionStrength === strength ? styles.activeButton : undefined),
              }}
            >
              {formatExpressionStrength(strength)}
            </button>
          ))}
        </div>
        <div style={styles.expressionControls}>
          {EXPRESSION_TEST_NAMES.map((expressionName) => (
            <button
              key={expressionName}
              type="button"
              onClick={() => onExpressionTest(expressionName)}
              style={styles.secondaryButton}
            >
              {expressionName}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClearExpressions} style={styles.secondaryButton}>
          Clear Expressions
        </button>
      </section>

      <pre style={styles.renderState}>{JSON.stringify(manualRenderState, null, 2)}</pre>
    </>
  );
}

function ToggleButton({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      style={{
        ...styles.secondaryButton,
        ...(enabled ? styles.activeButton : undefined),
      }}
    >
      {label}: {enabled ? "On" : "Off"}
    </button>
  );
}

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.debugItem}>
      <dt style={styles.debugLabel}>{label}</dt>
      <dd style={styles.debugValue}>{value}</dd>
    </div>
  );
}

function formatExpressionStrength(value: number) {
  return value.toFixed(value === 1 ? 1 : 2);
}

function formatCameraPosition(position: VrmRendererDebugState["cameraPosition"]) {
  if (position === null) {
    return "none";
  }

  return `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`;
}

const styles = {
  input: {
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    font: "inherit",
  },
  button: {
    padding: "10px 16px",
    border: "1px solid #1f5eff",
    borderRadius: 8,
    background: "#1f5eff",
    color: "#ffffff",
    font: "inherit",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "9px 12px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#c8d0df",
    borderRadius: 8,
    background: "#ffffff",
    color: "#172033",
    font: "inherit",
    cursor: "pointer",
  },
  activeButton: {
    borderColor: "#1f5eff",
    background: "#e7f0ff",
    color: "#123a9f",
  },
  debugPanel: {
    display: "grid",
    gap: 12,
    padding: 16,
    background: "#ffffff",
    border: "1px solid #d8deea",
    borderRadius: 8,
  },
  debugTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0,
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
  renderState: {
    margin: 0,
    maxHeight: 220,
    overflow: "auto",
    padding: 12,
    borderRadius: 8,
    background: "#101828",
    color: "#f8fafc",
    fontSize: 12,
    lineHeight: 1.5,
  },
  vrmControls: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
  },
  motionControls: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  },
  expressionControls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))",
    gap: 8,
  },
  helperText: {
    margin: 0,
    color: "#5c667a",
    fontSize: 13,
    lineHeight: 1.5,
  },
} satisfies Record<string, CSSProperties>;
