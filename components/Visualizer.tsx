'use client'

import type { ComponentRef, MutableRefObject, RefObject } from 'react'
import type { ExportCameraMode } from '@/lib/export'
import type {
  CameraPose,
  CameraPresetMap,
  CameraVector,
  CameraView,
} from '@/lib/camera-presets'
import type { NoteEvent } from '@/lib/music'
import { Billboard, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import {

  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import * as Tone from 'tone'
import { getExportCameraTransitionState } from '@/lib/export'
import {
  INTRO_CAMERA_DELAY,
  INTRO_CAMERA_DURATION,
  INTRO_NOTE_APPEAR_DELAY,
  INTRO_NOTE_BASE_DELAY,
  INTRO_NOTE_DURATION,
  INTRO_NOTE_SWEEP_SPAN,
  INTRO_PLAYHEAD_DELAY,
  INTRO_PLAYHEAD_DURATION,
  INTRO_RING_DRAW_DURATION,
  INTRO_RING_STAGGER,
} from '@/lib/visualizer-intro'

export interface VisualizerSettings {
  showMidiRoll: boolean
  cameraView: CameraView
}

export interface VisualizerRenderTimeline {
  globalTime: number
  transportTime: number
}

export interface ExportFrameController {
  canvas: HTMLCanvasElement
  renderFrame: (timestampMs: number) => void
}

const DEFAULT_TIME_WINDOW = 10
const DEFAULT_BLOOM_INTENSITY = 1.2
const CLEF_FONT_STACK
  = '"Segoe UI Symbol", "Cambria Math", "STIX Two Text", "Noto Music", serif'
const TREBLE_CLEF_SCALE = 1.05
const BASS_CLEF_SCALE = 0.656
const CLEF_Z_OFFSET = 0.08
const NOTE_RADIUS_STEP = 0.2
const BASE_BASS_RADII = [8.0, 8.4, 8.8, 9.2, 9.6]
const BASE_TREBLE_RADII = [10.4, 10.8, 11.2, 11.6, 12.0]
const BASE_STAFF_RADII = [...BASE_BASS_RADII, ...BASE_TREBLE_RADII]
// These glyphs are optically centered by anchoring them to their notation lines,
// then applying a small font-metric correction.
const TREBLE_CLEF_LINE_RADIUS = BASE_TREBLE_RADII[2]
const BASS_CLEF_LINE_RADIUS = BASE_BASS_RADII[2]
const CROSSFADE_EXIT_DURATION = 0.6
const CROSSFADE_ENTER_DURATION = 0.7
const CROSSFADE_ENTER_DELAY = 0.1
const CROSSFADE_NOTE_STAGGER = 0.012
const CROSSFADE_NOTE_STAGGER_CAP = 12
const CROSSFADE_TOTAL_DURATION = Math.max(
  CROSSFADE_EXIT_DURATION,
  CROSSFADE_ENTER_DELAY
  + CROSSFADE_NOTE_STAGGER_CAP * CROSSFADE_NOTE_STAGGER
  + CROSSFADE_ENTER_DURATION,
)
const MIDI_ROLL_FLAT_SPEED = 1.8
const MOBILE_CAMERA_DISTANCE_MULTIPLIERS: Record<CameraView, number> = {
  default: 1.32,
  front: 1.24,
  side: 1.18,
  vortex: 1.2,
  orbit: 1.18,
  zenith: 1.1,
}
const MOBILE_CAMERA_FOV_OFFSETS: Record<CameraView, number> = {
  default: 4,
  front: 4,
  side: 3,
  vortex: 3,
  orbit: 3,
  zenith: 2,
}

const noteGeo = new THREE.CircleGeometry(0.15, 32)
const boxGeo = new THREE.BoxGeometry(1, 1, 1)

type IntroClockRef = MutableRefObject<number | null>
type OrbitControlsRef = RefObject<ComponentRef<typeof OrbitControls> | null>
type FadePhase = 'steady' | 'entering' | 'exiting'

interface CrossfadeState {
  active: boolean
  oldNotes: NoteEvent[]
  newNotes: NoteEvent[]
  startClock: number
  oldFilterTime: number
  pending: NoteEvent[] | null
}

const CROSSFADE_IDLE: CrossfadeState = {
  active: false,
  oldNotes: [],
  newNotes: [],
  startClock: 0,
  oldFilterTime: 0,
  pending: null,
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function smootherStep(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

function getResolvedGlobalTime(
  elapsedClockTime: number,
  timeline?: VisualizerRenderTimeline,
) {
  return timeline?.globalTime ?? elapsedClockTime
}

function getResolvedTransportTime(
  timeline?: VisualizerRenderTimeline,
  frozenTime?: number,
) {
  if (frozenTime !== undefined) {
    return frozenTime
  }

  return timeline?.transportTime ?? Tone.Transport.seconds
}

function getIntroProgress(clockTime: number, introStartRef: IntroClockRef, delay: number, duration: number) {
  if (introStartRef.current === null) {
    introStartRef.current = clockTime
  }

  const normalized = clamp01(
    (clockTime - introStartRef.current - delay) / duration,
  )

  return smootherStep(normalized)
}

function getDiatonicStep(midi: number) {
  const stepMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
  const octave = Math.floor(midi / 12) - 1
  const noteInOctave = midi % 12
  return octave * 7 + stepMap[noteInOctave]
}

function getPlayedGlowIntensity({
  duration,
  idleGlow,
  opacity,
  peakGlow,
  sustainGlow,
  timeDiff,
}: {
  duration: number
  idleGlow: number
  opacity: number
  peakGlow: number
  sustainGlow: number
  timeDiff: number
}) {
  if (timeDiff < 0 || timeDiff > duration) {
    return idleGlow * opacity
  }

  const playProgress = clamp01(timeDiff / Math.max(duration, 0.001))
  const decayProgress = smootherStep(clamp01(playProgress * 2.4))

  return THREE.MathUtils.lerp(peakGlow, sustainGlow, decayProgress) * opacity
}

function vectorFromCameraVector(vector: CameraVector) {
  return new THREE.Vector3(vector.x, vector.y, vector.z)
}

function vectorToCameraVector(vector: THREE.Vector3): CameraVector {
  return {
    x: Number(vector.x.toFixed(3)),
    y: Number(vector.y.toFixed(3)),
    z: Number(vector.z.toFixed(3)),
  }
}

function lerpCameraPose(
  fromPose: CameraPose,
  toPose: CameraPose,
  progress: number,
): CameraPose {
  const fromPosition = vectorFromCameraVector(fromPose.position)
  const toPosition = vectorFromCameraVector(toPose.position)
  const fromTarget = vectorFromCameraVector(fromPose.target)
  const toTarget = vectorFromCameraVector(toPose.target)
  const target = new THREE.Vector3().lerpVectors(fromTarget, toTarget, progress)
  const fromOffset = fromPosition.clone().sub(fromTarget)
  const toOffset = toPosition.clone().sub(toTarget)
  const fromSpherical = new THREE.Spherical().setFromVector3(fromOffset)
  const toSpherical = new THREE.Spherical().setFromVector3(toOffset)
  const thetaDelta = Math.atan2(
    Math.sin(toSpherical.theta - fromSpherical.theta),
    Math.cos(toSpherical.theta - fromSpherical.theta),
  )
  const offsetSpherical = new THREE.Spherical(
    THREE.MathUtils.lerp(fromSpherical.radius, toSpherical.radius, progress),
    THREE.MathUtils.lerp(fromSpherical.phi, toSpherical.phi, progress),
    fromSpherical.theta + thetaDelta * progress,
  )
  const position = new THREE.Vector3()
    .setFromSpherical(offsetSpherical)
    .add(target)

  return {
    flatLock: progress < 0.5 ? fromPose.flatLock : toPose.flatLock,
    fov: THREE.MathUtils.lerp(fromPose.fov, toPose.fov, progress),
    position: vectorToCameraVector(position),
    target: vectorToCameraVector(target),
  }
}

function getResponsiveCameraPose(pose: CameraPose, cameraView: CameraView, isMobileView: boolean): CameraPose {
  if (!isMobileView) {
    return pose
  }

  const target = vectorFromCameraVector(pose.target)
  const nextPosition = vectorFromCameraVector(pose.position)
  const distanceMultiplier
    = MOBILE_CAMERA_DISTANCE_MULTIPLIERS[cameraView] ?? 1.16
  const nextFov = Math.min(
    78,
    pose.fov + (MOBILE_CAMERA_FOV_OFFSETS[cameraView] ?? 3),
  )

  nextPosition.sub(target).multiplyScalar(distanceMultiplier).add(target)

  // Shift scene upward on mobile so the visualisation sits higher,
  // leaving room for the play controls at the bottom.
  const mobileTargetYShift = 3.0
  const shiftedTarget: CameraVector = {
    x: pose.target.x,
    y: pose.target.y - mobileTargetYShift,
    z: pose.target.z,
  }
  nextPosition.y -= mobileTargetYShift

  return {
    flatLock: pose.flatLock,
    fov: nextFov,
    position: vectorToCameraVector(nextPosition),
    target: shiftedTarget,
  }
}

function getExportCameraPose(pose: CameraPose, _cameraView: CameraView): CameraPose {
  const target = vectorFromCameraVector(pose.target)
  const nextPosition = vectorFromCameraVector(pose.position)
  // Pull camera back to compensate for 9:16 portrait crop
  const distanceMultiplier = 1.55
  nextPosition.sub(target).multiplyScalar(distanceMultiplier).add(target)

  return {
    flatLock: pose.flatLock,
    fov: Math.min(90, pose.fov + 6),
    position: vectorToCameraVector(nextPosition),
    target: pose.target,
  }
}

function poseToSignature(pose: CameraPose) {
  return [
    pose.position.x,
    pose.position.y,
    pose.position.z,
    pose.target.x,
    pose.target.y,
    pose.target.z,
    pose.fov,
    pose.flatLock ? 1 : 0,
  ].join(':')
}

function getEffectiveCameraPoseForView(
  cameraPresets: CameraPresetMap,
  cameraView: CameraView,
  exportMode: boolean,
  isMobileView: boolean,
) {
  const basePose = cameraPresets[cameraView]

  if (exportMode) {
    return getExportCameraPose(basePose, cameraView)
  }

  return isMobileView
    ? getResponsiveCameraPose(basePose, cameraView, isMobileView)
    : basePose
}

function getExportResolvedCameraPose(
  cameraPresets: CameraPresetMap,
  cameraView: CameraView,
  globalTime: number,
  introStartRef: IntroClockRef,
): CameraPose {
  const effectivePose = getEffectiveCameraPoseForView(
    cameraPresets,
    cameraView,
    true,
    false,
  )
  const basePosition = vectorFromCameraVector(effectivePose.position)
  const baseTarget = vectorFromCameraVector(effectivePose.target)

  if (cameraView === 'default') {
    const frontPose = getEffectiveCameraPoseForView(
      cameraPresets,
      'front',
      true,
      false,
    )
    const progress = getIntroProgress(
      globalTime,
      introStartRef,
      INTRO_CAMERA_DELAY,
      INTRO_CAMERA_DURATION,
    )
    const position = new THREE.Vector3().lerpVectors(
      vectorFromCameraVector(frontPose.position),
      basePosition,
      progress,
    )
    const target = new THREE.Vector3().lerpVectors(
      vectorFromCameraVector(frontPose.target),
      baseTarget,
      progress,
    )

    return {
      ...effectivePose,
      position: vectorToCameraVector(position),
      target: vectorToCameraVector(target),
    }
  }

  if (cameraView === 'orbit') {
    const orbitOffset = basePosition.clone().sub(baseTarget)
    const orbitRadius = Math.max(0.001, Math.hypot(orbitOffset.x, orbitOffset.z))
    const orbitAngle = Math.atan2(orbitOffset.x, orbitOffset.z)
    const orbitTime = globalTime * 0.3
    const position = new THREE.Vector3(
      baseTarget.x + Math.sin(orbitAngle + orbitTime) * orbitRadius,
      baseTarget.y + orbitOffset.y,
      baseTarget.z + Math.cos(orbitAngle + orbitTime) * orbitRadius,
    )

    return {
      ...effectivePose,
      position: vectorToCameraVector(position),
    }
  }

  return effectivePose
}

function createCircularLineGeometry(radius: number, segments = 240) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array((segments + 1) * 3)

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    const offset = index * 3
    positions[offset] = -Math.sin(angle) * radius
    positions[offset + 1] = Math.cos(angle) * radius
    positions[offset + 2] = 0
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setDrawRange(0, 0)

  return geometry
}

function getNoteIntroDelay(note: NoteEvent, index: number) {
  const stepDistance = Math.abs(getDiatonicStep(note.midi) - 28)
  const radialPhase = clamp01(stepDistance / 16)
  const angularPhase = (((note.time / DEFAULT_TIME_WINDOW) % 1) + 1) % 1
  const localIndexPhase = Math.min(index, 8) * 0.012

  return (
    INTRO_NOTE_APPEAR_DELAY
    + INTRO_NOTE_BASE_DELAY
    + angularPhase * INTRO_NOTE_SWEEP_SPAN
    + radialPhase * 0.08
    + localIndexPhase
  )
}

function getCrossfadeEnterDelay(index: number) {
  return CROSSFADE_ENTER_DELAY
    + Math.min(index, CROSSFADE_NOTE_STAGGER_CAP) * CROSSFADE_NOTE_STAGGER
}

function getNotesSignature(notes: NoteEvent[]) {
  return notes.map(note => note.id).join('|')
}

function getNoteRadius(midi: number) {
  return 10.0 + (getDiatonicStep(midi) - 28) * NOTE_RADIUS_STEP
}

function StaffRing({
  radius,
  index,
  introStartRef,
  timeline,
}: {
  radius: number
  index: number
  introStartRef: IntroClockRef
  timeline?: VisualizerRenderTimeline
}) {
  const geometry = useMemo(() => createCircularLineGeometry(radius), [radius])
  const line = useMemo(
    () =>
      new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: '#ffffff',
          depthWrite: false,
          opacity: 0,
          transparent: true,
        }),
      ),
    [geometry],
  )
  const ringRef = useRef<THREE.Line>(null)
  const maxPoints = geometry.getAttribute('position').count

  useEffect(() => {
    const lineMaterial = line.material as THREE.LineBasicMaterial

    return () => {
      lineMaterial.dispose()
      geometry.dispose()
    }
  }, [geometry, line])

  useFrame(({ clock }) => {
    if (!ringRef.current) {
      return
    }

    const globalTime = getResolvedGlobalTime(clock.getElapsedTime(), timeline)
    const progress = getIntroProgress(
      globalTime,
      introStartRef,
      index * INTRO_RING_STAGGER,
      INTRO_RING_DRAW_DURATION,
    )
    const drawCount
      = progress <= 0 ? 0 : Math.max(2, Math.floor(maxPoints * progress))

    geometry.setDrawRange(0, drawCount)
    ringRef.current.scale.setScalar(0.965 + progress * 0.035)
    ringRef.current.position.z = (1 - progress) * -0.75;
    (ringRef.current.material as THREE.LineBasicMaterial).opacity
      = 0.08 + progress * 0.18
  })

  return <primitive object={line} ref={ringRef} />
}

