export {}

declare global {
  interface AudioReading {
    peak: number
    contextSeconds: number
    running: boolean
  }

  interface BrowserWindowMetrics {
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

  interface SeekReading { latencyMs: number, nextFramePositionSeconds: number }

  interface PerformanceProbe {
    audio: () => AudioReading
    position: () => number
    measure: (durationMs: number) => Promise<BrowserWindowMetrics>
    armSeek: () => void
    seek: SeekReading | null
  }

  interface Window { orbitonePerf: PerformanceProbe }
}
