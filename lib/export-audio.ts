import type { ExportSourceData, ExportTimeline } from '@/lib/export'
import type { InstrumentId, SynthVoiceParams } from '@/lib/instruments'
import { getInstrument, midiToFrequency } from '@/lib/instruments'
import {
  DEFAULT_REVERB_ROOM_SIZE,
  getNearestPianoSampleMidi,
  getRegisterRelease,
  GLOBAL_VOLUME_BOOST,
  PIANO_SAMPLE_BASE_URL,
  PIANO_SAMPLE_FILES,
} from '@/lib/piano-audio'

interface LoadedPianoSample {
  audioBuffer: AudioBuffer
  midi: number
}

let pianoSampleMapPromise: Promise<Map<number, LoadedPianoSample>> | null = null

interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext
}

function createImpulseResponse(
  context: BaseAudioContext,
  durationSeconds: number,
  decay: number,
) {
  const sampleFrames = Math.max(1, Math.floor(context.sampleRate * durationSeconds))
  const impulse = context.createBuffer(2, sampleFrames, context.sampleRate)

  for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
    const channelData = impulse.getChannelData(channelIndex)
    for (let frameIndex = 0; frameIndex < channelData.length; frameIndex += 1) {
      const normalized = 1 - frameIndex / channelData.length
      const sign = Math.random() > 0.5 ? 1 : -1
      channelData[frameIndex] = sign * normalized ** decay
    }
  }

  return impulse
}

function encodeAudioBufferAsWav(audioBuffer: AudioBuffer) {
  const channelCount = audioBuffer.numberOfChannels
  const sampleCount = audioBuffer.length
  const bitsPerSample = 16
  const blockAlign = channelCount * bitsPerSample / 8
  const byteRate = audioBuffer.sampleRate * blockAlign
  const dataSize = sampleCount * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)
  let offset = 0

  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true)
    offset += 2
  }

  const writeUint32 = (value: number) => {
    view.setUint32(offset, value, true)
    offset += 4
  }

  const writeAscii = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index))
      offset += 1
    }
  }

  writeAscii('RIFF')
  writeUint32(36 + dataSize)
  writeAscii('WAVE')
  writeAscii('fmt ')
  writeUint32(16)
  writeUint16(1)
  writeUint16(channelCount)
  writeUint32(audioBuffer.sampleRate)
  writeUint32(byteRate)
  writeUint16(blockAlign)
  writeUint16(bitsPerSample)
  writeAscii('data')
  writeUint32(dataSize)

  const channels = Array.from({ length: channelCount }, (_, index) =>
    audioBuffer.getChannelData(index))

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][sampleIndex] ?? 0))
      const pcmSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, Math.round(pcmSample), true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function getAudioContextConstructor() {
  const browserWindow = window as WindowWithWebkitAudioContext
  return globalThis.AudioContext ?? browserWindow.webkitAudioContext
}

async function loadPianoSamples() {
  if (!pianoSampleMapPromise) {
    pianoSampleMapPromise = (async () => {
      const AudioContextConstructor = getAudioContextConstructor()

      if (!AudioContextConstructor) {
        throw new Error('This browser cannot decode export audio.')
      }

      const decodeContext = new AudioContextConstructor()

      try {
        const entries = await Promise.all(
          Object.entries(PIANO_SAMPLE_FILES).map(async ([midi, fileName]) => {
            const response = await fetch(`${PIANO_SAMPLE_BASE_URL}${fileName}`)
            if (!response.ok) {
              throw new Error(`Failed to load piano sample ${fileName}.`)
            }

            const arrayBuffer = await response.arrayBuffer()
            const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer.slice(0))

            return [
              Number(midi),
              {
                audioBuffer,
                midi: Number(midi),
              },
            ] as const
          }),
        )

        return new Map(entries)
      }
      finally {
        await decodeContext.close()
      }
    })()
  }

  return pianoSampleMapPromise
}

function connectWithLevel(
  source: AudioNode,
  destination: AudioNode,
  context: BaseAudioContext,
  gainValue: number,
) {
  const gainNode = context.createGain()
  gainNode.gain.value = gainValue
  source.connect(gainNode)
  gainNode.connect(destination)
}

/**
 * Schedule a robust amplitude ADSR on an offline gain param. Times are clamped
 * to stay strictly increasing so extremely short notes never throw.
 */
