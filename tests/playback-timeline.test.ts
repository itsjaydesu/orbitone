// @vitest-environment jsdom
import type { PlaybackClock } from '../hooks/useMusic'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlaybackTimeline } from '../components/PlaybackTimeline'

afterEach(cleanup)

function createClock(initialTime = 0) {
  let time = initialTime
  const listeners = new Set<() => void>()
  const listenerCount = () => listeners.size
  const clock: PlaybackClock = {
    getTime: () => time,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const tick = (nextTime: number) => {
    time = nextTime
    for (const listener of listeners) {
      listener()
    }
  }
  return { clock, tick, listenerCount }
}

function renderTimeline(clock: PlaybackClock, duration = 200) {
  const onSeek = vi.fn()
  const onRender = vi.fn()
  const tree = (nextDuration: number) => createElement(
    Profiler,
    { id: 'timeline', onRender },
    createElement(PlaybackTimeline, { clock, duration: nextDuration, onSeek }),
  )
  const view = render(tree(duration))
  const input = view.container.querySelector<HTMLInputElement>('input.nm-seekbar')
  if (!input) {
    throw new Error('seekbar input not rendered')
  }
  const timeText = () => view.container.querySelectorAll('span')[0]?.textContent
  return {
    input,
    onSeek,
    timeText,
    commits: () => onRender.mock.calls.length,
    setDuration: (nextDuration: number) => view.rerender(tree(nextDuration)),
    unmount: view.unmount,
  }
}

describe('playbackTimeline', () => {
  it('writes the played fraction to the --nm-progress custom property per tick', () => {
    const { clock, tick } = createClock()
    const { input } = renderTimeline(clock, 200)

    expect(input.style.getPropertyValue('--nm-progress')).toBe('0%')

    act(() => tick(50))
    expect(input.style.getPropertyValue('--nm-progress')).toBe('25%')
    expect(input.value).toBe('50')

    act(() => tick(400))
    expect(input.style.getPropertyValue('--nm-progress')).toBe('100%')
  })

  it('only re-renders the time text when the whole second changes', () => {
    const { clock, tick } = createClock()
    const { timeText, commits } = renderTimeline(clock)

    act(() => tick(1.2))
    expect(timeText()).toBe('0:01')

    // Sub-second ticks must not commit a React render at all.
    const commitsAfterSecond = commits()
    act(() => tick(1.5))
    act(() => tick(1.9))
    expect(timeText()).toBe('0:01')
    expect(commits()).toBe(commitsAfterSecond)

    act(() => tick(62))
    expect(timeText()).toBe('1:02')
    expect(commits()).toBe(commitsAfterSecond + 1)
  })

  it('rewrites value and fill when duration changes while paused', () => {
    const { clock, tick } = createClock()
    const { input, setDuration } = renderTimeline(clock, 200)

    act(() => tick(50))
    expect(input.style.getPropertyValue('--nm-progress')).toBe('25%')

    // No clock tick follows a track change; the effect must re-apply on its own.
    setDuration(100)
    expect(input.max).toBe('100')
    expect(input.value).toBe('50')
    expect(input.style.getPropertyValue('--nm-progress')).toBe('50%')
  })

  it('updates the fill from a seek publish without an animation frame', () => {
    const { clock, tick } = createClock()
    const { input } = renderTimeline(clock, 200)

    // A paused seek publishes once through the clock listeners, with no rAF loop.
    tick(150)
    expect(input.value).toBe('150')
    expect(input.style.getPropertyValue('--nm-progress')).toBe('75%')
  })

  it('exposes the displayed time to assistive tech', () => {
    const { clock, tick } = createClock()
    const { input } = renderTimeline(clock)

    expect(input.getAttribute('aria-valuetext')).toBe('0:00')
    act(() => tick(65))
    expect(input.getAttribute('aria-valuetext')).toBe('1:05')
  })

  it('unsubscribes from the clock on unmount', () => {
    const { clock, listenerCount } = createClock()
    const { unmount } = renderTimeline(clock)

    expect(listenerCount()).toBeGreaterThan(0)
    unmount()
    expect(listenerCount()).toBe(0)
  })

  it('seeks from the range input and keeps a fractional step', () => {
    const { clock } = createClock()
    const { input, onSeek } = renderTimeline(clock)

    expect(input.step).toBe('any')

    fireEvent.change(input, { target: { value: '12.5' } })
    expect(onSeek).toHaveBeenCalledWith(12.5)
  })
})
