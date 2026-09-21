// @vitest-environment jsdom
import type { Page } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { afterEach, assert, expect, it, vi } from 'vitest'
import { measureSeek, SeekFailure } from '../perf/seek'

afterEach(() => {
  window.__orbitonePerf?.disarmSeek()
  vi.useRealTimers()
})

async function boundary(reachMs: number | null, repeatedEvent?: 'pointerdown' | 'input') {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.stubGlobal('AudioNode', class { connect() {} })
  vi.stubGlobal('AudioDestinationNode', class {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  document.body.innerHTML = '<input type="range" class="nm-seekbar" min="0" max="100" value="12">'
  const source = await readFile(resolve('perf/probe.ts'), 'utf8')
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  runInNewContext(script, { window, document, performance, AudioNode, AudioDestinationNode, requestAnimationFrame, cancelAnimationFrame })
  assert(window.__orbitonePerf)
  const input = document.querySelector<HTMLInputElement>('input')!
  const click = vi.fn(async (options?: { trial?: boolean }) => {
    if (options?.trial)
      return
    input.dispatchEvent(new Event('pointerdown'))
    input.value = '50'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    // The controlled input can restore its old value until the application commits the seek.
    input.value = '12'
    if (reachMs !== null)
      setTimeout(() => { input.value = '50' }, reachMs)
    if (repeatedEvent)
      input.dispatchEvent(new Event(repeatedEvent, { bubbles: true }))
  })
  const page = {
    mouse: { move: vi.fn() },
    getByRole: vi.fn(() => ({ waitFor: vi.fn() })),
    locator: vi.fn(() => ({ click, boundingBox: async () => ({ x: 0, y: 0, width: 100, height: 10 }) })),
    evaluate: vi.fn(async <T, A>(callback: (argument: A) => T, argument: A) => callback(argument)),
    waitForFunction: vi.fn(async <A>(callback: (argument: A) => OrbitonePerfSeekObservation | null, argument: A) => {
      for (let frame = 0; frame < 126; frame++) {
        await vi.advanceTimersByTimeAsync(16)
        const observation = callback(argument)
        if (observation)
          return { jsonValue: async () => observation, dispose: vi.fn() }
      }
      throw new Error('Private timeout: confidential-score.mid')
    }),
  } as object as Page
  return { page, click }
}

it.each(['playing', 'paused'] as const)('passes prompt %s target reach with separate first-frame diagnostics', async (state) => {
  const { page, click } = await boundary(0)
  const result = await measureSeek(page, 100, state, 0.5)
  expect(result).toMatchObject({ latencyMs: 16, firstFrameLatencyMs: 16, nextFramePositionSeconds: 50, observedPositionSeconds: 50 })
  // A 16 ms baseline allows at most 32.7 ms under the frozen C1 allowance.
  expect(result.latencyMs).toBeLessThanOrEqual(32.7)
  expect(click.mock.calls.filter(([options]) => !options?.trial)).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['playing', 'paused'] as const)('fails the C1 allowance for delayed %s target reach despite a prompt first frame', async (state) => {
  const { page } = await boundary(60)
  const result = await measureSeek(page, 100, state, 0.5)
  expect(result.latencyMs).toBeGreaterThan(32.7)
  expect(result).toMatchObject({ latencyMs: 64, firstFrameLatencyMs: 16, nextFramePositionSeconds: 12, observedPositionSeconds: 50 })
  expect(vi.getTimerCount()).toBe(0)
})

it.each([null, 2001])('fails the run when target reach at %s misses the observation timeout', async (reachMs) => {
  const { page } = await boundary(reachMs)
  const failure = await measureSeek(page, 100, 'playing', 0.5).catch(error => error as SeekFailure)
  expect(failure).toBeInstanceOf(SeekFailure)
  expect(failure).toMatchObject({
    status: 'FAIL',
    code: 'PLAYBACK_SEEK_POSITION_FAILED',
    diagnostics: { latencyMs: null, firstFrameLatencyMs: 16, nextFramePositionSeconds: 12, completionTimeoutMs: 2000 },
  })
  expect(JSON.stringify(failure)).not.toContain('confidential-score.mid')
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['pointerdown', 'input'] as const)('fails the run after repeated %s events', async (event) => {
  const { page, click } = await boundary(0, event)
  await expect(measureSeek(page, 100, 'playing', 0.5)).rejects.toMatchObject({ status: 'FAIL', code: 'PLAYBACK_SEEK_INPUT_REPEATED' })
  expect(click.mock.calls.filter(([options]) => !options?.trial)).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0)
})
