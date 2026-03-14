"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import * as Tone from "tone";
import {
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { NoteEvent } from "@/lib/music";
import {
  CameraPose,
  CameraPresetMap,
  CameraVector,
  CameraView,
} from "@/lib/camera-presets";

export interface VisualizerSettings {
  showMidiRoll: boolean;
  cameraView: CameraView;
}

const DEFAULT_TIME_WINDOW = 10;
const DEFAULT_BLOOM_INTENSITY = 1.2;
const CLEF_FONT_STACK =
  '"Segoe UI Symbol", "Cambria Math", "STIX Two Text", "Noto Music", serif';
const CLEF_FONT_SIZE_PX = 72;
const TREBLE_CLEF_SCALE = 1.05;
const BASS_CLEF_SCALE = 0.656;
const CLEF_Z_OFFSET = 0.08;
const NOTE_RADIUS_STEP = 0.2;
const BASE_BASS_RADII = [8.0, 8.4, 8.8, 9.2, 9.6];
const BASE_TREBLE_RADII = [10.4, 10.8, 11.2, 11.6, 12.0];
const BASE_STAFF_RADII = [...BASE_BASS_RADII, ...BASE_TREBLE_RADII];
// These glyphs are optically centered by anchoring them to their notation lines,
// then applying a small font-metric correction.
const TREBLE_CLEF_LINE_RADIUS = BASE_TREBLE_RADII[2];
const TREBLE_CLEF_OFFSET_Y_EM = -0.02;
const BASS_CLEF_LINE_RADIUS = BASE_BASS_RADII[2];
const BASS_CLEF_OFFSET_Y_EM = -0.02;
const INTRO_RING_DRAW_DURATION = 1.07;
const INTRO_RING_STAGGER = 0.065;
const INTRO_NOTE_BASE_DELAY = 0.75;
const INTRO_NOTE_SWEEP_SPAN = 0.96;
const INTRO_NOTE_DURATION = 0.99;
const INTRO_NOTE_APPEAR_DELAY = 1;
const CROSSFADE_EXIT_DURATION = 0.6;
const CROSSFADE_ENTER_DURATION = 0.7;
const CROSSFADE_ENTER_DELAY = 0.1;
const CROSSFADE_NOTE_STAGGER = 0.012;
const CROSSFADE_NOTE_STAGGER_CAP = 12;
const CROSSFADE_TOTAL_DURATION = Math.max(
  CROSSFADE_EXIT_DURATION,
  CROSSFADE_ENTER_DELAY +
    CROSSFADE_NOTE_STAGGER_CAP * CROSSFADE_NOTE_STAGGER +
    CROSSFADE_ENTER_DURATION,
);
const MIDI_ROLL_FLAT_SPEED = 1.8;
const INTRO_CAMERA_DELAY = 0;
const INTRO_PLAYHEAD_DELAY = 0.6;
const INTRO_PLAYHEAD_DURATION = 2;
const INTRO_CAMERA_DURATION = 1.95;
const MOBILE_CAMERA_DISTANCE_MULTIPLIERS: Record<CameraView, number> = {
  topThird: 1.32,
  front: 1.24,
  top: 1.18,
  side: 1.18,
  dynamic: 1.22,
  isometric: 1.14,
  vortex: 1.2,
  orbit: 1.18,
  zenith: 1.1,
};
const MOBILE_CAMERA_FOV_OFFSETS: Record<CameraView, number> = {
  topThird: 4,
  front: 4,
  top: 3,
  side: 3,
  dynamic: 4,
  isometric: 3,
  vortex: 3,
  orbit: 3,
  zenith: 2,
};

const noteGeo = new THREE.CircleGeometry(0.15, 32);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

type IntroClockRef = MutableRefObject<number | null>;
type OrbitControlsRef = RefObject<any>;
type FadePhase = "steady" | "entering" | "exiting";

interface CrossfadeState {
  active: boolean;
  oldNotes: NoteEvent[];
  newNotes: NoteEvent[];
  startClock: number;
  oldFilterTime: number;
  pending: NoteEvent[] | null;
}

const CROSSFADE_IDLE: CrossfadeState = {
  active: false,
  oldNotes: [],
  newNotes: [],
  startClock: 0,
  oldFilterTime: 0,
  pending: null,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smootherStep = (value: number) =>
  value * value * value * (value * (value * 6 - 15) + 10);

const getIntroProgress = (
  clockTime: number,
  introStartRef: IntroClockRef,
  delay: number,
  duration: number,
) => {
  if (introStartRef.current === null) {
    introStartRef.current = clockTime;
  }

  const normalized = clamp01(
    (clockTime - introStartRef.current - delay) / duration,
  );

  return smootherStep(normalized);
};

const getDiatonicStep = (midi: number) => {
  const stepMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const octave = Math.floor(midi / 12) - 1;
  const noteInOctave = midi % 12;
  return octave * 7 + stepMap[noteInOctave];
};

const getPlayedGlowIntensity = ({
  duration,
  idleGlow,
  opacity,
  peakGlow,
  sustainGlow,
  timeDiff,
}: {
  duration: number;
  idleGlow: number;
  opacity: number;
  peakGlow: number;
  sustainGlow: number;
  timeDiff: number;
}) => {
  if (timeDiff < 0 || timeDiff > duration) {
    return idleGlow * opacity;
  }

  const playProgress = clamp01(timeDiff / Math.max(duration, 0.001));
  const decayProgress = smootherStep(clamp01(playProgress * 2.4));

  return THREE.MathUtils.lerp(peakGlow, sustainGlow, decayProgress) * opacity;
};

const vectorFromCameraVector = (vector: CameraVector) =>
  new THREE.Vector3(vector.x, vector.y, vector.z);

const vectorToCameraVector = (vector: THREE.Vector3): CameraVector => ({
  x: Number(vector.x.toFixed(3)),
  y: Number(vector.y.toFixed(3)),
  z: Number(vector.z.toFixed(3)),
});

const getResponsiveCameraPose = (
  pose: CameraPose,
  cameraView: CameraView,
  isMobileView: boolean,
): CameraPose => {
  if (!isMobileView) {
    return pose;
  }

  const target = vectorFromCameraVector(pose.target);
  const nextPosition = vectorFromCameraVector(pose.position);
  const distanceMultiplier =
    MOBILE_CAMERA_DISTANCE_MULTIPLIERS[cameraView] ?? 1.16;
  const nextFov = Math.min(
    78,
    pose.fov + (MOBILE_CAMERA_FOV_OFFSETS[cameraView] ?? 3),
  );

  nextPosition.sub(target).multiplyScalar(distanceMultiplier).add(target);

  // Shift scene upward on mobile so the visualisation sits higher,
  // leaving room for the play controls at the bottom.
  const mobileTargetYShift = 3.0;
  const shiftedTarget: CameraVector = {
    x: pose.target.x,
    y: pose.target.y - mobileTargetYShift,
    z: pose.target.z,
  };
  nextPosition.y -= mobileTargetYShift;

  return {
    flatLock: pose.flatLock,
    fov: nextFov,
    position: vectorToCameraVector(nextPosition),
    target: shiftedTarget,
  };
};

const poseToSignature = (pose: CameraPose) =>
  [
    pose.position.x,
    pose.position.y,
    pose.position.z,
    pose.target.x,
    pose.target.y,
    pose.target.z,
    pose.fov,
    pose.flatLock ? 1 : 0,
  ].join(":");

const createCircularLineGeometry = (radius: number, segments = 240) => {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array((segments + 1) * 3);

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const offset = index * 3;
    positions[offset] = -Math.sin(angle) * radius;
    positions[offset + 1] = Math.cos(angle) * radius;
    positions[offset + 2] = 0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);

  return geometry;
};

const getNoteIntroDelay = (note: NoteEvent, index: number) => {
  const stepDistance = Math.abs(getDiatonicStep(note.midi) - 28);
  const radialPhase = clamp01(stepDistance / 16);
  const angularPhase = (((note.time / DEFAULT_TIME_WINDOW) % 1) + 1) % 1;
  const localIndexPhase = Math.min(index, 8) * 0.012;

  return (
    INTRO_NOTE_APPEAR_DELAY +
    INTRO_NOTE_BASE_DELAY +
    angularPhase * INTRO_NOTE_SWEEP_SPAN +
    radialPhase * 0.08 +
    localIndexPhase
  );
};

const getCrossfadeEnterDelay = (index: number) =>
  CROSSFADE_ENTER_DELAY +
  Math.min(index, CROSSFADE_NOTE_STAGGER_CAP) * CROSSFADE_NOTE_STAGGER;

const getNotesSignature = (notes: NoteEvent[]) =>
  notes.map((note) => note.id).join("|");

const getNoteRadius = (midi: number) =>
  10.0 + (getDiatonicStep(midi) - 28) * NOTE_RADIUS_STEP;

const getClefTransform = (scale: number, offsetYEm: number) =>
  `translate3d(0,${offsetYEm.toFixed(3)}em,0) scale(${scale.toFixed(3)})`;

const StaffRing = ({
  radius,
  index,
  introStartRef,
}: {
  radius: number;
  index: number;
  introStartRef: IntroClockRef;
}) => {
  const geometry = useMemo(() => createCircularLineGeometry(radius), [radius]);
  const line = useMemo(
    () =>
      new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: "#ffffff",
          depthWrite: false,
          opacity: 0,
          transparent: true,
        }),
      ),
    [geometry],
  );
  const ringRef = useRef<THREE.Line>(null);
  const maxPoints = geometry.getAttribute("position").count;

  useEffect(() => {
    const lineMaterial = line.material as THREE.LineBasicMaterial;

    return () => {
      lineMaterial.dispose();
      geometry.dispose();
    };
  }, [geometry, line]);

  useFrame(({ clock }) => {
    if (!ringRef.current) {
      return;
    }

    const progress = getIntroProgress(
      clock.getElapsedTime(),
      introStartRef,
      index * INTRO_RING_STAGGER,
      INTRO_RING_DRAW_DURATION,
    );
    const drawCount =
      progress <= 0 ? 0 : Math.max(2, Math.floor(maxPoints * progress));

    geometry.setDrawRange(0, drawCount);
    ringRef.current.scale.setScalar(0.965 + progress * 0.035);
    ringRef.current.position.z = (1 - progress) * -0.75;
    (ringRef.current.material as THREE.LineBasicMaterial).opacity =
      0.08 + progress * 0.18;
  });

  return <primitive object={line} ref={ringRef} />;
};

