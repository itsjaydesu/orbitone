// A strike ripple is a ring that expands from the playhead column where a
// note was struck. It is a pure function of the time since the strike so
// export frames stay deterministic and no per-instance state is needed.
export const STRIKE_RIPPLE_DURATION = 0.5
export const STRIKE_RIPPLE_MAX_SCALE = 2.2
export const STRIKE_RIPPLE_PEAK_BRIGHTNESS = 0.28

export interface StrikeRipple {
  x: number
  y: number
  scale: number
  brightness: number
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) * (1 - value) * (1 - value)
}

export function getStrikeRipple(
  timeDiff: number,
  velocity: number,
  radius: number,
): StrikeRipple | null {
  if (timeDiff < 0 || timeDiff > STRIKE_RIPPLE_DURATION) {
    return null
  }

  const progress = easeOutCubic(timeDiff / STRIKE_RIPPLE_DURATION)

  return {
    x: 0,
    y: radius,
    scale: 1 + progress * (STRIKE_RIPPLE_MAX_SCALE - 1),
    brightness: STRIKE_RIPPLE_PEAK_BRIGHTNESS * velocity * (1 - progress),
  }
}
