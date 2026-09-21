import type { Browser, CDPSession, Page } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import ts from 'typescript'
import { assertHealthy, cpuWindow, frameSummary, HarnessFailure, median, metric, networkAction, parseOptions } from './contracts'
import { measureSeek, SeekFailure } from './seek'

const root = fileURLToPath(new URL('..', import.meta.url))
const scenario = {
  id: 'DIG-3937-upload-01',
  viewport: { width: 1280, height: 720 },
  dpr: 1,
  camera: 'default',
  midiRoll: false,
  warmupSeconds: 10,
  playbackSeconds: 30,
  pauseSeconds: 10,
  seek: { comparisonState: 'playing', playbackFraction: 0.5, pausedFraction: 0.25 },
  runs: 3,
} as const

async function guard<T>(code: string, action: () => Promise<T>, status: 'FAIL' | 'BLOCKED' = 'FAIL', timeoutMs = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([action(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HarnessFailure(status, code)), timeoutMs)
    })])
  }
  catch (error) {
    if (error instanceof HarnessFailure)
      throw error
    throw new HarnessFailure(status, code, { cause: error })
  }
  finally {
    clearTimeout(timer)
  }
}

async function position(page: Page) {
  return page.evaluate(() => {
    if (!window.__orbitonePerf)
      throw new Error('PERFORMANCE_PROBE_UNAVAILABLE')
    return window.__orbitonePerf.position()
  })
}

async function clickTransport(page: Page, action: 'Start playback' | 'Stop playback') {
  await page.mouse.move(620, 340)
  await page.mouse.move(640, 360)
  await page.getByRole('button', { name: action, exact: true }).click()
}

async function captureWindow(page: Page, cdp: CDPSession, seconds: number) {
  const startedAt = new Date().toISOString()
  const before = await guard('CPU_METRICS_UNAVAILABLE', () => cdp.send('Performance.getMetrics'), 'BLOCKED')
  const frames = await guard('WINDOW_METRICS_UNAVAILABLE', () => page.evaluate((duration) => {
    if (!window.__orbitonePerf)
      throw new Error('PERFORMANCE_PROBE_UNAVAILABLE')
    return window.__orbitonePerf.measure(duration)
  }, seconds * 1000), 'BLOCKED', (seconds + 15) * 1000)
  const after = await guard('CPU_METRICS_UNAVAILABLE', () => cdp.send('Performance.getMetrics'), 'BLOCKED')
  const cpuStartSeconds = metric(before.metrics, 'Timestamp')
  const cpuEndSeconds = metric(after.metrics, 'Timestamp')
  const cpu = cpuWindow(before.metrics, after.metrics, cpuEndSeconds - cpuStartSeconds)
  return {
    startedAt,
    endedAt: new Date().toISOString(),
    requestedSeconds: seconds,
    cpu: { ...cpu, startCdpWallSeconds: cpuStartSeconds, endCdpWallSeconds: cpuEndSeconds, timeDomain: 'threadTicks' },
    frames: {
      ...frameSummary(frames.intervalsMs),
      startPerformanceMs: frames.startMs,
      endPerformanceMs: frames.endMs,
      elapsedMs: frames.endMs - frames.startMs,
    },
    longTasks: { count: frames.longTaskCount, durationMs: frames.longTaskDurationMs },
    audio: { peak: frames.audioPeak, activeSamples: frames.audioActiveSamples, samples: frames.audioSamples },
    positionStartSeconds: frames.positionStartSeconds,
    positionEndSeconds: frames.positionEndSeconds,
    heapBytes: metric(after.metrics, 'JSHeapUsedSize'),
  }
}

