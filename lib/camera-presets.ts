'use client'

export type AppLanguage = 'en' | 'ja'

export type CameraView
  = | 'default'
    | 'front'
    | 'side'
    | 'vortex'
    | 'orbit'
    | 'zenith'

export interface CameraVector {
  x: number
  y: number
  z: number
}

export interface CameraPose {
  position: CameraVector
  target: CameraVector
  fov: number
  flatLock: boolean
}

export type CameraPresetMap = Record<CameraView, CameraPose>

export const CAMERA_VIEWS: CameraView[] = [
  'default',
  'front',
  'side',
  'vortex',
  'orbit',
  'zenith',
]

export const CAMERA_VIEW_LABELS: Record<CameraView, string> = {
  default: 'Default',
  front: 'Front',
  side: 'Side',
  vortex: 'Vortex',
  orbit: 'Orbit',
  zenith: 'Zenith',
}

export const CAMERA_VIEW_LABELS_JA: Record<CameraView, string> = {
  default: 'デフォルト',
  front: '正面',
  side: '横',
  vortex: 'ボルテックス',
  orbit: 'オービット',
  zenith: '天頂',
}

export function getCameraViewLabels(language: AppLanguage) {
  return language === 'ja' ? CAMERA_VIEW_LABELS_JA : CAMERA_VIEW_LABELS
}

export const CAMERA_PRESETS_STORAGE_KEY = 'orbitone-camera-presets-v1'

export const PROCEDURAL_CAMERA_VIEWS: CameraView[] = ['orbit']

export const DEFAULT_CAMERA_PRESETS: CameraPresetMap = {
  default: {
    position: { x: 0, y: 10.14, z: 12.2 },
    target: { x: 0, y: 10.14, z: 0 },
    fov: 60,
    flatLock: true,
  },
  front: {
    position: { x: 0, y: 0, z: 32 },
    target: { x: 0, y: 0, z: 0 },
    fov: 60,
    flatLock: true,
  },
  side: {
    position: { x: 25, y: 0, z: 15 },
    target: { x: 0, y: 0, z: 0 },
    fov: 60,
    flatLock: false,
  },
  vortex: {
    position: { x: 0, y: -6, z: 5 },
    target: { x: 0, y: 4, z: 0 },
    fov: 90,
    flatLock: false,
  },
  orbit: {
    position: { x: 0, y: -8, z: 28 },
    target: { x: 0, y: -2, z: 0 },
    fov: 60,
    flatLock: false,
  },
  zenith: {
    position: { x: 0, y: 35, z: 0.1 },
    target: { x: 0, y: 0, z: 0 },
    fov: 60,
    flatLock: false,
  },
}

function sanitizeNumber(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return value
}

export function cloneCameraVector(vector: CameraVector): CameraVector {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  }
}

export function cloneCameraPose(pose: CameraPose): CameraPose {
  return {
    position: cloneCameraVector(pose.position),
    target: pose.flatLock
      ? {
          x: pose.position.x,
          y: pose.position.y,
          z: pose.target.z,
        }
      : cloneCameraVector(pose.target),
    fov: pose.fov,
    flatLock: pose.flatLock,
  }
}

export function cloneCameraPresetMap(presets: CameraPresetMap): CameraPresetMap {
  return CAMERA_VIEWS.reduce((nextPresets, view) => {
    nextPresets[view] = cloneCameraPose(presets[view])
    return nextPresets
  }, {} as CameraPresetMap)
}

export function mergeCameraPresetMap(input: unknown): CameraPresetMap {
  const basePresets = cloneCameraPresetMap(DEFAULT_CAMERA_PRESETS)

  if (!input || typeof input !== 'object') {
    return basePresets
  }

  for (const view of CAMERA_VIEWS) {
    const basePose = DEFAULT_CAMERA_PRESETS[view]
    const candidatePose = (input as Partial<CameraPresetMap>)[view]

    if (!candidatePose || typeof candidatePose !== 'object') {
      continue
    }

    const nextPosition
      = typeof candidatePose.position === 'object' && candidatePose.position
        ? (candidatePose.position as Partial<CameraVector>)
        : {}
    const nextTarget
      = typeof candidatePose.target === 'object' && candidatePose.target
        ? (candidatePose.target as Partial<CameraVector>)
        : {}

    basePresets[view] = {
      position: {
        x: sanitizeNumber(nextPosition.x, basePose.position.x),
        y: sanitizeNumber(nextPosition.y, basePose.position.y),
        z: sanitizeNumber(nextPosition.z, basePose.position.z),
      },
      target: {
        x: sanitizeNumber(nextTarget.x, basePose.target.x),
        y: sanitizeNumber(nextTarget.y, basePose.target.y),
        z: sanitizeNumber(nextTarget.z, basePose.target.z),
      },
      fov: sanitizeNumber(candidatePose.fov, basePose.fov),
      flatLock:
        typeof candidatePose.flatLock === 'boolean'
          ? candidatePose.flatLock
          : basePose.flatLock,
    }

    basePresets[view] = cloneCameraPose(basePresets[view])
  }

  return basePresets
}

export function cameraPoseEquals(left: CameraPose, right: CameraPose) {
  return left.fov === right.fov
    && left.flatLock === right.flatLock
    && left.position.x === right.position.x
    && left.position.y === right.position.y
    && left.position.z === right.position.z
    && left.target.x === right.target.x
    && left.target.y === right.target.y
    && left.target.z === right.target.z
}
