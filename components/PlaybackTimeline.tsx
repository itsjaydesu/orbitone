'use client'

import type { PlaybackClock } from '@/hooks/useMusic'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

function formatTime(secs: number) {
  if (!Number.isFinite(secs) || secs < 0) {
    return '0:00'
  }

  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const getServerTime = () => 0

export function PlaybackTimeline({
  clock,
  duration,
  onSeek,
}: {
  clock: PlaybackClock
  duration: number
  onSeek: (time: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const safeDuration = duration || 100

  // The text only changes once per second, so subscribing to the floored time
  // keeps per-frame clock ticks from re-rendering even this subtree.
  const getWholeSecond = useCallback(() => Math.floor(clock.getTime()), [clock])
  const wholeSecond = useSyncExternalStore(
    clock.subscribe,
    getWholeSecond,
    getServerTime,
  )

  // Smooth per-frame progress goes straight to the DOM: the range value and a
  // CSS variable that paints the played portion of the track.
  useEffect(() => {
    const apply = () => {
      const input = inputRef.current
      if (!input) {
        return
      }

      const time = clock.getTime()
      input.value = String(time)
      input.style.setProperty(
        '--nm-progress',
        `${Math.min(Math.max(time / safeDuration, 0), 1) * 100}%`,
      )
    }

    apply()
    return clock.subscribe(apply)
  }, [clock, safeDuration])

  return (
    <>
      <input
        ref={inputRef}
        type="range"
        min={0}
        max={safeDuration}
        step="any"
        defaultValue={0}
        aria-label="Playback position"
        aria-valuetext={formatTime(wholeSecond)}
        onChange={event => onSeek(Number.parseFloat(event.target.value))}
        className="nm-seekbar"
      />
      <div className="flex justify-between font-mono text-xs text-[var(--nm-text-dim)]">
        <span>{formatTime(wholeSecond)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </>
  )
}
