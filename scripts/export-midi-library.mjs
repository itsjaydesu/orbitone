import { spawnSync } from 'node:child_process'
import {
  access,
  constants,
  mkdir,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import process from 'node:process'
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_BASE_URL = process.env.ORBITONE_EXPORT_BASE_URL ?? 'http://127.0.0.1:3000'
const DEFAULT_MIDI_ROOT = resolve(REPO_ROOT, 'public/midi')
const DEFAULT_OUTPUT_ROOT = resolve(REPO_ROOT, 'video-output')
const DEFAULT_PROGRESS_POLL_MS = 30_000
const DEFAULT_STALL_TIMEOUT_MS = 20 * 60_000
const DEFAULT_WAIT_TIMEOUT_MS = 60_000

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    chromePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE ?? null,
    failFast: false,
    force: false,
    headless: false,
    limit: null,
    match: null,
    midiRoot: DEFAULT_MIDI_ROOT,
    outputDir: DEFAULT_OUTPUT_ROOT,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--') {
      continue
    }

    if (arg === '--base-url') {
      options.baseUrl = argv[index + 1] ?? options.baseUrl
      index += 1
      continue
    }

    if (arg === '--chrome') {
      options.chromePath = argv[index + 1] ?? options.chromePath
      index += 1
      continue
    }

    if (arg === '--midi-root') {
      options.midiRoot = resolve(argv[index + 1] ?? options.midiRoot)
      index += 1
      continue
    }

    if (arg === '--output-dir') {
      options.outputDir = resolve(argv[index + 1] ?? options.outputDir)
      index += 1
      continue
    }

    if (arg === '--match') {
      options.match = (argv[index + 1] ?? '').trim() || null
      index += 1
      continue
    }

    if (arg === '--limit') {
      const value = Number(argv[index + 1] ?? '')
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('--limit must be a positive integer.')
      }

      options.limit = value
      index += 1
      continue
    }

    if (arg === '--headless') {
      options.headless = true
      continue
    }

    if (arg === '--force') {
      options.force = true
      continue
    }

    if (arg === '--fail-fast') {
      options.failFast = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK)
    return true
  }
  catch {
    return false
  }
}

async function collectMidiFiles(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = join(rootDirectory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await collectMidiFiles(entryPath))
      continue
    }

    if (!/\.(mid|midi)$/i.test(entry.name)) {
      continue
    }

    files.push(entryPath)
  }

  return files.sort((left, right) => left.localeCompare(right))
}

function formatLoadedTitle(fileName) {
  const stem = fileName.replace(/\.(mid|midi)$/i, '').trim()

  if (stem.length === 0) {
    return 'Untitled MIDI'
  }

  if (/[A-Z]/.test(stem) || stem.includes(' ')) {
    return stem.replace(/_/g, ' ')
  }

  return stem
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds
      .toString()
      .padStart(2, '0')}s`
  }

  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function formatBytes(byteCount) {
  if (byteCount < 1024) {
    return `${byteCount} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = byteCount
  let unitIndex = -1

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function resolveOutputPath(outputRoot, midiRoot, midiPath) {
  const relativePath = relative(midiRoot, midiPath)
  return join(outputRoot, relativePath.replace(/\.(mid|midi)$/i, '.mp4'))
}

function resolveChromeExecutable(explicitPath) {
  if (explicitPath) {
    return resolve(explicitPath)
  }

  const commandCandidates = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ]

  for (const command of commandCandidates) {
    const result = spawnSync('which', [command], { encoding: 'utf8' })
    if (result.status === 0) {
      const match = result.stdout.trim().split('\n')[0]
      if (match) {
        return match
      }
    }
  }

  const fileCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]

  for (const candidate of fileCandidates) {
    const result = spawnSync('test', ['-x', candidate])
    if (result.status === 0) {
      return candidate
    }
  }

  throw new Error(
    'Unable to locate a Chrome/Chromium executable. Pass --chrome or set PLAYWRIGHT_CHROME_EXECUTABLE.',
  )
}

async function ensureBaseUrlAvailable(baseUrl) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch(baseUrl, {
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Received ${response.status} from ${baseUrl}.`)
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not reach ${baseUrl}: ${message}`)
  }
  finally {
    clearTimeout(timeoutId)
  }
}

