export class HarnessFailure extends Error {
  status: 'FAIL' | 'BLOCKED'
  code: string

  constructor(status: 'FAIL' | 'BLOCKED', code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

export function parseOptions(args: string[]) {
  const values = args[0] === '--' ? args.slice(1) : args
  const flags = new Map<string, string>()
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index]
    const value = values[index + 1]
    if (!['--base-url', '--label', '--runs', '--output-dir', '--chrome'].includes(flag) || !value || flags.has(flag))
      throw new HarnessFailure('FAIL', 'INVALID_ARGUMENTS')
    flags.set(flag, value)
  }
  let baseUrl: URL
  try {
    baseUrl = new URL(flags.get('--base-url') ?? '')
  }
  catch {
    throw new HarnessFailure('FAIL', 'BASE_URL_REQUIRED')
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/')
    throw new HarnessFailure('FAIL', 'INVALID_BASE_URL')
  const label = flags.get('--label') ?? ''
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(label) || flags.get('--runs') !== '3')
    throw new HarnessFailure('FAIL', 'LABEL_AND_THREE_RUNS_REQUIRED')
  return {
    baseUrl: baseUrl.href,
    label,
    runs: 3,
    outputDir: flags.get('--output-dir') ?? 'test-results/performance',
    chrome: flags.get('--chrome') ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  }
}

export interface Metric { name: string, value: number }

export function metric(metrics: Metric[], name: string) {
  const value = metrics.find(item => item.name === name)?.value
  if (value === undefined || !Number.isFinite(value) || value < 0)
    throw new HarnessFailure('BLOCKED', name === 'JSHeapUsedSize' ? 'HEAP_METRIC_UNAVAILABLE' : 'CPU_METRICS_UNAVAILABLE')
  return value
}

export function cpuWindow(before: Metric[], after: Metric[], wallSeconds: number) {
  const taskCpuSeconds = metric(after, 'TaskDuration') - metric(before, 'TaskDuration')
  const threadCpuSeconds = metric(after, 'ThreadTime') - metric(before, 'ThreadTime')
  if (!(wallSeconds > 0) || !Number.isFinite(wallSeconds) || taskCpuSeconds <= 0 || threadCpuSeconds <= 0)
    throw new HarnessFailure('BLOCKED', 'CPU_METRICS_UNAVAILABLE')
  return { taskCpuSeconds, threadCpuSeconds, wallSeconds, cpuFraction: taskCpuSeconds / wallSeconds }
}

export function assertHealthy(state: {
  uploaded: boolean
  audioPeak: number
  progressSeconds: number
  expectedProgressSeconds: number
  browserErrors: number
}) {
  if (state.browserErrors)
    throw new HarnessFailure('FAIL', 'BROWSER_ERROR')
  if (!state.uploaded)
    throw new HarnessFailure('FAIL', 'UPLOAD_FAILED')
  if (!Number.isFinite(state.audioPeak) || state.audioPeak <= 0.00001)
    throw new HarnessFailure('FAIL', 'AUDIO_MISSING')
  if (!Number.isFinite(state.progressSeconds) || Math.abs(state.progressSeconds - state.expectedProgressSeconds) > 1)
    throw new HarnessFailure('FAIL', 'PLAYBACK_PROGRESS_FAILED')
}

export function median(values: number[]) {
  if (!values.length || values.some(value => !Number.isFinite(value)))
    throw new HarnessFailure('FAIL', 'INVALID_SUMMARY')
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function frameSummary(intervals: number[]) {
  if (!intervals.length || intervals.some(value => !Number.isFinite(value) || value <= 0))
    throw new HarnessFailure('BLOCKED', 'RAF_METRICS_UNAVAILABLE')
  const sorted = intervals.toSorted((a, b) => a - b)
  return {
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    over50Ms: sorted.filter(value => value > 50).length,
    count: sorted.length,
  }
}

export function networkAction(address: string, method: string, origin: string) {
  const url = new URL(address)
  if (url.origin === origin && url.pathname.startsWith('/_vercel/insights/'))
    return url.pathname.endsWith('/script.js') ? 'analytics-script' : 'analytics-event'
  const sample = url.origin === 'https://tonejs.github.io' && url.pathname.startsWith('/audio/salamander/')
  return method === 'GET' && (url.origin === origin || sample) ? 'allow' : 'block'
}
