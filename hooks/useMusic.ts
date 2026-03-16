import type { AppLanguage } from '../lib/camera-presets'
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
import * as Tone from 'tone'
import {
  DEFAULT_NOTE_LEAD_IN_SECONDS,
  generateBeautifulPianoPiece,
  parseMidiFile,
} from '../lib/music'

export interface MusicSettings {
  language: AppLanguage
  volumePercent: number
}

interface TrackState {
  originalNotes: NoteEvent[]
  originalPedalEvents: PedalEvent[]
  originalPlaybackGain: number
  originalBpm: number
  bpm: number
}

const GLOBAL_VOLUME_BOOST = 1.75
const TRACK_END_EPSILON_SECONDS = 0.05
// The 3D scene keeps notes visible for about 7 seconds after their onset
// (`DEFAULT_TIME_WINDOW` 10s plus a 4s pad in the visualizer). Let the
// transport coast long enough for the tail of the score to clear naturally.
const VISUAL_OUTRO_CLEARANCE_SECONDS = 7

/** Per-register release envelope — longer for bass, tighter for treble. */
function getRegisterRelease(midi: number, pedalSustained: boolean): number {
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

export function useMusic(settings: MusicSettings) {
  const { language, volumePercent } = settings
  const baseOutputGain = 1.25 * GLOBAL_VOLUME_BOOST
  const defaultReverbRoomSize = 0.8
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
  const [currentTime, setCurrentTime] = useState(0)
  const [hasEnded, setHasEnded] = useState(false)
  const samplerRef = useRef<Tone.Sampler | null>(null)
  const partRef = useRef<Tone.Part | null>(null)
  const pedalPartRef = useRef<Tone.Part | null>(null)
  const trackGainRef = useRef<Tone.Gain | null>(null)
  const dryGainRef = useRef<Tone.Gain | null>(null)
  const reverbSendRef = useRef<Tone.Gain | null>(null)
  const reverbToneRef = useRef<Tone.Filter | null>(null)
  const wetGainRef = useRef<Tone.Gain | null>(null)
  const eqRef = useRef<Tone.EQ3 | null>(null)
  const masterGainRef = useRef<Tone.Gain | null>(null)
  const reverbRef = useRef<Tone.Freeverb | null>(null)
  const limiterRef = useRef<Tone.Limiter | null>(null)
  const meterRef = useRef<Tone.Meter | null>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const partStartedRef = useRef(false)
  const notesRef = useRef<NoteEvent[]>([])
  const isPlayingRef = useRef(false)
  const bpmRef = useRef(100)
  const currentTimeRef = useRef(0)
  const audioDurationRef = useRef(0)
  const playbackEndTimeRef = useRef(0)
  const animationFrameRef = useRef<number | undefined>(undefined)

  const [trackState, setTrackState] = useState<TrackState>(() => ({
    bpm: defaultMusic.bpm,
    originalBpm: defaultMusic.bpm,
    originalNotes: defaultMusic.notes,
    originalPedalEvents: defaultMusic.pedalEvents,
    originalPlaybackGain: defaultMusic.playbackGain,
  }))
  const {
    bpm,
    originalBpm,
    originalNotes,
    originalPedalEvents,
    originalPlaybackGain,
  } = trackState
  const trackPlaybackGain = originalPlaybackGain

  const prevSpeedRef = useRef(1)

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

  const playbackEndTime = useMemo(() => {
    if (notes.length === 0) {
      return 0
    }

    const latestNoteStartTime = Math.max(...notes.map(note => note.time))

    return Math.max(
      duration,
      latestNoteStartTime + VISUAL_OUTRO_CLEARANCE_SECONDS,
    )
  }, [duration, notes])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])

  useEffect(() => {
    audioDurationRef.current = duration
    playbackEndTimeRef.current = playbackEndTime
    const nextTime = Math.min(currentTimeRef.current, playbackEndTime)
    currentTimeRef.current = nextTime
  }, [duration, playbackEndTime])

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

  const clampPlaybackTime = useCallback((time: number) => {
    if (!Number.isFinite(time) || playbackEndTimeRef.current <= 0) {
      return 0
    }

    return Math.min(Math.max(time, 0), playbackEndTimeRef.current)
  }, [])

  const setPlaybackTime = useCallback((time: number) => {
    currentTimeRef.current = time
    setCurrentTime(time)
  }, [])

  const syncTransportTime = useCallback(
    (time: number) => {
      const nextTime = clampAudioTime(time)
      Tone.Transport.seconds = nextTime
      setPlaybackTime(nextTime)
      return nextTime
    },
    [clampAudioTime, setPlaybackTime],
  )

  const finishPlayback = useCallback(() => {
    clearPlaybackFrame()

    const finalTime = clampPlaybackTime(playbackEndTimeRef.current)

    Tone.Transport.pause()
    Tone.Transport.seconds = finalTime
    setPlaybackTime(finalTime)
    setIsPlaying(false)
    setHasEnded(finalTime > 0)
  }, [clampPlaybackTime, clearPlaybackFrame, setPlaybackTime])

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

  const ensureAudioReady = useCallback(async () => {
    await Tone.start()

    if (samplerRef.current) {
      return
    }

    if (!initPromiseRef.current) {
      setIsAudioLoading(true)
      initPromiseRef.current = new Promise<void>((resolve) => {
        limiterRef.current = new Tone.Limiter(-1.5).toDestination()
        meterRef.current = new Tone.Meter({
          channelCount: 2,
          normalRange: false,
          smoothing: 0.85,
        })
        eqRef.current = new Tone.EQ3({ low: 0, mid: 0, high: 0 })
        masterGainRef.current = new Tone.Gain(
          baseOutputGain * (volumePercent / 100),
        )
        eqRef.current.connect(masterGainRef.current)
        masterGainRef.current.connect(limiterRef.current)
        masterGainRef.current.connect(meterRef.current)

        trackGainRef.current = new Tone.Gain(trackPlaybackGain)
        dryGainRef.current = new Tone.Gain(0.42).connect(eqRef.current)
        wetGainRef.current = new Tone.Gain(0.18).connect(eqRef.current)
        reverbToneRef.current = new Tone.Filter({
          Q: 0.7,
          frequency: 2400,
          rolloff: -24,
          type: 'lowpass',
        }).connect(wetGainRef.current)

        reverbRef.current = new Tone.Freeverb({
          dampening: 2200,
          roomSize: defaultReverbRoomSize,
        })
        reverbRef.current.wet.value = 1
        reverbRef.current.connect(reverbToneRef.current)

        reverbSendRef.current = new Tone.Gain(0.24).connect(reverbRef.current)

        samplerRef.current = new Tone.Sampler({
          urls: {
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
          },
          release: 1,
          baseUrl: 'https://tonejs.github.io/audio/salamander/',
          onload: () => {
            setIsLoaded(true)
            setIsAudioLoading(false)
            resolve()
          },
        })

        samplerRef.current.connect(trackGainRef.current)
        trackGainRef.current.connect(dryGainRef.current)
        trackGainRef.current.connect(reverbSendRef.current)
      })
    }

    await initPromiseRef.current
  }, [baseOutputGain, defaultReverbRoomSize, trackPlaybackGain, volumePercent])

  useEffect(() => {
    return () => {
      clearPlaybackFrame()
      partRef.current?.dispose()
      pedalPartRef.current?.dispose()
      samplerRef.current?.dispose()
      trackGainRef.current?.dispose()
      dryGainRef.current?.dispose()
      reverbSendRef.current?.dispose()
      reverbToneRef.current?.dispose()
      wetGainRef.current?.dispose()
      reverbRef.current?.dispose()
      eqRef.current?.dispose()
      masterGainRef.current?.dispose()
      meterRef.current?.dispose()
      limiterRef.current?.dispose()
      initPromiseRef.current = null
    }
  }, [clearPlaybackFrame])


  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = baseOutputGain * (volumePercent / 100)
    }
  }, [baseOutputGain, volumePercent])

  useEffect(() => {
    if (trackGainRef.current) {
      trackGainRef.current.gain.value = trackPlaybackGain
    }
  }, [trackPlaybackGain])

  useEffect(() => {
    if (notes.length === 0)
      return

    const playbackSpeed = bpm / originalBpm
    const wasPlaying = isPlayingRef.current

    const prevSpeed = prevSpeedRef.current
    const currentOriginalTime = Tone.Transport.seconds * prevSpeed
    const newTransportTime = currentOriginalTime / playbackSpeed

    Tone.Transport.seconds = newTransportTime
    prevSpeedRef.current = playbackSpeed

    if (!wasPlaying) {
      currentTimeRef.current = Math.min(
        Math.max(newTransportTime, 0),
        playbackEndTimeRef.current,
      )
    }

    if (partRef.current) {
      partRef.current.dispose()
    }
    if (pedalPartRef.current) {
      pedalPartRef.current.dispose()
    }

    // Note Part — register-aware release
    partRef.current = new Tone.Part<NoteEvent>((time, note) => {
      samplerRef.current!.release = getRegisterRelease(note.midi, note.pedalSustained ?? false)
      samplerRef.current?.triggerAttackRelease(
        Tone.Frequency(note.midi, 'midi').toNote(),
        note.duration,
        time,
        note.velocity,
      )
    }, notes)

    // Pedal Part — dynamic reverb modulation
    if (pedalEvents.length > 0) {
      pedalPartRef.current = new Tone.Part<PedalEvent>((time, event) => {
        const reverbSend = reverbSendRef.current
        const reverb = reverbRef.current
        if (!reverbSend || !reverb)
          return

        if (event.value >= 64) {
          // Pedal down: quick ramp to wetter sound
          reverbSend.gain.rampTo(0.34, 0.1, time)
          reverb.roomSize.rampTo(0.86, 0.1, time)
        }
        else {
          // Pedal up: slower ramp back to dry (asymmetric — mimics acoustic behavior)
          reverbSend.gain.rampTo(0.24, 0.3, time)
          reverb.roomSize.rampTo(defaultReverbRoomSize, 0.3, time)
        }
      }, pedalEvents)
    }

    if (wasPlaying) {
      partRef.current.start(0)
      pedalPartRef.current?.start(0)
      partStartedRef.current = true
    }
    else {
      partStartedRef.current = false
    }
  }, [notes, pedalEvents, bpm, originalBpm, defaultReverbRoomSize])

  useEffect(() => {
    if (isPlaying) {
      const tickPlayback = () => {
        if (!isPlayingRef.current) {
          return
        }

        const nextTime = clampPlaybackTime(Tone.Transport.seconds)

        if (
          playbackEndTimeRef.current > 0
          && nextTime >= playbackEndTimeRef.current - TRACK_END_EPSILON_SECONDS
        ) {
          finishPlayback()
          return
        }

        setPlaybackTime(nextTime)
        animationFrameRef.current = window.requestAnimationFrame(tickPlayback)
      }

      clearPlaybackFrame()
      animationFrameRef.current = window.requestAnimationFrame(tickPlayback)
      return clearPlaybackFrame
    }

    clearPlaybackFrame()
    return clearPlaybackFrame
  }, [
    clampPlaybackTime,
    clearPlaybackFrame,
    finishPlayback,
    isPlaying,
    setPlaybackTime,
  ])

  const togglePlay = useCallback(async () => {
    if (isPlayingRef.current) {
      clearPlaybackFrame()
      Tone.Transport.pause()
      setPlaybackTime(clampPlaybackTime(Tone.Transport.seconds))
      setIsPlaying(false)
      setHasEnded(false)
      return
    }

    await ensureAudioReady()

    const shouldRestartFromBeginning
      = hasEnded
        || (playbackEndTimeRef.current > 0
          && currentTimeRef.current
          >= playbackEndTimeRef.current - TRACK_END_EPSILON_SECONDS)

    if (shouldRestartFromBeginning) {
      syncTransportTime(0)
    }

    if (!partStartedRef.current) {
      partRef.current?.start(0)
      pedalPartRef.current?.start(0)
      partStartedRef.current = true
    }

    Tone.Transport.start()
    setHasEnded(false)
    setIsPlaying(true)
  }, [
    clampPlaybackTime,
    clearPlaybackFrame,
    ensureAudioReady,
    hasEnded,
    setPlaybackTime,
    syncTransportTime,
  ])

  const loadMidi = useCallback(async (file: File) => {
    try {
      clearPlaybackFrame()
      setIsPlaying(false)
      setHasEnded(false)
      setPlaybackTime(0)
      samplerRef.current?.releaseAll()
      Tone.Transport.stop()
      Tone.Transport.seconds = 0
      partStartedRef.current = false
      prevSpeedRef.current = 1

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
          })
        })

        return true
      }

      return false
    }
    catch (error) {
      alert(
        language === 'ja'
          ? 'MIDIファイルを解析できませんでした。'
          : 'Failed to parse MIDI file.',
      )
      return false
    }
  }, [clearPlaybackFrame, language, setPlaybackTime])

  const seek = useCallback((time: number) => {
    const nextTime = syncTransportTime(time)
    const reachedTrackEnd
      = audioDurationRef.current > 0
        && nextTime >= audioDurationRef.current - TRACK_END_EPSILON_SECONDS

    if (reachedTrackEnd) {
      clearPlaybackFrame()
      Tone.Transport.pause()
      setIsPlaying(false)
      setHasEnded(true)
      return
    }

    setHasEnded(false)
  }, [clearPlaybackFrame, syncTransportTime])

  const resetBpm = useCallback(() => {
    setBpm(Math.round(originalBpm))
  }, [originalBpm, setBpm])

  const displayTime = Number.isFinite(currentTime)
    ? Math.min(Math.max(currentTime, 0), duration)
    : 0

  return {
    isPlaying,
    isLoaded,
    isAudioLoading,
    currentTime: displayTime,
    hasEnded,
    togglePlay,
    notes,
    loadMidi,
    duration,
    seek,
    bpm,
    setBpm,
    resetBpm,
  }
}
