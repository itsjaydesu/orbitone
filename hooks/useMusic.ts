import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { NoteEvent, generateBeautifulPianoPiece, parseMidiFile } from '../lib/music';

export interface MusicSettings {
  reverbRoomSize: number;
}

export const useMusic = (settings: MusicSettings) => {
  const { reverbRoomSize } = settings;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const samplerRef = useRef<Tone.Sampler | null>(null);
  const partRef = useRef<Tone.Part | null>(null);
  const eqRef = useRef<Tone.EQ3 | null>(null);
  const reverbRef = useRef<Tone.Freeverb | null>(null);
  
  const [originalNotes, setOriginalNotes] = useState<NoteEvent[]>([]);
  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const [duration, setDuration] = useState(0);
  const [originalBpm, setOriginalBpm] = useState(100);
  const [bpm, setBpm] = useState(100);
  
  const prevSpeedRef = useRef(1);

  useEffect(() => {
    // Generate default piece
    const { notes: newNotes, bpm: initialBpm } = generateBeautifulPianoPiece(32, 100);
    setOriginalNotes(newNotes);
    setOriginalBpm(initialBpm);
    setBpm(initialBpm);

    // Setup Audio Chain: Sampler -> Reverb -> EQ -> Destination
    eqRef.current = new Tone.EQ3({ low: 0, mid: 0, high: 0 }).toDestination();
    reverbRef.current = new Tone.Freeverb({ roomSize: 0.6, dampening: 3000 }).connect(eqRef.current);

    samplerRef.current = new Tone.Sampler({
      urls: {
        A0: "A0.mp3",
        C1: "C1.mp3",
        "D#1": "Ds1.mp3",
        "F#1": "Fs1.mp3",
        A1: "A1.mp3",
        C2: "C2.mp3",
        "D#2": "Ds2.mp3",
        "F#2": "Fs2.mp3",
        A2: "A2.mp3",
        C3: "C3.mp3",
        "D#3": "Ds3.mp3",
        "F#3": "Fs3.mp3",
        A3: "A3.mp3",
        C4: "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        A4: "A4.mp3",
        C5: "C5.mp3",
        "D#5": "Ds5.mp3",
        "F#5": "Fs5.mp3",
        A5: "A5.mp3",
        C6: "C6.mp3",
        "D#6": "Ds6.mp3",
        "F#6": "Fs6.mp3",
        A6: "A6.mp3",
        C7: "C7.mp3",
        "D#7": "Ds7.mp3",
        "F#7": "Fs7.mp3",
        A7: "A7.mp3",
        C8: "C8.mp3"
      },
      release: 1,
      baseUrl: "https://tonejs.github.io/audio/salamander/",
      onload: () => {
        setIsLoaded(true);
      }
    }).connect(reverbRef.current);

    return () => {
      samplerRef.current?.dispose();
      partRef.current?.dispose();
      reverbRef.current?.dispose();
      eqRef.current?.dispose();
    };
  }, []);

  // Update audio effects when controls change
  useEffect(() => {
    if (reverbRef.current) {
      reverbRef.current.roomSize.value = reverbRoomSize;
    }
  }, [reverbRoomSize]);

  // Handle playback speed changes
  useEffect(() => {
    if (originalNotes.length === 0) return;

    const playbackSpeed = bpm / originalBpm;
    const wasPlaying = isPlaying;
    
    // Calculate the new transport time so the song stays in the same relative position
    const prevSpeed = prevSpeedRef.current;
    const currentOriginalTime = Tone.Transport.seconds * prevSpeed;
    const newTransportTime = currentOriginalTime / playbackSpeed;
    
    Tone.Transport.seconds = newTransportTime;
    prevSpeedRef.current = playbackSpeed;

    // Scale notes by playback speed
    const scaledNotes = originalNotes.map(n => ({
      ...n,
      time: n.time / playbackSpeed,
      duration: n.duration / playbackSpeed
    }));
    
    setNotes(scaledNotes);

    if (partRef.current) {
      partRef.current.dispose();
    }

    partRef.current = new Tone.Part((time, note) => {
      samplerRef.current?.triggerAttackRelease(
        Tone.Frequency(note.midi, "midi").toNote(),
        note.duration,
        time,
        note.velocity
      );
    }, scaledNotes.map(n => [n.time, n]));

    if (wasPlaying) {
      partRef.current.start(0);
    }

  }, [originalNotes, bpm, originalBpm]); // Removed isPlaying and notes from deps to avoid loops

  useEffect(() => {
    if (notes.length > 0) {
      const maxTime = Math.max(...notes.map(n => n.time + n.duration));
      setDuration(maxTime);
    } else {
      setDuration(0);
    }
  }, [notes]);

  const togglePlay = useCallback(async () => {
    if (!isPlaying) {
      await Tone.start();
      partRef.current?.start(0);
      Tone.Transport.start();
      setIsPlaying(true);
    } else {
      Tone.Transport.pause();
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const loadMidi = async (file: File) => {
    try {
      const { notes: parsedNotes, bpm: parsedBpm } = await parseMidiFile(file);
      if (parsedNotes.length > 0) {
        // Stop current playback
        Tone.Transport.stop();
        Tone.Transport.seconds = 0;
        setIsPlaying(false);
        setOriginalBpm(parsedBpm);
        setBpm(parsedBpm);
        setOriginalNotes(parsedNotes);
      }
    } catch (error) {
      console.error("Error parsing MIDI file:", error);
      alert("Failed to parse MIDI file.");
    }
  };

  const seek = useCallback((time: number) => {
    Tone.Transport.seconds = time;
  }, []);

  return { isPlaying, isLoaded, togglePlay, notes, loadMidi, duration, seek, bpm, setBpm };
};