const Staff = ({ introStartRef }: { introStartRef: IntroClockRef }) => {
  return (
    <group>
      {BASE_STAFF_RADII.map((radius, index) => (
        <StaffRing
          key={radius}
          radius={radius}
          index={index}
          introStartRef={introStartRef}
        />
      ))}
    </group>
  );
};

const NoteMesh = ({
  note,
  timeWindow,
  introStartRef,
  introDelay,
  introDuration = INTRO_NOTE_DURATION,
  fadePhase = "steady",
  crossfadeStartClock = 0,
  frozenTime,
}: {
  note: NoteEvent;
  timeWindow: number;
  introStartRef: IntroClockRef;
  introDelay: number;
  introDuration?: number;
  fadePhase?: FadePhase;
  crossfadeStartClock?: number;
  frozenTime?: number;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  const radius = getNoteRadius(note.midi);

  useFrame(({ clock }) => {
    if (!groupRef.current || !meshMatRef.current) {
      return;
    }

    const currentTime =
      frozenTime !== undefined ? frozenTime : Tone.Transport.seconds;
    const elapsed = clock.getElapsedTime();

    let displayProgress: number;
    if (fadePhase === "exiting") {
      displayProgress =
        1 -
        smootherStep(
          clamp01((elapsed - crossfadeStartClock) / CROSSFADE_EXIT_DURATION),
        );
    } else if (fadePhase === "entering") {
      displayProgress = smootherStep(
        clamp01(
          (elapsed - crossfadeStartClock - introDelay) /
            CROSSFADE_ENTER_DURATION,
        ),
      );
    } else {
      displayProgress = getIntroProgress(
        elapsed,
        introStartRef,
        introDelay,
        introDuration,
      );
    }

    const angle = ((note.time - currentTime) / timeWindow) * Math.PI * 2;
    let normalizedAngle = angle % (Math.PI * 2);

    if (normalizedAngle > Math.PI) normalizedAngle -= Math.PI * 2;
    if (normalizedAngle < -Math.PI) normalizedAngle += Math.PI * 2;

    const distance = Math.abs(normalizedAngle);
    const fadeStart = Math.PI * 0.55;
    const fadeEnd = Math.PI;
    const opacity =
      distance > fadeStart
        ? smootherStep(1 - (distance - fadeStart) / (fadeEnd - fadeStart))
        : 1;

    const angleDuration = (note.duration / timeWindow) * Math.PI * 2;
    const isPlaying = normalizedAngle <= 0 && normalizedAngle >= -angleDuration;

    const animatedRadius = radius * (0.3 + displayProgress * 0.7);
    groupRef.current.position.x = -Math.sin(normalizedAngle) * animatedRadius;
    groupRef.current.position.y =
      Math.cos(normalizedAngle) * animatedRadius + (1 - displayProgress) * 0.22;
    groupRef.current.position.z = (1 - displayProgress) * -1.9;
    groupRef.current.rotation.z = normalizedAngle;

    meshMatRef.current.opacity = opacity * displayProgress;
    meshMatRef.current.color.setHex(0xffffff);
    meshMatRef.current.emissive.setHex(0xffffff);

    meshMatRef.current.emissiveIntensity = getPlayedGlowIntensity({
      duration: note.duration,
      idleGlow: 0.18,
      opacity: meshMatRef.current.opacity,
      peakGlow: 1.6 + note.velocity * 1.4,
      sustainGlow: 0.52 + note.velocity * 0.44,
      timeDiff: currentTime - note.time,
    });

    const playScale = isPlaying ? 1.5 + note.velocity : 1;
    const introScale = 0.28 + displayProgress * 0.72;
    targetScale.setScalar(playScale * introScale);
    groupRef.current.scale.lerp(targetScale, 0.18);
  });

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
  );
};

