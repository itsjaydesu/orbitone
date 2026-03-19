'use client'
import type { LucideIcon } from 'lucide-react'
import type { ReactElement, SVGProps } from 'react'
import type { VisualizerSettings } from '@/components/Visualizer'
import type {
  AppLanguage,
  CameraPose,
  CameraPresetMap,
  CameraView,
} from '@/lib/camera-presets'
import type { ExportCameraMode, ExportFormat } from '@/lib/export'
import type {
  MidiLibraryCategory,
  MidiLibraryItem,
} from '@/lib/library'
import {
  BellRing,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Disc3,
  Expand,
  ExternalLink,
  Feather,
  Gamepad2,
  Info,
  Library,
  Loader2,

  Map as MapIcon,
  Minimize,
  Music,
  Piano,
  Play,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
  TrainFront,
  Upload,
  X,
} from 'lucide-react'
import Image from 'next/image'
import {

  startTransition,

  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CameraLab } from '@/components/CameraLab'
import { ExportOverlay } from '@/components/ExportOverlay'
import { NoteCursor } from '@/components/NoteCursor'
import { Visualizer } from '@/components/Visualizer'
import { useIsMobile } from '@/hooks/use-mobile'
import { useMusic } from '@/hooks/useMusic'
import { useVideoExport } from '@/hooks/useVideoExport'
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
import {
  MIDI_LIBRARY,
  MIDI_LIBRARY_CATEGORIES,
} from '@/lib/library'
import {
  getLocalizedTrackSubtitle,
  getLocalizedTrackTitle,
} from '@/lib/library-translations'
import { cn } from '@/lib/utils'

type AppSettings = VisualizerSettings & {
  showBottomTrackMeta: boolean
  volumePercent: number
}

interface DisplayTrackMeta {
  title: string | null
  subtitle: string | null
}

interface OrbitoneAutomationState {
  canExport: boolean
  currentTrackTitle: string | null
  exportCameraMode: ExportCameraMode
  exportFormat: ExportFormat
  exportPhase: string
  exportProgress: number
  isAudioLoading: boolean
}

declare global {
  interface Window {
    __orbitoneAutomation?: {
      getState: () => OrbitoneAutomationState
      setExportOptions: (options: {
        cameraMode?: ExportCameraMode
        format?: ExportFormat
      }) => void
      startExport: () => void
    }
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  showBottomTrackMeta: false,
  volumePercent: 100,
  showMidiRoll: false,
  cameraView: 'default',
}
const DEFAULT_EXPORT_FORMAT: ExportFormat = 'mp4'
const DEFAULT_EXPORT_CAMERA_MODE: ExportCameraMode = 'cycle'

const MENU_REVEAL_DELAY_MS = 3000
const MENU_IDLE_HIDE_MS = 3000
const TEXT_FADE_SWAP_DELAY_MS = 140
const TEXT_FADE_REVEAL_DELAY_MS = 34
const MIDI_EXTENSIONS = ['.mid', '.midi']
const DEFAULT_LIBRARY_CATEGORY_ID = MIDI_LIBRARY_CATEGORIES[0]?.id ?? ''
const LIBRARY_CATEGORY_INDEX = new Map(
  MIDI_LIBRARY_CATEGORIES.map(category => [category.id, category]),
)
const LIBRARY_TRACK_INDEX = new Map(
  MIDI_LIBRARY_CATEGORIES.flatMap(category =>
    category.items.map(item => [item.id, item] as const),
  ),
)

interface LibraryCategoryMeta {
  blurb: string
  icon: LucideIcon
  label: string
  shortLabel: string
}

interface LibraryPrimaryGroup {
  blurb: string
  categoryIds: string[]
  defaultCategoryId: string
  icon: LucideIcon
  id: string
  label: string
  shortLabel: string
}

const TRAIN_LIBRARY_CATEGORY_IDS = [
  'train-signature-system',
  'train-stations',
  'train-standard-chimes',
] as const

interface ShortcutItem {
  keyLabel: string
  description: string
}

interface CreatorLink {
  href: string
  icon: (props: SVGProps<SVGSVGElement>) => ReactElement
  label: string
  subtitle: string
}

interface UiCopy {
  aboutTitle: string
  bottomTrackMeta: string
  cameraView: string
  closeAbout: string
  closeLibrary: string
  closeSettings: string
  creatorTitle: string
  fullScreen: string
  fullScreenExit: string
  fullScreenHint: string
  infoButton: string
  keyboardShortcutsTitle: string
  language: string
  languageButton: string
  libraryButton: string
  libraryDefaultHeading: string
  libraryDescription: string
  libraryLoadError: string
  libraryTabList: string
  libraryTitle: string
  loaded: string
  loadingPiano: string
  midiRoll: string
  nextTrack: string
  noTracksDescription: string
  noTracksTitle: (label: string) => string
  previousTrack: string

  resetDefaults: string
  settings: string
  show: string
  hide: string
  restartPlayback: string
  startPlayback: string
  stopPlayback: string

  trainSubcategories: string
  upload: string
  videoExport: string
  exportFormat: string
  exportCameraMode: string
  exportCameraCurrent: string
  exportCameraCycle: string
  exportButton: string
  volume: string
}

const FEATURED_LIBRARY_ORDER = new Map([
  ['games-internet/theme-song-to-2008', 0],
])

const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: AppLanguage
  label: string
}> = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

function getBrandName(language: AppLanguage) {
  return language === 'ja' ? 'オービトーン' : 'orbitone'
}

function GitHubMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 1.25a10.75 10.75 0 0 0-3.4 20.95c.54.1.73-.23.73-.52 0-.25-.01-1.09-.02-1.97-2.96.64-3.58-1.26-3.58-1.26-.48-1.22-1.18-1.55-1.18-1.55-.97-.66.07-.65.07-.65 1.07.08 1.64 1.1 1.64 1.1.96 1.63 2.5 1.16 3.12.89.1-.69.37-1.16.68-1.43-2.37-.27-4.86-1.18-4.86-5.27 0-1.16.41-2.1 1.09-2.84-.11-.27-.47-1.37.1-2.84 0 0 .89-.29 2.91 1.09a10.06 10.06 0 0 1 5.3 0c2.01-1.38 2.9-1.09 2.9-1.09.58 1.47.22 2.57.11 2.84.68.74 1.09 1.68 1.09 2.84 0 4.1-2.5 4.99-4.88 5.25.38.33.72.97.72 1.95 0 1.41-.01 2.55-.01 2.89 0 .29.19.63.74.52A10.75 10.75 0 0 0 12 1.25Z" />
    </svg>
  )
}

function XMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.9 2.25h2.93l-6.4 7.33 7.52 12.17h-5.89l-4.62-7.4-6.45 7.4H3.06l6.85-7.86L2.7 2.25h6.04l4.18 6.74 5.98-6.74Zm-1.03 17.74h1.63L7.86 3.91H6.12l11.75 16.08Z" />
    </svg>
  )
}

