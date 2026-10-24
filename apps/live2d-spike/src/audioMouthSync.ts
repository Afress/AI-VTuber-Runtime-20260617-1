export type AudioAnalyserPipeline = {
  audioContext: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
};

export async function createAudioAnalyserPipeline(
  audioElement: HTMLAudioElement,
): Promise<AudioAnalyserPipeline> {
  const AudioContextConstructor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Web Audio API is not available in this browser.");
  }

  const audioContext = new AudioContextConstructor();
  await audioContext.resume();

  const source = audioContext.createMediaElementSource(audioElement);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  return {
    audioContext,
    source,
    analyser,
  };
}

export function computeRmsFromAnalyser(analyser: AnalyserNode): number {
  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);

  let sum = 0;
  for (const sample of samples) {
    const centered = sample / 128 - 1;
    sum += centered * centered;
  }

  return Math.sqrt(sum / Math.max(samples.length, 1));
}

export function computeMouthValue(
  rms: number,
  gain: number,
  smoothing: number,
  previousValue: number,
): number {
  const raw = Math.min(1, Math.max(0, rms * gain));
  return previousValue * smoothing + raw * (1 - smoothing);
}

export function cleanupAudioPipeline(pipeline: AudioAnalyserPipeline | null): void {
  if (!pipeline) {
    return;
  }

  try {
    pipeline.source.disconnect();
  } catch {
    // Ignore disconnect errors during cleanup.
  }

  try {
    pipeline.analyser.disconnect();
  } catch {
    // Ignore disconnect errors during cleanup.
  }

  void pipeline.audioContext.close().catch((error) => {
    console.warn("AudioContext close failed:", error);
  });
}
