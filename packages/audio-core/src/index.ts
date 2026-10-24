export type AudioPlaybackSource = {
  audioUrl?: string;
  audioBlob?: Blob;
};

export type AudioPlaybackState =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "finished"
  | "error";

export interface IAudioPlayer {
  play(source: AudioPlaybackSource): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  getState(): AudioPlaybackState;
}

export class BrowserAudioPlayer implements IAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private state: AudioPlaybackState = "idle";

  async play(source: AudioPlaybackSource): Promise<void> {
    this.stop();
    this.revokeObjectUrl();

    const sourceUrl = this.resolveSourceUrl(source);
    if (!sourceUrl) {
      this.state = "error";
      throw new Error("Audio source requires audioUrl or audioBlob.");
    }

    const audio = new Audio(sourceUrl);
    this.audio = audio;
    this.state = "loading";

    audio.addEventListener("ended", () => {
      this.state = "finished";
    });
    audio.addEventListener("error", () => {
      this.state = "error";
    });

    try {
      await audio.play();
      this.state = "playing";
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }

  stop(): void {
    if (!this.audio) {
      this.state = "idle";
      return;
    }

    this.audio.pause();
    this.audio.currentTime = 0;
    this.state = "idle";
  }

  pause(): void {
    if (!this.audio) {
      return;
    }

    this.audio.pause();
    this.state = "paused";
  }

  resume(): void {
    if (!this.audio) {
      return;
    }

    void this.audio
      .play()
      .then(() => {
        this.state = "playing";
      })
      .catch(() => {
        this.state = "error";
      });
  }

  getState(): AudioPlaybackState {
    return this.state;
  }

  getAudioElement(): HTMLAudioElement | null {
    return this.audio;
  }

  dispose(): void {
    this.stop();
    this.audio = null;
    this.revokeObjectUrl();
  }

  private resolveSourceUrl(source: AudioPlaybackSource): string | null {
    if (source.audioUrl) {
      return source.audioUrl;
    }

    if (source.audioBlob) {
      this.objectUrl = URL.createObjectURL(source.audioBlob);
      return this.objectUrl;
    }

    return null;
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}

export class BrowserAudioAnalyser {
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private source: MediaElementAudioSourceNode | null = null;

  connect(audio: HTMLAudioElement): void {
    this.dispose();

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextConstructor();
    this.source = this.audioContext.createMediaElementSource(audio);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.dataArray = new Uint8Array(this.analyser.fftSize);

    this.source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }

  getVolume(): number {
    if (!this.analyser || !this.dataArray) {
      return 0;
    }

    this.analyser.getByteTimeDomainData(this.dataArray);
    let sum = 0;

    for (const value of this.dataArray) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }

    return Math.min(1, Math.sqrt(sum / this.dataArray.length) * 2.5);
  }

  dispose(): void {
    this.source?.disconnect();
    this.analyser?.disconnect();
    void this.audioContext?.close();
    this.source = null;
    this.analyser = null;
    this.audioContext = null;
    this.dataArray = null;
  }
}

export type AudioInputPermissionState = "unknown" | "granted" | "denied" | "unsupported";
export type AudioInputStatus =
  | "idle"
  | "requesting-permission"
  | "active"
  | "muted"
  | "stopping"
  | "error";

export type AudioInputDevice = {
  deviceId: string;
  groupId?: string;
  label: string;
  isDefault: boolean;
};

export type AudioInputError = {
  code: string;
  message: string;
};

export type AudioInputLevel = {
  raw: number;
  normalized: number;
  peak: number;
  clipped: boolean;
  timestamp: number;
};

export type AudioInputSnapshot = {
  supported: boolean;
  secureContext: boolean;
  permission: AudioInputPermissionState;
  status: AudioInputStatus;
  selectedDeviceId: string | null;
  devices: AudioInputDevice[];
  muted: boolean;
  level: AudioInputLevel;
  sampleRate: number | null;
  channelCount: number | null;
  trackReadyState: MediaStreamTrackState | null;
  trackEnabled: boolean | null;
  activeTrackCount: number;
  inputSessionId: number;
  audioContextState: AudioContextState | "unavailable";
  startCount: number;
  stopCount: number;
  deviceChangeCount: number;
  error: AudioInputError | null;
};

export interface AudioInputProvider {
  requestPermission(): Promise<void>;
  enumerateDevices(): Promise<AudioInputDevice[]>;
  start(deviceId?: string): Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): void;
  selectDevice(deviceId: string): Promise<void>;
  getSnapshot(): AudioInputSnapshot;
  getInputAudioNode(): AudioNode | null;
  subscribe(listener: (snapshot: AudioInputSnapshot) => void): () => void;
  dispose(): Promise<void>;
}

export type VadState = "idle" | "calibrating" | "silence" | "speech" | "stopping" | "error";
export type SpeechEndReason =
  | "silence"
  | "maximum-duration"
  | "stopped"
  | "muted"
  | "device-lost"
  | "reset"
  | "disabled";

export type EnergyVadConfig = {
  calibrationDurationMs: number;
  minimumNoiseFloor: number;
  maximumNoiseFloor: number;
  thresholdMultiplier: number;
  thresholdOffset: number;
  speechStartDurationMs: number;
  speechEndSilenceMs: number;
  minimumSpeechDurationMs: number;
  maximumSpeechDurationMs?: number;
  smoothingFactor: number;
  noiseFloorAdaptationRate: number;
};

export type VadFrameResult = {
  timestamp: number;
  rawLevel: number;
  smoothedLevel: number;
  noiseFloor: number;
  threshold: number;
  score: number;
  speechDetected: boolean;
  clipped: boolean;
};

export type SpeechStartEvent = {
  timestamp: number;
  noiseFloor: number;
  threshold: number;
  initialScore: number;
};

export type SpeechEndEvent = {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  trailingSilenceMs: number;
  validSpeech: boolean;
  reason: SpeechEndReason;
};

export type VadSnapshot = {
  enabled: boolean;
  state: VadState;
  speechActive: boolean;
  calibrationProgress: number;
  speechStartedAt: number | null;
  speechDurationMs: number;
  speechCandidateDurationMs: number;
  silenceDurationMs: number;
  rawLevel: number;
  smoothedLevel: number;
  noiseFloor: number;
  threshold: number;
  score: number;
  clipped: boolean;
  speechStartCount: number;
  speechEndCount: number;
  lastSpeechDurationMs: number | null;
  lastEndReason: SpeechEndReason | null;
  processingFps: number;
  activeProcessingLoopCount: number;
  lastError: string | null;
};

export interface VoiceActivityDetector {
  start(): Promise<void> | void;
  stop(reason?: SpeechEndReason): Promise<void> | void;
  reset(): void;
  setEnabled(enabled: boolean): void;
  updateConfig(config: Partial<EnergyVadConfig>): void;
  getSnapshot(): VadSnapshot;
  subscribe(listener: (snapshot: VadSnapshot) => void): () => void;
  onSpeechStart(listener: (event: SpeechStartEvent) => void): () => void;
  onSpeechEnd(listener: (event: SpeechEndEvent) => void): () => void;
  dispose(): Promise<void> | void;
}

export type AudioSegmentEndReason =
  | "silence"
  | "maximum-duration"
  | "muted"
  | "stopped"
  | "device-lost"
  | "reset"
  | "disposed"
  | "disabled";

export type AudioPcmFrame = {
  timestamp: number;
  sampleRate: number;
  channelCount: 1;
  samples: Float32Array;
};

export type AudioSegmentCaptureConfig = {
  preRollMs: number;
  postRollMs: number;
  maximumSegmentDurationMs: number;
  maximumBufferedDurationMs: number;
  retainLastSegment: boolean;
};

export type AudioSegmentMetadata = {
  segmentId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  sampleRate: number;
  channelCount: 1;
  frameCount: number;
  preRollMs: number;
  postRollMs: number;
  endReason: AudioSegmentEndReason;
  vadValidSpeech: boolean;
  truncated: boolean;
};

export type CapturedAudioSegment = {
  metadata: AudioSegmentMetadata;
  pcm: Float32Array;
  wav: ArrayBuffer;
};

