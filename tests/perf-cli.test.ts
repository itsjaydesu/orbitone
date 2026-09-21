import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

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
