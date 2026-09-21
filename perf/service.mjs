import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
if (process.versions.node !== '24.18.0')
  throw new Error('Use Node 24.18.0 for the performance service.')
const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' })
if (sha.status !== 0)
  throw new Error('Cannot identify the build commit.')
const dirty = spawnSync('git', ['status', '--porcelain', '--', 'app', 'components', 'hooks', 'lib', 'package.json', 'pnpm-lock.yaml', 'next.config.ts', 'perf', 'ecosystem.config.js'], { cwd, encoding: 'utf8' })
if (dirty.status !== 0 || dirty.stdout.trim())
  throw new Error('Commit application inputs before the performance build.')
const build = spawnSync('pnpm', ['build'], { cwd, stdio: 'inherit' })
if (build.status !== 0)
  process.exit(build.status ?? 1)
const buildId = readFileSync(new URL('../.next/BUILD_ID', import.meta.url), 'utf8').trim()
writeFileSync(new URL('../.next/orbitone-performance.json', import.meta.url), JSON.stringify({
  sha: sha.stdout.trim(),
  buildId,
  mode: 'production',
  builtAt: new Date().toISOString(),
}))
const server = spawn('portless', ['run', '--name', 'orbitone-perf-3937', 'pnpm', 'exec', 'next', 'start'], { cwd, stdio: 'inherit' })
process.on('SIGINT', () => server.kill('SIGINT'))
process.on('SIGTERM', () => server.kill('SIGTERM'))
server.on('error', () => {
  process.exitCode = 1
})
server.on('exit', code => process.exit(code ?? 1))
