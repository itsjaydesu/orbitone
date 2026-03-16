'use client'

import { useEffect, useRef } from 'react'

const CURSOR_SIZE = 44
const HOTSPOT_X = 13
const HOTSPOT_Y = 36

export function NoteCursor() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const positionRef = useRef({ x: -999, y: -999 })
  const pressedRef = useRef(false)

  useEffect(() => {
    const pointerFineQuery = window.matchMedia('(pointer: fine)')
    const anyFineQuery = window.matchMedia('(any-pointer: fine)')
    const root = document.documentElement
    const cursor = cursorRef.current

    if (!cursor) {
      return
    }

    const getShouldUseCustomCursor = () =>
      pointerFineQuery.matches
      || anyFineQuery.matches
      || navigator.maxTouchPoints === 0

    let isPointerFine = getShouldUseCustomCursor()
    const syncCursor = () => {
      frameRef.current = null
      cursor.style.transform = `translate3d(${positionRef.current.x - HOTSPOT_X}px, ${positionRef.current.y - HOTSPOT_Y}px, 0) scale(${pressedRef.current ? 0.92 : 1})`
    }

    const scheduleSync = () => {
      if (frameRef.current !== null) {
        return
      }

      frameRef.current = window.requestAnimationFrame(syncCursor)
    }

    const hideCursor = () => {
      cursor.dataset.visible = 'false'
    }

    const showCursor = () => {
      cursor.dataset.visible = 'true'
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!isPointerFine || event.pointerType === 'touch') {
        return
      }

      positionRef.current = { x: event.clientX, y: event.clientY }
      scheduleSync()
      showCursor()
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!isPointerFine || event.pointerType === 'touch') {
        return
      }

      pressedRef.current = true
      positionRef.current = { x: event.clientX, y: event.clientY }
      scheduleSync()
      showCursor()
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (!isPointerFine || event.pointerType === 'touch') {
        return
      }

      pressedRef.current = false
      positionRef.current = { x: event.clientX, y: event.clientY }
      scheduleSync()
      showCursor()
    }

    const handlePointerLeave = () => {
      pressedRef.current = false
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      hideCursor()
    }

    const handleMediaChange = () => {
      isPointerFine = getShouldUseCustomCursor()
      root.classList.toggle('nm-system-cursor-hidden', isPointerFine)

      if (!isPointerFine) {
        pressedRef.current = false
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current)
          frameRef.current = null
        }
        hideCursor()
      }
    }

    root.classList.toggle('nm-system-cursor-hidden', isPointerFine)
    hideCursor()

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('pointerup', handlePointerUp, { passive: true })
    window.addEventListener('pointercancel', handlePointerLeave)
    window.addEventListener('blur', handlePointerLeave)
    document.addEventListener('mouseleave', handlePointerLeave)
    pointerFineQuery.addEventListener('change', handleMediaChange)
    anyFineQuery.addEventListener('change', handleMediaChange)

    return () => {
      root.classList.remove('nm-system-cursor-hidden')
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerLeave)
      window.removeEventListener('blur', handlePointerLeave)
      document.removeEventListener('mouseleave', handlePointerLeave)
      pointerFineQuery.removeEventListener('change', handleMediaChange)
      anyFineQuery.removeEventListener('change', handleMediaChange)
    }
  }, [])

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      className="nm-note-cursor"
      style={{
        height: `${CURSOR_SIZE}px`,
        width: `${CURSOR_SIZE}px`,
      }}
    />
  )
}
