import type { CSSProperties } from "react";

type BrainProviderId = "mock" | "ollama";
type ResponseDisplayMode = "immediate" | "syncWithSpeech";
type ResponseDisplayStatus = "idle" | "thinking" | "waitingForSpeech" | "speechReady" | "speaking";

type BrainCharacterMemoryPanelProps = {
  brainProviderId: BrainProviderId;
  ollamaEndpoint: string;
  ollamaModel: string;
  characterName: string;
  characterStyle: string;
  systemPrompt: string;
  llmReplyMaxLength: number;
  cleanedReplyLength: number;
  memorySummary: string;
  brainError: string | null;
  responseDisplayMode: ResponseDisplayMode;
  responseDisplayStatus: ResponseDisplayStatus;
  pendingAssistantText: string | null;
  memoryNoteInput: string;
  onBrainProviderChange: (providerId: BrainProviderId) => void;
  onResponseDisplayModeChange: (mode: ResponseDisplayMode) => void;
  onOllamaEndpointChange: (endpoint: string) => void;
  onOllamaModelChange: (model: string) => void;
  onCharacterNameChange: (name: string) => void;
  onLlmReplyMaxLengthChange: (value: string) => void;
  onCharacterStyleChange: (style: string) => void;
  onSystemPromptChange: (prompt: string) => void;
  onMemoryNoteInputChange: (value: string) => void;
  onAddMemoryNote: () => void;
  onClearSessionMemory: () => void;
};

export function BrainCharacterMemoryPanel({
  brainProviderId,
  ollamaEndpoint,
  ollamaModel,
  characterName,
  characterStyle,
  systemPrompt,
  llmReplyMaxLength,
  cleanedReplyLength,
  memorySummary,
  brainError,
  responseDisplayMode,
  responseDisplayStatus,
  pendingAssistantText,
  memoryNoteInput,
  onBrainProviderChange,
  onResponseDisplayModeChange,
  onOllamaEndpointChange,
  onOllamaModelChange,
  onCharacterNameChange,
  onLlmReplyMaxLengthChange,
  onCharacterStyleChange,
  onSystemPromptChange,
  onMemoryNoteInputChange,
  onAddMemoryNote,
  onClearSessionMemory,
}: BrainCharacterMemoryPanelProps) {
  return (
    <section style={styles.debugPanel} aria-label="Brain provider panel">
      <h2 style={styles.debugTitle}>Brain Provider</h2>
      <dl style={styles.debugGrid}>
        <DebugItem label="Brain Provider" value={brainProviderId} />
        <DebugItem label="Ollama Endpoint" value={ollamaEndpoint} />
        <DebugItem label="Ollama Model" value={ollamaModel} />
        <DebugItem label="Character Name" value={characterName} />
        <DebugItem label="Reply Max Length" value={`${llmReplyMaxLength}`} />
        <DebugItem label="Cleaned Reply Length" value={`${cleanedReplyLength}`} />
        <DebugItem label="Memory Summary" value={memorySummary} />
        <DebugItem label="Brain Error" value={brainError ?? "none"} />
        <DebugItem
          label="Response Display Mode"
          value={responseDisplayMode === "syncWithSpeech" ? "Sync With Speech" : "Immediate Text"}
        />
        <DebugItem label="Response Display Status" value={responseDisplayStatus} />
        <DebugItem
          label="Pending Assistant Text"
          value={pendingAssistantText === null ? "none" : "exists"}
        />
      </dl>
      <div style={styles.motionControls} aria-label="Brain provider controls">
        {(["mock", "ollama"] as const).map((providerId) => (
          <button
            key={providerId}
            type="button"
            onClick={() => onBrainProviderChange(providerId)}
            style={{
              ...styles.secondaryButton,
              ...(brainProviderId === providerId ? styles.activeButton : undefined),
            }}
          >
            {providerId}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="Response display mode controls">
        <button
          type="button"
          onClick={() => onResponseDisplayModeChange("immediate")}
          style={{
            ...styles.secondaryButton,
            ...(responseDisplayMode === "immediate" ? styles.activeButton : undefined),
          }}
        >
          Immediate Text
        </button>
        <button
          type="button"
          onClick={() => onResponseDisplayModeChange("syncWithSpeech")}
          style={{
            ...styles.secondaryButton,
            ...(responseDisplayMode === "syncWithSpeech" ? styles.activeButton : undefined),
          }}
        >
          Sync With Speech
        </button>
      </div>
      <div style={styles.vrmControls}>
        <input
          aria-label="Ollama Endpoint"
          value={ollamaEndpoint}
          onChange={(event) => onOllamaEndpointChange(event.target.value)}
          style={styles.input}
        />
        <input
          aria-label="Ollama Model"
          value={ollamaModel}
          onChange={(event) => onOllamaModelChange(event.target.value)}
          style={styles.input}
        />
      </div>
      <div style={styles.characterControls}>
        <input
          aria-label="Character Name"
          value={characterName}
          onChange={(event) => onCharacterNameChange(event.target.value)}
          style={styles.input}
        />
        <input
          aria-label="LLM Reply Max Length"
          type="number"
          min={20}
          max={300}
          value={llmReplyMaxLength}
          onChange={(event) => onLlmReplyMaxLengthChange(event.target.value)}
          style={styles.input}
        />
      </div>
      <input
        aria-label="Character Style"
        value={characterStyle}
        onChange={(event) => onCharacterStyleChange(event.target.value)}
        style={styles.input}
      />
      <textarea
        aria-label="System Prompt"
        value={systemPrompt}
        onChange={(event) => onSystemPromptChange(event.target.value)}
        style={styles.textarea}
      />
      <div style={styles.vrmControls}>
        <input
          aria-label="Memory Note"
          value={memoryNoteInput}
          onChange={(event) => onMemoryNoteInputChange(event.target.value)}
          placeholder="Add runtime memory note"
          style={styles.input}
        />
        <button type="button" onClick={onAddMemoryNote} style={styles.secondaryButton}>
          Add Memory Note
        </button>
        <button type="button" onClick={onClearSessionMemory} style={styles.secondaryButton}>
          Clear Session Memory
        </button>
      </div>
      <pre style={styles.renderState}>{memorySummary}</pre>
      <p style={styles.helperText}>
        Ollama uses {formatOllamaChatEndpoint(ollamaEndpoint)} with model{" "}
        {ollamaModel.trim() || "qwen3:8b"}.
      </p>
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

function formatOllamaChatEndpoint(endpoint: string) {
  const trimmedEndpoint = endpoint.trim() || "http://localhost:11434";
  const normalizedEndpoint = trimmedEndpoint.replace(/\/$/, "");

  if (normalizedEndpoint.endsWith("/api/chat")) {
    return normalizedEndpoint;
  }

  return `${normalizedEndpoint}/api/chat`;
}

const styles = {
  input: {
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    font: "inherit",
  },
  textarea: {
    minWidth: 0,
    minHeight: 180,
    padding: "10px 12px",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    font: "inherit",
    lineHeight: 1.5,
    resize: "vertical",
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
  characterControls: {
    display: "grid",
    gridTemplateColumns: "1fr minmax(140px, 180px)",
    gap: 10,
  },
  motionControls: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  },
  helperText: {
    margin: 0,
    color: "#5c667a",
    fontSize: 13,
    lineHeight: 1.5,
  },
} satisfies Record<string, CSSProperties>;
