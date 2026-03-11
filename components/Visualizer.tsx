'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Torus, Text, Billboard } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import * as Tone from 'tone';
import { useRef, useState, useMemo } from 'react';
import { NoteEvent } from '@/lib/music';

export interface VisualizerSettings {
  timeWindow: number;
  bloomIntensity: number;
  showMidiRoll: boolean;
  cameraView: 'front' | 'top' | 'side' | 'dynamic' | 'isometric' | 'closeup' | 'vortex' | 'orbit' | 'zenith';
}

// Shared geometry for better performance - using a flat circle that will always face the camera
const noteGeo = new THREE.CircleGeometry(0.15, 32);

// Helper to map MIDI note to diatonic staff steps
const getDiatonicStep = (midi: number) => {
  const stepMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const octave = Math.floor(midi / 12) - 1;
  const noteInOctave = midi % 12;
  return octave * 7 + stepMap[noteInOctave];
};

const Staff = () => {
  // Grand Staff mapping
  // Treble lines: E4, G4, B4, D5, F5
  const trebleRadii = [10.4, 10.8, 11.2, 11.6, 12.0];
  // Bass lines: G2, B2, D3, F3, A3
  const bassRadii = [8.0, 8.4, 8.8, 9.2, 9.6];
  const radii = [...bassRadii, ...trebleRadii];
  
  return (
    <group>
      {radii.map((r, i) => (
        <Torus key={i} args={[r, 0.01, 16, 100]} rotation={[0, 0, 0]}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.25} />
        </Torus>
      ))}
    </group>
  );
};

const NoteMesh = ({ note, timeWindow }: { note: NoteEvent, timeWindow: number }) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshMatRef = useRef<THREE.MeshStandardMaterial>(null);
  
  // Map MIDI to radius exactly matching sheet music lines/spaces
  // C4 (Middle C) is MIDI 60. Diatonic step for C4 is 28.
  const step = getDiatonicStep(note.midi) - 28;
  const radius = 10.0 + step * 0.2;
  
  // Reusable vector to prevent garbage collection stutter
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!groupRef.current || !meshMatRef.current) return;
    
    const currentTime = Tone.Transport.seconds;
    // Angle: 0 is top.
    const angle = ((note.time - currentTime) / timeWindow) * Math.PI * 2;
    
    // Normalize angle to [-PI, PI]
    let normalizedAngle = angle % (Math.PI * 2);
    if (normalizedAngle > Math.PI) normalizedAngle -= Math.PI * 2;
    if (normalizedAngle < -Math.PI) normalizedAngle += Math.PI * 2;
    
    // Position (Clockwise: x is negative for positive angle)
    groupRef.current.position.x = -Math.sin(normalizedAngle) * radius;
    groupRef.current.position.y = Math.cos(normalizedAngle) * radius;
    
    // Rotate so it points outward
    groupRef.current.rotation.z = normalizedAngle;

    // Fading: stay visible most of the way, fade gently at the very bottom
    const distance = Math.abs(normalizedAngle);
    const opacity = distance > Math.PI * 0.8 ? 1 - (distance - Math.PI * 0.8) / (Math.PI * 0.2) : 1;
    
    // Highlight when playing
    const angleDuration = (note.duration / timeWindow) * Math.PI * 2;
    const isPlaying = normalizedAngle <= 0 && normalizedAngle >= -angleDuration;
    
    meshMatRef.current.opacity = opacity;
    
    // Notes are always white, but glow intensely when played
    meshMatRef.current.color.setHex(0xffffff);
    meshMatRef.current.emissive.setHex(0xffffff);
    
    if (isPlaying) {
      meshMatRef.current.emissiveIntensity = 2 + note.velocity * 3;
    } else {
      meshMatRef.current.emissiveIntensity = 0.4; // Base glow for unplayed notes
    }
    
    const scale = isPlaying ? 1.5 + note.velocity : 1;
    targetScale.setScalar(scale);
    groupRef.current.scale.lerp(targetScale, 0.2);
  });

  return (
    <group ref={groupRef}>
      <Billboard>
        <mesh geometry={noteGeo}>
          <meshStandardMaterial ref={meshMatRef} transparent roughness={0.2} metalness={0.8} side={THREE.DoubleSide} />
        </mesh>
      </Billboard>
    </group>
  );
};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

