export const GLOBAL_VOLUME_BOOST = 1.75
export const DEFAULT_REVERB_ROOM_SIZE = 0.8

export const PIANO_SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

export const PIANO_SAMPLE_FILES = {
  21: 'A0.mp3',
  24: 'C1.mp3',
  27: 'Ds1.mp3',
  30: 'Fs1.mp3',
  33: 'A1.mp3',
  36: 'C2.mp3',
  39: 'Ds2.mp3',
  42: 'Fs2.mp3',
  45: 'A2.mp3',
  48: 'C3.mp3',
  51: 'Ds3.mp3',
  54: 'Fs3.mp3',
  57: 'A3.mp3',
  60: 'C4.mp3',
  63: 'Ds4.mp3',
  66: 'Fs4.mp3',
  69: 'A4.mp3',
  72: 'C5.mp3',
  75: 'Ds5.mp3',
  78: 'Fs5.mp3',
  81: 'A5.mp3',
  84: 'C6.mp3',
  87: 'Ds6.mp3',
  90: 'Fs6.mp3',
  93: 'A6.mp3',
  96: 'C7.mp3',
  99: 'Ds7.mp3',
  102: 'Fs7.mp3',
  105: 'A7.mp3',
  108: 'C8.mp3',
} as const

const PIANO_SAMPLE_MIDI_VALUES = Object.keys(PIANO_SAMPLE_FILES)
  .map(value => Number(value))
  .sort((left, right) => left - right)

export function getRegisterRelease(midi: number, pedalSustained: boolean) {
  let base: number
  if (midi <= 48)
    base = 1.8
  else if (midi <= 60)
    base = 1.2
  else if (midi <= 72)
    base = 0.8
  else if (midi <= 84)
    base = 0.5
  else base = 0.3

  return pedalSustained ? base * 1.4 : base
}

export function getNearestPianoSampleMidi(midi: number) {
  let closestMidi = PIANO_SAMPLE_MIDI_VALUES[0]
  let closestDistance = Number.POSITIVE_INFINITY

  for (const candidate of PIANO_SAMPLE_MIDI_VALUES) {
    const distance = Math.abs(candidate - midi)
    if (distance < closestDistance) {
      closestDistance = distance
      closestMidi = candidate
    }
  }

  return closestMidi
}
