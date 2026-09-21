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
  const audio = (): OrbitonePerfAudioReading => {
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

  let removeSeekListeners = () => {}
  const emptySeekInput = (): OrbitonePerfSeekInput => ({ pointerDownMs: null, pointerDownCount: 0, inputCount: 0, requestedPositionSeconds: null, pointerX: null, pointerY: null, controlX: null, controlY: null, controlWidth: null, controlHeight: null })
  const finite = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? value : null
  const probe: OrbitonePerfProbe = {
    audio,
    position,
    seek: null,
    seekInput: null,
    armSeek() {
      this.disarmSeek()
      this.seek = null
      const attempt = emptySeekInput()
      this.seekInput = attempt
      const input = document.querySelector<HTMLInputElement>('input.nm-seekbar')
      if (!input)
        throw new Error('SEEK_CONTROL_MISSING')
      let frame = 0
      const onPointerDown = (event: PointerEvent) => {
        attempt.pointerDownCount++
        if (attempt.pointerDownCount !== 1)
          return
        const start = performance.now()
        attempt.pointerDownMs = start
        const box = input.getBoundingClientRect()
        attempt.pointerX = finite(event.clientX)
        attempt.pointerY = finite(event.clientY)
        attempt.controlX = box.x
        attempt.controlY = box.y
        attempt.controlWidth = box.width
        attempt.controlHeight = box.height
        frame = requestAnimationFrame(() => {
          probe.seek = { latencyMs: performance.now() - start, nextFramePositionSeconds: position() }
        })
      }
      const onInput = (event: Event) => {
        if (event.target !== input || attempt.pointerDownMs === null)
          return
        attempt.inputCount++
        if (attempt.inputCount === 1)
          attempt.requestedPositionSeconds = finite(Number(input.value))
      }
      input.addEventListener('pointerdown', onPointerDown)
      // Capture before delegated application handlers can restore the controlled value.
      document.addEventListener('input', onInput, { capture: true })
      removeSeekListeners = () => {
        input.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('input', onInput, { capture: true })
        cancelAnimationFrame(frame)
      }
    },
    disarmSeek() {
      removeSeekListeners()
      removeSeekListeners = () => {}
    },
    seekSnapshot() {
      const input = this.seekInput ?? emptySeekInput()
      return {
        ...input,
        latencyMs: finite(this.seek?.latencyMs),
        nextFramePositionSeconds: finite(this.seek?.nextFramePositionSeconds),
        observedPositionSeconds: finite(position()),
        observationElapsedMs: input.pointerDownMs === null ? null : performance.now() - input.pointerDownMs,
      }
    },
    observeSeek(expectedPositionSeconds, toleranceSeconds, timeoutMs) {
      const snapshot = this.seekSnapshot()
      const { requestedPositionSeconds, observedPositionSeconds, observationElapsedMs } = snapshot
      if (snapshot.pointerDownCount !== 1 || snapshot.inputCount !== 1 || snapshot.latencyMs === null
        || requestedPositionSeconds === null || observedPositionSeconds === null || observationElapsedMs === null
        || observationElapsedMs > timeoutMs
        || Math.abs(requestedPositionSeconds - expectedPositionSeconds) > toleranceSeconds
        || Math.abs(observedPositionSeconds - expectedPositionSeconds) > toleranceSeconds
        || Math.abs(observedPositionSeconds - requestedPositionSeconds) > toleranceSeconds) {
        return null
      }
      return snapshot
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
  window.__orbitonePerf = probe
}

installProbe()
