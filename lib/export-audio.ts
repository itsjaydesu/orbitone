import type { ExportSourceData, ExportTimeline } from '@/lib/export'
import {
  DEFAULT_REVERB_ROOM_SIZE,
  GLOBAL_VOLUME_BOOST,
  getNearestPianoSampleMidi,
  getRegisterRelease,
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
    audioBuffer.getChannelData(index),
  )

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

export async function renderOfflineAudioWav(
  source: ExportSourceData,
  timeline: ExportTimeline,
  volumePercent: number,
) {
  if (typeof OfflineAudioContext === 'undefined') {
    throw new Error('This browser cannot render export audio offline.')
  }

  const pianoSamples = await loadPianoSamples()
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
    const eventTime = timeline.introSettleSeconds + event.time
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

  for (const note of source.notes) {
    const sampleMidi = getNearestPianoSampleMidi(note.midi)
    const sample = pianoSamples.get(sampleMidi)

    if (!sample) {
      throw new Error(`No piano sample is available for MIDI ${note.midi}.`)
    }

    const startTime = timeline.introSettleSeconds + note.time
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

  const renderedAudio = await offlineContext.startRendering()

  return encodeAudioBufferAsWav(renderedAudio)
}