function buildAutomationUrl(baseUrl, token) {
  const url = new URL(baseUrl)
  url.searchParams.set('automation', '1')
  url.searchParams.set('batch', token)
  return url.toString()
}

async function delay(ms) {
  await new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

async function readAutomationState(page) {
  return page.evaluate(() => window.__orbitoneAutomation?.getState() ?? null)
}

async function waitForAutomationReady(page) {
  await page.waitForFunction(() => Boolean(window.__orbitoneAutomation), null, {
    timeout: DEFAULT_WAIT_TIMEOUT_MS,
  })
}

async function waitForMidiLoaded(page, expectedTitle) {
  await page.waitForFunction(title => {
    const state = window.__orbitoneAutomation?.getState()

    return Boolean(
      state
      && state.currentTrackTitle === title
      && state.canExport
      && !state.isAudioLoading,
    )
  }, expectedTitle, { timeout: 120_000 })
}

async function waitForExportOptions(page) {
  await page.waitForFunction(() => {
    const state = window.__orbitoneAutomation?.getState()

    return Boolean(
      state
      && state.exportFormat === 'mp4'
      && state.exportCameraMode === 'cycle',
    )
  }, null, { timeout: DEFAULT_WAIT_TIMEOUT_MS })
}

async function waitForDownload(page, downloadPromise, relativeMidiPath) {
  let completed = false
  let resolvedDownload = null
  let resolvedError = null
  let lastSnapshot = null
  let lastChangeAt = Date.now()

  downloadPromise
    .then((download) => {
      completed = true
      resolvedDownload = download
    })
    .catch((error) => {
      completed = true
      resolvedError = error
    })

  while (!completed) {
    await delay(DEFAULT_PROGRESS_POLL_MS)

    if (completed) {
      break
    }

    const state = await readAutomationState(page).catch(() => null)
    if (!state) {
      continue
    }

    const percent = Math.round(state.exportProgress * 100)
    const snapshot = `${state.exportPhase}:${percent}`

    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot
      lastChangeAt = Date.now()
      process.stdout.write(
        `[progress] ${relativeMidiPath} ${state.exportPhase} ${percent}%\n`,
      )
    }
    else if (Date.now() - lastChangeAt >= DEFAULT_STALL_TIMEOUT_MS) {
      throw new Error(
        `Export stalled for ${formatDuration(DEFAULT_STALL_TIMEOUT_MS)} at ${state.exportPhase} ${percent}%.`,
      )
    }

    if (state.exportPhase === 'error') {
      throw new Error('The page reported an export error.')
    }
  }

  if (resolvedError) {
    throw resolvedError
  }

  return resolvedDownload
}

