import { execFileSync, spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), readFile: vi.fn(), writeFile: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: vi.fn(),
}))

it('fails before browser launch when the explicit base URL is absent', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'perf/baseline.ts', '--label', 'baseline', '--runs', '3'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('FAIL: BASE_URL_REQUIRED')
  expect(result.stdout).toBe('')
})

it('reports a guarded failure without writing or logging its private cause', async () => {
  const originalArgv = process.argv
  const originalExitCode = process.exitCode
  const cause = new Error('Private file unavailable: confidential-score.mid')
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const launch = vi.spyOn(chromium, 'launch').mockRejectedValue(new Error('Unexpected browser launch'))
  vi.mocked(execFileSync).mockReturnValueOnce('test-commit').mockReturnValueOnce('')
  vi.mocked(readFile).mockRejectedValue(cause)
  process.argv = ['node', 'perf/baseline.ts', '--base-url', 'https://test.asuka', '--label', 'baseline', '--runs', '3']
  try {
    await import('../perf/baseline')
    await vi.waitFor(() => expect(output).toHaveBeenCalledOnce())
    expect(launch).not.toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledOnce()
    const report = String(vi.mocked(writeFile).mock.calls[0][1])
    expect(JSON.parse(report)).toMatchObject({ status: 'BLOCKED', failureCode: 'PRODUCTION_BUILD_UNAVAILABLE', medians: null })
    expect(report).not.toContain('confidential-score.mid')
    expect(report).not.toContain('Private file unavailable')
    expect(output).toHaveBeenCalledWith(expect.stringMatching(/^BLOCKED: PRODUCTION_BUILD_UNAVAILABLE\. Report: /))
    expect(JSON.stringify(output.mock.calls)).not.toContain('confidential-score.mid')
    expect(errors).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  }
  finally {
    process.argv = originalArgv
    process.exitCode = originalExitCode
  }
})
