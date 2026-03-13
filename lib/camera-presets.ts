"use client";

export type CameraView =
  | "topThird"
  | "front"
  | "top"
  | "side"
  | "dynamic"
  | "isometric"
  | "vortex"
  | "orbit"
  | "zenith";

export interface CameraVector {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: CameraVector;
  target: CameraVector;
  fov: number;
  flatLock: boolean;
}

export type CameraPresetMap = Record<CameraView, CameraPose>;

export const CAMERA_VIEWS: CameraView[] = [
  "topThird",
  "front",
  "top",
  "side",
  "dynamic",
  "isometric",
  "vortex",
  "orbit",
  "zenith",
];

export const CAMERA_VIEW_LABELS: Record<CameraView, string> = {
  topThird: "Top Third",
  front: "Front",
  top: "Top",
  side: "Side",
  dynamic: "Dynamic",
  isometric: "Isometric",
  vortex: "Vortex",
  orbit: "Orbit",
  zenith: "Zenith",
};

export const CAMERA_PRESETS_STORAGE_KEY = "orbitone-camera-presets-v1";

export const PROCEDURAL_CAMERA_VIEWS: CameraView[] = ["dynamic", "orbit"];

export const DEFAULT_CAMERA_PRESETS: CameraPresetMap = {
  topThird: {
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
  top: {
    position: { x: 0, y: 25, z: 15 },
    target: { x: 0, y: 0, z: 0 },
    fov: 60,
    flatLock: false,
  },
  side: {
    position: { x: 25, y: 0, z: 15 },
    target: { x: 0, y: 0, z: 0 },
    fov: 60,
    flatLock: false,
  },
  dynamic: {
    position: { x: 0, y: 8, z: 25 },
    target: { x: 0, y: 5, z: 0 },
    fov: 60,
    flatLock: false,
  },
  isometric: {
    position: { x: 20, y: 20, z: 20 },
    target: { x: 0, y: 0, z: 0 },
    fov: 60,
    flatLock: false,
  },
  vortex: {
    position: { x: 0, y: -2, z: 8 },
    target: { x: 0, y: 10, z: 0 },
    fov: 60,
    flatLock: false,
  },
  orbit: {
    position: { x: 0, y: 8, z: 25 },
    target: { x: 0, y: 5, z: 0 },
    fov: 60,
    flatLock: false,
  },
  zenith: {
    position: { x: 0, y: 35, z: 0.1 },
    target: { x: 0, y: 0, z: 0 },
    fov: 60,
    flatLock: false,
  },
};

const sanitizeNumber = (value: unknown, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
};

export const cloneCameraVector = (vector: CameraVector): CameraVector => ({
  x: vector.x,
  y: vector.y,
  z: vector.z,
});

export const cloneCameraPose = (pose: CameraPose): CameraPose => ({
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
});

export const cloneCameraPresetMap = (
  presets: CameraPresetMap,
): CameraPresetMap =>
  CAMERA_VIEWS.reduce((nextPresets, view) => {
    nextPresets[view] = cloneCameraPose(presets[view]);
    return nextPresets;
  }, {} as CameraPresetMap);

export const mergeCameraPresetMap = (input: unknown): CameraPresetMap => {
  const basePresets = cloneCameraPresetMap(DEFAULT_CAMERA_PRESETS);

  if (!input || typeof input !== "object") {
    return basePresets;
  }

  for (const view of CAMERA_VIEWS) {
    const basePose = DEFAULT_CAMERA_PRESETS[view];
    const candidatePose = (input as Partial<CameraPresetMap>)[view];

    if (!candidatePose || typeof candidatePose !== "object") {
      continue;
    }

    const nextPosition =
      typeof candidatePose.position === "object" && candidatePose.position
        ? (candidatePose.position as Partial<CameraVector>)
        : {};
    const nextTarget =
      typeof candidatePose.target === "object" && candidatePose.target
        ? (candidatePose.target as Partial<CameraVector>)
        : {};

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
        typeof candidatePose.flatLock === "boolean"
          ? candidatePose.flatLock
          : basePose.flatLock,
    };

    basePresets[view] = cloneCameraPose(basePresets[view]);
  }

  return basePresets;
};

export const cameraPoseEquals = (left: CameraPose, right: CameraPose) =>
  left.fov === right.fov &&
  left.flatLock === right.flatLock &&
  left.position.x === right.position.x &&
  left.position.y === right.position.y &&
  left.position.z === right.position.z &&
  left.target.x === right.target.x &&
  left.target.y === right.target.y &&
  left.target.z === right.target.z;
