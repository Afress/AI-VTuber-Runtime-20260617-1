import type { CSSProperties } from "react";

type LipSyncPreset = "balanced" | "highSensitivity" | "mockAudioTts" | "custom";

type AudioDebugState = {
  enabled: boolean;
  lipSyncEnabled: boolean;
  playbackState: string;
  lastAudioSource: string;
  currentAudioVolume: number;
  externalMouthValue: number;
  lipSyncPreset: LipSyncPreset;
  lipSyncGain: number;
  lipSyncNoiseGate: number;
  lipSyncSmoothing: number;
  lipSyncMaxMouthValue: number;
  lipSyncMinMouthValue: number;
  lipSyncCurvePower: number;
  lipSyncIsSaturated: boolean;
  lipSyncSaturationWarning: string | null;
  status: string;
};

type AudioDebugPanelProps = {
  audioDebugState: AudioDebugState;
  mouthDrivingMode: string;
  testAudioUrl: string;
  onAudioEnabledChange: (enabled: boolean) => void;
  onLipSyncEnabledChange: (enabled: boolean) => void;
  onLipSyncPresetChange: (preset: LipSyncPreset) => void;
  onLipSyncGainChange: (value: number) => void;
  onLipSyncNoiseGateChange: (value: number) => void;
  onLipSyncSmoothingChange: (value: number) => void;
  onLipSyncMaxMouthValueChange: (value: number) => void;
  onLipSyncCurvePowerChange: (value: number) => void;
  onTestAudioUrlChange: (value: string) => void;
  onPlayTestAudio: () => void;
  onStopAudio: () => void;
};