const KEYBOARD_SHORTCUTS: Record<AppLanguage, ShortcutItem[]> = {
  en: [
    { keyLabel: 'Space', description: 'Play / Stop' },
    { keyLabel: 'C', description: 'Cycle camera angles' },
    { keyLabel: 'M', description: 'Toggle the MIDI roll' },
    { keyLabel: 'L', description: 'Open the MIDI library' },
    { keyLabel: 'U', description: 'Upload a MIDI file' },
    { keyLabel: 'S', description: 'Toggle settings' },
    { keyLabel: 'F', description: 'Toggle fullscreen' },
    { keyLabel: 'I', description: 'Open the about panel' },
    { keyLabel: 'Esc', description: 'Close any open panel' },
  ],
  ja: [
    { keyLabel: 'Space', description: '再生 / 停止' },
    { keyLabel: 'C', description: 'カメラアングルを切り替え' },
    { keyLabel: 'M', description: 'MIDIロールを表示 / 非表示' },
    { keyLabel: 'L', description: 'MIDIライブラリを開く' },
    { keyLabel: 'U', description: 'MIDIファイルをアップロード' },
    { keyLabel: 'S', description: '設定パネルを開閉' },
    { keyLabel: 'F', description: 'フルスクリーンを切り替え' },
    { keyLabel: 'I', description: '概要パネルを開く' },
    { keyLabel: 'Esc', description: '開いているパネルを閉じる' },
  ],
}

const CREATOR_LINKS: Record<AppLanguage, CreatorLink[]> = {
  en: [
    {
      href: 'https://github.com/itsjaydesu',
      icon: GitHubMark,
      label: 'GitHub',
      subtitle: 'Code and repositories',
    },
    {
      href: 'https://x.com/itsjaydesu',
      icon: XMark,
      label: 'X',
      subtitle: 'Updates and stray thoughts',
    },
  ],
  ja: [
    {
      href: 'https://github.com/itsjaydesu',
      icon: GitHubMark,
      label: 'GitHub',
      subtitle: 'コードとリポジトリ',
    },
    {
      href: 'https://x.com/itsjaydesu',
      icon: XMark,
      label: 'X',
      subtitle: '更新と雑談',
    },
  ],
}

const UI_COPY: Record<AppLanguage, UiCopy> = {
  en: {
    aboutTitle: 'About',
    bottomTrackMeta: 'Bottom Track Credits',
    cameraView: 'Camera View',
    closeAbout: 'Close about panel',
    closeLibrary: 'Close MIDI library',
    closeSettings: 'Settings',
    creatorTitle: 'itsjaydesu',
    fullScreen: 'Fullscreen',
    fullScreenExit: 'Exit fullscreen',
    fullScreenHint: 'Press F to enter & exit fullscreen',
    infoButton: 'Open about panel',
    keyboardShortcutsTitle: 'Keyboard shortcuts',
    language: 'Language',
    languageButton: 'Change language',
    libraryButton: 'MIDI library',
    libraryDefaultHeading: 'MIDI Library',
    libraryDescription:
      'Browse the built-in collections. Japanese train melodies open a second row for stations, standards, and signature themes.',
    libraryLoadError: 'Failed to load MIDI file from the library.',
    libraryTabList: 'Library collections',
    libraryTitle: 'MIDI Library',
    loaded: 'Loaded',
    loadingPiano: 'Loading piano',
    midiRoll: 'MIDI Roll',
    nextTrack: 'Next track',
    noTracksDescription: 'Switch tabs and try another collection.',
    noTracksTitle: label => `No tracks in ${label} yet`,
    previousTrack: 'Previous track',
    resetDefaults: 'Reset to Default',
    settings: 'Settings',
    show: 'On',
    hide: 'Off',
    restartPlayback: 'Restart playback',
    startPlayback: 'Start playback',
    stopPlayback: 'Stop playback',
    trainSubcategories: 'Japanese train melody subsets',
    upload: 'Upload MIDI',
    videoExport: 'Video Export',
    exportFormat: 'Format',
    exportCameraMode: 'Camera',
    exportCameraCurrent: 'Current',
    exportCameraCycle: 'Cycle 10s',
    exportButton: 'Export Video',
    volume: 'Volume',
  },
  ja: {
    aboutTitle: 'オービトーンについて',
    bottomTrackMeta: '下部の曲情報',
    cameraView: 'カメラアングル',
    closeAbout: '概要を閉じる',
    closeLibrary: 'MIDIライブラリを閉じる',
    closeSettings: '設定',
    creatorTitle: 'itsjaydesu',
    fullScreen: 'フルスクリーン',
    fullScreenExit: 'フルスクリーンを終了',
    fullScreenHint: 'Fキーでフルスクリーンの切り替え',
    infoButton: '概要を開く',
    keyboardShortcutsTitle: 'キーボードショートカット',
    language: '言語',
    languageButton: '言語を変更',
    libraryButton: 'MIDIライブラリ',
    libraryDefaultHeading: 'MIDIライブラリ',
    libraryDescription:
      'コレクションごとに曲を切り替えられます。日本の発車メロディでは、駅別・定番チャイム・シグネチャー曲のサブタブも使えます。',
    libraryLoadError: 'ライブラリのMIDIファイルを読み込めませんでした。',
    libraryTabList: 'ライブラリのコレクション',
    libraryTitle: 'MIDIライブラリ',
    loaded: '読み込み済み',
    loadingPiano: 'ピアノ音源を読み込み中',
    midiRoll: 'MIDIロール',
    nextTrack: '次の曲',
    noTracksDescription:
      '別のコレクションに切り替えて、ほかのMIDIを試してみてください。',
    noTracksTitle: label => `${label}の曲はまだありません`,
    previousTrack: '前の曲',
    resetDefaults: '初期設定に戻す',
    settings: '設定',
    show: '表示',
    hide: '非表示',
    restartPlayback: '最初から再生',
    startPlayback: '再生を開始',
    stopPlayback: '再生を停止',
    trainSubcategories: '日本の発車メロディのサブカテゴリ',
    upload: 'MIDIをアップロード',
    videoExport: '動画エクスポート',
    exportFormat: 'フォーマット',
    exportCameraMode: 'カメラ',
    exportCameraCurrent: '現在のカメラ',
    exportCameraCycle: '10秒サイクル',
    exportButton: '動画をエクスポート',
    volume: '音量',
  },
}

