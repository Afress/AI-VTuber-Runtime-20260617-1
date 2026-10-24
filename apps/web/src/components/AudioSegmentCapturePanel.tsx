import type { CSSProperties } from "react";
import type { AudioSegmentCaptureSnapshot } from "@runtime/audio-core";

type AudioSegmentCapturePanelProps = {
  snapshot: AudioSegmentCaptureSnapshot;
  onEnabledChange: (enabled: boolean) => void;
  onReset: () => void;
  onDownloadLast: () => void;
  onClearLast: () => void;
};

export function AudioSegmentCapturePanel({
  snapshot,
  onEnabledChange,
  onReset,
  onDownloadLast,
  onClearLast,
}: AudioSegmentCapturePanelProps) {
  return (
    <section style={styles.panel} aria-label="Audio segment capture debug panel">
      <h2 style={styles.title}>Audio Segment Capture Debug</h2>
      <dl style={styles.grid}>
        <Item label="Enabled" value={snapshot.enabled ? "on" : "off"} />
        <Item label="State" value={snapshot.state} />
        <Item label="PCM Source" value={snapshot.pcmSourceAttached ? "attached" : "not attached"} />
        <Item label="Processing Frames" value={snapshot.processingFrameCount.toString()} />
        <Item label="Sample Rate / Channels" value={`${snapshot.sampleRate ?? "-"} / ${snapshot.channelCount}`} />
        <Item label="Pre-roll Buffered" value={`${snapshot.preRollBufferedMs} ms`} />
        <Item label="Active Segment" value={snapshot.activeSegmentId ?? "none"} />
        <Item label="Active Duration / Samples" value={`${snapshot.activeDurationMs} ms / ${snapshot.activeSampleCount}`} />
        <Item label="Segments" value={snapshot.segmentCount.toString()} />
        <Item label="Last Segment" value={snapshot.lastSegmentDurationMs === null ? "none" : `${snapshot.lastSegmentDurationMs} ms`} />
        <Item label="Last WAV Bytes" value={snapshot.lastSegmentByteSize?.toString() ?? "none"} />
        <Item label="Last End / Valid" value={`${snapshot.lastEndReason ?? "none"} / ${snapshot.lastValidSpeech === true ? "yes" : snapshot.lastValidSpeech === false ? "no" : "-"}`} />
        <Item label="Dropped Frames" value={snapshot.droppedFrameCount.toString()} />
        <Item label="Active Capture Loops" value={snapshot.activeCaptureLoopCount.toString()} />
        <Item label="Last Error" value={snapshot.lastError ?? "none"} />
      </dl>
      <div style={styles.controls}>
        <button type="button" onClick={() => onEnabledChange(true)} style={styles.button}>Enable Capture</button>
        <button type="button" onClick={() => onEnabledChange(false)} style={styles.secondaryButton}>Disable Capture</button>
        <button type="button" onClick={onReset} style={styles.secondaryButton}>Reset Capture</button>
        <button type="button" onClick={onDownloadLast} style={styles.secondaryButton} disabled={snapshot.lastSegmentByteSize === null}>Download Last WAV</button>
        <button type="button" onClick={onClearLast} style={styles.secondaryButton}>Clear Last Segment</button>
      </div>
      <p style={styles.note}>Capture consumes microphone PCM only after it is enabled. It does not transcribe, submit chat, or control avatar motion.</p>
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return <div style={styles.item}><dt style={styles.label}>{label}</dt><dd style={styles.value}>{value}</dd></div>;
}

const styles = {
  panel: { display: "grid", gap: 12, padding: 16, background: "#ffffff", border: "1px solid #d8deea", borderRadius: 8 },
  title: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 0 },
  grid: { margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 },
  item: { display: "grid", gap: 4, minWidth: 0, padding: 10, border: "1px solid #e0e5ef", borderRadius: 8, background: "#f8fafc" },
  label: { color: "#5c667a", fontSize: 12 },
  value: { margin: 0, color: "#172033", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 13, overflowWrap: "anywhere" },
  controls: { display: "flex", flexWrap: "wrap", gap: 8 },
  button: { padding: "9px 12px", border: "1px solid #1f5eff", borderRadius: 8, background: "#1f5eff", color: "#ffffff", font: "inherit", cursor: "pointer" },
  secondaryButton: { padding: "9px 12px", border: "1px solid #c8d0df", borderRadius: 8, background: "#ffffff", color: "#172033", font: "inherit", cursor: "pointer" },
  note: { margin: 0, color: "#5c667a", fontSize: 12 },
} satisfies Record<string, CSSProperties>;
