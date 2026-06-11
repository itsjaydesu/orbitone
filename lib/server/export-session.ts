import type { Buffer } from 'node:buffer'
import type { ExportFormat, ExportSessionInitRequest } from '@/lib/export'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

interface ExportSessionMetadata extends ExportSessionInitRequest {
  sessionId: string
}

interface FinalizedExport {
  buffer: Buffer
  contentType: string
  fileName: string
}

interface LoudnessAnalysis {
  inputI: number
  inputLra: number
  inputTp: number
  inputThresh: number
  targetOffset: number
}

const EXPORT_SESSION_ROOT_DIRECTORY = join(tmpdir(), 'orbitone-exports')
const METADATA_FILE_NAME = 'metadata.json'
const AUDIO_FILE_NAME = 'audio.wav'
const NORMALIZED_AUDIO_FILE_NAME = 'audio-normalized.wav'
const FRAME_LOG_INTERVAL = 600
const STREAMING_TARGET_LUFS = -14
const STREAMING_TARGET_LRA = 11
const STREAMING_TARGET_TRUE_PEAK_DBTP = -1.5

function getSessionDirectory(sessionId: string) {
  return join(EXPORT_SESSION_ROOT_DIRECTORY, sessionId)
}

function getFramesDirectory(sessionDirectory: string) {
  return join(sessionDirectory, 'frames')
}

function getMetadataPath(sessionDirectory: string) {
  return join(sessionDirectory, METADATA_FILE_NAME)
}

function getAudioPath(sessionDirectory: string) {
  return join(sessionDirectory, AUDIO_FILE_NAME)
}

function getNormalizedAudioPath(sessionDirectory: string) {
  return join(sessionDirectory, NORMALIZED_AUDIO_FILE_NAME)
}

function getFramePath(sessionDirectory: string, frameIndex: number) {
  return join(
    getFramesDirectory(sessionDirectory),
    `frame-${frameIndex.toString().padStart(6, '0')}.png`,
  )
}

async function readMetadata(sessionDirectory: string) {
  const raw = await readFile(getMetadataPath(sessionDirectory), 'utf8')
  return JSON.parse(raw) as ExportSessionMetadata
}

function getOutputDetails(format: ExportFormat) {
  if (format === 'webm') {
    return {
      contentType: 'video/webm',
      fileExtension: 'webm',
    }
  }

  return {
    contentType: 'video/mp4',
    fileExtension: 'mp4',
  }
}

function getRequestedDownloadFileName(
  fileName: string,
  fileExtension: string,
) {
  const trimmed = fileName.trim()
  const stem = trimmed.replace(/\.[^/.]+$/u, '').trim()

  if (stem.length === 0) {
    return `orbitone-export.${fileExtension}`
  }

  return `${stem}.${fileExtension}`
}

function getLogPrefix(sessionId: string) {
  return `[export][session:${sessionId}]`
}

function getStderrTail(stderr: string | undefined, maxLength = 4000) {
  if (!stderr) {
    return ''
  }

  return stderr.length <= maxLength ? stderr : stderr.slice(-maxLength)
}

function parseFfmpegNumber(value: string | undefined, key: string) {
  const trimmed = value?.trim().toLowerCase() ?? ''

  if (trimmed === 'inf' || trimmed === '+inf') {
    return Number.POSITIVE_INFINITY
  }

  if (trimmed === '-inf') {
    return Number.NEGATIVE_INFINITY
  }

  const parsed = Number(trimmed)

  if (Number.isNaN(parsed)) {
    throw new TypeError(`FFmpeg loudness analysis did not return a valid ${key} value.`)
  }

  return parsed
}

function formatLoudnessValue(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : String(value)
}

function hasFiniteLoudnessAnalysis(analysis: LoudnessAnalysis) {
  return [
    analysis.inputI,
    analysis.inputLra,
    analysis.inputTp,
    analysis.inputThresh,
    analysis.targetOffset,
  ].every(value => Number.isFinite(value))
}

function parseLoudnessAnalysis(stderr: string | undefined) {
  const trimmed = stderr?.trim() ?? ''
  const jsonStart = trimmed.lastIndexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new TypeError('FFmpeg loudness analysis did not return parseable JSON.')
  }

  const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, string>
  const readNumber = (key: string) => {
    return parseFfmpegNumber(parsed[key], key)
  }

  return {
    inputI: readNumber('input_i'),
    inputLra: readNumber('input_lra'),
    inputTp: readNumber('input_tp'),
    inputThresh: readNumber('input_thresh'),
    targetOffset: readNumber('target_offset'),
  } satisfies LoudnessAnalysis
}

