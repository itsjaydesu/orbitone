import type {
  ExportCameraMode,
  ExportFormat,
  ExportFrameRenderState,
  ExportSourceData,
} from '@/lib/export'
import type { CameraView } from '@/lib/camera-presets'
import type { ExportFrameController } from '@/components/Visualizer'
import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { renderOfflineAudioWav } from '@/lib/export-audio'
import {
  createExportTimeline,
  EXPORT_FRAME_IMAGE_MIME_TYPE,
  getExportFrameRenderState,
  validateExportRequest,
} from '@/lib/export'

export type ExportPhase
  = 'idle'
    | 'preparing'
    | 'rendering-audio'
    | 'rendering-frames'
    | 'muxing'
    | 'done'
    | 'error'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function uploadFile(
  action: 'audio' | 'finalize' | 'frame' | 'init',
  formData: FormData,
) {
  return fetch(`/api/render/export?action=${action}`, {
    method: 'POST',
    body: formData,
  })
}

interface ExportTrackMeta {
  enabled: boolean
  subtitle: string | null
  title: string | null
}

const EXPORT_TRACK_META_BOTTOM_PX = 88
const EXPORT_TRACK_META_GAP_PX = 10
const EXPORT_TRACK_META_MAX_WIDTH_PX = 900
const EXPORT_TRACK_META_SIDE_PADDING_PX = 96
const EXPORT_TRACK_META_TITLE_COLOR = 'rgba(255, 255, 255, 0.87)'
const EXPORT_TRACK_META_SUBTITLE_COLOR = 'rgba(255, 255, 255, 0.25)'
const EXPORT_TRACK_META_SHADOW_COLOR = 'rgba(0, 0, 0, 0.8)'
const EXPORT_TRACK_META_STROKE_COLOR = 'rgba(0, 0, 0, 0.72)'
const EXPORT_TRACK_META_TITLE_FONT
  = '600 36px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const EXPORT_TRACK_META_SUBTITLE_FONT
  = '600 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

function trimTextToWidth(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  if (context.measureText(text).width <= maxWidth) {
    return text
  }

  const ellipsis = '...'
  let trimmed = text

  while (trimmed.length > 0) {
    trimmed = trimmed.slice(0, -1)
    const candidate = `${trimmed}${ellipsis}`
    if (context.measureText(candidate).width <= maxWidth) {
      return candidate
    }
  }

  return ellipsis
}

function drawExportTrackMeta(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  trackMeta: ExportTrackMeta,
) {
  if (!trackMeta.enabled || (!trackMeta.title && !trackMeta.subtitle)) {
    return
  }

  const lines: Array<{
    color: string
    font: string
    lineHeight: number
    text: string
  }> = []

  if (trackMeta.title) {
    lines.push({
      color: EXPORT_TRACK_META_TITLE_COLOR,
      font: EXPORT_TRACK_META_TITLE_FONT,
      lineHeight: 42,
      text: trackMeta.title,
    })
  }

  if (trackMeta.subtitle) {
    lines.push({
      color: EXPORT_TRACK_META_SUBTITLE_COLOR,
      font: EXPORT_TRACK_META_SUBTITLE_FONT,
      lineHeight: 26,
      text: trackMeta.subtitle.toUpperCase(),
    })
  }

  if (lines.length === 0) {
    return
  }

  const maxWidth = Math.min(
    EXPORT_TRACK_META_MAX_WIDTH_PX,
    width - EXPORT_TRACK_META_SIDE_PADDING_PX,
  )
  const contentHeight
    = lines.reduce((total, line) => total + line.lineHeight, 0)
      + EXPORT_TRACK_META_GAP_PX * Math.max(lines.length - 1, 0)
  let currentY = height - EXPORT_TRACK_META_BOTTOM_PX - contentHeight

  context.save()
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.shadowBlur = 28
  context.shadowColor = EXPORT_TRACK_META_SHADOW_COLOR
  context.shadowOffsetY = 8

  lines.forEach((line, index) => {
    context.font = line.font
    context.fillStyle = line.color
    const text = trimTextToWidth(context, line.text, maxWidth)
    context.lineJoin = 'round'
    context.lineWidth = index === 0 ? 6 : 4
    context.strokeStyle = EXPORT_TRACK_META_STROKE_COLOR
    context.strokeText(text, width / 2, currentY, maxWidth)
    context.fillText(text, width / 2, currentY, maxWidth)
    currentY += line.lineHeight + EXPORT_TRACK_META_GAP_PX
  })

  context.restore()
}