const MidiRollNote = ({
  isFlatView,
  note,
  speed,
  introStartRef,
  introDelay,
  introDuration = INTRO_NOTE_DURATION,
  fadePhase = "steady",
  crossfadeStartClock = 0,
  frozenTime,
}: {
  isFlatView: boolean;
  note: NoteEvent;
  speed: number;
  introStartRef: IntroClockRef;
  introDelay: number;
  introDuration?: number;
  fadePhase?: FadePhase;
  crossfadeStartClock?: number;
  frozenTime?: number;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const x = ((note.midi - 60) / 20) * 6;
  const length = note.duration * speed;

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current) {
      return;
    }

    const currentTime =
      frozenTime !== undefined ? frozenTime : Tone.Transport.seconds;
    const elapsed = clock.getElapsedTime();

    let displayProgress: number;
    if (fadePhase === "exiting") {
      displayProgress =
        1 -
        smootherStep(
          clamp01((elapsed - crossfadeStartClock) / CROSSFADE_EXIT_DURATION),
        );
    } else if (fadePhase === "entering") {
      displayProgress = smootherStep(
        clamp01(
          (elapsed - crossfadeStartClock - introDelay) /
            CROSSFADE_ENTER_DURATION,
        ),
      );
    } else {
      displayProgress = getIntroProgress(
        elapsed,
        introStartRef,
        introDelay,
        introDuration,
      );
    }

    const timeDiff = note.time - currentTime;
    const z = -(timeDiff + note.duration / 2) * speed;
    const transitionBackShift = (1 - displayProgress) * -0.55;

    if (isFlatView) {
      meshRef.current.position.set(x, -z + transitionBackShift, 0);
      meshRef.current.renderOrder = 5;
      meshRef.current.scale.set(
        0.2 + displayProgress * 0.1,
        length * (0.42 + displayProgress * 0.58),
        0.1,
      );
    } else {
      meshRef.current.position.set(x, transitionBackShift, z);
      meshRef.current.renderOrder = 6;
      meshRef.current.scale.set(
        0.15 + displayProgress * 0.15,
        0.04 + displayProgress * 0.06,
        length * (0.42 + displayProgress * 0.58),
      );
    }

    const isPlaying = timeDiff <= 0 && timeDiff >= -note.duration;
    const distance = Math.abs(z);
    const opacity = Math.max(0, 1 - distance / 60) * displayProgress;

    matRef.current.opacity = opacity;

    if (isPlaying) {
      matRef.current.color.setHex(0xffffff);
      matRef.current.emissive.setHex(0xffffff);
    } else {
      matRef.current.color.setHex(0x888888);
      matRef.current.emissive.setHex(0x444444);
    }

    matRef.current.emissiveIntensity = getPlayedGlowIntensity({
      duration: note.duration,
      idleGlow: 0.22,
      opacity,
      peakGlow: 1.25 + note.velocity * 0.9,
      sustainGlow: 0.42 + note.velocity * 0.28,
      timeDiff: currentTime - note.time,
    });
  });

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
  );
};

