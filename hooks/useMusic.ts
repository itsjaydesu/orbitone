import type * as ToneApi from 'tone'
import type { LiveInstrument } from '../lib/instrument-live'
import type { InstrumentId } from '../lib/instruments'
import type {
  NoteEvent,
  PedalEvent,
} from '../lib/music'
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getInstrument } from '../lib/instruments'
import {
  DEFAULT_NOTE_LEAD_IN_SECONDS,
  generateBeautifulPianoPiece,
  parseMidiFile,
} from '../lib/music'
import {
  DEFAULT_REVERB_ROOM_SIZE,
  FX_CHAIN,
  GLOBAL_VOLUME_BOOST,
} from '../lib/piano-audio'
import { setTransportTimeReader } from '../lib/transport-time'

type AudioSessionType = 'ambient' | 'auto' | 'play-and-record' | 'playback' | 'transient' | 'transient-solo'

interface NavigatorAudioSession {
  type: AudioSessionType
}

declare global {
  interface Navigator {
    audioSession?: NavigatorAudioSession
  }
}

export interface MusicSettings {
  volumePercent: number
  instrumentId: InstrumentId
}

interface TrackState {
  originalNotes: NoteEvent[]
  originalPedalEvents: PedalEvent[]
  originalPlaybackGain: number
  originalBpm: number
  bpm: number
  source: 'default' | 'loaded'
}

const TRACK_END_EPSILON_SECONDS = 0.05
const IOS_AUDIO_PRIME_DURATION_SECONDS = 0.04
const IOS_AUDIO_PRIME_TIMEOUT_MS = 150
const TRANSPORT_TICKS_PER_QUARTER = 960

type ToneModule = typeof ToneApi

let toneModule: ToneModule | null = null
let tonePromise: Promise<ToneModule> | null = null

// Tone.js (~120 KB gz) can do nothing before a user gesture, so it stays out
// of the first-paint bundle and loads on first play intent. The context is
// configured immediately after import — this app is pure scheduled playback
// competing with a WebGL render loop, so trade input latency for buffer
// headroom. The `Transport` module export is a static binding to the context
// active at import time; all access goes through getTransport().
function loadTone(): Promise<ToneModule> {
  if (!tonePromise) {
    tonePromise = import('tone').then((module) => {
      module.setContext(
        new module.Context({ latencyHint: 'playback', lookAhead: 0.2 }),
      )
      module.getTransport().PPQ = TRANSPORT_TICKS_PER_QUARTER
      toneModule = module
      return module
    })
  }

  return tonePromise
}

function getLoadedTransport() {
  return toneModule ? toneModule.getTransport() : null
}

function isLikelyIOSSafari() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent
  const isIPhone = /iPhone/i.test(userAgent)
  const isIPad
    = /iPad/i.test(userAgent)
      || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  const isWebKit = /AppleWebKit/i.test(userAgent)
  const isExcludedBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)

  return (isIPhone || isIPad) && isWebKit && !isExcludedBrowser
}

async function setPlaybackAudioSessionType() {
  if (typeof navigator === 'undefined' || !navigator.audioSession) {
    return
  }

  try {
    navigator.audioSession.type = 'playback'
  }
  catch {
    // Safari exposes this API experimentally, so failed writes are non-fatal.
  }
}

async function primeSilentAudioBuffer(context: AudioContext) {
  const frameLength = Math.max(
    1,
    Math.ceil(context.sampleRate * IOS_AUDIO_PRIME_DURATION_SECONDS),
  )
  const buffer = context.createBuffer(1, frameLength, context.sampleRate)
  const source = context.createBufferSource()
  const gain = context.createGain()
  let timeoutId: number | null = null

  gain.gain.value = 1
  source.buffer = buffer
  source.connect(gain)
  gain.connect(context.destination)

  await new Promise<void>((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) {
        return
      }

      settled = true
      source.onended = null

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      source.disconnect()
      gain.disconnect()
      resolve()
    }

    source.onended = finish
    source.start()
    source.stop(context.currentTime + IOS_AUDIO_PRIME_DURATION_SECONDS)
    timeoutId = window.setTimeout(finish, IOS_AUDIO_PRIME_TIMEOUT_MS)
  })
}

