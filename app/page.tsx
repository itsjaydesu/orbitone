"use client";

import { CameraLab } from "@/components/CameraLab";
import { Visualizer, VisualizerSettings } from "@/components/Visualizer";
import {
  MIDI_LIBRARY,
  MIDI_LIBRARY_CATEGORIES,
  MidiLibraryCategory,
  MidiLibraryItem,
} from "@/lib/library";
import {
  CAMERA_PRESETS_STORAGE_KEY,
  CAMERA_VIEWS,
  CAMERA_VIEW_LABELS,
  CameraPose,
  CameraPresetMap,
  CameraView,
  DEFAULT_CAMERA_PRESETS,
  cameraPoseEquals,
  cloneCameraPose,
  cloneCameraPresetMap,
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
  Square,
  Loader2,
  Upload,
  Settings as SettingsIcon,
  Info,
  X,
  Library,
  Music,
  Piano,
  Search,
  TrainFront,
  Expand,
  Map as MapIcon,
  Minimize,
  type LucideIcon,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import * as Tone from "tone";

type AppSettings = VisualizerSettings & {
  volumePercent: number;
};

const DEFAULT_SETTINGS: AppSettings = {
  volumePercent: 100,
  showMidiRoll: false,
  cameraView: "topThird",
};

const MENU_REVEAL_DELAY_MS = 3000;
const MENU_IDLE_HIDE_MS = 2000;
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

const getLibraryCategoryMeta = (categoryId: string): LibraryCategoryMeta => {
  switch (categoryId) {
    case "classical-piano":
      return {
        blurb: "Concert works, nocturnes, and expressive piano repertoire.",
        icon: Piano,
        shortLabel: "Classical",
      };
    case "film-tv-anime":
      return {
        blurb: "Big-screen themes, anime openings, and prestige TV motifs.",
        icon: Clapperboard,
        shortLabel: "Screen",
      };
    case "games-internet":
      return {
        blurb: "Game scores, online relics, and endlessly replayable hooks.",
        icon: Gamepad2,
        shortLabel: "Games",
      };
    case "pop-electronic":
      return {
        blurb: "Anthems, club textures, and bright electronic melodies.",
        icon: Disc3,
        shortLabel: "Pop",
      };
    case "train-stations":
      return {
        blurb: "Station-specific Japanese departure melodies and local favorites.",
        icon: TrainFront,
        shortLabel: "Stations",
      };
    case "train-standard-chimes":
      return {
        blurb: "Classic JR standards, shared chimes, and core platform signals.",
        icon: BellRing,
        shortLabel: "Chimes",
      };
    case "train-signature-system":
      return {
        blurb: "Named rail melodies, medleys, and signature network themes.",
        icon: MapIcon,
        shortLabel: "Signature",
      };
    default:
      return {
        blurb: "Curated MIDI selections from the Orbitone library.",
        icon: Music,
        shortLabel: "Library",
      };
  }
};

const LIBRARY_PRIMARY_GROUPS: LibraryPrimaryGroup[] = [
  {
    id: "classical-piano",
    label: "Classical & Piano",
    shortLabel: "Classical",
    icon: Piano,
    blurb: "Concert works, nocturnes, and expressive piano repertoire.",
    categoryIds: ["classical-piano"],
    defaultCategoryId: "classical-piano",
  },
  {
    id: "film-tv-anime",
    label: "Film, TV & Anime",
    shortLabel: "Screen",
    icon: Clapperboard,
    blurb: "Big-screen themes, anime openings, and prestige TV motifs.",
    categoryIds: ["film-tv-anime"],
    defaultCategoryId: "film-tv-anime",
  },
  {
    id: "games-internet",
    label: "Games & Internet",
    shortLabel: "Games",
    icon: Gamepad2,
    blurb: "Game scores, online relics, and endlessly replayable hooks.",
    categoryIds: ["games-internet"],
    defaultCategoryId: "games-internet",
  },
  {
    id: "pop-electronic",
    label: "Pop & Electronic",
    shortLabel: "Pop",
    icon: Disc3,
    blurb: "Anthems, club textures, and bright electronic melodies.",
    categoryIds: ["pop-electronic"],
    defaultCategoryId: "pop-electronic",
  },
  {
    id: "japanese-train-melodies",
    label: "Japanese Train Melodies",
    shortLabel: "Trains",
    icon: TrainFront,
    blurb:
      "Station jingles, JR standards, and signature departure themes from across Japan's rail network.",
    categoryIds: [...TRAIN_LIBRARY_CATEGORY_IDS],
    defaultCategoryId: "train-stations",
  },
];

const LIBRARY_PRIMARY_GROUP_INDEX = new Map(
  LIBRARY_PRIMARY_GROUPS.flatMap((group) =>
    group.categoryIds.map((categoryId) => [categoryId, group] as const),
  ),
);

const stripMidiExtension = (fileName: string) =>
  fileName.replace(/\.(mid|midi)$/i, "");

const getRandomLibraryTrack = (): MidiLibraryItem | null => {
  if (MIDI_LIBRARY.length === 0) {
    return null;
  }

  return MIDI_LIBRARY[Math.floor(Math.random() * MIDI_LIBRARY.length)] ?? null;
};

const formatLoadedTitle = (fileName: string) => {
  const stem = stripMidiExtension(fileName).trim();

  if (stem.length === 0) {
    return "Untitled MIDI";
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
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isMenuReady, setIsMenuReady] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isUploadDragActive, setIsUploadDragActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCameraLab, setShowCameraLab] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [activeLibraryCategoryId, setActiveLibraryCategoryId] = useState(
    DEFAULT_LIBRARY_CATEGORY_ID,
  );
  const [libraryQuery, setLibraryQuery] = useState("");
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
    togglePlay,
    notes,
    loadMidi,
    duration,
    seek,
    bpm,
    setBpm,
    resetBpm,
  } = useMusic({
    volumePercent: settings.volumePercent,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const requestRef = useRef<number | undefined>(undefined);
  const idleTimerRef = useRef<number | undefined>(undefined);
  const uploadDragDepthRef = useRef(0);
  const infoRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const libraryListRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const cameraLabRef = useRef<HTMLDivElement>(null);
  const currentTrackTitleRef = useRef<string | null>(null);
  const initialTrackRequestedRef = useRef(false);
  const deferredLibraryQuery = useDeferredValue(libraryQuery);
  const activeLibraryCategory = useMemo<MidiLibraryCategory | null>(
    () =>
      LIBRARY_CATEGORY_INDEX.get(activeLibraryCategoryId) ??
      MIDI_LIBRARY_CATEGORIES[0] ??
      null,
    [activeLibraryCategoryId],
  );
  const activeLibraryGroup = useMemo<LibraryPrimaryGroup | null>(
    () =>
      LIBRARY_PRIMARY_GROUP_INDEX.get(activeLibraryCategoryId) ??
      LIBRARY_PRIMARY_GROUPS[0] ??
      null,
    [activeLibraryCategoryId],
  );
  const activeLibraryCategoryMeta = activeLibraryCategory
    ? getLibraryCategoryMeta(activeLibraryCategory.id)
    : getLibraryCategoryMeta("");
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
    activeLibraryGroup?.label ?? activeLibraryCategory?.label ?? "MIDI Library";
  const activeLibraryDescription = activeLibraryGroup
    ? activeLibraryGroup.categoryIds.length === 1
      ? activeLibraryGroup.blurb
      : `${activeLibraryGroup.blurb} Currently showing ${activeLibraryCategory?.label ?? "the active set"}.`
    : activeLibraryCategoryMeta.blurb;
  const currentLibraryTrack = useMemo<MidiLibraryItem | null>(
    () =>
      currentLibraryTrackId
        ? LIBRARY_TRACK_INDEX.get(currentLibraryTrackId) ?? null
        : null,
    [currentLibraryTrackId],
  );
  const currentTrackSubtitle = currentLibraryTrack?.subtitle ?? null;
  const filteredLibraryItems = useMemo(() => {
    if (!activeLibraryCategory) {
      return [];
    }

    const normalizedQuery = deferredLibraryQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return activeLibraryCategory.items;
    }

    return activeLibraryCategory.items.filter((item) =>
      [item.title, item.subtitle, item.fileName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [activeLibraryCategory, deferredLibraryQuery]);

  const updateProgress = useCallback(() => {
    if (isPlaying) {
      setProgress(Tone.Transport.seconds);
      requestRef.current = requestAnimationFrame(updateProgress);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(updateProgress);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      setProgress(Tone.Transport.seconds);
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, updateProgress]);


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
    if (showLibrary && currentLibraryTrack) {
      if (currentLibraryTrack) {
        setActiveLibraryCategoryId(currentLibraryTrack.categoryId);
      }
    }

    if (!showLibrary) {
      setLibraryQuery("");
    }
  }, [currentLibraryTrack, showLibrary]);

  useEffect(() => {
    if (!showLibrary) {
      return;
    }

    libraryListRef.current?.scrollTo({ behavior: "auto", top: 0 });
  }, [activeLibraryCategoryId, deferredLibraryQuery, showLibrary]);

  useEffect(() => {
    const hasOpenLayer = showInfo || showLibrary || showSettings || showCameraLab;

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
        clickedInsideSettings ||
        clickedInsideCameraLab
      ) {
        return;
      }

      setShowInfo(false);
      setShowLibrary(false);
      setShowSettings(false);
      setShowCameraLab(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showCameraLab, showInfo, showLibrary, showSettings]);

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
      setProgress(0);
      const didLoad = await loadMidi(file);

      if (!didLoad) {
        return false;
      }

      setCurrentTrackTitle(options?.title ?? formatLoadedTitle(file.name));
      setCurrentLibraryTrackId(options?.libraryTrackId ?? null);

      return true;
    },
    [loadMidi],
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
    idleTimerRef.current = window.setTimeout(() => {
      setIsMenuVisible(false);
    }, MENU_IDLE_HIDE_MS);
  }, [clearIdleTimer]);

  useEffect(() => {
    const revealTimer = window.setTimeout(() => {
      setIsMenuReady(true);
      setIsMenuVisible(true);
      scheduleIdleHide();
    }, MENU_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(revealTimer);
      clearIdleTimer();
    };
  }, [clearIdleTimer, scheduleIdleHide]);

  useEffect(() => {
    if (!isMenuReady) {
      return;
    }

    if (showSettings || showCameraLab || showInfo || showLibrary) {
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
    showCameraLab,
    showInfo,
    showLibrary,
    showSettings,
  ]);

  useEffect(() => {
    if (!isMenuReady) {
      return;
    }

    const handlePointerActivity = () => {
      setIsMenuVisible(true);
      if (!showSettings && !showCameraLab && !showInfo && !showLibrary) {
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
    showCameraLab,
    showInfo,
    showLibrary,
    showSettings,
  ]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setProgress(time);
    seek(time);
  };

  const formatTime = (secs: number) => {
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
      alert("Failed to load MIDI file from library.");
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

  const chromeVisible = isMenuReady && isMenuVisible;
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
      >
        <h1 className="text-xl font-semibold tracking-[0.18em] text-[var(--nm-text)] sm:text-2xl">
          orbitone
        </h1>

        <div className="pointer-events-none order-3 col-span-2 flex min-w-0 justify-center pt-0 sm:absolute sm:left-1/2 sm:top-0 sm:w-full sm:max-w-[min(46rem,calc(100%-24rem))] sm:-translate-x-1/2 sm:px-6 sm:pt-1">
          {currentTrackTitle && (
            <div className="max-w-[min(42rem,100%)] rounded-[1.4rem] border border-white/8 bg-black/25 px-4 py-2.5 text-center shadow-[0_12px_36px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:px-5 sm:py-3">
              <div className="truncate text-sm font-medium tracking-[0.08em] text-[var(--nm-text)] sm:text-base">
                {currentTrackTitle}
              </div>
              {currentTrackSubtitle && (
                <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--nm-text-faint)] sm:text-xs">
                  {currentTrackSubtitle}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative justify-self-end">
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
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
              aria-label="Upload MIDI"
            >
              <Upload className="h-5 w-5" />
            </button>

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
                aria-label="MIDI Library"
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
                    className="nm-animate-fade fixed inset-0 z-40 bg-black/35 backdrop-blur-[6px] sm:bg-black/20"
                    onClick={closeLibrary}
                    aria-label="Close MIDI library"
                  />

                  <div
                    role="dialog"
                    aria-modal="true"
                    className="nm-card nm-animate-dropdown pointer-events-auto fixed inset-x-3 top-20 bottom-4 z-50 flex min-h-0 flex-col overflow-hidden rounded-[1.6rem] p-3 text-[var(--nm-text)] sm:absolute sm:top-12 sm:right-0 sm:bottom-auto sm:left-auto sm:h-[min(74vh,46rem)] sm:w-[min(38rem,calc(100vw-3rem))] sm:rounded-[1.75rem] sm:p-4"
                  >
                    <div className="nm-well rounded-[1.2rem] p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold tracking-[0.06em] text-[var(--nm-text)] sm:text-lg">
                            MIDI Library
                          </h3>
                          <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--nm-text-dim)] sm:text-[13px]">
                            Choose a collection, then search within the active set. Japanese train melodies open a second row for stations, standards, and signature themes.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={closeLibrary}
                          className="nm-raised rounded-full p-2 text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
                          aria-label="Close MIDI library"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <label className="nm-input mt-4 flex items-center gap-3 rounded-2xl px-3 py-2.5">
                        <Search className="h-4 w-4 shrink-0 text-[var(--nm-text-faint)]" />
                        <input
                          type="search"
                          value={libraryQuery}
                          onChange={(event) => setLibraryQuery(event.target.value)}
                          placeholder={`Search ${activeLibraryCategory?.label ?? activeLibraryGroup?.label ?? "the library"}`}
                          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--nm-text)] outline-none placeholder:text-[var(--nm-text-faint)]"
                          aria-label="Search MIDI library"
                        />
                      </label>
                    </div>

                    <div
                      className="mt-3 grid grid-cols-5 gap-2"
                      role="tablist"
                      aria-label="Library collections"
                    >
                      {LIBRARY_PRIMARY_GROUPS.map((group) => {
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
                        aria-label="Japanese train melody subsets"
                      >
                        {activeTrainSubcategories.map((category) => {
                          const isSubtabActive =
                            category.id === activeLibraryCategoryId;
                          const categoryMeta = getLibraryCategoryMeta(
                            category.id,
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
                          {filteredLibraryItems.length > 0 ? (
                            filteredLibraryItems.map((item) => {
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
                                          {item.title}
                                        </span>
                                        <span className="mt-1 block truncate text-xs text-[var(--nm-text-faint)]">
                                          {item.subtitle}
                                        </span>
                                      </span>
                                      <span className="flex shrink-0 items-center gap-2">
                                        {isActive && (
                                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--nm-text)]">
                                            Loaded
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
                                No matches in {activeLibraryCategory.label}
                              </h4>
                              <p className="mt-2 max-w-xs text-xs leading-relaxed text-[var(--nm-text-dim)]">
                                Try a different search term or switch tabs to another collection.
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
                setShowSettings(false);
                closeLibrary();
                e.currentTarget.blur();
              }}
              className={cn(
                "rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5",
                showInfo ? "nm-pressed" : "nm-raised",
              )}
            >
              <Info className="h-5 w-5" />
            </button>

            <button
              ref={settingsTriggerRef}
              onClick={(e) => {
                setShowSettings(!showSettings);
                setShowInfo(false);
                closeLibrary();
                e.currentTarget.blur();
              }}
              className={cn(
                "rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5",
                showSettings ? "nm-pressed" : "nm-raised",
              )}
            >
              <SettingsIcon className="h-5 w-5" />
            </button>

            <button
              onClick={(e) => {
                e.currentTarget.blur();
                toggleFullscreen();
              }}
              className={cn(
                "rounded-xl p-2 text-[var(--nm-text)] sm:p-2.5",
                isFullscreen ? "nm-pressed" : "nm-raised",
              )}
              aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Expand className="h-5 w-5" />
              )}
            </button>
          </div>

          {showSettings && (
            <div
              ref={settingsRef}
              className="nm-card nm-animate-dropdown pointer-events-auto absolute top-12 right-0 z-50 flex w-80 flex-col gap-4 rounded-xl p-5 text-[var(--nm-text)]"
            >
              <h2 className="border-b border-[var(--nm-border)] pb-2 text-lg font-semibold">
                Settings
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
                    <span>Volume</span>
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
                  <span>MIDI Roll</span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      settings.showMidiRoll
                        ? "text-[var(--nm-bg)]"
                        : "text-[var(--nm-text-dim)]",
                    )}
                  >
                    {settings.showMidiRoll ? "On" : "Off"}
                  </span>
                </button>

                <div className="mt-2 flex flex-col gap-2">
                  <span className="text-sm text-[var(--nm-text-dim)]">Camera View</span>
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
                        {CAMERA_VIEW_LABELS[view]}
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
                  Reset to Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showInfo && (
        <div
          ref={infoRef}
          className="nm-animate-fade fixed inset-0 z-[20000000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
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
          <div className="nm-card nm-animate-modal w-full max-w-md rounded-2xl p-6 text-[var(--nm-text)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">About</h2>
              <button
                onClick={() => setShowInfo(false)}
                className="nm-raised rounded-full p-2 text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 text-sm leading-relaxed text-[var(--nm-text-dim)]">
              <p>
                <strong className="text-[var(--nm-text)]">orbitone</strong> turns a MIDI performance into an interactive 3D score. Each note is placed on a concentric grand staff and keeps its original timing, sustain, and velocity, so you can hear the piece while reading a more faithful picture of how it was played.
              </p>
              <div className="nm-well rounded-2xl p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--nm-text)]">
                  Powered By
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40"></span>
                    <span className="font-medium text-[var(--nm-text)]">
                      Three.js & R3F
                    </span>{" "}
                    - 3D Rendering
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20"></span>
                    <span className="font-medium text-[var(--nm-text)]">Tone.js</span>{" "}
                    - Audio Synthesis
                  </li>
                </ul>
              </div>
              <div className="pt-2">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--nm-text)]">
                  Created by itsjaydesu
                </h3>
                <div className="flex gap-4">
                  <a
                    href="http://github.com/itsjaydesu"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nm-link flex items-center gap-1 rounded-xl px-3 py-1.5 text-[var(--nm-text-dim)]"
                  >
                    GitHub
                  </a>
                  <a
                    href="http://x.com/itsjaydesu"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nm-link flex items-center gap-1 rounded-xl px-3 py-1.5 text-[var(--nm-text-dim)]"
                  >
                    X (Twitter)
                  </a>
                  <a
                    href="https://itsjaydesu.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nm-link flex items-center gap-1 rounded-xl px-3 py-1.5 text-[var(--nm-text-dim)]"
                  >
                    Website
                  </a>
                </div>
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
      >
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={progress}
          onChange={handleSeek}
          className="nm-seekbar"
        />
        <div className="flex justify-between font-mono text-xs text-[var(--nm-text-dim)]">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div
        className={cn(bottomChromeClass, "pointer-events-none bottom-10")}
        inert={!chromeVisible}
      >
        <button
          onClick={(e) => {
            togglePlay();
            e.currentTarget.blur();
          }}
          disabled={isAudioLoading}
          aria-label={
            isAudioLoading
              ? "Loading piano"
              : isPlaying
                ? "Stop playback"
                : "Start playback"
          }
          className="nm-play pointer-events-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-[var(--nm-text)] disabled:opacity-50"
        >
          {isAudioLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isPlaying ? (
            <Square className="h-5 w-5 fill-current" />
          ) : (
            <Play className="ml-1 h-6 w-6 fill-current" />
          )}
        </button>
      </div>

      <div className="visualizer-intro h-full w-full">
        <Visualizer
          cameraPresets={cameraDraftPresets}
          isCameraEditing={showCameraLab}
          notes={notes}
          onCameraPoseChange={handleVisualizerCameraPoseChange}
          settings={settings}
        />
      </div>
    </main>
  );
}
