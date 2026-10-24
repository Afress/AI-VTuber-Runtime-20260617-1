import type { CSSProperties, ReactNode } from "react";
import {
  getStageMicrophoneControl,
  type StageMicrophoneState,
} from "../stagePresentationState";

type StagePresentationShellProps = {
  backgroundImage: string | null;
  backgroundFit: "cover" | "contain";
  avatar: ReactNode;
  controlsExpanded: boolean;
  microphoneState: StageMicrophoneState;
  microphoneCaptureActive: boolean;
  settingsOpen: boolean;
  developerOpen: boolean;
  transcriptReviewOpen: boolean;
  onControlsExpandedChange: (expanded: boolean) => void;
  onMicrophoneClick: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  onDeveloperOpenChange: (open: boolean) => void;
  onTranscriptReviewOpenChange: (open: boolean) => void;
  onAvatarTypeChange: (avatarType: "vrm" | "live2d") => void;
  avatarType: "vrm" | "live2d";
  vadEnabled: boolean;
  onVadEnabledChange: (enabled: boolean) => void;
  settings: ReactNode;
  developer: ReactNode;
  transcriptReview: ReactNode;
  motionMenu: ReactNode;
  chat: ReactNode;
};

export function StagePresentationShell({
  backgroundImage,
  backgroundFit,
  avatar,
  controlsExpanded,
  microphoneState,
  microphoneCaptureActive,
  settingsOpen,
  developerOpen,
  transcriptReviewOpen,
  onControlsExpandedChange,
  onMicrophoneClick,
  onSettingsOpenChange,
  onDeveloperOpenChange,
  onTranscriptReviewOpenChange,
  onAvatarTypeChange,
  avatarType,
  vadEnabled,
  onVadEnabledChange,
  settings,
  developer,
  transcriptReview,
  motionMenu,
  chat,
}: StagePresentationShellProps) {
  const microphoneControl = getStageMicrophoneControl(
    microphoneState,
    microphoneCaptureActive,
    vadEnabled,
  );

  return (
    <main style={styles.root}>
      <div
        aria-hidden="true"
        style={{
          ...styles.background,
          ...(backgroundImage
            ? { backgroundImage: `url("${backgroundImage}")`, backgroundSize: backgroundFit }
            : undefined),
        }}
      />
      <section style={styles.avatarLayer} aria-label="Avatar stage">
        {avatar}
      </section>
      <section style={styles.chatOverlay} aria-label="Chat">
        {chat}
      </section>
      {motionMenu}
      <p
        aria-label="Model attribution"
        style={{
          position: "absolute",
          right: 12,
          bottom: 8,
          margin: 0,
          fontSize: 11,
          color: "#8a8f98",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        TTS: IndexTTS-2 (non-commercial) · LLM: Ollama qwen3:8b
      </p>
      <aside style={styles.controlsIsland} aria-label="Stage controls">
        <button
          type="button"
          aria-label={controlsExpanded ? "Collapse controls" : "Expand controls"}
          title={controlsExpanded ? "Collapse controls" : "Expand controls"}
          onClick={() => onControlsExpandedChange(!controlsExpanded)}
          style={styles.iconButton}
        >
          {controlsExpanded ? "−" : "+"}
        </button>
        {import.meta.env.PROD ? null : (
        <button
          type="button"
          aria-label={microphoneControl.ariaLabel}
          title={microphoneControl.title}
          onClick={onMicrophoneClick}
          aria-pressed={microphoneControl.pressed}
          disabled={microphoneControl.disabled}
          style={{
            ...styles.iconButton,
            ...(microphoneControl.active ? styles.active : undefined),
            ...(microphoneControl.disabled ? styles.disabled : undefined),
          }}
        >
          <span aria-hidden="true" style={styles.microphoneIcon}>
            {microphoneControl.icon === "stop" ? "■" : microphoneControl.icon === "processing" ? "◌" : "Mic"}
          </span>{" "}
          {microphoneControl.label}
        </button>
        )}
        <button type="button" aria-label="Open settings" title="Settings" onClick={() => onSettingsOpenChange(true)} style={styles.iconButton}>Settings</button>
        {controlsExpanded ? (
          <>
            <button type="button" aria-label="Open developer drawer" title="Developer" onClick={() => onDeveloperOpenChange(true)} style={styles.iconButton}>Dev</button>
            <button type="button" aria-label="Open transcript review" title="Transcript review" onClick={() => onTranscriptReviewOpenChange(true)} style={styles.iconButton}>Chat</button>
            <button type="button" aria-label="Toggle voice activity detection" title="Voice activity detection" aria-pressed={vadEnabled} onClick={() => onVadEnabledChange(!vadEnabled)} style={{ ...styles.iconButton, ...(vadEnabled ? styles.active : undefined) }}>VAD {vadEnabled ? "On" : "Off"}</button>
            <button type="button" aria-label="Use VRM avatar" title="Use VRM avatar" aria-pressed={avatarType === "vrm"} onClick={() => onAvatarTypeChange("vrm")} style={{ ...styles.iconButton, ...(avatarType === "vrm" ? styles.active : undefined) }}>VRM</button>
            <button type="button" aria-label="Use Live2D avatar" title="Use Live2D avatar" aria-pressed={avatarType === "live2d"} onClick={() => onAvatarTypeChange("live2d")} style={{ ...styles.iconButton, ...(avatarType === "live2d" ? styles.active : undefined) }}>2D</button>
          </>
        ) : null}
      </aside>
      {settingsOpen ? <Drawer title="Settings" onClose={() => onSettingsOpenChange(false)}>{settings}</Drawer> : null}
      {developerOpen ? <Drawer title="Developer" onClose={() => onDeveloperOpenChange(false)} wide>{developer}</Drawer> : null}
      {transcriptReviewOpen ? <Drawer title="Transcript Review" onClose={() => onTranscriptReviewOpenChange(false)}>{transcriptReview}</Drawer> : null}
    </main>
  );
}

function Drawer({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return <section role="dialog" aria-modal="true" aria-label={title} style={{ ...styles.drawer, ...(wide ? styles.wideDrawer : undefined) }}>
    <header style={styles.drawerHeader}><h2 style={styles.drawerTitle}>{title}</h2><button type="button" aria-label={`Close ${title}`} title="Close" onClick={onClose} style={styles.iconButton}>×</button></header>
    <div style={styles.drawerContent}>{children}</div>
  </section>;
}

const styles = {
  root: { position: "relative", minHeight: "100vh", overflow: "hidden", background: "#111827", color: "#f8fafc", fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  background: { position: "fixed", inset: 0, zIndex: 0, backgroundColor: "#172033", backgroundPosition: "center", backgroundRepeat: "no-repeat" },
  avatarLayer: { position: "relative", zIndex: 1, minHeight: "100vh", display: "grid", placeItems: "center", padding: "20px 20px 120px" },
  chatOverlay: { position: "fixed", zIndex: 3, left: 20, bottom: 20, width: "min(480px, calc(100vw - 150px))" },
  controlsIsland: { position: "fixed", zIndex: 4, right: 20, bottom: 20, display: "flex", alignItems: "center", gap: 8, maxWidth: "calc(100vw - 40px)", padding: 8, border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, background: "rgba(15, 23, 42, .86)", boxShadow: "0 12px 36px rgba(0,0,0,.3)", backdropFilter: "blur(10px)" },
  iconButton: { minHeight: 36, padding: "7px 10px", borderWidth: 1, borderStyle: "solid", borderColor: "rgba(255,255,255,.3)", borderRadius: 6, background: "rgba(255,255,255,.08)", color: "#f8fafc", font: "inherit", cursor: "pointer" },
  active: { borderColor: "#72f0c1", background: "rgba(34,197,94,.24)" },
  disabled: { cursor: "not-allowed", opacity: 0.62 },
  microphoneIcon: { display: "inline-block", minWidth: 18, textAlign: "center", fontWeight: 700 },
  drawer: { position: "fixed", zIndex: 6, top: 0, right: 0, width: "min(440px, 100vw)", height: "100vh", display: "grid", gridTemplateRows: "auto 1fr", background: "#fff", color: "#172033", boxShadow: "-16px 0 40px rgba(0,0,0,.35)" },
  wideDrawer: { width: "min(760px, 100vw)" },
  drawerHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, borderBottom: "1px solid #d8deea" },
  drawerTitle: { margin: 0, fontSize: 18, letterSpacing: 0 },
  drawerContent: { overflowY: "auto", padding: 16, display: "grid", alignContent: "start", gap: 16 },
} satisfies Record<string, CSSProperties>;
