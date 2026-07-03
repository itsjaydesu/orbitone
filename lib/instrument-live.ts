import type { InstrumentDefinition } from '@/lib/instruments'
import * as Tone from 'tone'
import { midiToFrequency } from '@/lib/instruments'
import { getRegisterRelease } from '@/lib/piano-audio'

/**
 * A uniform, disposable voice used by `useMusic` for real-time playback.
 * Both the sampled piano and the subtractive synth presets are wrapped in this
 * shape so the playback scheduler never has to know which one is active.
 */
export interface LiveInstrument {
  /** Tail node of the voice — connect this to the track gain / FX chain. */
  readonly output: Tone.ToneAudioNode
  /** Resolves once the voice can make sound (immediately for synths). */
  readonly ready: Promise<void>
  triggerAttackRelease: (
    midi: number,
    duration: number,
    time: number,
    velocity: number,
    pedalSustained: boolean,
  ) => void
  releaseAll: (time?: number) => void
  dispose: () => void
}

const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

const SALAMANDER_URLS: Record<string, string> = {
  'A0': 'A0.mp3',
  'C1': 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  'A1': 'A1.mp3',
  'C2': 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  'A2': 'A2.mp3',
  'C3': 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  'A3': 'A3.mp3',
  'C4': 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  'A4': 'A4.mp3',
  'C5': 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  'A5': 'A5.mp3',
  'C6': 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  'A6': 'A6.mp3',
  'C7': 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  'A7': 'A7.mp3',
  'C8': 'C8.mp3',
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const MIDI_NOTE_NAMES = Array.from({ length: 128 }, (_, midi) => {
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES[midi % 12]}${octave}`
})

function createPianoInstrument(): LiveInstrument {
  let resolveReady: () => void = () => {}
  let rejectReady: (error: Error) => void = () => {}
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  const sampler = new Tone.Sampler({
    urls: SALAMANDER_URLS,
    release: 1,
    baseUrl: SALAMANDER_BASE_URL,
    onload: () => resolveReady(),
    onerror: error => rejectReady(error),
  })

  return {
    output: sampler,
    ready,
    triggerAttackRelease(midi, duration, time, velocity, pedalSustained) {
      // Guard against notes scheduled before the samples finish downloading
      // (e.g. when switching to the piano mid-playback) — Tone throws otherwise.
      if (!sampler.loaded) {
        return
      }
      // Register-aware release mimics longer decay on the piano's bass strings.
      sampler.release = getRegisterRelease(midi, pedalSustained)
      sampler.triggerAttackRelease(
        MIDI_NOTE_NAMES[midi] ?? MIDI_NOTE_NAMES[60],
        duration,
        time,
        velocity,
      )
    },
    releaseAll(time) {
      sampler.releaseAll(time)
    },
    dispose() {
      sampler.dispose()
    },
  }
}

function createSynthInstrument(definition: InstrumentDefinition): LiveInstrument {
  const params = definition.synth
  if (!params) {
    // Should never happen — a synth definition always carries params.
    return createPianoInstrument()
  }

  const { count, spread, type } = params.oscillator
  const oscillator = (
    count > 1
      ? { type: `fat${type}`, count, spread }
      : { type }
  ) as Tone.SynthOptions['oscillator']

  // MonoSynth gives every voice its own filter + filter envelope, so each note
  // has independent cutoff movement — far more expressive than a shared filter.
  const polySynth = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator,
    detune: params.detune,
    envelope: {
      attack: params.amplitudeEnvelope.attack,
      decay: params.amplitudeEnvelope.decay,
      sustain: params.amplitudeEnvelope.sustain,
      release: params.amplitudeEnvelope.release,
    },
    filter: {
      type: 'lowpass',
      Q: params.filterQ,
      rolloff: -24,
    },
    filterEnvelope: {
      attack: params.filterEnvelope.attack,
      decay: params.filterEnvelope.decay,
      sustain: params.filterEnvelope.sustain,
      release: params.filterEnvelope.release,
      baseFrequency: params.filterEnvelope.baseFrequency,
      octaves: params.filterEnvelope.octaves,
    },
  })
  polySynth.maxPolyphony = 48

  const gain = new Tone.Gain(params.gain)
  polySynth.connect(gain)

  return {
    output: gain,
    ready: Promise.resolve(),
    triggerAttackRelease(midi, duration, time, velocity) {
      polySynth.triggerAttackRelease(midiToFrequency(midi), duration, time, velocity)
    },
    releaseAll(time) {
      polySynth.releaseAll(time)
    },
    dispose() {
      polySynth.dispose()
      gain.dispose()
    },
  }
}

export function createLiveInstrument(definition: InstrumentDefinition): LiveInstrument {
  return definition.kind === 'synth'
    ? createSynthInstrument(definition)
    : createPianoInstrument()
}
