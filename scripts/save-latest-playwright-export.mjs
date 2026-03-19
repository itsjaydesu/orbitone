import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'

function parseArgs(argv) {
  let inputRoot = join(tmpdir(), 'playwright-mcp-output')
  let outputDirectory = resolve(process.cwd(), 'video-output')
  let outputName = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--input-root') {
      inputRoot = resolve(argv[index + 1] ?? inputRoot)
      index += 1
      continue
    }

    if (arg === '--output-dir') {
      outputDirectory = resolve(argv[index + 1] ?? outputDirectory)
      index += 1
      continue
    }

    if (arg === '--output') {
      outputName = argv[index + 1] ?? null
      index += 1
    }
  }

  return {
    inputRoot,
    outputDirectory,
    outputName,
  }
}

async function collectExportCandidates(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true })
  const candidates = []

  for (const entry of entries) {
    const entryPath = join(rootDirectory, entry.name)

    if (entry.isDirectory()) {
      candidates.push(...await collectExportCandidates(entryPath))
      continue
    }

    if (!/(^orbitone-export-.*|.*-orbitone)\.(mp4|webm)$/i.test(entry.name)) {
      continue
    }

    const entryStat = await stat(entryPath)
    candidates.push({
      path: entryPath,
      mtimeMs: entryStat.mtimeMs,
    })
  }

  return candidates
}

async function main() {
  const { inputRoot, outputDirectory, outputName } = parseArgs(process.argv.slice(2))
  const candidates = await collectExportCandidates(inputRoot)

  if (candidates.length === 0) {
    throw new Error(`No exported Orbitone videos were found under ${inputRoot}.`)
  }

  const latestExport = candidates
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]
  const defaultOutputName = basename(latestExport.path)
  const targetFileName = outputName ?? defaultOutputName
  const outputPath = isAbsolute(targetFileName)
    ? targetFileName
    : resolve(outputDirectory, targetFileName)

  if (extname(outputPath) === '') {
    throw new Error('The output filename must include a file extension.')
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await copyFile(latestExport.path, outputPath)
  process.stdout.write(`${outputPath}\n`)
}

await main()