function applyAmplitudeEnvelope(
  param: AudioParam,
  startTime: number,
  releaseStartTime: number,
  stopTime: number,
  peakGain: number,
  envelope: SynthVoiceParams['amplitudeEnvelope'],
) {
  const floor = 0.0001
  const attackEnd = Math.min(
    startTime + Math.max(envelope.attack, 0.001),
    releaseStartTime,
  )
  const decayEnd = Math.min(
    attackEnd + Math.max(envelope.decay, 0.001),
    releaseStartTime,
  )
  const sustainLevel = Math.max(floor, peakGain * envelope.sustain)

  param.setValueAtTime(floor, Math.max(0, startTime - 0.001))
  param.linearRampToValueAtTime(Math.max(peakGain, floor), attackEnd)
  param.exponentialRampToValueAtTime(sustainLevel, Math.max(decayEnd, attackEnd + 0.001))

  if (releaseStartTime > decayEnd) {
    param.setValueAtTime(sustainLevel, releaseStartTime)
  }

  param.exponentialRampToValueAtTime(floor, Math.max(stopTime, releaseStartTime + 0.005))
}

/**
 * Schedule the per-note filter-cutoff ADSR (in Hz). Mirrors Tone's
 * FrequencyEnvelope: cutoff sweeps `baseFrequency` → `baseFrequency * 2 ** octaves`
 * and settles at the sustained fraction. All ramps are exponential (musical for
 * frequency) with strictly-increasing, positive values.
 */
function applyFilterEnvelope(
  param: AudioParam,
  startTime: number,
  releaseStartTime: number,
  stopTime: number,
  envelope: SynthVoiceParams['filterEnvelope'],
) {
  const minHz = 20
  const baseHz = Math.max(minHz, envelope.baseFrequency)
  const peakHz = Math.max(baseHz, baseHz * 2 ** envelope.octaves)
  const sustainHz = Math.max(minHz, baseHz * 2 ** (envelope.octaves * envelope.sustain))
  const attackEnd = Math.min(
    startTime + Math.max(envelope.attack, 0.001),
    releaseStartTime,
  )
  const decayEnd = Math.min(
    attackEnd + Math.max(envelope.decay, 0.001),
    releaseStartTime,
  )

  param.setValueAtTime(baseHz, Math.max(0, startTime - 0.001))
  param.exponentialRampToValueAtTime(peakHz, attackEnd)
  param.exponentialRampToValueAtTime(sustainHz, Math.max(decayEnd, attackEnd + 0.001))

  if (releaseStartTime > decayEnd) {
    param.setValueAtTime(sustainHz, releaseStartTime)
  }

  param.exponentialRampToValueAtTime(baseHz, Math.max(stopTime, releaseStartTime + 0.005))
}

/**
 * Offline mirror of the live MonoSynth voice: unison oscillators → per-note ADSR
 * gain → a per-note low-pass with its own cutoff envelope → the dry/reverb
 * busses. Kept in lockstep with `lib/instrument-live.ts` so exported audio
 * matches playback.
 */
function scheduleSynthNotes(
  context: OfflineAudioContext,
  source: ExportSourceData,
  timeline: ExportTimeline,
  params: SynthVoiceParams,
  dryBus: AudioNode,
  reverbSend: AudioNode,
) {
  const voiceCount = Math.max(1, Math.round(params.oscillator.count))

  for (const note of source.notes) {
    const startTime = timeline.playbackStartSeconds + note.time
    if (startTime > timeline.totalDurationSeconds) {
      continue
    }

    const releaseStartTime = Math.min(
      startTime + note.duration,
      timeline.totalDurationSeconds,
    )
    const stopTime = Math.min(
      releaseStartTime + params.amplitudeEnvelope.release,
      timeline.totalDurationSeconds,
    )
    if (stopTime <= startTime) {
      continue
    }

    const peakGain = Math.max(
      0.0001,
      Math.min(1.3, note.velocity * Math.max(source.playbackGain, 0.2) * params.gain),
    )

    const noteGain = context.createGain()
    applyAmplitudeEnvelope(
      noteGain.gain,
      startTime,
      releaseStartTime,
      stopTime,
      peakGain,
      params.amplitudeEnvelope,
    )

    const noteFilter = context.createBiquadFilter()
    noteFilter.type = 'lowpass'
    noteFilter.Q.value = params.filterQ
    applyFilterEnvelope(
      noteFilter.frequency,
      startTime,
      releaseStartTime,
      stopTime,
      params.filterEnvelope,
    )

    noteGain.connect(noteFilter)
    connectWithLevel(noteFilter, dryBus, context, 1)
    connectWithLevel(noteFilter, reverbSend, context, 1)

    const frequency = midiToFrequency(note.midi)
    for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex += 1) {
      const oscillator = context.createOscillator()
      oscillator.type = params.oscillator.type
      const detuneOffset = voiceCount > 1
        ? (voiceIndex / (voiceCount - 1) - 0.5) * params.oscillator.spread
        : 0
      oscillator.detune.value = params.detune + detuneOffset
      oscillator.frequency.value = frequency

      const voiceGain = context.createGain()
      voiceGain.gain.value = 1 / voiceCount
      oscillator.connect(voiceGain)
      voiceGain.connect(noteGain)

      oscillator.start(startTime)
      oscillator.stop(stopTime)
    }
  }
}