const MidiRollNote = ({ note, speed }: { note: NoteEvent, speed: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  
  const x = ((note.midi - 60) / 20) * 6;
  const length = note.duration * speed;

  useFrame(() => {
    if (!meshRef.current || !matRef.current) return;
    const currentTime = Tone.Transport.seconds;
    const timeDiff = note.time - currentTime;
    const z = -(timeDiff + note.duration / 2) * speed;
    
    meshRef.current.position.set(x, 0, z);
    meshRef.current.scale.set(0.3, 0.1, length);

    const isPlaying = timeDiff <= 0 && timeDiff >= -note.duration;
    const distance = Math.abs(z);
    const opacity = Math.max(0, 1 - distance / 60);

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
      <meshStandardMaterial ref={matRef} transparent />
    </mesh>
  );
};

const MidiRoll = ({ notes, filterTime, timeWindow }: { notes: NoteEvent[], filterTime: number, timeWindow: number }) => {
  const speed = 10;
  const lookAhead = timeWindow * 1.5;
  
  const rollNotes = useMemo(() => {
    return notes.filter(n => 
      n.time >= filterTime - 2 && 
      n.time <= filterTime + lookAhead
    );
  }, [notes, filterTime, lookAhead]);

  return (
    <group position={[0, -2, 0]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[14, 0.05, 0.1]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
      {rollNotes.map(note => (
        <MidiRollNote key={`roll-${note.id}`} note={note} speed={speed} />
      ))}
    </group>
  );
};

const Playhead = () => {
  return (
    <group>
      <mesh position={[0, 10.0, 0.02]}>
        <boxGeometry args={[0.02, 4.0, 0.02]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        <pointLight color="#ffffff" intensity={2} distance={5} />
      </mesh>
      <Text
        position={[0, 11.2, 0.5]}
        color="white"
        fontSize={1.2}
        anchorX="center"
        anchorY="middle"
      >
        𝄞
      </Text>
      <Text
        position={[0, 8.8, 0.5]}
        color="white"
        fontSize={1.2}
        anchorX="center"
        anchorY="middle"
      >
        𝄢
      </Text>
    </group>
  );
};

const CameraController = ({ cameraView }: { cameraView: string }) => {
  const { camera } = useThree();
  const lookAtTarget = useRef(new THREE.Vector3(0, 0, 0));
  
  useFrame(({ clock }) => {
    if (cameraView === 'dynamic') return; // OrbitControls handles it
    
    const targetPos = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3(0, 0, 0);
    
    if (cameraView === 'front') targetPos.set(0, 0, 32);
    else if (cameraView === 'top') targetPos.set(0, 25, 15);
    else if (cameraView === 'side') targetPos.set(25, 0, 15);
    else if (cameraView === 'isometric') targetPos.set(20, 20, 20);
    else if (cameraView === 'closeup') targetPos.set(0, 10, 12);
    else if (cameraView === 'vortex') {
      targetPos.set(0, -2, 8);
      targetLookAt.set(0, 10, 0);
    } else if (cameraView === 'orbit') {
      const t = clock.getElapsedTime() * 0.3;
      targetPos.set(Math.sin(t) * 25, 8 + Math.sin(t * 0.5) * 10, Math.cos(t) * 25);
      targetLookAt.set(0, 5, 0);
    } else if (cameraView === 'zenith') {
      targetPos.set(0, 35, 0.1);
    }
    
    camera.position.lerp(targetPos, 0.05);
    lookAtTarget.current.lerp(targetLookAt, 0.05);
    camera.lookAt(lookAtTarget.current);
  });
  
  return null;
};

const Scene = ({ notes, isPlaying, settings }: { notes: NoteEvent[], isPlaying: boolean, settings: VisualizerSettings }) => {
  const [filterTime, setFilterTime] = useState(0);
  const { timeWindow, bloomIntensity, showMidiRoll, cameraView } = settings;
  
  useFrame(() => {
    // Update filter time roughly every 0.5 seconds to avoid React re-renders
    if (Math.abs(Tone.Transport.seconds - filterTime) > 0.5) {
      setFilterTime(Tone.Transport.seconds);
    }
  });

  // Filter notes to only render those within the visible window
  const visibleNotes = useMemo(() => {
    const paddedWindow = timeWindow + 2;
    return notes.filter(n => 
      n.time >= filterTime - paddedWindow / 2 && 
      n.time <= filterTime + paddedWindow / 2
    );
  }, [notes, filterTime, timeWindow]);

  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 0, 10]} intensity={1} color="#ffffff" />
      
      {showMidiRoll && <MidiRoll notes={notes} filterTime={filterTime} timeWindow={timeWindow} />}
      
      <group rotation={[0, 0, 0]}>
        <Staff />
        {visibleNotes.map(note => (
          <NoteMesh key={note.id} note={note} timeWindow={timeWindow} />
        ))}
        <Playhead />
      </group>
      
      <CameraController cameraView={cameraView} />
      
      <OrbitControls 
        enablePan={false} 
        maxDistance={50} 
        minDistance={5} 
        autoRotate={cameraView === 'dynamic'} 
        autoRotateSpeed={0.5}
        enabled={cameraView === 'dynamic'}
      />
      
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={bloomIntensity} />
      </EffectComposer>
    </>
  );
};

export const Visualizer = ({ notes, isPlaying, settings }: { notes: NoteEvent[], isPlaying: boolean, settings: VisualizerSettings }) => {
  return (
    <Canvas camera={{ position: [0, 0, 32], fov: 60 }}>
      <Scene notes={notes} isPlaying={isPlaying} settings={settings} />
    </Canvas>
  );
};