export type AudioSegmentCaptureState = "idle" | "buffering" | "capturing" | "finalizing" | "stopping" | "error";

export type AudioSegmentCaptureSnapshot = {
  enabled: boolean;
  state: AudioSegmentCaptureState;
  pcmSourceAttached: boolean;
  processingFrameCount: number;
  sampleRate: number | null;
  channelCount: number | null;
  preRollBufferedMs: number;
  activeSegmentId: string | null;
  activeSegmentDurationMs: number;
  activeSampleCount: number;
  segmentCount: number;
  lastSegmentDurationMs: number | null;
  lastSegmentByteSize: number | null;
  lastEndReason: AudioSegmentEndReason | null;
  lastValidSpeech: boolean | null;
  droppedFrameCount: number;
  activeCaptureLoopCount: number;
  lastError: string | null;
};

export interface AudioSegmentCapture {
  start(): Promise<void> | void;
  stop(reason?: AudioSegmentEndReason): Promise<void> | void;
  startManualSegment(startedAt?: number): boolean;
  stopManualSegment(endedAt?: number): boolean;
  reset(): void;
  setEnabled(enabled: boolean): void;
  getSnapshot(): AudioSegmentCaptureSnapshot;
  subscribe(listener: (snapshot: AudioSegmentCaptureSnapshot) => void): () => void;
  onSegment(listener: (segment: CapturedAudioSegment) => void): () => void;
  dispose(): Promise<void> | void;
}

export const DEFAULT_AUDIO_SEGMENT_CAPTURE_CONFIG: Readonly<AudioSegmentCaptureConfig> = {
  preRollMs: 400,
  postRollMs: 120,
  maximumSegmentDurationMs: 32_000,
  maximumBufferedDurationMs: 1_000,
  retainLastSegment: true,
};

export const DEFAULT_ENERGY_VAD_CONFIG: Readonly<EnergyVadConfig> = {
  calibrationDurationMs: 1200,
  minimumNoiseFloor: 0.005,
  maximumNoiseFloor: 0.12,
  thresholdMultiplier: 2.2,
  thresholdOffset: 0.01,
  speechStartDurationMs: 120,
  speechEndSilenceMs: 650,
  minimumSpeechDurationMs: 260,
  maximumSpeechDurationMs: 30_000,
  smoothingFactor: 0.65,
  noiseFloorAdaptationRate: 0.04,
};

type BrowserAudioInputDependencies = {
  mediaDevices?: Pick<
    MediaDevices,
    "getUserMedia" | "enumerateDevices" | "addEventListener" | "removeEventListener"
  >;
  AudioContextConstructor?: typeof AudioContext;
  secureContext?: boolean;
  now?: () => number;
};

type InputGraph = {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
};

export class BrowserAudioInput implements AudioInputProvider {
  private readonly mediaDevices?: BrowserAudioInputDependencies["mediaDevices"];
  private readonly AudioContextConstructor?: typeof AudioContext;
  private readonly secureContext: boolean;
  private readonly now: () => number;
  private readonly listeners = new Set<(snapshot: AudioInputSnapshot) => void>();
  private readonly handleDeviceChange = () => {
    if (this.disposed) {
      return;
    }

    this.deviceChangeCount += 1;
    void this.refreshAfterDeviceChange();
  };
  private audioContext: AudioContext | null = null;
  private graph: InputGraph | null = null;
  private stream: MediaStream | null = null;
  private selectedDeviceId: string | null = null;
  private devices: AudioInputDevice[] = [];
  private permission: AudioInputPermissionState;
  private status: AudioInputStatus = "idle";
  private muted = false;
  private level = createSilentInputLevel(0);
  private sampleRate: number | null = null;
  private channelCount: number | null = null;
  private error: AudioInputError | null = null;
  private startCount = 0;
  private stopCount = 0;
  private deviceChangeCount = 0;
  private generation = 0;
  private disposed = false;
  private levelInterval: number | null = null;
  private startPromise: Promise<void> | null = null;
  private pendingDeviceId: string | null = null;
  private activeTrackEndedHandler: (() => void) | null = null;
  private inputSessionId = 0;

  constructor(dependencies: BrowserAudioInputDependencies = {}) {
    this.mediaDevices = dependencies.mediaDevices ?? getBrowserMediaDevices();
    this.AudioContextConstructor = dependencies.AudioContextConstructor ?? getBrowserAudioContext();
    this.secureContext = dependencies.secureContext ?? getSecureContext();
    this.now = dependencies.now ?? Date.now;
    this.permission = this.isSupported() ? "unknown" : "unsupported";

    this.mediaDevices?.addEventListener?.("devicechange", this.handleDeviceChange);
  }

  async requestPermission(): Promise<void> {
    this.assertUsable();
    const requestGeneration = ++this.generation;
    this.status = "requesting-permission";
    this.error = null;
    this.emit();

    try {
      const temporaryStream = await this.mediaDevices!.getUserMedia({ audio: true });
      stopTracks(temporaryStream);
      if (this.isStale(requestGeneration)) {
        return;
      }
      this.permission = "granted";
      this.status = "idle";
      await this.refreshDevices();
    } catch (error) {
      if (this.isStale(requestGeneration)) {
        return;
      }
      this.applyError(error);
      this.emit();
      throw error;
    }
  }

  async enumerateDevices(): Promise<AudioInputDevice[]> {
    this.assertUsable();
    await this.refreshDevices();
    return this.devices.map((device) => ({ ...device }));
  }

  async start(deviceId?: string): Promise<void> {
    this.assertUsable();
    const requestedDeviceId = deviceId ?? this.selectedDeviceId;
    if (this.stream && this.isCurrentDevice(requestedDeviceId)) {
      return;
    }

    if (this.startPromise && this.pendingDeviceId === requestedDeviceId) {
      return this.startPromise;
    }

    const requestGeneration = ++this.generation;
    this.pendingDeviceId = requestedDeviceId;
    const request = this.startInternal(requestGeneration, requestedDeviceId);
    this.startPromise = request;

    try {
      await request;
    } finally {
      if (this.startPromise === request) {
        this.startPromise = null;
        this.pendingDeviceId = null;
      }
    }
  }

  async stop(): Promise<void> {
    if (this.disposed || (!this.stream && this.status === "idle")) {
      return;
    }

    this.generation += 1;
    this.status = "stopping";
    this.emit();
    this.releaseActiveSession();
    this.stopCount += 1;
    this.status = "idle";
    this.error = null;
    this.emit();
  }

