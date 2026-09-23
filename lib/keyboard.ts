const TEXT_ENTRY_INPUT_TYPES = new Set(['text', 'number', 'password', 'email'])
const ARROW_KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown'])

// Global shortcuts must not steal keys that a focused form control consumes:
// text fields own every key, and sliders, checkboxes and selects own the arrows.
export function isGlobalShortcutTarget(target: EventTarget | null, key: string) {
  if (target instanceof HTMLInputElement && TEXT_ENTRY_INPUT_TYPES.has(target.type)) {
    return false
  }

  if (target instanceof HTMLTextAreaElement) {
    return false
  }

  const isFormControl
    = target instanceof HTMLInputElement || target instanceof HTMLSelectElement
  if (isFormControl && ARROW_KEYS.has(key.toLowerCase())) {
    return false
  }

  return true
}
