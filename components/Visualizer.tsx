"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrbitControls, Text } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import * as Tone from "tone";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { NoteEvent } from "@/lib/music";

export interface VisualizerSettings {
  showMidiRoll: boolean;
  cameraView:
    | "topThird"
    | "front"
    | "top"
    | "side"
    | "dynamic"
    | "isometric"
    | "closeup"
    | "vortex"
    | "orbit"
    | "zenith";
}

const DEFAULT_TIME_WINDOW = 10;
const DEFAULT_BLOOM_INTENSITY = 2.0;
const INTRO_RING_DRAW_DURATION = 0.82;
const INTRO_RING_STAGGER = 0.05;
const INTRO_NOTE_BASE_DELAY = 1.18;
const INTRO_NOTE_SWEEP_SPAN = 0.6;
const INTRO_NOTE_DURATION = 0.62;
const INTRO_PLAYHEAD_DELAY = 0.18;
const INTRO_PLAYHEAD_DURATION = 1.02;
const INTRO_CAMERA_DURATION = 1.55;

const noteGeo = new THREE.CircleGeometry(0.15, 32);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const frontCameraPosition = new THREE.Vector3(0, 0, 32);
const frontCameraLookAt = new THREE.Vector3(0, 0, 0);
const topThirdCameraPosition = new THREE.Vector3(0, 8.75, 17.5);
const topThirdCameraLookAt = new THREE.Vector3(0, 8.75, 0);

