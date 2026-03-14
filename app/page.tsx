"use client";
import Image from "next/image";
import { CameraLab } from "@/components/CameraLab";
import { NoteCursor } from "@/components/NoteCursor";
import { Visualizer, VisualizerSettings } from "@/components/Visualizer";
import {
  MIDI_LIBRARY,
  MIDI_LIBRARY_CATEGORIES,
  MidiLibraryCategory,
  MidiLibraryItem,
} from "@/lib/library";
import {
  getLocalizedTrackSubtitle,
  getLocalizedTrackTitle,
} from "@/lib/library-translations";
import {
  CAMERA_PRESETS_STORAGE_KEY,
  CAMERA_VIEWS,
  AppLanguage,
  CameraPose,
  CameraPresetMap,
  CameraView,
  DEFAULT_CAMERA_PRESETS,
  cameraPoseEquals,
  cloneCameraPose,
  cloneCameraPresetMap,
  getCameraViewLabels,
  mergeCameraPresetMap,
} from "@/lib/camera-presets";
import { useMusic } from "@/hooks/useMusic";
import { cn } from "@/lib/utils";
import {
  BellRing,
  Clapperboard,
  Disc3,
  Gamepad2,
  Play,
  RotateCcw,
  Square,
  Loader2,
  Upload,
  Settings as SettingsIcon,
  Info,
  X,
  Library,
  Globe,
  Check,
  Music,
  Piano,
  TrainFront,
  Expand,
  Map as MapIcon,
  Minimize,
  type LucideIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  startTransition,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactElement,
  type SVGProps,
} from "react";

type AppSettings = VisualizerSettings & {
  volumePercent: number;
};

type DisplayTrackMeta = {
  title: string | null;
  subtitle: string | null;
};

const DEFAULT_SETTINGS: AppSettings = {
  volumePercent: 100,
  showMidiRoll: false,
  cameraView: "topThird",
};

const MENU_REVEAL_DELAY_MS = 3000;
const MENU_IDLE_HIDE_MS = 2000;
const TEXT_FADE_SWAP_DELAY_MS = 140;
const TEXT_FADE_REVEAL_DELAY_MS = 34;
const MIDI_EXTENSIONS = [".mid", ".midi"];
const DEFAULT_LIBRARY_CATEGORY_ID = MIDI_LIBRARY_CATEGORIES[0]?.id ?? "";
const LIBRARY_CATEGORY_INDEX = new Map(
  MIDI_LIBRARY_CATEGORIES.map((category) => [category.id, category]),
);
const LIBRARY_TRACK_INDEX = new Map(
  MIDI_LIBRARY_CATEGORIES.flatMap((category) =>
    category.items.map((item) => [item.id, item] as const),
  ),
);

type LibraryCategoryMeta = {
  blurb: string;
  icon: LucideIcon;
  label: string;
  shortLabel: string;
};

type LibraryPrimaryGroup = {
  blurb: string;
  categoryIds: string[];
  defaultCategoryId: string;
  icon: LucideIcon;
  id: string;
  label: string;
  shortLabel: string;
};

const TRAIN_LIBRARY_CATEGORY_IDS = [
  "train-stations",
  "train-standard-chimes",
  "train-signature-system",
] as const;

type ShortcutItem = {
  keyLabel: string;
  description: string;
};

type CreatorLink = {
  href: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
  label: string;
  subtitle: string;
};

type UiCopy = {
  aboutTitle: string;
  cameraView: string;
  closeAbout: string;
  closeLibrary: string;
  closeSettings: string;
  creatorTitle: string;
  fullScreen: string;
  fullScreenExit: string;
  infoButton: string;
  keyboardShortcutsTitle: string;
  languageButton: string;
  libraryButton: string;
  libraryDefaultHeading: string;
  libraryDescription: string;
  libraryLoadError: string;
  libraryTabList: string;
  libraryTitle: string;
  loaded: string;
  loadingPiano: string;
  midiRoll: string;
  noTracksDescription: string;
  noTracksTitle: (label: string) => string;
  openSource: string;
  resetDefaults: string;
  settings: string;
  show: string;
  hide: string;
  restartPlayback: string;
  startPlayback: string;
  stopPlayback: string;
  techTitle: string;
  trainSubcategories: string;
  upload: string;
  volume: string;
};

const FEATURED_LIBRARY_ORDER = new Map([
  ["games-internet/theme-song-to-2008", 0],
]);

const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: AppLanguage;
  label: string;
}> = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

const getBrandName = (language: AppLanguage) =>
  language === "ja" ? "オービトーン" : "orbitone";

const GitHubMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 1.25a10.75 10.75 0 0 0-3.4 20.95c.54.1.73-.23.73-.52 0-.25-.01-1.09-.02-1.97-2.96.64-3.58-1.26-3.58-1.26-.48-1.22-1.18-1.55-1.18-1.55-.97-.66.07-.65.07-.65 1.07.08 1.64 1.1 1.64 1.1.96 1.63 2.5 1.16 3.12.89.1-.69.37-1.16.68-1.43-2.37-.27-4.86-1.18-4.86-5.27 0-1.16.41-2.1 1.09-2.84-.11-.27-.47-1.37.1-2.84 0 0 .89-.29 2.91 1.09a10.06 10.06 0 0 1 5.3 0c2.01-1.38 2.9-1.09 2.9-1.09.58 1.47.22 2.57.11 2.84.68.74 1.09 1.68 1.09 2.84 0 4.1-2.5 4.99-4.88 5.25.38.33.72.97.72 1.95 0 1.41-.01 2.55-.01 2.89 0 .29.19.63.74.52A10.75 10.75 0 0 0 12 1.25Z" />
  </svg>
);

const XMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M18.9 2.25h2.93l-6.4 7.33 7.52 12.17h-5.89l-4.62-7.4-6.45 7.4H3.06l6.85-7.86L2.7 2.25h6.04l4.18 6.74 5.98-6.74Zm-1.03 17.74h1.63L7.86 3.91H6.12l11.75 16.08Z" />
  </svg>
);

const GlobeBadgeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 9h17" />
    <path d="M3.5 15h17" />
    <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9Z" />
  </svg>
);

const KEYBOARD_SHORTCUTS: Record<AppLanguage, ShortcutItem[]> = {
  en: [
    { keyLabel: "Space", description: "Play / Stop" },
    { keyLabel: "C", description: "Cycle camera angles" },
    { keyLabel: "M", description: "Toggle the MIDI roll" },
    { keyLabel: "L", description: "Open the MIDI library" },
    { keyLabel: "U", description: "Upload a MIDI file" },
    { keyLabel: "S", description: "Toggle settings" },
    { keyLabel: "F", description: "Toggle fullscreen" },
    { keyLabel: "I", description: "Open the about panel" },
    { keyLabel: "Esc", description: "Close any open panel" },
  ],
  ja: [
    { keyLabel: "Space", description: "再生 / 停止" },
    { keyLabel: "C", description: "カメラアングルを切り替え" },
    { keyLabel: "M", description: "MIDIロールを表示 / 非表示" },
    { keyLabel: "L", description: "MIDIライブラリを開く" },
    { keyLabel: "U", description: "MIDIファイルをアップロード" },
    { keyLabel: "S", description: "設定パネルを開閉" },
    { keyLabel: "F", description: "フルスクリーンを切り替え" },
    { keyLabel: "I", description: "概要パネルを開く" },
    { keyLabel: "Esc", description: "開いているパネルを閉じる" },
  ],
};