function Staff({
  introStartRef,
  timeline,
}: {
  introStartRef: IntroClockRef
  timeline?: VisualizerRenderTimeline
}) {
  return (
    <group>
      {BASE_STAFF_RADII.map((radius, index) => (
        <StaffRing
          key={radius}
          radius={radius}
          index={index}
          introStartRef={introStartRef}
          timeline={timeline}
        />
      ))}
    </group>
  )
}

function NoteMesh({
  note,
  timeWindow,
  introStartRef,
  introDelay,
  introDuration = INTRO_NOTE_DURATION,
  fadePhase = 'steady',
  crossfadeStartClock = 0,
  frozenTime,
  timeline,
}: {
  note: NoteEvent
  timeWindow: number
  introStartRef: IntroClockRef
  introDelay: number
  introDuration?: number
  fadePhase?: FadePhase
  crossfadeStartClock?: number
  frozenTime?: number
  timeline?: VisualizerRenderTimeline
}) {
  const groupRef = useRef<THREE.Group>(null)
  const meshMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const targetScale = useMemo(() => new THREE.Vector3(), [])

  const radius = getNoteRadius(note.midi)

  useFrame(({ clock }) => {
    if (!groupRef.current || !meshMatRef.current) {
      return
    }

    const currentTime = getResolvedTransportTime(timeline, frozenTime)
    const elapsed = getResolvedGlobalTime(clock.getElapsedTime(), timeline)

    let displayProgress: number
    if (fadePhase === 'exiting') {
      displayProgress
        = 1
          - smootherStep(
            clamp01((elapsed - crossfadeStartClock) / CROSSFADE_EXIT_DURATION),
          )
    }
    else if (fadePhase === 'entering') {
      displayProgress = smootherStep(
        clamp01(
          (elapsed - crossfadeStartClock - introDelay)
          / CROSSFADE_ENTER_DURATION,
        ),
      )
    }
    else {
      displayProgress = getIntroProgress(
        elapsed,
        introStartRef,
        introDelay,
        introDuration,
      )
    }

    const angle = ((note.time - currentTime) / timeWindow) * Math.PI * 2
    let normalizedAngle = angle % (Math.PI * 2)

    if (normalizedAngle > Math.PI)
      normalizedAngle -= Math.PI * 2
    if (normalizedAngle < -Math.PI)
      normalizedAngle += Math.PI * 2

    const distance = Math.abs(normalizedAngle)
    const fadeStart = Math.PI * 0.55
    const fadeEnd = Math.PI
    const opacity
      = distance > fadeStart
        ? smootherStep(1 - (distance - fadeStart) / (fadeEnd - fadeStart))
        : 1

    const angleDuration = (note.duration / timeWindow) * Math.PI * 2
    const isPlaying = normalizedAngle <= 0 && normalizedAngle >= -angleDuration

    const animatedRadius = radius * (0.3 + displayProgress * 0.7)
    groupRef.current.position.x = -Math.sin(normalizedAngle) * animatedRadius
    groupRef.current.position.y
      = Math.cos(normalizedAngle) * animatedRadius + (1 - displayProgress) * 0.22
    groupRef.current.position.z = (1 - displayProgress) * -1.9
    groupRef.current.rotation.z = normalizedAngle

    meshMatRef.current.opacity = opacity * displayProgress
    meshMatRef.current.color.setHex(0xFFFFFF)
    meshMatRef.current.emissive.setHex(0xFFFFFF)

    meshMatRef.current.emissiveIntensity = getPlayedGlowIntensity({
      duration: note.duration,
      idleGlow: 0.18,
      opacity: meshMatRef.current.opacity,
      peakGlow: 1.6 + note.velocity * 1.4,
      sustainGlow: 0.52 + note.velocity * 0.44,
      timeDiff: currentTime - note.time,
    })

    const playScale = isPlaying ? 1.5 + note.velocity : 1
    const introScale = 0.28 + displayProgress * 0.72
    targetScale.setScalar(playScale * introScale)
    groupRef.current.scale.lerp(targetScale, 0.18)
  })

  return (
    <group ref={groupRef} scale={0.001}>
      <Billboard>
        <mesh geometry={noteGeo} renderOrder={10}>
          <meshStandardMaterial
            ref={meshMatRef}
            depthWrite={false}
            transparent
            opacity={0}
            roughness={0.2}
            metalness={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
    </group>
  )
}

function MidiRollNote({
  isFlatView,
  note,
  speed,
  introStartRef,
  introDelay,
  introDuration = INTRO_NOTE_DURATION,
  fadePhase = 'steady',
  crossfadeStartClock = 0,
  frozenTime,
  timeline,
}: {
  isFlatView: boolean
  note: NoteEvent
  speed: number
  introStartRef: IntroClockRef
  introDelay: number
  introDuration?: number
  fadePhase?: FadePhase
  crossfadeStartClock?: number
  frozenTime?: number
  timeline?: VisualizerRenderTimeline
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  const x = ((note.midi - 60) / 20) * 6
  const length = note.duration * speed

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current) {
      return
    }

    const currentTime = getResolvedTransportTime(timeline, frozenTime)
    const elapsed = getResolvedGlobalTime(clock.getElapsedTime(), timeline)

    let displayProgress: number
    if (fadePhase === 'exiting') {
      displayProgress
        = 1
          - smootherStep(
            clamp01((elapsed - crossfadeStartClock) / CROSSFADE_EXIT_DURATION),
          )
    }
    else if (fadePhase === 'entering') {
      displayProgress = smootherStep(
        clamp01(
          (elapsed - crossfadeStartClock - introDelay)
          / CROSSFADE_ENTER_DURATION,
        ),
      )
    }
    else {
      displayProgress = getIntroProgress(
        elapsed,
        introStartRef,
        introDelay,
        introDuration,
      )
    }

    const timeDiff = note.time - currentTime
    const z = -(timeDiff + note.duration / 2) * speed
    const transitionBackShift = (1 - displayProgress) * -0.55

    if (isFlatView) {
      meshRef.current.position.set(x, -z + transitionBackShift, 0)
      meshRef.current.renderOrder = 5
      meshRef.current.scale.set(
        0.2 + displayProgress * 0.1,
        length * (0.42 + displayProgress * 0.58),
        0.1,
      )
    }
    else {
      meshRef.current.position.set(x, transitionBackShift, z)
      meshRef.current.renderOrder = 6
      meshRef.current.scale.set(
        0.15 + displayProgress * 0.15,
        0.04 + displayProgress * 0.06,
        length * (0.42 + displayProgress * 0.58),
      )
    }

    const isPlaying = timeDiff <= 0 && timeDiff >= -note.duration
    const distance = Math.abs(z)
    const opacity = Math.max(0, 1 - distance / 60) * displayProgress

    matRef.current.opacity = opacity

    if (isPlaying) {
      matRef.current.color.setHex(0xFFFFFF)
      matRef.current.emissive.setHex(0xFFFFFF)
    }
    else {
      matRef.current.color.setHex(0x888888)
      matRef.current.emissive.setHex(0x444444)
    }

    matRef.current.emissiveIntensity = getPlayedGlowIntensity({
      duration: note.duration,
      idleGlow: 0.22,
      opacity,
      peakGlow: 1.25 + note.velocity * 0.9,
      sustainGlow: 0.42 + note.velocity * 0.28,
      timeDiff: currentTime - note.time,
    })
  })

  return (
    <mesh ref={meshRef} geometry={boxGeo}>
      <meshStandardMaterial
        ref={matRef}
        depthTest={!isFlatView}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        transparent
        opacity={0}
      />
    </mesh>
  )
}