type IntroClockRef = MutableRefObject<number | null>;

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
    INTRO_NOTE_BASE_DELAY +
    angularPhase * INTRO_NOTE_SWEEP_SPAN +
    radialPhase * 0.08 +
    localIndexPhase
  );
};

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
  const trebleRadii = [10.4, 10.8, 11.2, 11.6, 12.0];
  const bassRadii = [8.0, 8.4, 8.8, 9.2, 9.6];
  const radii = [...bassRadii, ...trebleRadii];

  return (
    <group>
      {radii.map((radius, index) => (
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
}: {
  note: NoteEvent;
  timeWindow: number;
  introStartRef: IntroClockRef;
  introDelay: number;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  const step = getDiatonicStep(note.midi) - 28;
  const radius = 10.0 + step * 0.2;

  useFrame(({ clock }) => {
    if (!groupRef.current || !meshMatRef.current) {
      return;
    }

    const currentTime = Tone.Transport.seconds;
    const introProgress = getIntroProgress(
      clock.getElapsedTime(),
      introStartRef,
      introDelay,
      INTRO_NOTE_DURATION,
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

    const animatedRadius = radius * (0.3 + introProgress * 0.7);
    groupRef.current.position.x = -Math.sin(normalizedAngle) * animatedRadius;
    groupRef.current.position.y =
      Math.cos(normalizedAngle) * animatedRadius + (1 - introProgress) * 0.22;
    groupRef.current.position.z = (1 - introProgress) * -1.9;
    groupRef.current.rotation.z = normalizedAngle;

    meshMatRef.current.opacity = opacity * introProgress;
    meshMatRef.current.color.setHex(0xffffff);
    meshMatRef.current.emissive.setHex(0xffffff);

    if (isPlaying) {
      meshMatRef.current.emissiveIntensity = 2 + note.velocity * 3;
    } else {
      meshMatRef.current.emissiveIntensity = 0.4;
    }

    const playScale = isPlaying ? 1.5 + note.velocity : 1;
    const introScale = 0.28 + introProgress * 0.72;
    targetScale.setScalar(playScale * introScale);
    groupRef.current.scale.lerp(targetScale, 0.18);
  });

  return (
    <group ref={groupRef} scale={0.001}>
      <Billboard>
        <mesh geometry={noteGeo}>
          <meshStandardMaterial
            ref={meshMatRef}
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
  note,
  speed,
  introStartRef,
  introDelay,
}: {
  note: NoteEvent;
  speed: number;
  introStartRef: IntroClockRef;
  introDelay: number;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const x = ((note.midi - 60) / 20) * 6;
  const length = note.duration * speed;

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current) {
      return;
    }

    const currentTime = Tone.Transport.seconds;
    const introProgress = getIntroProgress(
      clock.getElapsedTime(),
      introStartRef,
      introDelay,
      0.72,
    );
    const timeDiff = note.time - currentTime;
    const z = -(timeDiff + note.duration / 2) * speed;

    meshRef.current.position.set(x, (1 - introProgress) * -0.55, z);
    meshRef.current.scale.set(
      0.15 + introProgress * 0.15,
      0.04 + introProgress * 0.06,
      length * (0.42 + introProgress * 0.58),
    );

    const isPlaying = timeDiff <= 0 && timeDiff >= -note.duration;
    const distance = Math.abs(z);
    const opacity = Math.max(0, 1 - distance / 60) * introProgress;

    matRef.current.opacity = opacity;

    if (isPlaying) {
      matRef.current.color.setHex(0xffffff);
      matRef.current.emissive.setHex(0xffffff);
      matRef.current.emissiveIntensity = 2 + note.velocity * 2;
    } else {
      matRef.current.color.setHex(0x888888);
      matRef.current.emissive.setHex(0x444444);
      matRef.current.emissiveIntensity = 0.5;
    }
  });

  return (
    <mesh ref={meshRef} geometry={boxGeo}>
      <meshStandardMaterial ref={matRef} transparent opacity={0} />
    </mesh>
  );
};

const MidiRoll = ({
  notes,
  filterTime,
  timeWindow,
  introStartRef,
}: {
  notes: NoteEvent[];
  filterTime: number;
  timeWindow: number;
  introStartRef: IntroClockRef;
}) => {
  const guideRef = useRef<THREE.Mesh>(null);
  const guideMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
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

  useFrame(({ clock }) => {
    if (!guideRef.current || !guideMaterialRef.current) {
      return;
    }

    const progress = getIntroProgress(
      clock.getElapsedTime(),
      introStartRef,
      0.28,
      0.78,
    );

    guideRef.current.position.y = (1 - progress) * -0.35;
    guideRef.current.scale.x = 0.72 + progress * 0.28;
    guideMaterialRef.current.opacity = 0.8 * progress;
  });

  return (
    <group position={[0, -2, 0]}>
      <mesh ref={guideRef} position={[0, 0, 0]}>
        <boxGeometry args={[14, 0.05, 0.1]} />
        <meshBasicMaterial
          ref={guideMaterialRef}
          color="#ffffff"
          transparent
          opacity={0}
        />
      </mesh>
      {rollNotes.map((note, index) => (
        <MidiRollNote
          key={`roll-${note.id}`}
          note={note}
          speed={speed}
          introStartRef={introStartRef}
          introDelay={INTRO_NOTE_BASE_DELAY + Math.min(index, 18) * 0.016}
        />
      ))}
    </group>
  );
};

const Playhead = ({ introStartRef }: { introStartRef: IntroClockRef }) => {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const trebleRef = useRef<any>(null);
  const bassRef = useRef<any>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current || !materialRef.current || !lightRef.current) {
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
    groupRef.current.position.z = (1 - progress) * -1.1;
    materialRef.current.opacity = opacity;
    lightRef.current.intensity = 2 * progress;

    if (trebleRef.current) {
      trebleRef.current.fillOpacity = opacity;
      trebleRef.current.strokeOpacity = 0.2 * progress;
    }

    if (bassRef.current) {
      bassRef.current.fillOpacity = opacity;
      bassRef.current.strokeOpacity = 0.2 * progress;
    }
  });

  return (
    <group ref={groupRef} scale={0.001}>
      <mesh position={[0, 10.0, 0.02]}>
        <boxGeometry args={[0.02, 4.0, 0.02]} />
        <meshBasicMaterial
          ref={materialRef}
          color="#ffffff"
          transparent
          opacity={0}
        />
        <pointLight ref={lightRef} color="#ffffff" intensity={0} distance={5} />
      </mesh>
      <Text
        ref={trebleRef}
        position={[0, 11.2, 0.5]}
        color="white"
        fontSize={1.2}
        anchorX="center"
        anchorY="middle"
        fillOpacity={0}
        strokeColor="white"
        strokeOpacity={0}
        strokeWidth={0.015}
      >
        𝄞
      </Text>
      <Text
        ref={bassRef}
        position={[0, 8.8, 0.5]}
        color="white"
        fontSize={1.2}
        anchorX="center"
        anchorY="middle"
        fillOpacity={0}
        strokeColor="white"
        strokeOpacity={0}
        strokeWidth={0.015}
      >
        𝄢
      </Text>
    </group>
  );
};

