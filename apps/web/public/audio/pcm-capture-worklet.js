class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0 || channels[0].length === 0) {
      return true;
    }

    const frameLength = channels[0].length;
    const mono = new Float32Array(frameLength);
    for (let sampleIndex = 0; sampleIndex < frameLength; sampleIndex += 1) {
      let total = 0;
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
        total += channels[channelIndex][sampleIndex] ?? 0;
      }
      mono[sampleIndex] = total / channels.length;
    }

    this.port.postMessage({ type: "pcm", samples: mono.buffer }, [mono.buffer]);
    return true;
  }
}

registerProcessor("ai-vtuber-pcm-capture", PcmCaptureProcessor);
