'use client'

import type { ExportPhase } from '@/hooks/useVideoExport'
import type { AppLanguage } from '@/lib/camera-presets'
import { Loader2, X } from 'lucide-react'

interface ExportOverlayProps {
  phase: ExportPhase
  progress: number
  language: AppLanguage
  onCancel: () => void
}

const PHASE_LABELS: Record<AppLanguage, Record<ExportPhase, string>> = {
  en: {
    idle: '',
    preparing: 'Preparing export\u2026',
    'rendering-audio': 'Rendering audio\u2026',
    'rendering-frames': 'Rendering frames\u2026',
    muxing: 'Muxing video\u2026',
    done: 'Export complete',
    error: 'Export failed',
  },
  ja: {
    idle: '',
    preparing: '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u6E96\u5099\u4E2D\u2026',
    'rendering-audio': '\u30AA\u30FC\u30C7\u30A3\u30AA\u3092\u30EC\u30F3\u30C0\u30EA\u30F3\u30B0\u4E2D\u2026',
    'rendering-frames': '\u30D5\u30EC\u30FC\u30E0\u3092\u30EC\u30F3\u30C0\u30EA\u30F3\u30B0\u4E2D\u2026',
    muxing: '\u52D5\u753B\u3092\u66F8\u304D\u51FA\u3057\u4E2D\u2026',
    done: '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u5B8C\u4E86',
    error: '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u5931\u6557',
  },
}

export function ExportOverlay({ phase, progress, language, onCancel }: ExportOverlayProps) {
  const label = PHASE_LABELS[language][phase]
  const isIndeterminate = phase !== 'rendering-frames'
  const progressPercent = Math.round(progress * 100)

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="nm-card flex w-80 flex-col items-center gap-5 rounded-2xl p-6 text-[var(--nm-text)]">
        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-semibold tracking-wide">{label}</span>
          {phase !== 'done' && (
            <button
              type="button"
              onClick={onCancel}
              className="nm-destructive rounded-full p-1.5"
              aria-label={language === 'ja' ? '\u30AD\u30E3\u30F3\u30BB\u30EB' : 'Cancel'}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="nm-well h-3 w-full overflow-hidden rounded-full">
          {isIndeterminate
            ? (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-white/60" />
              )
            : (
                <div
                  className="h-full rounded-full bg-white transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              )}
        </div>

        {phase === 'rendering-frames' && (
          <span className="text-xs text-[var(--nm-text-dim)]">
            {progressPercent}
            %
          </span>
        )}

        {(phase === 'preparing' || phase === 'rendering-audio' || phase === 'muxing') && (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--nm-text-dim)]" />
        )}
      </div>
    </div>
  )
}
