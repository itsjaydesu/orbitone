import type {
  ExportCameraMode,
  ExportFormat,
  ExportFrameRenderState,
  ExportSourceData,
} from '@/lib/export'
import type { CameraView } from '@/lib/camera-presets'
import { useCallback, useRef, useState } from 'react'
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

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function waitForCanvasPaint() {
  await waitForAnimationFrame()
  await waitForAnimationFrame()
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

interface UseVideoExportOptions {
  exportSource: ExportSourceData
  isPlaying: boolean
  togglePlay: () => Promise<void>
  volumePercent: number
}

export function useVideoExport({
  exportSource,
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
  }, [])

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

  const waitForExportCanvas = useCallback(async () => {
    await new Promise<void>((resolve) => {
      const poll = () => {
        if (canvasRef.current || cancelledRef.current) {
          resolve()
          return
        }

        requestAnimationFrame(poll)
      }

      poll()
    })
  }, [])

  const captureFrame = useCallback(async () => {
    const canvas = canvasRef.current

    if (!canvas) {
      throw new Error('Export canvas is unavailable.')
    }

    const frameBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to capture export frame.'))
          return
        }

        resolve(blob)
      }, EXPORT_FRAME_IMAGE_MIME_TYPE)
    })

    return frameBlob
  }, [])

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
      await waitForExportCanvas()
      if (cancelledRef.current) {
        return
      }

      await waitForCanvasPaint()
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
        setRenderState(nextRenderState)
        await waitForCanvasPaint()

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
    isPlaying,
    resetUiState,
    togglePlay,
    volumePercent,
    waitForExportCanvas,
  ])

  return {
    phase,
    progress,
    renderState,
    startExport,
    cancelExport,
    setExportCanvas,
  }
}
