import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright-core'
import { expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), readFile: vi.fn(), writeFile: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: vi.fn(), spawnSync: vi.fn(), spawn: vi.fn() }))

const native = await vi.importActual<typeof import('node:child_process')>('node:child_process')
const inputs = ['app/page.tsx', 'components/Scene.tsx', 'hooks/useMusic.ts', 'lib/music.ts', 'public/fixture.mid', 'scripts/build.mjs', 'perf/probe.ts', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'ecosystem.config.js']
const exclusions = ['docs/performance.md', 'tests/perf.test.ts', 'vitest.config.ts', 'eslint.config.mjs', 'README.md', 'LICENSE', '.agents/log.md', '.next/BUILD_ID', 'next-env.d.ts', 'tsconfig.tsbuildinfo']

function repository(path: string, change: 'dirty' | 'deleted' | 'untracked') {
  const cwd = mkdtempSync(join(tmpdir(), 'orbitone-perf-inputs-'))
  const file = join(cwd, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, 'original\n')
  const git = (args: string[]) => native.execFileSync('git', args, { cwd, encoding: 'utf8' })
  git(['init', '--quiet'])
  if (change !== 'untracked') {
    git(['add', '--', path])
    git(['-c', 'user.name=Performance test', '-c', 'user.email=perf@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture'])
  }
  if (change === 'deleted') {
    mkdirSync(join(cwd, '.agents'), { recursive: true })
    renameSync(file, join(cwd, '.agents/deleted-fixture'))
  }
  else {
    writeFileSync(file, 'changed\n')
  }
  return git
}

async function checkEntry(entry: 'baseline' | 'service', path: string, change: 'dirty' | 'deleted' | 'untracked', blocked: boolean) {
  vi.resetModules()
  vi.clearAllMocks()
  const git = repository(path, change)
  const originalArgv = process.argv
  const originalExitCode = process.exitCode
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const launch = vi.spyOn(chromium, 'launch').mockRejectedValue(new Error('Unexpected browser launch'))
  const build = vi.fn(() => {
    throw new Error('TEST_BUILD_BOUNDARY')
  })
  vi.mocked(execFileSync).mockImplementation((command, args) => {
    expect(command).toBe('git')
    return args?.[0] === 'status' ? git([...args]) : 'test-commit'
  })
  vi.mocked(spawnSync).mockImplementation((command, args) => {
    if (command !== 'git')
      return build()
    const stdout = args?.[0] === 'status' ? git([...args]) : 'test-commit'
    return { status: 0, stdout, stderr: '', pid: 1, output: [null, stdout, ''], signal: null }
  })
  vi.mocked(readFile).mockRejectedValue(new Error('TEST_BUILD_BOUNDARY'))
  process.argv = ['node', 'perf/baseline.ts', '--base-url', 'https://test.asuka', '--label', 'baseline', '--runs', '3']
  try {
    if (entry === 'service') {
      await expect(import('../perf/service.mjs')).rejects.toThrow(blocked ? 'UNCOMMITTED_BUILD_INPUTS' : 'TEST_BUILD_BOUNDARY')
      expect(build).toHaveBeenCalledTimes(blocked ? 0 : 1)
    }
    else {
      await import('../perf/baseline')
      await vi.waitFor(() => expect(output).toHaveBeenCalledOnce())
      const report = JSON.parse(String(vi.mocked(writeFile).mock.calls[0][1]))
      expect(report).toMatchObject({ status: 'BLOCKED', failureCode: blocked ? 'UNCOMMITTED_BUILD_INPUTS' : 'PRODUCTION_BUILD_UNAVAILABLE', medians: null })
      expect(readFile).toHaveBeenCalledTimes(blocked ? 0 : 1)
      expect(process.exitCode).toBe(2)
    }
    expect(launch).not.toHaveBeenCalled()
  }
  finally {
    process.argv = originalArgv
    process.exitCode = originalExitCode
  }
}

const entries = ['baseline', 'service'] as const
const changes = ['dirty', 'deleted', 'untracked'] as const

it.each(entries.flatMap(entry => ['public/fixture.mid', 'tsconfig.json'].flatMap(path => changes.map(change => ({ entry, path, change })))))(
  '$entry blocks $change $path',
  async ({ entry, path, change }) => checkEntry(entry, path, change, true),
)

it.each(entries.flatMap(entry => inputs.map(path => ({ entry, path }))))('$entry blocks build input $path', async ({ entry, path }) => {
  await checkEntry(entry, path, 'dirty', true)
})

it.each(entries.flatMap(entry => exclusions.map(path => ({ entry, path }))))('$entry permits exclusion $path', async ({ entry, path }) => {
  await checkEntry(entry, path, 'dirty', false)
})
