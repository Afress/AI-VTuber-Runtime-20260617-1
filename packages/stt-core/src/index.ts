export type SpeechRecognitionStatus = "idle" | "queued" | "transcribing" | "completed" | "cancelled" | "error";
export type QueueOverflowPolicy = "reject" | "drop-oldest" | "drop-newest";

export type SpeechRecognitionRequest = {
  requestId: string;
  segmentId: string;
  audio: ArrayBuffer;
  mimeType: "audio/wav";
  sampleRate: number;
  channelCount: number;
  durationMs: number;
  language?: string;
  prompt?: string;
};

export type TranscriptSegment = { startMs: number; endMs: number; text: string; confidence?: number };
export type TranscriptNormalizationContext = {
  detectedLanguage?: string;
  configuredLanguage?: string;
};
export type TranscriptNormalizationResult = {
  text: string;
  rawText?: string;
  warning?: string;
};
export type TranscriptNormalizer = (
  text: string,
  context: TranscriptNormalizationContext,
) => TranscriptNormalizationResult;
export type SpeechRecognitionResult = {
  requestId: string;
  segmentId: string;
  text: string;
  language?: string;
  durationMs?: number;
  processingTimeMs: number;
  segments?: TranscriptSegment[];
  provider: string;
  rawText?: string;
  normalizationWarning?: string;
  raw?: unknown;
};
export type ProviderHealthResult = {
  status: "not_loaded" | "loading" | "loaded" | "unavailable";
  available: boolean;
  serviceStatus?: string;
  modelConfigured?: boolean;
  backendError?: string | null;
  model?: string;
  device?: string;
  computeType?: string;
  modelLoaded?: boolean;
  version?: string;
  raw?: unknown;
};

export class SpeechRecognitionError extends Error {
  constructor(
    message: string,
    readonly code = "STT_ERROR",
    readonly retryable = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SpeechRecognitionError";
  }
}

export interface SpeechRecognitionProvider {
  readonly providerId: string;
  transcribe(request: SpeechRecognitionRequest, signal?: AbortSignal): Promise<SpeechRecognitionResult>;
  healthCheck?(signal?: AbortSignal): Promise<ProviderHealthResult>;
}

export type CapturedSegmentLike = {
  metadata: {
    segmentId: string;
    durationMs: number;
    sampleRate: number;
    channelCount: number;
    endReason: string;
    vadValidSpeech: boolean;
    truncated: boolean;
  };
  wav: ArrayBuffer;
};

export type SegmentAcceptance = { accepted: boolean; reason?: string };
export type SpeechRecognitionSnapshot = {
  providerId: string;
  status: SpeechRecognitionStatus;
  autoTranscribeEnabled: boolean;
  activeRequestId: string | null;
  activeSegmentId: string | null;
  queueLength: number;
  requestCount: number;
  completedCount: number;
  errorCount: number;
  cancelledCount: number;
  lastSegmentDurationMs: number | null;
  lastAudioByteSize: number | null;
  lastTranscript: string | null;
  lastRawTranscript: string | null;
  lastNormalizationWarning: string | null;
  detectedLanguage: string | null;
  processingTimeMs: number | null;
  realtimeFactor: number | null;
  lastError: { code: string; message: string; retryable: boolean } | null;
  health: ProviderHealthResult | null;
  transcriptHistory: Array<Pick<SpeechRecognitionResult, "requestId" | "segmentId" | "text" | "rawText" | "normalizationWarning" | "language" | "processingTimeMs" | "provider">>;
};

export type SpeechRecognitionServiceOptions = {
  maximumPending?: number;
  queueOverflowPolicy?: QueueOverflowPolicy;
  requestTimeoutMs?: number;
  minimumDurationMs?: number;
  maximumDurationMs?: number;
  maximumAudioBytes?: number;
  transcriptNormalizer?: TranscriptNormalizer;
  now?: () => number;
};

type InternalServiceOptions = Required<Omit<SpeechRecognitionServiceOptions, "now" | "transcriptNormalizer">>;

