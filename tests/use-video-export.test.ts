// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVideoExport } from '../hooks/useVideoExport'
import { AudioContextBoundary } from './web-audio-boundary'

afterEach(cleanup)

it('cancels an existing export session, deletes it, and returns to idle', async () => {
  vi.stubGlobal('AudioContext', AudioContextBoundary)
  vi.stubGlobal('OfflineAudioContext', AudioContextBoundary)
  const frameResponse = Promise.withResolvers<Response>()
  const requests: { url: string, method: string }[] = []
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
    requests.push({ url, method: options?.method ?? 'GET' })
    if (url.endsWith('action=init'))
      return new Response('session/one')
    if (url.endsWith('action=frame'))
      return frameResponse.promise
    return new Response(new Uint8Array([0]))
  })
  const { result } = renderHook(() => useVideoExport({
    exportSource: {
      notes: [{ id: 'one', midi: 60, time: 0.5, duration: 0.5, velocity: 0.7 }],
      pedalEvents: [],
      playbackGain: 1,
    },
    exportSourceFileName: null,
    exportTrackMeta: { enabled: false, title: null, subtitle: null },
    isPlaying: false,
    togglePlay: async () => {},
    volumePercent: 70,
  }))
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'toBlob').mockImplementation(callback => callback(new Blob(['frame'], { type: 'image/png' })))
  act(() => result.current.setExportFrameController({ canvas, renderFrame: () => {} }))
  let exportPromise: Promise<void> | undefined
  act(() => {
    exportPromise = result.current.startExport('mp4', 'current', 'default')
  })
  await waitFor(() => expect(requests.some(request => request.url.endsWith('action=frame'))).toBe(true))
  expect(result.current.phase).toBe('rendering-frames')
  act(() => result.current.cancelExport())
  await act(async () => {
    frameResponse.resolve(new Response('ok'))
    await exportPromise
  })
  expect(requests.filter(request => request.method === 'DELETE')).toEqual([
    { method: 'DELETE', url: '/api/render/export?sessionId=session%2Fone' },
  ])
  expect(requests.some(request => request.url.endsWith('action=finalize'))).toBe(false)
  expect(result.current.phase).toBe('idle')
  expect(result.current.renderState).toBeNull()
})