const MidiRoll = ({
  isFlatView,
  notes,
  filterTime,
  timeWindow,
  introStartRef,
  fadePhase = "steady",
  crossfadeStartClock = 0,
  frozenTime,
}: {
  isFlatView: boolean;
  notes: NoteEvent[];
  filterTime: number;
  timeWindow: number;
  introStartRef: IntroClockRef;
  fadePhase?: FadePhase;
  crossfadeStartClock?: number;
  frozenTime?: number;
}) => {
  const speed = isFlatView ? MIDI_ROLL_FLAT_SPEED : 10;
  const lookAhead = timeWindow * 1.5;

  const rollNotes = useMemo(
    () =>
      notes.filter(
        (note) =>
          note.time >= filterTime - 2 && note.time <= filterTime + lookAhead,
      ),
    [notes, filterTime, lookAhead],
  );

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
            fadePhase === "entering"
              ? getCrossfadeEnterDelay(index)
              : INTRO_NOTE_APPEAR_DELAY +
                INTRO_NOTE_BASE_DELAY +
                Math.min(index, 18) * 0.016
          }
          introDuration={fadePhase === "steady" ? 0.72 : undefined}
          fadePhase={fadePhase}
          crossfadeStartClock={crossfadeStartClock}
          frozenTime={frozenTime}
        />
      ))}
    </group>
  );
};