function MidiRoll({
  isFlatView,
  notes,
  filterTime,
  timeWindow,
  introStartRef,
  fadePhase = 'steady',
  crossfadeStartClock = 0,
  frozenTime,
  timeline,
}: {
  isFlatView: boolean
  notes: NoteEvent[]
  filterTime: number
  timeWindow: number
  introStartRef: IntroClockRef
  fadePhase?: FadePhase
  crossfadeStartClock?: number
  frozenTime?: number
  timeline?: VisualizerRenderTimeline
}) {
  const speed = isFlatView ? MIDI_ROLL_FLAT_SPEED : 10
  const lookAhead = timeWindow * 1.5

  const rollNotes = useMemo(
    () =>
      notes.filter(
        note =>
          note.time >= filterTime - 2 && note.time <= filterTime + lookAhead,
      ),
    [notes, filterTime, lookAhead],
  )

  return (
    <group position={isFlatView ? [0, 8, -0.1] : [0, -2, 0]}>
      {rollNotes.map((note, index) => (
        <MidiRollNote
          key={`roll-${note.id}`}
          isFlatView={isFlatView}
          note={note}
          speed={speed}
          introStartRef={introStartRef}
          introDelay={
            fadePhase === 'entering'
              ? getCrossfadeEnterDelay(index)
              : INTRO_NOTE_APPEAR_DELAY
                + INTRO_NOTE_BASE_DELAY
                + Math.min(index, 18) * 0.016
          }
          introDuration={fadePhase === 'steady' ? 0.72 : undefined}
          fadePhase={fadePhase}
          crossfadeStartClock={crossfadeStartClock}
          frozenTime={frozenTime}
          timeline={timeline}
        />
      ))}
    </group>
  )
}

