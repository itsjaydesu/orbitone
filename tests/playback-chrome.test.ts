// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { isInPlaybackChrome, PLAYBACK_CHROME_ATTRIBUTE, shouldHoldPlaybackChrome } from '../lib/playback-chrome'

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

afterEach(() => {
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

describe('shouldHoldPlaybackChrome', () => {
  it('holds the chrome while the keyboard-focused seekbar is inside it', () => {
    const { seekbar } = mountChrome()
    seekbar.focus()
    expect(shouldHoldPlaybackChrome(document.activeElement, true)).toBe(true)
  })

  it('releases the chrome once focus leaves it', () => {
    const { seekbar, outside } = mountChrome()
    seekbar.focus()
    outside.focus()
    expect(shouldHoldPlaybackChrome(document.activeElement, true)).toBe(false)
    seekbar.blur()
    expect(shouldHoldPlaybackChrome(document.activeElement, true)).toBe(false)
  })

  it('keeps the idle hide after a pointer interaction', () => {
    const { seekbar } = mountChrome()
    seekbar.focus()
    expect(shouldHoldPlaybackChrome(document.activeElement, false)).toBe(false)
  })
})