const CameraController = ({
  cameraView,
  introStartRef,
}: {
  cameraView: VisualizerSettings["cameraView"];
  introStartRef: IntroClockRef;
}) => {
  const { camera } = useThree();
  const lookAtTarget = useRef(new THREE.Vector3(0, 0, 0));
  const targetPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    if (cameraView === "dynamic") {
      return;
    }

    targetPos.current.copy(frontCameraPosition);
    targetLookAt.current.copy(frontCameraLookAt);

    if (cameraView === "front") {
      targetPos.current.set(0, 0, 32);
    } else if (cameraView === "topThird") {
      const progress = getIntroProgress(
        clock.getElapsedTime(),
        introStartRef,
        0.04,
        INTRO_CAMERA_DURATION,
      );

      targetPos.current.lerpVectors(
        frontCameraPosition,
        topThirdCameraPosition,
        progress,
      );
      targetLookAt.current.lerpVectors(
        frontCameraLookAt,
        topThirdCameraLookAt,
        progress,
      );
    } else if (cameraView === "top") {
      targetPos.current.set(0, 25, 15);
    } else if (cameraView === "side") {
      targetPos.current.set(25, 0, 15);
    } else if (cameraView === "isometric") {
      targetPos.current.set(20, 20, 20);
    } else if (cameraView === "closeup") {
      targetPos.current.set(0, 10, 12);
    } else if (cameraView === "vortex") {
      targetPos.current.set(0, -2, 8);
      targetLookAt.current.set(0, 10, 0);
    } else if (cameraView === "orbit") {
      const orbitTime = clock.getElapsedTime() * 0.3;
      targetPos.current.set(
        Math.sin(orbitTime) * 25,
        8 + Math.sin(orbitTime * 0.5) * 10,
        Math.cos(orbitTime) * 25,
      );
      targetLookAt.current.set(0, 5, 0);
    } else if (cameraView === "zenith") {
      targetPos.current.set(0, 35, 0.1);
    }

    const lerpFactor = cameraView === "topThird" ? 0.075 : 0.05;
    camera.position.lerp(targetPos.current, lerpFactor);
    lookAtTarget.current.lerp(targetLookAt.current, lerpFactor);
    camera.lookAt(lookAtTarget.current);
  });

  return null;
};

const Scene = ({
  notes,
  settings,
}: {
  notes: NoteEvent[];
  settings: VisualizerSettings;
}) => {
  const [filterTime, setFilterTime] = useState(0);
  const introStartRef = useRef<number | null>(null);
  const { showMidiRoll, cameraView } = settings;
  const timeWindow = DEFAULT_TIME_WINDOW;

  useFrame(() => {
    if (Math.abs(Tone.Transport.seconds - filterTime) > 0.5) {
      setFilterTime(Tone.Transport.seconds);
    }
  });

  const visibleNotes = useMemo(() => {
    const paddedWindow = timeWindow + 2;
    return notes.filter(
      (note) =>
        note.time >= filterTime - paddedWindow / 2 &&
        note.time <= filterTime + paddedWindow / 2,
    );
  }, [notes, filterTime, timeWindow]);

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 0, 10]} intensity={1} color="#ffffff" />

      {showMidiRoll && (
        <MidiRoll
          notes={notes}
          filterTime={filterTime}
          timeWindow={timeWindow}
          introStartRef={introStartRef}
        />
      )}

      <group rotation={[0, 0, 0]}>
        <Staff introStartRef={introStartRef} />
        {visibleNotes.map((note, index) => (
          <NoteMesh
            key={note.id}
            note={note}
            timeWindow={timeWindow}
            introStartRef={introStartRef}
            introDelay={getNoteIntroDelay(note, index)}
          />
        ))}
        <Playhead introStartRef={introStartRef} />
      </group>

      <CameraController cameraView={cameraView} introStartRef={introStartRef} />

      <OrbitControls
        enablePan={false}
        maxDistance={50}
        minDistance={5}
        autoRotate={cameraView === "dynamic"}
        autoRotateSpeed={0.5}
        enabled={cameraView === "dynamic"}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          intensity={DEFAULT_BLOOM_INTENSITY}
        />
      </EffectComposer>
    </>
  );
};

export const Visualizer = ({
  notes,
  isPlaying,
  settings,
}: {
  notes: NoteEvent[];
  isPlaying: boolean;
  settings: VisualizerSettings;
}) => {
  return (
    <Canvas camera={{ position: [0, 0, 32], fov: 60 }}>
      <Scene notes={notes} settings={settings} />
    </Canvas>
  );
};
