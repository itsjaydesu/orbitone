'use client'

import { memo, useEffect, useRef } from 'react'

function formatTime(secs: number) {
  if (!Number.isFinite(secs) || secs < 0) {
    return '0:00'
  }

  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function PlaybackTimelineComponent({
  duration,
  getPlaybackTime,
  onSeek,
}: {
  duration: number
  getPlaybackTime: () => number
  onSeek: (time: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const currentLabelRef = useRef<HTMLSpanElement>(null)
  const isScrubbingRef = useRef(false)

  useEffect(() => {
    let frameId: number
    let lastLabel = ''

    const tick = () => {
      const time = getPlaybackTime()

      if (!isScrubbingRef.current && inputRef.current) {
        inputRef.current.value = time.toFixed(2)
      }

      const label = formatTime(time)
      if (label !== lastLabel && currentLabelRef.current) {
        currentLabelRef.current.textContent = label
        lastLabel = label
      }

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [getPlaybackTime])

  const stopScrubbing = () => {
    isScrubbingRef.current = false
  }

  return (
    <>
      <input
        ref={inputRef}
        type="range"
        min={0}
        max={duration || 100}
        step={0.1}
        defaultValue={0}
        onChange={event => onSeek(Number.parseFloat(event.target.value))}
        onPointerDown={() => {
          isScrubbingRef.current = true
        }}
        onPointerUp={stopScrubbing}
        onPointerCancel={stopScrubbing}
        onBlur={stopScrubbing}
        className="nm-seekbar"
        aria-label="Seek"
      />
      <div className="flex justify-between font-mono text-xs text-[var(--nm-text-dim)]">
        <span ref={currentLabelRef}>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </>
  )
}

export const PlaybackTimeline = memo(PlaybackTimelineComponent)
