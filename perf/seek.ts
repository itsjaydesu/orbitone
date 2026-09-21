import type { Page } from 'playwright-core'
import { HarnessFailure } from './contracts'

interface SeekDiagnostics extends Partial<OrbitonePerfSeekObservation> {
  state: 'playing' | 'paused'
  requestedFraction: number
  expectedPositionSeconds: number
  toleranceSeconds: number
  completionTimeoutMs: number
  controlBox: { x: number, y: number, width: number, height: number } | null
}

export class SeekFailure extends HarnessFailure {
  constructor(reason: string, public diagnostics: SeekDiagnostics, options?: ErrorOptions) {
    super('FAIL', `${diagnostics.state === 'playing' ? 'PLAYBACK' : 'PAUSED'}_SEEK_${reason}`, options)
  }
}

export async function measureSeek(page: Page, duration: number, state: 'playing' | 'paused', requestedFraction: number) {
  const diagnostics: SeekDiagnostics = {
    state,
    requestedFraction,
    expectedPositionSeconds: duration * requestedFraction,
    toleranceSeconds: duration * 0.03,
    completionTimeoutMs: 2000,
    controlBox: null,
  }
  const transportButton = page.getByRole('button', { name: state === 'playing' ? 'Stop playback' : 'Start playback', exact: true })
  const bar = page.locator('input.nm-seekbar')
  let reason = 'STATE_FAILED'
  let armed = false
  try {
    await page.mouse.move(620, 340)
    await page.mouse.move(640, 360)
    await transportButton.waitFor({ state: 'visible', timeout: 5000 })
    reason = 'ACTION_FAILED'
    // Trial waits for stable geometry and pointer actionability without sending input.
    await bar.click({ trial: true, timeout: 5000 })
    const box = await bar.boundingBox()
    if (!box)
      throw new SeekFailure('CONTROL_MISSING', diagnostics)
    diagnostics.controlBox = box
    await page.evaluate(({ toleranceSeconds, completionTimeoutMs }) => {
      if (!window.__orbitonePerf)
        throw new Error('PERFORMANCE_PROBE_UNAVAILABLE')
      window.__orbitonePerf.armSeek(toleranceSeconds, completionTimeoutMs)
    }, diagnostics)
    armed = true
    await bar.click({ position: { x: box.width * requestedFraction, y: box.height / 2 }, timeout: 5000 })
    reason = 'POSITION_FAILED'
    const handle = await page.waitForFunction(({ expectedPositionSeconds, toleranceSeconds, completionTimeoutMs }) => {
      if (!window.__orbitonePerf)
        throw new Error('PERFORMANCE_PROBE_UNAVAILABLE')
      return window.__orbitonePerf.observeSeek(expectedPositionSeconds, toleranceSeconds, completionTimeoutMs)
    }, diagnostics, { timeout: diagnostics.completionTimeoutMs, polling: 'raf' })
    const observation = await handle.jsonValue()
    await handle.dispose()
    if (!observation || observation.latencyMs === null || observation.observedPositionSeconds === null)
      throw new SeekFailure('POSITION_FAILED', diagnostics)
    Object.assign(diagnostics, observation)
    reason = 'STATE_FAILED'
    await transportButton.waitFor({ state: 'visible', timeout: 5000 })
    return { ...diagnostics, ...observation, latencyMs: observation.latencyMs, observedPositionSeconds: observation.observedPositionSeconds }
  }
  catch (error) {
    if (armed) {
      const snapshot = await page.evaluate(() => window.__orbitonePerf?.seekSnapshot()).catch(() => undefined)
      if (snapshot) {
        Object.assign(diagnostics, snapshot)
        if (reason === 'POSITION_FAILED') {
          if (snapshot.pointerDownCount === 0)
            reason = 'POINTER_MISSING'
          else if (snapshot.inputCount === 0)
            reason = 'INPUT_MISSING'
          else if (snapshot.pointerDownCount !== 1 || snapshot.inputCount !== 1)
            reason = 'INPUT_REPEATED'
          else if (snapshot.firstFrameLatencyMs === null)
            reason = 'FRAME_MISSING'
        }
      }
    }
    if (error instanceof SeekFailure)
      throw error
    throw new SeekFailure(reason, diagnostics, { cause: error })
  }
  finally {
    if (armed)
      await page.evaluate(() => window.__orbitonePerf?.disarmSeek()).catch(() => {})
  }
}