const LIP_SYNC_PRESET_OPTIONS = [
  { label: "Balanced", value: "balanced" },
  { label: "High Sensitivity", value: "highSensitivity" },
  { label: "Mock Audio TTS", value: "mockAudioTts" },
  { label: "Custom", value: "custom" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: LipSyncPreset;
}>;

export function AudioDebugPanel({
  audioDebugState,
  mouthDrivingMode,
  testAudioUrl,
  onAudioEnabledChange,
  onLipSyncEnabledChange,
  onLipSyncPresetChange,
  onLipSyncGainChange,
  onLipSyncNoiseGateChange,
  onLipSyncSmoothingChange,
  onLipSyncMaxMouthValueChange,
  onLipSyncCurvePowerChange,
  onTestAudioUrlChange,
  onPlayTestAudio,
  onStopAudio,
}: AudioDebugPanelProps) {
  return (
    <section style={styles.debugPanel} aria-label="Audio debug panel">
      <h2 style={styles.debugTitle}>Audio Debug</h2>
      <dl style={styles.debugGrid}>
        <DebugItem label="Audio Playback Enabled" value={audioDebugState.enabled ? "on" : "off"} />
        <DebugItem label="Audio Playback State" value={audioDebugState.playbackState} />
        <DebugItem label="Last Audio Source" value={audioDebugState.lastAudioSource} />
        <DebugItem label="Lip Sync Enabled" value={audioDebugState.lipSyncEnabled ? "on" : "off"} />
        <DebugItem
          label="Lip Sync Preset"
          value={formatLipSyncPresetName(audioDebugState.lipSyncPreset)}
        />
        <DebugItem label="Mouth Driving Mode" value={mouthDrivingMode} />
        <DebugItem
          label="Current Audio Volume"
          value={audioDebugState.currentAudioVolume.toFixed(3)}
        />
        <DebugItem
          label="Calibrated Mouth Value"
          value={audioDebugState.externalMouthValue.toFixed(3)}
        />
        <DebugItem label="Lip Sync Gain" value={audioDebugState.lipSyncGain.toFixed(1)} />
        <DebugItem
          label="Noise Gate"
          value={audioDebugState.lipSyncNoiseGate.toFixed(2)}
        />
        <DebugItem
          label="Smoothing"
          value={audioDebugState.lipSyncSmoothing.toFixed(2)}
        />
        <DebugItem
          label="Max Mouth"
          value={audioDebugState.lipSyncMaxMouthValue.toFixed(2)}
        />
        <DebugItem
          label="Curve Power"
          value={audioDebugState.lipSyncCurvePower.toFixed(2)}
        />
        <DebugItem
          label="Saturation Warning"
          value={audioDebugState.lipSyncSaturationWarning ?? "none"}
        />
        <DebugItem label="Status" value={audioDebugState.status} />
      </dl>
      <div style={styles.vrmControls}>
        <input
          aria-label="Play Test Audio URL"
          value={testAudioUrl}
          onChange={(event) => onTestAudioUrlChange(event.target.value)}
          style={styles.input}
        />
        <button
          type="button"
          onClick={onPlayTestAudio}
          disabled={!testAudioUrl.trim()}
          style={styles.button}
        >
          Play Test Audio
        </button>
      </div>
      <div style={styles.motionControls} aria-label="Audio playback controls">
        <button
          type="button"
          onClick={() => onAudioEnabledChange(true)}
          style={{
            ...styles.secondaryButton,
            ...(audioDebugState.enabled ? styles.activeButton : undefined),
          }}
        >
          Audio Playback On
        </button>
        <button
          type="button"
          onClick={() => onAudioEnabledChange(false)}
          style={{
            ...styles.secondaryButton,
            ...(!audioDebugState.enabled ? styles.activeButton : undefined),
          }}
        >
          Audio Playback Off
        </button>
        <button type="button" onClick={onStopAudio} style={styles.secondaryButton}>
          Stop Audio
        </button>
      </div>
      <div style={styles.motionControls} aria-label="Lip sync controls">
        <button
          type="button"
          onClick={() => onLipSyncEnabledChange(true)}
          style={{
            ...styles.secondaryButton,
            ...(audioDebugState.lipSyncEnabled ? styles.activeButton : undefined),
          }}
        >
          Lip Sync On
        </button>
        <button
          type="button"
          onClick={() => onLipSyncEnabledChange(false)}
          style={{
            ...styles.secondaryButton,
            ...(!audioDebugState.lipSyncEnabled ? styles.activeButton : undefined),
          }}
        >
          Lip Sync Off
        </button>
      </div>
      <div style={styles.motionControls} aria-label="Lip sync preset controls">
        {LIP_SYNC_PRESET_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onLipSyncPresetChange(option.value)}
            style={{
              ...styles.secondaryButton,
              ...(audioDebugState.lipSyncPreset === option.value ? styles.activeButton : undefined),
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="Lip sync gain controls">
        {[2, 3, 4, 6, 8].map((gain) => (
          <button
            key={gain}
            type="button"
            onClick={() => onLipSyncGainChange(gain)}
            style={{
              ...styles.secondaryButton,
              ...(audioDebugState.lipSyncGain === gain ? styles.activeButton : undefined),
            }}
          >
            Gain {gain.toFixed(1)}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="Lip sync noise gate controls">
        {[0.01, 0.03, 0.05, 0.08].map((noiseGate) => (
          <button
            key={noiseGate}
            type="button"
            onClick={() => onLipSyncNoiseGateChange(noiseGate)}
            style={{
              ...styles.secondaryButton,
              ...(audioDebugState.lipSyncNoiseGate === noiseGate
                ? styles.activeButton
                : undefined),
            }}
          >
            Gate {noiseGate.toFixed(2)}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="Lip sync smoothing controls">
        {[0.15, 0.25, 0.35, 0.5].map((smoothing) => (
          <button
            key={smoothing}
            type="button"
            onClick={() => onLipSyncSmoothingChange(smoothing)}
            style={{
              ...styles.secondaryButton,
              ...(audioDebugState.lipSyncSmoothing === smoothing
                ? styles.activeButton
                : undefined),
            }}
          >
            Smooth {smoothing}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="Lip sync max mouth controls">
        {[0.6, 0.75, 0.85, 1].map((maxMouthValue) => (
          <button
            key={maxMouthValue}
            type="button"
            onClick={() => onLipSyncMaxMouthValueChange(maxMouthValue)}
            style={{
              ...styles.secondaryButton,
              ...(audioDebugState.lipSyncMaxMouthValue === maxMouthValue
                ? styles.activeButton
                : undefined),
            }}
          >
            Max {maxMouthValue.toFixed(maxMouthValue === 1 ? 1 : 2)}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="Lip sync curve power controls">
        {[0.5, 0.65, 0.85, 1, 1.25].map((curvePower) => (
          <button
            key={curvePower}
            type="button"
            onClick={() => onLipSyncCurvePowerChange(curvePower)}
            style={{
              ...styles.secondaryButton,
              ...(audioDebugState.lipSyncCurvePower === curvePower
                ? styles.activeButton
                : undefined),
            }}
          >
            Curve {curvePower.toFixed(curvePower === 1 ? 1 : 2)}
          </button>
        ))}
      </div>
    </section>
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

function formatLipSyncPresetName(preset: LipSyncPreset) {
  const option = LIP_SYNC_PRESET_OPTIONS.find((item) => item.value === preset);
  return option?.label ?? preset;
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
    border: "1px solid #c8d0df",
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
} satisfies Record<string, CSSProperties>;
