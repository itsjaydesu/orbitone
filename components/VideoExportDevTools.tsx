'use client'

import type { VisualizerSettings } from '@/components/Visualizer'
import type { AppLanguage, CameraPresetMap, CameraView } from '@/lib/camera-presets'
import type { ExportCameraMode, ExportFormat, ExportSourceData } from '@/lib/export'
import { ChevronRight } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { ExportOverlay } from '@/components/ExportOverlay'
import { Visualizer } from '@/components/Visualizer'
import { useVideoExport } from '@/hooks/useVideoExport'
import { cn } from '@/lib/utils'

interface VideoExportCopy {
  exportButton: string
  exportCameraCurrent: string
  exportCameraCycle: string
  exportCameraMode: string
  exportFormat: string
  videoExport: string
}

interface OrbitoneAutomationState {
  canExport: boolean
  currentTrackTitle: string | null
  displayTrackSubtitle: string | null
  displayTrackTitle: string | null
  exportCameraMode: ExportCameraMode
  exportFormat: ExportFormat
  exportPhase: string
  exportProgress: number
  isAudioLoading: boolean
  showBottomTrackMeta: boolean
}

declare global {
  interface Window {
    __orbitoneAutomation?: {
      captureExportFrame: (options?: {
        cameraMode?: ExportCameraMode
        cameraView?: CameraView
        frameIndex?: number
      }) => Promise<string>
      getState: () => OrbitoneAutomationState
      setSettings: (options: {
        showBottomTrackMeta?: boolean
      }) => void
      setExportOptions: (options: {
        cameraMode?: ExportCameraMode
        format?: ExportFormat
      }) => void
      startExport: () => void
    }
  }
}

interface VideoExportDevToolsProps {
  cameraPresets: CameraPresetMap
  copy: VideoExportCopy
  currentCameraView: CameraView
  currentTrackTitle: string | null
  displayTrackSubtitle: string | null
  displayTrackTitle: string | null
  exportCameraMode: ExportCameraMode
  exportFormat: ExportFormat
  exportSource: ExportSourceData
  exportSourceFileName: string | null
  exportTrackMeta: {
    enabled: boolean
    subtitle: string | null
    title: string | null
  }
  isAudioLoading: boolean
  isPlaying: boolean
  language: AppLanguage
  onBeforeStartExport?: () => void
  onExportCameraModeChange: (mode: ExportCameraMode) => void
  onExportFormatChange: (format: ExportFormat) => void
  onShowBottomTrackMetaChange: (showBottomTrackMeta: boolean) => void
  showBottomTrackMeta: boolean
  togglePlay: () => Promise<void>
  volumePercent: number
}

