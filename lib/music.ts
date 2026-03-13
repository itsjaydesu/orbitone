import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

export interface NoteEvent {
  id: string;
  midi: number;
  time: number; // in seconds
  duration: number; // in seconds
  velocity: number;
  pedalSustained?: boolean;
}

export interface PedalEvent {
  time: number;
  value: number; // 0-127
}

export interface MusicData {
  notes: NoteEvent[];
  bpm: number;
  pedalEvents: PedalEvent[];
}

const MAX_SUSTAIN_DURATION = 15;

/** Extra time (seconds) to model damper felt settling back onto strings. */
function getDamperBuffer(midi: number): number {
  if (midi <= 48) return 0.15;   // bass — heavy dampers
  if (midi <= 72) return 0.08;   // mid
  return 0.04;                   // treble — light dampers
}

export const DEFAULT_NOTE_LEAD_IN_SECONDS = 0.35;
export const MIN_UPLOAD_NOTE_LEAD_IN_SECONDS = 0.5;

export const parseMidiFile = async (file: File): Promise<MusicData> => {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);
  const notes: NoteEvent[] = [];
  const pedalEvents: PedalEvent[] = [];

  midi.tracks.forEach(track => {
    // Get sustain pedal events (CC 64) for this track
    const sustainEvents = track.controlChanges[64] || [];

    // Collect raw pedal events for reverb modulation
    for (const event of sustainEvents) {
      pedalEvents.push({ time: event.time, value: Math.round(event.value * 127) });
    }

    track.notes.forEach(note => {
      let duration = note.duration;
      const noteEnd = note.time + note.duration;
      let pedalSustained = false;

      let pedalDown = false;
      let nextPedalUpTime = -1;

      // Determine if pedal is down at the end of the note, and when it is released
      for (const event of sustainEvents) {
        if (event.time <= noteEnd) {
          pedalDown = event.value >= 0.5;
        } else {
          if (pedalDown && event.value < 0.5) {
             nextPedalUpTime = event.time;
             break;
          } else if (!pedalDown) {
             break;
          }
        }
      }

      if (pedalDown) {
        pedalSustained = true;
        if (nextPedalUpTime !== -1) {
          duration = nextPedalUpTime - note.time + getDamperBuffer(note.midi);
        } else {
          // Pedal down but never released, sustain to end of track
          duration = Math.max(duration, midi.duration - note.time);
        }
      }

      // Cap maximum duration to prevent notes ringing indefinitely
      duration = Math.min(duration, MAX_SUSTAIN_DURATION);

      notes.push({
        id: `midi-${note.midi}-${note.time}-${Math.random()}`,
        midi: note.midi,
        time: note.time,
        duration,
        velocity: note.velocity,
        pedalSustained,
      });
    });
  });

  notes.sort((a, b) => a.time - b.time);
  pedalEvents.sort((a, b) => a.time - b.time);

  // Keep uploads from starting at t=0 while preserving existing long-silence normalization.
  if (notes.length > 0) {
    const firstNoteTime = notes[0].time;
    const clampedFirstTime = Math.min(
      1,
      Math.max(MIN_UPLOAD_NOTE_LEAD_IN_SECONDS, firstNoteTime),
    );
    const offset = firstNoteTime - clampedFirstTime;

    notes.forEach(note => {
      note.time -= offset;
    });
    pedalEvents.forEach(event => {
      event.time -= offset;
    });
  }

  const bpm = Math.round(midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120);

  return { notes, bpm, pedalEvents };
};

export const generateBeautifulPianoPiece = (numMeasures: number = 32, bpm: number = 100): MusicData => {
  const notes: NoteEvent[] = [];
  let timeInSeconds = 0;
  const secondsPerBeat = 60 / bpm;
  const beatsPerMeasure = 4;
  const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
  
  // Richer Progression: Am - Fmaj7 - C - G6 - Dm9 - Am - E7 - Am
  const progression = [
    [45, 52, 57, 60, 64, 69], // Am
    [41, 48, 52, 57, 60, 64], // Fmaj7
    [48, 55, 60, 64, 67, 72], // C
    [43, 50, 55, 59, 64, 67], // G6
    [38, 45, 53, 57, 60, 65], // Dm9
    [45, 52, 57, 60, 64, 69], // Am
    [40, 47, 52, 56, 62, 68], // E7
    [45, 52, 57, 60, 64, 69], // Am
  ];
  
  for (let measure = 0; measure < numMeasures; measure++) {
    const chord = progression[measure % progression.length];
    
    // Left hand flowing arpeggio (16th notes)
    for (let i = 0; i < beatsPerMeasure * 4; i++) {
        const noteTime = timeInSeconds + i * (secondsPerBeat / 4);
        // Flowing pattern
        const pattern = [0, 1, 2, 3, 4, 2, 3, 1];
        const noteMidi = chord[pattern[i % pattern.length]];
        
        // Expressive velocity: accent the first note of each beat, swell in the middle of the measure
        const beatPos = i % 4;
        const measurePos = i / (beatsPerMeasure * 4);
        const swell = Math.sin(measurePos * Math.PI) * 0.2;
        let velocity = (beatPos === 0) ? 0.6 : 0.35;
        velocity += swell;
        
        notes.push({
            id: `arp-${measure}-${i}`,
            midi: noteMidi,
            time: noteTime,
            duration: secondsPerBeat * 1.5, // sustain pedal effect
            velocity: Math.min(1, Math.max(0.1, velocity))
        });
    }
    
    // Right hand expressive melody
    if (measure % 2 === 0) {
        const melodyNote = chord[5] + 12; // High octave
        notes.push({
            id: `mel-${measure}-1`,
            midi: melodyNote,
            time: timeInSeconds,
            duration: secondsPerMeasure,
            velocity: 0.85
        });
        // Grace note or harmony
        notes.push({
            id: `mel-${measure}-1-harm`,
            midi: chord[4] + 12,
            time: timeInSeconds + secondsPerBeat * 2.5,
            duration: secondsPerBeat * 1.5,
            velocity: 0.6
        });
    } else {
        const melodyNote1 = chord[4] + 12;
        const melodyNote2 = chord[3] + 12;
        const melodyNote3 = chord[5] + 12;
        
        notes.push({
            id: `mel-${measure}-1`,
            midi: melodyNote1,
            time: timeInSeconds,
            duration: secondsPerBeat * 1.5,
            velocity: 0.75
        });
        notes.push({
            id: `mel-${measure}-2`,
            midi: melodyNote2,
            time: timeInSeconds + secondsPerBeat * 1.5,
            duration: secondsPerBeat * 0.5,
            velocity: 0.6
        });
        notes.push({
            id: `mel-${measure}-3`,
            midi: melodyNote3,
            time: timeInSeconds + secondsPerBeat * 2,
            duration: secondsPerBeat * 2,
            velocity: 0.8
        });
    }
    
    timeInSeconds += secondsPerMeasure;
  }
  
  return { notes, bpm, pedalEvents: [] };
};
