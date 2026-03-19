import type { CameraView } from '@/lib/camera-presets'
import type { NoteEvent, PedalEvent } from '@/lib/music'
import { CAMERA_VIEWS } from '@/lib/camera-presets'
import { getVisualizerIntroSettleSeconds } from '@/lib/visualizer-intro'

export type ExportFormat = 'mp4' | 'webm'
export type ExportCameraMode = 'current' | 'cycle'

export interface ExportSourceData {
  notes: NoteEvent[]
  pedalEvents: PedalEvent[]
  playbackGain: number
}

export interface ExportTimeline {
  fps: number
  width: number
  height: number
  frameCount: number
  audioDurationSeconds: number
  contentEndSeconds: number
  finalFadeStartSeconds: number
  firstNoteTimeSeconds: number
  introSettleSeconds: number
  playbackStartSeconds: number
  playbackEndSeconds: number
  totalDurationSeconds: number
}

export interface ExportFrameRenderState {
  cameraView: CameraView
  frameIndex: number
  globalTime: number
  progress: number
  transportTime: number
}

export interface ExportCameraTransitionState {
  activeView: CameraView
  fromView: CameraView
  fromSampleTime: number
  isTransitioning: boolean
  progress: number
  toView: CameraView
  toSampleTime: number
}

export interface ExportSessionInitRequest {
  fileName: string
  format: ExportFormat
  fps: number
  frameCount: number
  height: number
  totalDurationSeconds: number
  width: number
}