function createClefTexture(glyph: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Try each font in the stack individually until one renders the glyph
  const fonts = CLEF_FONT_STACK.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''))
  const fontSize = Math.round(size * 0.65)
  let rendered = false
  for (const font of fonts) {
    ctx.font = `${fontSize}px "${font}"`
    const metrics = ctx.measureText(glyph)
    // If the font can render it, the width will be non-trivial
    if (metrics.width > fontSize * 0.1) {
      ctx.fillText(glyph, size / 2, size / 2)
      rendered = true
      break
    }
  }
  if (!rendered) {
    ctx.font = `${fontSize}px serif`
    ctx.fillText(glyph, size / 2, size / 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

const clefPlaneGeo = new THREE.PlaneGeometry(1, 1)

function ClefSprite({
  glyph,
  spriteRef,
  position,
  scale = 1,
}: {
  glyph: string
  spriteRef: RefObject<THREE.Mesh | null>
  position: [number, number, number]
  scale?: number
}) {
  const texture = useMemo(() => createClefTexture(glyph), [glyph])
  const spriteScale = 3.2 * scale

  useEffect(() => {
    return () => {
      texture.dispose()
    }
  }, [texture])

  return (
    <mesh ref={spriteRef} position={position} geometry={clefPlaneGeo} scale={[spriteScale, spriteScale, 1]}>
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function Playhead({
  introStartRef,
  timeline,
}: {
  introStartRef: IntroClockRef
  timeline?: VisualizerRenderTimeline
}) {
  const groupRef = useRef<THREE.Group>(null)
  const trebleRef = useRef<THREE.Mesh>(null)
  const bassRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return
    }

    const globalTime = getResolvedGlobalTime(clock.getElapsedTime(), timeline)
    const progress = getIntroProgress(
      globalTime,
      introStartRef,
      INTRO_PLAYHEAD_DELAY,
      INTRO_PLAYHEAD_DURATION,
    )
    const opacity = 0.55 * progress

    groupRef.current.scale.setScalar(0.82 + progress * 0.18)
    groupRef.current.position.y = (1 - progress) * 0.55
    groupRef.current.position.z = 0

    if (trebleRef.current) {
      (trebleRef.current.material as THREE.MeshBasicMaterial).opacity = opacity
    }

    if (bassRef.current) {
      (bassRef.current.material as THREE.MeshBasicMaterial).opacity = opacity
    }
  })

  return (
    <group ref={groupRef} scale={0.001}>
      <ClefSprite
        glyph="𝄞"
        spriteRef={trebleRef}
        position={[0, TREBLE_CLEF_LINE_RADIUS, CLEF_Z_OFFSET]}
        scale={TREBLE_CLEF_SCALE}
      />
      <ClefSprite
        glyph="𝄢"
        spriteRef={bassRef}
        position={[0, BASS_CLEF_LINE_RADIUS, CLEF_Z_OFFSET]}
        scale={BASS_CLEF_SCALE}
      />
    </group>
  )
}

function CameraController({
  cameraView,
  cameraPresets,
  controlsRef,
  exportMode,
  exportCameraMode,
  isCameraEditing,
  isMobileView,
  introStartRef,
  timeline,
}: {
  cameraView: VisualizerSettings['cameraView']
  cameraPresets: CameraPresetMap
  controlsRef: OrbitControlsRef
  exportMode: boolean
  exportCameraMode?: ExportCameraMode
  isCameraEditing: boolean
  isMobileView: boolean
  introStartRef: IntroClockRef
  timeline?: VisualizerRenderTimeline
}) {
  const { camera: rawCamera } = useThree()
  const cameraRef = useRef(rawCamera as THREE.PerspectiveCamera)
  const lookAtTarget = useRef(new THREE.Vector3(0, 0, 0))
  const targetPos = useRef(new THREE.Vector3())
  const targetLookAt = useRef(new THREE.Vector3())
  const orbitStartTime = useRef<number | null>(null)
  const prevCameraView = useRef(cameraView)
  const activePose = cameraPresets[cameraView]
  const effectivePose
    = exportMode
      ? getExportCameraPose(activePose, cameraView)
      : isCameraEditing || !isMobileView
        ? activePose
        : getResponsiveCameraPose(activePose, cameraView, isMobileView)
  const activePoseSignature = poseToSignature(activePose)

  useEffect(() => {
    cameraRef.current = rawCamera as THREE.PerspectiveCamera
  }, [rawCamera])

  useEffect(() => {
    if (!isCameraEditing) {
      prevCameraView.current = cameraView
      return
    }

    const camera = cameraRef.current
    const nextPosition = vectorFromCameraVector(effectivePose.position)
    const nextTarget = vectorFromCameraVector(effectivePose.target)

    prevCameraView.current = cameraView

    camera.position.copy(nextPosition)
    lookAtTarget.current.copy(nextTarget)
    camera.fov = effectivePose.fov
    camera.updateProjectionMatrix()
    camera.lookAt(nextTarget)

    if (controlsRef.current) {
      controlsRef.current.target.copy(nextTarget)
      controlsRef.current.update()
    }
  }, [
    effectivePose.fov,
    activePose.position,
    activePose.target,
    activePoseSignature,
    cameraView,
    controlsRef,
    effectivePose.position,
    effectivePose.target,
    isCameraEditing,
    isMobileView,
  ])

  useFrame(({ clock }) => {
    if (isCameraEditing) {
      return
    }

    const globalTime = getResolvedGlobalTime(clock.getElapsedTime(), timeline)
    const camera = cameraRef.current

    if (exportMode && timeline) {
      const transition = getExportCameraTransitionState(
        globalTime,
        exportCameraMode ?? 'current',
        cameraView,
      )
      const fromPose = getExportResolvedCameraPose(
        cameraPresets,
        transition.fromView,
        transition.fromSampleTime,
        introStartRef,
      )
      const toPose = getExportResolvedCameraPose(
        cameraPresets,
        transition.toView,
        transition.toSampleTime,
        introStartRef,
      )
      const resolvedPose = lerpCameraPose(
        fromPose,
        toPose,
        transition.progress,
      )
      const nextPosition = vectorFromCameraVector(resolvedPose.position)
      const nextTarget = vectorFromCameraVector(resolvedPose.target)

      camera.position.copy(nextPosition)
      lookAtTarget.current.copy(nextTarget)

      if (Math.abs(resolvedPose.fov - camera.fov) > 0.001) {
        camera.fov = resolvedPose.fov
        camera.updateProjectionMatrix()
      }

      camera.lookAt(nextTarget)
      return
    }

    const basePosition = vectorFromCameraVector(effectivePose.position)
    const baseTarget = vectorFromCameraVector(effectivePose.target)

    targetPos.current.copy(basePosition)
    targetLookAt.current.copy(baseTarget)

    if (cameraView === 'default') {
      const frontPose = getResponsiveCameraPose(
        cameraPresets.front,
        'front',
        isMobileView,
      )
      const progress = getIntroProgress(
        globalTime,
        introStartRef,
        INTRO_CAMERA_DELAY,
        INTRO_CAMERA_DURATION,
      )

      targetPos.current.lerpVectors(
        vectorFromCameraVector(frontPose.position),
        basePosition,
        progress,
      )
      targetLookAt.current.lerpVectors(
        vectorFromCameraVector(frontPose.target),
        baseTarget,
        progress,
      )
    }
    else if (cameraView === 'orbit') {
      if (orbitStartTime.current === null) {
        orbitStartTime.current = globalTime
      }
      const orbitOffset = basePosition.clone().sub(baseTarget)
      const orbitRadius = Math.max(
        0.001,
        Math.hypot(orbitOffset.x, orbitOffset.z),
      )
      const orbitAngle = Math.atan2(orbitOffset.x, orbitOffset.z)
      const orbitTime
        = (globalTime - orbitStartTime.current) * 0.3

      targetPos.current.set(
        baseTarget.x + Math.sin(orbitAngle + orbitTime) * orbitRadius,
        baseTarget.y + orbitOffset.y,
        baseTarget.z + Math.cos(orbitAngle + orbitTime) * orbitRadius,
      )
    }
    else {
      orbitStartTime.current = null
    }

    const lerpFactor = cameraView === 'default' ? 0.075 : 0.05
    camera.position.lerp(targetPos.current, lerpFactor)
    lookAtTarget.current.lerp(targetLookAt.current, lerpFactor)
    const nextFov = THREE.MathUtils.lerp(
      camera.fov,
      effectivePose.fov,
      lerpFactor,
    )

    if (Math.abs(nextFov - camera.fov) > 0.001) {
      camera.fov = nextFov
      camera.updateProjectionMatrix()
    }

    camera.lookAt(lookAtTarget.current)
  })

  return null
}

function Scene({
  cameraPresets,
  exportMode,
  exportCameraMode,
  isCameraEditing,
  notes,
  onCameraPoseChange,
  settings,
  isMobileView,
  timeline,
}: {
  cameraPresets: CameraPresetMap
  exportMode: boolean
  exportCameraMode?: ExportCameraMode
  isCameraEditing: boolean
  isMobileView: boolean
  notes: NoteEvent[]
  onCameraPoseChange?: (pose: CameraPose) => void
  settings: VisualizerSettings
  timeline?: VisualizerRenderTimeline
}) {
  const [displayNotes, setDisplayNotes] = useState<NoteEvent[]>(notes)
  const [crossfadeState, setCrossfadeState] = useState<CrossfadeState>({
    ...CROSSFADE_IDLE,
  })
  const [filterTime, setFilterTime] = useState(0)
  const introStartRef = useRef<number | null>(null)
  const noteIntroStartRef = useRef<number | null>(null)
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null)
  const crossfadeRef = useRef<CrossfadeState>({ ...CROSSFADE_IDLE })
  const lastClockRef = useRef(0)
  const displaySignatureRef = useRef(getNotesSignature(notes))
  const { showMidiRoll, cameraView } = settings
  const timeWindow = DEFAULT_TIME_WINDOW
  const activeNoteSignature = getNotesSignature(notes)
  const displayNoteSignature = useMemo(
    () => getNotesSignature(displayNotes),
    [displayNotes],
  )
  const activePose = cameraPresets[cameraView]
  const isFlatEditing = isCameraEditing && activePose.flatLock
  const hasExplicitTimeline = Boolean(timeline)
  const resolvedFilterTime = timeline?.transportTime ?? filterTime

  useEffect(() => {
    if (!hasExplicitTimeline) {
      return
    }

    introStartRef.current = 0
    noteIntroStartRef.current = 0
  }, [hasExplicitTimeline])

  const handleControlsChange = () => {
    if (!isCameraEditing || !onCameraPoseChange || !controlsRef.current) {
      return
    }

    const controlCamera = controlsRef.current.object as THREE.PerspectiveCamera
    const controlTarget = controlsRef.current.target as THREE.Vector3

    onCameraPoseChange({
      position: vectorToCameraVector(controlCamera.position),
      target: activePose.flatLock
        ? {
            x: Number(controlCamera.position.x.toFixed(3)),
            y: Number(controlCamera.position.y.toFixed(3)),
            z: Number(controlTarget.z.toFixed(3)),
          }
        : vectorToCameraVector(controlTarget),
      fov: Number(controlCamera.fov.toFixed(2)),
      flatLock: activePose.flatLock,
    })
  }

  useLayoutEffect(() => {
    if (activeNoteSignature === displaySignatureRef.current) {
      if (!crossfadeRef.current.active && notes !== displayNotes) {
        queueMicrotask(() => {
          setDisplayNotes(notes)
        })
      }
      return
    }

    // When notes arrive for the first time (from an empty set), skip the
    // crossfade and reset the intro clock so the full intro sweep plays.
    if (displayNotes.length === 0 && notes.length > 0) {
      noteIntroStartRef.current = null
      displaySignatureRef.current = activeNoteSignature
      setDisplayNotes(notes)
      return
    }

    const cf = crossfadeRef.current
    if (cf.active) {
      crossfadeRef.current = { ...cf, pending: notes }
      return
    }

    const nextCrossfade = {
      active: true,
      oldNotes: displayNotes,
      newNotes: notes,
      startClock: lastClockRef.current,
      oldFilterTime: filterTime,
      pending: null,
    }
    crossfadeRef.current = nextCrossfade
    setCrossfadeState(nextCrossfade)
    displaySignatureRef.current = activeNoteSignature
    setFilterTime(resolvedFilterTime)
  }, [activeNoteSignature, displayNotes, notes, resolvedFilterTime])

  useFrame(({ clock }) => {
    const globalTime = getResolvedGlobalTime(clock.getElapsedTime(), timeline)
    const transportTime = timeline?.transportTime ?? Tone.Transport.seconds

    lastClockRef.current = globalTime

    if (!timeline && Math.abs(transportTime - filterTime) > 0.5) {
      setFilterTime(transportTime)
    }

    const cf = crossfadeRef.current
    if (
      cf.active
      && globalTime - cf.startClock >= CROSSFADE_TOTAL_DURATION
    ) {
      if (cf.pending) {
        const nextCrossfade = {
          active: true,
          oldNotes: cf.newNotes,
          newNotes: cf.pending,
          startClock: globalTime,
          oldFilterTime: transportTime,
          pending: null,
        }
        crossfadeRef.current = nextCrossfade
        setCrossfadeState(nextCrossfade)
        if (!timeline) {
          setFilterTime(transportTime)
        }
      }
      else {
        const settled = cf.newNotes
        crossfadeRef.current = { ...CROSSFADE_IDLE }
        setCrossfadeState({ ...CROSSFADE_IDLE })
        displaySignatureRef.current = getNotesSignature(settled)
        setDisplayNotes(settled)
      }
    }
  })

  const cf = crossfadeState
  const isCrossfading
    = cf.active || activeNoteSignature !== displayNoteSignature
  const crossfadeStartClock = cf.startClock

  const visibleDisplayNotes = useMemo(() => {
    const paddedWindow = timeWindow + 4
    return displayNotes.filter(
      note =>
        note.time >= resolvedFilterTime - paddedWindow / 2
        && note.time <= resolvedFilterTime + paddedWindow / 2,
    )
  }, [displayNotes, resolvedFilterTime, timeWindow])

  const exitFilterTime = cf.active ? cf.oldFilterTime : resolvedFilterTime
  const crossfadeOldNotes = cf.active ? cf.oldNotes : displayNotes
  const visibleExitingNotes = useMemo(() => {
    if (!isCrossfading)
      return []
    const paddedWindow = timeWindow + 4
    return crossfadeOldNotes.filter(
      note =>
        note.time >= exitFilterTime - paddedWindow / 2
        && note.time <= exitFilterTime + paddedWindow / 2,
    )
  }, [crossfadeOldNotes, exitFilterTime, isCrossfading, timeWindow])

  const crossfadeNewNotes = cf.active ? cf.newNotes : notes
  const visibleEnteringNotes = useMemo(() => {
    if (!isCrossfading)
      return []
    const paddedWindow = timeWindow + 4
    return crossfadeNewNotes.filter(
      note =>
        note.time >= resolvedFilterTime - paddedWindow / 2
        && note.time <= resolvedFilterTime + paddedWindow / 2,
    )
  }, [crossfadeNewNotes, isCrossfading, resolvedFilterTime, timeWindow])

  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 0, 10]} intensity={1} color="#ffffff" />

      {showMidiRoll && (
        <>
          {isCrossfading && (
            <MidiRoll
              isFlatView={activePose.flatLock}
              notes={crossfadeOldNotes}
              filterTime={exitFilterTime}
              timeWindow={timeWindow}
              introStartRef={noteIntroStartRef}
              fadePhase="exiting"
              crossfadeStartClock={crossfadeStartClock}
              frozenTime={exitFilterTime}
              timeline={timeline}
            />
          )}
          <MidiRoll
            isFlatView={activePose.flatLock}
            notes={isCrossfading ? crossfadeNewNotes : displayNotes}
            filterTime={resolvedFilterTime}
            timeWindow={timeWindow}
            introStartRef={noteIntroStartRef}
            fadePhase={isCrossfading ? 'entering' : 'steady'}
            crossfadeStartClock={crossfadeStartClock}
            timeline={timeline}
          />
        </>
      )}

      <group rotation={[0, 0, 0]}>
        <Staff introStartRef={introStartRef} timeline={timeline} />
        {isCrossfading
          && visibleExitingNotes.map(note => (
            <NoteMesh
              key={`note-exit-${note.id}`}
              note={note}
              timeWindow={timeWindow}
              introStartRef={noteIntroStartRef}
              introDelay={0}
              fadePhase="exiting"
              crossfadeStartClock={crossfadeStartClock}
              frozenTime={exitFilterTime}
              timeline={timeline}
            />
          ))}
        {isCrossfading
          ? visibleEnteringNotes.map((note, index) => (
              <NoteMesh
                key={`note-${note.id}`}
                note={note}
                timeWindow={timeWindow}
                introStartRef={noteIntroStartRef}
                introDelay={getCrossfadeEnterDelay(index)}
                fadePhase="entering"
                crossfadeStartClock={crossfadeStartClock}
                timeline={timeline}
              />
            ))
          : visibleDisplayNotes.map((note, index) => (
              <NoteMesh
                key={`note-${note.id}`}
                note={note}
                timeWindow={timeWindow}
                introStartRef={noteIntroStartRef}
                introDelay={getNoteIntroDelay(note, index)}
                timeline={timeline}
              />
            ))}
        <Playhead introStartRef={introStartRef} timeline={timeline} />
      </group>

      <CameraController
        cameraPresets={cameraPresets}
        cameraView={cameraView}
        controlsRef={controlsRef}
        exportMode={exportMode}
        exportCameraMode={exportCameraMode}
        introStartRef={introStartRef}
        isCameraEditing={isCameraEditing}
        isMobileView={isMobileView}
        timeline={timeline}
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={isCameraEditing}
        enableRotate={!isFlatEditing}
        maxDistance={50}
        minDistance={5}
        autoRotate={false}
        autoRotateSpeed={0.5}
        enabled={isCameraEditing}
        mouseButtons={
          isFlatEditing
            ? {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
              }
            : undefined
        }
        onChange={handleControlsChange}
        onEnd={handleControlsChange}
        screenSpacePanning={isFlatEditing}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.24}
          luminanceSmoothing={0.9}
          intensity={DEFAULT_BLOOM_INTENSITY}
        />
      </EffectComposer>
    </>
  )
}

