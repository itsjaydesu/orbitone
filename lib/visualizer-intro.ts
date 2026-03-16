export const INTRO_RING_DRAW_DURATION = 1.07
export const INTRO_RING_STAGGER = 0.065
export const INTRO_RING_COUNT = 10
export const INTRO_CAMERA_DELAY = 0
export const INTRO_CAMERA_DURATION = 1.95
export const INTRO_PLAYHEAD_DELAY = 0.6
export const INTRO_PLAYHEAD_DURATION = 2
export const INTRO_NOTE_APPEAR_DELAY = 1
export const INTRO_NOTE_BASE_DELAY = 0.75
export const INTRO_NOTE_SWEEP_SPAN = 0.96
export const INTRO_NOTE_DURATION = 0.99

export function getVisualizerIntroSettleSeconds(): number {
  const ringEnd = INTRO_RING_DRAW_DURATION + INTRO_RING_COUNT * INTRO_RING_STAGGER
  const cameraEnd = INTRO_CAMERA_DELAY + INTRO_CAMERA_DURATION
  const playheadEnd = INTRO_PLAYHEAD_DELAY + INTRO_PLAYHEAD_DURATION
  const noteEnd = INTRO_NOTE_APPEAR_DELAY + INTRO_NOTE_BASE_DELAY + INTRO_NOTE_SWEEP_SPAN + INTRO_NOTE_DURATION

  return Math.max(ringEnd, cameraEnd, playheadEnd, noteEnd)
}
