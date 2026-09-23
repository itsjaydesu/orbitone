import { useCallback, useEffect, useRef } from 'react'
import { isInPlaybackChrome, matchesFocusVisible } from '@/lib/playback-chrome'

interface PlaybackChromeAutoHideOptions {
  disabled: boolean
  timeoutMs: number
  onHide: () => void
  isFocusVisible?: (element: Element) => boolean
}

export function usePlaybackChromeAutoHide({
  disabled,
  timeoutMs,
  onHide,
  isFocusVisible = matchesFocusVisible,
}: PlaybackChromeAutoHideOptions) {
  const timerRef = useRef<number | undefined>(undefined)

  const clearIdleTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  const scheduleIdleHide = useCallback(() => {
    clearIdleTimer()
    if (disabled) {
      return
    }

    const check = () => {
      const active = document.activeElement
      // Hiding makes the chrome inert, which drops keyboard focus to <body> and
      // hands later arrow keys to the track-switch shortcut. The check re-arms
      // because an unmounted control moves focus to <body> without a focusout.
      if (active && isInPlaybackChrome(active) && isFocusVisible(active)) {
        timerRef.current = window.setTimeout(check, timeoutMs)
        return
      }
      timerRef.current = undefined
      onHide()
    }
    timerRef.current = window.setTimeout(check, timeoutMs)
  }, [clearIdleTimer, disabled, isFocusVisible, onHide, timeoutMs])

  useEffect(() => {
    // Only restart an armed timer: open panels and persistent chrome clear it.
    const handleFocusOut = (e: FocusEvent) => {
      if (
        timerRef.current !== undefined
        && isInPlaybackChrome(e.target)
        && !isInPlaybackChrome(e.relatedTarget)
      ) {
        scheduleIdleHide()
      }
    }

    window.addEventListener('focusout', handleFocusOut)
    return () => {
      window.removeEventListener('focusout', handleFocusOut)
    }
  }, [scheduleIdleHide])

  useEffect(() => clearIdleTimer, [clearIdleTimer])

  return { clearIdleTimer, scheduleIdleHide }
}