function getLoudnessAnalysisFilter() {
  return `loudnorm=I=${STREAMING_TARGET_LUFS}:LRA=${STREAMING_TARGET_LRA}:TP=${STREAMING_TARGET_TRUE_PEAK_DBTP}:print_format=json`
}

function getLoudnessNormalizationFilter(analysis: LoudnessAnalysis) {
  return [
    'loudnorm=',
    `I=${STREAMING_TARGET_LUFS}:`,
    `LRA=${STREAMING_TARGET_LRA}:`,
    `TP=${STREAMING_TARGET_TRUE_PEAK_DBTP}:`,
    `measured_I=${analysis.inputI.toFixed(2)}:`,
    `measured_LRA=${analysis.inputLra.toFixed(2)}:`,
    `measured_TP=${analysis.inputTp.toFixed(2)}:`,
    `measured_thresh=${analysis.inputThresh.toFixed(2)}:`,
    `offset=${analysis.targetOffset.toFixed(2)}:`,
    'linear=true:',
    'print_format=summary',
  ].join('')
}

async function analyzeExportAudioLoudness(
  sessionId: string,
  sessionDirectory: string,
) {
  const startedAt = Date.now()
  const { stderr } = await execFileAsync(
    'ffmpeg',
    [
      '-i',
      getAudioPath(sessionDirectory),
      '-af',
      getLoudnessAnalysisFilter(),
      '-f',
      'null',
      '-',
    ],
    {
      timeout: 280_000,
    },
  )
  const analysis = parseLoudnessAnalysis(stderr)

  console.info(
    `${getLogPrefix(sessionId)} loudness:analysis elapsedMs=${Date.now() - startedAt} inputI=${formatLoudnessValue(analysis.inputI)} inputTp=${formatLoudnessValue(analysis.inputTp)} inputLra=${formatLoudnessValue(analysis.inputLra)} offset=${formatLoudnessValue(analysis.targetOffset)}`,
  )

  return analysis
}

async function normalizeExportAudio(
  sessionId: string,
  sessionDirectory: string,
) {
  const startedAt = Date.now()
  const analysis = await analyzeExportAudioLoudness(sessionId, sessionDirectory)
  const sourceAudioPath = getAudioPath(sessionDirectory)

  if (!hasFiniteLoudnessAnalysis(analysis)) {
    console.warn(
      `${getLogPrefix(sessionId)} loudness:skip-normalization reason=non-finite-analysis inputI=${formatLoudnessValue(analysis.inputI)} inputTp=${formatLoudnessValue(analysis.inputTp)} inputLra=${formatLoudnessValue(analysis.inputLra)} offset=${formatLoudnessValue(analysis.targetOffset)}`,
    )
    return sourceAudioPath
  }

  const normalizedAudioPath = getNormalizedAudioPath(sessionDirectory)
  const { stderr } = await execFileAsync(
    'ffmpeg',
    [
      '-i',
      sourceAudioPath,
      '-af',
      getLoudnessNormalizationFilter(analysis),
      '-ar',
      '48000',
      '-c:a',
      'pcm_s16le',
      '-y',
      normalizedAudioPath,
    ],
    {
      timeout: 280_000,
    },
  )

  console.info(
    `${getLogPrefix(sessionId)} loudness:normalized elapsedMs=${Date.now() - startedAt} stderrTail=${JSON.stringify(getStderrTail(stderr, 1200))}`,
  )

  return normalizedAudioPath
}

function getFfmpegArgs(
  metadata: ExportSessionMetadata,
  sessionDirectory: string,
  normalizedAudioPath: string,
  outputPath: string,
) {
  const frameSequencePath = join(getFramesDirectory(sessionDirectory), 'frame-%06d.png')
  const sharedInputArgs = [
    '-framerate',
    metadata.fps.toString(),
    '-start_number',
    '0',
    '-i',
    frameSequencePath,
    '-i',
    normalizedAudioPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-t',
    metadata.totalDurationSeconds.toFixed(6),
  ]

  if (metadata.format === 'webm') {
    return [
      ...sharedInputArgs,
      '-c:v',
      'libvpx-vp9',
      '-row-mt',
      '1',
      '-crf',
      '30',
      '-b:v',
      '0',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'libopus',
      '-b:a',
      '192k',
      '-y',
      outputPath,
    ]
  }

  return [
    ...sharedInputArgs,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ]
}

