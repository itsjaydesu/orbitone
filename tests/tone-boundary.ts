export const audio = { samplesLoad: true, activeParts: 0 }

const scheduledParts = new Set<(seconds: number, audioTime: number) => void>()

export const Transport = {
  seconds: 0,
  state: 'stopped',
  start() { this.state = 'started' },
  pause() { this.state = 'paused' },
  stop() {
    this.state = 'stopped'
    this.seconds = 0
  },
  advance(seconds: number, audioTime: number) {
    this.seconds = seconds
    if (this.state === 'started')
      scheduledParts.forEach(dispatch => dispatch(seconds, audioTime))
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
  triggerAttackRelease(_pitch: string, _duration: number, _time: number, _velocity: number) {}
}

export class Part<Event extends { time: number }> {
  private dispatch: (seconds: number, audioTime: number) => void

  constructor(callback: (time: number, event: Event) => void, events: Event[]) {
    audio.activeParts++
    let next = 0
    this.dispatch = (seconds, audioTime) => {
      while (next < events.length && events[next].time <= seconds) {
        const event = events[next++]
        callback(audioTime + event.time - seconds, event)
      }
    }
  }

  start() { scheduledParts.add(this.dispatch) }
  dispose() {
    scheduledParts.delete(this.dispatch)
    audio.activeParts--
  }
}

export async function start() {}