  setMuted(muted: boolean): void {
    if (this.disposed) {
      return;
    }

    this.muted = muted;
    for (const track of this.stream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
    this.status = this.stream ? (muted ? "muted" : "active") : "idle";
    if (muted) {
      this.level = createSilentInputLevel(this.now());
    }
    this.emit();
  }

  async selectDevice(deviceId: string): Promise<void> {
    this.assertUsable();
    const deviceExists = this.devices.some((device) => device.deviceId === deviceId);
    if (!deviceExists) {
      const error = new Error("Selected microphone is no longer available.");
      this.applyError(error, "device-unavailable");
      this.emit();
      throw error;
    }
    await this.start(deviceId);
  }

  getSnapshot(): AudioInputSnapshot {
    const tracks = this.stream?.getAudioTracks() ?? [];
    const primaryTrack = tracks[0] ?? null;
    return {
      supported: this.isSupported(),
      secureContext: this.secureContext,
      permission: this.permission,
      status: this.status,
      selectedDeviceId: this.selectedDeviceId,
      devices: this.devices.map((device) => ({ ...device })),
      muted: this.muted,
      level: { ...this.level },
      sampleRate: this.sampleRate,
      channelCount: this.channelCount,
      trackReadyState: primaryTrack?.readyState ?? null,
      trackEnabled: primaryTrack?.enabled ?? null,
      activeTrackCount: tracks.filter((track) => track.readyState === "live").length,
      inputSessionId: this.inputSessionId,
      audioContextState: this.audioContext?.state ?? "unavailable",
      startCount: this.startCount,
      stopCount: this.stopCount,
      deviceChangeCount: this.deviceChangeCount,
      error: this.error ? { ...this.error } : null,
    };
  }

  getInputAudioNode(): AudioNode | null {
    return this.graph?.source ?? null;
  }

  subscribe(listener: (snapshot: AudioInputSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.generation += 1;
    this.mediaDevices?.removeEventListener?.("devicechange", this.handleDeviceChange);
    this.releaseActiveSession();
    this.listeners.clear();
    if (this.audioContext) {
      await this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
  }

  private async startInternal(requestGeneration: number, deviceId: string | null): Promise<void> {
    this.status = "requesting-permission";
    this.error = null;
    this.emit();

    let stream: MediaStream | null = null;
    try {
      stream = await this.mediaDevices!.getUserMedia({
        audio: createInputConstraints(deviceId),
      });
      if (this.isStale(requestGeneration)) {
        stopTracks(stream);
        return;
      }

      const nextGraph = await this.createGraph(stream);
      if (this.isStale(requestGeneration)) {
        nextGraph.source.disconnect();
        nextGraph.analyser.disconnect();
        stopTracks(stream);
        return;
      }

      this.releaseActiveSession();
      this.stream = stream;
      this.graph = nextGraph;
      this.inputSessionId += 1;
      this.selectedDeviceId = deviceId ?? stream.getAudioTracks()[0]?.getSettings().deviceId ?? null;
      this.sampleRate = this.audioContext?.sampleRate ?? null;
      this.channelCount = stream.getAudioTracks()[0]?.getSettings().channelCount ?? null;
      this.permission = "granted";
      this.muted = false;
      this.status = "active";
      this.startCount += 1;
      this.level = createSilentInputLevel(this.now());
      this.attachTrackEndedHandler(stream);
      this.startLevelUpdates();
      await this.refreshDevices();
    } catch (error) {
      if (stream && stream !== this.stream) {
        stopTracks(stream);
      }
      if (this.isStale(requestGeneration)) {
        return;
      }
      this.applyError(error);
      this.emit();
      throw error;
    }
  }

  private async createGraph(stream: MediaStream): Promise<InputGraph> {
    const context = await this.getOrCreateAudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const data = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    return { source, analyser, data };
  }

  private async getOrCreateAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new this.AudioContextConstructor!();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  private startLevelUpdates(): void {
    if (this.levelInterval !== null) {
      return;
    }
    this.levelInterval = window.setInterval(() => this.updateLevel(), 100);
  }

  private updateLevel(): void {
    if (this.disposed || !this.stream || !this.graph || this.muted) {
      return;
    }
    this.graph.analyser.getByteTimeDomainData(this.graph.data);
    this.level = calculateAudioInputLevel(this.graph.data, this.now());
    this.emit();
  }

  private releaseActiveSession(): void {
    if (this.levelInterval !== null) {
      window.clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    this.detachTrackEndedHandler();
    const hadActiveSession = this.stream !== null || this.graph !== null;
    this.graph?.source.disconnect();
    this.graph?.analyser.disconnect();
    this.graph = null;
    stopTracks(this.stream);
    this.stream = null;
    this.sampleRate = null;
    this.channelCount = null;
    this.level = createSilentInputLevel(this.now());
    if (hadActiveSession) {
      this.inputSessionId += 1;
    }
  }

  private attachTrackEndedHandler(stream: MediaStream): void {
    const track = stream.getAudioTracks()[0];
    if (!track) {
      return;
    }
    this.activeTrackEndedHandler = () => {
      if (this.disposed || track !== this.stream?.getAudioTracks()[0]) {
        return;
      }
      this.releaseActiveSession();
      this.applyError(new Error("The active microphone became unavailable."), "track-ended");
      this.emit();
      void this.refreshDevices();
    };
    track.addEventListener("ended", this.activeTrackEndedHandler);
  }

  private detachTrackEndedHandler(): void {
    const track = this.stream?.getAudioTracks()[0];
    if (track && this.activeTrackEndedHandler) {
      track.removeEventListener("ended", this.activeTrackEndedHandler);
    }
    this.activeTrackEndedHandler = null;
  }

  private async refreshAfterDeviceChange(): Promise<void> {
    try {
      await this.refreshDevices();
      if (
        this.stream &&
        this.selectedDeviceId &&
        !this.devices.some((device) => device.deviceId === this.selectedDeviceId)
      ) {
        // The selected device is gone. Release only this input session, then
        // let getUserMedia choose the browser's current default microphone.
        this.releaseActiveSession();
        this.selectedDeviceId = null;
        await this.start();
      }
    } catch (error) {
      if (!this.disposed) {
        this.applyError(error);
        this.emit();
      }
    }
  }

  private async refreshDevices(): Promise<void> {
    const devices = await this.mediaDevices!.enumerateDevices();
    if (this.disposed) {
      return;
    }
    let inputIndex = 0;
    this.devices = devices
      .filter((device) => device.kind === "audioinput")
      .map((device) => {
        inputIndex += 1;
        return {
          deviceId: device.deviceId,
          groupId: device.groupId || undefined,
          label: device.label || `Microphone ${inputIndex}`,
          isDefault: device.deviceId === "default" || inputIndex === 1,
        };
      });
    this.emit();
  }

  private isCurrentDevice(requestedDeviceId: string | null): boolean {
    return requestedDeviceId === null || requestedDeviceId === this.selectedDeviceId;
  }

  private isSupported(): boolean {
    return Boolean(this.secureContext && this.mediaDevices && this.AudioContextConstructor);
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("Audio input has been disposed.");
    }
    if (!this.secureContext) {
      const error = new Error("Microphone input requires a secure context (HTTPS or localhost).");
      this.permission = "unsupported";
      this.applyError(error, "insecure-context");
      this.emit();
      throw error;
    }
    if (!this.mediaDevices || !this.AudioContextConstructor) {
      const error = new Error("Browser microphone input is not supported in this environment.");
      this.permission = "unsupported";
      this.applyError(error, "unsupported");
      this.emit();
      throw error;
    }
  }

  private isStale(requestGeneration: number): boolean {
    return this.disposed || requestGeneration !== this.generation;
  }

  private applyError(error: unknown, overrideCode?: string): void {
    this.status = "error";
    this.level = createSilentInputLevel(this.now());
    const name = error instanceof DOMException ? error.name : "AudioInputError";
    this.permission = name === "NotAllowedError" ? "denied" : this.permission;
    this.error = {
      code: overrideCode ?? name,
      message: getAudioInputErrorMessage(error),
    };
  }

  private emit(): void {
    if (this.disposed) {
      return;
    }
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function calculateAudioInputLevel(
  data: Uint8Array<ArrayBuffer>,
  timestamp: number,
): AudioInputLevel {
  if (data.length === 0) {
    return createSilentInputLevel(timestamp);
  }
  let sum = 0;
  let peak = 0;
  for (const value of data) {
    const normalized = (value - 128) / 128;
    sum += normalized * normalized;
    peak = Math.max(peak, Math.abs(normalized));
  }
  const raw = Math.sqrt(sum / data.length);
  return {
    raw,
    normalized: Math.min(1, raw * 3),
    peak,
    clipped: peak >= 0.98,
    timestamp,
  };
}

function createInputConstraints(deviceId: string | null): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

function createSilentInputLevel(timestamp: number): AudioInputLevel {
  return { raw: 0, normalized: 0, peak: 0, clipped: false, timestamp };
}

function stopTracks(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

function getBrowserMediaDevices(): BrowserAudioInputDependencies["mediaDevices"] {
  return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
}

function getBrowserAudioContext(): typeof AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.AudioContext || window.webkitAudioContext;
}

function getSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

function getAudioInputErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Microphone permission was denied.";
  if (name === "NotFoundError") return "No microphone input device was found.";
  if (name === "NotReadableError") return "The microphone is unavailable or already in use.";
  if (name === "OverconstrainedError") return "The selected microphone does not support the requested constraints.";
  if (error instanceof Error) return error.message;
  return "Unable to start microphone input.";
}

/**
 * Pure, deterministic energy VAD. A caller supplies RMS frames; this class
 * deliberately has no microphone, browser, or React ownership.
 */
export class AdaptiveEnergyVad implements VoiceActivityDetector {
  private config: EnergyVadConfig;
  private readonly now: () => number;
  private readonly snapshotListeners = new Set<(snapshot: VadSnapshot) => void>();
  private readonly speechStartListeners = new Set<(event: SpeechStartEvent) => void>();
  private readonly speechEndListeners = new Set<(event: SpeechEndEvent) => void>();
  private enabled = false;
  private disposed = false;
  private state: VadState = "idle";
  private calibrationStartedAt: number | null = null;
  private calibrationSamples: number[] = [];
  private speechStartedAt: number | null = null;
  private speechCandidateStartedAt: number | null = null;
  private silenceStartedAt: number | null = null;
  private rawLevel = 0;
  private smoothedLevel = 0;
  private noiseFloor: number;
  private threshold: number;
  private score = 0;
  private clipped = false;
  private speechStartCount = 0;
  private speechEndCount = 0;
  private lastSpeechDurationMs: number | null = null;
  private lastEndReason: SpeechEndReason | null = null;
  private lastError: string | null = null;

  constructor(config: Partial<EnergyVadConfig> = {}, now: () => number = Date.now) {
    this.config = normalizeEnergyVadConfig({ ...DEFAULT_ENERGY_VAD_CONFIG, ...config });
    this.now = now;
    this.noiseFloor = this.config.minimumNoiseFloor;
    this.threshold = this.calculateThreshold();
  }

  start(): void {
    if (this.disposed || this.enabled) {
      return;
    }
    this.enabled = true;
    this.beginCalibration(this.now());
  }

  stop(reason: SpeechEndReason = "stopped"): void {
    if (this.disposed) {
      return;
    }
    this.state = "stopping";
    this.emit();
    this.endSpeechIfActive(this.now(), reason);
    this.enabled = false;
    this.resetFrameState();
    this.state = "idle";
    this.emit();
  }

  reset(): void {
    if (this.disposed) {
      return;
    }
    this.endSpeechIfActive(this.now(), "reset");
    this.resetFrameState();
    if (this.enabled) {
      this.beginCalibration(this.now());
    } else {
      this.state = "idle";
      this.emit();
    }
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.start();
    } else {
      this.stop("disabled");
    }
  }

  updateConfig(config: Partial<EnergyVadConfig>): void {
    if (this.disposed) {
      return;
    }
    this.config = normalizeEnergyVadConfig({ ...this.config, ...config });
    if (this.enabled) {
      this.reset();
    } else {
      this.noiseFloor = this.config.minimumNoiseFloor;
      this.threshold = this.calculateThreshold();
      this.emit();
    }
  }

  processFrame(rawLevel: number, timestamp = this.now(), clipped = false): VadFrameResult {
    if (this.disposed || !this.enabled || this.state === "idle" || this.state === "stopping") {
      return this.getFrameResult(timestamp);
    }

    const safeRawLevel = clampVadLevel(rawLevel);
    this.rawLevel = safeRawLevel;
    this.clipped = clipped;
    this.smoothedLevel =
      this.smoothedLevel * this.config.smoothingFactor +
      safeRawLevel * (1 - this.config.smoothingFactor);

    if (this.state === "calibrating") {
      this.collectCalibrationSample(this.smoothedLevel);
      const elapsed = Math.max(0, timestamp - (this.calibrationStartedAt ?? timestamp));
      if (elapsed >= this.config.calibrationDurationMs) {
        this.completeCalibration(timestamp);
      }
      this.emit();
      return this.getFrameResult(timestamp);
    }

    this.threshold = this.calculateThreshold();
    this.score = clampVadLevel(
      (this.smoothedLevel - this.threshold) / Math.max(this.threshold, 0.000_001),
    );
    const aboveThreshold = this.smoothedLevel >= this.threshold;

    if (this.state === "silence") {
      this.processSilenceFrame(timestamp, aboveThreshold);
    } else if (this.state === "speech") {
      this.processSpeechFrame(timestamp, aboveThreshold);
    }

    this.emit();
    return this.getFrameResult(timestamp);
  }

  getSnapshot(): VadSnapshot {
    const now = this.now();
    return {
      enabled: this.enabled,
      state: this.state,
      speechActive: this.state === "speech",
      calibrationProgress: this.getCalibrationProgress(now),
      speechStartedAt: this.speechStartedAt,
      speechDurationMs: this.speechStartedAt === null ? 0 : Math.max(0, now - this.speechStartedAt),
      speechCandidateDurationMs:
        this.speechCandidateStartedAt === null ? 0 : Math.max(0, now - this.speechCandidateStartedAt),
      silenceDurationMs: this.silenceStartedAt === null ? 0 : Math.max(0, now - this.silenceStartedAt),
      rawLevel: this.rawLevel,
      smoothedLevel: this.smoothedLevel,
      noiseFloor: this.noiseFloor,
      threshold: this.threshold,
      score: this.score,
      clipped: this.clipped,
      speechStartCount: this.speechStartCount,
      speechEndCount: this.speechEndCount,
      lastSpeechDurationMs: this.lastSpeechDurationMs,
      lastEndReason: this.lastEndReason,
      processingFps: 0,
      activeProcessingLoopCount: 0,
      lastError: this.lastError,
    };
  }

  subscribe(listener: (snapshot: VadSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    listener(this.getSnapshot());
    return () => this.snapshotListeners.delete(listener);
  }

  onSpeechStart(listener: (event: SpeechStartEvent) => void): () => void {
    this.speechStartListeners.add(listener);
    return () => this.speechStartListeners.delete(listener);
  }

  onSpeechEnd(listener: (event: SpeechEndEvent) => void): () => void {
    this.speechEndListeners.add(listener);
    return () => this.speechEndListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.stop("stopped");
    this.disposed = true;
    this.snapshotListeners.clear();
    this.speechStartListeners.clear();
    this.speechEndListeners.clear();
  }

  private beginCalibration(timestamp: number): void {
    this.resetFrameState();
    this.calibrationStartedAt = timestamp;
    this.state = "calibrating";
    this.emit();
  }

  private collectCalibrationSample(value: number): void {
    // A transient loud sound must not teach the detector that speech is noise.
    if (value > this.config.maximumNoiseFloor * 2) {
      return;
    }
    if (this.calibrationSamples.length < 256) {
      this.calibrationSamples.push(value);
    }
  }

  private completeCalibration(timestamp: number): void {
    const sorted = [...this.calibrationSamples].sort((left, right) => left - right);
    const percentileIndex = Math.floor(Math.max(0, sorted.length - 1) * 0.7);
    const estimatedNoise = sorted[percentileIndex] ?? this.config.minimumNoiseFloor;
    this.noiseFloor = clampNoiseFloor(estimatedNoise, this.config);
    this.threshold = this.calculateThreshold();
    this.calibrationStartedAt = null;
    this.calibrationSamples = [];
    this.state = "silence";
    this.silenceStartedAt = timestamp;
  }

  private processSilenceFrame(timestamp: number, aboveThreshold: boolean): void {
    if (!aboveThreshold) {
      this.adaptNoiseFloor(this.smoothedLevel);
      this.speechCandidateStartedAt = null;
      this.silenceStartedAt ??= timestamp;
      return;
    }

    this.silenceStartedAt = null;
    this.speechCandidateStartedAt ??= timestamp;
    if (timestamp - this.speechCandidateStartedAt >= this.config.speechStartDurationMs) {
      this.speechStartedAt = this.speechCandidateStartedAt;
      this.speechCandidateStartedAt = null;
      this.silenceStartedAt = null;
      this.state = "speech";
      this.speechStartCount += 1;
      const event: SpeechStartEvent = {
        timestamp: this.speechStartedAt,
        noiseFloor: this.noiseFloor,
        threshold: this.threshold,
        initialScore: this.score,
      };
      for (const listener of this.speechStartListeners) {
        listener(event);
      }
    }
  }

  private processSpeechFrame(timestamp: number, aboveThreshold: boolean): void {
    if (this.speechStartedAt !== null && this.config.maximumSpeechDurationMs !== undefined) {
      if (timestamp - this.speechStartedAt >= this.config.maximumSpeechDurationMs) {
        this.endSpeechIfActive(timestamp, "maximum-duration");
        return;
      }
    }

    if (aboveThreshold) {
      this.silenceStartedAt = null;
      return;
    }

    this.silenceStartedAt ??= timestamp;
    if (timestamp - this.silenceStartedAt >= this.config.speechEndSilenceMs) {
      this.endSpeechIfActive(timestamp, "silence");
    }
  }

  private endSpeechIfActive(timestamp: number, reason: SpeechEndReason): void {
    if (this.speechStartedAt === null) {
      return;
    }
    const startedAt = this.speechStartedAt;
    const durationMs = Math.max(0, timestamp - startedAt);
    const trailingSilenceMs = this.silenceStartedAt === null ? 0 : Math.max(0, timestamp - this.silenceStartedAt);
    this.speechStartedAt = null;
    this.speechCandidateStartedAt = null;
    this.lastSpeechDurationMs = durationMs;
    this.lastEndReason = reason;
    this.speechEndCount += 1;
    this.state = this.enabled ? "silence" : "idle";
    this.silenceStartedAt = timestamp;
    const event: SpeechEndEvent = {
      startedAt,
      endedAt: timestamp,
      durationMs,
      trailingSilenceMs,
      validSpeech: durationMs >= this.config.minimumSpeechDurationMs,
      reason,
    };
    for (const listener of this.speechEndListeners) {
      listener(event);
    }
  }

  private adaptNoiseFloor(value: number): void {
    const rate = this.config.noiseFloorAdaptationRate;
    this.noiseFloor = clampNoiseFloor(this.noiseFloor * (1 - rate) + value * rate, this.config);
    this.threshold = this.calculateThreshold();
  }

  private calculateThreshold(): number {
    return Math.max(
      this.config.minimumNoiseFloor * this.config.thresholdMultiplier + this.config.thresholdOffset,
      this.noiseFloor * this.config.thresholdMultiplier + this.config.thresholdOffset,
    );
  }

  private resetFrameState(): void {
    this.calibrationStartedAt = null;
    this.calibrationSamples = [];
    this.speechStartedAt = null;
    this.speechCandidateStartedAt = null;
    this.silenceStartedAt = null;
    this.rawLevel = 0;
    this.smoothedLevel = 0;
    this.noiseFloor = this.config.minimumNoiseFloor;
    this.threshold = this.calculateThreshold();
    this.score = 0;
    this.clipped = false;
    this.lastError = null;
  }

  private getCalibrationProgress(timestamp: number): number {
    if (this.state !== "calibrating" || this.calibrationStartedAt === null) {
      return this.state === "silence" || this.state === "speech" ? 1 : 0;
    }
    return clampVadLevel((timestamp - this.calibrationStartedAt) / this.config.calibrationDurationMs);
  }

  private getFrameResult(timestamp: number): VadFrameResult {
    return {
      timestamp,
      rawLevel: this.rawLevel,
      smoothedLevel: this.smoothedLevel,
      noiseFloor: this.noiseFloor,
      threshold: this.threshold,
      score: this.score,
      speechDetected: this.state === "speech",
      clipped: this.clipped,
    };
  }

  private emit(): void {
    if (this.disposed) {
      return;
    }
    const snapshot = this.getSnapshot();
    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }
  }
}

export type BrowserVoiceActivityDetectorOptions = {
  config?: Partial<EnergyVadConfig>;
  processingIntervalMs?: number;
  now?: () => number;
};

/**
 * Browser adapter for AdaptiveEnergyVad. It only consumes an existing input
 * AudioNode; BrowserAudioInput remains the sole owner of microphone streams.
 */
export class BrowserVoiceActivityDetector implements VoiceActivityDetector {
  private readonly detector: AdaptiveEnergyVad;
  private readonly processingIntervalMs: number;
  private readonly now: () => number;
  private readonly listeners = new Set<(snapshot: VadSnapshot) => void>();
  private readonly speechStartListeners = new Set<(event: SpeechStartEvent) => void>();
  private readonly speechEndListeners = new Set<(event: SpeechEndEvent) => void>();
  private source: AudioNode | null = null;
  private sourceSessionId: number | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private interval: number | null = null;
  private enabled = false;
  private muted = false;
  private disposed = false;
  private processedFrames = 0;
  private processingStartedAt: number | null = null;
  private lastError: string | null = null;
  private lastSnapshotEmitAt = 0;

  constructor(options: BrowserVoiceActivityDetectorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.processingIntervalMs = Math.max(10, options.processingIntervalMs ?? 20);
    this.detector = new AdaptiveEnergyVad(options.config, this.now);
    this.detector.subscribe(() => this.emit());
    this.detector.onSpeechStart((event) => {
      for (const listener of this.speechStartListeners) listener(event);
    });
    this.detector.onSpeechEnd((event) => {
      for (const listener of this.speechEndListeners) listener(event);
    });
  }

  setInputSource(
    source: AudioNode | null,
    sessionId: number | null,
    endReason: SpeechEndReason = "device-lost",
  ): void {
    if (this.disposed || (this.source === source && this.sourceSessionId === sessionId)) {
      return;
    }
    const hadSource = this.source !== null;
    this.stopProcessing();
    this.disconnectSource();
    if (hadSource) {
      this.detector.stop(endReason);
    }
    this.source = source;
    this.sourceSessionId = sessionId;
    this.lastError = null;
    if (source) {
      try {
        const context = source.context;
        this.analyser = context.createAnalyser();
        this.analyser.fftSize = 512;
        this.data = new Uint8Array(this.analyser.fftSize);
        source.connect(this.analyser);
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : "Unable to attach VAD analyser.";
        this.disconnectSource();
      }
    }
    if (this.enabled && this.source && !this.muted && !this.lastError) {
      this.detector.start();
      this.startProcessing();
    }
    this.emit(true);
  }

  setInputMuted(muted: boolean): void {
    if (this.disposed || this.muted === muted) {
      return;
    }
    this.muted = muted;
    if (muted) {
      this.stopProcessing();
      this.detector.stop("muted");
    } else if (this.enabled && this.source && !this.lastError) {
      this.detector.start();
      this.startProcessing();
    }
    this.emit(true);
  }

  start(): void {
    if (this.disposed || this.enabled) {
      return;
    }
    this.enabled = true;
    if (this.source && !this.muted && !this.lastError) {
      this.detector.start();
      this.startProcessing();
    }
    this.emit(true);
  }

  stop(reason: SpeechEndReason = "stopped"): void {
    if (this.disposed) {
      return;
    }
    this.stopProcessing();
    this.detector.stop(reason);
    this.enabled = false;
    this.emit(true);
  }

  reset(): void {
    if (this.disposed) {
      return;
    }
    this.stopProcessing();
    this.detector.reset();
    if (this.enabled && this.source && !this.muted && !this.lastError) {
      this.startProcessing();
    }
    this.emit(true);
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.start();
    } else {
      this.stop("disabled");
    }
  }

  updateConfig(config: Partial<EnergyVadConfig>): void {
    if (this.disposed) {
      return;
    }
    this.stopProcessing();
    this.detector.updateConfig(config);
    if (this.enabled && this.source && !this.muted && !this.lastError) {
      this.startProcessing();
    }
    this.emit(true);
  }

  getSnapshot(): VadSnapshot {
    const snapshot = this.detector.getSnapshot();
    return {
      ...snapshot,
      enabled: this.enabled,
      processingFps: this.getProcessingFps(),
      activeProcessingLoopCount: this.interval === null ? 0 : 1,
      lastError: this.lastError ?? snapshot.lastError,
    };
  }

  subscribe(listener: (snapshot: VadSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  onSpeechStart(listener: (event: SpeechStartEvent) => void): () => void {
    this.speechStartListeners.add(listener);
    return () => this.speechStartListeners.delete(listener);
  }

  onSpeechEnd(listener: (event: SpeechEndEvent) => void): () => void {
    this.speechEndListeners.add(listener);
    return () => this.speechEndListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.stopProcessing();
    this.disconnectSource();
    this.detector.dispose();
    this.disposed = true;
    this.listeners.clear();
    this.speechStartListeners.clear();
    this.speechEndListeners.clear();
  }

  private startProcessing(): void {
    if (this.interval !== null || !this.analyser || !this.data) {
      return;
    }
    this.processedFrames = 0;
    this.processingStartedAt = this.now();
    this.interval = window.setInterval(() => this.processFrame(), this.processingIntervalMs);
  }

  private stopProcessing(): void {
    if (this.interval !== null) {
      window.clearInterval(this.interval);
      this.interval = null;
    }
    this.processingStartedAt = null;
    this.processedFrames = 0;
  }

  private processFrame(): void {
    if (this.disposed || !this.enabled || this.muted || !this.analyser || !this.data) {
      return;
    }
    try {
      this.analyser.getByteTimeDomainData(this.data);
      const level = calculateAudioInputLevel(this.data, this.now());
      this.detector.processFrame(level.raw, level.timestamp, level.clipped);
      this.processedFrames += 1;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "VAD processing failed.";
      this.stopProcessing();
      this.detector.stop("stopped");
      this.emit(true);
    }
  }

  private disconnectSource(): void {
    try {
      if (this.source && this.analyser) {
        this.source.disconnect(this.analyser);
      }
    } catch {
      // The source may already be disconnected by BrowserAudioInput teardown.
    }
    this.analyser?.disconnect();
    this.analyser = null;
    this.data = null;
    this.source = null;
    this.sourceSessionId = null;
  }

  private getProcessingFps(): number {
    if (this.processingStartedAt === null) {
      return 0;
    }
    const elapsedMs = Math.max(1, this.now() - this.processingStartedAt);
    return Math.round((this.processedFrames / elapsedMs) * 1000);
  }

  private emit(force = false): void {
    if (this.disposed) {
      return;
    }
    const now = this.now();
    if (!force && now - this.lastSnapshotEmitAt < 100) {
      return;
    }
    this.lastSnapshotEmitAt = now;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function clampVadLevel(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clampNoiseFloor(value: number, config: EnergyVadConfig): number {
  return Math.min(config.maximumNoiseFloor, Math.max(config.minimumNoiseFloor, clampVadLevel(value)));
}

function normalizeEnergyVadConfig(config: EnergyVadConfig): EnergyVadConfig {
  const minimumNoiseFloor = Math.max(0.000_001, clampVadLevel(config.minimumNoiseFloor));
  const maximumNoiseFloor = Math.max(minimumNoiseFloor, clampVadLevel(config.maximumNoiseFloor));
  return {
    ...config,
    calibrationDurationMs: Math.max(100, config.calibrationDurationMs),
    minimumNoiseFloor,
    maximumNoiseFloor,
    thresholdMultiplier: Math.max(0.1, config.thresholdMultiplier),
    thresholdOffset: Math.max(0, config.thresholdOffset),
    speechStartDurationMs: Math.max(0, config.speechStartDurationMs),
    speechEndSilenceMs: Math.max(0, config.speechEndSilenceMs),
    minimumSpeechDurationMs: Math.max(0, config.minimumSpeechDurationMs),
    maximumSpeechDurationMs:
      config.maximumSpeechDurationMs === undefined
        ? undefined
        : Math.max(config.minimumSpeechDurationMs, config.maximumSpeechDurationMs),
    smoothingFactor: clampVadLevel(config.smoothingFactor),
    noiseFloorAdaptationRate: clampVadLevel(config.noiseFloorAdaptationRate),
  };
}

/**
 * Deterministic PCM segment assembler. It owns frame/segment buffers only;
 * microphone and VAD lifecycles remain external.
 */
export class AdaptiveAudioSegmentCapture implements AudioSegmentCapture {
  private readonly config: AudioSegmentCaptureConfig;
  private readonly now: () => number;
  private readonly snapshotListeners = new Set<(snapshot: AudioSegmentCaptureSnapshot) => void>();
  private readonly segmentListeners = new Set<(segment: CapturedAudioSegment) => void>();
  private enabled = false;
  private disposed = false;
  private state: AudioSegmentCaptureState = "idle";
  private preRollFrames: AudioPcmFrame[] = [];
  private activeFrames: AudioPcmFrame[] = [];
  private activeSegmentId: string | null = null;
  private activePreRollSamples = 0;
  private requestedEnd: SpeechEndEvent | null = null;
  private finalizationDeadline: number | null = null;
  private manualSegmentStartedAt: number | null = null;
  private currentSampleRate: number | null = null;
  private processingFrameCount = 0;
  private segmentCount = 0;
  private lastSegment: CapturedAudioSegment | null = null;
  private lastSegmentDurationMs: number | null = null;
  private lastSegmentByteSize: number | null = null;
  private lastEndReason: AudioSegmentEndReason | null = null;
  private lastValidSpeech: boolean | null = null;
  private droppedFrameCount = 0;
  private lastError: string | null = null;
  private sequence = 0;
  private lastInputTimestamp = Number.NEGATIVE_INFINITY;

  constructor(config: Partial<AudioSegmentCaptureConfig> = {}, now: () => number = Date.now) {
    this.config = normalizeSegmentCaptureConfig({ ...DEFAULT_AUDIO_SEGMENT_CAPTURE_CONFIG, ...config });
    this.now = now;
  }

  start(): void {
    if (this.disposed || this.enabled) {
      return;
    }
    this.enabled = true;
    this.beginBuffering();
  }

  stop(reason: AudioSegmentEndReason = "stopped"): void {
    if (this.disposed) {
      return;
    }
    this.state = "stopping";
    this.emit();
    this.finishActive(reason, this.requestedEnd?.validSpeech ?? false);
    this.enabled = false;
    this.clearBuffers();
    this.state = "idle";
    this.emit();
  }

  reset(): void {
    if (this.disposed) {
      return;
    }
    this.finishActive("reset", this.requestedEnd?.validSpeech ?? false);
    this.clearBuffers();
    if (this.enabled) {
      this.beginBuffering();
    } else {
      this.state = "idle";
      this.emit();
    }
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.start();
    } else {
      this.stop("disabled");
    }
  }

  startManualSegment(startedAt = this.now()): boolean {
    if (this.disposed || !this.enabled || this.state !== "buffering") {
      return false;
    }
    this.handleSpeechStart({
      timestamp: startedAt,
      noiseFloor: 0,
      threshold: 0,
      initialScore: 1,
    });
    if (this.getSnapshot().state !== "capturing") {
      return false;
    }
    this.manualSegmentStartedAt = startedAt;
    return true;
  }

  stopManualSegment(endedAt = this.now()): boolean {
    if (
      this.disposed ||
      this.manualSegmentStartedAt === null ||
      (this.state !== "capturing" && this.state !== "finalizing")
    ) {
      return false;
    }
    const startedAt = this.manualSegmentStartedAt;
    const segmentCount = this.segmentCount;
    this.manualSegmentStartedAt = null;
    this.handleSpeechEnd({
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      trailingSilenceMs: 0,
      validSpeech: true,
      reason: "stopped",
    });
    return this.segmentCount > segmentCount;
  }

  pushFrame(frame: AudioPcmFrame): void {
    if (this.disposed || !this.enabled || this.state === "idle" || this.state === "stopping") {
      return;
    }
    if (!isValidPcmFrame(frame) || frame.timestamp < this.lastInputTimestamp) {
      this.droppedFrameCount += 1;
      this.lastError = "Dropped invalid or non-monotonic PCM frame.";
      this.emit();
      return;
    }
    if (this.currentSampleRate !== null && this.currentSampleRate !== frame.sampleRate) {
      this.finishActive("device-lost", this.requestedEnd?.validSpeech ?? false);
      this.clearBuffers();
      this.currentSampleRate = frame.sampleRate;
    }
    this.currentSampleRate ??= frame.sampleRate;
    this.lastInputTimestamp = frame.timestamp;
    this.processingFrameCount += 1;

    if (this.state === "buffering") {
      this.pushPreRollFrame(frame);
    } else if (this.state === "capturing" || this.state === "finalizing") {
      this.activeFrames.push(frame);
      if (this.getActiveDurationMs() >= this.config.maximumSegmentDurationMs) {
        this.finishActive("maximum-duration", true, true);
      } else if (this.state === "finalizing" && this.finalizationDeadline !== null) {
        if (frame.timestamp >= this.finalizationDeadline) {
          this.finishActive(this.mapVadReason(this.requestedEnd?.reason ?? "silence"), this.requestedEnd?.validSpeech ?? false);
        }
      }
    }
    this.emit();
  }

  handleSpeechStart(event: SpeechStartEvent): void {
    if (this.disposed || !this.enabled || this.state !== "buffering") {
      return;
    }
    const cutoff = event.timestamp - this.config.preRollMs;
    const selected = this.preRollFrames.filter((frame) => frame.timestamp >= cutoff);
    this.activeFrames = [...selected];
    this.activePreRollSamples = selected.reduce((total, frame) => total + frame.samples.length, 0);
    this.activeSegmentId = `segment-${++this.sequence}`;
    this.manualSegmentStartedAt = null;
    this.requestedEnd = null;
    this.finalizationDeadline = null;
    this.state = "capturing";
    this.emit();
  }

  handleSpeechEnd(event: SpeechEndEvent): void {
    if (this.disposed || !this.enabled || (this.state !== "capturing" && this.state !== "finalizing")) {
      return;
    }
    this.requestedEnd = event;
    const mappedReason = this.mapVadReason(event.reason);
    const remainingPostRollMs = Math.max(0, this.config.postRollMs - event.trailingSilenceMs);
    if (mappedReason !== "silence" || remainingPostRollMs === 0) {
      this.finishActive(mappedReason, event.validSpeech);
      return;
    }
    this.state = "finalizing";
    this.finalizationDeadline = event.endedAt + remainingPostRollMs;
    this.emit();
  }

  handleInputReset(reason: AudioSegmentEndReason): void {
    if (this.disposed) {
      return;
    }
    this.finishActive(reason, this.requestedEnd?.validSpeech ?? false);
    this.clearBuffers();
    if (this.enabled) {
      this.beginBuffering();
    }
  }

  setPcmSourceAttached(attached: boolean): void {
    if (this.disposed) {
      return;
    }
    if (!attached) {
      this.handleInputReset("device-lost");
    }
    this.emit();
  }

  clearLastSegment(): void {
    this.lastSegment = null;
    this.lastSegmentDurationMs = null;
    this.lastSegmentByteSize = null;
    this.lastEndReason = null;
    this.lastValidSpeech = null;
    this.emit();
  }

  getLastSegment(): CapturedAudioSegment | null {
    return this.lastSegment;
  }

  getSnapshot(): AudioSegmentCaptureSnapshot {
    return {
      enabled: this.enabled,
      state: this.state,
      pcmSourceAttached: false,
      processingFrameCount: this.processingFrameCount,
      sampleRate: this.currentSampleRate,
      channelCount: this.currentSampleRate === null ? null : 1,
      preRollBufferedMs: this.getPreRollBufferedMs(),
      activeSegmentId: this.activeSegmentId,
      activeSegmentDurationMs: this.getActiveDurationMs(),
      activeSampleCount: this.activeFrames.reduce((total, frame) => total + frame.samples.length, 0),
      segmentCount: this.segmentCount,
      lastSegmentDurationMs: this.lastSegmentDurationMs,
      lastSegmentByteSize: this.lastSegmentByteSize,
      lastEndReason: this.lastEndReason,
      lastValidSpeech: this.lastValidSpeech,
      droppedFrameCount: this.droppedFrameCount,
      activeCaptureLoopCount: 0,
      lastError: this.lastError,
    };
  }

  subscribe(listener: (snapshot: AudioSegmentCaptureSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    listener(this.getSnapshot());
    return () => this.snapshotListeners.delete(listener);
  }

  onSegment(listener: (segment: CapturedAudioSegment) => void): () => void {
    this.segmentListeners.add(listener);
    return () => this.segmentListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.finishActive("disposed", this.requestedEnd?.validSpeech ?? false);
    this.clearBuffers();
    this.enabled = false;
    this.state = "idle";
    this.disposed = true;
    this.snapshotListeners.clear();
    this.segmentListeners.clear();
  }

  private beginBuffering(): void {
    this.clearBuffers();
    this.state = "buffering";
    this.emit();
  }

  private pushPreRollFrame(frame: AudioPcmFrame): void {
    this.preRollFrames.push(frame);
    const cutoff = frame.timestamp - this.config.maximumBufferedDurationMs;
    while (this.preRollFrames.length > 0 && this.preRollFrames[0]!.timestamp < cutoff) {
      this.preRollFrames.shift();
    }
  }

  private finishActive(reason: AudioSegmentEndReason, vadValidSpeech: boolean, truncated = false): void {
    if (!this.activeSegmentId || this.activeFrames.length === 0) {
      this.clearActiveSegment();
      return;
    }
    const sampleRate = this.activeFrames[0]!.sampleRate;
    const pcm = concatPcmFrames(this.activeFrames);
    if (pcm.length === 0) {
      this.clearActiveSegment();
      return;
    }
    const startedAt = this.activeFrames[0]!.timestamp;
    const durationMs = Math.round((pcm.length / sampleRate) * 1000);
    const metadata: AudioSegmentMetadata = {
      segmentId: this.activeSegmentId,
      startedAt,
      endedAt: startedAt + durationMs,
      durationMs,
      sampleRate,
      channelCount: 1,
      frameCount: this.activeFrames.length,
      preRollMs: Math.round((this.activePreRollSamples / sampleRate) * 1000),
      postRollMs: this.getPostRollMs(sampleRate),
      endReason: reason,
      vadValidSpeech,
      truncated,
    };
    const segment: CapturedAudioSegment = { metadata, pcm, wav: encodePcm16Wav(pcm, sampleRate) };
    this.segmentCount += 1;
    this.lastSegmentDurationMs = durationMs;
    this.lastSegmentByteSize = segment.wav.byteLength;
    this.lastEndReason = reason;
    this.lastValidSpeech = vadValidSpeech;
    if (this.config.retainLastSegment) {
      this.lastSegment = segment;
    }
    this.clearActiveSegment();
    this.preRollFrames = [];
    this.state = this.enabled ? "buffering" : "idle";
    for (const listener of this.segmentListeners) {
      listener(segment);
    }
  }

  private clearActiveSegment(): void {
    this.activeFrames = [];
    this.activeSegmentId = null;
    this.activePreRollSamples = 0;
    this.requestedEnd = null;
    this.finalizationDeadline = null;
    this.manualSegmentStartedAt = null;
  }

  private clearBuffers(): void {
    this.preRollFrames = [];
    this.clearActiveSegment();
    this.currentSampleRate = null;
    this.lastInputTimestamp = Number.NEGATIVE_INFINITY;
  }

  private getPreRollBufferedMs(): number {
    if (this.preRollFrames.length < 2) {
      return 0;
    }
    const lastFrame = this.preRollFrames[this.preRollFrames.length - 1]!;
    return Math.max(0, lastFrame.timestamp - this.preRollFrames[0]!.timestamp);
  }

  private getActiveDurationMs(): number {
    const sampleRate = this.activeFrames[0]?.sampleRate;
    if (!sampleRate) {
      return 0;
    }
    return Math.round(
      (this.activeFrames.reduce((total, frame) => total + frame.samples.length, 0) / sampleRate) * 1000,
    );
  }

  private getPostRollMs(sampleRate: number): number {
    if (!this.requestedEnd) {
      return 0;
    }
    const allSamples = this.activeFrames.reduce((total, frame) => total + frame.samples.length, 0);
    const vadDurationSamples = Math.max(0, Math.round((this.requestedEnd.durationMs / 1000) * sampleRate));
    return Math.max(0, Math.round(((allSamples - this.activePreRollSamples - vadDurationSamples) / sampleRate) * 1000));
  }

  private mapVadReason(reason: SpeechEndReason): AudioSegmentEndReason {
    return reason === "disabled" ? "disabled" : reason;
  }

  private emit(): void {
    if (this.disposed) {
      return;
    }
    const snapshot = this.getSnapshot();
    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }
  }
}

export type BrowserAudioSegmentCaptureOptions = {
  config?: Partial<AudioSegmentCaptureConfig>;
  workletModuleUrl?: string;
  now?: () => number;
};

/**
 * Browser AudioWorklet adapter. It receives PCM from an existing input source
 * and binds to VAD events, but never owns a MediaStream or an AudioContext.
 */
export class BrowserAudioSegmentCapture implements AudioSegmentCapture {
  private readonly capture: AdaptiveAudioSegmentCapture;
  private readonly workletModuleUrl: string;
  private readonly now: () => number;
  private readonly listeners = new Set<(snapshot: AudioSegmentCaptureSnapshot) => void>();
  private source: AudioNode | null = null;
  private sourceSessionId: number | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private enabled = false;
  private muted = false;
  private disposed = false;
  private attachGeneration = 0;
  private vadStartUnsubscribe: (() => void) | null = null;
  private vadEndUnsubscribe: (() => void) | null = null;
  private lastSnapshotEmitAt = 0;
  private lastFrameTimestamp = 0;
  private lastError: string | null = null;

  constructor(options: BrowserAudioSegmentCaptureOptions = {}) {
    this.now = options.now ?? Date.now;
    this.workletModuleUrl = options.workletModuleUrl ?? "/audio/pcm-capture-worklet.js";
    this.capture = new AdaptiveAudioSegmentCapture(options.config, this.now);
    this.capture.subscribe(() => this.emit());
  }

  bindVad(detector: VoiceActivityDetector): void {
    this.unbindVad();
    this.vadStartUnsubscribe = detector.onSpeechStart((event) => this.capture.handleSpeechStart(event));
    this.vadEndUnsubscribe = detector.onSpeechEnd((event) => this.capture.handleSpeechEnd(event));
  }

  setInputSource(
    source: AudioNode | null,
    sessionId: number | null,
    endReason: AudioSegmentEndReason = "device-lost",
  ): void {
    if (this.disposed || (this.source === source && this.sourceSessionId === sessionId)) {
      return;
    }
    this.attachGeneration += 1;
    const hadSource = this.source !== null;
    this.detachWorklet();
    if (hadSource) {
      this.capture.handleInputReset(endReason);
    }
    this.source = source;
    this.sourceSessionId = sessionId;
    this.lastError = null;
    if (this.enabled && source && !this.muted) {
      void this.attachWorklet(this.attachGeneration, source);
    }
    this.emit(true);
  }

  setInputMuted(muted: boolean): void {
    if (this.disposed || this.muted === muted) {
      return;
    }
    this.muted = muted;
    if (muted) {
      this.capture.handleInputReset("muted");
    } else if (this.enabled) {
      this.capture.reset();
      if (this.source && !this.workletNode) {
        void this.attachWorklet(this.attachGeneration, this.source);
      }
    }
    this.emit(true);
  }

  start(): void {
    if (this.disposed || this.enabled) {
      return;
    }
    this.enabled = true;
    this.capture.start();
    if (this.source && !this.muted) {
      void this.attachWorklet(this.attachGeneration, this.source);
    }
    this.emit(true);
  }

  stop(reason: AudioSegmentEndReason = "stopped"): void {
    if (this.disposed) {
      return;
    }
    this.attachGeneration += 1;
    this.detachWorklet();
    this.capture.stop(reason);
    this.enabled = false;
    this.emit(true);
  }

  reset(): void {
    if (this.disposed) {
      return;
    }
    this.capture.reset();
    this.emit(true);
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.start();
    } else {
      this.stop("disabled");
    }
  }

  startManualSegment(startedAt = this.now()): boolean {
    return this.capture.startManualSegment(startedAt);
  }

  stopManualSegment(endedAt = this.now()): boolean {
    return this.capture.stopManualSegment(endedAt);
  }

  getSnapshot(): AudioSegmentCaptureSnapshot {
    return {
      ...this.capture.getSnapshot(),
      enabled: this.enabled,
      pcmSourceAttached: this.workletNode !== null,
      activeCaptureLoopCount: this.enabled && this.workletNode !== null ? 1 : 0,
      lastError: this.lastError ?? this.capture.getSnapshot().lastError,
    };
  }

  subscribe(listener: (snapshot: AudioSegmentCaptureSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  onSegment(listener: (segment: CapturedAudioSegment) => void): () => void {
    return this.capture.onSegment(listener);
  }

  getLastSegment(): CapturedAudioSegment | null {
    return this.capture.getLastSegment();
  }

  clearLastSegment(): void {
    this.capture.clearLastSegment();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.attachGeneration += 1;
    this.detachWorklet();
    this.unbindVad();
    this.capture.dispose();
    this.disposed = true;
    this.listeners.clear();
  }

  private async attachWorklet(generation: number, source: AudioNode): Promise<void> {
    try {
      const context = source.context;
      if (!context.audioWorklet) {
        throw new Error("AudioWorklet is not supported by this browser.");
      }
      await context.audioWorklet.addModule(this.workletModuleUrl);
      if (this.disposed || generation !== this.attachGeneration || this.source !== source || !this.enabled || this.muted) {
        return;
      }
      const node = new AudioWorkletNode(context, "ai-vtuber-pcm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      node.port.onmessage = (event: MessageEvent<{ type?: string; samples?: ArrayBuffer }>) => {
        if (this.disposed || node !== this.workletNode || event.data?.type !== "pcm" || !event.data.samples) {
          return;
        }
        const samples = new Float32Array(event.data.samples);
        const timestamp = this.nextFrameTimestamp(samples.length, context.sampleRate);
        this.capture.pushFrame({ timestamp, sampleRate: context.sampleRate, channelCount: 1, samples });
      };
      source.connect(node);
      this.workletNode = node;
      this.emit(true);
    } catch (error) {
      if (this.disposed || generation !== this.attachGeneration) {
        return;
      }
      this.lastError = error instanceof Error ? error.message : "Unable to attach PCM capture worklet.";
      this.detachWorklet();
      this.emit(true);
    }
  }

  private detachWorklet(): void {
    if (this.source && this.workletNode) {
      try {
        this.source.disconnect(this.workletNode);
      } catch {
        // BrowserAudioInput may have already disconnected its source.
      }
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
    }
    this.workletNode = null;
  }

  private nextFrameTimestamp(sampleCount: number, sampleRate: number): number {
    const now = this.now();
    const frameDurationMs = Math.max(1, Math.round((sampleCount / sampleRate) * 1000));
    this.lastFrameTimestamp = Math.max(now, this.lastFrameTimestamp + frameDurationMs);
    return this.lastFrameTimestamp;
  }

  unbindVad(): void {
    this.vadStartUnsubscribe?.();
    this.vadEndUnsubscribe?.();
    this.vadStartUnsubscribe = null;
    this.vadEndUnsubscribe = null;
  }

  private emit(force = false): void {
    if (this.disposed) {
      return;
    }
    const now = this.now();
    if (!force && now - this.lastSnapshotEmitAt < 100) {
      return;
    }
    this.lastSnapshotEmitAt = now;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function encodePcm16Wav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  if (pcm.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Cannot encode an empty PCM segment or invalid sample rate.");
  }
  const dataByteLength = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);
  for (let index = 0; index < pcm.length; index += 1) {
    const value = Math.max(-1, Math.min(1, pcm[index] ?? 0));
    view.setInt16(44 + index * 2, value < 0 ? Math.round(value * 32_768) : Math.round(value * 32_767), true);
  }
  return buffer;
}

function concatPcmFrames(frames: AudioPcmFrame[]): Float32Array {
  const length = frames.reduce((total, frame) => total + frame.samples.length, 0);
  const pcm = new Float32Array(length);
  let offset = 0;
  for (const frame of frames) {
    pcm.set(frame.samples, offset);
    offset += frame.samples.length;
  }
  return pcm;
}

function isValidPcmFrame(frame: AudioPcmFrame): boolean {
  return (
    Number.isFinite(frame.timestamp) &&
    Number.isFinite(frame.sampleRate) &&
    frame.sampleRate > 0 &&
    frame.channelCount === 1 &&
    frame.samples.length > 0
  );
}

function normalizeSegmentCaptureConfig(config: AudioSegmentCaptureConfig): AudioSegmentCaptureConfig {
  return {
    preRollMs: Math.max(0, config.preRollMs),
    postRollMs: Math.max(0, config.postRollMs),
    maximumSegmentDurationMs: Math.max(1_000, config.maximumSegmentDurationMs),
    maximumBufferedDurationMs: Math.max(config.preRollMs, config.maximumBufferedDurationMs),
    retainLastSegment: config.retainLastSegment,
  };
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
