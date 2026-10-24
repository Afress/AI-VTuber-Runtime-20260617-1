import { useEffect, useState, type CSSProperties } from "react";
import { Live2DCanvasRuntime } from "./Live2DCanvasRuntime";

type Live2DViewerPanelProps = {
  runtimeMode: "normal" | "debug";
  modelUrl: string;
  mouthValue: number;
  mouthSyncEnabled: boolean;
  audioPlaying: boolean;
};

export function Live2DViewerPanel({
  runtimeMode,
  modelUrl,
  mouthValue,
  mouthSyncEnabled,
  audioPlaying,
}: Live2DViewerPanelProps) {
  const [live2dModelUrl, setLive2dModelUrl] = useState(modelUrl);

  useEffect(() => {
    setLive2dModelUrl(modelUrl);
  }, [modelUrl]);

  return (
    <section style={styles.panel} aria-label="Live2D viewer">
      <div style={styles.header}>
        <h2 style={styles.title}>Live2D Viewer</h2>
        <span style={styles.statusText}>Live2D v8 display baseline</span>
      </div>

      <Live2DCanvasRuntime
        modelUrl={live2dModelUrl}
        mouthValue={mouthValue}
        mouthSyncEnabled={mouthSyncEnabled}
        audioPlaying={audioPlaying}
      />

      <dl style={styles.debugGrid}>
        <DebugItem label="Live2D Model URL" value={live2dModelUrl} />
        <DebugItem label="Audio Mouth Value" value={mouthValue.toFixed(2)} />
        <DebugItem label="Audio Playing" value={audioPlaying ? "yes" : "no"} />
        <DebugItem label="Mouth Sync" value={mouthSyncEnabled ? "audio" : "manual"} />
        <DebugItem label="Runtime Mode" value={runtimeMode} />
        <DebugItem label="Phase" value="2D-2 audio mouth sync bridge" />
      </dl>

      <div style={styles.controls}>
        <input
          aria-label="Live2D Model URL"
          value={live2dModelUrl}
          onChange={(event) => setLive2dModelUrl(event.target.value)}
          style={styles.input}
        />
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

const styles = {
  panel: {
    display: "grid",
    gap: 12,
    padding: 16,
    background: "#ffffff",
    border: "1px solid #d8deea",
    borderRadius: 8,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0,
  },
  statusText: {
    color: "#5c667a",
    fontSize: 13,
    overflowWrap: "anywhere",
    textAlign: "right",
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
  controls: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  },
  input: {
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    font: "inherit",
  },
} satisfies Record<string, CSSProperties>;
