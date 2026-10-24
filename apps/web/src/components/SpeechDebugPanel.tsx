import type { CSSProperties } from "react";

type TtsProviderId = "mock-tts" | "mock-audio-tts" | "http-tts";
type SpeechPlaybackState = "idle" | "synthesizing" | "playing" | "finished" | "error";
type TalkingControlSource =
  | "none"
  | "minimum-talking-duration"
  | "speech-duration"
  | "manual-speech-duration"
  | "audio-playback"
  | "audio-analyser";
type FillerVoiceStatus = "idle" | "playing" | "failed";
type FillerMotionMode = "minimal" | "speaking";
type WaitingMotionMode = "none" | "subtleThinking" | "legacy";
type SpeakingFaceMode = "keepCurrent" | "smoothCenter" | "instantCenter";

type SpeechDebugState = {
  enabled: boolean;
  providerName: string;
  selectedTtsProvider: TtsProviderId;
  lastText: string;
  estimatedDurationMs: number | null;
  hasAudioBlob: boolean;
  hasAudioUrl: boolean;
  playbackState: SpeechPlaybackState;
  speechStartedAt: number | null;
  speechEndsAt: number | null;
  remainingSpeechMs: number | null;
  talkingControlSource: TalkingControlSource;
  httpEndpoint: string;
  httpProviderName: string;
  lastError: string | null;
  status: string;
  ttsQueueSegmentIndex: number | null;
  ttsQueueSegmentCount: number;
  ttsQueueStatus: string;
  isGeneratingNextSegment: boolean;
  ttsQueueEnabled: boolean;
  ttsMode: "fullResponse" | "sentenceQueue";
  fillerVoiceEnabled: boolean;
  fillerVoiceUrl: string;
  fillerVoiceStatus: FillerVoiceStatus;
  fillerMotionMode: FillerMotionMode;
  fillerVoiceWarning: string | null;
};

type SpeechDebugPanelProps = {
  speechDebugState: SpeechDebugState;
  selectedTtsProvider: TtsProviderId;
  manualTtsText: string;
  httpTtsEndpoint: string;
  httpTtsProviderName: string;
  fillerVoiceUrl: string;
  waitingMotionMode: WaitingMotionMode;
  speakingFaceMode: SpeakingFaceMode;
  onSelectedTtsProviderChange: (providerId: TtsProviderId) => void;
  onManualTtsTextChange: (text: string) => void;
  onHttpTtsEndpointChange: (endpoint: string) => void;
  onHttpTtsProviderNameChange: (providerName: string) => void;
  onFillerVoiceUrlChange: (url: string) => void;
  onManualTtsTest: () => void;
  onHttpTtsTest: () => void;
  onSpeechEnabledChange: (enabled: boolean) => void;
  onFillerVoiceEnabledChange: (enabled: boolean) => void;
  onFillerMotionModeChange: (mode: FillerMotionMode) => void;
  onWaitingMotionModeChange: (mode: WaitingMotionMode) => void;
  onSpeakingFaceModeChange: (mode: SpeakingFaceMode) => void;
  ttsQueueEnabled: boolean;
  onTtsQueueEnabledChange: (enabled: boolean) => void;
};

