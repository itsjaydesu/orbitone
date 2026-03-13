import {
  startTransition,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import * as Tone from "tone";
import {
  NoteEvent,
  PedalEvent,
  DEFAULT_NOTE_LEAD_IN_SECONDS,
  generateBeautifulPianoPiece,
  parseMidiFile,
} from "../lib/music";

export interface MusicSettings {
  volumePercent: number;
}

interface TrackState {
  originalNotes: NoteEvent[];
  originalPedalEvents: PedalEvent[];
  originalPlaybackGain: number;
  originalBpm: number;
  bpm: number;
}

const GLOBAL_VOLUME_BOOST = 1.75;

/** Per-register release envelope — longer for bass, tighter for treble. */
function getRegisterRelease(midi: number, pedalSustained: boolean): number {
  let base: number;
  if (midi <= 48) base = 1.8;
  else if (midi <= 60) base = 1.2;
  else if (midi <= 72) base = 0.8;
  else if (midi <= 84) base = 0.5;
  else base = 0.3;
  return pedalSustained ? base * 1.4 : base;
}

export const useMusic = (settings: MusicSettings) => {
  const { volumePercent } = settings;
  const baseOutputGain = 1.25 * GLOBAL_VOLUME_BOOST;
  const defaultReverbRoomSize = 0.8;
  const defaultMusic = useMemo(() => {
    const piece = generateBeautifulPianoPiece(32, 100);

    return {
      ...piece,
      notes: piece.notes.map((note) => ({
        ...note,
        time: note.time + DEFAULT_NOTE_LEAD_IN_SECONDS,
      })),
    };
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const samplerRef = useRef<Tone.Sampler | null>(null);
  const partRef = useRef<Tone.Part | null>(null);
  const pedalPartRef = useRef<Tone.Part | null>(null);
  const trackGainRef = useRef<Tone.Gain | null>(null);
  const dryGainRef = useRef<Tone.Gain | null>(null);
  const reverbSendRef = useRef<Tone.Gain | null>(null);
  const reverbToneRef = useRef<Tone.Filter | null>(null);
  const wetGainRef = useRef<Tone.Gain | null>(null);
  const eqRef = useRef<Tone.EQ3 | null>(null);
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const reverbRef = useRef<Tone.Freeverb | null>(null);
  const limiterRef = useRef<Tone.Limiter | null>(null);
  const meterRef = useRef<Tone.Meter | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const partStartedRef = useRef(false);
  const notesRef = useRef<NoteEvent[]>([]);
  const isPlayingRef = useRef(false);
  const bpmRef = useRef(100);
  const lastDiagnosticLogRef = useRef(0);

  const [trackState, setTrackState] = useState<TrackState>(() => ({
    bpm: defaultMusic.bpm,
    originalBpm: defaultMusic.bpm,
    originalNotes: defaultMusic.notes,
    originalPedalEvents: defaultMusic.pedalEvents,
    originalPlaybackGain: defaultMusic.playbackGain,
  }));
  const {
    bpm,
    originalBpm,
    originalNotes,
    originalPedalEvents,
    originalPlaybackGain,
  } = trackState;
  const trackPlaybackGain = originalPlaybackGain;

  const prevSpeedRef = useRef(1);

  const notes = useMemo(() => {
    const playbackSpeed = bpm / originalBpm;

    return originalNotes.map((note) => ({
      ...note,
      time: note.time / playbackSpeed,
      duration: note.duration / playbackSpeed,
    }));
  }, [bpm, originalBpm, originalNotes]);

  const pedalEvents = useMemo(() => {
    const playbackSpeed = bpm / originalBpm;
    return originalPedalEvents.map((e) => ({
      ...e,
      time: e.time / playbackSpeed,
    }));
  }, [bpm, originalBpm, originalPedalEvents]);

  const duration = useMemo(() => {
    if (notes.length === 0) {
      return 0;
    }

    return Math.max(...notes.map((note) => note.time + note.duration));
  }, [notes]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const setBpm = useCallback((value: number) => {
    const nextBpm = Math.round(value);

    setTrackState((current) => {
      if (current.bpm === nextBpm) {
        return current;
      }

      return {
        ...current,
        bpm: nextBpm,
      };
    });
  }, []);

  const ensureAudioReady = useCallback(async () => {
    await Tone.start();

    if (samplerRef.current) {
      return;
    }

    if (!initPromiseRef.current) {
      setIsAudioLoading(true);
      initPromiseRef.current = new Promise<void>((resolve) => {
        limiterRef.current = new Tone.Limiter(-1.5).toDestination();
        meterRef.current = new Tone.Meter({
          channelCount: 2,
          normalRange: false,
          smoothing: 0.85,
        });
        eqRef.current = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
        masterGainRef.current = new Tone.Gain(
          baseOutputGain * (volumePercent / 100),
        );
        eqRef.current.connect(masterGainRef.current);
        masterGainRef.current.connect(limiterRef.current);
        masterGainRef.current.connect(meterRef.current);

        trackGainRef.current = new Tone.Gain(trackPlaybackGain);
        dryGainRef.current = new Tone.Gain(0.42).connect(eqRef.current);
        wetGainRef.current = new Tone.Gain(0.18).connect(eqRef.current);
        reverbToneRef.current = new Tone.Filter({
          Q: 0.7,
          frequency: 2400,
          rolloff: -24,
          type: "lowpass",
        }).connect(wetGainRef.current);

        reverbRef.current = new Tone.Freeverb({
          dampening: 2200,
          roomSize: defaultReverbRoomSize,
        });
        reverbRef.current.wet.value = 1;
        reverbRef.current.connect(reverbToneRef.current);

        reverbSendRef.current = new Tone.Gain(0.24).connect(reverbRef.current);

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
            C8: "C8.mp3",
          },
          release: 1,
          baseUrl: "https://tonejs.github.io/audio/salamander/",
          onload: () => {
            setIsLoaded(true);
            setIsAudioLoading(false);
            resolve();
          },
        });

        samplerRef.current.connect(trackGainRef.current);
        trackGainRef.current.connect(dryGainRef.current);
        trackGainRef.current.connect(reverbSendRef.current);
      });
    }

    await initPromiseRef.current;
  }, [baseOutputGain, defaultReverbRoomSize, trackPlaybackGain, volumePercent]);

  useEffect(() => {
    return () => {
      partRef.current?.dispose();
      pedalPartRef.current?.dispose();
      samplerRef.current?.dispose();
      trackGainRef.current?.dispose();
      dryGainRef.current?.dispose();
      reverbSendRef.current?.dispose();
      reverbToneRef.current?.dispose();
      wetGainRef.current?.dispose();
      reverbRef.current?.dispose();
      eqRef.current?.dispose();
      masterGainRef.current?.dispose();
      meterRef.current?.dispose();
      limiterRef.current?.dispose();
      initPromiseRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    const monitorId = window.setInterval(() => {
      if (!isPlayingRef.current || !meterRef.current || !limiterRef.current) {
        return;
      }

      const meterValue = meterRef.current.getValue();
      const preLimiterPeakDb = Array.isArray(meterValue)
        ? Math.max(...meterValue)
        : meterValue;
      const limiterReductionDb = limiterRef.current.reduction;
      const hasHotSignal = preLimiterPeakDb > -6 || limiterReductionDb < -0.25;

      if (!hasHotSignal || Date.now() - lastDiagnosticLogRef.current < 2000) {
        return;
      }

      lastDiagnosticLogRef.current = Date.now();
      const transportTime = Tone.Transport.seconds;
      const activeNotes = notesRef.current.filter(
        (note) =>
          note.time <= transportTime &&
          note.time + note.duration >= transportTime,
      ).length;

      console.info("[orbitone/audio]", {
        activeNotes,
        bpm: bpmRef.current,
        limiterReductionDb: Number(limiterReductionDb.toFixed(2)),
        preLimiterPeakDb: Number(preLimiterPeakDb.toFixed(2)),
        transportSeconds: Number(transportTime.toFixed(2)),
      });
    }, 500);

    return () => window.clearInterval(monitorId);
  }, []);

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = baseOutputGain * (volumePercent / 100);
    }
  }, [baseOutputGain, volumePercent]);

  useEffect(() => {
    if (trackGainRef.current) {
      trackGainRef.current.gain.value = trackPlaybackGain;
    }
  }, [trackPlaybackGain]);

  useEffect(() => {
    if (notes.length === 0) return;

    const playbackSpeed = bpm / originalBpm;
    const wasPlaying = isPlayingRef.current;

    const prevSpeed = prevSpeedRef.current;
    const currentOriginalTime = Tone.Transport.seconds * prevSpeed;
    const newTransportTime = currentOriginalTime / playbackSpeed;

    Tone.Transport.seconds = newTransportTime;
    prevSpeedRef.current = playbackSpeed;

    if (partRef.current) {
      partRef.current.dispose();
    }
    if (pedalPartRef.current) {
      pedalPartRef.current.dispose();
    }

    // Note Part — register-aware release
    partRef.current = new Tone.Part<NoteEvent>((time, note) => {
      samplerRef.current!.release = getRegisterRelease(note.midi, note.pedalSustained ?? false);
      samplerRef.current?.triggerAttackRelease(
        Tone.Frequency(note.midi, "midi").toNote(),
        note.duration,
        time,
        note.velocity,
      );
    }, notes);

    // Pedal Part — dynamic reverb modulation
    if (pedalEvents.length > 0) {
      pedalPartRef.current = new Tone.Part<PedalEvent>((time, event) => {
        const reverbSend = reverbSendRef.current;
        const reverb = reverbRef.current;
        if (!reverbSend || !reverb) return;

        if (event.value >= 64) {
          // Pedal down: quick ramp to wetter sound
          reverbSend.gain.rampTo(0.34, 0.1, time);
          reverb.roomSize.rampTo(0.86, 0.1, time);
        } else {
          // Pedal up: slower ramp back to dry (asymmetric — mimics acoustic behavior)
          reverbSend.gain.rampTo(0.24, 0.3, time);
          reverb.roomSize.rampTo(defaultReverbRoomSize, 0.3, time);
        }
      }, pedalEvents);
    }

    if (wasPlaying) {
      partRef.current.start(0);
      pedalPartRef.current?.start(0);
      partStartedRef.current = true;
    } else {
      partStartedRef.current = false;
    }
  }, [notes, pedalEvents, bpm, originalBpm, defaultReverbRoomSize]);

  const togglePlay = useCallback(async () => {
    if (!isPlaying) {
      await ensureAudioReady();
      if (!partStartedRef.current) {
        partRef.current?.start(0);
        pedalPartRef.current?.start(0);
        partStartedRef.current = true;
      }
      Tone.Transport.start();
      setIsPlaying(true);
    } else {
      Tone.Transport.pause();
      setIsPlaying(false);
    }
  }, [ensureAudioReady, isPlaying]);

  const loadMidi = useCallback(async (file: File) => {
    try {
      setIsPlaying(false);
      Tone.Transport.stop();
      Tone.Transport.seconds = 0;
      partStartedRef.current = false;
      prevSpeedRef.current = 1;

      const {
        notes: parsedNotes,
        bpm: parsedBpm,
        pedalEvents: parsedPedalEvents,
        playbackGain: parsedPlaybackGain,
      } = await parseMidiFile(file);
      if (parsedNotes.length > 0) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[orbitone:music] upload.loadMidi.reset", {
            wasPlaying: isPlayingRef.current,
            transportSeconds: Number(Tone.Transport.seconds.toFixed(6)),
            partStarted: partStartedRef.current,
          });
        }

        const roundedBpm = Math.round(parsedBpm);

        startTransition(() => {
          setTrackState({
            bpm: roundedBpm,
            originalBpm: roundedBpm,
            originalNotes: parsedNotes,
            originalPedalEvents: parsedPedalEvents,
            originalPlaybackGain: parsedPlaybackGain,
          });
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error("Error parsing MIDI file:", error);
      alert("Failed to parse MIDI file.");
      return false;
    }
  }, []);

  const seek = useCallback((time: number) => {
    Tone.Transport.seconds = time;
  }, []);

  const resetBpm = useCallback(() => {
    setBpm(Math.round(originalBpm));
  }, [originalBpm, setBpm]);

  return {
    isPlaying,
    isLoaded,
    isAudioLoading,
    togglePlay,
    notes,
    loadMidi,
    duration,
    seek,
    bpm,
    setBpm,
    resetBpm,
  };
};
