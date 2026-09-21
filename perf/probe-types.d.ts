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

  interface OrbitonePerfSeekReading { latencyMs: number, nextFramePositionSeconds: number }

  interface OrbitonePerfProbe {
    audio: () => OrbitonePerfAudioReading
    position: () => number
    measure: (durationMs: number) => Promise<OrbitonePerfWindowMetrics>
    armSeek: () => void
    seek: OrbitonePerfSeekReading | null
  }

  interface Window { __orbitonePerf?: OrbitonePerfProbe }
}