async function runMeasurement(page: Page, cdp: CDPSession, browserErrors: () => number, run: number) {
  const startedAt = new Date().toISOString()
  await page.locator('input[type="file"]').setInputFiles([])
  await guard('UPLOAD_FAILED', () => page.locator('input[type="file"]').setInputFiles(resolve(root, 'public/midi/pop-electronic/piano-man.mid')))
  await guard('UPLOAD_FAILED', () => page.waitForFunction(() => {
    const input = document.querySelector<HTMLInputElement>('input.nm-seekbar')
    return input && Number(input.max) > 200 && Number(input.value) === 0
  }))
  await guard('UPLOAD_FAILED', () => page.getByText('Piano Man', { exact: true }).first().waitFor())
  const duration = Number(await page.locator('input.nm-seekbar').getAttribute('max'))
  const uploaded = duration > 200
  const audioStart = performance.now()
  await guard('AUDIO_MISSING', () => clickTransport(page, 'Start playback'))
  await guard('AUDIO_MISSING', () => page.waitForFunction(() => {
    if (!window.__orbitonePerf)
      throw new Error('PERFORMANCE_PROBE_UNAVAILABLE')
    const audio = window.__orbitonePerf.audio()
    return audio.running && audio.contextSeconds > 0 && audio.peak > 0.00001 && window.__orbitonePerf.position() > 0.5
  }, null, { timeout: 60000, polling: 100 }), 'FAIL', 65000)
  const audioReadyMs = performance.now() - audioStart
  const warmup = await guard('WARMUP_FAILED', () => page.evaluate((duration) => {
    if (!window.__orbitonePerf)
      throw new Error('PERFORMANCE_PROBE_UNAVAILABLE')
    return window.__orbitonePerf.measure(duration)
  }, scenario.warmupSeconds * 1000))
  const warmupProgressSeconds = warmup.positionEndSeconds - warmup.positionStartSeconds
  assertHealthy({ uploaded, audioPeak: warmup.audioPeak, progressSeconds: warmupProgressSeconds, expectedProgressSeconds: 10, browserErrors: browserErrors() })
  await clickTransport(page, 'Stop playback')
  await page.locator('input.nm-seekbar').press('Home')
  await page.waitForFunction(() => window.__orbitonePerf?.position() === 0)
  await clickTransport(page, 'Start playback')
  const playback = await captureWindow(page, cdp, scenario.playbackSeconds)
  assertHealthy({ uploaded, audioPeak: playback.audio.peak, progressSeconds: playback.positionEndSeconds - playback.positionStartSeconds, expectedProgressSeconds: 30, browserErrors: browserErrors() })
  await clickTransport(page, 'Stop playback')
  const paused = await captureWindow(page, cdp, scenario.pauseSeconds)
  if (Math.abs(paused.positionEndSeconds - paused.positionStartSeconds) > 0.1)
    throw new HarnessFailure('FAIL', 'PAUSE_PROGRESS_FAILED')
  const pausedSeek = await measureSeek(page, duration, 'paused', scenario.seek.pausedFraction)
  const resumePositionSeconds = await position(page)
  await guard('AUDIO_MISSING', () => clickTransport(page, 'Start playback'))
  await guard('PLAYBACK_PROGRESS_FAILED', () => page.waitForFunction((start) => {
    return window.__orbitonePerf !== undefined && window.__orbitonePerf.position() > start + 0.25
  }, resumePositionSeconds))
  const playbackSeek = await measureSeek(page, duration, 'playing', scenario.seek.playbackFraction)
  await clickTransport(page, 'Stop playback')
  assertHealthy({ uploaded, audioPeak: playback.audio.peak, progressSeconds: playback.positionEndSeconds - playback.positionStartSeconds, expectedProgressSeconds: 30, browserErrors: browserErrors() })
  return { run, startedAt, endedAt: new Date().toISOString(), audioReadyMs, durationSeconds: duration, warmupProgressSeconds, playback, paused, playbackSeek, pausedSeek, browserErrors: browserErrors() }
}

type RunResult = Awaited<ReturnType<typeof runMeasurement>>

