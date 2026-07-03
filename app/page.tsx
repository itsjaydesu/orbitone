'use client'
import type { ToastData } from '@/components/Toast'
import type { VisualizerSettings } from '@/components/Visualizer'
import type {
  AppLanguage,
  CameraPose,
  CameraPresetMap,
  CameraView,
} from '@/lib/camera-presets'
import type { ExportCameraMode, ExportFormat } from '@/lib/export'
import type { InstrumentId } from '@/lib/instruments'
import type {
  MidiLibraryCategory,
  MidiLibraryItem,
} from '@/lib/library'
import type { LibraryPrimaryGroup } from '@/lib/library-meta'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Info,
  Library,
  Loader2,
  Play,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
  Upload,
} from 'lucide-react'
import { AnimatePresence, domAnimation, LazyMotion, useReducedMotion } from 'motion/react'
import dynamic from 'next/dynamic'
import {

  startTransition,

  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { GitHubMark } from '@/components/BrandMarks'
import { CameraLab } from '@/components/CameraLab'
import { InfoModal } from '@/components/InfoModal'
import { LibraryPanel } from '@/components/LibraryPanel'
import { NoteCursor } from '@/components/NoteCursor'
import { PlaybackTimeline } from '@/components/PlaybackControls'
import { SettingsPanel } from '@/components/SettingsPanel'
import { Toast } from '@/components/Toast'
import { Visualizer } from '@/components/Visualizer'
import { useIsMobile } from '@/hooks/use-mobile'
import { useMidiLibrary } from '@/hooks/useMidiLibrary'
import { useMusic } from '@/hooks/useMusic'
import {
  CAMERA_PRESETS_STORAGE_KEY,
  CAMERA_VIEWS,
  cameraPoseEquals,
  cloneCameraPose,
  cloneCameraPresetMap,
  DEFAULT_CAMERA_PRESETS,
  getCameraViewLabels,
  mergeCameraPresetMap,
} from '@/lib/camera-presets'
import { EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS } from '@/lib/export'
import { getBrandName, KEYBOARD_SHORTCUTS, LANGUAGE_OPTIONS, UI_COPY } from '@/lib/i18n'
import {
  DEFAULT_INSTRUMENT_ID,

} from '@/lib/instruments'
import { FEATURED_LIBRARY_ORDER, getLibraryCategoryMeta, getLibraryPrimaryGroups } from '@/lib/library-meta'
import { cn } from '@/lib/utils'
import { isVideoExportClientEnabled } from '@/lib/video-export-env'

type AppSettings = VisualizerSettings & {
  autoCycleCamera: boolean
  showBottomTrackMeta: boolean
  volumePercent: number
  instrumentId: InstrumentId
}

interface DisplayTrackMeta {
  title: string | null
  subtitle: string | null
}

const DEFAULT_SETTINGS: AppSettings = {
  autoCycleCamera: false,
  showBottomTrackMeta: true,
  volumePercent: 100,
  showMidiRoll: false,
  cameraView: 'default',
  instrumentId: DEFAULT_INSTRUMENT_ID,
}
const DEFAULT_EXPORT_FORMAT: ExportFormat = 'mp4'
const DEFAULT_EXPORT_CAMERA_MODE: ExportCameraMode = 'cycle'

const PLAYBACK_CHROME_TIMEOUT_MS = 2000
const TEXT_FADE_SWAP_DELAY_MS = 140
const TEXT_FADE_REVEAL_DELAY_MS = 34
const BOTTOM_TRACK_META_OFFSET_PX = 80
const MIDI_EXTENSIONS = ['.mid', '.midi']
const VideoExportDevTools = dynamic(
  () => import('@/components/VideoExportDevTools').then(module => module.VideoExportDevTools),
  { ssr: false },
)
function stripMidiExtension(fileName: string) {
  return fileName.replace(/\.(mid|midi)$/i, '')
}

function formatLoadedTitle(fileName: string, language: AppLanguage) {
  const stem = stripMidiExtension(fileName).trim()

  if (stem.length === 0) {
    return language === 'ja' ? '無題のMIDI' : 'Untitled MIDI'
  }

  if (/[A-Z]/.test(stem) || stem.includes(' ')) {
    return stem.replace(/_/g, ' ')
  }

  return stem
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function isMidiFile(file: File) {
  const lowerName = file.name.toLowerCase()

  return (
    file.type === 'audio/midi'
    || file.type === 'audio/x-midi'
    || MIDI_EXTENSIONS.some(extension => lowerName.endsWith(extension))
  )
}

export default function Home() {
  const isMobile = useIsMobile()
  const [isAutomationMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return new URLSearchParams(window.location.search).has('automation')
  })
  const [language, setLanguage] = useState<AppLanguage>('en')

  useEffect(() => {
    if (navigator.language.startsWith('ja')) {
      setLanguage('ja')
    }
  }, [])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isMenuReady, setIsMenuReady] = useState(false)
  const [isMenuVisible, setIsMenuVisible] = useState(false)
  const [isUploadDragActive, setIsUploadDragActive] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFullscreenHint, setShowFullscreenHint] = useState(false)
  const hasShownFullscreenHintRef = useRef(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCameraLab, setShowCameraLab] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)
  const [activeLibraryCategoryId, setActiveLibraryCategoryId] = useState('')
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string | null>(
    null,
  )
  const [currentTrackFileName, setCurrentTrackFileName] = useState<string | null>(
    null,
  )
  const [currentLibraryTrackId, setCurrentLibraryTrackId] = useState<
    string | null
  >(null)
  const [savedCameraPresets, setSavedCameraPresets] = useState<CameraPresetMap>(
    () => cloneCameraPresetMap(DEFAULT_CAMERA_PRESETS),
  )
  const [cameraDraftPresets, setCameraDraftPresets] = useState<CameraPresetMap>(
    () => cloneCameraPresetMap(DEFAULT_CAMERA_PRESETS),
  )
  const library = useMidiLibrary()
  const [initialLibraryTrack, setInitialLibraryTrack]
    = useState<MidiLibraryItem | null>(null)
  const [initialTrackFailed, setInitialTrackFailed] = useState(false)

  const [exportFormat, setExportFormat] = useState<ExportFormat>(DEFAULT_EXPORT_FORMAT)
  const [exportCameraMode, setExportCameraMode] = useState<ExportCameraMode>(
    DEFAULT_EXPORT_CAMERA_MODE,
  )
  // While an export runs inside the settings panel, closing the panel would
  // unmount the capture rig and silently kill the export — closes are held.
  const [isExportActive, setIsExportActive] = useState(false)

  const {
    isPlaying,
    isAudioLoading,
    isStartingPlayback,
    audioLoadFailed,
    audioLevelRef,
    getPlaybackTime,
    hasEnded,
    requiresExplicitAudioUnlock,
    isAudioUnlocked,
    isAudioUnlocking,
    togglePlay,
    notes,
    loadMidi,
    duration,
    seek,
    bpm,
    setBpm,
    resetBpm,
    pedalEvents,
    playbackGain,
    trackSource,
  } = useMusic({
    volumePercent: settings.volumePercent,
    instrumentId: settings.instrumentId,
  })
  const playbackChromeManaged = isPlaying && !hasEnded
  const shouldPersistChrome = !playbackChromeManaged
  const reduceMotion = useReducedMotion() ?? false

  const [toast, setToast] = useState<ToastData | null>(null)
  const showToast = useCallback((message: string) => {
    setToast({ id: Date.now(), message })
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setToast(current => (current?.id === toast.id ? null : current))
    }, 4200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toast])

  useEffect(() => {
    if (audioLoadFailed) {
      showToast(UI_COPY[language].audioLoadError)
    }
  }, [audioLoadFailed, language, showToast])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const idleTimerRef = useRef<number | undefined>(undefined)
  const brandSwapTimerRef = useRef<number | undefined>(undefined)
  const brandRevealTimerRef = useRef<number | undefined>(undefined)
  const uploadDragDepthRef = useRef(0)
  const infoRef = useRef<HTMLDivElement>(null)
  const libraryRef = useRef<HTMLDivElement>(null)
  const libraryListRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const cameraLabRef = useRef<HTMLDivElement>(null)
  const currentTrackTitleRef = useRef<string | null>(null)
  const initialTrackRequestedRef = useRef(false)
  const [headerBrandName, setHeaderBrandName] = useState<string>(() =>
    getBrandName(language),
  )
  const [isHeaderBrandVisible, setIsHeaderBrandVisible] = useState(true)
  const headerBrandNameRef = useRef<string>(getBrandName(language))
  const copy = UI_COPY[language]
  const displayBrandName = getBrandName(language)
  const cameraViewLabels = useMemo(
    () => getCameraViewLabels(language),
    [language],
  )
  const cycleCameraView = useCallback(() => {
    setSettings((current) => {
      const currentIndex = CAMERA_VIEWS.indexOf(current.cameraView)
      const nextIndex
        = currentIndex >= 0
          ? (currentIndex + 1) % CAMERA_VIEWS.length
          : 0

      return {
        ...current,
        cameraView: CAMERA_VIEWS[nextIndex] ?? CAMERA_VIEWS[0],
      }
    })
  }, [])
  const libraryPrimaryGroups = useMemo(
    () => getLibraryPrimaryGroups(language),
    [language],
  )
  const libraryPrimaryGroupIndex = useMemo(
    () =>
      new Map(
        libraryPrimaryGroups.flatMap(group =>
          group.categoryIds.map(categoryId => [categoryId, group] as const),
        ),
      ),
    [libraryPrimaryGroups],
  )
  const keyboardShortcuts = KEYBOARD_SHORTCUTS[language]

  const activeLibraryCategory = useMemo<MidiLibraryCategory | null>(
    () =>
      library
        ? (library.categoryIndex.get(activeLibraryCategoryId)
          ?? library.categories[0]
          ?? null)
        : null,
    [activeLibraryCategoryId, library],
  )
  const activeLibraryGroup = useMemo<LibraryPrimaryGroup | null>(
    () =>
      libraryPrimaryGroupIndex.get(activeLibraryCategoryId)
      ?? libraryPrimaryGroups[0]
      ?? null,
    [activeLibraryCategoryId, libraryPrimaryGroupIndex, libraryPrimaryGroups],
  )
  const activeLibraryCategoryMeta = activeLibraryCategory
    ? getLibraryCategoryMeta(activeLibraryCategory.id, language)
    : getLibraryCategoryMeta('', language)
  const ActiveLibraryCategoryIcon = activeLibraryCategoryMeta.icon
  const ActiveLibraryGroupIcon
    = activeLibraryGroup?.icon ?? ActiveLibraryCategoryIcon
  const activeTrainSubcategories = useMemo(
    () =>
      library && (activeLibraryGroup?.categoryIds.length ?? 0) > 1
        ? (activeLibraryGroup?.categoryIds
            .map(categoryId => library.categoryIndex.get(categoryId))
            .filter((category): category is MidiLibraryCategory =>
              Boolean(category),
            ) ?? [])
        : [],
    [activeLibraryGroup, library],
  )
  const activeLibraryHeading
    = activeLibraryGroup?.label
      ?? activeLibraryCategoryMeta.label
      ?? copy.libraryDefaultHeading
  const activeLibraryDescription = activeLibraryGroup
    ? activeLibraryGroup.categoryIds.length === 1
      ? activeLibraryGroup.blurb
      : language === 'ja'
        ? `${activeLibraryGroup.blurb} 現在は${activeLibraryCategoryMeta.label}を表示しています。`
        : `${activeLibraryGroup.blurb} Currently showing ${activeLibraryCategoryMeta.label}.`
    : activeLibraryCategoryMeta.blurb
  const currentLibraryTrack = useMemo<MidiLibraryItem | null>(
    () =>
      currentLibraryTrackId && library
        ? (library.trackIndex.get(currentLibraryTrackId) ?? null)
        : null,
    [currentLibraryTrackId, library],
  )
  const localizedTrackTitle = currentLibraryTrack && library
    ? library.getLocalizedTrackTitle(currentLibraryTrack, language)
    : currentTrackTitle
  const localizedTrackSubtitle = library
    ? library.getLocalizedTrackSubtitle(
        currentLibraryTrack?.subtitle ?? null,
        language,
      )
    : currentLibraryTrack?.subtitle ?? null
  const [displayTrackMeta, setDisplayTrackMeta] = useState<DisplayTrackMeta>(
    () => ({
      title: localizedTrackTitle,
      subtitle: localizedTrackSubtitle,
    }),
  )
  const displayTrackMetaRef = useRef<DisplayTrackMeta>({
    title: localizedTrackTitle,
    subtitle: localizedTrackSubtitle,
  })
  const trackMetaSwapTimerRef = useRef<number | undefined>(undefined)
  const trackMetaRevealTimerRef = useRef<number | undefined>(undefined)
  const [isTrackMetaVisible, setIsTrackMetaVisible] = useState(() =>
    Boolean(localizedTrackTitle || localizedTrackSubtitle),
  )
  const visibleLibraryItems = useMemo(() => {
    if (!activeLibraryCategory) {
      return []
    }

    return activeLibraryCategory.items
      .map((item, index) => ({
        item,
        index,
        featuredRank:
          FEATURED_LIBRARY_ORDER.get(item.id) ?? Number.MAX_SAFE_INTEGER,
      }))
      .toSorted(
        (left, right) =>
          left.featuredRank - right.featuredRank || left.index - right.index,
      )
      .map(({ item }) => item)
  }, [activeLibraryCategory])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const entering = Boolean(document.fullscreenElement)
      setIsFullscreen(entering)

      if (entering && !hasShownFullscreenHintRef.current) {
        hasShownFullscreenHintRef.current = true
        setShowFullscreenHint(true)
        window.setTimeout(setShowFullscreenHint, 3000, false)
      }
    }

    handleFullscreenChange()
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    currentTrackTitleRef.current = currentTrackTitle
  }, [currentTrackTitle])

  useEffect(() => {
    headerBrandNameRef.current = headerBrandName
  }, [headerBrandName])

  useEffect(() => {
    displayTrackMetaRef.current = displayTrackMeta
  }, [displayTrackMeta])

  useEffect(() => {
    if (headerBrandNameRef.current === displayBrandName) {
      setIsHeaderBrandVisible(true)
      return
    }

    if (brandSwapTimerRef.current !== undefined) {
      window.clearTimeout(brandSwapTimerRef.current)
    }

    if (brandRevealTimerRef.current !== undefined) {
      window.clearTimeout(brandRevealTimerRef.current)
    }

    setIsHeaderBrandVisible(false)
    brandSwapTimerRef.current = window.setTimeout(() => {
      setHeaderBrandName(displayBrandName)
      headerBrandNameRef.current = displayBrandName
      brandRevealTimerRef.current = window.setTimeout(() => {
        setIsHeaderBrandVisible(true)
        brandRevealTimerRef.current = undefined
      }, TEXT_FADE_REVEAL_DELAY_MS)
      brandSwapTimerRef.current = undefined
    }, TEXT_FADE_SWAP_DELAY_MS)

    return () => {
      if (brandSwapTimerRef.current !== undefined) {
        window.clearTimeout(brandSwapTimerRef.current)
        brandSwapTimerRef.current = undefined
      }

      if (brandRevealTimerRef.current !== undefined) {
        window.clearTimeout(brandRevealTimerRef.current)
        brandRevealTimerRef.current = undefined
      }
    }
  }, [displayBrandName])

  useEffect(() => {
    const currentDisplay = displayTrackMetaRef.current
    const nextDisplay = {
      title: localizedTrackTitle,
      subtitle: localizedTrackSubtitle,
    }

    if (
      currentDisplay.title === nextDisplay.title
      && currentDisplay.subtitle === nextDisplay.subtitle
    ) {
      setIsTrackMetaVisible(Boolean(nextDisplay.title || nextDisplay.subtitle))
      return
    }

    if (trackMetaSwapTimerRef.current !== undefined) {
      window.clearTimeout(trackMetaSwapTimerRef.current)
    }

    if (trackMetaRevealTimerRef.current !== undefined) {
      window.clearTimeout(trackMetaRevealTimerRef.current)
    }

    const hasCurrentMeta = Boolean(
      currentDisplay.title || currentDisplay.subtitle,
    )
    const hasNextMeta = Boolean(nextDisplay.title || nextDisplay.subtitle)

    if (!hasCurrentMeta) {
      displayTrackMetaRef.current = nextDisplay
      setDisplayTrackMeta(nextDisplay)
      setIsTrackMetaVisible(hasNextMeta)
      return
    }

    setIsTrackMetaVisible(false)
    trackMetaSwapTimerRef.current = window.setTimeout(() => {
      displayTrackMetaRef.current = nextDisplay
      setDisplayTrackMeta(nextDisplay)
      trackMetaSwapTimerRef.current = undefined

      if (!hasNextMeta) {
        return
      }

      trackMetaRevealTimerRef.current = window.setTimeout(() => {
        setIsTrackMetaVisible(true)
        trackMetaRevealTimerRef.current = undefined
      }, TEXT_FADE_REVEAL_DELAY_MS)
    }, TEXT_FADE_SWAP_DELAY_MS)

    return () => {
      if (trackMetaSwapTimerRef.current !== undefined) {
        window.clearTimeout(trackMetaSwapTimerRef.current)
        trackMetaSwapTimerRef.current = undefined
      }

      if (trackMetaRevealTimerRef.current !== undefined) {
        window.clearTimeout(trackMetaRevealTimerRef.current)
        trackMetaRevealTimerRef.current = undefined
      }
    }
  }, [localizedTrackSubtitle, localizedTrackTitle])

  useEffect(() => {
    if (showLibrary && currentLibraryTrack) {
      if (currentLibraryTrack) {
        setActiveLibraryCategoryId(currentLibraryTrack.categoryId)
      }
    }
  }, [currentLibraryTrack, showLibrary])

  useEffect(() => {
    if (!showLibrary) {
      return
    }

    libraryListRef.current?.scrollTo({ behavior: 'auto', top: 0 })
  }, [activeLibraryCategoryId, showLibrary])

  useEffect(() => {
    const hasOpenLayer
      = showInfo || showLibrary || showSettings || showCameraLab

    if (!hasOpenLayer) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      const clickedInsideInfo = showInfo && infoRef.current?.contains(target)
      const clickedInsideLibrary
        = showLibrary && libraryRef.current?.contains(target)
      const clickedInsideSettings
        = showSettings
          && ((settingsRef.current?.contains(target) ?? false)
            || (settingsTriggerRef.current?.contains(target) ?? false))
      const clickedInsideCameraLab
        = showCameraLab && cameraLabRef.current?.contains(target)

      if (
        clickedInsideInfo
        || clickedInsideLibrary
        || clickedInsideSettings
        || clickedInsideCameraLab
      ) {
        return
      }

      setShowInfo(false)
      setShowLibrary(false)
      if (!isExportActive) {
        setShowSettings(false)
      }
      setShowCameraLab(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isExportActive, showCameraLab, showInfo, showLibrary, showSettings])

  useEffect(() => {
    try {
      const storedPresets = window.localStorage.getItem(
        CAMERA_PRESETS_STORAGE_KEY,
      )

      if (!storedPresets) {
        return
      }

      const mergedPresets = mergeCameraPresetMap(JSON.parse(storedPresets))
      setSavedCameraPresets(mergedPresets)
      setCameraDraftPresets(cloneCameraPresetMap(mergedPresets))
    }
    catch (error) {
      void error
    }
  }, [])

  const persistCameraPresets = useCallback((nextPresets: CameraPresetMap) => {
    window.localStorage.setItem(
      CAMERA_PRESETS_STORAGE_KEY,
      JSON.stringify(nextPresets),
    )
  }, [])

  const updateCameraDraft = useCallback(
    (view: CameraView, pose: CameraPose) => {
      setCameraDraftPresets((currentPresets) => {
        if (cameraPoseEquals(currentPresets[view], pose)) {
          return currentPresets
        }

        return {
          ...currentPresets,
          [view]: cloneCameraPose(pose),
        }
      })
    },
    [],
  )

  const loadMidiFile = useCallback(
    async (
      file: File,
      options?: {
        libraryTrackId?: string | null
        title?: string
      },
    ) => {
      const didLoad = await loadMidi(file)

      if (!didLoad) {
        showToast(UI_COPY[language].midiParseError)
        return false
      }

      setCurrentTrackTitle(
        options?.title ?? formatLoadedTitle(file.name, language),
      )
      setCurrentTrackFileName(file.name)
      setCurrentLibraryTrackId(options?.libraryTrackId ?? null)

      return true
    },
    [language, loadMidi, showToast],
  )

  const fetchLibraryMidiFile = useCallback(async (item: MidiLibraryItem) => {
    const response = await fetch(item.url)

    if (!response.ok) {
      throw new Error(`Failed to fetch ${item.url}: ${response.status}`)
    }

    const blob = await response.blob()
    return new File([blob], item.fileName, { type: 'audio/midi' })
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen()
    }
    catch (error) {
      void error
    }
  }, [])

  const resetUploadDragState = useCallback(() => {
    uploadDragDepthRef.current = 0
    setIsUploadDragActive(false)
  }, [])

  const openLibrary = useCallback(() => {
    if (currentLibraryTrack) {
      setActiveLibraryCategoryId(currentLibraryTrack.categoryId)
    }

    setShowLibrary(true)

    setShowSettings(false)
    setShowInfo(false)
    setShowCameraLab(false)
  }, [currentLibraryTrack])

  const closeLibrary = useCallback(() => {
    setShowLibrary(false)
  }, [])

  const toggleLibrary = useCallback(() => {
    if (showLibrary) {
      closeLibrary()
      return
    }

    openLibrary()
  }, [closeLibrary, openLibrary, showLibrary])

  const loadLibraryMidi = useCallback(async (item: MidiLibraryItem) => {
    setIsLoadingLibrary(true)

    try {
      const file = await fetchLibraryMidiFile(item)
      const didLoad = await loadMidiFile(file, {
        libraryTrackId: item.id,
        title: item.title,
      })

      if (didLoad) {
        closeLibrary()
      }
    }
    catch {
      showToast(copy.libraryLoadError)
    }
    finally {
      setIsLoadingLibrary(false)
    }
  }, [closeLibrary, copy.libraryLoadError, fetchLibraryMidiFile, loadMidiFile, showToast])

  const loadAdjacentTrack = useCallback((direction: -1 | 1) => {
    if (isLoadingLibrary || !library || library.tracks.length === 0)
      return
    const currentIndex = currentLibraryTrackId
      ? library.tracks.findIndex(item => item.id === currentLibraryTrackId)
      : -1
    const nextIndex
      = currentIndex === -1
        ? 0
        : (currentIndex + direction + library.tracks.length)
          % library.tracks.length
    const nextItem = library.tracks[nextIndex]
    if (nextItem) {
      loadLibraryMidi(nextItem)
    }
  }, [currentLibraryTrackId, isLoadingLibrary, library, loadLibraryMidi])

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== undefined) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = undefined
    }
  }, [])

  const scheduleIdleHide = useCallback(() => {
    clearIdleTimer()
    if (shouldPersistChrome) {
      return
    }

    idleTimerRef.current = window.setTimeout(() => {
      setIsMenuVisible(false)
    }, PLAYBACK_CHROME_TIMEOUT_MS)
  }, [clearIdleTimer, shouldPersistChrome])

  const handlePlaybackToggle = useCallback(() => {
    if (hasEnded) {
      seek(0)
    }

    void togglePlay()
  }, [hasEnded, seek, togglePlay])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      let shouldRevealChrome = false

      if (
        e.target instanceof HTMLInputElement
        && ['text', 'number', 'password', 'email'].includes(e.target.type)
      ) {
        return
      }

      if (e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.ctrlKey || e.altKey || e.metaKey) {
        return
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault()
          handlePlaybackToggle()
          break
        case 'f':
          e.preventDefault()
          shouldRevealChrome = true
          toggleFullscreen()
          break
        case 's':
          e.preventDefault()
          shouldRevealChrome = true
          if (isExportActive) {
            break
          }
          setShowSettings(v => !v)
          setShowInfo(false)

          closeLibrary()
          break
        case 'c':
          e.preventDefault()
          shouldRevealChrome = true
          cycleCameraView()
          break
        case 'i':
          e.preventDefault()
          shouldRevealChrome = true
          if (isExportActive) {
            break
          }
          setShowInfo(v => !v)

          setShowSettings(false)
          closeLibrary()
          break
        case 'l':
          e.preventDefault()
          shouldRevealChrome = true
          if (isExportActive) {
            break
          }
          toggleLibrary()
          break
        case 'u':
          e.preventDefault()
          shouldRevealChrome = true
          fileInputRef.current?.click()
          break
        case 'm':
          e.preventDefault()
          shouldRevealChrome = true
          setSettings(s => ({ ...s, showMidiRoll: !s.showMidiRoll }))
          break
        case 'arrowleft':
          e.preventDefault()
          shouldRevealChrome = true
          loadAdjacentTrack(-1)
          break
        case 'arrowright':
          e.preventDefault()
          shouldRevealChrome = true
          loadAdjacentTrack(1)
          break
        case 'escape':
          shouldRevealChrome = true
          if (!isExportActive) {
            setShowSettings(false)
          }
          setShowInfo(false)

          closeLibrary()
          setShowCameraLab(false)
          break
      }

      if (e.defaultPrevented && shouldRevealChrome) {
        setIsMenuVisible(true)
        scheduleIdleHide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    closeLibrary,
    cycleCameraView,
    handlePlaybackToggle,
    isExportActive,
    loadAdjacentTrack,
    scheduleIdleHide,
    toggleFullscreen,
    toggleLibrary,
  ])

  useEffect(() => {
    if (!shouldPersistChrome) {
      return
    }

    clearIdleTimer()
    if (!isMenuReady) {
      setIsMenuReady(true)
    }
    if (!isMenuVisible) {
      setIsMenuVisible(true)
    }
  }, [clearIdleTimer, isMenuReady, isMenuVisible, shouldPersistChrome])

  useEffect(() => {
    if (shouldPersistChrome) {
      return
    }

    setIsMenuReady(true)
    setIsMenuVisible(true)
    scheduleIdleHide()

    return () => {
      clearIdleTimer()
    }
  }, [clearIdleTimer, scheduleIdleHide, shouldPersistChrome])

  useEffect(() => {
    if (shouldPersistChrome || !isMenuReady) {
      return
    }

    if (showSettings || showCameraLab || showInfo || showLibrary) {
      clearIdleTimer()
      setIsMenuVisible(true)
      return
    }

    if (isMenuVisible) {
      scheduleIdleHide()
    }
  }, [
    clearIdleTimer,
    isMenuReady,
    isMenuVisible,
    scheduleIdleHide,
    shouldPersistChrome,
    showCameraLab,
    showInfo,
    showLibrary,
    showSettings,
  ])

  useEffect(() => {
    if (shouldPersistChrome || !isMenuReady) {
      return
    }

    const handlePointerActivity = () => {
      setIsMenuVisible(true)
      if (!showSettings && !showCameraLab && !showInfo && !showLibrary) {
        scheduleIdleHide()
      }
    }

    window.addEventListener('pointerdown', handlePointerActivity)

    if (!isMobile) {
      window.addEventListener('pointermove', handlePointerActivity, {
        passive: true,
      })
    }

    return () => {
      window.removeEventListener('pointerdown', handlePointerActivity)

      if (!isMobile) {
        window.removeEventListener('pointermove', handlePointerActivity)
      }
    }
  }, [
    isMenuReady,
    isMobile,
    scheduleIdleHide,
    shouldPersistChrome,
    showCameraLab,
    showInfo,
    showLibrary,
    showSettings,
  ])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await loadMidiFile(file)
    }
    e.target.blur()
  }

  const handleUploadDragEnter = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    uploadDragDepthRef.current += 1
    setIsUploadDragActive(true)
  }

  const handleUploadDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsUploadDragActive(true)
  }

  const handleUploadDragLeave = () => {
    uploadDragDepthRef.current = Math.max(0, uploadDragDepthRef.current - 1)

    if (uploadDragDepthRef.current === 0) {
      setIsUploadDragActive(false)
    }
  }

  const handleUploadDrop = async (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const droppedFile = [...e.dataTransfer.files].find(isMidiFile)

    resetUploadDragState()

    if (!droppedFile) {
      return
    }

    await loadMidiFile(droppedFile)
  }

  useEffect(() => {
    if (!library) {
      return
    }

    if (!activeLibraryCategoryId) {
      setActiveLibraryCategoryId(library.categories[0]?.id ?? '')
    }
  }, [activeLibraryCategoryId, library])

  useEffect(() => {
    if (
      !library
      || isAutomationMode
      || initialLibraryTrack !== null
      || initialTrackRequestedRef.current
    ) {
      return
    }

    if (library.tracks.length === 0) {
      setInitialTrackFailed(true)
      return
    }

    const randomIndex = Math.floor(Math.random() * library.tracks.length)
    setInitialLibraryTrack(library.tracks[randomIndex] ?? null)
  }, [initialLibraryTrack, isAutomationMode, library])

  useEffect(() => {
    if (
      isAutomationMode
      || !initialLibraryTrack
      || currentTrackTitle !== null
      || initialTrackRequestedRef.current
    ) {
      return
    }

    initialTrackRequestedRef.current = true
    let isCancelled = false

    const loadInitialTrack = async () => {
      setIsLoadingLibrary(true)

      try {
        const file = await fetchLibraryMidiFile(initialLibraryTrack)
        if (isCancelled || currentTrackTitleRef.current !== null) {
          return
        }

        await loadMidiFile(file, {
          libraryTrackId: initialLibraryTrack.id,
          title: initialLibraryTrack.title,
        })
      }
      catch {
        if (!isCancelled) {
          setInitialTrackFailed(true)
        }
      }
      finally {
        if (!isCancelled) {
          setIsLoadingLibrary(false)
        }
      }
    }

    void loadInitialTrack()

    return () => {
      isCancelled = true
    }
  }, [
    currentTrackTitle,
    fetchLibraryMidiFile,
    initialLibraryTrack,
    isAutomationMode,
    loadMidiFile,
  ])

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    setSettings(current => ({ ...current, [key]: value }))
  }

  useEffect(() => {
    if (!settings.autoCycleCamera || showCameraLab) {
      return
    }

    const timeoutId = window.setTimeout(
      cycleCameraView,
      EXPORT_CAMERA_CYCLE_INTERVAL_SECONDS * 1000,
    )

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    cycleCameraView,
    settings.autoCycleCamera,
    settings.cameraView,
    showCameraLab,
  ])

  const resetSettings = () => {
    setSettings({ ...DEFAULT_SETTINGS })
    setExportFormat(DEFAULT_EXPORT_FORMAT)
    setExportCameraMode(DEFAULT_EXPORT_CAMERA_MODE)
    resetBpm()
  }

  const activeCameraView = settings.cameraView
  const activeCameraDraft = cameraDraftPresets[activeCameraView]
  const savedActiveCameraPose = savedCameraPresets[activeCameraView]
  const isActiveCameraDirty = !cameraPoseEquals(
    activeCameraDraft,
    savedActiveCameraPose,
  )

  const handleVisualizerCameraPoseChange = useCallback(
    (pose: CameraPose) => {
      startTransition(() => {
        updateCameraDraft(activeCameraView, pose)
      })
    },
    [activeCameraView, updateCameraDraft],
  )

  const saveActiveCameraView = useCallback(() => {
    setSavedCameraPresets((currentPresets) => {
      const nextPresets = {
        ...currentPresets,
        [activeCameraView]: cloneCameraPose(
          cameraDraftPresets[activeCameraView],
        ),
      }

      persistCameraPresets(nextPresets)
      return nextPresets
    })
  }, [
    activeCameraView,
    cameraDraftPresets,
    persistCameraPresets,
    setSavedCameraPresets,
  ])

  const revertActiveCameraView = useCallback(() => {
    updateCameraDraft(activeCameraView, savedCameraPresets[activeCameraView])
  }, [activeCameraView, savedCameraPresets, updateCameraDraft])

  const resetActiveCameraView = useCallback(() => {
    updateCameraDraft(
      activeCameraView,
      DEFAULT_CAMERA_PRESETS[activeCameraView],
    )
  }, [activeCameraView, updateCameraDraft])

  const chromeVisible = shouldPersistChrome || (isMenuReady && isMenuVisible)
  // Hold the visualizer empty until the initial library track has loaded so
  // the intro sweep plays on the real track, not the generated default piece.
  const shouldHoldInitialVisualizerNotes
    = !isAutomationMode && trackSource !== 'loaded' && !initialTrackFailed
  const needsExplicitAudioUnlock
    = requiresExplicitAudioUnlock && !isAudioUnlocked
  const playbackButtonBusy
    = isAudioLoading || isAudioUnlocking || isStartingPlayback
  const playbackButtonLabel = playbackButtonBusy
    ? isAudioUnlocking
      ? copy.enablingSound
      : copy.loadingPiano
    : needsExplicitAudioUnlock
      ? copy.enableSound
      : hasEnded
        ? copy.restartPlayback
        : isPlaying
          ? copy.stopPlayback
          : copy.startPlayback
  const playbackButtonIcon = playbackButtonBusy
    ? <Loader2 className="h-7 w-7 animate-spin sm:h-6 sm:w-6" />
    : isPlaying
      ? <Square className="h-6 w-6 fill-current sm:h-5 sm:w-5" />
      : hasEnded
        ? <RotateCcw className="h-6 w-6 sm:h-5 sm:w-5" />
        : <Play className="ml-1 h-7 w-7 fill-current sm:h-6 sm:w-6" />
  const bottomTrackMetaVisible = Boolean(
    settings.showBottomTrackMeta
    && !shouldPersistChrome
    && isMenuReady
    && !chromeVisible
    && (displayTrackMeta.title || displayTrackMeta.subtitle),
  )
  const hasOpenOverlay = showLibrary || showSettings
  const topChromeClass = cn(
    'absolute top-0 left-0 grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4 sm:gap-4 sm:p-6 min-[840px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[840px]:gap-6',
    hasOpenOverlay ? 'z-40' : 'z-10',
    isMenuReady && 'transition-opacity duration-700 ease-out',
    chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
  )
  const bottomChromeClass = cn(
    'absolute left-1/2 z-10 -translate-x-1/2',
    isMenuReady && 'transition-opacity duration-700 ease-out',
    chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
  )
  const bottomTrackMetaStyle = isMobile
    ? {
        bottom: `calc(env(safe-area-inset-bottom, 0px) + 1.5rem + ${BOTTOM_TRACK_META_OFFSET_PX}px)`,
      }
    : {
        bottom: `calc(2.5rem + ${BOTTOM_TRACK_META_OFFSET_PX}px)`,
      }
  const topChromeStyle = isMobile
    ? {
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)',
      }
    : undefined
  const timelineChromeStyle = isMobile
    ? {
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7.75rem)',
      }
    : undefined
  const playChromeStyle = isMobile
    ? {
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.75rem)',
      }
    : undefined

  return (
    <main className="relative h-dvh w-full overflow-hidden overscroll-none bg-black font-sans">
      <LazyMotion features={domAnimation} strict>
        <input
          type="file"
          accept=".mid,.midi"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />

        <div
          className={cn('pointer-events-none', topChromeClass)}
          inert={!chromeVisible}
          style={topChromeStyle}
        >
          <div className="pointer-events-auto flex items-center gap-1.5">
            <h1 className="text-xl font-semibold tracking-[0.18em] text-[var(--nm-text)] sm:text-2xl">
              <span
                className={cn(
                  'inline-block transition-opacity duration-150 ease-out motion-reduce:transition-none',
                  isHeaderBrandVisible ? 'opacity-100' : 'opacity-0',
                )}
              >
                {headerBrandName}
              </span>
            </h1>
            <a
              href="https://github.com/itsjaydesu/orbitone"
              target="_blank"
              rel="noopener noreferrer"
              className="-m-3 p-3 text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
              aria-label="GitHub"
            >
              <GitHubMark className="h-[0.9rem] w-[0.9rem] translate-y-[2px]" />
            </a>
          </div>

          <div className="pointer-events-none order-3 col-span-2 flex min-w-0 justify-center pt-0 min-[840px]:absolute min-[840px]:left-1/2 min-[840px]:top-0 min-[840px]:w-full min-[840px]:max-w-[min(46rem,calc(100%-32rem))] min-[840px]:-translate-x-1/2 min-[840px]:px-6 min-[840px]:pt-1">
            {(displayTrackMeta.title || displayTrackMeta.subtitle) && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => loadAdjacentTrack(-1)}
                  disabled={isLoadingLibrary}
                  className="pointer-events-auto flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/45 transition-colors hover:text-white/80 disabled:opacity-40"
                  aria-label={copy.previousTrack}
                >
                  <ChevronLeft className="h-[1.2rem] w-[1.2rem] sm:h-4 sm:w-4" />
                </button>
                <div className="max-w-[min(42rem,100%)] px-4 py-2.5 text-center sm:px-5 sm:py-3">
                  <div
                    className={cn(
                      'transition-opacity duration-150 ease-out motion-reduce:transition-none',
                      isTrackMetaVisible ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    {displayTrackMeta.title && (
                      <div className="text-sm font-medium whitespace-normal break-words leading-tight tracking-[0.08em] text-[var(--nm-text)] sm:text-base">
                        {displayTrackMeta.title}
                      </div>
                    )}
                    {displayTrackMeta.subtitle && (
                      <div className="mt-1 type-overline whitespace-normal break-words leading-tight text-[var(--nm-text-faint)] sm:text-xs">
                        {displayTrackMeta.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadAdjacentTrack(1)}
                  disabled={isLoadingLibrary}
                  className="pointer-events-auto flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/45 transition-colors hover:text-white/80 disabled:opacity-40"
                  aria-label={copy.nextTrack}
                >
                  <ChevronRight className="h-[1.2rem] w-[1.2rem] sm:h-4 sm:w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="relative justify-self-end">
            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {!isMobile && (
                <button
                  onClick={(e) => {
                    fileInputRef.current?.click()
                    e.currentTarget.blur()
                  }}
                  onDragEnter={handleUploadDragEnter}
                  onDragOver={handleUploadDragOver}
                  onDragLeave={handleUploadDragLeave}
                  onDrop={handleUploadDrop}
                  className={cn(
                    'rounded-xl p-2.5 text-[var(--nm-text)]',
                    isUploadDragActive ? 'nm-drag-active' : 'nm-raised',
                  )}
                  aria-label={copy.upload}
                >
                  <Upload className="h-6 w-6 sm:h-5 sm:w-5" />
                </button>
              )}

              <div ref={libraryRef} className="relative">
                <button
                  onClick={(e) => {
                    toggleLibrary()
                    e.currentTarget.blur()
                  }}
                  className={cn(
                    'rounded-xl p-2.5 text-[var(--nm-text)]',
                    showLibrary ? 'nm-pressed' : 'nm-raised',
                  )}
                  aria-label={copy.libraryButton}
                >
                  {isLoadingLibrary
                    ? (
                        <Loader2 className="h-6 w-6 animate-spin sm:h-5 sm:w-5" />
                      )
                    : (
                        <Library className="h-6 w-6 sm:h-5 sm:w-5" />
                      )}
                </button>

                <LibraryPanel
                  show={showLibrary}
                  isMobile={isMobile}
                  reduceMotion={reduceMotion}
                  language={language}
                  copy={copy}
                  library={library}
                  libraryPrimaryGroups={libraryPrimaryGroups}
                  activeLibraryGroup={activeLibraryGroup}
                  activeLibraryCategory={activeLibraryCategory}
                  activeLibraryCategoryId={activeLibraryCategoryId}
                  activeLibraryCategoryShortLabel={activeLibraryCategoryMeta.shortLabel}
                  activeLibraryHeading={activeLibraryHeading}
                  activeLibraryDescription={activeLibraryDescription}
                  ActiveLibraryGroupIcon={ActiveLibraryGroupIcon}
                  ActiveLibraryCategoryIcon={ActiveLibraryCategoryIcon}
                  activeTrainSubcategories={activeTrainSubcategories}
                  getSubcategoryMeta={(categoryId: string) => getLibraryCategoryMeta(categoryId, language)}
                  visibleLibraryItems={visibleLibraryItems}
                  currentLibraryTrackId={currentLibraryTrackId}
                  isLoadingLibrary={isLoadingLibrary}
                  listRef={libraryListRef}
                  onSelectCategory={setActiveLibraryCategoryId}
                  onSelectTrack={loadLibraryMidi}
                  onClose={closeLibrary}
                />
              </div>

              <button
                onClick={(e) => {
                  setShowInfo(true)

                  setShowSettings(false)
                  closeLibrary()
                  e.currentTarget.blur()
                }}
                className={cn(
                  'rounded-xl p-2.5 text-[var(--nm-text)]',
                  showInfo ? 'nm-pressed' : 'nm-raised',
                )}
                aria-label={copy.infoButton}
              >
                <Info className="h-6 w-6 sm:h-5 sm:w-5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  ref={settingsTriggerRef}
                  onClick={(e) => {
                    setShowSettings(current =>
                      current && isExportActive ? current : !current,
                    )
                    setShowInfo(false)
                    closeLibrary()
                    e.currentTarget.blur()
                  }}
                  className={cn(
                    'rounded-xl p-2.5 text-[var(--nm-text)]',
                    showSettings ? 'nm-pressed' : 'nm-raised',
                  )}
                  aria-label={copy.closeSettings}
                >
                  <SettingsIcon className="h-6 w-6 sm:h-5 sm:w-5" />
                </button>
              </div>

              {isMobile && (
                <button
                  onClick={(e) => {
                    e.currentTarget.blur()
                    cycleCameraView()
                  }}
                  className="nm-raised rounded-xl p-2.5 text-[var(--nm-text)]"
                  aria-label={cameraViewLabels[settings.cameraView]}
                >
                  <Camera className="h-6 w-6 sm:h-5 sm:w-5" />
                </button>
              )}
            </div>

            <AnimatePresence>
              {showSettings && (
                <SettingsPanel
                  panelRef={settingsRef}
                  language={language}
                  copy={{
                    settings: copy.settings,
                    tabSound: copy.tabSound,
                    tabScene: copy.tabScene,
                    tabExport: copy.tabExport,
                    tabGeneral: copy.tabGeneral,
                    instrument: copy.instrument,
                    volume: copy.volume,
                    cameraView: copy.cameraView,
                    cameraAutoCycle: copy.cameraAutoCycle,
                    midiRoll: copy.midiRoll,
                    bottomTrackMeta: copy.bottomTrackMeta,
                    fullScreen: copy.fullScreen,
                    language: copy.language,
                    resetDefaults: copy.resetDefaults,
                    on: copy.show,
                    off: copy.hide,
                  }}
                  isMobile={isMobile}
                  isFullscreen={isFullscreen}
                  onClose={() => {
                    if (!isExportActive) {
                      setShowSettings(false)
                    }
                  }}
                  onToggleFullscreen={toggleFullscreen}
                  instrumentId={settings.instrumentId}
                  onInstrumentChange={id => updateSetting('instrumentId', id)}
                  bpm={bpm}
                  onBpmChange={setBpm}
                  volumePercent={settings.volumePercent}
                  onVolumeChange={value => updateSetting('volumePercent', value)}
                  showMidiRoll={settings.showMidiRoll}
                  onToggleMidiRoll={() =>
                    updateSetting('showMidiRoll', !settings.showMidiRoll)}
                  showBottomTrackMeta={settings.showBottomTrackMeta}
                  onToggleBottomTrackMeta={() =>
                    updateSetting(
                      'showBottomTrackMeta',
                      !settings.showBottomTrackMeta,
                    )}
                  cameraView={settings.cameraView}
                  cameraViews={CAMERA_VIEWS}
                  cameraViewLabels={cameraViewLabels}
                  onCameraViewChange={view => updateSetting('cameraView', view)}
                  autoCycleCamera={settings.autoCycleCamera}
                  onToggleAutoCycle={() =>
                    updateSetting('autoCycleCamera', !settings.autoCycleCamera)}
                  languageOptions={LANGUAGE_OPTIONS}
                  onLanguageChange={value =>
                    startTransition(() => {
                      setLanguage(value)
                    })}
                  onReset={resetSettings}
                  showExportTab={isVideoExportClientEnabled}
                  renderVideoExport={
                    isVideoExportClientEnabled
                      ? visible => (
                        <VideoExportDevTools
                          visible={visible}
                          cameraPresets={cameraDraftPresets}
                          copy={{
                            exportButton: copy.exportButton,
                            exportCameraCurrent: copy.exportCameraCurrent,
                            exportCameraCycle: copy.exportCameraCycle,
                            exportCameraMode: copy.exportCameraMode,
                            exportFormat: copy.exportFormat,
                            videoExport: copy.videoExport,
                          }}
                          currentCameraView={settings.cameraView}
                          currentTrackTitle={currentTrackTitle}
                          displayTrackSubtitle={displayTrackMeta.subtitle}
                          displayTrackTitle={displayTrackMeta.title}
                          exportCameraMode={exportCameraMode}
                          exportFormat={exportFormat}
                          exportSource={{
                            notes,
                            pedalEvents,
                            playbackGain,
                          }}
                          exportSourceFileName={currentTrackFileName}
                          exportTrackMeta={{
                            enabled: settings.showBottomTrackMeta,
                            subtitle: displayTrackMeta.subtitle,
                            title: displayTrackMeta.title,
                          }}
                          instrumentId={settings.instrumentId}
                          isAudioLoading={isAudioLoading}
                          isPlaying={isPlaying}
                          language={language}
                          onExportActiveChange={setIsExportActive}
                          onExportCameraModeChange={setExportCameraMode}
                          onExportFormatChange={setExportFormat}
                          onShowBottomTrackMetaChange={showBottomTrackMeta =>
                            setSettings(current => ({
                              ...current,
                              showBottomTrackMeta,
                            }))}
                          showBottomTrackMeta={settings.showBottomTrackMeta}
                          togglePlay={togglePlay}
                          volumePercent={settings.volumePercent}
                        />
                      )
                      : undefined
                  }
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        <InfoModal
          show={showInfo}
          language={language}
          copy={copy}
          displayBrandName={displayBrandName}
          keyboardShortcuts={keyboardShortcuts}
          isMobile={isMobile}
          reduceMotion={reduceMotion}
          panelRef={infoRef}
          onClose={() => setShowInfo(false)}
        />

        {showCameraLab && (
          <div ref={cameraLabRef}>
            <CameraLab
              activeView={activeCameraView}
              draftPose={activeCameraDraft}
              isDirty={isActiveCameraDirty}
              language={language}
              onClose={() => setShowCameraLab(false)}
              onPoseChange={pose => updateCameraDraft(activeCameraView, pose)}
              onResetToDefault={resetActiveCameraView}
              onRevert={revertActiveCameraView}
              onSave={saveActiveCameraView}
              onSelectView={view => updateSetting('cameraView', view)}
            />
          </div>
        )}

        <div
          className={cn(
            bottomChromeClass,
            chromeVisible ? 'pointer-events-auto' : 'pointer-events-none',
            'bottom-28 flex w-full max-w-xl flex-col gap-2 px-4',
          )}
          inert={!chromeVisible}
          style={timelineChromeStyle}
        >
          <PlaybackTimeline
            duration={duration}
            getPlaybackTime={getPlaybackTime}
            onSeek={seek}
          />
        </div>

        <div
          className={cn(bottomChromeClass, 'pointer-events-none bottom-10')}
          inert={!chromeVisible}
          style={playChromeStyle}
        >
          <button
            onClick={(e) => {
              handlePlaybackToggle()
              e.currentTarget.blur()
            }}
            disabled={playbackButtonBusy}
            aria-label={playbackButtonLabel}
            className="nm-play pointer-events-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-[var(--nm-text)] disabled:opacity-50"
          >
            {playbackButtonIcon}
          </button>
        </div>

        {(displayTrackMeta.title || displayTrackMeta.subtitle) && (
          <div
            className={cn(
              'pointer-events-none absolute left-1/2 z-10 w-full max-w-[min(42rem,calc(100%-2rem))] -translate-x-1/2 px-4 text-center',
              isMenuReady && 'transition-opacity duration-700 ease-out',
              bottomTrackMetaVisible ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden={!bottomTrackMetaVisible}
            style={bottomTrackMetaStyle}
          >
            <div
              className={cn(
                'transition-opacity duration-150 ease-out motion-reduce:transition-none',
                isTrackMetaVisible ? 'opacity-100' : 'opacity-0',
              )}
            >
              {displayTrackMeta.title && (
                <div className="text-sm font-medium whitespace-normal break-words leading-tight tracking-[0.08em] text-[var(--nm-text)] sm:text-base">
                  {displayTrackMeta.title}
                </div>
              )}
              {displayTrackMeta.subtitle && (
                <div className="mt-1 type-overline whitespace-normal break-words leading-tight text-[var(--nm-text-faint)] sm:text-xs">
                  {displayTrackMeta.subtitle}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="h-full w-full">
          <Visualizer
            cameraPresets={cameraDraftPresets}
            isMobileView={isMobile}
            isCameraEditing={showCameraLab}
            notes={shouldHoldInitialVisualizerNotes ? [] : notes}
            onCameraPoseChange={handleVisualizerCameraPoseChange}
            settings={settings}
            audioLevelRef={audioLevelRef}
          />
        </div>

        <Toast toast={toast} />

        <NoteCursor />

        {showFullscreenHint && !isMobile && (
          <div className="pointer-events-none fixed inset-0 z-[75] flex items-center justify-center">
            <div className="nm-fullscreen-hint rounded-2xl border border-white/10 bg-black/60 px-8 py-5 text-lg font-medium tracking-wide text-white/80 shadow-lg backdrop-blur-md">
              {copy.fullScreenHint}
            </div>
          </div>
        )}
      </LazyMotion>
    </main>
  )
}
