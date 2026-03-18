import type { ExportFormat, ExportSessionInitRequest } from '@/lib/export'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  mkdir,
  readFile,
  readdir,
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

const EXPORT_SESSION_ROOT_DIRECTORY = join(tmpdir(), 'orbitone-exports')
const METADATA_FILE_NAME = 'metadata.json'
const AUDIO_FILE_NAME = 'audio.wav'

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

function getFfmpegArgs(
  metadata: ExportSessionMetadata,
  sessionDirectory: string,
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
    getAudioPath(sessionDirectory),
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
}

export async function writeExportAudio(
  sessionId: string,
  audioBuffer: Buffer,
) {
  const sessionDirectory = getSessionDirectory(sessionId)
  await writeFile(getAudioPath(sessionDirectory), audioBuffer)
}

export async function finalizeExportSession(
  sessionId: string,
) {
  const sessionDirectory = getSessionDirectory(sessionId)
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

  await execFileAsync('ffmpeg', getFfmpegArgs(metadata, sessionDirectory, outputPath), {
    timeout: 280_000,
  })

  const buffer = await readFile(outputPath)
  await unlink(outputPath)

  return {
    buffer,
    contentType,
    fileName: `orbitone-export-${Date.now()}.${fileExtension}`,
  } satisfies FinalizedExport
}

export async function removeExportSession(sessionId: string) {
  await rm(getSessionDirectory(sessionId), { force: true, recursive: true })
}