function CanvasElementBridge({
  onCanvasElement,
  onExportFrameController,
}: {
  onCanvasElement?: (el: HTMLCanvasElement) => void
  onExportFrameController?: (controller: ExportFrameController | null) => void
}) {
  const { advance, gl } = useThree()

  useEffect(() => {
    onCanvasElement?.(gl.domElement)
    onExportFrameController?.({
      canvas: gl.domElement,
      renderFrame: (timestampMs: number) => {
        advance(timestampMs, true)
      },
    })

    return () => {
      onExportFrameController?.(null)
    }
  }, [advance, gl, onCanvasElement, onExportFrameController])

  return null
}

export function Visualizer({
  cameraPresets,
  exportMode = false,
  exportCameraMode,
  isCameraEditing = false,
  isMobileView = false,
  notes,
  onCameraPoseChange,
  onCanvasElement,
  onExportFrameController,
  renderTimeline,
  settings,
}: {
  cameraPresets: CameraPresetMap
  exportMode?: boolean
  exportCameraMode?: ExportCameraMode
  isCameraEditing?: boolean
  isMobileView?: boolean
  notes: NoteEvent[]
  onCameraPoseChange?: (pose: CameraPose) => void
  onCanvasElement?: (el: HTMLCanvasElement) => void
  onExportFrameController?: (controller: ExportFrameController | null) => void
  renderTimeline?: VisualizerRenderTimeline
  settings: VisualizerSettings
}) {
  const activePose = cameraPresets[settings.cameraView]
  const initialPose
    = exportMode
      ? getExportCameraPose(activePose, settings.cameraView)
      : isCameraEditing || !isMobileView
        ? activePose
        : getResponsiveCameraPose(activePose, settings.cameraView, isMobileView)
  const cameraConfig = useMemo(
    () => ({
      fov: initialPose.fov,
      position: [
        initialPose.position.x,
        initialPose.position.y,
        initialPose.position.z,
      ] as [number, number, number],
    }),
    [
      initialPose.fov,
      initialPose.position.x,
      initialPose.position.y,
      initialPose.position.z,
    ],
  )

  const glProps = exportMode
    ? { preserveDrawingBuffer: true, alpha: false }
    : undefined

  return (
    <Canvas
      camera={cameraConfig}
      dpr={exportMode ? 1 : undefined}
      frameloop={exportMode ? 'never' : 'always'}
      gl={glProps}
    >
      {(onCanvasElement || onExportFrameController) && (
        <CanvasElementBridge
          onCanvasElement={onCanvasElement}
          onExportFrameController={onExportFrameController}
        />
      )}
      <Scene
        cameraPresets={cameraPresets}
        exportMode={exportMode}
        exportCameraMode={exportCameraMode}
        isCameraEditing={isCameraEditing}
        isMobileView={isMobileView}
        notes={notes}
        onCameraPoseChange={onCameraPoseChange}
        timeline={renderTimeline}
        settings={settings}
      />
    </Canvas>
  )
}
