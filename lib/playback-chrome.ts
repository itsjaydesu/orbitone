export const PLAYBACK_CHROME_ATTRIBUTE = 'data-playback-chrome'

export function isInPlaybackChrome(target: EventTarget | null) {
  return target instanceof Element && target.closest(`[${PLAYBACK_CHROME_ATTRIBUTE}]`) !== null
}

// Hiding makes the chrome inert, which drops keyboard focus to <body> and
// hands later arrow keys to the track-switch shortcut. Mouse users keep the
// idle hide even if a clicked control still holds focus.
export function shouldHoldPlaybackChrome(activeElement: Element | null, lastInputWasKeyboard: boolean) {
  return lastInputWasKeyboard && isInPlaybackChrome(activeElement)
}