async function exportMidiFile({
  baseUrl,
  browserContext,
  index,
  midiPath,
  midiRoot,
  outputPath,
  total,
}) {
  const relativeMidiPath = relative(midiRoot, midiPath)
  const outputRelativePath = relative(REPO_ROOT, outputPath)
  const expectedTitle = formatLoadedTitle(basename(midiPath))
  const startedAt = Date.now()
  const page = await browserContext.newPage()

  page.setDefaultTimeout(DEFAULT_WAIT_TIMEOUT_MS)
  page.on('console', (message) => {
    if (message.type() === 'error') {
      process.stderr.write(
        `[browser:error] ${relativeMidiPath} ${message.text()}\n`,
      )
    }
  })
  page.on('pageerror', (error) => {
    process.stderr.write(`[page:error] ${relativeMidiPath} ${error.message}\n`)
  })

  try {
    process.stdout.write(`[${index + 1}/${total}] exporting ${relativeMidiPath}\n`)

    await page.goto(
      buildAutomationUrl(baseUrl, `${Date.now()}-${index}`),
      { waitUntil: 'domcontentloaded' },
    )
    await waitForAutomationReady(page)

    await page.evaluate(() => {
      window.__orbitoneAutomation?.setExportOptions({
        format: 'mp4',
        cameraMode: 'cycle',
      })
    })
    await waitForExportOptions(page)

    await page.locator('input[type="file"]').setInputFiles(midiPath)
    await waitForMidiLoaded(page, expectedTitle)

    await mkdir(dirname(outputPath), { recursive: true })
    const downloadPromise = page.waitForEvent('download', { timeout: 0 })

    await page.evaluate(() => {
      window.__orbitoneAutomation?.startExport()
    })

    const download = await waitForDownload(page, downloadPromise, relativeMidiPath)
    const failure = await download.failure()

    if (failure) {
      throw new Error(`Browser download failed: ${failure}`)
    }

    await download.saveAs(outputPath)
    const outputStat = await stat(outputPath)

    process.stdout.write(
      `[done] ${relativeMidiPath} -> ${outputRelativePath} (${formatBytes(outputStat.size)}) in ${formatDuration(Date.now() - startedAt)}\n`,
    )

    return {
      elapsedMs: Date.now() - startedAt,
      midiPath: relativeMidiPath,
      outputPath: outputRelativePath,
      sizeBytes: outputStat.size,
      status: 'exported',
    }
  }
  finally {
    await page.close().catch(() => {})
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const midiFiles = await collectMidiFiles(options.midiRoot)

  if (midiFiles.length === 0) {
    throw new Error(`No MIDI files were found under ${options.midiRoot}.`)
  }

  const filteredMidiFiles = midiFiles.filter((midiPath) => {
    if (!options.match) {
      return true
    }

    return relative(options.midiRoot, midiPath)
      .toLowerCase()
      .includes(options.match.toLowerCase())
  })

  const selectedMidiFiles = options.limit === null
    ? filteredMidiFiles
    : filteredMidiFiles.slice(0, options.limit)

  if (selectedMidiFiles.length === 0) {
    throw new Error('No MIDI files matched the requested filters.')
  }

  await mkdir(options.outputDir, { recursive: true })
  await ensureBaseUrlAvailable(options.baseUrl)

  const executablePath = resolveChromeExecutable(options.chromePath)
  const browser = await chromium.launch({
    executablePath,
    headless: options.headless,
    args: [
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      ...(options.headless ? ['--use-angle=swiftshader', '--use-gl=angle'] : []),
    ],
  })

  const browserContext = await browser.newContext({
    acceptDownloads: true,
    ignoreHTTPSErrors: true,
    locale: 'en-US',
    viewport: {
      width: 1440,
      height: 900,
    },
  })

  const startedAt = Date.now()
  const successes = []
  const failures = []
  const skipped = []

  try {
    for (let index = 0; index < selectedMidiFiles.length; index += 1) {
      const midiPath = selectedMidiFiles[index]
      const outputPath = resolveOutputPath(
        options.outputDir,
        options.midiRoot,
        midiPath,
      )
      const relativeMidiPath = relative(options.midiRoot, midiPath)
      const outputRelativePath = relative(REPO_ROOT, outputPath)

      if (!options.force && await pathExists(outputPath)) {
        process.stdout.write(`[skip] ${relativeMidiPath} -> ${outputRelativePath}\n`)
        skipped.push({
          midiPath: relativeMidiPath,
          outputPath: outputRelativePath,
          status: 'skipped',
        })
        continue
      }

      try {
        const result = await exportMidiFile({
          baseUrl: options.baseUrl,
          browserContext,
          index,
          midiPath,
          midiRoot: options.midiRoot,
          outputPath,
          total: selectedMidiFiles.length,
        })
        successes.push(result)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`[fail] ${relativeMidiPath} ${message}\n`)
        failures.push({
          message,
          midiPath: relativeMidiPath,
          outputPath: outputRelativePath,
          status: 'failed',
        })

        if (options.failFast) {
          break
        }
      }
    }
  }
  finally {
    await browserContext.close().catch(() => {})
    await browser.close().catch(() => {})
  }

  const summary = {
    baseUrl: options.baseUrl,
    completedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    failures,
    force: options.force,
    headless: options.headless,
    match: options.match,
    midiRoot: options.midiRoot,
    outputDir: options.outputDir,
    skipped,
    startedAt: new Date(startedAt).toISOString(),
    successes,
  }
  const summaryPath = join(
    options.outputDir,
    `batch-export-summary-${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}.json`,
  )

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)

  process.stdout.write(
    `[summary] exported=${successes.length} skipped=${skipped.length} failed=${failures.length} in ${formatDuration(Date.now() - startedAt)}\n`,
  )
  process.stdout.write(`[summary] ${relative(REPO_ROOT, summaryPath)}\n`)

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

await main()
