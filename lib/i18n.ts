import type { AppLanguage } from '@/lib/camera-presets'

export interface ShortcutItem {
  keyLabel: string
  description: string
}

export interface UiCopy {
  aboutTitle: string
  bottomTrackMeta: string
  cameraAutoCycle: string
  cameraView: string
  closeAbout: string
  closeLibrary: string
  closeSettings: string
  creatorTitle: string
  enableSound: string
  enablingSound: string
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
  midiParseError: string
  audioLoadError: string
  midiRoll: string
  nextTrack: string
  noTracksDescription: string
  noTracksTitle: (label: string) => string
  previousTrack: string

  resetDefaults: string
  settings: string
  tabSound: string
  tabScene: string
  tabExport: string
  tabGeneral: string
  instrument: string
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

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: AppLanguage
  label: string
}> = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

export function getBrandName(language: AppLanguage) {
  return language === 'ja' ? 'オービトーン' : 'orbitone'
}

export const KEYBOARD_SHORTCUTS: Record<AppLanguage, ShortcutItem[]> = {
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

export const UI_COPY: Record<AppLanguage, UiCopy> = {
  en: {
    aboutTitle: 'About',
    bottomTrackMeta: 'Show Title',
    cameraAutoCycle: 'Auto Cycle 10s',
    cameraView: 'Camera View',
    closeAbout: 'Close about panel',
    closeLibrary: 'Close MIDI library',
    closeSettings: 'Settings',
    creatorTitle: 'itsjaydesu',
    enableSound: 'Enable sound',
    enablingSound: 'Enabling sound',
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
    midiParseError: 'Could not read that MIDI file.',
    audioLoadError: 'Could not load the instrument — check your connection and press play to retry.',
    midiRoll: 'MIDI Roll',
    nextTrack: 'Next track',
    noTracksDescription: 'Switch tabs and try another collection.',
    noTracksTitle: label => `No tracks in ${label} yet`,
    previousTrack: 'Previous track',
    resetDefaults: 'Reset to Default',
    settings: 'Settings',
    tabSound: 'Sound',
    tabScene: 'Scene',
    tabExport: 'Export',
    tabGeneral: 'General',
    instrument: 'Instrument',
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
    bottomTrackMeta: 'タイトル表示',
    cameraAutoCycle: '10秒オートサイクル',
    cameraView: 'カメラアングル',
    closeAbout: '概要を閉じる',
    closeLibrary: 'MIDIライブラリを閉じる',
    closeSettings: '設定',
    creatorTitle: 'itsjaydesu',
    enableSound: 'サウンドを有効化',
    enablingSound: 'サウンドを有効化中',
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
    midiParseError: 'MIDIファイルを解析できませんでした。',
    audioLoadError: '音源を読み込めませんでした。接続を確認して、もう一度再生してください。',
    midiRoll: 'MIDIロール',
    nextTrack: '次の曲',
    noTracksDescription:
      '別のコレクションに切り替えて、ほかのMIDIを試してみてください。',
    noTracksTitle: label => `${label}の曲はまだありません`,
    previousTrack: '前の曲',
    resetDefaults: '初期設定に戻す',
    settings: '設定',
    tabSound: 'サウンド',
    tabScene: 'シーン',
    tabExport: 'エクスポート',
    tabGeneral: '一般',
    instrument: '音源',
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
