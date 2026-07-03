import type { InstrumentDefinition } from '@/lib/instruments'
import * as Tone from 'tone'
import { midiToFrequency } from '@/lib/instruments'
import {
  fetchPianoSampleArrayBuffer,
  getRegisterRelease,
  midiToNoteName,
  PIANO_SAMPLE_MIDI_VALUES,
} from '@/lib/piano-audio'

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

function createPianoInstrument(): LiveInstrument {
  const sampler = new Tone.Sampler({ release: 1 })

  // Samples come through the shared fetch cache (one download per page, also
  // reused by offline export) and are decoded into the live context here.
  const ready = (async () => {
    const rawContext = Tone.getContext().rawContext
    await Promise.all(PIANO_SAMPLE_MIDI_VALUES.map(async (midi) => {
      const arrayBuffer = await fetchPianoSampleArrayBuffer(midi)
      const audioBuffer = await rawContext.decodeAudioData(arrayBuffer.slice(0))
      sampler.add(midiToNoteName(midi) as Tone.Unit.Note, audioBuffer)
    }))
  })()

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
        midiToNoteName(midi),
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
