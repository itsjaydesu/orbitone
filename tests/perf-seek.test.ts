import type { Locator, Page } from 'playwright-core'
import { expect, it, vi } from 'vitest'
import { measureSeek, SeekFailure } from '../perf/seek'

function boundary() {
  const bar = {
    click: vi.fn<Locator['click']>().mockResolvedValue(),
    boundingBox: vi.fn<Locator['boundingBox']>().mockResolvedValue({ x: 368, y: 578, width: 544, height: 6 }),
  } as Pick<Locator, 'click' | 'boundingBox'>
  const transport = { waitFor: vi.fn<Locator['waitFor']>().mockResolvedValue() }
  const mouse: Partial<Page['mouse']> = { move: vi.fn().mockResolvedValue(undefined) }
  const page: Partial<Page> = {
    mouse: mouse as Page['mouse'],
    locator: vi.fn().mockReturnValue(bar),
    getByRole: vi.fn().mockReturnValue(transport),
    evaluate: vi.fn<Page['evaluate']>().mockResolvedValue(undefined),
    waitForFunction: vi.fn<Page['waitForFunction']>(),
  }
  return { page: page as Page, bar, transport }
}

it.each(['playing', 'paused'] as const)('reports a %s actionability failure without sending another input', async (state) => {
  const { page, bar } = boundary()
  vi.mocked(bar.click).mockRejectedValue(new Error('Private DOM: confidential-score.mid'))
  const failure = await measureSeek(page, 350, state, 0.5).catch(error => error as SeekFailure)
  expect(failure).toBeInstanceOf(SeekFailure)
  expect(failure).toMatchObject({ code: `${state === 'playing' ? 'PLAYBACK' : 'PAUSED'}_SEEK_ACTION_FAILED`, diagnostics: { state, requestedFraction: 0.5 } })
  expect(bar.click).toHaveBeenCalledOnce()
  expect(bar.click).toHaveBeenCalledWith({ trial: true, timeout: 5000 })
  expect(JSON.stringify(failure)).not.toContain('confidential-score.mid')
})

it.each(['playing', 'paused'] as const)('retains numeric evidence when %s completion times out', async (state) => {
  const { page, bar } = boundary()
  vi.mocked(page.waitForFunction).mockRejectedValue(new Error('Private timeout detail'))
  vi.mocked(page.evaluate).mockResolvedValue({
    requestedPositionSeconds: 175,
    observedPositionSeconds: 87,
    nextFramePositionSeconds: 87,
    latencyMs: null,
    firstFrameLatencyMs: 7,
    observationElapsedMs: 2001,
    pointerDownCount: 1,
    inputCount: 1,
  })
  const failure = await measureSeek(page, 350, state, 0.5).catch(error => error as SeekFailure)
  expect(failure).toMatchObject({
    code: `${state === 'playing' ? 'PLAYBACK' : 'PAUSED'}_SEEK_POSITION_FAILED`,
    diagnostics: { state, requestedPositionSeconds: 175, observedPositionSeconds: 87, latencyMs: null, firstFrameLatencyMs: 7, completionTimeoutMs: 2000 },
  })
  expect(bar.click).toHaveBeenCalledTimes(2)
  expect(bar.click).toHaveBeenLastCalledWith({ position: { x: 272, y: 3 }, timeout: 5000 })
  expect(page.waitForFunction).toHaveBeenCalledOnce()
  expect(JSON.stringify(failure)).not.toContain('Private timeout detail')
})

it('reports target-reach latency separately from the first-frame diagnostic', async () => {
  const { page, bar } = boundary()
  const observation = { requestedPositionSeconds: 175, observedPositionSeconds: 175.1, nextFramePositionSeconds: 87, latencyMs: 32, firstFrameLatencyMs: 7, observationElapsedMs: 48, pointerDownCount: 1, inputCount: 1 }
  vi.mocked(page.waitForFunction).mockResolvedValue({ jsonValue: async () => observation, dispose: vi.fn() } as Awaited<ReturnType<Page['waitForFunction']>>)
  const result = await measureSeek(page, 350, 'playing', 0.5)
  expect(result).toMatchObject({ latencyMs: 32, firstFrameLatencyMs: 7, nextFramePositionSeconds: 87, observedPositionSeconds: 175.1, observationElapsedMs: 48 })
  expect(bar.click).toHaveBeenCalledTimes(2)
  expect(vi.mocked(bar.click).mock.calls.filter(([options]) => !options?.trial)).toHaveLength(1)
})