function getLibraryCategoryMeta(categoryId: string, language: AppLanguage): LibraryCategoryMeta {
  switch (categoryId) {
    case 'originals':
      return language === 'ja'
        ? {
            blurb: 'コミュニティから寄せられたオリジナル楽曲です。',
            icon: Feather,
            label: 'オリジナル',
            shortLabel: 'オリジナル',
          }
        : {
            blurb: 'Original compositions from the community.',
            icon: Feather,
            label: 'Originals',
            shortLabel: 'Originals',
          }
    case 'classical-piano':
      return language === 'ja'
        ? {
            blurb:
              '夜想曲や協奏曲など、ピアノの表情がよく映えるクラシック作品を集めました。',
            icon: Piano,
            label: 'クラシック / ピアノ',
            shortLabel: 'クラシック',
          }
        : {
            blurb: 'Concert works, nocturnes, and expressive piano repertoire.',
            icon: Piano,
            label: 'Classical & Piano',
            shortLabel: 'Classical',
          }
    case 'film-tv-anime':
      return language === 'ja'
        ? {
            blurb:
              '映画音楽、アニメ主題歌、印象的なテレビテーマを横断する映像音楽のコレクションです。',
            icon: Clapperboard,
            label: '映画 / テレビ / アニメ',
            shortLabel: '映像',
          }
        : {
            blurb: 'Big-screen themes, anime openings, and prestige TV motifs.',
            icon: Clapperboard,
            label: 'Film, TV & Anime',
            shortLabel: 'Screen',
          }
    case 'games-internet':
      return language === 'ja'
        ? {
            blurb:
              'ゲームの名曲やインターネットの記憶に残るメロディを、少しノスタルジックな温度感で。',
            icon: Gamepad2,
            label: 'ゲーム / インターネット',
            shortLabel: 'ゲーム',
          }
        : {
            blurb:
              'Game scores, online relics, and endlessly replayable hooks.',
            icon: Gamepad2,
            label: 'Games & Internet',
            shortLabel: 'Games',
          }
    case 'pop-electronic':
      return language === 'ja'
        ? {
            blurb:
              'ポップスの定番やエレクトロのきらめきを、ピアノで気持ちよく聴ける曲たちです。',
            icon: Disc3,
            label: 'ポップ / エレクトロ',
            shortLabel: 'ポップ',
          }
        : {
            blurb: 'Anthems, club textures, and bright electronic melodies.',
            icon: Disc3,
            label: 'Pop & Electronic',
            shortLabel: 'Pop',
          }
    case 'train-stations':
      return language === 'ja'
        ? {
            blurb:
              '駅ごとの発車メロディやご当地色のあるチャイムを中心に集めています。',
            icon: TrainFront,
            label: '駅別メロディ',
            shortLabel: '駅別',
          }
        : {
            blurb:
              'Station-specific Japanese departure melodies and local favorites.',
            icon: TrainFront,
            label: 'Station Melodies',
            shortLabel: 'Stations',
          }
    case 'train-standard-chimes':
      return language === 'ja'
        ? {
            blurb:
              'JRの定番チャイムや広く使われる標準メロディをまとめたセットです。',
            icon: BellRing,
            label: '定番チャイム',
            shortLabel: '定番',
          }
        : {
            blurb:
              'Classic JR standards, shared chimes, and core platform signals.',
            icon: BellRing,
            label: 'Standard Chimes',
            shortLabel: 'Chimes',
          }
    case 'train-signature-system':
      return language === 'ja'
        ? {
            blurb:
              '路線固有のメロディや有名な発車サウンド、印象に残るシグネチャー曲を揃えました。',
            icon: MapIcon,
            label: 'シグネチャー曲',
            shortLabel: '特色',
          }
        : {
            blurb:
              'Named rail melodies, medleys, and signature network themes.',
            icon: MapIcon,
            label: 'Signature Themes',
            shortLabel: 'Signature',
          }
    default:
      return language === 'ja'
        ? {
            blurb: 'Orbitoneのために選んだMIDIコレクションです。',
            icon: Music,
            label: 'MIDIライブラリ',
            shortLabel: 'ライブラリ',
          }
        : {
            blurb: 'Curated MIDI selections from the Orbitone library.',
            icon: Music,
            label: 'MIDI Library',
            shortLabel: 'Library',
          }
  }
}

function getLibraryPrimaryGroups(language: AppLanguage): LibraryPrimaryGroup[] {
  return [
    {
      id: 'originals',
      label: language === 'ja' ? 'オリジナル' : 'Originals',
      shortLabel: language === 'ja' ? 'オリジナル' : 'Originals',
      icon: Feather,
      blurb:
      language === 'ja'
        ? 'コミュニティから寄せられたオリジナル楽曲です。'
        : 'Original compositions from the community.',
      categoryIds: ['originals'],
      defaultCategoryId: 'originals',
    },
    {
      id: 'classical-piano',
      label: language === 'ja' ? 'クラシック / ピアノ' : 'Classical & Piano',
      shortLabel: language === 'ja' ? 'クラシック' : 'Classical',
      icon: Piano,
      blurb:
      language === 'ja'
        ? '夜想曲や協奏曲など、ピアノの響きが美しく映えるクラシック作品をまとめています。'
        : 'Concert works, nocturnes, and expressive piano repertoire.',
      categoryIds: ['classical-piano'],
      defaultCategoryId: 'classical-piano',
    },
    {
      id: 'film-tv-anime',
      label: language === 'ja' ? '映画 / テレビ / アニメ' : 'Film, TV & Anime',
      shortLabel: language === 'ja' ? '映像' : 'Screen',
      icon: Clapperboard,
      blurb:
      language === 'ja'
        ? '映画音楽、アニメ主題歌、ドラマや番組テーマまで、映像の記憶に残る曲たちです。'
        : 'Big-screen themes, anime openings, and prestige TV motifs.',
      categoryIds: ['film-tv-anime'],
      defaultCategoryId: 'film-tv-anime',
    },
    {
      id: 'games-internet',
      label: language === 'ja' ? 'ゲーム / インターネット' : 'Games & Internet',
      shortLabel: language === 'ja' ? 'ゲーム' : 'Games',
      icon: Gamepad2,
      blurb:
      language === 'ja'
        ? 'ゲームの名曲やネット文化の懐かしいメロディを、耳に残る順に並べたくなる棚です。'
        : 'Game scores, online relics, and endlessly replayable hooks.',
      categoryIds: ['games-internet'],
      defaultCategoryId: 'games-internet',
    },
    {
      id: 'pop-electronic',
      label: language === 'ja' ? 'ポップ / エレクトロ' : 'Pop & Electronic',
      shortLabel: language === 'ja' ? 'ポップ' : 'Pop',
      icon: Disc3,
      blurb:
      language === 'ja'
        ? 'ポップスの定番から電子音のきらめきまで、軽やかに聴けるメロディを集めています。'
        : 'Anthems, club textures, and bright electronic melodies.',
      categoryIds: ['pop-electronic'],
      defaultCategoryId: 'pop-electronic',
    },
    {
      id: 'japanese-train-melodies',
      label: language === 'ja' ? '日本の発車メロディ' : 'Japanese Train Melodies',
      shortLabel: language === 'ja' ? '鉄道' : 'Trains',
      icon: TrainFront,
      blurb:
      language === 'ja'
        ? '駅別の発車メロディ、JRの定番チャイム、路線のシグネチャー曲まで、日本の鉄道音を横断できます。'
        : 'Station jingles, JR standards, and signature departure themes from across Japan\'s rail network.',
      categoryIds: [...TRAIN_LIBRARY_CATEGORY_IDS],
      defaultCategoryId: 'train-stations',
    },
  ]
}

function stripMidiExtension(fileName: string) {
  return fileName.replace(/\.(mid|midi)$/i, '')
}

