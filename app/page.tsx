"use client";

import { Visualizer, VisualizerSettings } from "@/components/Visualizer";
import { MIDI_LIBRARY, MidiLibraryItem } from "@/lib/library";
import { useMusic } from "@/hooks/useMusic";
import { cn } from "@/lib/utils";
import {
  Play,
  Square,
  Loader2,
  Upload,
  Settings as SettingsIcon,
  Info,
  X,
  Library,
  Music,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import * as Tone from "tone";

type AppSettings = VisualizerSettings & {
  volumePercent: number;
};

const CAMERA_VIEWS: VisualizerSettings["cameraView"][] = [
  "topThird",
  "front",
  "top",
  "side",
  "dynamic",
  "isometric",
  "closeup",
  "vortex",
  "orbit",
  "zenith",
];

const CAMERA_VIEW_LABELS: Record<VisualizerSettings["cameraView"], string> = {
  topThird: "Top Third",
  front: "Front",
  top: "Top",
  side: "Side",
  dynamic: "Dynamic",
  isometric: "Isometric",
  closeup: "Closeup",
  vortex: "Vortex",
  orbit: "Orbit",
  zenith: "Zenith",
};

const DEFAULT_SETTINGS: AppSettings = {
  volumePercent: 100,
  showMidiRoll: false,
  cameraView: "topThird",
};

const MENU_REVEAL_DELAY_MS = 3000;
const MENU_IDLE_HIDE_MS = 2000;

export default function Home() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isMenuReady, setIsMenuReady] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") {
        return;
      }

      if (
        e.target instanceof HTMLInputElement &&
        ["text", "number", "password", "email"].includes(e.target.type)
      ) {
        return;
      }

      if (e.target instanceof HTMLTextAreaElement) {
        return;
      }

      e.preventDefault();
      togglePlay();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

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

    if (showSettings || showInfo || showLibrary) {
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
      if (!showSettings && !showInfo && !showLibrary) {
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
  }, [isMenuReady, scheduleIdleHide, showInfo, showLibrary, showSettings]);

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
      setProgress(0);
      await loadMidi(file);
    }
    e.target.blur();
  };

  const loadLibraryMidi = async (item: MidiLibraryItem) => {
    setIsLoadingLibrary(true);
    setShowLibrary(false);

    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      const file = new File([blob], item.fileName, { type: "audio/midi" });
      setProgress(0);
      await loadMidi(file);
    } catch (error) {
      console.error("Failed to load library MIDI", error);
      alert("Failed to load MIDI file from library.");
    } finally {
      setIsLoadingLibrary(false);
    }
  };

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

  const chromeVisible = isMenuReady && isMenuVisible;
  const topChromeClass = cn(
    "absolute top-0 left-0 z-10 flex w-full items-start justify-between p-6 transition-[opacity,transform] duration-700 ease-out",
    chromeVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-6",
  );
  const bottomChromeClass = cn(
    "absolute left-1/2 z-10 -translate-x-1/2 transition-[opacity,transform] duration-700 ease-out",
    chromeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
  );

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
        className={cn("pointer-events-none", topChromeClass)}
        inert={!chromeVisible}
      >
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl">
          <h1 className="text-2xl font-semibold tracking-[0.18em] text-white">
            orbitone
          </h1>
        </div>

        <div className="relative">
          <div className="pointer-events-auto flex items-center gap-3">
            <button
              onClick={(e) => {
                fileInputRef.current?.click();
                e.currentTarget.blur();
              }}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-md transition-all hover:bg-white/20"
            >
              <Upload className="h-4 w-4" />
              Upload MIDI
            </button>

            <div className="relative">
              <button
                onClick={(e) => {
                  setShowLibrary(!showLibrary);
                  setShowSettings(false);
                  setShowInfo(false);
                  e.currentTarget.blur();
                }}
                className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm text-white backdrop-blur-md transition-all ${
                  showLibrary
                    ? "border-white/30 bg-white/30"
                    : "border-white/10 bg-white/10 hover:bg-white/20"
                }`}
              >
                {isLoadingLibrary ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Library className="h-4 w-4" />
                )}
                Library
              </button>

              {showLibrary && (
                <div className="pointer-events-auto absolute top-12 right-0 z-50 flex w-80 flex-col gap-2 rounded-xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-xl">
                  <h3 className="mb-1 border-b border-white/10 px-2 py-1 text-sm font-semibold text-white">
                    MIDI Library
                  </h3>
                  {MIDI_LIBRARY.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => loadLibraryMidi(item)}
                      className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Music className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium">
                            {item.title}
                          </span>
                          <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                            {item.durationLabel}
                          </span>
                        </div>
                        <span className="truncate text-xs text-gray-500">
                          {item.artist}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={(e) => {
                setShowInfo(true);
                setShowSettings(false);
                setShowLibrary(false);
                e.currentTarget.blur();
              }}
              className={`rounded-md border p-2 text-white backdrop-blur-md transition-all ${
                showInfo
                  ? "border-white/30 bg-white/30"
                  : "border-white/10 bg-white/10 hover:bg-white/20"
              }`}
            >
              <Info className="h-5 w-5" />
            </button>

            <button
              onClick={(e) => {
                setShowSettings(!showSettings);
                setShowInfo(false);
                setShowLibrary(false);
                e.currentTarget.blur();
              }}
              className={`rounded-md border p-2 text-white backdrop-blur-md transition-all ${
                showSettings
                  ? "border-white/30 bg-white/30"
                  : "border-white/10 bg-white/10 hover:bg-white/20"
              }`}
            >
              <SettingsIcon className="h-5 w-5" />
            </button>
          </div>

          {showSettings && (
            <div className="pointer-events-auto absolute top-12 right-0 z-50 flex w-80 flex-col gap-4 rounded-xl border border-white/10 bg-black/90 p-5 text-white shadow-2xl backdrop-blur-xl">
              <h2 className="border-b border-white/10 pb-2 text-lg font-semibold">
                Settings
              </h2>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-400">
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
                    className="accent-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-400">
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
                    className="accent-white"
                  />
                </div>

                <label className="mt-2 flex cursor-pointer items-center justify-between text-sm">
                  <span>Show MIDI Roll</span>
                  <input
                    type="checkbox"
                    checked={settings.showMidiRoll}
                    onChange={(e) => {
                      updateSetting("showMidiRoll", e.target.checked);
                      e.target.blur();
                    }}
                    className="h-4 w-4 accent-white"
                  />
                </label>

                <div className="mt-2 flex flex-col gap-2">
                  <span className="text-sm text-gray-400">Camera View</span>
                  <div className="grid grid-cols-3 gap-2">
                    {CAMERA_VIEWS.map((view) => (
                      <button
                        key={view}
                        onClick={(e) => {
                          updateSetting("cameraView", view);
                          e.currentTarget.blur();
                        }}
                        className={`rounded px-2 py-1.5 text-xs transition-all ${
                          settings.cameraView === view
                            ? "bg-white font-medium text-black"
                            : "bg-white/10 text-white hover:bg-white/20"
                        }`}
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
                  className="mt-2 w-full rounded-lg border border-red-500/30 bg-red-500/20 py-2 text-sm font-medium text-red-200 transition-all hover:bg-red-500/40"
                >
                  Reset to Default
                </button>
              </div>
            </div>
          )}

          {showInfo && (
            <div
              className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
              <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 text-white shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold">About</h2>
                  <button
                    onClick={() => setShowInfo(false)}
                    className="text-gray-400 transition-colors hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-4 text-sm leading-relaxed text-gray-300">
                  <p>
                    <strong>orbitone</strong> is an interactive 3D music
                    experience. It maps MIDI notes to a concentric grand staff
                    while preserving sustain and velocity for a more faithful
                    visual read of the performance.
                  </p>
                  <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white">
                      Powered By
                    </h3>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                        <span className="font-medium text-white">
                          Gemini 3.1 Pro
                        </span>{" "}
                        - AI Assistant
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400"></span>
                        <span className="font-medium text-white">
                          Three.js & R3F
                        </span>{" "}
                        - 3D Rendering
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                        <span className="font-medium text-white">Tone.js</span>{" "}
                        - Audio Synthesis
                      </li>
                    </ul>
                  </div>
                  <div className="pt-2">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white">
                      Created by itsjaydesu
                    </h3>
                    <div className="flex gap-4">
                      <a
                        href="http://github.com/itsjaydesu"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        GitHub
                      </a>
                      <a
                        href="http://x.com/itsjaydesu"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        X (Twitter)
                      </a>
                      <a
                        href="https://itsjaydesu.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        Website
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-white"
        />
        <div className="flex justify-between font-mono text-xs text-gray-400">
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
          className="pointer-events-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-white/20 disabled:cursor-wait disabled:opacity-50"
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
        <Visualizer notes={notes} isPlaying={isPlaying} settings={settings} />
      </div>
    </main>
  );
}
