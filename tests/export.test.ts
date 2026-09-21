import { describe, expect, it } from 'vitest'
import {
  createExportTimeline,
  getExportAudioDurationSeconds,
  getExportCameraTransitionState,
  getExportCameraView,
  getExportFadeToBlackOpacity,
  getExportFrameRenderState,
  getExportTransportTime,
} from '../lib/export'

const notes = [
  { id: 'first', midi: 60, time: 0.5, duration: 1, velocity: 0.8 },
  { id: 'last', midi: 64, time: 3, duration: 2, velocity: 0.6 },
]

describe('export timeline', () => {
  it('keeps the intro, five-second audio, seven-second visual tail, and final fade', () => {
    const timeline = createExportTimeline(notes)
    expect(timeline).toMatchObject({
      fps: 60,
      width: 1080,
      height: 1920,
      frameCount: 972,
      audioDurationSeconds: 5,
      firstNoteTimeSeconds: 0.5,
      playbackEndSeconds: 10,
    })
    expect(timeline.introSettleSeconds).toBeCloseTo(3.7)
    expect(timeline.playbackStartSeconds).toBeCloseTo(3.2)
    expect(timeline.contentEndSeconds).toBeCloseTo(13.2)
    expect(timeline.finalFadeStartSeconds).toBeCloseTo(13.2)
    expect(timeline.totalDurationSeconds).toBeCloseTo(16.2)
  })

  it('delays a cycling-camera fade until its next stable window', () => {
    const timeline = createExportTimeline(notes, 'cycle')
    expect(timeline.finalFadeStartSeconds).toBe(20)
    expect(timeline.totalDurationSeconds).toBe(23)
    expect(timeline.frameCount).toBe(1380)
  })

  it('clamps frame and transport boundaries', () => {
    const timeline = createExportTimeline(notes)
    expect(getExportFrameRenderState(timeline, -1, 'current', 'side')).toMatchObject({
      frameIndex: 0,
      globalTime: 0,
      transportTime: 0,
      cameraView: 'side',
    })
    expect(getExportFrameRenderState(timeline, 222, 'current', 'side').transportTime).toBeCloseTo(0.5)
    const finalFrame = getExportFrameRenderState(timeline, 9999, 'current', 'side')
    expect(finalFrame).toMatchObject({ frameIndex: 971, progress: 1, transportTime: 10 })
    expect(finalFrame.globalTime).toBeCloseTo(16.1833333333)
    expect(getExportTransportTime(-20, timeline)).toBe(0)
    expect(getExportTransportTime(100, timeline)).toBe(10)
  })

  it('reaches full black on the last displayed frame', () => {
    const timeline = createExportTimeline(notes)
    expect(getExportFadeToBlackOpacity(0, timeline)).toBe(0)
    expect(getExportFadeToBlackOpacity(timeline.finalFadeStartSeconds, timeline)).toBe(0)
    expect(getExportFadeToBlackOpacity(14.6833333333333, timeline)).toBeCloseTo(0.5)
    expect(getExportFadeToBlackOpacity(16.1833333333333, timeline)).toBeCloseTo(1)
    expect(getExportFadeToBlackOpacity(100, timeline)).toBe(1)
  })

  it('uses the longest note end for audio, including overlapping notes', () => {
    expect(getExportAudioDurationSeconds([])).toBe(0)
    expect(getExportAudioDurationSeconds([
      { ...notes[0], duration: 12 },
      notes[1],
    ])).toBe(12.5)
  })
})

describe('export cameras', () => {
  it('holds the current camera regardless of time', () => {
    expect(getExportCameraView(35, 'current', 'zenith')).toBe('zenith')
  })

  it('cycles every ten seconds and wraps after all six cameras', () => {
    expect([-1, 0, 10, 20, 30, 40, 50, 60].map(time => getExportCameraView(time, 'cycle', 'side')))
      .toEqual(['default', 'default', 'front', 'side', 'vortex', 'orbit', 'zenith', 'default'])
  })

  it('blends the last five seconds and changes the active view at the midpoint', () => {
    expect(getExportCameraTransitionState(4.9, 'cycle', 'side').isTransitioning).toBe(false)
    expect(getExportCameraTransitionState(5, 'cycle', 'side')).toMatchObject({
      isTransitioning: true,
      progress: 0,
      activeView: 'default',
      fromView: 'default',
      toView: 'front',
      fromSampleTime: 5,
      toSampleTime: 10,
    })
    expect(getExportCameraTransitionState(7.5, 'cycle', 'side')).toMatchObject({ progress: 0.5, activeView: 'front' })
    expect(getExportCameraTransitionState(10, 'cycle', 'side')).toMatchObject({ isTransitioning: false, activeView: 'front' })
  })
})