export function SpeechDebugPanel({
  speechDebugState,
  selectedTtsProvider,
  manualTtsText,
  httpTtsEndpoint,
  httpTtsProviderName,
  fillerVoiceUrl,
  waitingMotionMode,
  speakingFaceMode,
  onSelectedTtsProviderChange,
  onManualTtsTextChange,
  onHttpTtsEndpointChange,
  onHttpTtsProviderNameChange,
  onFillerVoiceUrlChange,
  onManualTtsTest,
  onHttpTtsTest,
  onSpeechEnabledChange,
  onFillerVoiceEnabledChange,
  onFillerMotionModeChange,
  onWaitingMotionModeChange,
  onSpeakingFaceModeChange,
  ttsQueueEnabled,
  onTtsQueueEnabledChange,
}: SpeechDebugPanelProps) {
  return (
    <section style={styles.debugPanel} aria-label="Speech debug panel">
      <h2 style={styles.debugTitle}>Speech Debug</h2>
      <dl style={styles.debugGrid}>
        <DebugItem label="TTS Provider" value={speechDebugState.providerName} />
        <DebugItem label="Selected TTS Provider" value={speechDebugState.selectedTtsProvider} />
        <DebugItem
          label="Auto Speech After Chat"
          value={speechDebugState.enabled ? "on" : "off"}
        />
        <DebugItem
          label="Estimated Duration"
          value={
            speechDebugState.estimatedDurationMs === null
              ? "none"
              : `${speechDebugState.estimatedDurationMs}ms`
          }
        />
        <DebugItem
          label="Last TTS Text"
          value={speechDebugState.lastText.trim().length === 0 ? "none" : speechDebugState.lastText}
        />
        <DebugItem label="speechPlaybackState" value={speechDebugState.playbackState} />
        <DebugItem
          label="speechStartedAt"
          value={
            speechDebugState.speechStartedAt === null
              ? "none"
              : String(speechDebugState.speechStartedAt)
          }
        />
        <DebugItem
          label="speechEndsAt"
          value={
            speechDebugState.speechEndsAt === null ? "none" : String(speechDebugState.speechEndsAt)
          }
        />
        <DebugItem
          label="remainingSpeechMs"
          value={
            speechDebugState.remainingSpeechMs === null
              ? "none"
              : `${Math.ceil(speechDebugState.remainingSpeechMs)}ms`
          }
        />
        <DebugItem label="hasAudioBlob" value={speechDebugState.hasAudioBlob ? "true" : "false"} />
        <DebugItem label="hasAudioUrl" value={speechDebugState.hasAudioUrl ? "true" : "false"} />
        <DebugItem label="HTTP Endpoint" value={speechDebugState.httpEndpoint} />
        <DebugItem label="HTTP Provider Name" value={speechDebugState.httpProviderName} />
        <DebugItem label="lastError" value={speechDebugState.lastError ?? "none"} />
        <DebugItem label="talkingControlSource" value={speechDebugState.talkingControlSource} />
        <DebugItem
          label="TTS Queue"
          value={
            speechDebugState.ttsQueueSegmentIndex === null
              ? "none"
              : `segment ${speechDebugState.ttsQueueSegmentIndex} / ${speechDebugState.ttsQueueSegmentCount}`
          }
        />
        <DebugItem label="TTS Queue Status" value={speechDebugState.ttsQueueStatus} />
        <DebugItem
          label="TTS Queue Enabled"
          value={speechDebugState.ttsQueueEnabled ? "on" : "off"}
        />
        <DebugItem
          label="TTS Mode"
          value={speechDebugState.ttsMode === "sentenceQueue" ? "Sentence queue" : "Full response"}
        />
        <DebugItem
          label="Generating Next Segment"
          value={speechDebugState.isGeneratingNextSegment ? "true" : "false"}
        />
        <DebugItem label="Status" value={speechDebugState.status} />
        <DebugItem
          label="Filler Voice"
          value={speechDebugState.fillerVoiceEnabled ? "enabled" : "disabled"}
        />
        <DebugItem label="Filler Status" value={speechDebugState.fillerVoiceStatus} />
        <DebugItem label="Waiting Motion Mode" value={formatWaitingMotionMode(waitingMotionMode)} />
        <DebugItem label="Filler Motion Mode" value={speechDebugState.fillerMotionMode} />
        <DebugItem label="Speaking Face Mode" value={formatSpeakingFaceMode(speakingFaceMode)} />
        <DebugItem label="Filler Voice URL" value={speechDebugState.fillerVoiceUrl} />
        <DebugItem
          label="Filler Warning"
          value={speechDebugState.fillerVoiceWarning ?? "none"}
        />
      </dl>
      <div style={styles.motionControls} aria-label="TTS provider controls">
        {(["mock-tts", "mock-audio-tts", "http-tts"] as const).map((providerId) => (
          <button
            key={providerId}
            type="button"
            onClick={() => onSelectedTtsProviderChange(providerId)}
            style={{
              ...styles.secondaryButton,
              ...(selectedTtsProvider === providerId ? styles.activeButton : undefined),
            }}
          >
            {providerId}
          </button>
        ))}
      </div>
      <div style={styles.vrmControls}>
        <input
          aria-label="Manual TTS Text"
          value={manualTtsText}
          onChange={(event) => onManualTtsTextChange(event.target.value)}
          style={styles.input}
        />
        <button
          type="button"
          onClick={onManualTtsTest}
          disabled={!manualTtsText.trim()}
          style={styles.button}
        >
          Test Mock TTS
        </button>
      </div>
      <div style={styles.vrmControls}>
        <input
          aria-label="HTTP TTS Endpoint"
          value={httpTtsEndpoint}
          onChange={(event) => onHttpTtsEndpointChange(event.target.value)}
          style={styles.input}
        />
        <button
          type="button"
          onClick={onHttpTtsTest}
          disabled={!httpTtsEndpoint.trim()}
          style={styles.button}
        >
          Test HTTP TTS
        </button>
      </div>
      <p style={styles.helperText}>
        Test HTTP TTS uses http://localhost:7861/tts by default. Manual TTS uses the current
        Speech Provider. Chat send runs TTS automatically when Auto Speech After Chat is on.
        TTS generating is not speaking; mouth movement starts only after audio playback begins.
      </p>
      <input
        aria-label="HTTP Provider Name"
        value={httpTtsProviderName}
        onChange={(event) => onHttpTtsProviderNameChange(event.target.value)}
        style={styles.input}
      />
      <div style={styles.motionControls} aria-label="Auto speech after chat controls">
        <button
          type="button"
          onClick={() => onSpeechEnabledChange(true)}
          style={{
            ...styles.secondaryButton,
            ...(speechDebugState.enabled ? styles.activeButton : undefined),
          }}
        >
          Auto Speech After Chat On
        </button>
        <button
          type="button"
          onClick={() => onSpeechEnabledChange(false)}
          style={{
            ...styles.secondaryButton,
            ...(!speechDebugState.enabled ? styles.activeButton : undefined),
          }}
        >
          Auto Speech After Chat Off
        </button>
      </div>
      <div style={styles.motionControls} aria-label="Filler voice controls">
        <button
          type="button"
          onClick={() => onFillerVoiceEnabledChange(true)}
          style={{
            ...styles.secondaryButton,
            ...(speechDebugState.fillerVoiceEnabled ? styles.activeButton : undefined),
          }}
        >
          Filler Voice On
        </button>
        <button
          type="button"
          onClick={() => onFillerVoiceEnabledChange(false)}
          style={{
            ...styles.secondaryButton,
            ...(!speechDebugState.fillerVoiceEnabled ? styles.activeButton : undefined),
          }}
        >
          Filler Voice Off
        </button>
      </div>
      <div style={styles.motionControls} aria-label="Waiting motion mode controls">
        {(["none", "subtleThinking", "legacy"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onWaitingMotionModeChange(mode)}
            style={{
              ...styles.secondaryButton,
              ...(waitingMotionMode === mode ? styles.activeButton : undefined),
            }}
          >
            {formatWaitingMotionMode(mode)}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="Filler motion mode controls">
        {(["minimal", "speaking"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onFillerMotionModeChange(mode)}
            style={{
              ...styles.secondaryButton,
              ...(speechDebugState.fillerMotionMode === mode ? styles.activeButton : undefined),
            }}
          >
            {mode === "minimal" ? "Minimal" : "Speaking"}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="Speaking face mode controls">
        {(["keepCurrent", "smoothCenter", "instantCenter"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onSpeakingFaceModeChange(mode)}
            style={{
              ...styles.secondaryButton,
              ...(speakingFaceMode === mode ? styles.activeButton : undefined),
            }}
          >
            {formatSpeakingFaceMode(mode)}
          </button>
        ))}
      </div>
      <div style={styles.motionControls} aria-label="TTS queue controls">
        <button
          type="button"
          onClick={() => onTtsQueueEnabledChange(true)}
          style={{
            ...styles.secondaryButton,
            ...(ttsQueueEnabled ? styles.activeButton : undefined),
          }}
        >
          TTS Queue On
        </button>
        <button
          type="button"
          onClick={() => onTtsQueueEnabledChange(false)}
          style={{
            ...styles.secondaryButton,
            ...(!ttsQueueEnabled ? styles.activeButton : undefined),
          }}
        >
          TTS Queue Off
        </button>
      </div>
      <input
        aria-label="Filler Voice URL"
        value={fillerVoiceUrl}
        onChange={(event) => onFillerVoiceUrlChange(event.target.value)}
        style={styles.input}
      />
      <pre style={styles.renderState}>
        {JSON.stringify(
          {
            providerName: speechDebugState.providerName,
            selectedTtsProvider: speechDebugState.selectedTtsProvider,
            lastTtsText: speechDebugState.lastText,
            estimatedDurationMs: speechDebugState.estimatedDurationMs,
            hasAudioBlob: speechDebugState.hasAudioBlob,
            hasAudioUrl: speechDebugState.hasAudioUrl,
            httpEndpoint: speechDebugState.httpEndpoint,
            httpProviderName: speechDebugState.httpProviderName,
            lastError: speechDebugState.lastError,
            speechEnabled: speechDebugState.enabled,
            speechPlaybackState: speechDebugState.playbackState,
            speechStartedAt: speechDebugState.speechStartedAt,
            speechEndsAt: speechDebugState.speechEndsAt,
            remainingSpeechMs: speechDebugState.remainingSpeechMs,
            talkingControlSource: speechDebugState.talkingControlSource,
            ttsQueueSegmentIndex: speechDebugState.ttsQueueSegmentIndex,
            ttsQueueSegmentCount: speechDebugState.ttsQueueSegmentCount,
            ttsQueueStatus: speechDebugState.ttsQueueStatus,
            isGeneratingNextSegment: speechDebugState.isGeneratingNextSegment,
            ttsQueueEnabled: speechDebugState.ttsQueueEnabled,
            ttsMode: speechDebugState.ttsMode,
            waitingMotionMode,
            fillerVoiceEnabled: speechDebugState.fillerVoiceEnabled,
            fillerMotionMode: speechDebugState.fillerMotionMode,
            speakingFaceMode,
            fillerVoiceUrl: speechDebugState.fillerVoiceUrl,
            fillerVoiceStatus: speechDebugState.fillerVoiceStatus,
            fillerVoiceWarning: speechDebugState.fillerVoiceWarning,
          },
          null,
          2,
        )}
      </pre>
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

function formatWaitingMotionMode(mode: WaitingMotionMode) {
  if (mode === "none") {
    return "None";
  }

  if (mode === "subtleThinking") {
    return "Subtle Thinking";
  }

  return "Legacy";
}

function formatSpeakingFaceMode(mode: SpeakingFaceMode) {
  if (mode === "keepCurrent") {
    return "Keep Current";
  }

  if (mode === "smoothCenter") {
    return "Smooth Center";
  }

  return "Instant Center";
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
  helperText: {
    margin: 0,
    color: "#5c667a",
    fontSize: 13,
    lineHeight: 1.5,
  },
} satisfies Record<string, CSSProperties>;
