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
    recording: 'Recording\u2026',
    finalizing: 'Finalizing\u2026',
    transcoding: 'Converting to MP4\u2026',
    done: 'Export complete',
    error: 'Export failed',
  },
  ja: {
    idle: '',
    preparing: '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u6E96\u5099\u4E2D\u2026',
    recording: '\u9332\u753B\u4E2D\u2026',
    finalizing: '\u5B8C\u4E86\u51E6\u7406\u4E2D\u2026',
    transcoding: 'MP4\u306B\u5909\u63DB\u4E2D\u2026',
    done: '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u5B8C\u4E86',
    error: '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u5931\u6557',
  },
}

export function ExportOverlay({ phase, progress, language, onCancel }: ExportOverlayProps) {
  const label = PHASE_LABELS[language][phase]
  const isIndeterminate = phase !== 'recording'
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

        {phase === 'recording' && (
          <span className="text-xs text-[var(--nm-text-dim)]">
            {progressPercent}
            %
          </span>
        )}

        {(phase === 'preparing' || phase === 'finalizing' || phase === 'transcoding') && (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--nm-text-dim)]" />
        )}
      </div>
    </div>
  )
}
