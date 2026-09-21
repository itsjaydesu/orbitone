export const audio = { samplesLoad: true, activeParts: 0 }

export const Transport = {
  seconds: 0,
  state: 'stopped',
  start() { this.state = 'started' },
  pause() { this.state = 'paused' },
  stop() {
    this.state = 'stopped'
    this.seconds = 0
  },
}

class AudioNode {
  gain = { value: 1, rampTo() {} }
  wet = { value: 1 }
  roomSize = { rampTo() {} }
  connect() { return this }
  toDestination() { return this }
  dispose() {}
}

export const Gain = AudioNode
export const Filter = AudioNode
export const Limiter = AudioNode
export const Meter = AudioNode
export const EQ3 = AudioNode
export const Freeverb = AudioNode

export class Sampler extends AudioNode {
  constructor(options: { onload: () => void }) {
    super()
    if (audio.samplesLoad)
      queueMicrotask(options.onload)
  }

  releaseAll() {}
}

export class Part {
  constructor() { audio.activeParts++ }
  start() {}
  dispose() { audio.activeParts-- }
}

export async function start() {}