const DEFAULT_OPTIONS: InternalServiceOptions = {
  maximumPending: 3,
  queueOverflowPolicy: "reject",
  requestTimeoutMs: 30_000,
  minimumDurationMs: 200,
  maximumDurationMs: 35_000,
  maximumAudioBytes: 8 * 1024 * 1024,
};

type QueueItem = { request: SpeechRecognitionRequest; resolve: (result: SpeechRecognitionResult) => void; reject: (error: unknown) => void };

export class SpeechRecognitionService {
  private provider: SpeechRecognitionProvider;
  private readonly options: InternalServiceOptions;
  private readonly now: () => number;
  private readonly transcriptNormalizer?: TranscriptNormalizer;
  private readonly listeners = new Set<(snapshot: SpeechRecognitionSnapshot) => void>();
  private queue: QueueItem[] = [];
  private active: { item: QueueItem; controller: AbortController } | null = null;
  private disposed = false;
  private seenSegmentIds = new Set<string>();
  private sequence = 0;
  private snapshot: SpeechRecognitionSnapshot;

  constructor(provider: SpeechRecognitionProvider, options: SpeechRecognitionServiceOptions = {}) {
    this.provider = provider;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.now = options.now ?? Date.now;
    this.transcriptNormalizer = options.transcriptNormalizer;
    this.snapshot = this.createSnapshot();
  }

  setProvider(provider: SpeechRecognitionProvider): void {
    if (this.provider === provider) return;
    this.cancelActive("Provider changed");
    this.rejectQueued(new SpeechRecognitionError("Provider changed", "PROVIDER_CHANGED", true));
    this.provider = provider;
    this.snapshot.providerId = provider.providerId;
    this.snapshot.health = null;
    this.emit();
  }

