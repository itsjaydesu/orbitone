import type { LucideIcon } from 'lucide-react'
import type { AppLanguage } from '@/lib/camera-presets'
import { AudioWaveform, Piano, Sparkles, Zap } from 'lucide-react'

/**
 * Instruments are modeled as pure data. Two thin renderers read this registry:
 *  - `lib/instrument-live.ts` builds a Tone.js voice for real-time playback.
 *  - `lib/export-audio.ts` re-creates the same voice with raw Web Audio for
 *    offline video export.
 * Adding a new instrument is (almost) just adding an entry here.
 */

export type InstrumentId = 'grand-piano' | 'analog-pad' | 'square-lead' | 'glass-bells'

export type InstrumentKind = 'sampler' | 'synth'

/** Base waveform for the subtractive synth engine (maps to raw + Tone oscillators). */
export type SynthWaveform = 'sawtooth' | 'square' | 'triangle' | 'sine'

/** ADSR envelope; times in seconds, `sustain` is a 0–1 level. */
export interface SynthAdsr {
  attack: number
  decay: number
  sustain: number
  release: number
}

/**
 * Parameters for the subtractive synth engine (one `Tone.MonoSynth` per voice).
 * A single engine renders every preset — presets differ only in these values,
 * which is what makes the registry data-driven.
 *
 * Each note gets its own amplitude AND filter envelope: the filter cutoff sweeps
 * per-note, which is what gives synths their expressive "movement" and lets
 * velocity read as brightness + loudness, closer to how the piano responds.
 */
export interface SynthVoiceParams {
  oscillator: {
    type: SynthWaveform
    /** Unison voice count for detuned width (1 = a single oscillator). */
    count: number
    /** Detune spread in cents across the unison voices. */
    spread: number
  }
  /** Amplitude ADSR. Lower sustain ⇒ more velocity dynamics, more piano-like. */
  amplitudeEnvelope: SynthAdsr
  /** Resonance of the per-voice low-pass filter. */
  filterQ: number
  /**
   * The filter cutoff is driven by its own ADSR — this is the movement. Cutoff
   * ranges from `baseFrequency` up to `baseFrequency * 2 ** octaves` at the peak.
   */
  filterEnvelope: SynthAdsr & {
    baseFrequency: number
    octaves: number
  }
  /** Output level (linear) so synths sit at a comparable loudness to the piano. */
  gain: number
  /** Whole-voice detune in cents. */
  detune: number
}

export interface InstrumentDefinition {
  id: InstrumentId
  kind: InstrumentKind
  icon: LucideIcon
  label: Record<AppLanguage, string>
  blurb: Record<AppLanguage, string>
  /** Present only when `kind === 'synth'`. */
  synth?: SynthVoiceParams
}

export const DEFAULT_INSTRUMENT_ID: InstrumentId = 'grand-piano'

export const INSTRUMENTS: Record<InstrumentId, InstrumentDefinition> = {
  'grand-piano': {
    id: 'grand-piano',
    kind: 'sampler',
    icon: Piano,
    label: { en: 'Grand Piano', ja: 'グランドピアノ' },
    blurb: {
      en: 'Sampled acoustic grand — the classic Orbitone voice.',
      ja: 'サンプリングのアコースティックグランド。定番の音色です。',
    },
  },
  'analog-pad': {
    id: 'analog-pad',
    kind: 'synth',
    icon: AudioWaveform,
    label: { en: 'Analog', ja: 'アナログ' },
    blurb: {
      en: 'Warm detuned saws with a soft low-pass — round and lush.',
      ja: 'デチューンした温かいノコギリ波にソフトなローパス。丸くて豊かな音。',
    },
    synth: {
      oscillator: { type: 'sawtooth', count: 3, spread: 20 },
      amplitudeEnvelope: { attack: 0.02, decay: 0.35, sustain: 0.55, release: 1.3 },
      filterQ: 2,
      filterEnvelope: {
        attack: 0.05,
        decay: 0.6,
        sustain: 0.4,
        release: 1,
        baseFrequency: 380,
        octaves: 3.6,
      },
      gain: 1.15,
      detune: 0,
    },
  },
  'square-lead': {
    id: 'square-lead',
    kind: 'synth',
    icon: Zap,
    label: { en: 'Square', ja: 'スクエア' },
    blurb: {
      en: 'Hollow square lead with a bright, snappy attack — chiptune energy.',
      ja: '中空のスクエアリード。明るく歯切れのよいアタック。チップチューン風。',
    },
    synth: {
      oscillator: { type: 'square', count: 1, spread: 0 },
      amplitudeEnvelope: { attack: 0.005, decay: 0.18, sustain: 0.5, release: 0.4 },
      filterQ: 1.5,
      filterEnvelope: {
        attack: 0.005,
        decay: 0.22,
        sustain: 0.55,
        release: 0.35,
        baseFrequency: 700,
        octaves: 3.2,
      },
      gain: 0.8,
      detune: 0,
    },
  },
  'glass-bells': {
    id: 'glass-bells',
    kind: 'synth',
    icon: Sparkles,
    label: { en: 'Glass', ja: 'グラス' },
    blurb: {
      en: 'Shimmering triangle bells with a long, glassy tail.',
      ja: 'きらめくトライアングルのベル。長くガラスのように伸びる余韻。',
    },
    synth: {
      oscillator: { type: 'triangle', count: 2, spread: 12 },
      amplitudeEnvelope: { attack: 0.003, decay: 1.1, sustain: 0.06, release: 1.8 },
      filterQ: 0.8,
      filterEnvelope: {
        attack: 0.003,
        decay: 0.9,
        sustain: 0.25,
        release: 1.5,
        baseFrequency: 1100,
        octaves: 3.4,
      },
      gain: 1.25,
      detune: 0,
    },
  },
}

/** Registry order used by the instrument picker. */
export const INSTRUMENT_LIST: InstrumentDefinition[] = [
  INSTRUMENTS['grand-piano'],
  INSTRUMENTS['analog-pad'],
  INSTRUMENTS['square-lead'],
  INSTRUMENTS['glass-bells'],
]

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === 'string' && value in INSTRUMENTS
}

export function getInstrument(id: InstrumentId): InstrumentDefinition {
  return INSTRUMENTS[id] ?? INSTRUMENTS[DEFAULT_INSTRUMENT_ID]
}

/** MIDI note number → frequency (A4 = 440 Hz). Shared by both renderers. */
export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}
