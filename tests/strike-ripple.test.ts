import { describe, expect, it } from 'vitest'
import {
  getStrikeRipple,
  STRIKE_RIPPLE_DURATION,
  STRIKE_RIPPLE_MAX_SCALE,
  STRIKE_RIPPLE_PEAK_BRIGHTNESS,
} from '../lib/strike-ripple'

describe('getStrikeRipple', () => {
  it('returns nothing outside the strike window', () => {
    expect(getStrikeRipple(-0.01, 1, 10)).toBeNull()
    expect(getStrikeRipple(STRIKE_RIPPLE_DURATION + 0.01, 1, 10)).toBeNull()
  })

  it('stays anchored at the playhead column for the whole lifetime', () => {
    for (const timeDiff of [0, 0.1, 0.3, STRIKE_RIPPLE_DURATION]) {
      const ripple = getStrikeRipple(timeDiff, 0.8, 12.5)
      expect(ripple).toMatchObject({ x: 0, y: 12.5 })
    }
  })

  it('expands and fades monotonically from the strike', () => {
    const steps = 20
    let previous = getStrikeRipple(0, 1, 10)
    expect(previous).toMatchObject({ scale: 1, brightness: STRIKE_RIPPLE_PEAK_BRIGHTNESS })

    for (let step = 1; step <= steps; step += 1) {
      const ripple = getStrikeRipple((step / steps) * STRIKE_RIPPLE_DURATION, 1, 10)
      if (!ripple || !previous) {
        throw new Error('ripple missing inside the window')
      }
      expect(ripple.scale).toBeGreaterThan(previous.scale)
      expect(ripple.brightness).toBeLessThan(previous.brightness)
      previous = ripple
    }

    expect(previous).toMatchObject({ scale: STRIKE_RIPPLE_MAX_SCALE, brightness: 0 })
  })

  it('scales brightness with velocity', () => {
    const soft = getStrikeRipple(0, 0.25, 10)
    const loud = getStrikeRipple(0, 1, 10)
    expect(soft?.brightness).toBeCloseTo(STRIKE_RIPPLE_PEAK_BRIGHTNESS * 0.25)
    expect(loud?.brightness).toBeCloseTo(STRIKE_RIPPLE_PEAK_BRIGHTNESS)
  })
})
