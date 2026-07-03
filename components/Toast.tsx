'use client'

import { AnimatePresence, m } from 'motion/react'

export interface ToastData {
  id: number
  message: string
}

export function Toast({ toast }: { toast: ToastData | null }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-6"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 9.5rem)' }}
    >
      <AnimatePresence>
        {toast && (
          <m.div
            key={toast.id}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="nm-card max-w-sm rounded-2xl px-5 py-3 text-center text-sm leading-snug text-[var(--nm-text)]"
          >
            {toast.message}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
