export const PLAYBACK_CHROME_ATTRIBUTE = 'data-playback-chrome'

export function isInPlaybackChrome(target: EventTarget | null) {
  return target instanceof Element && target.closest(`[${PLAYBACK_CHROME_ATTRIBUTE}]`) !== null
}

// The browser's :focus-visible heuristic covers keyboard, screen-reader and
// programmatic focus, and ignores modifier-only keys after a click.
export function matchesFocusVisible(element: Element) {
  try {
    return element.matches(':focus-visible')
  }
  catch {
    return false
  }
}