function getRandomLibraryTrack(): MidiLibraryItem | null {
  if (MIDI_LIBRARY.length === 0) {
    return null
  }

  const randomIndex = Math.floor(Math.random() * MIDI_LIBRARY.length)
  return MIDI_LIBRARY[randomIndex] ?? null
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
  // Keep primary controls accessible on touch devices instead of hiding on idle.
  const shouldPersistChrome = isMobile
  const [isAutomationMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return new URLSearchParams(window.location.search).has('automation')
  })
  const [language, setLanguage] = useState<AppLanguage>(() => {
    if (typeof window !== 'undefined' && navigator.language.startsWith('ja')) {
      return 'ja'
    }
    return 'en'
  })
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
  const [activeLibraryCategoryId, setActiveLibraryCategoryId] = useState(
    DEFAULT_LIBRARY_CATEGORY_ID,
  )
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string | null>(
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
  const [initialLibraryTrack] = useState<MidiLibraryItem | null>(() =>
    getRandomLibraryTrack(),
  )

  const [exportFormat, setExportFormat] = useState<ExportFormat>(DEFAULT_EXPORT_FORMAT)
  const [exportCameraMode, setExportCameraMode] = useState<ExportCameraMode>(
    DEFAULT_EXPORT_CAMERA_MODE,
  )

  const {
    isPlaying,
    isAudioLoading,
    currentTime,
    hasEnded,
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
  } = useMusic({
    language,
    volumePercent: settings.volumePercent,
  })

  const {
    phase: exportPhase,
    progress: exportProgress,
    renderState: exportRenderState,
    startExport,
    cancelExport,
    setExportCanvas,
    setExportFrameController,
  } = useVideoExport({
    exportSource: {
      notes,
      pedalEvents,
      playbackGain,
    },
    isPlaying,
    togglePlay,
    volumePercent: settings.volumePercent,
  })

  const isExporting = exportPhase !== 'idle'

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
  const creatorLinks = CREATOR_LINKS[language]

  const activeLibraryCategory = useMemo<MidiLibraryCategory | null>(
    () =>
      LIBRARY_CATEGORY_INDEX.get(activeLibraryCategoryId)
      ?? MIDI_LIBRARY_CATEGORIES[0]
      ?? null,
    [activeLibraryCategoryId],
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
      (activeLibraryGroup?.categoryIds.length ?? 0) > 1
        ? (activeLibraryGroup?.categoryIds
            .map(categoryId => LIBRARY_CATEGORY_INDEX.get(categoryId))
            .filter((category): category is MidiLibraryCategory =>
              Boolean(category),
            ) ?? [])
        : [],
    [activeLibraryGroup],
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
      currentLibraryTrackId
        ? (LIBRARY_TRACK_INDEX.get(currentLibraryTrackId) ?? null)
        : null,
    [currentLibraryTrackId],
  )
  const localizedTrackTitle = currentLibraryTrack
    ? getLocalizedTrackTitle(currentLibraryTrack, language)
    : currentTrackTitle
  const localizedTrackSubtitle = getLocalizedTrackSubtitle(
    currentLibraryTrack?.subtitle ?? null,
    language,
  )
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
      setShowSettings(false)
      setShowCameraLab(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [showCameraLab, showInfo, showLibrary, showSettings])

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
        return false
      }

      setCurrentTrackTitle(
        options?.title ?? formatLoadedTitle(file.name, language),
      )
      setCurrentLibraryTrackId(options?.libraryTrackId ?? null)

      return true
    },
    [language, loadMidi],
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
    catch (error) {
      alert(copy.libraryLoadError)
    }
    finally {
      setIsLoadingLibrary(false)
    }
  }, [closeLibrary, copy.libraryLoadError, fetchLibraryMidiFile, loadMidiFile])

  const loadAdjacentTrack = useCallback((direction: -1 | 1) => {
    if (isLoadingLibrary)
      return
    const currentIndex = currentLibraryTrackId
      ? MIDI_LIBRARY.findIndex(item => item.id === currentLibraryTrackId)
      : -1
    const nextIndex
      = currentIndex === -1
        ? 0
        : (currentIndex + direction + MIDI_LIBRARY.length)
          % MIDI_LIBRARY.length
    const nextItem = MIDI_LIBRARY[nextIndex]
    if (nextItem) {
      loadLibraryMidi(nextItem)
    }
  }, [currentLibraryTrackId, isLoadingLibrary, loadLibraryMidi])

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
    }, MENU_IDLE_HIDE_MS)
  }, [clearIdleTimer, shouldPersistChrome])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
          togglePlay()
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
        case 's':
          e.preventDefault()
          setShowSettings(v => !v)
          setShowInfo(false)

          closeLibrary()
          break
        case 'c':
          e.preventDefault()
          setSettings((s) => {
            const idx = CAMERA_VIEWS.indexOf(s.cameraView)
            return {
              ...s,
              cameraView: CAMERA_VIEWS[(idx + 1) % CAMERA_VIEWS.length],
            }
          })
          break
        case 'i':
          e.preventDefault()
          setShowInfo(v => !v)

          setShowSettings(false)
          closeLibrary()
          break
        case 'l':
          e.preventDefault()
          toggleLibrary()
          break
        case 'u':
          e.preventDefault()
          fileInputRef.current?.click()
          break
        case 'm':
          e.preventDefault()
          setSettings(s => ({ ...s, showMidiRoll: !s.showMidiRoll }))
          break
        case 'arrowleft':
          e.preventDefault()
          loadAdjacentTrack(-1)
          break
        case 'arrowright':
          e.preventDefault()
          loadAdjacentTrack(1)
          break
        case 'escape':
          setShowSettings(false)
          setShowInfo(false)

          closeLibrary()
          setShowCameraLab(false)
          break
      }

      if (e.defaultPrevented) {
        setIsMenuVisible(true)
        scheduleIdleHide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeLibrary, loadAdjacentTrack, scheduleIdleHide, toggleFullscreen, toggleLibrary, togglePlay])

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

    setIsMenuReady(false)
    setIsMenuVisible(false)

    const revealTimer = window.setTimeout(() => {
      setIsMenuReady(true)
      setIsMenuVisible(true)
      scheduleIdleHide()
    }, MENU_REVEAL_DELAY_MS)

    return () => {
      window.clearTimeout(revealTimer)
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

    window.addEventListener('pointermove', handlePointerActivity, {
      passive: true,
    })
    window.addEventListener('pointerdown', handlePointerActivity)

    return () => {
      window.removeEventListener('pointermove', handlePointerActivity)
      window.removeEventListener('pointerdown', handlePointerActivity)
    }
  }, [
    isMenuReady,
    scheduleIdleHide,
    shouldPersistChrome,
    showCameraLab,
    showInfo,
    showLibrary,
    showSettings,
  ])

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number.parseFloat(e.target.value)
    seek(time)
  }

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) {
      return '0:00'
    }

    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

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
      catch (error) {
        void error
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

  const handleStartExport = useCallback(() => {
    setShowSettings(false)
    startExport(exportFormat, exportCameraMode, settings.cameraView)
  }, [exportFormat, exportCameraMode, settings.cameraView, startExport])

  useEffect(() => {
    window.__orbitoneAutomation = {
      getState: () => ({
        canExport: notes.length > 0 && !isExporting,
        currentTrackTitle,
        exportCameraMode,
        exportFormat,
        exportPhase,
        exportProgress,
        isAudioLoading,
      }),
      setExportOptions: ({ cameraMode, format }) => {
        if (format) {
          setExportFormat(format)
        }

        if (cameraMode) {
          setExportCameraMode(cameraMode)
        }
      },
      startExport: () => {
        handleStartExport()
      },
    }

    return () => {
      delete window.__orbitoneAutomation
    }
  }, [
    currentTrackTitle,
    exportCameraMode,
    exportFormat,
    exportPhase,
    exportProgress,
    handleStartExport,
    isAudioLoading,
    isExporting,
    notes.length,
  ])

  const exportVisualizerSettings = useMemo(() => ({
    showMidiRoll: true,
    cameraView: exportRenderState?.cameraView ?? settings.cameraView,
  }), [exportRenderState?.cameraView, settings.cameraView])

  const chromeVisible = shouldPersistChrome || (isMenuReady && isMenuVisible)
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
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7rem)',
      }
    : {
        bottom: '2.5rem',
      }
  const topChromeStyle = isMobile
    ? {
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)',
      }
    : undefined
  const timelineChromeStyle = isMobile
    ? {
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 42dvh)',
      }
    : undefined
  const playChromeStyle = isMobile
    ? {
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 34dvh)',
      }
    : undefined
  const infoOverlayStyle = {
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
  } as const
  const infoModalStyle = {
    maxHeight:
      'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)',
  } as const

  return (
    <main className="relative h-screen w-full overflow-hidden bg-black font-sans">
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
            className="text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
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
                className="pointer-events-auto rounded-full p-1 text-white/30 transition-colors hover:text-white/70 disabled:opacity-40"
                aria-label={copy.previousTrack}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="max-w-[min(42rem,100%)] px-4 py-2.5 text-center sm:px-5 sm:py-3">
                <div
                  className={cn(
                    'transition-opacity duration-150 ease-out motion-reduce:transition-none',
                    isTrackMetaVisible ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  {displayTrackMeta.title && (
                    <div className="truncate text-sm font-medium tracking-[0.08em] text-[var(--nm-text)] sm:text-base">
                      {displayTrackMeta.title}
                    </div>
                  )}
                  {displayTrackMeta.subtitle && (
                    <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--nm-text-faint)] sm:text-xs">
                      {displayTrackMeta.subtitle}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => loadAdjacentTrack(1)}
                disabled={isLoadingLibrary}
                className="pointer-events-auto rounded-full p-1 text-white/30 transition-colors hover:text-white/70 disabled:opacity-40"
                aria-label={copy.nextTrack}
              >
                <ChevronRight className="h-4 w-4" />
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
                  'rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5',
                  isUploadDragActive ? 'nm-drag-active' : 'nm-raised',
                )}
                aria-label={copy.upload}
              >
                <Upload className="h-5 w-5" />
              </button>
            )}

            <div ref={libraryRef} className="relative">
              <button
                onClick={(e) => {
                  toggleLibrary()
                  e.currentTarget.blur()
                }}
                className={cn(
                  'rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5',
                  showLibrary ? 'nm-pressed' : 'nm-raised',
                )}
                aria-label={copy.libraryButton}
              >
                {isLoadingLibrary
                  ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    )
                  : (
                      <Library className="h-5 w-5" />
                    )}
              </button>

              {showLibrary && (
                <>
                  <button
                    type="button"
                    className="nm-animate-fade fixed inset-0 z-40 bg-black/60 backdrop-blur-[6px] sm:bg-black/20"
                    onClick={closeLibrary}
                    aria-label={copy.closeLibrary}
                  />

                  <div
                    role="dialog"
                    aria-modal="true"
                    className={cn(
                      'nm-card pointer-events-auto fixed z-50 flex min-h-0 flex-col overflow-hidden text-[var(--nm-text)]',
                      isMobile
                        ? 'nm-animate-sheet inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.6rem] p-3'
                        : 'nm-animate-dropdown absolute top-12 right-0 bottom-auto left-auto h-[min(74vh,46rem)] w-[min(38rem,calc(100vw-3rem))] rounded-[1.75rem] p-4',
                    )}
                    style={
                      isMobile
                        ? {
                            paddingBottom:
                              'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
                          }
                        : undefined
                    }
                  >
                    {isMobile && <div className="nm-sheet-handle" />}
                    <div className="nm-well rounded-[1.2rem] p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-base font-semibold tracking-[0.06em] text-[var(--nm-text)] sm:text-lg">
                          {copy.libraryTitle}
                        </h3>

                        <button
                          type="button"
                          onClick={closeLibrary}
                          className="nm-raised rounded-full p-2 text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
                          aria-label={copy.closeLibrary}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div
                      className="mt-3 grid grid-cols-6 gap-1.5"
                      role="tablist"
                      aria-label={copy.libraryTabList}
                    >
                      {libraryPrimaryGroups.map((group) => {
                        const isTabActive = activeLibraryGroup?.id === group.id
                        const GroupIcon = group.icon

                        return (
                          <button
                            key={group.id}
                            type="button"
                            role="tab"
                            aria-selected={isTabActive}
                            aria-label={group.label}
                            onClick={() =>
                              setActiveLibraryCategoryId(
                                group.defaultCategoryId,
                              )}
                            title={group.label}
                            className={cn(
                              'flex min-h-10 min-w-0 items-center justify-center rounded-xl p-1.5 transition-all',
                              isTabActive
                                ? 'nm-toggle-active'
                                : 'nm-raised text-[var(--nm-text-dim)]',
                            )}
                          >
                            <GroupIcon
                              className={cn(
                                'h-[1.125rem] w-[1.125rem] shrink-0',
                                isTabActive
                                  ? 'text-[var(--nm-bg)]'
                                  : 'text-[var(--nm-text)]',
                              )}
                            />
                            <span className="sr-only">{group.shortLabel}</span>
                          </button>
                        )
                      })}
                    </div>

                    {activeTrainSubcategories.length > 0 && (
                      <div
                        className="mt-2 flex gap-2"
                        role="tablist"
                        aria-label={copy.trainSubcategories}
                      >
                        {activeTrainSubcategories.map((category) => {
                          const isSubtabActive
                            = category.id === activeLibraryCategoryId
                          const categoryMeta = getLibraryCategoryMeta(
                            category.id,
                            language,
                          )
                          const SubIcon = categoryMeta.icon

                          return (
                            <button
                              key={category.id}
                              type="button"
                              role="tab"
                              aria-selected={isSubtabActive}
                              aria-label={categoryMeta.shortLabel}
                              title={categoryMeta.shortLabel}
                              onClick={() =>
                                setActiveLibraryCategoryId(category.id)}
                              className={cn(
                                'flex h-10 w-14 shrink-0 items-center justify-center rounded-full transition-all',
                                isSubtabActive
                                  ? 'nm-toggle-active'
                                  : 'nm-raised text-[var(--nm-text-dim)]',
                              )}
                            >
                              <SubIcon className="h-4 w-4" />
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {activeLibraryCategory && (
                      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] p-2 sm:p-3">
                        <div className="px-2 py-1 sm:px-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--nm-text)]">
                              <ActiveLibraryGroupIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate">
                                {activeLibraryHeading}
                              </span>
                              {activeLibraryGroup
                                && activeLibraryGroup.categoryIds.length > 1 && (
                                <span className="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--nm-text-faint)]">
                                  {activeLibraryCategoryMeta.shortLabel}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--nm-text-dim)]">
                              {activeLibraryDescription}
                            </p>
                          </div>
                        </div>

                        <div
                          ref={libraryListRef}
                          className="nm-scrollbar mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1 sm:pr-2"
                        >
                          {visibleLibraryItems.length > 0
                            ? (
                                visibleLibraryItems.map((item) => {
                                  const isActive
                                    = currentLibraryTrackId === item.id

                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => loadLibraryMidi(item)}
                                      disabled={isLoadingLibrary}
                                      className={cn(
                                        'nm-library-track flex w-full items-start gap-3 rounded-[1rem] px-3 py-3 text-left transition-all',
                                        isActive
                                          ? 'nm-library-track-active'
                                          : 'nm-list-item text-[var(--nm-text-dim)]',
                                        isLoadingLibrary && 'opacity-70',
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                                          isActive
                                            ? 'border-white/8 bg-white text-[var(--nm-bg)] shadow-[0_10px_24px_rgba(0,0,0,0.35)]'
                                            : 'border-white/6 bg-white/[0.03] text-[var(--nm-text-dim)]',
                                        )}
                                      >
                                        <ActiveLibraryCategoryIcon className="h-4 w-4" />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-start justify-between gap-2">
                                          <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold text-[var(--nm-text)]">
                                              {getLocalizedTrackTitle(
                                                item,
                                                language,
                                              )}
                                            </span>
                                            <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-[var(--nm-text-faint)]">
                                              {getLocalizedTrackSubtitle(
                                                item.subtitle,
                                                language,
                                              )}
                                              {item.sourceUrl && (
                                                <a
                                                  href={item.sourceUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={e =>
                                                    e.stopPropagation()}
                                                  className="inline-flex shrink-0 text-white/70 transition-colors hover:text-white"
                                                  aria-label="Source"
                                                >
                                                  <ExternalLink className="h-3 w-3" />
                                                </a>
                                              )}
                                            </span>
                                          </span>
                                          <span className="flex shrink-0 items-center gap-2">
                                            {isActive && (
                                              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--nm-text)]">
                                                {copy.loaded}
                                              </span>
                                            )}
                                            <span className="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--nm-text-faint)]">
                                              {item.durationLabel}
                                            </span>
                                          </span>
                                        </span>
                                      </span>
                                    </button>
                                  )
                                })
                              )
                            : (
                                <div className="flex flex-1 flex-col items-center justify-center rounded-[1.15rem] border border-dashed border-white/10 bg-black/10 px-6 text-center">
                                  <ActiveLibraryCategoryIcon className="mb-3 h-6 w-6 text-[var(--nm-text-faint)]" />
                                  <h4 className="text-sm font-semibold text-[var(--nm-text)]">
                                    {copy.noTracksTitle(
                                      activeLibraryCategoryMeta.label,
                                    )}
                                  </h4>
                                  <p className="mt-2 max-w-xs text-xs leading-relaxed text-[var(--nm-text-dim)]">
                                    {copy.noTracksDescription}
                                  </p>
                                </div>
                              )}
                          {activeLibraryCategory?.id === 'originals' && (
                            <p className="mt-3 px-3 text-xs leading-relaxed text-[var(--nm-text-faint)]">
                              {language === 'ja'
                                ? (
                                    <>
                                      作曲していますか？あなたのMIDIファイルを
                                      <a
                                        href="https://x.com/itsjaydesu"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline text-[var(--nm-text-dim)] hover:text-[var(--nm-text)] transition-colors"
                                      >
                                        Xでお送りください
                                      </a>
                                      。確認のうえ追加いたします。
                                    </>
                                  )
                                : (
                                    <>
                                      Are you a composer? If you&#39;d like to add
                                      your MIDI file here, please
                                      {' '}
                                      <a
                                        href="https://x.com/itsjaydesu"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline text-[var(--nm-text-dim)] hover:text-[var(--nm-text)] transition-colors"
                                      >
                                        message me on X
                                      </a>
                                      {' '}
                                      with your MIDI, and I&#39;ll review and add
                                      when I can.
                                    </>
                                  )}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={(e) => {
                setShowInfo(true)

                setShowSettings(false)
                closeLibrary()
                e.currentTarget.blur()
              }}
              className={cn(
                'rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5',
                showInfo ? 'nm-pressed' : 'nm-raised',
              )}
              aria-label={copy.infoButton}
            >
              <Info className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <button
                ref={settingsTriggerRef}
                onClick={(e) => {
                  setShowSettings(!showSettings)
                  setShowInfo(false)
                  closeLibrary()
                  e.currentTarget.blur()
                }}
                className={cn(
                  'rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5',
                  showSettings ? 'nm-pressed' : 'nm-raised',
                )}
                aria-label={copy.closeSettings}
              >
                <SettingsIcon className="h-5 w-5" />
              </button>
            </div>

            {isMobile && (
              <button
                onClick={(e) => {
                  e.currentTarget.blur()
                  setSettings((s) => {
                    const idx = CAMERA_VIEWS.indexOf(s.cameraView)
                    return {
                      ...s,
                      cameraView: CAMERA_VIEWS[(idx + 1) % CAMERA_VIEWS.length],
                    }
                  })
                }}
                className="nm-raised rounded-xl p-2 text-[var(--nm-text)]"
                aria-label={cameraViewLabels[settings.cameraView]}
              >
                <Camera className="h-5 w-5" />
              </button>
            )}
          </div>

          {showSettings && (
            <>
              <button
                type="button"
                className="pointer-events-auto nm-animate-fade fixed inset-0 z-40 bg-transparent"
                onClick={() => setShowSettings(false)}
                aria-label={copy.closeSettings}
              />
              <div
                ref={settingsRef}
                className="nm-card nm-animate-dropdown pointer-events-auto absolute top-12 right-0 z-50 flex w-80 flex-col gap-4 rounded-xl p-5 text-[var(--nm-text)]"
              >
                <h2 className="border-b border-[var(--nm-border)] pb-2 text-lg font-semibold">
                  {copy.settings}
                </h2>

                <div className="flex flex-col gap-3">
                  {!isMobile && (
                    <button
                      onClick={(e) => {
                        toggleFullscreen()
                        e.currentTarget.blur()
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                        isFullscreen
                          ? 'nm-toggle-active'
                          : 'nm-raised text-[var(--nm-text)]',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {isFullscreen
                          ? (
                              <Minimize className="h-4 w-4" />
                            )
                          : (
                              <Expand className="h-4 w-4" />
                            )}
                        {copy.fullScreen}
                      </span>
                      <kbd
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                          isFullscreen
                            ? 'text-[var(--nm-bg)]'
                            : 'text-[var(--nm-text-dim)]',
                        )}
                      >
                        F
                      </kbd>
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      updateSetting(
                        'showBottomTrackMeta',
                        !settings.showBottomTrackMeta,
                      )
                      e.currentTarget.blur()
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                      settings.showBottomTrackMeta
                        ? 'nm-toggle-active'
                        : 'nm-raised text-[var(--nm-text)]',
                    )}
                  >
                    <span>{copy.bottomTrackMeta}</span>
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        settings.showBottomTrackMeta
                          ? 'text-[var(--nm-bg)]'
                          : 'text-[var(--nm-text-dim)]',
                      )}
                    >
                      {settings.showBottomTrackMeta ? copy.show : copy.hide}
                    </span>
                  </button>

                  <button
                    onClick={(e) => {
                      updateSetting('showMidiRoll', !settings.showMidiRoll)
                      e.currentTarget.blur()
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                      settings.showMidiRoll
                        ? 'nm-toggle-active'
                        : 'nm-raised text-[var(--nm-text)]',
                    )}
                  >
                    <span>{copy.midiRoll}</span>
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        settings.showMidiRoll
                          ? 'text-[var(--nm-bg)]'
                          : 'text-[var(--nm-text-dim)]',
                      )}
                    >
                      {settings.showMidiRoll ? copy.show : copy.hide}
                    </span>
                  </button>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-[var(--nm-text-dim)]">
                      <span>BPM</span>
                      <span>{bpm}</span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={300}
                      step={1}
                      value={bpm}
                      onChange={e => setBpm(Number.parseInt(e.target.value, 10))}
                      className="nm-range"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-[var(--nm-text-dim)]">
                      <span>{copy.volume}</span>
                      <span>
                        {settings.volumePercent}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={150}
                      step={1}
                      value={settings.volumePercent}
                      onChange={e =>
                        updateSetting(
                          'volumePercent',
                          Number.parseInt(e.target.value, 10),
                        )}
                      className="nm-range"
                    />
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    <span className="text-sm text-[var(--nm-text-dim)]">
                      {copy.cameraView}
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {CAMERA_VIEWS.map(view => (
                        <button
                          key={view}
                          onClick={(e) => {
                            updateSetting('cameraView', view)
                            e.currentTarget.blur()
                          }}
                          className={cn(
                            'rounded-xl px-2 py-1.5 text-xs font-medium',
                            settings.cameraView === view
                              ? 'nm-toggle-active'
                              : 'nm-raised text-[var(--nm-text-dim)]',
                          )}
                        >
                          {cameraViewLabels[view]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    <span className="text-sm text-[var(--nm-text-dim)]">
                      {copy.videoExport}
                    </span>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-[var(--nm-text-faint)]">
                          {copy.exportFormat}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {(['webm', 'mp4'] as const).map(fmt => (
                            <button
                              key={fmt}
                              onClick={(e) => {
                                setExportFormat(fmt)
                                e.currentTarget.blur()
                              }}
                              className={cn(
                                'rounded-xl px-2 py-1.5 text-xs font-medium uppercase',
                                exportFormat === fmt
                                  ? 'nm-toggle-active'
                                  : 'nm-raised text-[var(--nm-text-dim)]',
                              )}
                            >
                              {fmt}
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
                              setExportCameraMode('current')
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
                              setExportCameraMode('cycle')
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
                        disabled={notes.length === 0 || isExporting}
                        className="nm-accent-raised w-full rounded-xl py-2 text-sm font-medium disabled:opacity-40"
                      >
                        {copy.exportButton}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    <span className="text-sm text-[var(--nm-text-dim)]">
                      {copy.language}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {LANGUAGE_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          onClick={(e) => {
                            startTransition(() => {
                              setLanguage(option.value)
                            })
                            e.currentTarget.blur()
                          }}
                          className={cn(
                            'rounded-xl px-2 py-1.5 text-xs font-medium',
                            language === option.value
                              ? 'nm-toggle-active'
                              : 'nm-raised text-[var(--nm-text-dim)]',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      resetSettings()
                      e.currentTarget.blur()
                    }}
                    className="nm-destructive mt-2 w-full rounded-xl py-2 text-sm font-medium"
                  >
                    {copy.resetDefaults}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showInfo && (
        <div
          className="nm-animate-fade fixed inset-0 z-[20000000] overflow-y-auto bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          style={infoOverlayStyle}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowInfo(false)
            }
          }}
        >
          <div
            className="flex min-h-full items-center justify-center p-4"
          >
            <div
              ref={infoRef}
              className={cn(
                'nm-animate-modal w-full overflow-y-auto rounded-[1.5rem] border border-white/35 bg-[#070707] font-mono text-[var(--nm-text)] shadow-[0_28px_80px_rgba(0,0,0,0.6)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                isMobile ? 'max-w-full px-5 py-5' : 'max-w-[42rem] px-7 py-6',
              )}
              style={infoModalStyle}
            >
              <div className="space-y-7 text-sm leading-[1.9] text-[var(--nm-text-dim)]">
                <section className="space-y-5">
                  <p className="text-[1.8rem] leading-none tracking-[0.04em] text-[var(--nm-text)]">
                    {displayBrandName}
                    {' '}
                    <a
                      href="https://github.com/itsjaydesu/orbitone"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex translate-y-[0.1em] align-baseline text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
                      aria-label="GitHub"
                    >
                      <GitHubMark className="h-[1.5625rem] w-[1.5625rem]" />
                    </a>
                    {' '}
                    <span className="text-[var(--nm-text-dim)]">
                      by
                      {' '}
                      <a
                        href="https://x.com/itsjaydesu"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                      >
                        @itsjaydesu
                      </a>
                    </span>
                  </p>

                  <div className="p-4 sm:p-5">
                    <div className="space-y-4">
                      {language === 'ja'
                        ? (
                            <>
                              <p>
                                <strong className="font-semibold text-[var(--nm-text)]">
                                  {displayBrandName}
                                </strong>
                                は私の初めてのオープンソースプロジェクトです。MIDIファイルを、ミニマルで心地よいビジュアルのミュージックボックスに変えることを目指しています。
                              </p>

                              <p>
                                <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                                  C
                                </span>
                                でカメラアングルの切り替え、
                                <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                                  M
                                </span>
                                でMIDIロールを表示できます。
                              </p>

                              <p>
                                MIDIファイルにはちょっとした懐かしさがあります。楽しんでもらえたらうれしいです。
                              </p>

                              <p>
                                このプロジェクトは自由に使ってください。何か作ったら、ぜひ見せてください。改善のアイデアがあれば、プルリクエストを送ってもらえるとうれしいです！
                              </p>
                            </>
                          )
                        : (
                            <>
                              <p>
                                <strong className="font-semibold text-[var(--nm-text)]">
                                  {displayBrandName}
                                </strong>
                                {' '}
                                is my first open source project. The goal is turning
                                a MIDI file into a minimal and pleasantly visualized
                                music box.
                              </p>

                              <p>
                                Try pressing
                                {' '}
                                <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                                  C
                                </span>
                                {' '}
                                for different camera angles and
                                {' '}
                                <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                                  M
                                </span>
                                {' '}
                                for a MIDI roll.
                              </p>

                              <p>
                                There&apos;s some nice nostalgia in the MIDI files,
                                hope you enjoy.
                              </p>

                              <p>
                                Please use this project for anything you like. If you
                                make something with it, I&apos;d love to see it. If
                                you have ideas on how to improve it, shoot me a pull
                                request!
                              </p>
                            </>
                          )}
                    </div>
                  </div>
                </section>

                <section className="space-y-4 border-t border-white/12 pt-5">
                  <h3 className="text-base tracking-[0.08em] text-[var(--nm-text)]">
                    {copy.keyboardShortcutsTitle}
                  </h3>
                  <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    {keyboardShortcuts.map(shortcut => (
                      <div
                        key={shortcut.keyLabel}
                        className="flex items-baseline gap-4"
                      >
                        <span className="min-w-[4.75rem] shrink-0 text-[var(--nm-text)]">
                          [
                          {shortcut.keyLabel}
                          ]
                        </span>
                        <span className="text-[13px] text-[var(--nm-text-dim)]">
                          {shortcut.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4 border-t border-white/12 pt-5">
                  <h3 className="text-base tracking-[0.08em] text-[var(--nm-text)]">
                    {language === 'ja' ? 'クレジット' : 'Credits'}
                  </h3>
                  <div className="space-y-4 text-xs leading-[1.8] text-[var(--nm-text-dim)]">
                    {language === 'ja'
                      ? (
                          <>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://shtr-m.net/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  shtr-m.net
                                </a>
                              </p>
                              <p>
                                日本の鉄道駅の発車メロディ（発メロ）のアーカイブです。
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://bitmidi.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  BitMidi
                                </a>
                              </p>
                              <p>
                                ゲーム、映画、テレビなどのクラシックMIDIファイルのコミュニティアーカイブです。
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://www.vgmusic.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  VGMusic
                                </a>
                              </p>
                              <p>
                                1996年から続くビデオゲーム音楽のMIDIアーカイブです。
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://magenta.tensorflow.org/datasets/maestro"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  MAESTRO Dataset
                                </a>
                              </p>
                              <p>
                                Google Magentaによる「MIDI and Audio Edited for
                                Synchronous TRacks and
                                Organization」データセットです。国際ピアノeコンペティションの演奏から収録された、ベロシティやペダル情報を含む高品質なピアノMIDI録音です。
                              </p>
                            </div>
                          </>
                        )
                      : (
                          <>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://shtr-m.net/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  shtr-m.net
                                </a>
                              </p>
                              <p>
                                Japanese train station departure melodies (hassha
                                melody) sourced from this railfan archive.
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://bitmidi.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  BitMidi
                                </a>
                              </p>
                              <p>
                                A community archive of classic MIDI files spanning
                                games, film, and television.
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://www.vgmusic.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  VGMusic
                                </a>
                              </p>
                              <p>
                                A video game music MIDI archive running since 1996.
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://magenta.tensorflow.org/datasets/maestro"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  MAESTRO Dataset
                                </a>
                              </p>
                              <p>
                                The &quot;MIDI and Audio Edited for Synchronous TRacks
                                and Organization&quot; dataset by Google Magenta.
                                High-fidelity piano MIDI recordings captured from
                                International Piano-e-Competition performances, with
                                velocity and pedal data intact.
                              </p>
                            </div>
                          </>
                        )}
                  </div>
                </section>

                <section className="space-y-4 border-t border-white/12 pt-5">
                  <h3 className="text-base tracking-[0.08em] text-[var(--nm-text)]">
                    {language === 'ja' ? '今後やりたいこと' : 'Things That Might Be Next'}
                  </h3>
                  <div className="space-y-2 text-xs leading-[1.8] text-[var(--nm-text-dim)]">
                    {language === 'ja'
                      ? (
                          <ul className="list-inside list-disc space-y-1">
                            <li>散らかっている部分のリファクタリング</li>
                            <li>
                              ピアノ以外の楽器を追加する（シンセ、ストリングスなど）
                            </li>
                            <li>
                              本物のアコースティックピアノの音源を使った、よりオーガニックなサウンド
                            </li>
                            <li>マルチトラックMIDIのサポートとトラック別の可視化</li>
                            <li>プレイリスト・キュー機能</li>
                          </ul>
                        )
                      : (
                          <ul className="list-inside list-disc space-y-1">
                            <li>Some refactors to clean up some messy parts</li>
                            <li>
                              Additional instruments (synth, strings, etc.)
                            </li>
                            <li>
                              Authentic organic piano using real acoustic samples
                            </li>
                            <li>
                              Multi-track MIDI support with per-track visualization
                            </li>
                            <li>Playlist queue for continuous playback</li>
                          </ul>
                        )}
                  </div>
                </section>

                <section className="flex items-center justify-center gap-5 border-t border-white/12 pt-5">
                  <a
                    href="https://github.com/itsjaydesu"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--nm-text-dim)] transition-colors hover:text-white"
                    aria-label="GitHub"
                    title="GitHub"
                  >
                    <GitHubMark className="h-8 w-8" />
                  </a>
                  <a
                    href="https://itsjaydesu.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-black/40 shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-opacity hover:opacity-80"
                    aria-label={language === 'ja' ? 'サイト' : 'Website'}
                    title={language === 'ja' ? 'サイト' : 'Website'}
                  >
                    <Image
                      src="/jay-avatar.PNG"
                      alt="Portrait of itsjaydesu"
                      width={128}
                      height={128}
                      className="h-12 w-12 object-cover"
                      priority
                    />
                  </a>
                  <a
                    href="https://x.com/itsjaydesu"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--nm-text-dim)] transition-colors hover:text-white"
                    aria-label="X"
                    title="X"
                  >
                    <XMark className="h-8 w-8" />
                  </a>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

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
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="nm-seekbar"
        />
        <div className="flex justify-between font-mono text-xs text-[var(--nm-text-dim)]">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div
        className={cn(bottomChromeClass, 'pointer-events-none bottom-10')}
        inert={!chromeVisible}
        style={playChromeStyle}
      >
        <button
          onClick={(e) => {
            void togglePlay()
            e.currentTarget.blur()
          }}
          disabled={isAudioLoading}
          aria-label={
            isAudioLoading
              ? copy.loadingPiano
              : hasEnded
                ? copy.restartPlayback
                : isPlaying
                  ? copy.stopPlayback
                  : copy.startPlayback
          }
          className="nm-play pointer-events-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-[var(--nm-text)] disabled:opacity-50"
        >
          {isAudioLoading
            ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              )
            : isPlaying
              ? (
                  <Square className="h-5 w-5 fill-current" />
                )
              : hasEnded
                ? (
                    <RotateCcw className="h-5 w-5" />
                  )
                : (
                    <Play className="ml-1 h-6 w-6 fill-current" />
                  )}
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
              <div className="truncate text-sm font-medium tracking-[0.08em] text-[var(--nm-text)] sm:text-base">
                {displayTrackMeta.title}
              </div>
            )}
            {displayTrackMeta.subtitle && (
              <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--nm-text-faint)] sm:text-xs">
                {displayTrackMeta.subtitle}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="visualizer-intro h-full w-full">
        <Visualizer
          cameraPresets={cameraDraftPresets}
          isMobileView={isMobile}
          isCameraEditing={showCameraLab}
          notes={initialLibraryTrack && !currentTrackTitle ? [] : notes}
          onCameraPoseChange={handleVisualizerCameraPoseChange}
          settings={settings}
        />
      </div>

      {isExporting && exportRenderState && (
        <div style={{ position: 'fixed', left: -9999, top: 0, width: 1080, height: 1920, pointerEvents: 'none' }}>
          <Visualizer
            exportMode
            exportCameraMode={exportCameraMode}
            onCanvasElement={setExportCanvas}
            onExportFrameController={setExportFrameController}
            cameraPresets={cameraDraftPresets}
            isMobileView={false}
            notes={notes}
            renderTimeline={{
              globalTime: exportRenderState.globalTime,
              transportTime: exportRenderState.transportTime,
            }}
            settings={exportVisualizerSettings}
          />
        </div>
      )}

      {exportPhase !== 'idle' && (
        <ExportOverlay
          phase={exportPhase}
          progress={exportProgress}
          language={language}
          onCancel={cancelExport}
        />
      )}

      <NoteCursor />

      {showFullscreenHint && !isMobile && (
        <div className="pointer-events-none fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="nm-fullscreen-hint rounded-2xl border border-white/10 bg-black/60 px-8 py-5 text-lg font-medium tracking-wide text-white/80 shadow-lg backdrop-blur-md">
            {copy.fullScreenHint}
          </div>
        </div>
      )}
    </main>
  )
}
