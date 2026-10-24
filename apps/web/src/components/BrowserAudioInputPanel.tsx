import type { CSSProperties } from "react";
import type { AudioInputSnapshot } from "@runtime/audio-core";

type BrowserAudioInputPanelProps = {
  snapshot: AudioInputSnapshot;
  onRequestPermission: () => void;
  onStart: () => void;
  onStop: () => void;
  onMutedChange: (muted: boolean) => void;
  onRefreshDevices: () => void;
  onSelectDevice: (deviceId: string) => void;
};

export function BrowserAudioInputPanel({
  snapshot,
  onRequestPermission,
  onStart,
  onStop,
  onMutedChange,
  onRefreshDevices,
  onSelectDevice,
}: BrowserAudioInputPanelProps) {
  const selectedDevice = snapshot.devices.find((device) => device.deviceId === snapshot.selectedDeviceId);

  return (
    <section style={styles.panel} aria-label="Browser audio input debug panel">
      <h2 style={styles.title}>Browser Audio Input Debug</h2>
      <dl style={styles.grid}>
        <Item label="Supported" value={snapshot.supported ? "yes" : "no"} />
        <Item label="Secure Context" value={snapshot.secureContext ? "yes" : "no"} />
        <Item label="Permission" value={snapshot.permission} />
        <Item label="Input Status" value={snapshot.status} />
        <Item label="Muted" value={snapshot.muted ? "yes" : "no"} />
        <Item label="Selected Device" value={selectedDevice?.label ?? "default / none"} />
        <Item label="Raw RMS" value={snapshot.level.raw.toFixed(4)} />
        <Item label="Normalized Level" value={snapshot.level.normalized.toFixed(3)} />
        <Item label="Peak" value={snapshot.level.peak.toFixed(3)} />
        <Item label="Clipped" value={snapshot.level.clipped ? "yes" : "no"} />
        <Item label="Sample Rate" value={snapshot.sampleRate?.toString() ?? "unavailable"} />
        <Item label="Channels" value={snapshot.channelCount?.toString() ?? "unavailable"} />
        <Item label="Track State" value={snapshot.trackReadyState ?? "none"} />
        <Item label="Track Enabled" value={formatBoolean(snapshot.trackEnabled)} />
        <Item label="Active Tracks" value={snapshot.activeTrackCount.toString()} />
        <Item label="Audio Context" value={snapshot.audioContextState} />
        <Item label="Starts / Stops" value={`${snapshot.startCount} / ${snapshot.stopCount}`} />
        <Item label="Device Changes" value={snapshot.deviceChangeCount.toString()} />
        <Item label="Last Error" value={snapshot.error?.message ?? "none"} />
      </dl>

      <div style={styles.meterWrap} aria-label="Microphone input level">
        <span style={styles.label}>Input Level</span>
        <progress value={snapshot.level.normalized} max={1} style={styles.meter} />
      </div>

      <label style={styles.selectLabel}>
        Input device
        <select
          value={snapshot.selectedDeviceId ?? ""}
          onChange={(event) => onSelectDevice(event.target.value)}
          style={styles.select}
          disabled={!snapshot.supported || snapshot.devices.length === 0}
        >
          <option value="">Select microphone</option>
          {snapshot.devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}{device.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>

      <div style={styles.controls}>
        <button type="button" onClick={onRequestPermission} style={styles.button}>
          Request Permission
        </button>
        <button type="button" onClick={onRefreshDevices} style={styles.secondaryButton}>
          Refresh Devices
        </button>
        <button type="button" onClick={onStart} style={styles.secondaryButton}>
          Start Microphone
        </button>
        <button type="button" onClick={onStop} style={styles.secondaryButton}>
          Stop Microphone
        </button>
        <button
          type="button"
          onClick={() => onMutedChange(!snapshot.muted)}
          style={styles.secondaryButton}
        >
          {snapshot.muted ? "Unmute Input" : "Mute Input"}
        </button>
      </div>
    </section>
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

function formatBoolean(value: boolean | null) {
  return value === null ? "none" : value ? "yes" : "no";
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
  meterWrap: { display: "grid", gap: 6 },
  meter: { width: "100%", height: 16 },
  selectLabel: { display: "grid", gap: 6, color: "#5c667a", fontSize: 12 },
  select: {
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    background: "#ffffff",
    color: "#172033",
    font: "inherit",
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
} satisfies Record<string, CSSProperties>;