const CREATOR_LINKS: Record<AppLanguage, CreatorLink[]> = {
  en: [
    {
      href: "https://github.com/itsjaydesu",
      icon: GitHubMark,
      label: "GitHub",
      subtitle: "Code and repositories",
    },
    {
      href: "https://x.com/itsjaydesu",
      icon: XMark,
      label: "X",
      subtitle: "Updates and stray thoughts",
    },
    {
      href: "https://itsjaydesu.com",
      icon: GlobeBadgeIcon,
      label: "Website",
      subtitle: "itsjaydesu.com",
    },
  ],
  ja: [
    {
      href: "https://github.com/itsjaydesu",
      icon: GitHubMark,
      label: "GitHub",
      subtitle: "コードとリポジトリ",
    },
    {
      href: "https://x.com/itsjaydesu",
      icon: XMark,
      label: "X",
      subtitle: "更新と雑談",
    },
    {
      href: "https://itsjaydesu.com",
      icon: GlobeBadgeIcon,
      label: "サイト",
      subtitle: "itsjaydesu.com",
    },
  ],
};

const UI_COPY: Record<AppLanguage, UiCopy> = {
  en: {
    aboutTitle: "About",
    cameraView: "Camera View",
    closeAbout: "Close about panel",
    closeLibrary: "Close MIDI library",
    closeSettings: "Settings",
    creatorTitle: "itsjaydesu",
    fullScreen: "Enter fullscreen",
    fullScreenExit: "Exit fullscreen",
    infoButton: "Open about panel",
    keyboardShortcutsTitle: "Keyboard shortcuts",
    languageButton: "Change language",
    libraryButton: "MIDI library",
    libraryDefaultHeading: "MIDI Library",
    libraryDescription:
      "Browse the built-in collections. Japanese train melodies open a second row for stations, standards, and signature themes.",
    libraryLoadError: "Failed to load MIDI file from the library.",
    libraryTabList: "Library collections",
    libraryTitle: "MIDI Library",
    loaded: "Loaded",
    loadingPiano: "Loading piano",
    midiRoll: "MIDI Roll",
    noTracksDescription: "Switch tabs and try another collection.",
    noTracksTitle: (label) => `No tracks in ${label} yet`,
    openSource: "Open Source",
    resetDefaults: "Reset to Default",
    settings: "Settings",
    show: "On",
    hide: "Off",
    restartPlayback: "Restart playback",
    startPlayback: "Start playback",
    stopPlayback: "Stop playback",
    techTitle: "Built with",
    trainSubcategories: "Japanese train melody subsets",
    upload: "Upload MIDI",
    volume: "Volume",
  },
  ja: {
    aboutTitle: "オービトーンについて",
    cameraView: "カメラアングル",
    closeAbout: "概要を閉じる",
    closeLibrary: "MIDIライブラリを閉じる",
    closeSettings: "設定",
    creatorTitle: "itsjaydesu",
    fullScreen: "フルスクリーン",
    fullScreenExit: "フルスクリーンを終了",
    infoButton: "概要を開く",
    keyboardShortcutsTitle: "キーボードショートカット",
    languageButton: "言語を変更",
    libraryButton: "MIDIライブラリ",
    libraryDefaultHeading: "MIDIライブラリ",
    libraryDescription:
      "コレクションごとに曲を切り替えられます。日本の発車メロディでは、駅別・定番チャイム・シグネチャー曲のサブタブも使えます。",
    libraryLoadError: "ライブラリのMIDIファイルを読み込めませんでした。",
    libraryTabList: "ライブラリのコレクション",
    libraryTitle: "MIDIライブラリ",
    loaded: "読み込み済み",
    loadingPiano: "ピアノ音源を読み込み中",
    midiRoll: "MIDIロール",
    noTracksDescription:
      "別のコレクションに切り替えて、ほかのMIDIを試してみてください。",
    noTracksTitle: (label) => `${label}の曲はまだありません`,
    openSource: "オープンソース",
    resetDefaults: "初期設定に戻す",
    settings: "設定",
    show: "表示",
    hide: "非表示",
    restartPlayback: "最初から再生",
    startPlayback: "再生を開始",
    stopPlayback: "再生を停止",
    techTitle: "中で使っているもの",
    trainSubcategories: "日本の発車メロディのサブカテゴリ",
    upload: "MIDIをアップロード",
    volume: "音量",
  },
};

const getLibraryCategoryMeta = (
  categoryId: string,
  language: AppLanguage,
): LibraryCategoryMeta => {
  switch (categoryId) {
    case "classical-piano":
      return language === "ja"
        ? {
            blurb:
              "夜想曲や協奏曲など、ピアノの表情がよく映えるクラシック作品を集めました。",
            icon: Piano,
            label: "クラシック / ピアノ",
            shortLabel: "クラシック",
          }
        : {
            blurb:
              "Concert works, nocturnes, and expressive piano repertoire.",
            icon: Piano,
            label: "Classical & Piano",
            shortLabel: "Classical",
          };
    case "film-tv-anime":
      return language === "ja"
        ? {
            blurb:
              "映画音楽、アニメ主題歌、印象的なテレビテーマを横断する映像音楽のコレクションです。",
            icon: Clapperboard,
            label: "映画 / テレビ / アニメ",
            shortLabel: "映像",
          }
        : {
            blurb:
              "Big-screen themes, anime openings, and prestige TV motifs.",
            icon: Clapperboard,
            label: "Film, TV & Anime",
            shortLabel: "Screen",
          };
    case "games-internet":
      return language === "ja"
        ? {
            blurb:
              "ゲームの名曲やインターネットの記憶に残るメロディを、少しノスタルジックな温度感で。",
            icon: Gamepad2,
            label: "ゲーム / インターネット",
            shortLabel: "ゲーム",
          }
        : {
            blurb:
              "Game scores, online relics, and endlessly replayable hooks.",
            icon: Gamepad2,
            label: "Games & Internet",
            shortLabel: "Games",
          };
    case "pop-electronic":
      return language === "ja"
        ? {
            blurb:
              "ポップスの定番やエレクトロのきらめきを、ピアノで気持ちよく聴ける曲たちです。",
            icon: Disc3,
            label: "ポップ / エレクトロ",
            shortLabel: "ポップ",
          }
        : {
            blurb:
              "Anthems, club textures, and bright electronic melodies.",
            icon: Disc3,
            label: "Pop & Electronic",
            shortLabel: "Pop",
          };
    case "train-stations":
      return language === "ja"
        ? {
            blurb:
              "駅ごとの発車メロディやご当地色のあるチャイムを中心に集めています。",
            icon: TrainFront,
            label: "駅別メロディ",
            shortLabel: "駅別",
          }
        : {
            blurb:
              "Station-specific Japanese departure melodies and local favorites.",
            icon: TrainFront,
            label: "Station Melodies",
            shortLabel: "Stations",
          };
    case "train-standard-chimes":
      return language === "ja"
        ? {
            blurb:
              "JRの定番チャイムや広く使われる標準メロディをまとめたセットです。",
            icon: BellRing,
            label: "定番チャイム",
            shortLabel: "定番",
          }
        : {
            blurb:
              "Classic JR standards, shared chimes, and core platform signals.",
            icon: BellRing,
            label: "Standard Chimes",
            shortLabel: "Chimes",
          };
    case "train-signature-system":
      return language === "ja"
        ? {
            blurb:
              "路線固有のメロディや有名な発車サウンド、印象に残るシグネチャー曲を揃えました。",
            icon: MapIcon,
            label: "シグネチャー曲",
            shortLabel: "特色",
          }
        : {
            blurb:
              "Named rail melodies, medleys, and signature network themes.",
            icon: MapIcon,
            label: "Signature Themes",
            shortLabel: "Signature",
          };
    default:
      return language === "ja"
        ? {
            blurb: "Orbitoneのために選んだMIDIコレクションです。",
            icon: Music,
            label: "MIDIライブラリ",
            shortLabel: "ライブラリ",
          }
        : {
            blurb: "Curated MIDI selections from the Orbitone library.",
            icon: Music,
            label: "MIDI Library",
            shortLabel: "Library",
          };
  }
};

