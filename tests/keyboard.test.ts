// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isGlobalShortcutTarget } from '../lib/keyboard'

function input(type: string) {
  const element = document.createElement('input')
  element.type = type
  return element
}

describe('isGlobalShortcutTarget', () => {
  it('lets a focused range input keep the arrow keys', () => {
    expect(isGlobalShortcutTarget(input('range'), 'ArrowLeft')).toBe(false)
    expect(isGlobalShortcutTarget(input('range'), 'ArrowRight')).toBe(false)
  })

  it('lets other form controls keep the arrow keys', () => {
    expect(isGlobalShortcutTarget(input('checkbox'), 'ArrowDown')).toBe(false)
    expect(isGlobalShortcutTarget(document.createElement('select'), 'ArrowUp')).toBe(false)
  })

  it('still routes letter shortcuts from a range input', () => {
    expect(isGlobalShortcutTarget(input('range'), 'f')).toBe(true)
  })

  it('ignores every key inside text entry fields', () => {
    expect(isGlobalShortcutTarget(input('text'), 'f')).toBe(false)
    expect(isGlobalShortcutTarget(document.createElement('textarea'), 'ArrowLeft')).toBe(false)
  })

  it('routes shortcuts from the page body', () => {
    expect(isGlobalShortcutTarget(document.body, 'ArrowLeft')).toBe(true)
    expect(isGlobalShortcutTarget(null, ' ')).toBe(true)
  })
})
