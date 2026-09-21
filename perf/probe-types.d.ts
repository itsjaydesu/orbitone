export {}

declare global {
  interface OrbitonePerfAudioReading {
    peak: number
    contextSeconds: number
    running: boolean
  }

  interface OrbitonePerfWindowMetrics {
    startMs: number
    endMs: number
    intervalsMs: number[]
    longTaskCount: number
    longTaskDurationMs: number
    audioPeak: number
    audioActiveSamples: number
    audioSamples: number
    positionStartSeconds: number
    positionEndSeconds: number
  }

  interface OrbitonePerfSeekReading {
    latencyMs: number | null
    firstFrameLatencyMs: number
    nextFramePositionSeconds: number
  }

  interface OrbitonePerfSeekInput {
    pointerDownMs: number | null
    pointerDownCount: number
    inputCount: number
    requestedPositionSeconds: number | null
    pointerX: number | null
    pointerY: number | null
    controlX: number | null
    controlY: number | null
    controlWidth: number | null
    controlHeight: number | null
  }

  interface OrbitonePerfSeekObservation extends OrbitonePerfSeekInput {
    latencyMs: number | null
    firstFrameLatencyMs: number | null
    nextFramePositionSeconds: number | null
    observedPositionSeconds: number | null
    observationElapsedMs: number | null
  }

  interface OrbitonePerfProbe {
    audio: () => OrbitonePerfAudioReading
    position: () => number
    measure: (durationMs: number) => Promise<OrbitonePerfWindowMetrics>
    armSeek: (toleranceSeconds: number, timeoutMs: number) => void
    disarmSeek: () => void
    seekSnapshot: () => OrbitonePerfSeekObservation
    observeSeek: (expectedPositionSeconds: number, toleranceSeconds: number, timeoutMs: number) => OrbitonePerfSeekObservation | null
    seekInput: OrbitonePerfSeekInput | null
    seek: OrbitonePerfSeekReading | null
  }

  interface Window { __orbitonePerf?: OrbitonePerfProbe }
}