function summarize(runs: RunResult[]) {
  return {
    playbackCpuFraction: median(runs.map(run => run.playback.cpu.cpuFraction)),
    pausedCpuFraction: median(runs.map(run => run.paused.cpu.cpuFraction)),
    playbackRafP50Ms: median(runs.map(run => run.playback.frames.p50Ms)),
    playbackRafP95Ms: median(runs.map(run => run.playback.frames.p95Ms)),
    playbackIntervalsOver50Ms: median(runs.map(run => run.playback.frames.over50Ms)),
    playbackLongTaskCount: median(runs.map(run => run.playback.longTasks.count)),
    playbackLongTaskDurationMs: median(runs.map(run => run.playback.longTasks.durationMs)),
    pausedRafP50Ms: median(runs.map(run => run.paused.frames.p50Ms)),
    pausedRafP95Ms: median(runs.map(run => run.paused.frames.p95Ms)),
    pausedIntervalsOver50Ms: median(runs.map(run => run.paused.frames.over50Ms)),
    pausedLongTaskCount: median(runs.map(run => run.paused.longTasks.count)),
    pausedLongTaskDurationMs: median(runs.map(run => run.paused.longTasks.durationMs)),
    playbackSeekLatencyMs: median(runs.map(run => run.playbackSeek.latencyMs)),
    playbackObservedSeekPositionSeconds: median(runs.map(run => run.playbackSeek.observedPositionSeconds)),
    pausedSeekLatencyMs: median(runs.map(run => run.pausedSeek.latencyMs)),
    pausedObservedSeekPositionSeconds: median(runs.map(run => run.pausedSeek.observedPositionSeconds)),
    heapAfterPauseBytes: median(runs.map(run => run.paused.heapBytes)),
    audioReadyMs: median(runs.map(run => run.audioReadyMs)),
    playbackProgressSeconds: median(runs.map(run => run.playback.positionEndSeconds - run.playback.positionStartSeconds)),
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const output = resolve(root, options.outputDir)
  await mkdir(output, { recursive: true })
  const startedAt = new Date().toISOString()
  const file = resolve(output, `${options.label}-${startedAt.replaceAll(':', '-')}.json`)
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const runs: RunResult[] = []
  let browser: Browser | undefined
  let browserVersion: string | null = null
  let rendering: { renderer: string, mode: string } | null = null
  let stage = 'build-identity'
  let buildId: string | null = null
  let browserErrors = 0
  const analyticsIntercepts = { scripts: 0, events: 0 }
  let status: 'PASS' | 'FAIL' | 'BLOCKED' = 'FAIL'
  let failureCode: string | null = null
  let failedSeek: SeekFailure['diagnostics'] | null = null
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'app', 'components', 'hooks', 'lib', 'package.json', 'pnpm-lock.yaml', 'next.config.ts', 'perf', 'ecosystem.config.js'], { cwd: root, encoding: 'utf8' })
    if (dirty.trim())
      throw new HarnessFailure('BLOCKED', 'UNCOMMITTED_BUILD_INPUTS')
    const build: { sha: string, buildId: string, mode: string } = JSON.parse(await guard('PRODUCTION_BUILD_UNAVAILABLE', () => readFile(resolve(root, '.next/orbitone-performance.json'), 'utf8'), 'BLOCKED'))
    buildId = (await readFile(resolve(root, '.next/BUILD_ID'), 'utf8')).trim()
    if (build.sha !== sha || build.buildId !== buildId || build.mode !== 'production')
      throw new HarnessFailure('BLOCKED', 'STALE_PRODUCTION_BUILD')
    stage = 'browser-launch'
    browser = await guard('SYSTEM_CHROME_UNAVAILABLE', () => chromium.launch({ executablePath: options.chrome, headless: false }), 'BLOCKED')
    browserVersion = browser.version()
    const context = await browser.newContext({ viewport: scenario.viewport, deviceScaleFactor: 1, locale: 'en-US', serviceWorkers: 'block' })
    const origin = new URL(options.baseUrl).origin
    await context.route('**/*', async (route) => {
      const request = route.request()
      const action = networkAction(request.url(), request.method(), origin)
      if (action === 'analytics-script' || action === 'analytics-event') {
        if (action === 'analytics-script')
          analyticsIntercepts.scripts++
        else
          analyticsIntercepts.events++
        await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
        return
      }
      if (action === 'allow') {
        await route.continue()
        return
      }
      browserErrors++
      await route.abort()
    })
    const probeSource = await readFile(resolve(root, 'perf/probe.ts'), 'utf8')
    const probeScript = ts.transpileModule(probeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
    await context.addInitScript({ content: probeScript })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on('pageerror', () => {
      browserErrors++
    })
    page.on('console', (message) => {
      if (message.type() === 'error')
        browserErrors++
    })
    page.on('requestfailed', () => {
      browserErrors++
    })
    page.on('response', (response) => {
      if (response.status() >= 400)
        browserErrors++
    })
    page.on('dialog', async (dialog) => {
      browserErrors++
      await dialog.dismiss()
    })
    const cdp = await context.newCDPSession(page)
    stage = 'cpu-enable'
    await guard('CPU_THREAD_TICKS_UNAVAILABLE', () => cdp.send('Performance.enable', { timeDomain: 'threadTicks' }), 'BLOCKED')
    stage = 'production-route'
    const manifestPath = `/_next/static/${buildId}/_buildManifest.js`
    await guard('PRODUCTION_ROUTE_UNAVAILABLE', () => page.goto(options.baseUrl, { waitUntil: 'domcontentloaded' }), 'BLOCKED')
    const remoteManifest = await guard('PRODUCTION_ROUTE_MISMATCH', () => page.evaluate(async (path) => {
      const response = await fetch(path)
      return { ok: response.ok, content: await response.text() }
    }, manifestPath), 'BLOCKED')
    if (!remoteManifest.ok)
      throw new HarnessFailure('BLOCKED', 'PRODUCTION_ROUTE_MISMATCH')
    const localManifest = await readFile(resolve(root, `.next${manifestPath.replace('/_next', '')}`))
    if (createHash('sha256').update(localManifest).digest('hex') !== createHash('sha256').update(remoteManifest.content).digest('hex'))
      throw new HarnessFailure('BLOCKED', 'PRODUCTION_ROUTE_MISMATCH')
    await page.getByRole('button', { name: 'Start playback', exact: true }).waitFor()
    await page.waitForFunction(() => Boolean(document.querySelector('canvas')))
    rendering = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
      if (!gl || !('getParameter' in gl))
        return { renderer: 'unavailable', mode: 'unavailable' }
      const extension = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = String(gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
      return { renderer, mode: /swiftshader|llvmpipe|software/i.test(renderer) ? 'software' : extension ? 'hardware' : 'unavailable' }
    })
    if (rendering.renderer === 'unavailable')
      throw new HarnessFailure('BLOCKED', 'WEBGL_UNAVAILABLE')
    for (let run = 1; run <= options.runs; run++) {
      stage = `run-${run}`
      runs.push(await runMeasurement(page, cdp, () => browserErrors, run))
      console.log(`Completed measurement ${run}/${options.runs}.`)
    }
    status = 'PASS'
  }
  catch (error) {
    status = error instanceof HarnessFailure ? error.status : 'FAIL'
    failureCode = error instanceof HarnessFailure ? error.code : 'UNEXPECTED_FAILURE'
    failedSeek = error instanceof SeekFailure ? error.diagnostics : null
  }
  finally {
    await browser?.close().catch(() => {
      status = 'FAIL'
      failureCode = 'BROWSER_CLEANUP_FAILED'
    })
    if (browserErrors && status === 'PASS') {
      status = 'FAIL'
      failureCode = 'BROWSER_ERROR'
    }
    const report = {
      status,
      failureCode,
      failedSeek,
      stage,
      label: options.label,
      sha,
      buildId,
      buildMode: 'production',
      browserVersion,
      rendering,
      scenario,
      startedAt,
      endedAt: new Date().toISOString(),
      browserErrors,
      analyticsIntercepts,
      runs,
      medians: status === 'PASS' && runs.length === 3 ? summarize(runs) : null,
      limits: ['Main renderer thread only; no GPU or device CPU claim.', 'Heap is one point after pause; no leak claim.', 'Audio output probes do not prove the absence of audible gaps.', 'Independent browser QA remains required.'],
    }
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`${status}: ${failureCode ?? 'THREE_RUNS_CAPTURED'}. Report: ${file}`)
    if (status !== 'PASS')
      process.exitCode = status === 'BLOCKED' ? 2 : 1
  }
}

void main().catch((error) => {
  console.error(error instanceof HarnessFailure ? `${error.status}: ${error.code}` : 'FAIL: HARNESS_SETUP_FAILED')
  process.exitCode = 1
})
