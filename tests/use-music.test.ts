// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMusic } from '../hooks/useMusic'
import { midiFixture } from './midi-fixture'
import { audio, Transport } from './tone-boundary'

vi.mock('tone', () => import('./tone-boundary'))

const frames = new Map<number, FrameRequestCallback>()
let frameId = 0

beforeEach(() => {
  audio.samplesLoad = true
  audio.activeParts = 0
  Transport.stop()
  frames.clear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})

afterEach(cleanup)

function advanceTransport(seconds: number) {
  act(() => {
    Transport.seconds = seconds
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach(callback => callback(seconds * 1000))
  })
}

async function loadedMusic() {
  const hook = renderHook(() => useMusic({ language: 'en', volumePercent: 70 }))
  await act(async () => {
    expect(await hook.result.current.loadMidi(midiFixture([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 64, ticks: 1920, durationTicks: 960 },
    ]))).toBe(true)
  })
  return hook
}

describe('useMusic', () => {
  it('loads a real MIDI and exposes its transport duration', async () => {
    const { result } = await loadedMusic()
    expect(result.current).toMatchObject({ trackSource: 'loaded', bpm: 120, duration: 3.5, currentTime: 0, isPlaying: false })
    expect(result.current.notes.map(note => [note.midi, note.time])).toEqual([[60, 0.5], [64, 2.5]])
  })

  it('plays, follows transport progress, pauses, and resumes from the paused position', async () => {
    const { result } = await loadedMusic()
    await act(() => result.current.togglePlay())
    expect(result.current).toMatchObject({ isLoaded: true, isAudioLoading: false, isPlaying: true })
    expect(Transport.state).toBe('started')
    advanceTransport(1.25)
    expect(result.current.currentTime).toBe(1.25)
    await act(() => result.current.togglePlay())
    expect(result.current).toMatchObject({ currentTime: 1.25, isPlaying: false })
    expect(Transport.state).toBe('paused')
    expect(frames.size).toBe(0)
    await act(() => result.current.togglePlay())
    expect(Transport.seconds).toBe(1.25)
    expect(result.current.isPlaying).toBe(true)
  })

  it.each([[-2, 0], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0], [1.2, 1.2], [99, 3.5]])(
    'seeks and clamps %s to %s seconds',
    async (input, expected) => {
      const { result } = await loadedMusic()
      act(() => result.current.seek(input))
      expect(result.current.currentTime).toBe(expected)
      expect(Transport.seconds).toBe(expected)
    },
  )

  it('scales the score and transport when tempo changes, then resets', async () => {
    const { result } = await loadedMusic()
    await act(() => result.current.togglePlay())
    advanceTransport(2)
    act(() => result.current.setBpm(240))
    expect(result.current.bpm).toBe(240)
    expect(result.current.duration).toBe(1.75)
    expect(result.current.notes.map(note => [note.time, note.duration])).toEqual([[0.25, 0.25], [1.25, 0.5]])
    expect(Transport.seconds).toBe(1)
    advanceTransport(1)
    expect(result.current.currentTime).toBe(1)
    act(() => result.current.resetBpm())
    expect(result.current.bpm).toBe(120)
    expect(result.current.duration).toBe(3.5)
    expect(Transport.seconds).toBe(2)
  })

  it('ends at the score boundary and replays from zero', async () => {
    const { result } = await loadedMusic()
    await act(() => result.current.togglePlay())
    advanceTransport(3.5)
    expect(result.current).toMatchObject({ hasEnded: true, isPlaying: false, currentTime: 3.5 })
    expect(frames.size).toBe(0)
    await act(() => result.current.togglePlay())
    expect(result.current).toMatchObject({ hasEnded: false, isPlaying: true, currentTime: 0 })
    expect(Transport.seconds).toBe(0)
  })

  it('cancels playback frames and scheduled parts on unmount', async () => {
    const { result, unmount } = await loadedMusic()
    await act(() => result.current.togglePlay())
    expect(frames.size).toBeGreaterThan(0)
    expect(audio.activeParts).toBeGreaterThan(0)
    unmount()
    expect(frames.size).toBe(0)
    expect(audio.activeParts).toBe(0)
  })

  it('kNOWN DEFECT DIG-3950: failed samples leave readiness pending and loading visible', async () => {
    audio.samplesLoad = false
    const { result } = await loadedMusic()
    let settled = false
    await act(async () => {
      void result.current.ensureAudioReady().then(() => {
        settled = true
      })
      await new Promise(resolve => setTimeout(resolve, 25))
    })
    expect(settled).toBe(false)
    expect(result.current).toMatchObject({ isLoaded: false, isAudioLoading: true, isPlaying: false })
  })
})
