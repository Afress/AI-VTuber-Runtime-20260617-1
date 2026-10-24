export type TTSRequest = {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
  emotion?: string;
  referenceAudioUrl?: string;
  extra?: Record<string, unknown>;
};

export type TTSResult = {
  audioUrl?: string;
  audioBlob?: Blob;
  durationMs?: number;
  providerName: string;
};

export interface ITTSProvider {
  synthesize(request: TTSRequest): Promise<TTSResult>;
}

export class MockTTSProvider implements ITTSProvider {
  readonly providerName = "mock-tts";

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const textLength = request.text.trim().length;
    const speed = clampSpeechSpeed(request.speed ?? 1);
    const estimatedDurationMs = Math.max(300, Math.round((textLength / 8) * 1000 / speed));

    return {
      durationMs: estimatedDurationMs,
      providerName: this.providerName,
    };
  }
}

export class MockAudioTTSProvider implements ITTSProvider {
  readonly providerName = "mock-audio-tts";

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const textLength = request.text.trim().length;
    const durationMs = clampDurationMs(600 + (textLength / 8) * 1000);

    return {
      audioBlob: createSpeechLikeWavBlob(durationMs),
      durationMs,
      providerName: this.providerName,
    };
  }
}

export class HttpTTSProvider implements ITTSProvider {
  readonly providerName: string;

  constructor(
    private readonly endpoint: string,
    providerName = "http-tts",
  ) {
    this.providerName = providerName;
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: request.text,
        voice: request.voice,
        language: request.language,
        speed: request.speed,
        emotion: request.emotion,
        referenceAudioUrl: request.referenceAudioUrl,
        extra: request.extra,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `${this.providerName} request failed: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const contentType = response.headers.get("Content-Type")?.split(";")[0]?.trim() ?? "";
    if (isAudioContentType(contentType)) {
      return {
        audioBlob: await response.blob(),
        providerName: this.providerName,
      };
    }

    if (contentType === "application/json" || contentType.endsWith("+json")) {
      const json = (await response.json()) as Partial<TTSResult>;
      const result: TTSResult = {
        audioUrl: json.audioUrl,
        durationMs: json.durationMs,
        providerName: json.providerName ?? this.providerName,
      };

      assertTTSResultHasOutput(result, this.providerName);
      return result;
    }

    throw new Error(
      `${this.providerName} returned unsupported Content-Type: ${contentType || "unknown"}`,
    );
  }
}

function clampSpeechSpeed(speed: number) {
  return Math.min(4, Math.max(0.25, speed));
}

function clampDurationMs(durationMs: number) {
  return Math.min(12000, Math.max(800, Math.round(durationMs)));
}

function isAudioContentType(contentType: string) {
  return (
    contentType === "audio/wav" ||
    contentType === "audio/mpeg" ||
    contentType === "audio/ogg" ||
    contentType === "application/octet-stream"
  );
}

function assertTTSResultHasOutput(result: TTSResult, providerName: string) {
  if (!result.audioBlob && !result.audioUrl && result.durationMs === undefined) {
    throw new Error(
      `${providerName} response must include audioBlob, audioUrl, or durationMs.`,
    );
  }
}

function createSpeechLikeWavBlob(durationMs: number) {
  const sampleRate = 24000;
  const channelCount = 1;
  const bytesPerSample = 2;
  const sampleCount = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const progress = index / sampleCount;
    const syllableEnvelope = getSpeechLikeEnvelope(time, progress);
    const frequency = 220 + Math.sin(time * 7.1) * 32 + Math.sin(time * 2.7) * 14;
    const tone = Math.sin(2 * Math.PI * frequency * time) * 0.42;
    const harmonic = Math.sin(2 * Math.PI * frequency * 2 * time + 0.4) * 0.12;
    const breathNoise = deterministicNoise(index) * 0.015;
    const sample = Math.max(-1, Math.min(1, (tone + harmonic + breathNoise) * syllableEnvelope));
    view.setInt16(44 + index * bytesPerSample, sample * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function getSpeechLikeEnvelope(time: number, progress: number) {
  const syllableDuration = 0.18;
  const phraseDuration = 1.35;
  const syllablePosition = (time % syllableDuration) / syllableDuration;
  const phrasePosition = (time % phraseDuration) / phraseDuration;
  const isPause = phrasePosition > 0.82;

  if (isPause) {
    return 0;
  }

  const attack = smoothstep(0, 0.18, syllablePosition);
  const decay = 1 - smoothstep(0.35, 1, syllablePosition);
  const syllableShape = attack * decay;
  const syllableVariation = 0.5 + Math.sin(Math.floor(time / syllableDuration) * 1.7) * 0.35;
  const phraseShape = 0.15 + 0.7 * smoothstep(0, 0.2, phrasePosition);
  const endingFade = 1 - smoothstep(0.82, 1, progress);
  const amplitude = 0.15 + syllableShape * syllableVariation * phraseShape * 0.7;

  return Math.min(0.85, Math.max(0, amplitude * endingFade));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function deterministicNoise(index: number) {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