const getLibraryPrimaryGroups = (
  language: AppLanguage,
): LibraryPrimaryGroup[] => [
  {
    id: "classical-piano",
    label: language === "ja" ? "クラシック / ピアノ" : "Classical & Piano",
    shortLabel: language === "ja" ? "クラシック" : "Classical",
    icon: Piano,
    blurb:
      language === "ja"
        ? "夜想曲や協奏曲など、ピアノの響きが美しく映えるクラシック作品をまとめています。"
        : "Concert works, nocturnes, and expressive piano repertoire.",
    categoryIds: ["classical-piano"],
    defaultCategoryId: "classical-piano",
  },
  {
    id: "film-tv-anime",
    label: language === "ja" ? "映画 / テレビ / アニメ" : "Film, TV & Anime",
    shortLabel: language === "ja" ? "映像" : "Screen",
    icon: Clapperboard,
    blurb:
      language === "ja"
        ? "映画音楽、アニメ主題歌、ドラマや番組テーマまで、映像の記憶に残る曲たちです。"
        : "Big-screen themes, anime openings, and prestige TV motifs.",
    categoryIds: ["film-tv-anime"],
    defaultCategoryId: "film-tv-anime",
  },
  {
    id: "games-internet",
    label:
      language === "ja" ? "ゲーム / インターネット" : "Games & Internet",
    shortLabel: language === "ja" ? "ゲーム" : "Games",
    icon: Gamepad2,
    blurb:
      language === "ja"
        ? "ゲームの名曲やネット文化の懐かしいメロディを、耳に残る順に並べたくなる棚です。"
        : "Game scores, online relics, and endlessly replayable hooks.",
    categoryIds: ["games-internet"],
    defaultCategoryId: "games-internet",
  },
  {
    id: "pop-electronic",
    label: language === "ja" ? "ポップ / エレクトロ" : "Pop & Electronic",
    shortLabel: language === "ja" ? "ポップ" : "Pop",
    icon: Disc3,
    blurb:
      language === "ja"
        ? "ポップスの定番から電子音のきらめきまで、軽やかに聴けるメロディを集めています。"
        : "Anthems, club textures, and bright electronic melodies.",
    categoryIds: ["pop-electronic"],
    defaultCategoryId: "pop-electronic",
  },
  {
    id: "japanese-train-melodies",
    label:
      language === "ja"
        ? "日本の発車メロディ"
        : "Japanese Train Melodies",
    shortLabel: language === "ja" ? "鉄道" : "Trains",
    icon: TrainFront,
    blurb:
      language === "ja"
        ? "駅別の発車メロディ、JRの定番チャイム、路線のシグネチャー曲まで、日本の鉄道音を横断できます。"
        : "Station jingles, JR standards, and signature departure themes from across Japan's rail network.",
    categoryIds: [...TRAIN_LIBRARY_CATEGORY_IDS],
    defaultCategoryId: "train-stations",
  },
];

const stripMidiExtension = (fileName: string) =>
  fileName.replace(/\.(mid|midi)$/i, "");

const getRandomLibraryTrack = (): MidiLibraryItem | null => {
  if (MIDI_LIBRARY.length === 0) {
    return null;
  }

  return MIDI_LIBRARY[Math.floor(Math.random() * MIDI_LIBRARY.length)] ?? null;
};

