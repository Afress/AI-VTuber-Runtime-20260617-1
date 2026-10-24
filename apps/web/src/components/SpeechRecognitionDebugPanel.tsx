import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { SpeechRecognitionSnapshot } from "@runtime/stt-core";

type Props = {
  snapshot: SpeechRecognitionSnapshot;
  endpoint: string;
  language: string;
  onEndpointChange: (value: string) => void;
  onEndpointCommit: () => void;
  onLanguageChange: (value: string) => void;
  onHealthCheck: () => void;
  onTranscribeLast: () => void;
  onAutoChange: (enabled: boolean) => void;
  onCancel: () => void;
  onClear: () => void;
  chatDraft: string;
  transcriptReviewStatus: string | null;
  onUseLatestTranscript: () => void;
  onAppendLatestTranscript: () => void;
  onReplaceLatestTranscript: () => void;
};

export function SpeechRecognitionDebugPanel({ snapshot, endpoint, language, onEndpointChange, onEndpointCommit, onLanguageChange, onHealthCheck, onTranscribeLast, onAutoChange, onCancel, onClear, chatDraft, transcriptReviewStatus, onUseLatestTranscript, onAppendLatestTranscript, onReplaceLatestTranscript }: Props) {
  useEffect(() => {
    onHealthCheck();
    // This panel is Debug-only. Mounting it performs one explicit health check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleHealthButtonClick() {
    onHealthCheck();
  }

  return <section style={styles.panel} aria-label="Speech recognition debug panel">
    <h2 style={styles.title}>Local STT Debug</h2>
    <label style={styles.setting}>Endpoint<input value={endpoint} onChange={(event) => onEndpointChange(event.target.value)} onBlur={onEndpointCommit} style={styles.input} /></label>
    <label style={styles.setting}>Language<select value={language} onChange={(event) => onLanguageChange(event.target.value)} style={styles.input}><option value="auto">auto</option><option value="zh">zh</option><option value="ja">ja</option><option value="en">en</option></select></label>
    <dl style={styles.grid}>
      <Item label="Provider" value={snapshot.providerId} /><Item label="Status" value={snapshot.status} /><Item label="Health" value={snapshot.health ? snapshot.health.available ? "available" : "unavailable" : "unchecked"} />
      <Item label="Active Request / Segment" value={`${snapshot.activeRequestId ?? "none"} / ${snapshot.activeSegmentId ?? "none"}`} /><Item label="Queue / Requests" value={`${snapshot.queueLength} / ${snapshot.requestCount}`} />
      <Item label="Completed / Errors / Cancelled" value={`${snapshot.completedCount} / ${snapshot.errorCount} / ${snapshot.cancelledCount}`} /><Item label="Last Segment / Bytes" value={`${snapshot.lastSegmentDurationMs ?? "-"} ms / ${snapshot.lastAudioByteSize ?? "-"}`} />
      <Item label="Transcript" value={snapshot.lastTranscript ?? "none"} /><Item label="Language / Processing" value={`${snapshot.detectedLanguage ?? "-"} / ${snapshot.processingTimeMs ?? "-"} ms`} />
      {snapshot.lastRawTranscript && snapshot.lastRawTranscript !== snapshot.lastTranscript ? <Item label="Raw Transcript" value={snapshot.lastRawTranscript} /> : null}
      {snapshot.lastNormalizationWarning ? <Item label="Normalization Warning" value={snapshot.lastNormalizationWarning} /> : null}
      <Item label="Realtime Factor" value={snapshot.realtimeFactor === null ? "-" : snapshot.realtimeFactor.toFixed(2)} /><Item label="Backend" value={`${snapshot.health?.model ?? "-"} / ${snapshot.health?.device ?? "-"} / ${snapshot.health?.computeType ?? "-"}`} />
      <Item label="Backend Health" value={snapshot.health ? `${snapshot.health.status} / ${snapshot.health.serviceStatus ?? "-"} / model loaded: ${String(snapshot.health.modelLoaded ?? false)}` : "unchecked"} />
      <Item label="Last Error" value={snapshot.lastError ? `${snapshot.lastError.code}: ${snapshot.lastError.message} (${snapshot.lastError.retryable ? "retryable" : "final"})` : "none"} />
    </dl>
    <div style={styles.controls}><button type="button" onClick={handleHealthButtonClick} style={styles.button}>Health Check</button><button type="button" onClick={onTranscribeLast} style={styles.button}>Transcribe Last Segment</button><button type="button" onClick={onCancel} style={styles.secondary}>Cancel Active Request</button><button type="button" onClick={onClear} style={styles.secondary}>Clear Transcript History</button></div>
    <label style={styles.toggle}><input type="checkbox" checked={snapshot.autoTranscribeEnabled} onChange={(event) => onAutoChange(event.target.checked)} /> Auto transcribe valid segments (Debug only)</label>
    <section style={styles.review} aria-label="Transcript review draft">
      <strong>Transcript Review Draft</strong>
      <p style={styles.reviewText}>{snapshot.lastTranscript ?? "No completed transcript yet."}</p>
      {snapshot.lastRawTranscript && snapshot.lastRawTranscript !== snapshot.lastTranscript ? <span style={styles.reviewStatus}>Raw: {snapshot.lastRawTranscript}</span> : null}
      <div style={styles.controls}>
        <button type="button" disabled={!snapshot.lastTranscript} onClick={onUseLatestTranscript} style={styles.button}>Use Transcript</button>
        {chatDraft.trim() ? <><button type="button" disabled={!snapshot.lastTranscript} onClick={onAppendLatestTranscript} style={styles.secondary}>Append Transcript</button><button type="button" disabled={!snapshot.lastTranscript} onClick={onReplaceLatestTranscript} style={styles.secondary}>Replace Draft</button></> : null}
      </div>
      <span style={styles.reviewStatus}>{transcriptReviewStatus ?? (chatDraft.trim() ? "Draft has text. Use Append or Replace to avoid overwriting it." : "Transcript use only fills the chat draft; it never submits.")}</span>
    </section>
    <div style={styles.history}>{snapshot.transcriptHistory.length ? snapshot.transcriptHistory.map((item) => <p key={item.requestId} style={styles.entry}><strong>{item.segmentId}</strong>: {item.text}</p>) : "No transcripts yet."}</div>
  </section>;
}
function Item({ label, value }: { label: string; value: string }) { return <div style={styles.item}><dt style={styles.label}>{label}</dt><dd style={styles.value}>{value}</dd></div>; }
const styles = { panel: { display: "grid", gap: 12, padding: 16, background: "#fff", border: "1px solid #d8deea", borderRadius: 8 }, title: { margin: 0, fontSize: 16, fontWeight: 700 }, setting: { display: "grid", gap: 5, fontSize: 13, color: "#364152" }, input: { minWidth: 0, padding: 8, border: "1px solid #c8d0df", borderRadius: 6, font: "inherit" }, grid: { margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }, item: { display: "grid", gap: 4, padding: 8, border: "1px solid #e0e5ef", borderRadius: 6, background: "#f8fafc" }, label: { fontSize: 12, color: "#5c667a" }, value: { margin: 0, overflowWrap: "anywhere", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }, controls: { display: "flex", flexWrap: "wrap", gap: 8 }, button: { padding: "8px 10px", border: "1px solid #1f5eff", background: "#1f5eff", color: "#fff", borderRadius: 6, cursor: "pointer" }, secondary: { padding: "8px 10px", border: "1px solid #c8d0df", background: "#fff", color: "#172033", borderRadius: 6, cursor: "pointer" }, toggle: { fontSize: 13, color: "#364152" }, review: { display: "grid", gap: 8, padding: 10, border: "1px solid #c8d0df", borderRadius: 6, background: "#f8fafc", fontSize: 13 }, reviewText: { margin: 0, overflowWrap: "anywhere" }, reviewStatus: { color: "#5c667a", fontSize: 12 }, history: { padding: 10, border: "1px solid #e0e5ef", borderRadius: 6, maxHeight: 180, overflowY: "auto", fontSize: 13 }, entry: { margin: "0 0 6px" } } satisfies Record<string, CSSProperties>;