export function useMusic(settings: MusicSettings) {
  const { volumePercent, instrumentId } = settings
  const baseOutputGain = FX_CHAIN.masterGain * GLOBAL_VOLUME_BOOST
  const defaultMusic = useMemo(() => {
    const piece = generateBeautifulPianoPiece(32, 100)

    return {
      ...piece,
      notes: piece.notes.map(note => ({
        ...note,
        time: note.time + DEFAULT_NOTE_LEAD_IN_SECONDS,
      })),
    }
  }, [])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isAudioLoading, setIsAudioLoading] = useState(false)
  const [hasEnded, setHasEnded] = useState(false)
  const instrumentsRef = useRef<Map<InstrumentId, LiveInstrument>>(new Map())
  const instrumentBuildPromisesRef = useRef<
    Map<InstrumentId, Promise<LiveInstrument | null>>
  >(new Map())
  const chainReadyRef = useRef(false)
  const activeInstrumentIdRef = useRef<InstrumentId>(instrumentId)
  const partRef = useRef<ToneApi.Part<[string, NoteEvent]> | null>(null)
  const pedalPartRef = useRef<ToneApi.Part<[string, PedalEvent]> | null>(null)
  const trackGainRef = useRef<ToneApi.Gain | null>(null)
  const dryGainRef = useRef<ToneApi.Gain | null>(null)
  const reverbSendRef = useRef<ToneApi.Gain | null>(null)
  const reverbToneRef = useRef<ToneApi.Filter | null>(null)
  const wetGainRef = useRef<ToneApi.Gain | null>(null)
  const masterGainRef = useRef<ToneApi.Gain | null>(null)
  const reverbRef = useRef<ToneApi.Freeverb | null>(null)
  const limiterRef = useRef<ToneApi.Limiter | null>(null)
  const meterRef = useRef<ToneApi.Meter | null>(null)
  const partsDirtyRef = useRef(false)
  const scheduleTrackPartsRef = useRef<((tone: ToneModule) => void) | null>(null)
  const partStartedRef = useRef(false)
  const isPlayingRef = useRef(false)
  const bpmRef = useRef(100)
  const playbackSpeedRef = useRef(1)
  const currentTimeRef = useRef(0)
  const audioDurationRef = useRef(0)
  const audioLevelRef = useRef(0)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const [audioLoadFailed, setAudioLoadFailed] = useState(false)
  const [requiresExplicitAudioUnlock, setRequiresExplicitAudioUnlock] = useState(false)
  const unlockPromiseRef = useRef<Promise<boolean> | null>(null)
  const requiresExplicitUnlockRef = useRef(false)
  const isAudioUnlockedRef = useRef(false)
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false)
  const [isAudioUnlocking, setIsAudioUnlocking] = useState(false)

  const [trackState, setTrackState] = useState<TrackState>(() => ({
    bpm: defaultMusic.bpm,
    originalBpm: defaultMusic.bpm,
    originalNotes: defaultMusic.notes,
    originalPedalEvents: defaultMusic.pedalEvents,
    originalPlaybackGain: defaultMusic.playbackGain,
    source: 'default',
  }))
  const {
    bpm,
    originalBpm,
    originalNotes,
    originalPedalEvents,
    originalPlaybackGain,
    source: trackSource,
  } = trackState
  const trackPlaybackGain = originalPlaybackGain

  const notes = useMemo(() => {
    const playbackSpeed = bpm / originalBpm

    return originalNotes.map(note => ({
      ...note,
      time: note.time / playbackSpeed,
      duration: note.duration / playbackSpeed,
    }))
  }, [bpm, originalBpm, originalNotes])

  const pedalEvents = useMemo(() => {
    const playbackSpeed = bpm / originalBpm
    return originalPedalEvents.map(e => ({
      ...e,
      time: e.time / playbackSpeed,
    }))
  }, [bpm, originalBpm, originalPedalEvents])

  const duration = useMemo(() => {
    if (notes.length === 0) {
      return 0
    }

    return Math.max(...notes.map(note => note.time + note.duration))
  }, [notes])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    setRequiresExplicitAudioUnlock(isLikelyIOSSafari())
  }, [])

  useEffect(() => {
    requiresExplicitUnlockRef.current = requiresExplicitAudioUnlock
  }, [requiresExplicitAudioUnlock])

  useEffect(() => {
    isAudioUnlockedRef.current = isAudioUnlocked
  }, [isAudioUnlocked])

  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])

  useEffect(() => {
    audioDurationRef.current = duration
    const nextTime = Math.min(currentTimeRef.current, duration)
    currentTimeRef.current = nextTime
  }, [duration])

  const clearPlaybackFrame = useCallback(() => {
    if (animationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = undefined
    }
  }, [])

  const clampAudioTime = useCallback((time: number) => {
    if (!Number.isFinite(time) || audioDurationRef.current <= 0) {
      return 0
    }

    return Math.min(Math.max(time, 0), audioDurationRef.current)
  }, [])

  const getPlaybackTime = useCallback(() => currentTimeRef.current, [])

  const syncTransportTime = useCallback(
    (time: number) => {
      const nextTime = clampAudioTime(time)
      const transport = getLoadedTransport()
      if (transport) {
        transport.seconds = nextTime
      }
      currentTimeRef.current = nextTime
      return nextTime
    },
    [clampAudioTime],
  )

  const pausePlayback = useCallback(() => {
    clearPlaybackFrame()
    const transport = getLoadedTransport()
    if (transport) {
      transport.pause()
      currentTimeRef.current = clampAudioTime(transport.seconds)
    }
    audioLevelRef.current = 0
    setIsPlaying(false)
    setHasEnded(false)
  }, [clampAudioTime, clearPlaybackFrame])

  const finishPlayback = useCallback(() => {
    clearPlaybackFrame()

    const finalTime = clampAudioTime(audioDurationRef.current)
    const transport = getLoadedTransport()

    if (transport) {
      transport.pause()
      transport.seconds = finalTime
    }
    currentTimeRef.current = finalTime
    audioLevelRef.current = 0
    setIsPlaying(false)
    setHasEnded(finalTime > 0)
  }, [clampAudioTime, clearPlaybackFrame])

  const setBpm = useCallback((value: number) => {
    const nextBpm = Math.round(value)

    setTrackState((current) => {
      if (current.bpm === nextBpm) {
        return current
      }

      return {
        ...current,
        bpm: nextBpm,
      }
    })
  }, [])

  // Build the shared master/FX chain once. Instruments feed into `trackGain`.
  const ensureChain = useCallback((tone: ToneModule) => {
    if (chainReadyRef.current) {
      return
    }

    limiterRef.current = new tone.Limiter(-1.5).toDestination()
    meterRef.current = new tone.Meter({
      channelCount: 2,
      normalRange: false,
      smoothing: 0.85,
    })
    masterGainRef.current = new tone.Gain(
      baseOutputGain * (volumePercent / 100),
    )
    masterGainRef.current.connect(limiterRef.current)
    masterGainRef.current.connect(meterRef.current)

    trackGainRef.current = new tone.Gain(trackPlaybackGain)
    dryGainRef.current = new tone.Gain(FX_CHAIN.dryLevel).connect(masterGainRef.current)
    wetGainRef.current = new tone.Gain(FX_CHAIN.wetLevel).connect(masterGainRef.current)
    reverbToneRef.current = new tone.Filter({
      Q: FX_CHAIN.reverbFilterQ,
      frequency: FX_CHAIN.reverbFilterFrequency,
      rolloff: -24,
      type: 'lowpass',
    }).connect(wetGainRef.current)

    reverbRef.current = new tone.Freeverb({
      dampening: 2200,
      roomSize: DEFAULT_REVERB_ROOM_SIZE,
    })
    reverbRef.current.wet.value = 1
    reverbRef.current.connect(reverbToneRef.current)

    reverbSendRef.current = new tone.Gain(FX_CHAIN.reverbSendLevel).connect(reverbRef.current)

    trackGainRef.current.connect(dryGainRef.current)
    trackGainRef.current.connect(reverbSendRef.current)

    chainReadyRef.current = true
  }, [baseOutputGain, trackPlaybackGain, volumePercent])

  // Lazily build (and cache) a voice, wiring it into the shared chain. Voices
  // are kept alive so switching back to a previously-used instrument is instant
  // and never re-downloads piano samples. A failed build (e.g. sample download
  // on a flaky network) is evicted so the next attempt retries from scratch.
  const ensureInstrument = useCallback(
    async (id: InstrumentId): Promise<LiveInstrument | null> => {
      const trackGain = trackGainRef.current
      if (!trackGain) {
        return null
      }

      const cached = instrumentsRef.current.get(id)
      if (cached) {
        try {
          await cached.ready
          return cached
        }
        catch {
          return null
        }
      }

      let pending = instrumentBuildPromisesRef.current.get(id)
      if (!pending) {
        const definition = getInstrument(id)

        if (definition.kind === 'sampler') {
          setIsAudioLoading(true)
        }
        setAudioLoadFailed(false)

        pending = import('../lib/instrument-live')
          .then(({ createLiveInstrument }) => {
            const instrument = createLiveInstrument(definition)
            instrument.output.connect(trackGain)
            instrumentsRef.current.set(id, instrument)
            return instrument.ready.then(() => {
              setIsLoaded(true)
              return instrument
            })
          })
          .catch(() => {
            const instrument = instrumentsRef.current.get(id)
            instrumentsRef.current.delete(id)
            instrumentBuildPromisesRef.current.delete(id)
            instrument?.dispose()
            setAudioLoadFailed(true)
            return null
          })
          .finally(() => {
            if (definition.kind === 'sampler') {
              setIsAudioLoading(false)
            }
          })
        instrumentBuildPromisesRef.current.set(id, pending)
      }

      return pending
    },
    [],
  )

  const ensureAudioReady = useCallback(async () => {
    const tone = await loadTone()
    await tone.start()
    ensureChain(tone)

    if (partsDirtyRef.current) {
      scheduleTrackPartsRef.current?.(tone)
    }

    const instrument = await ensureInstrument(activeInstrumentIdRef.current)
    return instrument !== null
  }, [ensureChain, ensureInstrument])

  const unlockAudio = useCallback(async () => {
    if (!requiresExplicitUnlockRef.current || isAudioUnlockedRef.current) {
      return true
    }

    if (!unlockPromiseRef.current) {
      setIsAudioUnlocking(true)
      unlockPromiseRef.current = (async () => {
        try {
          await setPlaybackAudioSessionType()
          const tone = await loadTone()
          await tone.start()
          const rawContext = tone.getContext().rawContext as AudioContext

          if (rawContext.state !== 'running') {
            await rawContext.resume()
          }

          await primeSilentAudioBuffer(rawContext)
          const ready = await ensureAudioReady()

          if (!ready) {
            return false
          }

          isAudioUnlockedRef.current = true
          setIsAudioUnlocked(true)
          return true
        }
        catch {
          return false
        }
        finally {
          setIsAudioUnlocking(false)
          unlockPromiseRef.current = null
        }
      })()
    }

    return await unlockPromiseRef.current
  }, [ensureAudioReady])

  useEffect(() => {
    return () => {
      clearPlaybackFrame()
      const transport = getLoadedTransport()
      if (transport) {
        transport.stop()
        transport.cancel()
        transport.seconds = 0
      }
      partRef.current?.dispose()
      pedalPartRef.current?.dispose()
      instrumentsRef.current.forEach(instrument => instrument.dispose())
      instrumentsRef.current.clear()
      instrumentBuildPromisesRef.current.clear()
      trackGainRef.current?.dispose()
      dryGainRef.current?.dispose()
      reverbSendRef.current?.dispose()
      reverbToneRef.current?.dispose()
      wetGainRef.current?.dispose()
      reverbRef.current?.dispose()
      masterGainRef.current?.dispose()
      meterRef.current?.dispose()
      limiterRef.current?.dispose()
      chainReadyRef.current = false
    }
  }, [clearPlaybackFrame])

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.rampTo(
        baseOutputGain * (volumePercent / 100),
        0.05,
      )
    }
  }, [baseOutputGain, volumePercent])

  useEffect(() => {
    if (trackGainRef.current) {
      trackGainRef.current.gain.rampTo(trackPlaybackGain, 0.05)
    }
  }, [trackPlaybackGain])

  // Switch the active instrument. Before the chain exists, just remember the id
  // (honored on first play). Otherwise build the new voice and only flip to it
  // once it is ready — piano samples can take a moment — keeping the previous
  // voice audible during the handoff so no notes drop or hit an unloaded sampler.
  useEffect(() => {
    if (!chainReadyRef.current) {
      activeInstrumentIdRef.current = instrumentId
      return
    }

    let cancelled = false

    void ensureInstrument(instrumentId).then((instrument) => {
      if (cancelled || !instrument) {
        return
      }

      activeInstrumentIdRef.current = instrumentId
      instrumentsRef.current.forEach((other, id) => {
        if (id !== instrumentId) {
          other.releaseAll()
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [ensureInstrument, instrumentId])

  // Parts are scheduled once per track, in transport ticks at the original
  // tempo. Tempo changes are then a single Transport.bpm write — the tick
  // timeline stretches for free, with no Part rebuild and no note-array churn.
  // Scheduling is deferred until Tone has loaded (first play intent).
  useEffect(() => {
    const scheduleTrackParts = (tone: ToneModule) => {
      const transport = tone.getTransport()
      const ticksPerSecond = (originalBpm / 60) * transport.PPQ
      const toTicks = (seconds: number) =>
        `${Math.max(0, Math.round(seconds * ticksPerSecond))}i`
      const wasPlaying = isPlayingRef.current

      partRef.current?.dispose()
      partRef.current = null
      pedalPartRef.current?.dispose()
      pedalPartRef.current = null
      partsDirtyRef.current = false

      if (originalNotes.length === 0) {
        return
      }

      // Note Part — dispatches to whichever instrument is currently active.
      partRef.current = new tone.Part<[string, NoteEvent]>((time, note) => {
        const instrument = instrumentsRef.current.get(activeInstrumentIdRef.current)
        instrument?.triggerAttackRelease(
          note.midi,
          note.duration / playbackSpeedRef.current,
          time,
          note.velocity,
          note.pedalSustained ?? false,
        )
      }, originalNotes.map((note): [string, NoteEvent] => [toTicks(note.time), note]))

      // Pedal Part — dynamic reverb modulation
      if (originalPedalEvents.length > 0) {
        pedalPartRef.current = new tone.Part<[string, PedalEvent]>((time, event) => {
          const reverbSend = reverbSendRef.current
          const reverb = reverbRef.current
          if (!reverbSend || !reverb)
            return

          if (event.value >= 64) {
            // Pedal down: quick ramp to wetter sound
            reverbSend.gain.rampTo(FX_CHAIN.pedalDownSendLevel, FX_CHAIN.pedalDownRampSeconds, time)
            reverb.roomSize.rampTo(FX_CHAIN.pedalDownRoomSize, FX_CHAIN.pedalDownRampSeconds, time)
          }
          else {
            // Pedal up: slower ramp back to dry (asymmetric — mimics acoustic behavior)
            reverbSend.gain.rampTo(FX_CHAIN.reverbSendLevel, FX_CHAIN.pedalUpRampSeconds, time)
            reverb.roomSize.rampTo(DEFAULT_REVERB_ROOM_SIZE, FX_CHAIN.pedalUpRampSeconds, time)
          }
        }, originalPedalEvents.map((event): [string, PedalEvent] => [toTicks(event.time), event]))
      }

      transport.bpm.value = bpmRef.current
      transport.seconds = currentTimeRef.current

      if (wasPlaying) {
        partRef.current.start(0)
        pedalPartRef.current?.start(0)
        partStartedRef.current = true
      }
      else {
        partStartedRef.current = false
      }
    }

    scheduleTrackPartsRef.current = scheduleTrackParts

    if (toneModule) {
      scheduleTrackParts(toneModule)
    }
    else {
      partsDirtyRef.current = true
      partStartedRef.current = false
    }
  }, [originalNotes, originalPedalEvents, originalBpm])

  useEffect(() => {
    playbackSpeedRef.current = bpm / originalBpm

    const transport = getLoadedTransport()
    if (!transport) {
      return
    }

    transport.bpm.value = bpm

    if (!isPlayingRef.current) {
      currentTimeRef.current = clampAudioTime(transport.seconds)
    }
  }, [bpm, clampAudioTime, originalBpm])

  useEffect(() => {
    if (isPlaying) {
      const tickPlayback = () => {
        const transport = getLoadedTransport()
        if (!isPlayingRef.current || !transport) {
          return
        }

        const nextTime = clampAudioTime(transport.seconds)

        if (
          audioDurationRef.current > 0
          && nextTime >= audioDurationRef.current - TRACK_END_EPSILON_SECONDS
        ) {
          finishPlayback()
          return
        }

        currentTimeRef.current = nextTime

        const meter = meterRef.current
        if (meter) {
          const level = meter.getValue()
          const db = Array.isArray(level) ? Math.max(...level) : level
          audioLevelRef.current = Math.min(Math.max((db + 48) / 48, 0), 1)
        }

        animationFrameRef.current = window.requestAnimationFrame(tickPlayback)
      }

      clearPlaybackFrame()
      animationFrameRef.current = window.requestAnimationFrame(tickPlayback)
      return clearPlaybackFrame
    }

    clearPlaybackFrame()
    return clearPlaybackFrame
  }, [
    clampAudioTime,
    clearPlaybackFrame,
    finishPlayback,
    isPlaying,
  ])

  // The transport is paused when the tab hides or the context is interrupted
  // (iOS call, Control Center); otherwise scheduled notes are dropped while the
  // UI keeps advancing silently.
  useEffect(() => {
    const pauseIfPlaying = () => {
      if (isPlayingRef.current) {
        pausePlayback()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseIfPlaying()
        return
      }

      const rawContext = toneModule?.getContext().rawContext
      if (
        rawContext
        && rawContext.state !== 'running'
        && isAudioUnlockedRef.current
      ) {
        void rawContext.resume().catch(() => {})
      }
    }

    // The context (and therefore statechange) only exists once Tone has
    // loaded; isPlaying in the deps re-runs this after the first play.
    const rawContext = toneModule?.getContext().rawContext ?? null
    const handleStateChange = () => {
      if (rawContext && rawContext.state !== 'running') {
        pauseIfPlaying()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', pauseIfPlaying)
    rawContext?.addEventListener('statechange', handleStateChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', pauseIfPlaying)
      rawContext?.removeEventListener('statechange', handleStateChange)
    }
  }, [isPlaying, pausePlayback])

  useEffect(() => {
    setTransportTimeReader(() => getLoadedTransport()?.seconds ?? currentTimeRef.current)

    return () => {
      setTransportTimeReader(null)
    }
  }, [])

  const togglePlayBusyRef = useRef(false)
  const [isStartingPlayback, setIsStartingPlayback] = useState(false)

  const togglePlay = useCallback(async () => {
    if (isPlayingRef.current) {
      pausePlayback()
      return
    }

    if (togglePlayBusyRef.current) {
      return
    }

    togglePlayBusyRef.current = true
    setIsStartingPlayback(true)

    try {
      if (requiresExplicitUnlockRef.current && !isAudioUnlockedRef.current) {
        const didUnlock = await unlockAudio()

        if (!didUnlock) {
          return
        }
      }

      await setPlaybackAudioSessionType()
      const ready = await ensureAudioReady()

      if (!ready) {
        return
      }

      const shouldRestartFromBeginning
        = hasEnded
          || (audioDurationRef.current > 0
            && currentTimeRef.current
            >= audioDurationRef.current - TRACK_END_EPSILON_SECONDS)

      if (shouldRestartFromBeginning) {
        syncTransportTime(0)
      }

      if (!partStartedRef.current) {
        partRef.current?.start(0)
        pedalPartRef.current?.start(0)
        partStartedRef.current = true
      }

      getLoadedTransport()?.start()
      if (requiresExplicitUnlockRef.current && !isAudioUnlockedRef.current) {
        isAudioUnlockedRef.current = true
        setIsAudioUnlocked(true)
      }
      setHasEnded(false)
      setIsPlaying(true)
    }
    finally {
      togglePlayBusyRef.current = false
      setIsStartingPlayback(false)
    }
  }, [
    ensureAudioReady,
    hasEnded,
    pausePlayback,
    unlockAudio,
    syncTransportTime,
  ])

  const loadMidi = useCallback(async (file: File) => {
    try {
      clearPlaybackFrame()
      setIsPlaying(false)
      setHasEnded(false)
      currentTimeRef.current = 0
      instrumentsRef.current.forEach(instrument => instrument.releaseAll())
      const transport = getLoadedTransport()
      if (transport) {
        transport.stop()
        transport.seconds = 0
      }
      partStartedRef.current = false

      const {
        notes: parsedNotes,
        bpm: parsedBpm,
        pedalEvents: parsedPedalEvents,
        playbackGain: parsedPlaybackGain,
      } = await parseMidiFile(file)
      if (parsedNotes.length > 0) {
        const roundedBpm = Math.round(parsedBpm)

        startTransition(() => {
          setTrackState({
            bpm: roundedBpm,
            originalBpm: roundedBpm,
            originalNotes: parsedNotes,
            originalPedalEvents: parsedPedalEvents,
            originalPlaybackGain: parsedPlaybackGain,
            source: 'loaded',
          })
        })

        return true
      }

      return false
    }
    catch {
      return false
    }
  }, [clearPlaybackFrame])

  const seek = useCallback((time: number) => {
    const nextTime = syncTransportTime(time)
    const reachedTrackEnd
      = audioDurationRef.current > 0
        && nextTime >= audioDurationRef.current - TRACK_END_EPSILON_SECONDS

    if (reachedTrackEnd) {
      clearPlaybackFrame()
      getLoadedTransport()?.pause()
      setIsPlaying(false)
      setHasEnded(true)
      return
    }

    setHasEnded(false)
  }, [clearPlaybackFrame, syncTransportTime])

  const resetBpm = useCallback(() => {
    setBpm(Math.round(originalBpm))
  }, [originalBpm, setBpm])

  return {
    isPlaying,
    isLoaded,
    isAudioLoading,
    isStartingPlayback,
    audioLoadFailed,
    audioLevelRef,
    getPlaybackTime,
    hasEnded,
    togglePlay,
    notes,
    loadMidi,
    duration,
    seek,
    bpm,
    setBpm,
    resetBpm,
    ensureAudioReady,
    unlockAudio,
    requiresExplicitAudioUnlock,
    isAudioUnlocked,
    isAudioUnlocking,
    pedalEvents,
    playbackGain: trackPlaybackGain,
    trackSource,
  }
}
