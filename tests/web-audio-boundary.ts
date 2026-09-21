class AudioParam {
  value = 0
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class AudioNode {
  gain = new AudioParam()
  threshold = new AudioParam()
  knee = new AudioParam()
  ratio = new AudioParam()
  attack = new AudioParam()
  release = new AudioParam()
  frequency = new AudioParam()
  Q = new AudioParam()
  playbackRate = new AudioParam()
  connect() {}
  start() {}
  stop() {}
}

export class AudioContextBoundary {
  sampleRate = 48000
  destination = new AudioNode()
  createGain() { return new AudioNode() }
  createDynamicsCompressor() { return new AudioNode() }
  createBiquadFilter() { return new AudioNode() }
  createConvolver() { return new AudioNode() }
  createBufferSource() { return new AudioNode() }
  createBuffer(channels = 2, length = 1, sampleRate = 48000) {
    const data = Array.from({ length: channels }).fill(new Float32Array(length))
    return { numberOfChannels: channels, length, sampleRate, getChannelData: (channel: number) => data[channel] }
  }

  async decodeAudioData() { return this.createBuffer() }
  async startRendering() { return this.createBuffer() }
  async close() {}
}