interface UseVideoExportOptions {
  exportSource: ExportSourceData
  exportTrackMeta: ExportTrackMeta
  isPlaying: boolean
  togglePlay: () => Promise<void>
  volumePercent: number
}

export function useVideoExport({
  exportSource,
  exportTrackMeta,
  isPlaying,
  togglePlay,
  volumePercent,
}: UseVideoExportOptions) {
  const [phase, setPhase] = useState<ExportPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [renderState, setRenderState] = useState<ExportFrameRenderState | null>(null)

  const cancelledRef = useRef(false)
  const activeSessionIdRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const exportFrameControllerRef = useRef<ExportFrameController | null>(null)

  const clearSession = useCallback(async () => {
    const activeSessionId = activeSessionIdRef.current
    activeSessionIdRef.current = null

    if (!activeSessionId) {
      return
    }

    try {
      await fetch(
        `/api/render/export?sessionId=${encodeURIComponent(activeSessionId)}`,
        { method: 'DELETE' },
      )
    }
    catch {
    }
  }, [exportTrackMeta])

  const resetUiState = useCallback(() => {
    setProgress(0)
    setRenderState(null)
  }, [])

  const cancelExport = useCallback(() => {
    cancelledRef.current = true
    void clearSession()
    resetUiState()
    setPhase('idle')
  }, [clearSession, resetUiState])

  const setExportCanvas = useCallback((element: HTMLCanvasElement) => {
    canvasRef.current = element
  }, [])

  const setExportFrameController = useCallback((
    controller: ExportFrameController | null,
  ) => {
    exportFrameControllerRef.current = controller
    canvasRef.current = controller?.canvas ?? null
  }, [])

  const waitForExportRenderer = useCallback(async () => {
    await new Promise<void>((resolve) => {
      const poll = () => {
        if (exportFrameControllerRef.current || cancelledRef.current) {
          resolve()
          return
        }

        window.setTimeout(poll, 0)
      }

      poll()
    })
  }, [])

  const renderFrameNow = useCallback((timestampMs: number) => {
    const controller = exportFrameControllerRef.current

    if (!controller) {
      throw new Error('Export frame controller is unavailable.')
    }

    controller.renderFrame(timestampMs)
  }, [])

  const captureFrame = useCallback(async () => {
    const canvas = canvasRef.current

    if (!canvas) {
      throw new Error('Export canvas is unavailable.')
    }

    const shouldDrawTrackMeta
      = exportTrackMeta.enabled
        && Boolean(exportTrackMeta.title || exportTrackMeta.subtitle)
    let captureTarget: HTMLCanvasElement = canvas

    if (shouldDrawTrackMeta) {
      const compositeCanvas
        = compositeCanvasRef.current ?? document.createElement('canvas')
      compositeCanvasRef.current = compositeCanvas
      compositeCanvas.width = canvas.width
      compositeCanvas.height = canvas.height

      const context = compositeCanvas.getContext('2d')
      if (!context) {
        throw new Error('Failed to create an export compositing context.')
      }

      context.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height)
      context.drawImage(canvas, 0, 0)
      drawExportTrackMeta(
        context,
        compositeCanvas.width,
        compositeCanvas.height,
        exportTrackMeta,
      )
      captureTarget = compositeCanvas
    }

    const frameBlob = await new Promise<Blob>((resolve, reject) => {
      captureTarget.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to capture export frame.'))
          return
        }

        resolve(blob)
      }, EXPORT_FRAME_IMAGE_MIME_TYPE)
    })

    return frameBlob
  }, [exportTrackMeta])

  const capturePreviewFrame = useCallback(async (
    cameraMode: ExportCameraMode,
    currentCameraView: CameraView,
    frameIndex: number = 0,
  ) => {
    const validationError = validateExportRequest(exportSource, 'mp4')
    if (validationError) {
      throw new Error(validationError)
    }

    const timeline = createExportTimeline(exportSource.notes)
    const nextRenderState = getExportFrameRenderState(
      timeline,
      frameIndex,
      cameraMode,
      currentCameraView,
    )

    flushSync(() => {
      setRenderState(nextRenderState)
    })

    await waitForExportRenderer()
    renderFrameNow(nextRenderState.globalTime * 1000)

    const frameBlob = await captureFrame()
    setRenderState(null)

    return frameBlob
  }, [
    captureFrame,
    exportSource,
    renderFrameNow,
    waitForExportRenderer,
  ])

  const startExport = useCallback(async (
    format: ExportFormat,
    cameraMode: ExportCameraMode,
    currentCameraView: CameraView,
  ) => {
    cancelledRef.current = false
    setProgress(0)
    setPhase('preparing')

    if (isPlaying) {
      await togglePlay()
    }

    const validationError = validateExportRequest(exportSource, format)
    if (validationError) {
      setPhase('error')
      setTimeout(() => {
        setPhase(current => current === 'error' ? 'idle' : current)
        resetUiState()
      }, 5000)
      return
    }

    const timeline = createExportTimeline(exportSource.notes)
    const initialRenderState = getExportFrameRenderState(
      timeline,
      0,
      cameraMode,
      currentCameraView,
    )
    setRenderState(initialRenderState)

    try {
      await waitForExportRenderer()
      if (cancelledRef.current) {
        return
      }

      renderFrameNow(initialRenderState.globalTime * 1000)
      if (cancelledRef.current) {
        return
      }

      setPhase('rendering-audio')
      const audioBlob = await renderOfflineAudioWav(
        exportSource,
        timeline,
        volumePercent,
      )
      if (cancelledRef.current) {
        return
      }

      const initData = new FormData()
      initData.append('format', format)
      initData.append('fps', String(timeline.fps))
      initData.append('frameCount', String(timeline.frameCount))
      initData.append('height', String(timeline.height))
      initData.append('totalDurationSeconds', String(timeline.totalDurationSeconds))
      initData.append('width', String(timeline.width))

      const initResponse = await uploadFile('init', initData)
      if (!initResponse.ok) {
        throw new Error('Failed to initialize export session.')
      }

      const sessionId = (await initResponse.text()).trim()
      if (!sessionId) {
        throw new Error('Export session did not return an id.')
      }

      activeSessionIdRef.current = sessionId

      const audioUpload = new FormData()
      audioUpload.append('sessionId', sessionId)
      audioUpload.append('audio', audioBlob, 'audio.wav')

      const audioResponse = await uploadFile('audio', audioUpload)
      if (!audioResponse.ok) {
        throw new Error('Failed to upload rendered audio.')
      }

      setPhase('rendering-frames')

      for (let frameIndex = 0; frameIndex < timeline.frameCount; frameIndex += 1) {
        if (cancelledRef.current) {
          return
        }

        const nextRenderState = getExportFrameRenderState(
          timeline,
          frameIndex,
          cameraMode,
          currentCameraView,
        )
        flushSync(() => {
          setRenderState(nextRenderState)
        })
        renderFrameNow(nextRenderState.globalTime * 1000)

        const frameBlob = await captureFrame()
        const frameUpload = new FormData()
        frameUpload.append('sessionId', sessionId)
        frameUpload.append('frameIndex', String(frameIndex))
        frameUpload.append('frame', frameBlob, `frame-${frameIndex.toString().padStart(6, '0')}.png`)

        const frameResponse = await uploadFile('frame', frameUpload)
        if (!frameResponse.ok) {
          throw new Error(`Failed to upload frame ${frameIndex}.`)
        }

        setProgress(nextRenderState.progress)
      }

      if (cancelledRef.current) {
        return
      }

      setPhase('muxing')

      const finalizeData = new FormData()
      finalizeData.append('sessionId', sessionId)

      const finalizeResponse = await uploadFile('finalize', finalizeData)
      if (!finalizeResponse.ok) {
        throw new Error('Failed to finalize video export.')
      }

      const videoBlob = await finalizeResponse.blob()
      activeSessionIdRef.current = null
      downloadBlob(videoBlob, `orbitone-export-${Date.now()}.${format}`)
      setPhase('done')
      setProgress(1)

      setTimeout(() => {
        setPhase(current => current === 'done' ? 'idle' : current)
        resetUiState()
      }, 3000)
    }
    catch (error) {
      await clearSession()

      if (!cancelledRef.current) {
        console.error('Export failed:', error)
        setPhase('error')
        setTimeout(() => {
          setPhase(current => current === 'error' ? 'idle' : current)
          resetUiState()
        }, 5000)
      }
    }
  }, [
    captureFrame,
    clearSession,
    exportSource,
    exportTrackMeta,
    isPlaying,
    resetUiState,
    renderFrameNow,
    togglePlay,
    volumePercent,
    waitForExportRenderer,
  ])

  return {
    capturePreviewFrame,
    phase,
    progress,
    renderState,
    startExport,
    cancelExport,
    setExportCanvas,
    setExportFrameController,
  }
}
