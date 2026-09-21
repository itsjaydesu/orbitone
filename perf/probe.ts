// Compile this standalone script without bundler helpers before browser injection.
function installProbe() {
  const analysers: { node: AnalyserNode, data: Float32Array<ArrayBuffer> }[] = []
  const nativeConnect = AudioNode.prototype.connect
  AudioNode.prototype.connect = new Proxy(nativeConnect, {
    apply(target, source: AudioNode, args: [AudioNode | AudioParam, number?, number?]) {
      const result = Reflect.apply(target, source, args) as AudioNode | undefined
      if (args[0] instanceof AudioDestinationNode) {
        const analyser = source.context.createAnalyser()
        analyser.fftSize = 256
        // A parallel analyser reads output without changing the audible connection.
        Reflect.apply(target, source, [analyser])
        analysers.push({ node: analyser, data: new Float32Array(256) })
      }
      return result
    },
  })

  const position = () => {
    const input = document.querySelector<HTMLInputElement>('input.nm-seekbar')
    return input ? Number(input.value) : Number.NaN
  }
  const audio = (): AudioReading => {
    let peak = 0
    let contextSeconds = 0
    let running = false
    for (const { node, data } of analysers) {
      node.getFloatTimeDomainData(data)
      for (const sample of data)
        peak = Math.max(peak, Math.abs(sample))
      contextSeconds = Math.max(contextSeconds, node.context.currentTime)
      running ||= node.context.state === 'running'
    }
    return { peak, contextSeconds, running }
  }

  window.orbitonePerf = {
    audio,
    position,
    seek: null,
    armSeek() {
      this.seek = null
      const input = document.querySelector<HTMLInputElement>('input.nm-seekbar')
      if (!input)
        throw new Error('SEEK_CONTROL_MISSING')
      input.addEventListener('pointerdown', () => {
        const start = performance.now()
        requestAnimationFrame(() => {
          window.orbitonePerf.seek = { latencyMs: performance.now() - start, nextFramePositionSeconds: position() }
        })
      }, { once: true })
    },
    async measure(durationMs) {
      if (!PerformanceObserver.supportedEntryTypes.includes('longtask'))
        throw new Error('LONG_TASK_METRICS_UNAVAILABLE')
      const tasks: { start: number, duration: number }[] = []
      const addTasks = (entries: PerformanceEntry[]) => {
        for (const entry of entries)
          tasks.push({ start: entry.startTime, duration: entry.duration })
      }
      const observer = new PerformanceObserver(list => addTasks(list.getEntries()))
      observer.observe({ type: 'longtask' })
      const startMs = performance.now()
      const positionStartSeconds = position()
      const intervalsMs: number[] = []
      let previousFrame: number | null = null
      let frame = 0
      let audioPeak = 0
      let audioSamples = 0
      let audioActiveSamples = 0
      let lastAudioSample = startMs - 100
      const tick = (time: number) => {
        if (previousFrame !== null)
          intervalsMs.push(time - previousFrame)
        previousFrame = time
        if (time - lastAudioSample >= 100) {
          const reading = audio()
          audioPeak = Math.max(audioPeak, reading.peak)
          audioSamples++
          if (reading.peak > 0.00001 && reading.running)
            audioActiveSamples++
          lastAudioSample = time
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
      await new Promise(resolve => setTimeout(resolve, durationMs))
      const endMs = performance.now()
      cancelAnimationFrame(frame)
      addTasks(observer.takeRecords())
      observer.disconnect()
      const boundedTasks = tasks.filter(task => task.start < endMs && task.start + task.duration > startMs)
      return {
        startMs,
        endMs,
        intervalsMs,
        longTaskCount: boundedTasks.length,
        longTaskDurationMs: boundedTasks.reduce((sum, task) => sum + Math.min(endMs, task.start + task.duration) - Math.max(startMs, task.start), 0),
        audioPeak,
        audioSamples,
        audioActiveSamples,
        positionStartSeconds,
        positionEndSeconds: position(),
      }
    },
  }
}

installProbe()
