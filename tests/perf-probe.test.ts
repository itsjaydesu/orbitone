// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.useRealTimers())

it('runs the emitted browser script without compiler helpers and bounds frame and long-task windows', async () => {
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
  const pending = window.orbitonePerf.measure(100)
  await vi.advanceTimersByTimeAsync(100)
  const metrics = await pending
  expect(metrics).toMatchObject({ startMs: 0, endMs: 100, longTaskCount: 2, longTaskDurationMs: 80, positionStartSeconds: 12, positionEndSeconds: 12 })
  expect(metrics.intervalsMs).toEqual([16, 16, 16, 16, 16])
  expect(vi.getTimerCount()).toBe(0)

  window.orbitonePerf.armSeek()
  const input = document.querySelector<HTMLInputElement>('input')!
  input.dispatchEvent(new Event('pointerdown'))
  input.value = '25'
  await vi.advanceTimersByTimeAsync(16)
  expect(window.orbitonePerf.seek).toEqual({ latencyMs: 16, nextFramePositionSeconds: 25 })

  Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', { value: [] })
  await expect(window.orbitonePerf.measure(100)).rejects.toThrow('LONG_TASK_METRICS_UNAVAILABLE')
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
  const destination = new ExternalDestination()
  expect(new ExternalAudioNode().connect(destination)).toBe(destination)
  expect(connections).toHaveLength(2)
  expect(connections[0]).toBe(destination)
  expect(window.orbitonePerf.audio()).toEqual({ peak: 0.25, contextSeconds: 2, running: true })
})