const ClefIcon = ({
  glyph,
  iconRef,
  position,
  scale = 1,
  offsetYEm = 0,
}: {
  glyph: string;
  iconRef: RefObject<HTMLDivElement | null>;
  position: [number, number, number];
  scale?: number;
  offsetYEm?: number;
}) => {
  return (
    <Html
      position={position}
      center
      distanceFactor={14}
      pointerEvents="none"
      style={{ pointerEvents: "none" }}
      transform
      zIndexRange={[0, 0]}
    >
      <div
        ref={iconRef}
        style={{
          alignItems: "center",
          color: "#ffffff",
          display: "flex",
          fontFamily: CLEF_FONT_STACK,
          fontSize: `${CLEF_FONT_SIZE_PX}px`,
          height: "1em",
          justifyContent: "center",
          lineHeight: "1",
          opacity: 0,
          overflow: "visible",
          pointerEvents: "none",
          textShadow: "0 0 1px rgba(255,255,255,0.55)",
          transform: getClefTransform(0.82 * scale, offsetYEm),
          transformOrigin: "50% 50%",
          userSelect: "none",
          whiteSpace: "pre",
          WebkitFontSmoothing: "antialiased",
          width: "1em",
        }}
      >
        {glyph}
      </div>
    </Html>
  );
};

const Playhead = ({ introStartRef }: { introStartRef: IntroClockRef }) => {
  const groupRef = useRef<THREE.Group>(null);
  const trebleRef = useRef<HTMLDivElement>(null);
  const bassRef = useRef<HTMLDivElement>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return;
    }

    const progress = getIntroProgress(
      clock.getElapsedTime(),
      introStartRef,
      INTRO_PLAYHEAD_DELAY,
      INTRO_PLAYHEAD_DURATION,
    );
    const opacity = 0.86 * progress;

    groupRef.current.scale.setScalar(0.82 + progress * 0.18);
    groupRef.current.position.y = (1 - progress) * 0.55;
    groupRef.current.position.z = 0;
    const iconScale = 0.84 + progress * 0.16;

    if (trebleRef.current) {
      trebleRef.current.style.opacity = opacity.toFixed(3);
      trebleRef.current.style.transform = getClefTransform(
        iconScale * TREBLE_CLEF_SCALE,
        TREBLE_CLEF_OFFSET_Y_EM,
      );
    }

    if (bassRef.current) {
      bassRef.current.style.opacity = opacity.toFixed(3);
      bassRef.current.style.transform = getClefTransform(
        iconScale * BASS_CLEF_SCALE,
        BASS_CLEF_OFFSET_Y_EM,
      );
    }
  });

  return (
    <group ref={groupRef} scale={0.001}>
      <ClefIcon
        glyph="𝄞"
        iconRef={trebleRef}
        position={[0, TREBLE_CLEF_LINE_RADIUS, CLEF_Z_OFFSET]}
        offsetYEm={TREBLE_CLEF_OFFSET_Y_EM}
        scale={TREBLE_CLEF_SCALE}
      />
      <ClefIcon
        glyph="𝄢"
        iconRef={bassRef}
        position={[0, BASS_CLEF_LINE_RADIUS, CLEF_Z_OFFSET]}
        offsetYEm={BASS_CLEF_OFFSET_Y_EM}
        scale={BASS_CLEF_SCALE}
      />
    </group>
  );
};

