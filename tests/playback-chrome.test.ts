// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlaybackChromeAutoHide } from '../hooks/usePlaybackChromeAutoHide'
import { isInPlaybackChrome, matchesFocusVisible, PLAYBACK_CHROME_ATTRIBUTE } from '../lib/playback-chrome'

const TIMEOUT_MS = 2000

function mountChrome() {
  const chrome = document.createElement('div')
  chrome.setAttribute(PLAYBACK_CHROME_ATTRIBUTE, '')
  const seekbar = document.createElement('input')
  seekbar.type = 'range'
  chrome.append(seekbar)
  const outside = document.createElement('button')
  document.body.append(chrome, outside)
  return { chrome, seekbar, outside }
}

// jsdom matches :focus-visible for every focused element, so tests model the
// browser heuristic with an explicit keyboard/pointer modality.
function modality() {
  const state = { keyboard: false }
  return {
    state,
    isFocusVisible: (element: Element) => state.keyboard && element === document.activeElement,
  }
}

function renderAutoHide(isFocusVisible?: (element: Element) => boolean) {
  const onHide = vi.fn<() => void>()
  const hook = renderHook(() => usePlaybackChromeAutoHide({
    disabled: false,
    timeoutMs: TIMEOUT_MS,
    onHide,
    isFocusVisible,
  }))
  return { hook, onHide }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('isInPlaybackChrome', () => {
  it('matches the chrome region and its descendants only', () => {
    const { chrome, seekbar, outside } = mountChrome()
    expect(isInPlaybackChrome(chrome)).toBe(true)
    expect(isInPlaybackChrome(seekbar)).toBe(true)
    expect(isInPlaybackChrome(outside)).toBe(false)
    expect(isInPlaybackChrome(document.body)).toBe(false)
    expect(isInPlaybackChrome(null)).toBe(false)
  })
})

describe('matchesFocusVisible', () => {
  it('returns false when the engine rejects the selector', () => {
    const { seekbar } = mountChrome()
    vi.spyOn(seekbar, 'matches').mockImplementation(() => {
      throw new SyntaxError('unsupported selector')
    })
    expect(matchesFocusVisible(seekbar)).toBe(false)
  })
})

describe('usePlaybackChromeAutoHide', () => {
  it('holds the chrome past the timeout while keyboard focus is inside it', () => {
    const { seekbar } = mountChrome()
    const { state, isFocusVisible } = modality()
    const { hook, onHide } = renderAutoHide(isFocusVisible)

    state.keyboard = true
    seekbar.focus()
    act(() => hook.result.current.scheduleIdleHide())
    act(() => vi.advanceTimersByTime(TIMEOUT_MS * 5))

    expect(onHide).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('hides after the timeout when a pointer focused the control', () => {
    const { seekbar } = mountChrome()
    const { isFocusVisible } = modality()
    const { hook, onHide } = renderAutoHide(isFocusVisible)

    seekbar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    seekbar.focus()
    act(() => hook.result.current.scheduleIdleHide())
    act(() => vi.advanceTimersByTime(TIMEOUT_MS))

    expect(onHide).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('hides on the next check once the focused chrome control is removed', () => {
    const { seekbar } = mountChrome()
    const { state, isFocusVisible } = modality()
    const { hook, onHide } = renderAutoHide(isFocusVisible)

    state.keyboard = true
    seekbar.focus()
    act(() => hook.result.current.scheduleIdleHide())
    act(() => vi.advanceTimersByTime(TIMEOUT_MS))
    expect(onHide).not.toHaveBeenCalled()

    seekbar.remove()
    expect(document.activeElement).toBe(document.body)
    act(() => vi.advanceTimersByTime(TIMEOUT_MS))

    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('does not hold when a modifier key follows a pointer click', () => {
    const { seekbar } = mountChrome()
    const { isFocusVisible } = modality()
    const { hook, onHide } = renderAutoHide(isFocusVisible)

    seekbar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    seekbar.focus()
    act(() => hook.result.current.scheduleIdleHide())
    for (const key of ['Meta', 'Alt', 'Control', 'Shift']) {
      seekbar.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }
    act(() => vi.advanceTimersByTime(TIMEOUT_MS))

    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('resumes the full idle hide once focus moves out of the chrome', () => {
    const { seekbar, outside } = mountChrome()
    const { state, isFocusVisible } = modality()
    const { hook, onHide } = renderAutoHide(isFocusVisible)

    state.keyboard = true
    seekbar.focus()
    act(() => hook.result.current.scheduleIdleHide())
    act(() => vi.advanceTimersByTime(TIMEOUT_MS * 1.5))
    act(() => outside.focus())
    act(() => vi.advanceTimersByTime(TIMEOUT_MS - 1))
    expect(onHide).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('leaves no timers or listeners after unmount', () => {
    const { seekbar, outside } = mountChrome()
    const { state, isFocusVisible } = modality()
    const { hook, onHide } = renderAutoHide(isFocusVisible)

    state.keyboard = true
    seekbar.focus()
    // jsdom arms its own timer on focus; count only the hook's timers.
    const baseline = vi.getTimerCount()
    act(() => hook.result.current.scheduleIdleHide())
    expect(vi.getTimerCount()).toBe(baseline + 1)
    hook.unmount()
    expect(vi.getTimerCount()).toBe(baseline)

    outside.focus()
    vi.advanceTimersByTime(TIMEOUT_MS * 5)
    expect(onHide).not.toHaveBeenCalled()
  })

  it('keeps no timer while disabled', () => {
    const onHide = vi.fn<() => void>()
    const { result } = renderHook(() => usePlaybackChromeAutoHide({
      disabled: true,
      timeoutMs: TIMEOUT_MS,
      onHide,
    }))

    act(() => result.current.scheduleIdleHide())
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { focusVisible: true, hides: false },
    { focusVisible: false, hides: true },
  ])('asks the browser for :focus-visible by default (%o)', ({ focusVisible, hides }) => {
    const { seekbar } = mountChrome()
    const originalMatches = Element.prototype.matches
    const matches = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':focus-visible' ? focusVisible : originalMatches.call(this, selector)
    })
    const { hook, onHide } = renderAutoHide()

    seekbar.focus()
    act(() => hook.result.current.scheduleIdleHide())
    act(() => vi.advanceTimersByTime(TIMEOUT_MS))

    expect(matches).toHaveBeenCalledWith(':focus-visible')
    expect(onHide).toHaveBeenCalledTimes(hides ? 1 : 0)
  })
})
