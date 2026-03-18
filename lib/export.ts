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
  firstNoteTimeSeconds: number
  introSettleSeconds: number
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
  progress: number
  toView: CameraView
  toSampleTime: number
}

export interface ExportSessionInitRequest {
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
export const EXPORT_VISUAL_TAIL_SECONDS = 7
export const SUPPORTED_EXPORT_FORMATS: readonly ExportFormat[] = ['mp4', 'webm']

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

export function createExportTimeline(
  notes: NoteEvent[],
  fps: number = EXPORT_FPS,
  width: number = EXPORT_WIDTH,
  height: number = EXPORT_HEIGHT,
): ExportTimeline {
  const audioDurationSeconds = getExportAudioDurationSeconds(notes)
  const firstNoteTimeSeconds = notes.length > 0 ? Math.max(0, notes[0].time) : 0
  const introSettleSeconds = getVisualizerIntroSettleSeconds()
  const playbackEndSeconds = getExportPlaybackEndSeconds(notes)
  const totalDurationSeconds = introSettleSeconds + playbackEndSeconds
  const frameCount = Math.max(1, Math.ceil(totalDurationSeconds * fps))

  return {
    fps,
    width,
    height,
    frameCount,
    audioDurationSeconds,
    firstNoteTimeSeconds,
    introSettleSeconds,
    playbackEndSeconds,
    totalDurationSeconds,
  }
}

export function getExportTransportTime(
  globalTime: number,
  timeline: ExportTimeline,
) {
  if (globalTime <= timeline.introSettleSeconds) {
    return 0
  }

  return Math.min(
    Math.max(globalTime - timeline.introSettleSeconds, 0),
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
  const transitionDuration = Math.min(
    EXPORT_CAMERA_TRANSITION_SECONDS,
    EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS,
  )
  const transitionStartTime = Math.max(
    cycleStartTime,
    cycleStartTime
    + EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS
    - transitionDuration,
  )
  const rawProgress
    = safeGlobalTime <= transitionStartTime
      ? 0
      : (safeGlobalTime - transitionStartTime) / transitionDuration
  const progress = smootherStep(clamp01(rawProgress))

  return {
    activeView: progress >= 0.5 ? toView : fromView,
    fromView,
    fromSampleTime: transitionStartTime,
    progress,
    toView,
    toSampleTime: cycleStartTime + EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS,
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