const CameraController = ({
  cameraView,
  cameraPresets,
  controlsRef,
  isCameraEditing,
  isMobileView,
  introStartRef,
}: {
  cameraView: VisualizerSettings["cameraView"];
  cameraPresets: CameraPresetMap;
  controlsRef: OrbitControlsRef;
  isCameraEditing: boolean;
  isMobileView: boolean;
  introStartRef: IntroClockRef;
}) => {
  const { camera: rawCamera } = useThree();
  const cameraRef = useRef(rawCamera as THREE.PerspectiveCamera);
  const lookAtTarget = useRef(new THREE.Vector3(0, 0, 0));
  const targetPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const orbitStartTime = useRef<number | null>(null);
  const dynamicTransition = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    fov: number;
  } | null>(null);
  const prevCameraView = useRef(cameraView);
  const activePose = cameraPresets[cameraView];
  const effectivePose =
    isCameraEditing || !isMobileView
      ? activePose
      : getResponsiveCameraPose(activePose, cameraView, isMobileView);
  const activePoseSignature = poseToSignature(activePose);

  useEffect(() => {
    cameraRef.current = rawCamera as THREE.PerspectiveCamera;
  }, [rawCamera]);

  useEffect(() => {
    if (cameraView !== "dynamic" && !isCameraEditing) {
      prevCameraView.current = cameraView;
      return;
    }

    const camera = cameraRef.current;
    const nextPosition = vectorFromCameraVector(effectivePose.position);
    const nextTarget = vectorFromCameraVector(effectivePose.target);

    // If transitioning TO dynamic from another view, lerp instead of snapping
    if (
      cameraView === "dynamic" &&
      prevCameraView.current !== "dynamic" &&
      !isCameraEditing
    ) {
      dynamicTransition.current = {
        position: nextPosition,
        target: nextTarget,
        fov: effectivePose.fov,
      };
      prevCameraView.current = cameraView;
      return;
    }

    prevCameraView.current = cameraView;

    camera.position.copy(nextPosition);
    lookAtTarget.current.copy(nextTarget);
    camera.fov = effectivePose.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(nextTarget);

    if (controlsRef.current) {
      controlsRef.current.target.copy(nextTarget);
      controlsRef.current.update();
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
  ]);

  useFrame(({ clock }) => {
    // Handle smooth transition into dynamic mode
    if (dynamicTransition.current) {
      const camera = cameraRef.current;
      const t = dynamicTransition.current;
      const lerpFactor = 0.05;

      camera.position.lerp(t.position, lerpFactor);
      lookAtTarget.current.lerp(t.target, lerpFactor);
      const nextFov = THREE.MathUtils.lerp(camera.fov, t.fov, lerpFactor);
      if (Math.abs(nextFov - camera.fov) > 0.001) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
      camera.lookAt(lookAtTarget.current);

      // Once close enough, finalize and hand off to OrbitControls
      if (camera.position.distanceTo(t.position) < 0.05) {
        camera.position.copy(t.position);
        lookAtTarget.current.copy(t.target);
        camera.fov = t.fov;
        camera.updateProjectionMatrix();
        camera.lookAt(t.target);

        if (controlsRef.current) {
          controlsRef.current.target.copy(t.target);
          controlsRef.current.update();
        }
        dynamicTransition.current = null;
      }
      return;
    }

    if (cameraView === "dynamic" || isCameraEditing) {
      return;
    }

    const camera = cameraRef.current;
    const basePosition = vectorFromCameraVector(effectivePose.position);
    const baseTarget = vectorFromCameraVector(effectivePose.target);

    targetPos.current.copy(basePosition);
    targetLookAt.current.copy(baseTarget);

    if (cameraView === "topThird") {
      const frontPose = getResponsiveCameraPose(
        cameraPresets.front,
        "front",
        isMobileView,
      );
      const progress = getIntroProgress(
        clock.getElapsedTime(),
        introStartRef,
        INTRO_CAMERA_DELAY,
        INTRO_CAMERA_DURATION,
      );

      targetPos.current.lerpVectors(
        vectorFromCameraVector(frontPose.position),
        basePosition,
        progress,
      );
      targetLookAt.current.lerpVectors(
        vectorFromCameraVector(frontPose.target),
        baseTarget,
        progress,
      );
    } else if (cameraView === "orbit") {
      if (orbitStartTime.current === null) {
        orbitStartTime.current = clock.getElapsedTime();
      }
      const orbitOffset = basePosition.clone().sub(baseTarget);
      const orbitRadius = Math.max(
        0.001,
        Math.hypot(orbitOffset.x, orbitOffset.z),
      );
      const orbitAngle = Math.atan2(orbitOffset.x, orbitOffset.z);
      const orbitTime =
        (clock.getElapsedTime() - orbitStartTime.current) * 0.3;

      targetPos.current.set(
        baseTarget.x + Math.sin(orbitAngle + orbitTime) * orbitRadius,
        baseTarget.y + orbitOffset.y,
        baseTarget.z + Math.cos(orbitAngle + orbitTime) * orbitRadius,
      );
    } else {
      orbitStartTime.current = null;
    }

    const lerpFactor = cameraView === "topThird" ? 0.075 : 0.05;
    camera.position.lerp(targetPos.current, lerpFactor);
    lookAtTarget.current.lerp(targetLookAt.current, lerpFactor);
    const nextFov = THREE.MathUtils.lerp(
      camera.fov,
      effectivePose.fov,
      lerpFactor,
    );

    if (Math.abs(nextFov - camera.fov) > 0.001) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    camera.lookAt(lookAtTarget.current);
  });

  return null;
};