export const EXPORT_FPS = 60
export const EXPORT_WIDTH = 1080
export const EXPORT_HEIGHT = 1920
export const EXPORT_AUDIO_SAMPLE_RATE = 48_000
export const EXPORT_FRAME_IMAGE_MIME_TYPE = 'image/png'
export const EXPORT_FRAME_FILE_EXTENSION = 'png'
export const EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS = 10
export const EXPORT_CAMERA_TRANSITION_SECONDS = 5
export const EXPORT_FINAL_FADE_OUT_SECONDS = 3
export const EXPORT_VISUAL_TAIL_SECONDS = 7
export const EXPORT_PLAYBACK_ADVANCE_SECONDS = 0.5
export const SUPPORTED_EXPORT_FORMATS: readonly ExportFormat[] = ['mp4', 'webm']
const EXPORT_FILENAME_FALLBACK_STEM = 'orbitone-export'
const EXPORT_FLOAT_EPSILON = 1e-6

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smootherStep(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

export function isExportFormat(value: string): value is ExportFormat {
  return value === 'mp4' || value === 'webm'
}

export function getExportAudioDurationSeconds(notes: NoteEvent[]) {
  if (notes.length === 0) {
    return 0
  }

  return Math.max(...notes.map(note => note.time + note.duration))
}

export function getExportPlaybackEndSeconds(notes: NoteEvent[]) {
  if (notes.length === 0) {
    return 0
  }

  const audioDurationSeconds = getExportAudioDurationSeconds(notes)
  const latestNoteStartTime = Math.max(...notes.map(note => note.time))

  return Math.max(
    audioDurationSeconds,
    latestNoteStartTime + EXPORT_VISUAL_TAIL_SECONDS,
  )
}

function getTransitionSafeFadeStartSeconds(
  contentEndSeconds: number,
  cameraMode: ExportCameraMode,
) {
  if (cameraMode !== 'cycle' || EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS <= 0) {
    return contentEndSeconds
  }

  const stableWindowSeconds = Math.max(
    EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS - EXPORT_CAMERA_TRANSITION_SECONDS,
    0,
  )
  const latestFadeStartOffset = Math.max(
    stableWindowSeconds - EXPORT_FINAL_FADE_OUT_SECONDS,
    0,
  )
  const cycleOffset
    = ((contentEndSeconds % EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS)
      + EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS)
      % EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS

  if (cycleOffset <= latestFadeStartOffset + EXPORT_FLOAT_EPSILON) {
    return contentEndSeconds
  }

  return Math.ceil(
    (contentEndSeconds - EXPORT_FLOAT_EPSILON)
    / EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS,
  ) * EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS
}

export function createExportTimeline(
  notes: NoteEvent[],
  cameraMode: ExportCameraMode = 'current',
  fps: number = EXPORT_FPS,
  width: number = EXPORT_WIDTH,
  height: number = EXPORT_HEIGHT,
): ExportTimeline {
  const audioDurationSeconds = getExportAudioDurationSeconds(notes)
  const firstNoteTimeSeconds = notes.length > 0 ? Math.max(0, notes[0].time) : 0
  const introSettleSeconds = getVisualizerIntroSettleSeconds()
  const playbackStartSeconds = Math.max(
    introSettleSeconds - EXPORT_PLAYBACK_ADVANCE_SECONDS,
    0,
  )
  const playbackEndSeconds = getExportPlaybackEndSeconds(notes)
  const contentEndSeconds = playbackStartSeconds + playbackEndSeconds
  const finalFadeStartSeconds = getTransitionSafeFadeStartSeconds(
    contentEndSeconds,
    cameraMode,
  )
  const totalDurationSeconds
    = finalFadeStartSeconds + EXPORT_FINAL_FADE_OUT_SECONDS
  const frameCount = Math.max(1, Math.ceil(totalDurationSeconds * fps))

  return {
    fps,
    width,
    height,
    frameCount,
    audioDurationSeconds,
    contentEndSeconds,
    finalFadeStartSeconds,
    firstNoteTimeSeconds,
    introSettleSeconds,
    playbackStartSeconds,
    playbackEndSeconds,
    totalDurationSeconds,
  }
}

export function getExportTransportTime(
  globalTime: number,
  timeline: ExportTimeline,
) {
  if (globalTime <= timeline.playbackStartSeconds) {
    return 0
  }

  return Math.min(
    Math.max(globalTime - timeline.playbackStartSeconds, 0),
    timeline.playbackEndSeconds,
  )
}

export function getExportCameraView(
  globalTime: number,
  cameraMode: ExportCameraMode,
  currentCameraView: CameraView,
) {
  return getExportCameraTransitionState(
    globalTime,
    cameraMode,
    currentCameraView,
  ).activeView
}

export function getExportCameraTransitionState(
  globalTime: number,
  cameraMode: ExportCameraMode,
  currentCameraView: CameraView,
): ExportCameraTransitionState {
  if (cameraMode === 'current') {
    return {
      activeView: currentCameraView,
      fromView: currentCameraView,
      fromSampleTime: Math.max(globalTime, 0),
      isTransitioning: false,
      progress: 1,
      toView: currentCameraView,
      toSampleTime: Math.max(globalTime, 0),
    }
  }

  const safeGlobalTime = Math.max(globalTime, 0)
  const cycleIndex = Math.floor(
    safeGlobalTime / EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS,
  )
  const fromView = CAMERA_VIEWS[cycleIndex % CAMERA_VIEWS.length] ?? CAMERA_VIEWS[0]
  const toView = CAMERA_VIEWS[(cycleIndex + 1) % CAMERA_VIEWS.length] ?? fromView
  const cycleStartTime = cycleIndex * EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS
  const cycleEndTime = cycleStartTime + EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS
  const transitionDuration = Math.min(
    EXPORT_CAMERA_TRANSITION_SECONDS,
    EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS,
  )
  const transitionStartTime = Math.max(cycleStartTime, cycleEndTime - transitionDuration)

  if (safeGlobalTime < transitionStartTime) {
    return {
      activeView: fromView,
      fromView,
      fromSampleTime: safeGlobalTime,
      isTransitioning: false,
      progress: 0,
      toView: fromView,
      toSampleTime: safeGlobalTime,
    }
  }

  const rawProgress
    = transitionDuration <= 0
      ? 1
      : (safeGlobalTime - transitionStartTime) / transitionDuration
  const progress = smootherStep(clamp01(rawProgress))

  return {
    activeView: progress >= 0.5 ? toView : fromView,
    fromView,
    fromSampleTime: transitionStartTime,
    isTransitioning: true,
    progress,
    toView,
    toSampleTime: cycleEndTime,
  }
}

export function getExportFrameRenderState(
  timeline: ExportTimeline,
  frameIndex: number,
  cameraMode: ExportCameraMode,
  currentCameraView: CameraView,
): ExportFrameRenderState {
  const safeFrameIndex = Math.min(Math.max(frameIndex, 0), timeline.frameCount - 1)
  const globalTime = safeFrameIndex / timeline.fps
  const progress = (safeFrameIndex + 1) / timeline.frameCount

  return {
    cameraView: getExportCameraView(globalTime, cameraMode, currentCameraView),
    frameIndex: safeFrameIndex,
    globalTime,
    progress,
    transportTime: getExportTransportTime(globalTime, timeline),
  }
}

export function getExportFadeToBlackOpacity(
  globalTime: number,
  timeline: ExportTimeline,
) {
  if (globalTime <= timeline.finalFadeStartSeconds) {
    return 0
  }

  const displayedFrameEndTime = globalTime + 1 / Math.max(timeline.fps, 1)

  return clamp01(
    (displayedFrameEndTime - timeline.finalFadeStartSeconds)
    / EXPORT_FINAL_FADE_OUT_SECONDS,
  )
}

function slugifyExportFileStem(fileName: string) {
  const stem = fileName
    .replace(/\.[^/.]+$/u, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/['’]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-+/gu, '-')

  return stem || EXPORT_FILENAME_FALLBACK_STEM
}

export function getExportDownloadFileName(
  sourceFileName: string | null | undefined,
  format: ExportFormat,
) {
  const fileStem = sourceFileName
    ? slugifyExportFileStem(sourceFileName)
    : EXPORT_FILENAME_FALLBACK_STEM

  return `${fileStem}-orbitone.${format}`
}

export function validateExportRequest(
  source: ExportSourceData,
  format: string,
) {
  if (source.notes.length === 0) {
    return 'No MIDI notes are loaded for export.'
  }

  if (!isExportFormat(format)) {
    return `Unsupported export format: ${format}`
  }

  return null
}