export async function createExportSession(
  request: ExportSessionInitRequest,
) {
  const sessionId = randomUUID()
  const sessionDirectory = getSessionDirectory(sessionId)

  await mkdir(EXPORT_SESSION_ROOT_DIRECTORY, { recursive: true })
  await mkdir(getFramesDirectory(sessionDirectory), { recursive: true })

  const metadata: ExportSessionMetadata = {
    ...request,
    sessionId,
  }

  await writeFile(
    getMetadataPath(sessionDirectory),
    JSON.stringify(metadata, null, 2),
    'utf8',
  )

  console.info(
    `${getLogPrefix(sessionId)} init format=${request.format} fps=${request.fps} frameCount=${request.frameCount} duration=${request.totalDurationSeconds.toFixed(3)} size=${request.width}x${request.height} dir=${sessionDirectory}`,
  )

  return {
    sessionId,
  }
}

export async function writeExportFrame(
  sessionId: string,
  frameIndex: number,
  frameBuffer: Buffer,
) {
  const sessionDirectory = getSessionDirectory(sessionId)
  await writeFile(getFramePath(sessionDirectory, frameIndex), frameBuffer)

  if (frameIndex === 0 || (frameIndex + 1) % FRAME_LOG_INTERVAL === 0) {
    console.info(
      `${getLogPrefix(sessionId)} frame frameIndex=${frameIndex} bytes=${frameBuffer.byteLength}`,
    )
  }
}

export async function writeExportAudio(
  sessionId: string,
  audioBuffer: Buffer,
) {
  const sessionDirectory = getSessionDirectory(sessionId)
  await writeFile(getAudioPath(sessionDirectory), audioBuffer)

  console.info(
    `${getLogPrefix(sessionId)} audio bytes=${audioBuffer.byteLength}`,
  )
}

export async function finalizeExportSession(
  sessionId: string,
) {
  const sessionDirectory = getSessionDirectory(sessionId)
  const startedAt = Date.now()
  const metadata = await readMetadata(sessionDirectory)
  const frameFiles = (await readdir(getFramesDirectory(sessionDirectory)))
    .filter(fileName => fileName.endsWith('.png'))
    .sort()

  if (frameFiles.length !== metadata.frameCount) {
    throw new Error(
      `Expected ${metadata.frameCount} frames but found ${frameFiles.length}.`,
    )
  }

  await stat(getAudioPath(sessionDirectory))

  const { contentType, fileExtension } = getOutputDetails(metadata.format)
  const outputPath = join(sessionDirectory, `output.${fileExtension}`)
  const normalizedAudioPath = await normalizeExportAudio(sessionId, sessionDirectory)

  console.info(
    `${getLogPrefix(sessionId)} finalize:start format=${metadata.format} frames=${frameFiles.length}/${metadata.frameCount} output=${outputPath}`,
  )

  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      getFfmpegArgs(metadata, sessionDirectory, normalizedAudioPath, outputPath),
      {
        timeout: 280_000,
      },
    )

    console.info(
      `${getLogPrefix(sessionId)} finalize:ffmpeg-ok elapsedMs=${Date.now() - startedAt} stderrTail=${JSON.stringify(getStderrTail(stderr, 1200))}`,
    )
  }
  catch (error) {
    const execError = error as Error & {
      code?: number | string
      killed?: boolean
      signal?: NodeJS.Signals | string
      stderr?: string
      stdout?: string
    }

    console.error(
      `${getLogPrefix(sessionId)} finalize:ffmpeg-failed elapsedMs=${Date.now() - startedAt} code=${String(execError.code ?? '')} signal=${String(execError.signal ?? '')} killed=${String(execError.killed ?? false)} message=${execError.message}`,
    )
    console.error(
      `${getLogPrefix(sessionId)} finalize:ffmpeg-stderr ${getStderrTail(execError.stderr)}`,
    )
    throw error
  }

  const buffer = await readFile(outputPath)
  await unlink(outputPath)

  console.info(
    `${getLogPrefix(sessionId)} finalize:done elapsedMs=${Date.now() - startedAt} bytes=${buffer.byteLength}`,
  )

  return {
    buffer,
    contentType,
    fileName: getRequestedDownloadFileName(metadata.fileName, fileExtension),
  } satisfies FinalizedExport
}

export async function removeExportSession(sessionId: string) {
  await rm(getSessionDirectory(sessionId), { force: true, recursive: true })
}
