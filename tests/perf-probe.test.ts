// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { afterEach, assert, expect, expectTypeOf, it, vi } from 'vitest'

expectTypeOf<Window['__orbitonePerf']>().toEqualTypeOf<OrbitonePerfProbe | undefined>()

afterEach(() => vi.useRealTimers())

it.each([
  { state: 'paused', nextPosition: 25 },
  { state: 'playing', nextPosition: 25.016 },
])('bounds metric windows and reads the next frame during $state seeking', async ({ state, nextPosition }) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.stubGlobal('AudioNode', class { connect() {} })
  vi.stubGlobal('AudioDestinationNode', class {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['longtask']
    observe() {}
    disconnect() {}
    takeRecords() {
      return [{ startTime: -50, duration: 70 }, { startTime: 40, duration: 90 }, { startTime: 105, duration: 60 }]
    }
  })
  document.body.innerHTML = '<input type="range" class="nm-seekbar" min="0" max="100" value="12">'
  const source = await readFile(resolve('perf/probe.ts'), 'utf8')
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  runInNewContext(script, { window, document, performance, AudioNode, AudioDestinationNode, PerformanceObserver, requestAnimationFrame, cancelAnimationFrame, setTimeout, clearTimeout })
  assert(window.__orbitonePerf)
  const pending = window.__orbitonePerf.measure(100)
  await vi.advanceTimersByTimeAsync(100)
  const metrics = await pending
  expect(metrics).toMatchObject({ startMs: 0, endMs: 100, longTaskCount: 2, longTaskDurationMs: 80, positionStartSeconds: 12, positionEndSeconds: 12 })
  expect(metrics.intervalsMs).toEqual([16, 16, 16, 16, 16])
  expect(vi.getTimerCount()).toBe(0)

  window.__orbitonePerf.armSeek()
  const input = document.querySelector<HTMLInputElement>('input')!
  if (state === 'playing')
    requestAnimationFrame(() => { input.value = '25.016' })
  input.dispatchEvent(new Event('pointerdown'))
  input.value = '25'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.advanceTimersByTimeAsync(16)
  expect(window.__orbitonePerf.seek).toEqual({ latencyMs: 16, firstFrameLatencyMs: 16, nextFramePositionSeconds: nextPosition })
  expect(window.__orbitonePerf.seekInput).toMatchObject({ requestedPositionSeconds: 25, inputCount: 1, pointerDownCount: 1 })

  window.__orbitonePerf.disarmSeek()
  window.__orbitonePerf.armSeek()
  // React can restore the old controlled value after the native input event.
  input.addEventListener('input', () => {
    input.value = '12'
  }, { once: true })
  input.dispatchEvent(new Event('pointerdown'))
  input.value = '50'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.advanceTimersByTimeAsync(16)
  expect(window.__orbitonePerf.seekInput?.requestedPositionSeconds).toBe(50)

  expect(window.__orbitonePerf.seek).toEqual({ latencyMs: null, firstFrameLatencyMs: 16, nextFramePositionSeconds: 12 })
  expect(window.__orbitonePerf.observeSeek(50, 3, 2000)).toBeNull()
  input.value = '50'
  await vi.advanceTimersByTimeAsync(32)
  expect(window.__orbitonePerf.observeSeek(50, 3, 2000)).toMatchObject({ latencyMs: 32, firstFrameLatencyMs: 16, observationElapsedMs: 48, requestedPositionSeconds: 50, observedPositionSeconds: 50 })
  input.value = '53.1'
  expect(window.__orbitonePerf.observeSeek(50, 3, 2000)).toMatchObject({ latencyMs: 32, observedPositionSeconds: 50 })
  input.value = '50'
  await vi.advanceTimersByTimeAsync(1953)
  expect(window.__orbitonePerf.observeSeek(50, 3, 2000)).toBeNull()
  window.__orbitonePerf.disarmSeek()

  window.__orbitonePerf.armSeek()
  input.dispatchEvent(new Event('pointerdown'))
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.advanceTimersByTimeAsync(16)
  expect(window.__orbitonePerf.observeSeek(50, 3, 2000)).not.toBeNull()
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(window.__orbitonePerf.observeSeek(50, 3, 2000)).toBeNull()
  window.__orbitonePerf.disarmSeek()
  input.value = '75'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(window.__orbitonePerf.seekInput?.requestedPositionSeconds).toBe(50)

  window.__orbitonePerf.armSeek()
  input.value = '50'
  input.dispatchEvent(new Event('pointerdown'))
  await vi.advanceTimersByTimeAsync(16)
  expect(window.__orbitonePerf.observeSeek(50, 3, 2000)).toBeNull()
  input.value = '12'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.value = '50'
  expect(window.__orbitonePerf.observeSeek(50, 3, 2000)).toBeNull()
  window.__orbitonePerf.disarmSeek()

  Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', { value: [] })
  await expect(window.__orbitonePerf.measure(100)).rejects.toThrow('LONG_TASK_METRICS_UNAVAILABLE')
})

it('observes nonzero output through a parallel connection without replacing the audible destination', async () => {
  const connections: object[] = []
  class ExternalAudioNode {
    context = {
      createAnalyser() {
        return {
          fftSize: 256,
          context: { currentTime: 2, state: 'running' },
          getFloatTimeDomainData(data: Float32Array) { data.fill(0.25) },
        }
      },
    }

    connect(destination: object) {
      connections.push(destination)
      return destination
    }
  }
  class ExternalDestination extends ExternalAudioNode {}
  vi.stubGlobal('AudioNode', ExternalAudioNode)
  vi.stubGlobal('AudioDestinationNode', ExternalDestination)
  const source = await readFile(resolve('perf/probe.ts'), 'utf8')
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  runInNewContext(script, { window, AudioNode, AudioDestinationNode, Float32Array })
  assert(window.__orbitonePerf)
  const destination = new ExternalDestination()
  expect(new ExternalAudioNode().connect(destination)).toBe(destination)
  expect(connections).toHaveLength(2)
  expect(connections[0]).toBe(destination)
  expect(window.__orbitonePerf.audio()).toEqual({ peak: 0.25, contextSeconds: 2, running: true })
})
