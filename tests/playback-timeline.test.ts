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
  return { clock, tick }
}

function renderTimeline(clock: PlaybackClock, duration = 200) {
  const onSeek = vi.fn()
  const onRender = vi.fn()
  const view = render(
    createElement(
      Profiler,
      { id: 'timeline', onRender },
      createElement(PlaybackTimeline, { clock, duration, onSeek }),
    ),
  )
  const input = view.container.querySelector<HTMLInputElement>('input.nm-seekbar')
  if (!input) {
    throw new Error('seekbar input not rendered')
  }
  const timeText = () => view.container.querySelectorAll('span')[0]?.textContent
  return { input, onSeek, timeText, commits: () => onRender.mock.calls.length }
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

  it('seeks from the range input and keeps a fractional step', () => {
    const { clock } = createClock()
    const { input, onSeek } = renderTimeline(clock)

    expect(input.step).toBe('any')

    fireEvent.change(input, { target: { value: '12.5' } })
    expect(onSeek).toHaveBeenCalledWith(12.5)
  })
})
