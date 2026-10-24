import type { CSSProperties } from "react";
import type { EnergyVadConfig, VadSnapshot } from "@runtime/audio-core";

type VadDebugPanelProps = {
  snapshot: VadSnapshot;
  config: EnergyVadConfig;
  onEnabledChange: (enabled: boolean) => void;
  onReset: () => void;
  onConfigChange: (config: Partial<EnergyVadConfig>) => void;
  onRestoreDefaults: () => void;
};

export function VadDebugPanel({
  snapshot,
  config,
  onEnabledChange,
  onReset,
  onConfigChange,
  onRestoreDefaults,
}: VadDebugPanelProps) {
  return (
    <section style={styles.panel} aria-label="Client-side VAD debug panel">
      <h2 style={styles.title}>Client-side VAD Debug</h2>
      <dl style={styles.grid}>
        <Item label="Enabled" value={snapshot.enabled ? "on" : "off"} />
        <Item label="State" value={snapshot.state} />
        <Item label="Calibrating" value={`${Math.round(snapshot.calibrationProgress * 100)}%`} />
        <Item label="Speech Active" value={snapshot.speechActive ? "yes" : "no"} />
        <Item label="Raw RMS" value={snapshot.rawLevel.toFixed(4)} />
        <Item label="Smoothed RMS" value={snapshot.smoothedLevel.toFixed(4)} />
        <Item label="Noise Floor" value={snapshot.noiseFloor.toFixed(4)} />
        <Item label="Threshold" value={snapshot.threshold.toFixed(4)} />
        <Item label="Score" value={snapshot.score.toFixed(3)} />
        <Item label="Candidate" value={`${snapshot.speechCandidateDurationMs} ms`} />
        <Item label="Speech Duration" value={`${snapshot.speechDurationMs} ms`} />
        <Item label="Silence Duration" value={`${snapshot.silenceDurationMs} ms`} />
        <Item label="Speech Starts / Ends" value={`${snapshot.speechStartCount} / ${snapshot.speechEndCount}`} />
        <Item label="Last Speech" value={formatDuration(snapshot.lastSpeechDurationMs)} />
        <Item label="Last End Reason" value={snapshot.lastEndReason ?? "none"} />
        <Item label="Processing FPS" value={snapshot.processingFps.toString()} />
        <Item label="Processing Loops" value={snapshot.activeProcessingLoopCount.toString()} />
        <Item label="Clipped" value={snapshot.clipped ? "yes" : "no"} />
        <Item label="Last Error" value={snapshot.lastError ?? "none"} />
      </dl>

      <div style={styles.controls}>
        <button type="button" onClick={() => onEnabledChange(true)} style={styles.button}>
          Enable VAD
        </button>
        <button type="button" onClick={() => onEnabledChange(false)} style={styles.secondaryButton}>
          Disable VAD
        </button>
        <button type="button" onClick={onReset} style={styles.secondaryButton}>
          Reset / Recalibrate
        </button>
        <button type="button" onClick={onRestoreDefaults} style={styles.secondaryButton}>
          Restore Defaults
        </button>
      </div>

      <div style={styles.settings}>
        <NumericSetting
          label="Threshold Sensitivity"
          value={config.thresholdMultiplier}
          min={1}
          max={5}
          step={0.1}
          onChange={(thresholdMultiplier) => onConfigChange({ thresholdMultiplier })}
        />
        <NumericSetting
          label="Speech Start Debounce (ms)"
          value={config.speechStartDurationMs}
          min={20}
          max={500}
          step={10}
          onChange={(speechStartDurationMs) => onConfigChange({ speechStartDurationMs })}
        />
        <NumericSetting
          label="Speech End Silence (ms)"
          value={config.speechEndSilenceMs}
          min={200}
          max={2000}
          step={50}
          onChange={(speechEndSilenceMs) => onConfigChange({ speechEndSilenceMs })}
        />
      </div>
    </section>
  );
}

function NumericSetting({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={styles.setting}>
      <span>{label}: {value}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.item}>
      <dt style={styles.label}>{label}</dt>
      <dd style={styles.value}>{value}</dd>
    </div>
  );
}

function formatDuration(value: number | null) {
  return value === null ? "none" : `${value} ms`;
}

const styles = {
  panel: {
    display: "grid",
    gap: 12,
    padding: 16,
    background: "#ffffff",
    border: "1px solid #d8deea",
    borderRadius: 8,
  },
  title: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 0 },
  grid: {
    margin: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  item: {
    display: "grid",
    gap: 4,
    minWidth: 0,
    padding: 10,
    border: "1px solid #e0e5ef",
    borderRadius: 8,
    background: "#f8fafc",
  },
  label: { color: "#5c667a", fontSize: 12 },
  value: {
    margin: 0,
    color: "#172033",
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    fontSize: 13,
    overflowWrap: "anywhere",
  },
  controls: { display: "flex", flexWrap: "wrap", gap: 8 },
  button: {
    padding: "9px 12px",
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
  settings: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 },
  setting: { display: "grid", gap: 6, color: "#364152", fontSize: 13 },
} satisfies Record<string, CSSProperties>;
