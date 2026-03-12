import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

export interface NoteEvent {
  id: string;
  midi: number;
  time: number; // in seconds
  duration: number; // in seconds
  velocity: number;
}

export interface MusicData {
  notes: NoteEvent[];
  bpm: number;
}

export const parseMidiFile = async (file: File): Promise<MusicData> => {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);
  const notes: NoteEvent[] = [];

  midi.tracks.forEach(track => {
    // Get sustain pedal events (CC 64) for this track
    const sustainEvents = track.controlChanges[64] || [];
    
    track.notes.forEach(note => {
      let duration = note.duration;
      const noteEnd = note.time + note.duration;
      
      let pedalDown = false;
      let nextPedalUpTime = -1;
      
      // Determine if pedal is down at the end of the note, and when it is released
      for (const event of sustainEvents) {
        if (event.time <= noteEnd) {
          pedalDown = event.value >= 64;
        } else {
          if (pedalDown && event.value < 64) {
             nextPedalUpTime = event.time;
             break;
          } else if (!pedalDown) {
             break;
          }
        }
      }
      
      if (pedalDown) {
        if (nextPedalUpTime !== -1) {
          duration = nextPedalUpTime - note.time;
        } else {
          // Pedal down but never released, sustain to end of track
          duration = Math.max(duration, midi.duration - note.time);
        }
      }

      notes.push({
        id: `midi-${note.midi}-${note.time}-${Math.random()}`,
        midi: note.midi,
        time: note.time,
        duration: duration,
        velocity: note.velocity
      });
    });
  });

  notes.sort((a, b) => a.time - b.time);

  // Skip initial silence if it's longer than 1 second
  if (notes.length > 0 && notes[0].time > 1) {
    const offset = notes[0].time - 1;
    notes.forEach(note => {
      note.time -= offset;
    });
  }

  const bpm = Math.round(midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120);

  return { notes, bpm };
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
  
  return { notes, bpm };
};
