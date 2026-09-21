import { describe, expect, it } from 'vitest'
import { assertHealthy, cpuWindow, frameSummary, HarnessFailure, median, networkAction, parseOptions } from '../perf/contracts'

describe('measurement contract', () => {
  it('requires the resolved URL, a label, and exactly three runs', () => {
    expect(() => parseOptions([])).toThrow(HarnessFailure)
    expect(() => parseOptions(['--base-url', 'https://test.asuka', '--label', 'baseline', '--runs', '2'])).toThrow(HarnessFailure)
    expect(parseOptions(['--', '--base-url', 'https://test.asuka', '--label', 'baseline', '--runs', '3']).runs).toBe(3)
    expect(() => parseOptions(['--base-url', 'https://user:secret@test.asuka', '--label', 'baseline', '--runs', '3'])).toThrow(HarnessFailure)
  })

  it('uses thread CPU seconds divided by elapsed wall seconds', () => {
    const result = cpuWindow(
      [{ name: 'TaskDuration', value: 2 }, { name: 'ThreadTime', value: 3 }],
      [{ name: 'TaskDuration', value: 5 }, { name: 'ThreadTime', value: 7 }],
      30,
    )
    expect(result).toEqual({ taskCpuSeconds: 3, threadCpuSeconds: 4, wallSeconds: 30, cpuFraction: 0.1 })
  })

  it('blocks absent, frozen, or invalid CPU metrics without a substitute', () => {
    const start = [{ name: 'TaskDuration', value: 2 }, { name: 'ThreadTime', value: 3 }]
    for (const end of [[], start, [{ name: 'TaskDuration', value: Number.NaN }, { name: 'ThreadTime', value: 4 }]]) {
      expect(() => cpuWindow(start, end, 30)).toThrow(expect.objectContaining({ status: 'BLOCKED', code: 'CPU_METRICS_UNAVAILABLE' }))
    }
    expect(() => cpuWindow(start, start, 0)).toThrow(HarnessFailure)
  })

  it('fails when upload, audio, progress, or browser health is missing', () => {
    const ready = { uploaded: true, audioPeak: 0.2, progressSeconds: 5, expectedProgressSeconds: 5, browserErrors: 0 }
    expect(() => assertHealthy(ready)).not.toThrow()
    for (const patch of [{ uploaded: false }, { audioPeak: 0 }, { progressSeconds: 0 }, { browserErrors: 1 }]) {
      expect(() => assertHealthy({ ...ready, ...patch })).toThrow(HarnessFailure)
    }
  })

  it('reports frame percentiles and counts slow intervals with explicit units', () => {
    expect(frameSummary([10, 20, 30, 40, 60])).toEqual({ p50Ms: 30, p95Ms: 60, over50Ms: 1, count: 5 })
    expect(() => frameSummary([])).toThrow(HarnessFailure)
    expect(median([30, 10, 20])).toBe(20)
  })

  it('intercepts analytics while keeping real samples and app requests visible', () => {
    const origin = 'https://test.asuka'
    expect(networkAction(`${origin}/_vercel/insights/script.js`, 'GET', origin)).toBe('analytics-script')
    expect(networkAction(`${origin}/_vercel/insights/view`, 'POST', origin)).toBe('analytics-event')
    expect(networkAction(`${origin}/_next/static/chunk.js`, 'GET', origin)).toBe('allow')
    expect(networkAction('https://tonejs.github.io/audio/salamander/C4.mp3', 'GET', origin)).toBe('allow')
    expect(networkAction('https://third-party.test/collect', 'POST', origin)).toBe('block')
    expect(networkAction('https://third-party.test/_vercel/insights/script.js', 'GET', origin)).toBe('block')
    expect(networkAction(`${origin}/api/unrelated`, 'POST', origin)).toBe('block')
  })
})
