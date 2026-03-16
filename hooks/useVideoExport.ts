import type { CameraView } from '@/lib/camera-presets'
import { useCallback, useRef, useState } from 'react'
import { CAMERA_VIEWS } from '@/lib/camera-presets'
import { getVisualizerIntroSettleSeconds } from '@/lib/visualizer-intro'

export type ExportPhase = 'idle' | 'preparing' | 'recording' | 'finalizing' | 'transcoding' | 'done' | 'error'
export type ExportFormat = 'mp4' | 'webm'
export type ExportCameraMode = 'current' | 'cycle'

const CAMERA_CYCLE_INTERVAL_MS = 10_000

function negotiateMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return ''
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface UseVideoExportOptions {
  ensureAudioReady: () => Promise<void>
  getAudioStream: () => MediaStream | null
  togglePlay: () => Promise<void>
  seek: (time: number) => void
  duration: number
  isPlaying: boolean
}

export function useVideoExport({
  ensureAudioReady,
  getAudioStream,
  togglePlay,
  seek,
  duration,
  isPlaying,
}: UseVideoExportOptions) {
  const [phase, setPhase] = useState<ExportPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [exportCameraView, setExportCameraView] = useState<CameraView>('default')

  const cancelledRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cycleIntervalRef = useRef<number | undefined>(undefined)
  const progressRafRef = useRef<number | undefined>(undefined)
  const playStartTimeRef = useRef(0)
  const introSettleRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)

  const cleanup = useCallback(() => {
    if (cycleIntervalRef.current !== undefined) {
      window.clearInterval(cycleIntervalRef.current)
      cycleIntervalRef.current = undefined
    }
    if (progressRafRef.current !== undefined) {
      window.cancelAnimationFrame(progressRafRef.current)
      progressRafRef.current = undefined
    }
    if (audioStreamRef.current) {
      for (const track of audioStreamRef.current.getTracks()) {
        track.stop()
      }
      audioStreamRef.current = null
    }
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const cancelExport = useCallback(() => {
    cancelledRef.current = true
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    cleanup()
    setPhase('idle')
    setProgress(0)
  }, [cleanup])

  const setExportCanvas = useCallback((el: HTMLCanvasElement) => {
    canvasRef.current = el
  }, [])

  const startExport = useCallback(async (
    format: ExportFormat,
    cameraMode: ExportCameraMode,
    currentCameraView: CameraView,
  ) => {
    cancelledRef.current = false
    chunksRef.current = []
    setProgress(0)

    // Phase: preparing
    setPhase('preparing')

    // Stop current playback
    if (isPlaying) {
      await togglePlay()
    }
    seek(0)

    try {
      // Initialize audio
      await ensureAudioReady()
      if (cancelledRef.current)
        return

      const audioStream = getAudioStream()
      audioStreamRef.current = audioStream
      if (cancelledRef.current)
        return

      // Wait for export canvas to mount
      await new Promise<void>((resolve) => {
        const check = () => {
          if (canvasRef.current || cancelledRef.current) {
            resolve()
            return
          }
          requestAnimationFrame(check)
        }
        check()
      })
      if (cancelledRef.current)
        return

      // Warm up: let a few frames render
      await new Promise(resolve => setTimeout(resolve, 300))
      if (cancelledRef.current)
        return

      const canvas = canvasRef.current!
      const videoStream = canvas.captureStream(60)

      // Merge audio + video streams
      const combinedStream = new MediaStream()
      for (const track of videoStream.getVideoTracks()) {
        combinedStream.addTrack(track)
      }
      if (audioStream) {
        for (const track of audioStream.getAudioTracks()) {
          combinedStream.addTrack(track)
        }
      }

      const mimeType = negotiateMimeType()
      const recorder = new MediaRecorder(combinedStream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 8_000_000,
      })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      // Phase: recording
      setPhase('recording')
      recorder.start(1000)

      // Intro settle time before starting audio
      const introSettle = getVisualizerIntroSettleSeconds()
      introSettleRef.current = introSettle

      // Set initial camera
      if (cameraMode === 'cycle') {
        let viewIndex = 0
        setExportCameraView(CAMERA_VIEWS[viewIndex])

        cycleIntervalRef.current = window.setInterval(() => {
          viewIndex = (viewIndex + 1) % CAMERA_VIEWS.length
          setExportCameraView(CAMERA_VIEWS[viewIndex])
        }, CAMERA_CYCLE_INTERVAL_MS)
      }
      else {
        setExportCameraView(currentCameraView)
      }

      // Wait for intro to settle before starting audio playback
      await new Promise(resolve => setTimeout(resolve, introSettle * 1000))
      if (cancelledRef.current)
        return

      // Start audio playback
      seek(0)
      playStartTimeRef.current = performance.now()
      await togglePlay()

      // Track progress
      const totalDuration = duration
      const trackProgress = () => {
        if (cancelledRef.current)
          return
        const elapsed = (performance.now() - playStartTimeRef.current) / 1000
        const p = Math.min(elapsed / Math.max(totalDuration, 0.1), 1)
        setProgress(p)
        if (p < 1) {
          progressRafRef.current = requestAnimationFrame(trackProgress)
        }
      }
      progressRafRef.current = requestAnimationFrame(trackProgress)

      // Wait for playback to end
      await new Promise<void>((resolve) => {
        const watchInterval = window.setInterval(() => {
          if (cancelledRef.current || recorder.state === 'inactive') {
            window.clearInterval(watchInterval)
            resolve()
            return
          }
          const elapsed = (performance.now() - playStartTimeRef.current) / 1000
          if (elapsed >= totalDuration + 0.5) {
            window.clearInterval(watchInterval)
            resolve()
          }
        }, 250)
      })

      if (cancelledRef.current)
        return

      // Stop recording
      setPhase('finalizing')
      setProgress(1)

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        if (recorder.state !== 'inactive') {
          recorder.stop()
        }
        else {
          resolve()
        }
      })

      if (cancelledRef.current)
        return

      const webmBlob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })

      // Stop playback
      if (isPlaying) {
        await togglePlay()
      }

      if (format === 'webm') {
        downloadBlob(webmBlob, `orbitone-export-${Date.now()}.webm`)
        setPhase('done')
      }
      else {
        // Transcode to MP4
        setPhase('transcoding')

        const formData = new FormData()
        formData.append('video', webmBlob, 'export.webm')

        const response = await fetch('/api/render/transcode', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error('Transcoding failed')
        }

        const mp4Blob = await response.blob()
        downloadBlob(mp4Blob, `orbitone-export-${Date.now()}.mp4`)
        setPhase('done')
      }

      cleanup()

      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        setPhase(current => current === 'done' ? 'idle' : current)
      }, 3000)
    }
    catch (error) {
      if (!cancelledRef.current) {
        console.error('Export failed:', error)
        setPhase('error')
        cleanup()
        setTimeout(() => {
          setPhase(current => current === 'error' ? 'idle' : current)
        }, 5000)
      }
    }
  }, [cleanup, duration, ensureAudioReady, getAudioStream, isPlaying, seek, togglePlay])

  return {
    phase,
    progress,
    exportCameraView,
    startExport,
    cancelExport,
    setExportCanvas,
  }
}