const formatLoadedTitle = (fileName: string, language: AppLanguage) => {
  const stem = stripMidiExtension(fileName).trim();

  if (stem.length === 0) {
    return language === "ja" ? "無題のMIDI" : "Untitled MIDI";
  }

  if (/[A-Z]/.test(stem) || stem.includes(" ")) {
    return stem.replace(/_/g, " ");
  }

  return stem
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const isMidiFile = (file: File) => {
  const lowerName = file.name.toLowerCase();

  return (
    file.type === "audio/midi" ||
    file.type === "audio/x-midi" ||
    MIDI_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  );
};

export default function Home() {
  const isMobile = useIsMobile();
  // Keep primary controls accessible on touch devices instead of hiding on idle.
  const shouldPersistChrome = isMobile;
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isMenuReady, setIsMenuReady] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isUploadDragActive, setIsUploadDragActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCameraLab, setShowCameraLab] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [activeLibraryCategoryId, setActiveLibraryCategoryId] = useState(
    DEFAULT_LIBRARY_CATEGORY_ID,
  );
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string | null>(
    null,
  );
  const [currentLibraryTrackId, setCurrentLibraryTrackId] = useState<
    string | null
  >(null);
  const [savedCameraPresets, setSavedCameraPresets] =
    useState<CameraPresetMap>(() =>
      cloneCameraPresetMap(DEFAULT_CAMERA_PRESETS),
    );
  const [cameraDraftPresets, setCameraDraftPresets] =
    useState<CameraPresetMap>(() =>
      cloneCameraPresetMap(DEFAULT_CAMERA_PRESETS),
    );
  const [initialLibraryTrack] = useState<MidiLibraryItem | null>(() =>
    getRandomLibraryTrack(),
  );

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
  } = useMusic({
    language,
    volumePercent: settings.volumePercent,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<number | undefined>(undefined);
  const brandSwapTimerRef = useRef<number | undefined>(undefined);
  const brandRevealTimerRef = useRef<number | undefined>(undefined);
  const uploadDragDepthRef = useRef(0);
  const infoRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const libraryListRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const cameraLabRef = useRef<HTMLDivElement>(null);
  const currentTrackTitleRef = useRef<string | null>(null);
  const initialTrackRequestedRef = useRef(false);
  const [headerBrandName, setHeaderBrandName] = useState<string>(() =>
    getBrandName(language),
  );
  const [isHeaderBrandVisible, setIsHeaderBrandVisible] = useState(true);
  const headerBrandNameRef = useRef<string>(getBrandName(language));
  const copy = UI_COPY[language];
  const displayBrandName = getBrandName(language);
  const cameraViewLabels = useMemo(
    () => getCameraViewLabels(language),
    [language],
  );
  const libraryPrimaryGroups = useMemo(
    () => getLibraryPrimaryGroups(language),
    [language],
  );
  const libraryPrimaryGroupIndex = useMemo(
    () =>
      new Map(
        libraryPrimaryGroups.flatMap((group) =>
          group.categoryIds.map((categoryId) => [categoryId, group] as const),
        ),
      ),
    [libraryPrimaryGroups],
  );
  const keyboardShortcuts = KEYBOARD_SHORTCUTS[language];
  const creatorLinks = CREATOR_LINKS[language];
  const creatorLinkNotes = creatorLinks.map((link) => link.subtitle).join(" · ");
  const aboutTechItems = useMemo(
    () =>
      language === "ja"
        ? [
            {
              title: "Three.js / React Three Fiber",
              description: "立体的なMIDIビジュアライズとカメラ演出を担当しています。",
            },
            {
              title: "Tone.js",
              description:
                "ピアノ音源の再生、リバーブ、ベロシティ、ペダル表現を支えています。",
            },
            {
              title: "Next.js / React",
              description: "UI、ライブラリ管理、インタラクション全体をまとめています。",
            },
          ]
        : [
            {
              title: "Three.js / React Three Fiber",
              description: "Handles the 3D MIDI visualization and camera choreography.",
            },
            {
              title: "Tone.js",
              description: "Drives piano playback, reverb, and the velocity / pedal expression.",
            },
            {
              title: "Next.js / React",
              description: "Keeps the UI, library flow, and the app interactions together.",
            },
          ],
    [language],
  );
  const activeLibraryCategory = useMemo<MidiLibraryCategory | null>(
    () =>
      LIBRARY_CATEGORY_INDEX.get(activeLibraryCategoryId) ??
      MIDI_LIBRARY_CATEGORIES[0] ??
      null,
    [activeLibraryCategoryId],
  );
  const activeLibraryGroup = useMemo<LibraryPrimaryGroup | null>(
    () =>
      libraryPrimaryGroupIndex.get(activeLibraryCategoryId) ??
      libraryPrimaryGroups[0] ??
      null,
    [activeLibraryCategoryId, libraryPrimaryGroupIndex, libraryPrimaryGroups],
  );
  const activeLibraryCategoryMeta = activeLibraryCategory
    ? getLibraryCategoryMeta(activeLibraryCategory.id, language)
    : getLibraryCategoryMeta("", language);
  const ActiveLibraryCategoryIcon = activeLibraryCategoryMeta.icon;
  const ActiveLibraryGroupIcon = activeLibraryGroup?.icon ?? ActiveLibraryCategoryIcon;
  const activeTrainSubcategories = useMemo(
    () =>
      (activeLibraryGroup?.categoryIds.length ?? 0) > 1
        ? activeLibraryGroup?.categoryIds
            .map((categoryId) => LIBRARY_CATEGORY_INDEX.get(categoryId))
            .filter((category): category is MidiLibraryCategory =>
              Boolean(category),
            ) ?? []
        : [],
    [activeLibraryGroup],
  );
  const activeLibraryHeading =
    activeLibraryGroup?.label ??
    activeLibraryCategoryMeta.label ??
    copy.libraryDefaultHeading;
  const activeLibraryDescription = activeLibraryGroup
    ? activeLibraryGroup.categoryIds.length === 1
      ? activeLibraryGroup.blurb
      : language === "ja"
        ? `${activeLibraryGroup.blurb} 現在は${activeLibraryCategoryMeta.label}を表示しています。`
        : `${activeLibraryGroup.blurb} Currently showing ${activeLibraryCategoryMeta.label}.`
    : activeLibraryCategoryMeta.blurb;
  const currentLibraryTrack = useMemo<MidiLibraryItem | null>(
    () =>
      currentLibraryTrackId
        ? LIBRARY_TRACK_INDEX.get(currentLibraryTrackId) ?? null
        : null,
    [currentLibraryTrackId],
  );
  const localizedTrackTitle = currentLibraryTrack
    ? getLocalizedTrackTitle(currentLibraryTrack, language)
    : currentTrackTitle;
  const localizedTrackSubtitle = getLocalizedTrackSubtitle(
    currentLibraryTrack?.subtitle ?? null,
    language,
  );
  const [displayTrackMeta, setDisplayTrackMeta] = useState<DisplayTrackMeta>(
    () => ({
      title: localizedTrackTitle,
      subtitle: localizedTrackSubtitle,
    }),
  );
  const displayTrackMetaRef = useRef<DisplayTrackMeta>({
    title: localizedTrackTitle,
    subtitle: localizedTrackSubtitle,
  });
  const trackMetaSwapTimerRef = useRef<number | undefined>(undefined);
  const trackMetaRevealTimerRef = useRef<number | undefined>(undefined);
  const [isTrackMetaVisible, setIsTrackMetaVisible] = useState(() =>
    Boolean(localizedTrackTitle || localizedTrackSubtitle),
  );
  const visibleLibraryItems = useMemo(() => {
    if (!activeLibraryCategory) {
      return [];
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
      .map(({ item }) => item);
  }, [activeLibraryCategory]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    currentTrackTitleRef.current = currentTrackTitle;
  }, [currentTrackTitle]);

  useEffect(() => {
    headerBrandNameRef.current = headerBrandName;
  }, [headerBrandName]);

  useEffect(() => {
    displayTrackMetaRef.current = displayTrackMeta;
  }, [displayTrackMeta]);

  useEffect(() => {
    if (headerBrandNameRef.current === displayBrandName) {
      setIsHeaderBrandVisible(true);
      return;
    }

    if (brandSwapTimerRef.current !== undefined) {
      window.clearTimeout(brandSwapTimerRef.current);
    }

    if (brandRevealTimerRef.current !== undefined) {
      window.clearTimeout(brandRevealTimerRef.current);
    }

    setIsHeaderBrandVisible(false);
    brandSwapTimerRef.current = window.setTimeout(() => {
      setHeaderBrandName(displayBrandName);
      headerBrandNameRef.current = displayBrandName;
      brandRevealTimerRef.current = window.setTimeout(() => {
        setIsHeaderBrandVisible(true);
        brandRevealTimerRef.current = undefined;
      }, TEXT_FADE_REVEAL_DELAY_MS);
      brandSwapTimerRef.current = undefined;
    }, TEXT_FADE_SWAP_DELAY_MS);

    return () => {
      if (brandSwapTimerRef.current !== undefined) {
        window.clearTimeout(brandSwapTimerRef.current);
        brandSwapTimerRef.current = undefined;
      }

      if (brandRevealTimerRef.current !== undefined) {
        window.clearTimeout(brandRevealTimerRef.current);
        brandRevealTimerRef.current = undefined;
      }
    };
  }, [displayBrandName]);

  useEffect(() => {
    const currentDisplay = displayTrackMetaRef.current;
    const nextDisplay = {
      title: localizedTrackTitle,
      subtitle: localizedTrackSubtitle,
    };

    if (
      currentDisplay.title === nextDisplay.title &&
      currentDisplay.subtitle === nextDisplay.subtitle
    ) {
      setIsTrackMetaVisible(Boolean(nextDisplay.title || nextDisplay.subtitle));
      return;
    }

    if (trackMetaSwapTimerRef.current !== undefined) {
      window.clearTimeout(trackMetaSwapTimerRef.current);
    }

    if (trackMetaRevealTimerRef.current !== undefined) {
      window.clearTimeout(trackMetaRevealTimerRef.current);
    }

    const hasCurrentMeta = Boolean(
      currentDisplay.title || currentDisplay.subtitle,
    );
    const hasNextMeta = Boolean(nextDisplay.title || nextDisplay.subtitle);

    if (!hasCurrentMeta) {
      displayTrackMetaRef.current = nextDisplay;
      setDisplayTrackMeta(nextDisplay);
      setIsTrackMetaVisible(hasNextMeta);
      return;
    }

    setIsTrackMetaVisible(false);
    trackMetaSwapTimerRef.current = window.setTimeout(() => {
      displayTrackMetaRef.current = nextDisplay;
      setDisplayTrackMeta(nextDisplay);
      trackMetaSwapTimerRef.current = undefined;

      if (!hasNextMeta) {
        return;
      }

      trackMetaRevealTimerRef.current = window.setTimeout(() => {
        setIsTrackMetaVisible(true);
        trackMetaRevealTimerRef.current = undefined;
      }, TEXT_FADE_REVEAL_DELAY_MS);
    }, TEXT_FADE_SWAP_DELAY_MS);

    return () => {
      if (trackMetaSwapTimerRef.current !== undefined) {
        window.clearTimeout(trackMetaSwapTimerRef.current);
        trackMetaSwapTimerRef.current = undefined;
      }

      if (trackMetaRevealTimerRef.current !== undefined) {
        window.clearTimeout(trackMetaRevealTimerRef.current);
        trackMetaRevealTimerRef.current = undefined;
      }
    };
  }, [localizedTrackSubtitle, localizedTrackTitle]);

  useEffect(() => {
    if (showLibrary && currentLibraryTrack) {
      if (currentLibraryTrack) {
        setActiveLibraryCategoryId(currentLibraryTrack.categoryId);
      }
    }
  }, [currentLibraryTrack, showLibrary]);

  useEffect(() => {
    if (!showLibrary) {
      return;
    }

    libraryListRef.current?.scrollTo({ behavior: "auto", top: 0 });
  }, [activeLibraryCategoryId, showLibrary]);

  useEffect(() => {
    const hasOpenLayer =
      showInfo ||
      showLibrary ||
      showSettings ||
      showCameraLab ||
      showLanguageMenu;

    if (!hasOpenLayer) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      const clickedInsideInfo = showInfo && infoRef.current?.contains(target);
      const clickedInsideLibrary = showLibrary && libraryRef.current?.contains(target);
      const clickedInsideLanguage =
        showLanguageMenu && languageRef.current?.contains(target);
      const clickedInsideSettings =
        showSettings &&
        ((settingsRef.current?.contains(target) ??
          false) ||
          (settingsTriggerRef.current?.contains(target) ?? false));
      const clickedInsideCameraLab =
        showCameraLab && cameraLabRef.current?.contains(target);

      if (
        clickedInsideInfo ||
        clickedInsideLibrary ||
        clickedInsideLanguage ||
        clickedInsideSettings ||
        clickedInsideCameraLab
      ) {
        return;
      }

      setShowInfo(false);
      setShowLibrary(false);
      setShowLanguageMenu(false);
      setShowSettings(false);
      setShowCameraLab(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showCameraLab, showInfo, showLanguageMenu, showLibrary, showSettings]);

  useEffect(() => {
    try {
      const storedPresets = window.localStorage.getItem(
        CAMERA_PRESETS_STORAGE_KEY,
      );

      if (!storedPresets) {
        return;
      }

      const mergedPresets = mergeCameraPresetMap(JSON.parse(storedPresets));
      setSavedCameraPresets(mergedPresets);
      setCameraDraftPresets(cloneCameraPresetMap(mergedPresets));
    } catch (error) {
      console.error("Failed to hydrate camera presets", error);
    }
  }, []);


  const persistCameraPresets = useCallback((nextPresets: CameraPresetMap) => {
    window.localStorage.setItem(
      CAMERA_PRESETS_STORAGE_KEY,
      JSON.stringify(nextPresets),
    );
  }, []);

  const updateCameraDraft = useCallback(
    (view: CameraView, pose: CameraPose) => {
      setCameraDraftPresets((currentPresets) => {
        if (cameraPoseEquals(currentPresets[view], pose)) {
          return currentPresets;
        }

        return {
          ...currentPresets,
          [view]: cloneCameraPose(pose),
        };
      });
    },
    [],
  );

  const loadMidiFile = useCallback(
    async (
      file: File,
      options?: {
        libraryTrackId?: string | null;
        title?: string;
      },
    ) => {
      const didLoad = await loadMidi(file);

      if (!didLoad) {
        return false;
      }

      setCurrentTrackTitle(options?.title ?? formatLoadedTitle(file.name, language));
      setCurrentLibraryTrackId(options?.libraryTrackId ?? null);

      return true;
    },
    [language, loadMidi],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error("Failed to toggle fullscreen", error);
    }
  }, []);

  const resetUploadDragState = useCallback(() => {
    uploadDragDepthRef.current = 0;
    setIsUploadDragActive(false);
  }, []);

  const openLibrary = useCallback(() => {
    if (currentLibraryTrack) {
      setActiveLibraryCategoryId(currentLibraryTrack.categoryId);
    }

    setShowLibrary(true);
    setShowLanguageMenu(false);
    setShowSettings(false);
    setShowInfo(false);
    setShowCameraLab(false);
  }, [currentLibraryTrack]);

  const closeLibrary = useCallback(() => {
    setShowLibrary(false);
  }, []);

  const toggleLibrary = useCallback(() => {
    if (showLibrary) {
      closeLibrary();
      return;
    }

    openLibrary();
  }, [closeLibrary, openLibrary, showLibrary]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement &&
        ["text", "number", "password", "email"].includes(e.target.type)
      ) {
        return;
      }

      if (e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "s":
          e.preventDefault();
          setShowSettings((v) => !v);
          setShowInfo(false);
          setShowLanguageMenu(false);
          closeLibrary();
          break;
        case "c":
          e.preventDefault();
          setSettings((s) => {
            const idx = CAMERA_VIEWS.indexOf(s.cameraView);
            return {
              ...s,
              cameraView: CAMERA_VIEWS[(idx + 1) % CAMERA_VIEWS.length],
            };
          });
          break;
        case "i":
          e.preventDefault();
          setShowInfo((v) => !v);
          setShowLanguageMenu(false);
          setShowSettings(false);
          closeLibrary();
          break;
        case "l":
          e.preventDefault();
          toggleLibrary();
          break;
        case "u":
          e.preventDefault();
          fileInputRef.current?.click();
          break;
        case "m":
          e.preventDefault();
          setSettings((s) => ({ ...s, showMidiRoll: !s.showMidiRoll }));
          break;
        case "escape":
          setShowSettings(false);
          setShowInfo(false);
          setShowLanguageMenu(false);
          closeLibrary();
          setShowCameraLab(false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeLibrary, toggleFullscreen, toggleLibrary, togglePlay]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== undefined) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = undefined;
    }
  }, []);

  const scheduleIdleHide = useCallback(() => {
    clearIdleTimer();
    if (shouldPersistChrome) {
      return;
    }
    idleTimerRef.current = window.setTimeout(() => {
      setIsMenuVisible(false);
    }, MENU_IDLE_HIDE_MS);
  }, [clearIdleTimer, shouldPersistChrome]);

  useEffect(() => {
    if (!shouldPersistChrome) {
      return;
    }

    clearIdleTimer();
    if (!isMenuReady) {
      setIsMenuReady(true);
    }
    if (!isMenuVisible) {
      setIsMenuVisible(true);
    }
  }, [clearIdleTimer, isMenuReady, isMenuVisible, shouldPersistChrome]);

  useEffect(() => {
    if (shouldPersistChrome) {
      return;
    }

    setIsMenuReady(false);
    setIsMenuVisible(false);

    const revealTimer = window.setTimeout(() => {
      setIsMenuReady(true);
      setIsMenuVisible(true);
      scheduleIdleHide();
    }, MENU_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(revealTimer);
      clearIdleTimer();
    };
  }, [clearIdleTimer, scheduleIdleHide, shouldPersistChrome]);

  useEffect(() => {
    if (shouldPersistChrome || !isMenuReady) {
      return;
    }

    if (showSettings || showCameraLab || showInfo || showLibrary || showLanguageMenu) {
      clearIdleTimer();
      setIsMenuVisible(true);
      return;
    }

    if (isMenuVisible) {
      scheduleIdleHide();
    }
  }, [
    clearIdleTimer,
    isMenuReady,
    isMenuVisible,
    scheduleIdleHide,
    shouldPersistChrome,
    showCameraLab,
    showInfo,
    showLanguageMenu,
    showLibrary,
    showSettings,
  ]);

  useEffect(() => {
    if (shouldPersistChrome || !isMenuReady) {
      return;
    }

    const handlePointerActivity = () => {
      setIsMenuVisible(true);
      if (
        !showSettings &&
        !showCameraLab &&
        !showInfo &&
        !showLibrary &&
        !showLanguageMenu
      ) {
        scheduleIdleHide();
      }
    };

    window.addEventListener("pointermove", handlePointerActivity, {
      passive: true,
    });
    window.addEventListener("pointerdown", handlePointerActivity);

    return () => {
      window.removeEventListener("pointermove", handlePointerActivity);
      window.removeEventListener("pointerdown", handlePointerActivity);
    };
  }, [
    isMenuReady,
    scheduleIdleHide,
    shouldPersistChrome,
    showCameraLab,
    showInfo,
    showLanguageMenu,
    showLibrary,
    showSettings,
  ]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    seek(time);
  };

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) {
      return "0:00";
    }

    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await loadMidiFile(file);
    }
    e.target.blur();
  };

  const handleUploadDragEnter = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    uploadDragDepthRef.current += 1;
    setIsUploadDragActive(true);
  };

  const handleUploadDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsUploadDragActive(true);
  };

  const handleUploadDragLeave = () => {
    uploadDragDepthRef.current = Math.max(0, uploadDragDepthRef.current - 1);

    if (uploadDragDepthRef.current === 0) {
      setIsUploadDragActive(false);
    }
  };

  const handleUploadDrop = async (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const droppedFile = Array.from(e.dataTransfer.files).find(isMidiFile);

    resetUploadDragState();

    if (!droppedFile) {
      return;
    }

    await loadMidiFile(droppedFile);
  };

  const loadLibraryMidi = async (item: MidiLibraryItem) => {
    setIsLoadingLibrary(true);

    try {
      const response = await fetch(item.url);

      if (!response.ok) {
        throw new Error(`Failed to fetch ${item.url}: ${response.status}`);
      }

      const blob = await response.blob();
      const file = new File([blob], item.fileName, { type: "audio/midi" });
      const didLoad = await loadMidiFile(file, {
        libraryTrackId: item.id,
        title: item.title,
      });

      if (didLoad) {
        closeLibrary();
      }
    } catch (error) {
      console.error("Failed to load library MIDI", error);
      alert(copy.libraryLoadError);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  useEffect(() => {
    if (
      !initialLibraryTrack ||
      currentTrackTitle !== null ||
      initialTrackRequestedRef.current
    ) {
      return;
    }

    initialTrackRequestedRef.current = true;
    let isCancelled = false;

    const loadInitialTrack = async () => {
      setIsLoadingLibrary(true);

      try {
        const response = await fetch(initialLibraryTrack.url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${initialLibraryTrack.url}: ${response.status}`,
          );
        }

        const blob = await response.blob();

        if (isCancelled || currentTrackTitleRef.current !== null) {
          return;
        }

        const file = new File([blob], initialLibraryTrack.fileName, {
          type: "audio/midi",
        });

        await loadMidiFile(file, {
          libraryTrackId: initialLibraryTrack.id,
          title: initialLibraryTrack.title,
        });
      } catch (error) {
        console.error("Failed to load initial library MIDI", error);
      } finally {
        if (!isCancelled) {
          setIsLoadingLibrary(false);
        }
      }
    };

    void loadInitialTrack();

    return () => {
      isCancelled = true;
    };
  }, [currentTrackTitle, initialLibraryTrack, loadMidiFile]);

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const resetSettings = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    resetBpm();
  };

  const activeCameraView = settings.cameraView;
  const activeCameraDraft = cameraDraftPresets[activeCameraView];
  const savedActiveCameraPose = savedCameraPresets[activeCameraView];
  const isActiveCameraDirty = !cameraPoseEquals(
    activeCameraDraft,
    savedActiveCameraPose,
  );

  const handleVisualizerCameraPoseChange = useCallback(
    (pose: CameraPose) => {
      startTransition(() => {
        updateCameraDraft(activeCameraView, pose);
      });
    },
    [activeCameraView, updateCameraDraft],
  );

  const saveActiveCameraView = useCallback(() => {
    setSavedCameraPresets((currentPresets) => {
      const nextPresets = {
        ...currentPresets,
        [activeCameraView]: cloneCameraPose(cameraDraftPresets[activeCameraView]),
      };

      persistCameraPresets(nextPresets);
      return nextPresets;
    });
  }, [
    activeCameraView,
    cameraDraftPresets,
    persistCameraPresets,
    setSavedCameraPresets,
  ]);

  const revertActiveCameraView = useCallback(() => {
    updateCameraDraft(activeCameraView, savedCameraPresets[activeCameraView]);
  }, [activeCameraView, savedCameraPresets, updateCameraDraft]);

  const resetActiveCameraView = useCallback(() => {
    updateCameraDraft(activeCameraView, DEFAULT_CAMERA_PRESETS[activeCameraView]);
  }, [activeCameraView, updateCameraDraft]);

  const chromeVisible = shouldPersistChrome || (isMenuReady && isMenuVisible);
  const topChromeClass = cn(
    "absolute top-0 left-0 z-10 grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-6 sm:p-6",
    isMenuReady && "transition-opacity duration-700 ease-out",
    chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none",
  );
  const bottomChromeClass = cn(
    "absolute left-1/2 z-10 -translate-x-1/2",
    isMenuReady && "transition-opacity duration-700 ease-out",
    chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none",
  );
  const topChromeStyle = isMobile
    ? {
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.25rem)",
      }
    : undefined;
  const timelineChromeStyle = isMobile
    ? {
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 9.5rem)",
      }
    : undefined;
  const playChromeStyle = isMobile
    ? {
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 3.75rem)",
      }
    : undefined;
  const infoOverlayStyle = {
    paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
    paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
  } as const;
  const infoModalStyle = {
    maxHeight:
      "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)",
  } as const;

  return (
    <main
      className="relative h-screen w-full overflow-hidden bg-black font-sans"
    >
      <input
        type="file"
        accept=".mid,.midi"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <div
        className={cn("pointer-events-none", topChromeClass)}
        inert={!chromeVisible}
        style={topChromeStyle}
      >
        <h1 className="pointer-events-auto text-xl font-semibold tracking-[0.18em] text-[var(--nm-text)] sm:text-2xl">
          <span
            className={cn(
              "inline-block transition-opacity duration-150 ease-out motion-reduce:transition-none",
              isHeaderBrandVisible ? "opacity-100" : "opacity-0",
            )}
          >
            {headerBrandName}
          </span>
        </h1>

        <div className="pointer-events-none order-3 col-span-2 flex min-w-0 justify-center pt-0 sm:absolute sm:left-1/2 sm:top-0 sm:w-full sm:max-w-[min(46rem,calc(100%-24rem))] sm:-translate-x-1/2 sm:px-6 sm:pt-1">
          {(displayTrackMeta.title || displayTrackMeta.subtitle) && (
            <div className="max-w-[min(42rem,100%)] rounded-[1.4rem] border border-white/8 bg-black/25 px-4 py-2.5 text-center shadow-[0_12px_36px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:px-5 sm:py-3">
              <div
                className={cn(
                  "transition-opacity duration-150 ease-out motion-reduce:transition-none",
                  isTrackMetaVisible ? "opacity-100" : "opacity-0",
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
        </div>

        <div className="relative justify-self-end">
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {!isMobile && (
              <button
                onClick={(e) => {
                  fileInputRef.current?.click();
                  e.currentTarget.blur();
                }}
                onDragEnter={handleUploadDragEnter}
                onDragOver={handleUploadDragOver}
                onDragLeave={handleUploadDragLeave}
                onDrop={handleUploadDrop}
                className={cn(
                  "rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5",
                  isUploadDragActive
                    ? "nm-drag-active"
                    : "nm-raised",
                )}
                aria-label={copy.upload}
              >
                <Upload className="h-5 w-5" />
              </button>
            )}

            <div ref={libraryRef} className="relative">
              <button
                onClick={(e) => {
                  toggleLibrary();
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5",
                  showLibrary ? "nm-pressed" : "nm-raised",
                )}
                aria-label={copy.libraryButton}
              >
                {isLoadingLibrary ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
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
                      "nm-card pointer-events-auto fixed z-50 flex min-h-0 flex-col overflow-hidden text-[var(--nm-text)]",
                      isMobile
                        ? "nm-animate-sheet inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.6rem] p-3"
                        : "nm-animate-dropdown absolute top-12 right-0 bottom-auto left-auto h-[min(74vh,46rem)] w-[min(38rem,calc(100vw-3rem))] rounded-[1.75rem] p-4",
                    )}
                    style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" } : undefined}
                  >
                    {isMobile && <div className="nm-sheet-handle" />}
                    <div className="nm-well rounded-[1.2rem] p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold tracking-[0.06em] text-[var(--nm-text)] sm:text-lg">
                            {copy.libraryTitle}
                          </h3>
                          <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--nm-text-dim)] sm:text-[13px]">
                            {copy.libraryDescription}
                          </p>
                        </div>

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
                      className="mt-3 grid grid-cols-5 gap-2"
                      role="tablist"
                      aria-label={copy.libraryTabList}
                    >
                      {libraryPrimaryGroups.map((group) => {
                        const isTabActive =
                          activeLibraryGroup?.id === group.id;
                        const GroupIcon = group.icon;

                        return (
                          <button
                            key={group.id}
                            type="button"
                            role="tab"
                            aria-selected={isTabActive}
                            aria-label={group.label}
                            onClick={() =>
                              setActiveLibraryCategoryId(group.defaultCategoryId)
                            }
                            title={group.label}
                            className={cn(
                              "flex min-h-12 min-w-0 items-center justify-center rounded-[1.1rem] p-2.5 transition-all",
                              isTabActive
                                ? "nm-toggle-active"
                                : "nm-raised text-[var(--nm-text-dim)]",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                                isTabActive
                                  ? "border-black/10 bg-black/15 text-[var(--nm-bg)]"
                                  : "border-white/6 bg-white/[0.02] text-[var(--nm-text)]",
                              )}
                            >
                              <GroupIcon className="h-5 w-5" />
                            </span>
                            <span className="sr-only">{group.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>

                    {activeTrainSubcategories.length > 0 && (
                      <div
                        className="nm-tabs-rail mt-2 flex gap-2 overflow-x-auto pb-1"
                        role="tablist"
                        aria-label={copy.trainSubcategories}
                      >
                        {activeTrainSubcategories.map((category) => {
                          const isSubtabActive =
                            category.id === activeLibraryCategoryId;
                          const categoryMeta = getLibraryCategoryMeta(
                            category.id,
                            language,
                          );

                          return (
                            <button
                              key={category.id}
                              type="button"
                              role="tab"
                              aria-selected={isSubtabActive}
                              onClick={() => setActiveLibraryCategoryId(category.id)}
                              className={cn(
                                "shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-all",
                                isSubtabActive
                                  ? "nm-toggle-active"
                                  : "nm-raised text-[var(--nm-text-dim)]",
                              )}
                            >
                              {categoryMeta.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {activeLibraryCategory && (
                      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] p-2 sm:p-3">
                        <div className="px-2 py-1 sm:px-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--nm-text)]">
                              <ActiveLibraryGroupIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{activeLibraryHeading}</span>
                              {activeLibraryGroup &&
                                activeLibraryGroup.categoryIds.length > 1 && (
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
                          {visibleLibraryItems.length > 0 ? (
                            visibleLibraryItems.map((item) => {
                              const isActive = currentLibraryTrackId === item.id;

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => loadLibraryMidi(item)}
                                  disabled={isLoadingLibrary}
                                  className={cn(
                                    "nm-library-track flex w-full items-start gap-3 rounded-[1rem] px-3 py-3 text-left transition-all",
                                    isActive
                                      ? "nm-library-track-active"
                                      : "nm-list-item text-[var(--nm-text-dim)]",
                                    isLoadingLibrary && "opacity-70",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                                      isActive
                                        ? "border-white/8 bg-white text-[var(--nm-bg)] shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                                        : "border-white/6 bg-white/[0.03] text-[var(--nm-text-dim)]",
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
                                        <span className="mt-1 block truncate text-xs text-[var(--nm-text-faint)]">
                                          {getLocalizedTrackSubtitle(
                                            item.subtitle,
                                            language,
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
                              );
                            })
                          ) : (
                            <div className="flex flex-1 flex-col items-center justify-center rounded-[1.15rem] border border-dashed border-white/10 bg-black/10 px-6 text-center">
                              <ActiveLibraryCategoryIcon className="mb-3 h-6 w-6 text-[var(--nm-text-faint)]" />
                              <h4 className="text-sm font-semibold text-[var(--nm-text)]">
                                {copy.noTracksTitle(activeLibraryCategoryMeta.label)}
                              </h4>
                              <p className="mt-2 max-w-xs text-xs leading-relaxed text-[var(--nm-text-dim)]">
                                {copy.noTracksDescription}
                              </p>
                            </div>
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
                setShowInfo(true);
                setShowLanguageMenu(false);
                setShowSettings(false);
                closeLibrary();
                e.currentTarget.blur();
              }}
              className={cn(
                "rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5",
                showInfo ? "nm-pressed" : "nm-raised",
              )}
              aria-label={copy.infoButton}
            >
              <Info className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <div ref={languageRef} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    setShowLanguageMenu((current) => !current);
                    setShowSettings(false);
                    setShowInfo(false);
                    closeLibrary();
                    e.currentTarget.blur();
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-xl px-2.5 py-2 text-[var(--nm-text)] sm:px-3 sm:py-2.5",
                    showLanguageMenu ? "nm-pressed" : "nm-raised",
                  )}
                  aria-label={copy.languageButton}
                  aria-expanded={showLanguageMenu}
                  aria-haspopup="menu"
                >
                  <SettingsIcon className="h-4 w-4" />
                </button>

                {showLanguageMenu && isMobile && (
                  <button
                    type="button"
                    className="nm-animate-fade fixed inset-0 z-40 bg-black/60 backdrop-blur-[6px]"
                    onClick={() => setShowLanguageMenu(false)}
                    aria-label={copy.languageButton}
                  />
                )}
                {showLanguageMenu && (
                  <div
                    role="menu"
                    aria-label={copy.languageButton}
                    className={cn(
                      "nm-card pointer-events-auto z-50 flex flex-col gap-1 text-[var(--nm-text)]",
                      isMobile
                        ? "nm-animate-sheet fixed inset-x-0 bottom-0 rounded-t-[1.6rem] p-3"
                        : "nm-animate-dropdown absolute top-12 right-0 min-w-44 rounded-[1.1rem] p-2",
                    )}
                    style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" } : undefined}
                  >
                    {isMobile && <div className="nm-sheet-handle" />}
                    {LANGUAGE_OPTIONS.map((option) => {
                      const isSelected = language === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isSelected}
                          onClick={(e) => {
                            startTransition(() => {
                              setLanguage(option.value);
                            });
                            setShowLanguageMenu(false);
                            e.currentTarget.blur();
                          }}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-[0.95rem] px-3 py-2.5 text-left text-sm font-medium transition-colors",
                            isSelected
                              ? "nm-toggle-active"
                              : "nm-list-item text-[var(--nm-text)]",
                          )}
                        >
                          <span>{option.label}</span>
                          <Check
                            className={cn(
                              "h-4 w-4",
                              isSelected ? "opacity-100" : "opacity-0",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                ref={settingsTriggerRef}
                onClick={(e) => {
                  setShowSettings(!showSettings);
                  setShowLanguageMenu(false);
                  setShowInfo(false);
                  closeLibrary();
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5",
                  showSettings ? "nm-pressed" : "nm-raised",
                )}
                aria-label={copy.closeSettings}
              >
                <Globe className="h-5 w-5" />
              </button>
            </div>

            <button
              onClick={(e) => {
                e.currentTarget.blur();
                toggleFullscreen();
              }}
              className={cn(
                "rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5",
                isFullscreen ? "nm-pressed" : "nm-raised",
              )}
              aria-label={isFullscreen ? copy.fullScreenExit : copy.fullScreen}
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Expand className="h-5 w-5" />
              )}
            </button>
          </div>

          {showSettings && isMobile && (
            <button
              type="button"
              className="nm-animate-fade fixed inset-0 z-40 bg-black/60 backdrop-blur-[6px]"
              onClick={() => setShowSettings(false)}
              aria-label={copy.closeSettings}
            />
          )}
          {showSettings && (
            <div
              ref={settingsRef}
              className={cn(
                "nm-card pointer-events-auto z-50 flex flex-col gap-4 text-[var(--nm-text)]",
                isMobile
                  ? "nm-animate-sheet fixed inset-x-0 bottom-0 rounded-t-[1.6rem] p-5"
                  : "nm-animate-dropdown absolute top-12 right-0 w-80 rounded-xl p-5",
              )}
              style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" } : undefined}
            >
              {isMobile && <div className="nm-sheet-handle" />}
              <h2 className="border-b border-[var(--nm-border)] pb-2 text-lg font-semibold">
                {copy.settings}
              </h2>

              <div className="flex flex-col gap-3">
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
                    onChange={(e) => setBpm(parseInt(e.target.value, 10))}
                    className="nm-range"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-[var(--nm-text-dim)]">
                    <span>{copy.volume}</span>
                    <span>{settings.volumePercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    step={1}
                    value={settings.volumePercent}
                    onChange={(e) =>
                      updateSetting(
                        "volumePercent",
                        parseInt(e.target.value, 10),
                      )
                    }
                    className="nm-range"
                  />
                </div>

                <button
                  onClick={(e) => {
                    updateSetting("showMidiRoll", !settings.showMidiRoll);
                    e.currentTarget.blur();
                  }}
                  className={cn(
                    "mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    settings.showMidiRoll
                      ? "nm-toggle-active"
                      : "nm-raised text-[var(--nm-text)]",
                  )}
                >
                  <span>{copy.midiRoll}</span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      settings.showMidiRoll
                        ? "text-[var(--nm-bg)]"
                        : "text-[var(--nm-text-dim)]",
                    )}
                  >
                    {settings.showMidiRoll ? copy.show : copy.hide}
                  </span>
                </button>

                <div className="mt-2 flex flex-col gap-2">
                  <span className="text-sm text-[var(--nm-text-dim)]">{copy.cameraView}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {CAMERA_VIEWS.map((view) => (
                      <button
                        key={view}
                        onClick={(e) => {
                          updateSetting("cameraView", view);
                          e.currentTarget.blur();
                        }}
                        className={cn(
                          "rounded-xl px-2 py-1.5 text-xs font-medium",
                          settings.cameraView === view
                            ? "nm-toggle-active"
                            : "nm-raised text-[var(--nm-text-dim)]",
                        )}
                      >
                        {cameraViewLabels[view]}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    resetSettings();
                    e.currentTarget.blur();
                  }}
                  className="nm-destructive mt-2 w-full rounded-xl py-2 text-sm font-medium"
                >
                  {copy.resetDefaults}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showInfo && (
        <div
          ref={infoRef}
          className={cn(
            "nm-animate-fade fixed inset-0 z-[20000000] flex overflow-y-auto bg-black/70 backdrop-blur-sm",
            isMobile
              ? "items-end p-0"
              : "items-center justify-center p-4",
          )}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          style={isMobile ? undefined : infoOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowInfo(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setShowInfo(false);
            }
          }}
        >
          <div
            className={cn(
              "nm-scrollbar w-full overflow-y-auto border border-white/35 bg-[#070707] font-mono text-[var(--nm-text)] shadow-[0_28px_80px_rgba(0,0,0,0.6)]",
              isMobile
                ? "nm-animate-sheet max-h-[92dvh] rounded-t-[1.5rem] border-b-0 px-5 py-4"
                : "nm-animate-modal max-w-[42rem] rounded-[1.5rem] px-7 py-6",
            )}
            style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" } : infoModalStyle}
          >
            {isMobile && <div className="nm-sheet-handle" />}
            <div className="flex items-start justify-between gap-6 border-b border-white/12 pb-4">
              <h2 className="text-xl tracking-[0.08em] text-[var(--nm-text)]">
                {copy.aboutTitle}
              </h2>
              <button
                onClick={() => setShowInfo(false)}
                className="shrink-0 text-base tracking-[0.16em] text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
                aria-label={copy.closeAbout}
              >
                (X)
              </button>
            </div>
            <div className="mt-6 space-y-7 text-sm leading-[1.9] text-[var(--nm-text-dim)]">
              <section className="space-y-5">
                <div className="space-y-1">
                  <p className="text-[1.8rem] leading-none tracking-[0.04em] text-[var(--nm-text)]">
                    {displayBrandName}
                  </p>
                  <p className="tracking-[0.08em] text-[var(--nm-text-dim)]">
                    {copy.openSource} · MIT
                  </p>
                </div>

                <div className="flex flex-col gap-5 rounded-[1.35rem] border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-start sm:p-5">
                  <div className="mx-auto shrink-0 overflow-hidden rounded-[1.2rem] border border-white/12 bg-black/40 shadow-[0_16px_36px_rgba(0,0,0,0.35)]">
                    <Image
                      src="/jay-avatar.PNG"
                      alt="Portrait of itsjaydesu"
                      width={128}
                      height={128}
                      className="h-28 w-28 object-cover sm:h-32 sm:w-32"
                      priority
                    />
                  </div>

                  <div className="space-y-4">
                    {language === "ja" ? (
                      <>
                        <p>
                          <strong className="font-semibold text-[var(--nm-text)]">
                            {displayBrandName}
                          </strong>
                          はMIDIファイルを、目で楽しめるMIDIミュージックボックスに変えてくれます。
                          <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                            C
                          </span>
                          を押すとカメラアングルが切り替わり、
                          <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                            M
                          </span>
                          でMIDIロールを表示できます。内部ではリバーブに加えて、MIDIのベロシティやペダル情報も使っていて、ピアノがより自然に鳴るようにしています。収録したMIDIにはちょっとした懐かしさがあって、楽しんでもらえたらうれしいです。
                        </p>

                        <p>
                          オープンソースで、MITライセンスです。好きな用途に自由に使ってください。何かに使ったら、ぜひリンクを送ってもらえるとうれしいです。改善アイデアがあれば、プルリクエストも大歓迎です。
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong className="font-semibold text-[var(--nm-text)]">
                            {displayBrandName}
                          </strong>{" "}
                          turns a MIDI file into a visualized MIDI music box.
                          Try pressing{" "}
                          <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                            C
                          </span>{" "}
                          for different camera angles and{" "}
                          <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                            M
                          </span>{" "}
                          for a MIDI roll. There&apos;s some fun stuff under the
                          hood, it uses reverb and MIDI velocity/pedal data for
                          a more realistic piano sound. There&apos;s some nice
                          nostalgia in the MIDI files, hope you enjoy.
                        </p>

                        <p>
                          It&apos;s open source and MIT licensed. Please use it for
                          anything you like. If you use it for something, send
                          me a link. If you have ideas on how to improve it,
                          I&apos;m very open to pull requests.
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
                  {keyboardShortcuts.map((shortcut) => (
                    <div
                      key={shortcut.keyLabel}
                      className="flex items-baseline gap-4"
                    >
                      <span className="min-w-[4.75rem] shrink-0 text-[var(--nm-text)]">
                        [{shortcut.keyLabel}]
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
                  {copy.techTitle}
                </h3>
                <div className="space-y-3">
                  {aboutTechItems.map((item) => (
                    <p key={item.title}>
                      <span className="text-[var(--nm-text)]">{item.title}</span>{" "}
                      <span className="text-[var(--nm-text-dim)]">{item.description}</span>
                    </p>
                  ))}
                </div>
              </section>

              <section className="space-y-4 border-t border-white/12 pt-5">
                <h3 className="text-base tracking-[0.08em] text-[var(--nm-text)]">
                  {copy.creatorTitle}
                </h3>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[var(--nm-text)]">
                  {creatorLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-white/25 underline-offset-4 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
                <p className="text-xs leading-[1.8] text-[var(--nm-text-faint)]">
                  {creatorLinkNotes}
                </p>
              </section>
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
            onPoseChange={(pose) => updateCameraDraft(activeCameraView, pose)}
            onResetToDefault={resetActiveCameraView}
            onRevert={revertActiveCameraView}
            onSave={saveActiveCameraView}
            onSelectView={(view) => updateSetting("cameraView", view)}
          />
        </div>
      )}

      <div
        className={cn(
          bottomChromeClass,
          chromeVisible ? "pointer-events-auto" : "pointer-events-none",
          "bottom-28 flex w-full max-w-xl flex-col gap-2 px-4",
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
        className={cn(bottomChromeClass, "pointer-events-none bottom-10")}
        inert={!chromeVisible}
        style={playChromeStyle}
      >
        <button
          onClick={(e) => {
            void togglePlay();
            e.currentTarget.blur();
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
          {isAudioLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isPlaying ? (
            <Square className="h-5 w-5 fill-current" />
          ) : hasEnded ? (
            <RotateCcw className="h-5 w-5" />
          ) : (
            <Play className="ml-1 h-6 w-6 fill-current" />
          )}
        </button>
      </div>

      <div className="visualizer-intro h-full w-full">
        <Visualizer
          cameraPresets={cameraDraftPresets}
          isMobileView={isMobile}
          isCameraEditing={showCameraLab}
          notes={notes}
          onCameraPoseChange={handleVisualizerCameraPoseChange}
          settings={settings}
        />
      </div>

      <NoteCursor />
    </main>
  );
}
