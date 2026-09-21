'use client'

import type { PlaybackClock } from '@/hooks/useMusic'
import { useSyncExternalStore } from 'react'

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
  // Subscribing here confines per-frame clock updates to this small subtree.
  const currentTime = useSyncExternalStore(
    clock.subscribe,
    clock.getTime,
    getServerTime,
  )

  return (
    <>
      <input
        type="range"
        min={0}
        max={duration || 100}
        step={0.1}
        value={currentTime}
        onChange={event => onSeek(Number.parseFloat(event.target.value))}
        className="nm-seekbar"
      />
      <div className="flex justify-between font-mono text-xs text-[var(--nm-text-dim)]">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </>
  )
}