export function VideoExportDevTools({
  cameraPresets,
  copy,
  currentCameraView,
  currentTrackTitle,
  displayTrackSubtitle,
  displayTrackTitle,
  exportCameraMode,
  exportFormat,
  exportSource,
  exportSourceFileName,
  exportTrackMeta,
  isAudioLoading,
  isPlaying,
  language,
  onBeforeStartExport,
  onExportCameraModeChange,
  onExportFormatChange,
  onShowBottomTrackMetaChange,
  showBottomTrackMeta,
  togglePlay,
  volumePercent,
}: VideoExportDevToolsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const {
    phase,
    progress,
    renderState,
    startExport,
    cancelExport,
    capturePreviewFrame,
    setExportCanvas,
    setExportFrameController,
  } = useVideoExport({
    exportSource,
    exportSourceFileName,
    exportTrackMeta,
    isPlaying,
    togglePlay,
    volumePercent,
  })
  const isExporting = phase !== 'idle'

  const handleStartExport = useCallback(() => {
    onBeforeStartExport?.()
    startExport(exportFormat, exportCameraMode, currentCameraView)
  }, [
    currentCameraView,
    exportCameraMode,
    exportFormat,
    onBeforeStartExport,
    startExport,
  ])

  useEffect(() => {
    window.__orbitoneAutomation = {
      getState: () => ({
        canExport: exportSource.notes.length > 0 && !isExporting,
        currentTrackTitle,
        displayTrackSubtitle,
        displayTrackTitle,
        exportCameraMode,
        exportFormat,
        exportPhase: phase,
        exportProgress: progress,
        isAudioLoading,
        showBottomTrackMeta,
      }),
      setExportOptions: ({ cameraMode, format }) => {
        if (format) {
          onExportFormatChange(format)
        }

        if (cameraMode) {
          onExportCameraModeChange(cameraMode)
        }
      },
      setSettings: ({ showBottomTrackMeta: nextShowBottomTrackMeta }) => {
        if (nextShowBottomTrackMeta !== undefined) {
          onShowBottomTrackMetaChange(nextShowBottomTrackMeta)
        }
      },
      captureExportFrame: async (options) => {
        const blob = await capturePreviewFrame(
          options?.cameraMode ?? exportCameraMode,
          options?.cameraView ?? currentCameraView,
          options?.frameIndex ?? 0,
        )

        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => {
            reject(new Error('Failed to encode export frame preview.'))
          }
          reader.onloadend = () => {
            if (typeof reader.result !== 'string') {
              reject(new Error('Export frame preview was not encoded as a data URL.'))
              return
            }

            resolve(reader.result)
          }
          reader.readAsDataURL(blob)
        })
      },
      startExport: () => {
        handleStartExport()
      },
    }

    return () => {
      delete window.__orbitoneAutomation
    }
  }, [
    capturePreviewFrame,
    currentCameraView,
    currentTrackTitle,
    displayTrackSubtitle,
    displayTrackTitle,
    exportCameraMode,
    exportFormat,
    exportSource.notes.length,
    handleStartExport,
    isAudioLoading,
    isExporting,
    onExportCameraModeChange,
    onExportFormatChange,
    onShowBottomTrackMetaChange,
    phase,
    progress,
    showBottomTrackMeta,
  ])

  const exportVisualizerSettings = useMemo<VisualizerSettings>(() => ({
    showMidiRoll: true,
    cameraView: renderState?.cameraView ?? currentCameraView,
  }), [currentCameraView, renderState?.cameraView])

  return (
    <>
      <div className="mt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={(e) => {
            setIsExpanded(current => !current)
            e.currentTarget.blur()
          }}
          className="nm-raised flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--nm-text)]"
          aria-expanded={isExpanded}
        >
          <span>{copy.videoExport}</span>
          <ChevronRight
            className={cn(
              'h-[1.2rem] w-[1.2rem] transition-transform duration-200 sm:h-4 sm:w-4',
              isExpanded && 'rotate-90',
            )}
          />
        </button>

        {isExpanded && (
          <div className="nm-well flex flex-col gap-2 rounded-xl p-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[var(--nm-text-faint)]">
                {copy.exportFormat}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['webm', 'mp4'] as const).map(format => (
                  <button
                    key={format}
                    onClick={(e) => {
                      onExportFormatChange(format)
                      e.currentTarget.blur()
                    }}
                    className={cn(
                      'rounded-xl px-2 py-1.5 text-xs font-medium uppercase',
                      exportFormat === format
                        ? 'nm-toggle-active'
                        : 'nm-raised text-[var(--nm-text-dim)]',
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[var(--nm-text-faint)]">
                {copy.exportCameraMode}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={(e) => {
                    onExportCameraModeChange('current')
                    e.currentTarget.blur()
                  }}
                  className={cn(
                    'rounded-xl px-2 py-1.5 text-xs font-medium',
                    exportCameraMode === 'current'
                      ? 'nm-toggle-active'
                      : 'nm-raised text-[var(--nm-text-dim)]',
                  )}
                >
                  {copy.exportCameraCurrent}
                </button>
                <button
                  onClick={(e) => {
                    onExportCameraModeChange('cycle')
                    e.currentTarget.blur()
                  }}
                  className={cn(
                    'rounded-xl px-2 py-1.5 text-xs font-medium',
                    exportCameraMode === 'cycle'
                      ? 'nm-toggle-active'
                      : 'nm-raised text-[var(--nm-text-dim)]',
                  )}
                >
                  {copy.exportCameraCycle}
                </button>
              </div>
            </div>
            <button
              onClick={(e) => {
                handleStartExport()
                e.currentTarget.blur()
              }}
              disabled={exportSource.notes.length === 0 || isExporting}
              className="nm-accent-raised w-full rounded-xl py-2 text-sm font-medium disabled:opacity-40"
            >
              {copy.exportButton}
            </button>
          </div>
        )}
      </div>

      {renderState && (
        <div style={{ position: 'fixed', left: -9999, top: 0, width: 1080, height: 1920, pointerEvents: 'none' }}>
          <Visualizer
            exportMode
            exportCameraMode={exportCameraMode}
            onCanvasElement={setExportCanvas}
            onExportFrameController={setExportFrameController}
            cameraPresets={cameraPresets}
            isMobileView={false}
            notes={exportSource.notes}
            renderTimeline={{
              globalTime: renderState.globalTime,
              transportTime: renderState.transportTime,
            }}
            settings={exportVisualizerSettings}
          />
        </div>
      )}

      {phase !== 'idle' && (
        <ExportOverlay
          phase={phase}
          progress={progress}
          language={language}
          onCancel={cancelExport}
        />
      )}
    </>
  )
}