const Scene = ({
  cameraPresets,
  isCameraEditing,
  notes,
  onCameraPoseChange,
  settings,
  isMobileView,
}: {
  cameraPresets: CameraPresetMap;
  isCameraEditing: boolean;
  isMobileView: boolean;
  notes: NoteEvent[];
  onCameraPoseChange?: (pose: CameraPose) => void;
  settings: VisualizerSettings;
}) => {
  const [displayNotes, setDisplayNotes] = useState<NoteEvent[]>(notes);
  const [crossfadeState, setCrossfadeState] = useState<CrossfadeState>({
    ...CROSSFADE_IDLE,
  });
  const [filterTime, setFilterTime] = useState(0);
  const introStartRef = useRef<number | null>(null);
  const noteIntroStartRef = useRef<number | null>(null);
  const controlsRef = useRef<any>(null);
  const crossfadeRef = useRef<CrossfadeState>({ ...CROSSFADE_IDLE });
  const lastClockRef = useRef(0);
  const displaySignatureRef = useRef(getNotesSignature(notes));
  const { showMidiRoll, cameraView } = settings;
  const timeWindow = DEFAULT_TIME_WINDOW;
  const activeNoteSignature = getNotesSignature(notes);
  const displayNoteSignature = useMemo(
    () => getNotesSignature(displayNotes),
    [displayNotes],
  );
  const activePose = cameraPresets[cameraView];
  const isFlatEditing = isCameraEditing && activePose.flatLock;

  const handleControlsChange = () => {
    if (!isCameraEditing || !onCameraPoseChange || !controlsRef.current) {
      return;
    }

    const controlCamera = controlsRef.current.object as THREE.PerspectiveCamera;
    const controlTarget = controlsRef.current.target as THREE.Vector3;

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
    });
  };

  useLayoutEffect(() => {
    if (activeNoteSignature === displaySignatureRef.current) {
      if (!crossfadeRef.current.active && notes !== displayNotes) {
        queueMicrotask(() => {
          setDisplayNotes(notes);
        });
      }
      return;
    }

    const cf = crossfadeRef.current;
    if (cf.active) {
      crossfadeRef.current = { ...cf, pending: notes };
      return;
    }

    const nextCrossfade = {
      active: true,
      oldNotes: displayNotes,
      newNotes: notes,
      startClock: lastClockRef.current,
      oldFilterTime: filterTime,
      pending: null,
    };
    crossfadeRef.current = nextCrossfade;
    setCrossfadeState(nextCrossfade);
    displaySignatureRef.current = activeNoteSignature;
    setFilterTime(Tone.Transport.seconds);
  }, [activeNoteSignature, displayNotes, filterTime, notes]);

  useFrame(({ clock }) => {
    lastClockRef.current = clock.getElapsedTime();

    if (Math.abs(Tone.Transport.seconds - filterTime) > 0.5) {
      setFilterTime(Tone.Transport.seconds);
    }

    const cf = crossfadeRef.current;
    if (
      cf.active &&
      lastClockRef.current - cf.startClock >= CROSSFADE_TOTAL_DURATION
    ) {
      if (cf.pending) {
        const nextCrossfade = {
          active: true,
          oldNotes: cf.newNotes,
          newNotes: cf.pending,
          startClock: lastClockRef.current,
          oldFilterTime: Tone.Transport.seconds,
          pending: null,
        };
        crossfadeRef.current = nextCrossfade;
        setCrossfadeState(nextCrossfade);
        setFilterTime(Tone.Transport.seconds);
      } else {
        const settled = cf.newNotes;
        crossfadeRef.current = { ...CROSSFADE_IDLE };
        setCrossfadeState({ ...CROSSFADE_IDLE });
        displaySignatureRef.current = getNotesSignature(settled);
        setDisplayNotes(settled);
      }
    }
  });

  const cf = crossfadeState;
  const isCrossfading =
    cf.active || activeNoteSignature !== displayNoteSignature;
  const crossfadeStartClock = cf.startClock;

  const visibleDisplayNotes = useMemo(() => {
    const paddedWindow = timeWindow + 4;
    return displayNotes.filter(
      (note) =>
        note.time >= filterTime - paddedWindow / 2 &&
        note.time <= filterTime + paddedWindow / 2,
    );
  }, [displayNotes, filterTime, timeWindow]);

  const exitFilterTime = cf.active ? cf.oldFilterTime : filterTime;
  const crossfadeOldNotes = cf.active ? cf.oldNotes : displayNotes;
  const visibleExitingNotes = useMemo(() => {
    if (!isCrossfading) return [];
    const paddedWindow = timeWindow + 4;
    return crossfadeOldNotes.filter(
      (note) =>
        note.time >= exitFilterTime - paddedWindow / 2 &&
        note.time <= exitFilterTime + paddedWindow / 2,
    );
  }, [crossfadeOldNotes, exitFilterTime, isCrossfading, timeWindow]);

  const crossfadeNewNotes = cf.active ? cf.newNotes : notes;
  const visibleEnteringNotes = useMemo(() => {
    if (!isCrossfading) return [];
    const paddedWindow = timeWindow + 4;
    return crossfadeNewNotes.filter(
      (note) =>
        note.time >= filterTime - paddedWindow / 2 &&
        note.time <= filterTime + paddedWindow / 2,
    );
  }, [crossfadeNewNotes, filterTime, isCrossfading, timeWindow]);

  return (
    <>
      <color attach="background" args={["#000000"]} />
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
            />
          )}
          <MidiRoll
            isFlatView={activePose.flatLock}
            notes={isCrossfading ? crossfadeNewNotes : displayNotes}
            filterTime={filterTime}
            timeWindow={timeWindow}
            introStartRef={noteIntroStartRef}
            fadePhase={isCrossfading ? "entering" : "steady"}
            crossfadeStartClock={crossfadeStartClock}
          />
        </>
      )}

      <group rotation={[0, 0, 0]}>
        <Staff introStartRef={introStartRef} />
        {isCrossfading &&
          visibleExitingNotes.map((note, index) => (
            <NoteMesh
              key={`note-exit-${note.id}`}
              note={note}
              timeWindow={timeWindow}
              introStartRef={noteIntroStartRef}
              introDelay={0}
              fadePhase="exiting"
              crossfadeStartClock={crossfadeStartClock}
              frozenTime={exitFilterTime}
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
              />
            ))
          : visibleDisplayNotes.map((note, index) => (
              <NoteMesh
                key={`note-${note.id}`}
                note={note}
                timeWindow={timeWindow}
                introStartRef={noteIntroStartRef}
                introDelay={getNoteIntroDelay(note, index)}
              />
            ))}
        <Playhead introStartRef={introStartRef} />
      </group>

      <CameraController
        cameraPresets={cameraPresets}
        cameraView={cameraView}
        controlsRef={controlsRef}
        introStartRef={introStartRef}
        isCameraEditing={isCameraEditing}
        isMobileView={isMobileView}
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={isCameraEditing}
        enableRotate={!isFlatEditing}
        maxDistance={50}
        minDistance={5}
        autoRotate={cameraView === "dynamic" && !isCameraEditing}
        autoRotateSpeed={0.5}
        enabled={cameraView === "dynamic" || isCameraEditing}
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
  );
};

export const Visualizer = ({
  cameraPresets,
  isCameraEditing = false,
  isMobileView = false,
  notes,
  onCameraPoseChange,
  settings,
}: {
  cameraPresets: CameraPresetMap;
  isCameraEditing?: boolean;
  isMobileView?: boolean;
  notes: NoteEvent[];
  onCameraPoseChange?: (pose: CameraPose) => void;
  settings: VisualizerSettings;
}) => {
  const activePose = cameraPresets[settings.cameraView];
  const initialPose =
    isCameraEditing || !isMobileView
      ? activePose
      : getResponsiveCameraPose(activePose, settings.cameraView, isMobileView);
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
  );

  return (
    <Canvas camera={cameraConfig}>
      <Scene
        cameraPresets={cameraPresets}
        isCameraEditing={isCameraEditing}
        isMobileView={isMobileView}
        notes={notes}
        onCameraPoseChange={onCameraPoseChange}
        settings={settings}
      />
    </Canvas>
  );
};