  setAutoTranscribeEnabled(enabled: boolean): void { this.snapshot.autoTranscribeEnabled = enabled; this.emit(); }
  getSnapshot(): SpeechRecognitionSnapshot { return { ...this.snapshot, transcriptHistory: [...this.snapshot.transcriptHistory] }; }
  subscribe(listener: (snapshot: SpeechRecognitionSnapshot) => void): () => void { this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener); }
  clearTranscriptHistory(): void { this.snapshot.transcriptHistory = []; this.snapshot.lastTranscript = null; this.snapshot.lastRawTranscript = null; this.snapshot.lastNormalizationWarning = null; this.snapshot.detectedLanguage = null; this.emit(); }

  acceptSegment(segment: CapturedSegmentLike, force = false): SegmentAcceptance {
    const { metadata, wav } = segment;
    if (force) return wav.byteLength > 0 ? { accepted: true } : { accepted: false, reason: "WAV is empty" };
    if (!metadata.vadValidSpeech) return { accepted: false, reason: "VAD did not mark this as valid speech" };
    if (metadata.truncated) return { accepted: false, reason: "Segment was truncated" };
    if (["muted", "device-lost", "reset", "disposed"].includes(metadata.endReason)) return { accepted: false, reason: `Segment ended as ${metadata.endReason}` };
    if (metadata.channelCount !== 1 || metadata.sampleRate <= 0) return { accepted: false, reason: "Segment audio format is unsupported" };
    if (metadata.durationMs < this.options.minimumDurationMs || metadata.durationMs > this.options.maximumDurationMs) return { accepted: false, reason: "Segment duration is outside the accepted range" };
    if (wav.byteLength === 0 || wav.byteLength > this.options.maximumAudioBytes || !hasPcm16WavHeader(wav)) return { accepted: false, reason: "Segment WAV is invalid or outside the accepted size" };
    return { accepted: true };
  }

  transcribeSegment(segment: CapturedSegmentLike, options: { force?: boolean; language?: string; prompt?: string } = {}): Promise<SpeechRecognitionResult> {
    const acceptance = this.acceptSegment(segment, options.force);
    this.snapshot.lastSegmentDurationMs = segment.metadata.durationMs;
    this.snapshot.lastAudioByteSize = segment.wav.byteLength;
    if (!acceptance.accepted) return Promise.reject(new SpeechRecognitionError(acceptance.reason ?? "Segment rejected", "SEGMENT_REJECTED", false));
    if (this.seenSegmentIds.has(segment.metadata.segmentId)) return Promise.reject(new SpeechRecognitionError("Segment has already been submitted", "DUPLICATE_SEGMENT", false));
    this.seenSegmentIds.add(segment.metadata.segmentId);
    const request: SpeechRecognitionRequest = {
      requestId: `stt-${++this.sequence}-${this.now()}`,
      segmentId: segment.metadata.segmentId,
      audio: segment.wav.slice(0),
      mimeType: "audio/wav",
      sampleRate: segment.metadata.sampleRate,
      channelCount: segment.metadata.channelCount,
      durationMs: segment.metadata.durationMs,
      language: normalizeLanguage(options.language),
      prompt: options.prompt?.trim() || undefined,
    };
    return this.enqueue(request);
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    if (!this.provider.healthCheck) {
      throw new SpeechRecognitionError(
        "Provider does not expose a health check",
        "HEALTH_UNSUPPORTED",
        false,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.requestTimeoutMs,
    );

    try {
      const health = await this.provider.healthCheck(controller.signal);
      this.snapshot.health = health;
      this.snapshot.lastError = null;
      this.emit();
      return health;
    } catch (error) {
      const normalized = normalizeError(error);
      this.snapshot.lastError = normalized;
      this.snapshot.health = {
        status: "unavailable",
        available: false,
        raw: error,
      };
      this.emit();
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  cancelActive(reason = "Cancelled by user"): void {
    if (!this.active) return;
    this.active.controller.abort(reason);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelActive("Service disposed");
    this.rejectQueued(new SpeechRecognitionError("Service disposed", "DISPOSED", false));
    this.listeners.clear();
  }

  private enqueue(request: SpeechRecognitionRequest): Promise<SpeechRecognitionResult> {
    if (this.disposed) return Promise.reject(new SpeechRecognitionError("Service disposed", "DISPOSED", false));
    const pending = this.queue.length + (this.active ? 1 : 0);
    if (pending >= this.options.maximumPending) {
      if (this.options.queueOverflowPolicy === "drop-oldest" && this.queue.length) {
        this.queue.shift()?.reject(new SpeechRecognitionError("Queue overflow dropped the oldest request", "QUEUE_DROPPED", true));
      } else {
        return Promise.reject(new SpeechRecognitionError("Speech recognition queue is full", "QUEUE_FULL", true));
      }
    }
    return new Promise((resolve, reject) => { this.queue.push({ request, resolve, reject }); this.snapshot.requestCount += 1; this.updateStatus(); this.emit(); void this.processNext(); });
  }

  private async processNext(): Promise<void> {
    if (this.active || this.disposed) return;
    const item = this.queue.shift();
    if (!item) { this.updateStatus(); this.emit(); return; }
    const controller = new AbortController();
    this.active = { item, controller };
    this.snapshot.status = "transcribing";
    this.snapshot.activeRequestId = item.request.requestId;
    this.snapshot.activeSegmentId = item.request.segmentId;
    this.emit();
    const timeout = setTimeout(() => controller.abort("Request timed out"), this.options.requestTimeoutMs);
    try {
      const result = await this.provider.transcribe(item.request, controller.signal);
      if (this.active?.item !== item || controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      const rawText = normalizeTranscript(result.text);
      if (!rawText) throw new SpeechRecognitionError("Provider returned an empty transcript", "EMPTY_TRANSCRIPT", false);
      const transcript = this.normalizeTranscript(rawText, result.language, item.request.language);
      const normalized = { ...result, ...transcript, text: transcript.text, requestId: item.request.requestId, segmentId: item.request.segmentId, provider: result.provider || this.provider.providerId };
      this.snapshot.completedCount += 1;
      this.snapshot.lastTranscript = transcript.text;
      this.snapshot.lastRawTranscript = transcript.rawText ?? rawText;
      this.snapshot.lastNormalizationWarning = transcript.normalizationWarning ?? null;
      this.snapshot.detectedLanguage = normalized.language ?? null;
      this.snapshot.processingTimeMs = normalized.processingTimeMs;
      this.snapshot.realtimeFactor = item.request.durationMs > 0 ? normalized.processingTimeMs / item.request.durationMs : null;
      this.snapshot.transcriptHistory = [...this.snapshot.transcriptHistory.slice(-19), pickHistory(normalized)];
      item.resolve(normalized);
    } catch (error) {
      const normalized = normalizeError(error);
      if (isAbortError(error)) { this.snapshot.cancelledCount += 1; this.snapshot.status = "cancelled"; item.reject(new SpeechRecognitionError("Speech recognition request cancelled", "CANCELLED", true)); }
      else { this.snapshot.errorCount += 1; this.snapshot.status = "error"; this.snapshot.lastError = normalized; item.reject(error); }
    } finally {
      clearTimeout(timeout);
      if (this.active?.item === item) this.active = null;
      this.updateStatus();
      this.emit();
      void this.processNext();
    }
  }

  private rejectQueued(error: SpeechRecognitionError): void { for (const item of this.queue.splice(0)) item.reject(error); }
  private updateStatus(): void { this.snapshot.activeRequestId = this.active?.item.request.requestId ?? null; this.snapshot.activeSegmentId = this.active?.item.request.segmentId ?? null; this.snapshot.queueLength = this.queue.length; if (!this.active) this.snapshot.status = this.queue.length ? "queued" : "idle"; }
  private emit(): void { if (this.disposed) return; this.snapshot.queueLength = this.queue.length; for (const listener of this.listeners) listener(this.getSnapshot()); }
  private normalizeTranscript(rawText: string, detectedLanguage?: string, configuredLanguage?: string): Pick<SpeechRecognitionResult, "text" | "rawText" | "normalizationWarning"> {
    if (!this.transcriptNormalizer) return { text: rawText, rawText };
    try {
      const normalized = this.transcriptNormalizer(rawText, { detectedLanguage, configuredLanguage });
      const text = normalizeTranscript(normalized.text) || rawText;
      return { text, rawText: normalized.rawText || rawText, normalizationWarning: normalized.warning };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { text: rawText, rawText, normalizationWarning: `Transcript normalization failed: ${detail.replace(/\s+/g, " ").slice(0, 160)}` };
    }
  }
  private createSnapshot(): SpeechRecognitionSnapshot { return { providerId: this.provider.providerId, status: "idle", autoTranscribeEnabled: false, activeRequestId: null, activeSegmentId: null, queueLength: 0, requestCount: 0, completedCount: 0, errorCount: 0, cancelledCount: 0, lastSegmentDurationMs: null, lastAudioByteSize: null, lastTranscript: null, lastRawTranscript: null, lastNormalizationWarning: null, detectedLanguage: null, processingTimeMs: null, realtimeFactor: null, lastError: null, health: null, transcriptHistory: [] }; }
}

export class LocalHttpSpeechRecognitionProvider implements SpeechRecognitionProvider {
  readonly providerId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly endpoint: string,
    providerId = "local-http-stt",
    fetchImpl?: typeof fetch,
  ) {
    this.providerId = providerId;
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async transcribe(
    request: SpeechRecognitionRequest,
    signal?: AbortSignal,
  ): Promise<SpeechRecognitionResult> {
    const form = new FormData();
    form.set(
      "audio",
      new Blob([request.audio], { type: request.mimeType }),
      `${request.segmentId}.wav`,
    );
    form.set("task", "transcribe");
    form.set("segment_id", request.segmentId);
    form.set("request_id", request.requestId);
    if (request.language) form.set("language", request.language);
    if (request.prompt) form.set("prompt", request.prompt);

    const transcribeUrl = `${trimSlash(this.endpoint)}/transcribe`;
    let response: Response;

    try {
      response = await this.fetchImpl(transcribeUrl, {
        method: "POST",
        body: form,
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.error("[Local STT] transcription fetch failed", summarizeError(error));
      const originalMessage =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      throw new SpeechRecognitionError(
        `Local STT service is not reachable: ${trimSlash(this.endpoint)}; cause=${originalMessage}`,
        "NETWORK_UNAVAILABLE",
        true,
      );
    }

    if (!response.ok && !isJsonContentType(response)) {
      throw await createProxyNetworkUnavailableError(response, this.endpoint);
    }
    const payload = await parseJson(response, "MALFORMED_JSON", transcribeUrl);
    if (!response.ok) throw parseProviderError(payload, response.status);
    if (!isRecord(payload) || typeof payload.text !== "string") {
      throw new SpeechRecognitionError(
        "Local STT response is malformed",
        "MALFORMED_RESPONSE",
        false,
        response.status,
      );
    }

    return {
      requestId: request.requestId,
      segmentId: request.segmentId,
      text: payload.text,
      language: stringOrUndefined(payload.language),
      durationMs: numberOrUndefined(payload.duration_ms),
      processingTimeMs: numberOrUndefined(payload.processing_time_ms) ?? 0,
      segments: parseTranscriptSegments(payload.segments),
      provider: this.providerId,
      raw: payload,
    };
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult> {
    const healthUrl = `${trimSlash(this.endpoint)}/health`;
    let response: Response;
    try {
      response = await this.fetchImpl(healthUrl, {
        method: "GET",
        cache: "no-store",
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.error("[Local STT] provider health fetch failed", summarizeError(error));
      const originalMessage =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      throw new SpeechRecognitionError(
        `Local STT service is not reachable: ${trimSlash(this.endpoint)}; cause=${originalMessage}`,
        "NETWORK_UNAVAILABLE",
        true,
      );
    }

    if (!response.ok && !isJsonContentType(response)) {
      throw await createProxyNetworkUnavailableError(response, this.endpoint);
    }
    const payload = await parseJson(response, "INVALID_RESPONSE", healthUrl);
    if (!response.ok) throw parseHealthHttpError(payload, response.status);
    return parseLocalHealthResponse(payload, response.status);
  }
}

export function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").replace(/([，。！？；：、])\s+/g, "$1").trim();
}
export function hasPcm16WavHeader(audio: ArrayBuffer): boolean { if (audio.byteLength < 44) return false; const view = new DataView(audio); return ascii(view, 0, 4) === "RIFF" && ascii(view, 8, 4) === "WAVE" && view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1 && view.getUint16(34, true) === 16; }
function ascii(view: DataView, offset: number, length: number): string { return Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join(""); }
function trimSlash(value: string): string { return value.replace(/\/+$/, ""); }
function normalizeLanguage(value?: string): string | undefined { const normalized = value?.trim().toLowerCase(); return normalized && normalized !== "auto" ? normalized : undefined; }
function isAbortError(error: unknown): boolean { return error instanceof DOMException ? error.name === "AbortError" : error instanceof Error && error.name === "AbortError"; }
function normalizeError(error: unknown): { code: string; message: string; retryable: boolean } { return error instanceof SpeechRecognitionError ? { code: error.code, message: error.message, retryable: error.retryable } : isAbortError(error) ? { code: "CANCELLED", message: "Speech recognition request cancelled", retryable: true } : { code: "STT_ERROR", message: error instanceof Error ? error.message : "Unknown STT error", retryable: true }; }
async function parseJson(response: Response, code = "MALFORMED_JSON", requestUrl?: string): Promise<unknown> {
  const body = await response.text().catch(() => "");
  try {
    return JSON.parse(body);
  } catch {
    const contentType = response.headers.get("content-type") ?? "unknown";
    const url = requestUrl || response.url || "unknown";
    const preview = body.replace(/\s+/g, " ").trim().slice(0, 200);
    throw new SpeechRecognitionError(
      `Local STT service returned invalid JSON; url=${url}; status=${response.status}; content-type=${contentType}; body=${preview || "<empty>"}`,
      code,
      false,
      response.status,
    );
  }
}
function isJsonContentType(response: Response): boolean { const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""; return contentType.includes("application/json") || contentType.includes("+json"); }
async function createProxyNetworkUnavailableError(response: Response, endpoint: string): Promise<SpeechRecognitionError> {
  const body = await response.text().catch(() => "");
  const proxyBody = body.replace(/\s+/g, " ").trim().slice(0, 200);
  return new SpeechRecognitionError(`Local STT service is not reachable through the proxy: ${trimSlash(endpoint)}${proxyBody ? `; proxy=${proxyBody}` : ""}`, "NETWORK_UNAVAILABLE", true, response.status);
}
function parseProviderError(payload: unknown, status: number): SpeechRecognitionError { const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null; return new SpeechRecognitionError(error && typeof error.message === "string" ? error.message : `Local STT request failed: HTTP ${status}`, error && typeof error.code === "string" ? error.code : "HTTP_ERROR", error && typeof error.retryable === "boolean" ? error.retryable : status >= 500, status); }
function parseHealthHttpError(payload: unknown, status: number): SpeechRecognitionError { const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null; return new SpeechRecognitionError(error && typeof error.message === "string" ? error.message : `Local STT health check failed: HTTP ${status}`, "HTTP_ERROR", status >= 500, status); }
function parseLocalHealthResponse(payload: unknown, status: number): ProviderHealthResult {
  if (!isRecord(payload)) throw new SpeechRecognitionError("Local STT health response must be a JSON object", "INVALID_RESPONSE", false, status);
  const backendStatus = payload.status;
  const serviceStatus = payload.service_status;
  const model = payload.model;
  const device = payload.device;
  const computeType = payload.compute_type;
  const modelConfigured = payload.model_configured;
  const modelLoaded = payload.model_loaded;
  const version = payload.version;
  const backendError = payload.error;
  if (!isHealthStatus(backendStatus) || typeof serviceStatus !== "string" || typeof model !== "string" || typeof device !== "string" || typeof computeType !== "string" || typeof modelConfigured !== "boolean" || typeof modelLoaded !== "boolean" || typeof version !== "string" || (backendError !== null && typeof backendError !== "string")) {
    throw new SpeechRecognitionError("Local STT health response does not match the expected contract", "INVALID_RESPONSE", false, status);
  }
  const available = serviceStatus === "running" && modelConfigured && backendError === null && backendStatus !== "unavailable";
  if (!available) {
    const reason = backendError ?? `service_status=${serviceStatus}, status=${backendStatus}, model_configured=${modelConfigured}`;
    throw new SpeechRecognitionError(`Local STT backend is unhealthy: ${reason}`, "BACKEND_UNHEALTHY", true, status);
  }
  return { status: backendStatus, available, serviceStatus, modelConfigured, backendError, model, device, computeType, modelLoaded, version, raw: payload };
}
function parseTranscriptSegments(value: unknown): TranscriptSegment[] | undefined { if (!Array.isArray(value)) return undefined; return value.flatMap((item) => isRecord(item) && typeof item.text === "string" && typeof item.start_ms === "number" && typeof item.end_ms === "number" ? [{ startMs: item.start_ms, endMs: item.end_ms, text: item.text, confidence: numberOrUndefined(item.confidence) }] : []); }
function pickHistory(result: SpeechRecognitionResult) { return { requestId: result.requestId, segmentId: result.segmentId, text: result.text, rawText: result.rawText, normalizationWarning: result.normalizationWarning, language: result.language, processingTimeMs: result.processingTimeMs, provider: result.provider }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function stringOrUndefined(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function numberOrUndefined(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function summarizeError(error: unknown): string { return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).replace(/\s+/g, " ").slice(0, 240); }
function isHealthStatus(value: unknown): value is ProviderHealthResult["status"] { return value === "not_loaded" || value === "loading" || value === "loaded" || value === "unavailable"; }
