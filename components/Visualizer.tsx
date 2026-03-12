"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import * as Tone from "tone";
import {
  useEffect,
  useMemo,
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
const DEBUG_MIDI_TRANSITION_SAMPLE = process.env.NODE_ENV !== "production";
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
const INTRO_NOTE_BASE_DELAY = 1.74;
const INTRO_NOTE_SWEEP_SPAN = 0.96;
const INTRO_NOTE_DURATION = 0.99;
const INTRO_NOTE_APPEAR_DELAY = 1;
const INTRO_NOTE_TRANSITION_ENTER_DELAY = 0.5;
const INTRO_NOTE_TRANSITION_ENTRY_STAGGER = 0.016;
const INTRO_NOTE_TRANSITION_ENTRY_STAGGER_LIMIT = 12;
const INTRO_NOTE_TRANSITION_OUT_DURATION = 0.8;
const INTRO_NOTE_TRANSITION_ENTER_DURATION = 0.8;
const INTRO_NOTE_TRANSITION_ENTER_MAX_DELAY =
  INTRO_NOTE_TRANSITION_ENTER_DELAY +
  INTRO_NOTE_TRANSITION_ENTRY_STAGGER_LIMIT *
    INTRO_NOTE_TRANSITION_ENTRY_STAGGER;
const INTRO_NOTE_TRANSITION_DURATION = Math.max(
  INTRO_NOTE_TRANSITION_OUT_DURATION,
  INTRO_NOTE_TRANSITION_ENTER_MAX_DELAY +
    INTRO_NOTE_TRANSITION_ENTER_DURATION,
);
const INTRO_CAMERA_DELAY = 1.04;
const INTRO_PLAYHEAD_DELAY = 0.24;
const INTRO_PLAYHEAD_DURATION = 1.33;
const INTRO_CAMERA_DURATION = 1.95;

const noteGeo = new THREE.CircleGeometry(0.15, 32);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

type IntroClockRef = MutableRefObject<number | null>;
type OrbitControlsRef = RefObject<any>;

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

const getTransitionNoteIntroDelay = (index: number) =>
  INTRO_NOTE_TRANSITION_ENTER_DELAY +
  Math.min(index, INTRO_NOTE_TRANSITION_ENTRY_STAGGER_LIMIT) *
    INTRO_NOTE_TRANSITION_ENTRY_STAGGER;

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
  animationMode = "enter",
  isTransitioning = false,
  transitionClockRef,
  isSteady = false,
}: {
  note: NoteEvent;
  timeWindow: number;
  introStartRef: IntroClockRef;
  introDelay: number;
  introDuration: number;
  animationMode?: "enter" | "exit";
  isTransitioning?: boolean;
  transitionClockRef?: IntroClockRef;
  isSteady?: boolean;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  const radius = getNoteRadius(note.midi);

  useFrame(({ clock }) => {
    if (!groupRef.current || !meshMatRef.current) {
      return;
    }

    const currentTime = Tone.Transport.seconds;
    const isExiting = animationMode === "exit";
    const introClock = isExiting
      ? transitionClockRef ?? introStartRef
      : (isTransitioning && transitionClockRef) || introStartRef;
    const displayProgress = isExiting
      ? 1 -
        getIntroProgress(
          clock.getElapsedTime(),
          introClock,
          0,
          INTRO_NOTE_TRANSITION_OUT_DURATION,
        )
      : isSteady
        ? 1
        : getIntroProgress(
            clock.getElapsedTime(),
            introClock,
            introDelay,
            introDuration,
          );

    const angle = ((note.time - currentTime) / timeWindow) * Math.PI * 2;
    let normalizedAngle = angle % (Math.PI * 2);

    if (normalizedAngle > Math.PI) normalizedAngle -= Math.PI * 2;
    if (normalizedAngle < -Math.PI) normalizedAngle += Math.PI * 2;

    const distance = Math.abs(normalizedAngle);
    const opacity =
      distance > Math.PI * 0.8
        ? 1 - (distance - Math.PI * 0.8) / (Math.PI * 0.2)
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
  animationMode = "enter",
  introDuration = INTRO_NOTE_TRANSITION_ENTER_DURATION,
  transitionClockRef,
  isTransitioning = false,
  isSteady = false,
  isSample,
}: {
  isFlatView: boolean;
  note: NoteEvent;
  speed: number;
  introStartRef: IntroClockRef;
  introDelay: number;
  animationMode?: "enter" | "exit";
  introDuration?: number;
  transitionClockRef?: IntroClockRef;
  isTransitioning?: boolean;
  isSteady?: boolean;
  isSample?: boolean;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const sampleLogRef = useRef(false);

  const x = ((note.midi - 60) / 20) * 6;
  const length = note.duration * speed;

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current) {
      return;
    }

    const currentTime = Tone.Transport.seconds;
    const isExiting = animationMode === "exit";
    const introClock = isExiting
      ? transitionClockRef ?? introStartRef
      : (isTransitioning && transitionClockRef) || introStartRef;
    const displayProgress = isExiting
      ? 1 -
        getIntroProgress(
          clock.getElapsedTime(),
          introClock,
          0,
          INTRO_NOTE_TRANSITION_OUT_DURATION,
        )
      : isSteady
        ? 1
        : getIntroProgress(
            clock.getElapsedTime(),
            introClock,
            introDelay,
            introDuration,
          );
    const timeDiff = note.time - currentTime;
    const z = -(timeDiff + note.duration / 2) * speed;
    const transitionBackShift = (1 - displayProgress) * -0.55;
    meshRef.current.position.set(x, transitionBackShift, z);
    meshRef.current.renderOrder = isFlatView ? Math.round(1000 + z * 10) : 6;
    meshRef.current.scale.set(
      0.15 + displayProgress * 0.15,
      0.04 + displayProgress * 0.06,
      length * (0.42 + displayProgress * 0.58),
    );

    const isPlaying = timeDiff <= 0 && timeDiff >= -note.duration;
    const distance = Math.abs(z);
    const opacity = Math.max(0, 1 - distance / 60) * displayProgress;

    matRef.current.opacity = opacity;

    const transitionClockElapsed =
      (transitionClockRef ?? introStartRef).current === null
        ? null
        : clock.getElapsedTime() - (transitionClockRef ?? introStartRef).current;

    if (
      DEBUG_MIDI_TRANSITION_SAMPLE &&
      isSample &&
      !sampleLogRef.current &&
      animationMode !== "exit" &&
      transitionClockElapsed !== null
    ) {
      sampleLogRef.current = true;
      console.info("[orbitone:viz] enter.note.sample", {
        noteId: note.id,
        noteTime: Number(note.time.toFixed(3)),
        currentTime: Number(currentTime.toFixed(3)),
        timeDiff: Number(timeDiff.toFixed(3)),
        transitionBackShift: Number(transitionBackShift.toFixed(3)),
        transitionClockElapsed: Number(transitionClockElapsed.toFixed(3)),
        displayProgress: Number(displayProgress.toFixed(4)),
        z,
      });
    }

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
  animationMode = "enter",
  isTransitioning = false,
  transitionClockRef,
  isSteady = false,
}: {
  isFlatView: boolean;
  notes: NoteEvent[];
  filterTime: number;
  timeWindow: number;
  introStartRef: IntroClockRef;
  animationMode?: "enter" | "exit";
  isTransitioning?: boolean;
  transitionClockRef?: IntroClockRef;
  isSteady?: boolean;
}) => {
  const speed = 10;
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
    <group position={[0, -2, 0]}>
      {rollNotes.map((note, index) => (
        <MidiRollNote
          key={`roll-${animationMode}-${note.id}-${index}`}
          isFlatView={isFlatView}
          note={note}
          speed={speed}
          introStartRef={introStartRef}
          introDelay={
            animationMode === "exit" || !isTransitioning
              ? INTRO_NOTE_APPEAR_DELAY +
                INTRO_NOTE_BASE_DELAY +
                Math.min(index, 18) * 0.016
              : getTransitionNoteIntroDelay(index)
          }
          introDuration={
            animationMode === "exit"
              ? INTRO_NOTE_TRANSITION_OUT_DURATION
              : isTransitioning
                ? INTRO_NOTE_TRANSITION_ENTER_DURATION
                : 0.72
          }
          animationMode={animationMode}
          isSample={animationMode !== "exit" && index === 0}
          isTransitioning={isTransitioning}
          isSteady={isSteady}
          transitionClockRef={transitionClockRef}
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
  introStartRef,
}: {
  cameraView: VisualizerSettings["cameraView"];
  cameraPresets: CameraPresetMap;
  controlsRef: OrbitControlsRef;
  isCameraEditing: boolean;
  introStartRef: IntroClockRef;
}) => {
  const { camera: rawCamera } = useThree();
  const cameraRef = useRef(rawCamera as THREE.PerspectiveCamera);
  const lookAtTarget = useRef(new THREE.Vector3(0, 0, 0));
  const targetPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const activePose = cameraPresets[cameraView];
  const activePoseSignature = poseToSignature(activePose);

  useEffect(() => {
    cameraRef.current = rawCamera as THREE.PerspectiveCamera;
  }, [rawCamera]);

  useEffect(() => {
    if (cameraView !== "dynamic" && !isCameraEditing) {
      return;
    }

    const camera = cameraRef.current;
    const nextPosition = vectorFromCameraVector(activePose.position);
    const nextTarget = vectorFromCameraVector(activePose.target);

    camera.position.copy(nextPosition);
    lookAtTarget.current.copy(nextTarget);
    camera.fov = activePose.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(nextTarget);

    if (controlsRef.current) {
      controlsRef.current.target.copy(nextTarget);
      controlsRef.current.update();
    }
  }, [
    activePose.fov,
    activePose.position,
    activePose.target,
    activePoseSignature,
    cameraView,
    controlsRef,
    isCameraEditing,
  ]);

  useFrame(({ clock }) => {
    if (cameraView === "dynamic" || isCameraEditing) {
      return;
    }

    const camera = cameraRef.current;
    const basePosition = vectorFromCameraVector(activePose.position);
    const baseTarget = vectorFromCameraVector(activePose.target);

    targetPos.current.copy(basePosition);
    targetLookAt.current.copy(baseTarget);

    if (cameraView === "topThird") {
      const frontPose = cameraPresets.front;
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
      const orbitOffset = basePosition.clone().sub(baseTarget);
      const orbitRadius = Math.max(
        0.001,
        Math.hypot(orbitOffset.x, orbitOffset.z),
      );
      const orbitAngle = Math.atan2(orbitOffset.x, orbitOffset.z);
      const orbitTime = clock.getElapsedTime() * 0.3;

      targetPos.current.set(
        baseTarget.x + Math.sin(orbitAngle + orbitTime) * orbitRadius,
        baseTarget.y + orbitOffset.y,
        baseTarget.z + Math.cos(orbitAngle + orbitTime) * orbitRadius,
      );
    }

    const lerpFactor = cameraView === "topThird" ? 0.075 : 0.05;
    camera.position.lerp(targetPos.current, lerpFactor);
    lookAtTarget.current.lerp(targetLookAt.current, lerpFactor);
    const nextFov = THREE.MathUtils.lerp(
      camera.fov,
      activePose.fov,
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
}: {
  cameraPresets: CameraPresetMap;
  isCameraEditing: boolean;
  notes: NoteEvent[];
  onCameraPoseChange?: (pose: CameraPose) => void;
  settings: VisualizerSettings;
}) => {
  const [filterTime, setFilterTime] = useState(0);
  const [animatedNotes, setAnimatedNotes] = useState<NoteEvent[]>(notes);
  const [exitingNotes, setExitingNotes] = useState<NoteEvent[]>([]);
  const [isNoteTransitioning, setIsNoteTransitioning] = useState(false);
  const introStartRef = useRef<number | null>(null);
  const noteIntroStartRef = useRef<number | null>(null);
  const controlsRef = useRef<any>(null);
  const noteTransitionClockRef = useRef<number | null>(null);
  const noteTransitionDurationRef = useRef(INTRO_NOTE_TRANSITION_DURATION);
  const hasTransitionSettledRef = useRef(false);
  const { showMidiRoll, cameraView } = settings;
  const timeWindow = DEFAULT_TIME_WINDOW;
  const activeNoteSignature = getNotesSignature(notes);
  const activePose = cameraPresets[cameraView];
  const isFlatEditing = isCameraEditing && activePose.flatLock;
  const exitingFilterTimeRef = useRef<number>(0);
  const notesSignatureRef = useRef(activeNoteSignature);

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

  useFrame(({ clock }) => {
    if (
      isNoteTransitioning &&
      noteTransitionClockRef.current !== null &&
      clock.getElapsedTime() - noteTransitionClockRef.current >=
        noteTransitionDurationRef.current
    ) {
      if (DEBUG_MIDI_TRANSITION_SAMPLE) {
        console.info("[orbitone:viz] transition.complete", {
          transportSeconds: Number(Tone.Transport.seconds.toFixed(6)),
          animatedCount: animatedNotes.length,
          exitingCount: exitingNotes.length,
          transitionDuration: Number(
            (
              clock.getElapsedTime() - noteTransitionClockRef.current
            ).toFixed(3),
          ),
        });
      }
      setIsNoteTransitioning(false);
      hasTransitionSettledRef.current = true;
      setExitingNotes([]);
      noteTransitionClockRef.current = null;
      noteTransitionDurationRef.current = INTRO_NOTE_TRANSITION_DURATION;
    }

    if (isNoteTransitioning && noteTransitionClockRef.current === null) {
      noteTransitionClockRef.current = clock.getElapsedTime();
    }

    if (Math.abs(Tone.Transport.seconds - filterTime) > 0.5) {
      setFilterTime(Tone.Transport.seconds);
    }
  });

  useEffect(() => {
    if (activeNoteSignature === notesSignatureRef.current) {
      setAnimatedNotes(notes);
      return;
    }

    const transportSeconds = Tone.Transport.seconds;
    const nextTransitionDuration =
      animatedNotes.length > 0
        ? INTRO_NOTE_TRANSITION_DURATION
        : INTRO_NOTE_TRANSITION_OUT_DURATION;
    if (DEBUG_MIDI_TRANSITION_SAMPLE) {
      console.info("[orbitone:viz] transition.frame.start", {
        incomingCount: notes.length,
        exitingCount: animatedNotes.length,
        filterTime: Number(transportSeconds.toFixed(6)),
        transitionDuration: Number(nextTransitionDuration.toFixed(3)),
      });
    }

    setExitingNotes(animatedNotes);
    setAnimatedNotes(notes);
    notesSignatureRef.current = activeNoteSignature;
    setFilterTime(transportSeconds);
    exitingFilterTimeRef.current = transportSeconds;
    noteIntroStartRef.current = null;
    hasTransitionSettledRef.current = false;
    setIsNoteTransitioning(animatedNotes.length > 0);
    noteTransitionDurationRef.current = nextTransitionDuration;
    noteTransitionClockRef.current = null;
  }, [activeNoteSignature, animatedNotes, notes]);

  const visibleNotes = useMemo(() => {
    const paddedWindow = timeWindow + 2;
    return animatedNotes.filter(
      (note) =>
        note.time >= filterTime - paddedWindow / 2 &&
        note.time <= filterTime + paddedWindow / 2,
    );
  }, [animatedNotes, filterTime, timeWindow]);

  const visibleExitingNotes = useMemo(() => {
    const paddedWindow = timeWindow + 2;
    const referenceTime = exitingFilterTimeRef.current;

    return exitingNotes.filter(
      (note) =>
        note.time >= referenceTime - paddedWindow / 2 &&
        note.time <= referenceTime + paddedWindow / 2,
    );
  }, [exitingNotes, filterTime, timeWindow]);

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 0, 10]} intensity={1} color="#ffffff" />

      {showMidiRoll && (
        <>
          <MidiRoll
            isFlatView={activePose.flatLock}
            notes={exitingNotes}
            filterTime={filterTime}
            timeWindow={timeWindow}
            introStartRef={noteIntroStartRef}
            animationMode="exit"
            transitionClockRef={noteTransitionClockRef}
          />
          <MidiRoll
            isFlatView={activePose.flatLock}
            notes={animatedNotes}
            filterTime={filterTime}
            timeWindow={timeWindow}
            introStartRef={noteIntroStartRef}
            isSteady={hasTransitionSettledRef.current}
            isTransitioning={isNoteTransitioning}
            transitionClockRef={noteTransitionClockRef}
          />
        </>
      )}

      <group rotation={[0, 0, 0]}>
        <Staff introStartRef={introStartRef} />
        {visibleExitingNotes.map((note, index) => (
          <NoteMesh
            key={`note-exit-${note.id}-${index}`}
            note={note}
            timeWindow={timeWindow}
            introStartRef={noteIntroStartRef}
            introDelay={0}
            animationMode="exit"
            transitionClockRef={noteTransitionClockRef}
          />
        ))}
        {visibleNotes.map((note, index) => (
          <NoteMesh
            key={`note-enter-${note.id}-${index}`}
            note={note}
            timeWindow={timeWindow}
            introStartRef={noteIntroStartRef}
            introDelay={
              isNoteTransitioning
                ? getTransitionNoteIntroDelay(index)
                : getNoteIntroDelay(note, index)
            }
            introDuration={
              isNoteTransitioning
                ? INTRO_NOTE_TRANSITION_ENTER_DURATION
                : INTRO_NOTE_DURATION
            }
            isTransitioning={isNoteTransitioning}
            isSteady={hasTransitionSettledRef.current}
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
  notes,
  onCameraPoseChange,
  settings,
}: {
  cameraPresets: CameraPresetMap;
  isCameraEditing?: boolean;
  notes: NoteEvent[];
  onCameraPoseChange?: (pose: CameraPose) => void;
  settings: VisualizerSettings;
}) => {
  const initialPose = cameraPresets[settings.cameraView];

  return (
    <Canvas
      camera={{
        fov: initialPose.fov,
        position: [
          initialPose.position.x,
          initialPose.position.y,
          initialPose.position.z,
        ],
      }}
    >
      <Scene
        cameraPresets={cameraPresets}
        isCameraEditing={isCameraEditing}
        notes={notes}
        onCameraPoseChange={onCameraPoseChange}
        settings={settings}
      />
    </Canvas>
  );
};