export async function renderOfflineAudioWav(
  source: ExportSourceData,
  timeline: ExportTimeline,
  volumePercent: number,
  instrumentId: InstrumentId,
) {
  if (typeof OfflineAudioContext === 'undefined') {
    throw new TypeError('This browser cannot render export audio offline.')
  }

  const frameLength = Math.max(
    1,
    Math.ceil(timeline.totalDurationSeconds * 48_000),
  )
  const offlineContext = new OfflineAudioContext(2, frameLength, 48_000)

  const compressor = offlineContext.createDynamicsCompressor()
  compressor.threshold.value = -14
  compressor.knee.value = 16
  compressor.ratio.value = 3
  compressor.attack.value = 0.002
  compressor.release.value = 0.12

  const masterGain = offlineContext.createGain()
  masterGain.gain.value = 1.25 * GLOBAL_VOLUME_BOOST * (volumePercent / 100)

  const dryBus = offlineContext.createGain()
  dryBus.gain.value = 0.42

  const wetBus = offlineContext.createGain()
  wetBus.gain.value = 0.18

  const reverbSend = offlineContext.createGain()
  reverbSend.gain.value = 0.24

  const reverbFilter = offlineContext.createBiquadFilter()
  reverbFilter.type = 'lowpass'
  reverbFilter.frequency.value = 2400
  reverbFilter.Q.value = 0.7

  const convolver = offlineContext.createConvolver()
  convolver.buffer = createImpulseResponse(
    offlineContext,
    2.6 + DEFAULT_REVERB_ROOM_SIZE * 0.8,
    2.3,
  )

  dryBus.connect(masterGain)
  wetBus.connect(masterGain)
  reverbSend.connect(convolver)
  convolver.connect(reverbFilter)
  reverbFilter.connect(wetBus)
  masterGain.connect(compressor)
  compressor.connect(offlineContext.destination)

  for (const event of source.pedalEvents) {
    const eventTime = timeline.playbackStartSeconds + event.time
    if (eventTime < 0 || eventTime > timeline.totalDurationSeconds) {
      continue
    }

    if (event.value >= 64) {
      reverbSend.gain.linearRampToValueAtTime(0.34, Math.min(eventTime + 0.1, timeline.totalDurationSeconds))
    }
    else {
      reverbSend.gain.linearRampToValueAtTime(0.24, Math.min(eventTime + 0.3, timeline.totalDurationSeconds))
    }
  }

  const instrument = getInstrument(instrumentId)

  if (instrument.kind === 'synth' && instrument.synth) {
    scheduleSynthNotes(
      offlineContext,
      source,
      timeline,
      instrument.synth,
      dryBus,
      reverbSend,
    )
  }
  else {
    const pianoSamples = await loadPianoSamples()

    for (const note of source.notes) {
      const sampleMidi = getNearestPianoSampleMidi(note.midi)
      const sample = pianoSamples.get(sampleMidi)

      if (!sample) {
        throw new Error(`No piano sample is available for MIDI ${note.midi}.`)
      }

      const startTime = timeline.playbackStartSeconds + note.time
      if (startTime > timeline.totalDurationSeconds) {
        continue
      }

      const noteGain = offlineContext.createGain()
      const sourceNode = offlineContext.createBufferSource()
      const releaseSeconds = getRegisterRelease(note.midi, note.pedalSustained ?? false)
      const releaseStartTime = Math.min(
        startTime + note.duration,
        timeline.totalDurationSeconds,
      )
      const stopTime = Math.min(
        releaseStartTime + releaseSeconds,
        timeline.totalDurationSeconds,
      )
      const playbackRate = 2 ** ((note.midi - sample.midi) / 12)
      const peakGain = Math.max(
        0.0001,
        Math.min(
          1.35,
          note.velocity
          * Math.max(source.playbackGain, 0.2)
          * 0.9,
        ),
      )

      sourceNode.buffer = sample.audioBuffer
      sourceNode.playbackRate.value = playbackRate

      noteGain.gain.setValueAtTime(0.0001, Math.max(0, startTime - 0.002))
      noteGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.002)
      noteGain.gain.setValueAtTime(peakGain, releaseStartTime)
      noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime)

      sourceNode.connect(noteGain)
      connectWithLevel(noteGain, dryBus, offlineContext, 1)
      connectWithLevel(noteGain, reverbSend, offlineContext, 1)

      sourceNode.start(startTime)
      sourceNode.stop(stopTime)
    }
  }

  const renderedAudio = await offlineContext.startRendering()

  return encodeAudioBufferAsWav(renderedAudio)
}
