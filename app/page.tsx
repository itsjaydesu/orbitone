'use client';

import { Visualizer, VisualizerSettings } from '@/components/Visualizer';
import { useMusic, MusicSettings } from '@/hooks/useMusic';
import { Play, Square, Loader2, Upload, Camera, Activity, Settings as SettingsIcon, Info, X, Library, Music } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

const DEFAULT_SETTINGS = {
  reverbRoomSize: 0.6,
  timeWindow: 10,
  bloomIntensity: 2.0,
  showMidiRoll: true,
  cameraView: 'front' as VisualizerSettings['cameraView']
};

export default function Home() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  const { isPlaying, isLoaded, togglePlay, notes, loadMidi, duration, seek, bpm, setBpm } = useMusic({
    reverbRoomSize: settings.reverbRoomSize
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const requestRef = useRef<number | undefined>(undefined);

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
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      setProgress(Tone.Transport.seconds);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, updateProgress]);

  // Spacebar listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (e.target instanceof HTMLInputElement && ['text', 'number', 'password', 'email'].includes(e.target.type)) return;
        if (e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setProgress(time);
    seek(time);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadMidi(file);
    }
    e.target.blur();
  };

  const loadLibraryMidi = async (url: string, filename: string) => {
    setIsLoadingLibrary(true);
    setShowLibrary(false);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "audio/midi" });
      await loadMidi(file);
    } catch (error) {
      console.error("Failed to load library MIDI", error);
      alert("Failed to load MIDI file from library.");
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const updateSetting = (key: keyof typeof DEFAULT_SETTINGS, value: any) => {
    setSettings(s => ({ ...s, [key]: value }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <main className="relative w-full h-screen bg-black overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full p-6 z-10 pointer-events-none flex justify-between items-start">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">MIDI Music Box</h1>
        </div>
        
        <div className="relative">
          <div className="flex items-center gap-3 pointer-events-auto">
            <input 
              type="file" 
              accept=".mid,.midi" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <button
              onClick={(e) => { fileInputRef.current?.click(); e.currentTarget.blur(); }}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-md backdrop-blur-md transition-all border border-white/10 text-sm"
            >
              <Upload className="w-4 h-4" />
              Upload MIDI
            </button>
            <div className="relative">
              <button 
                onClick={(e) => { setShowLibrary(!showLibrary); setShowSettings(false); setShowInfo(false); e.currentTarget.blur(); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-md backdrop-blur-md transition-all border text-sm ${showLibrary ? 'bg-white/30 border-white/30 text-white' : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'}`}
              >
                {isLoadingLibrary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Library className="w-4 h-4" />}
                Library
              </button>
              
              {showLibrary && (
                <div className="absolute top-12 right-0 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-3 z-50 flex flex-col gap-2 shadow-2xl pointer-events-auto">
                  <h3 className="text-white text-sm font-semibold px-2 py-1 border-b border-white/10 mb-1">Example MIDI Files</h3>
                  <button 
                    onClick={() => loadLibraryMidi('https://magenta.github.io/magenta-js/music/demos/melody.mid', 'melody.mid')}
                    className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-gray-200 hover:text-white"
                  >
                    <Music className="w-4 h-4 text-emerald-400" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Melody</span>
                      <span className="text-xs text-gray-500">Magenta Demo</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => loadLibraryMidi('https://magenta.github.io/magenta-js/music/demos/trio.mid', 'trio.mid')}
                    className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-gray-200 hover:text-white"
                  >
                    <Music className="w-4 h-4 text-blue-400" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Trio</span>
                      <span className="text-xs text-gray-500">Magenta Demo</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
            <button 
              onClick={(e) => { setShowInfo(true); setShowSettings(false); setShowLibrary(false); e.currentTarget.blur(); }} 
              className={`p-2 rounded-md text-white backdrop-blur-md border transition-all ${showInfo ? 'bg-white/30 border-white/30' : 'bg-white/10 hover:bg-white/20 border-white/10'}`}
            >
              <Info className="w-5 h-5" />
            </button>
            <button 
              onClick={(e) => { setShowSettings(!showSettings); setShowInfo(false); setShowLibrary(false); e.currentTarget.blur(); }} 
              className={`p-2 rounded-md text-white backdrop-blur-md border transition-all ${showSettings ? 'bg-white/30 border-white/30' : 'bg-white/10 hover:bg-white/20 border-white/10'}`}
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>

          {showSettings && (
            <div className="absolute top-12 right-0 w-80 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-5 z-50 flex flex-col gap-4 text-white shadow-2xl pointer-events-auto">
              <h2 className="text-lg font-semibold border-b border-white/10 pb-2">Settings</h2>
              
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>BPM</span>
                    <span>{bpm}</span>
                  </div>
                  <input type="range" min={30} max={300} step={1} value={bpm} onChange={(e) => setBpm(parseInt(e.target.value))} className="accent-white" />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Reverb Size</span>
                    <span>{settings.reverbRoomSize}</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={settings.reverbRoomSize} onChange={(e) => updateSetting('reverbRoomSize', parseFloat(e.target.value))} className="accent-white" />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Time Window (s)</span>
                    <span>{settings.timeWindow}</span>
                  </div>
                  <input type="range" min={4} max={30} step={1} value={settings.timeWindow} onChange={(e) => updateSetting('timeWindow', parseFloat(e.target.value))} className="accent-white" />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Bloom Intensity</span>
                    <span>{settings.bloomIntensity}</span>
                  </div>
                  <input type="range" min={0} max={5} step={0.1} value={settings.bloomIntensity} onChange={(e) => updateSetting('bloomIntensity', parseFloat(e.target.value))} className="accent-white" />
                </div>

                <label className="flex items-center justify-between text-sm mt-2 cursor-pointer">
                  <span>Show MIDI Roll</span>
                  <input type="checkbox" checked={settings.showMidiRoll} onChange={(e) => { updateSetting('showMidiRoll', e.target.checked); e.target.blur(); }} className="w-4 h-4 accent-white" />
                </label>

                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-sm text-gray-400">Camera View</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['front', 'top', 'side', 'dynamic', 'isometric', 'closeup', 'vortex', 'orbit', 'zenith'].map(view => (
                      <button 
                        key={view} 
                        onClick={(e) => { updateSetting('cameraView', view); e.currentTarget.blur(); }} 
                        className={`px-2 py-1.5 rounded text-xs transition-all ${settings.cameraView === view ? 'bg-white text-black font-medium' : 'bg-white/10 text-white hover:bg-white/20'}`}
                      >
                        {view.charAt(0).toUpperCase() + view.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={(e) => { resetSettings(); e.currentTarget.blur(); }} 
                  className="mt-2 w-full py-2 bg-red-500/20 hover:bg-red-500/40 text-red-200 rounded-lg text-sm transition-all font-medium border border-red-500/30"
                >
                  Reset to Default
                </button>
              </div>
            </div>
          )}

          {showInfo && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={() => setShowInfo(false)}>
              <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl text-white" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">About</h2>
                  <button onClick={() => setShowInfo(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                  <p>
                    <strong>MIDI Music Box</strong> is an interactive 3D music experience. It faithfully maps MIDI notes to a concentric grand staff, preserving sustain pedal data and note velocities for an authentic visual representation of sheet music.
                  </p>
                  <div className="bg-black/30 p-4 rounded-lg border border-white/5">
                    <h3 className="text-white font-semibold mb-2 text-xs uppercase tracking-wider">Powered By</h3>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span><span className="text-white font-medium">Gemini 3.1 Pro</span> - AI Assistant</li>
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span><span className="text-white font-medium">Three.js & R3F</span> - 3D Rendering</li>
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span className="text-white font-medium">Tone.js</span> - Audio Synthesis</li>
                    </ul>
                  </div>
                  <div className="pt-2">
                    <h3 className="text-white font-semibold mb-3 text-xs uppercase tracking-wider">Created by itsjaydesu</h3>
                    <div className="flex gap-4">
                      <a href="http://github.com/itsjaydesu" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/10">GitHub</a>
                      <a href="http://x.com/itsjaydesu" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/10">X (Twitter)</a>
                      <a href="https://itsjaydesu.com" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/10">Website</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-10 pointer-events-auto flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={progress}
          onChange={handleSeek}
          className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
        />
        <div className="flex justify-between text-xs text-gray-400 font-mono">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <button
          onClick={(e) => { togglePlay(); e.currentTarget.blur(); }}
          disabled={!isLoaded}
          className="pointer-events-auto flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-4 rounded-full backdrop-blur-md transition-all border border-white/10 shadow-lg"
        >
          {!isLoaded ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-medium">Loading Piano...</span>
            </>
          ) : isPlaying ? (
            <>
              <Square className="w-5 h-5 fill-current" />
              <span className="font-medium">Stop</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              <span className="font-medium">Play</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full h-full">
        <Visualizer notes={notes} isPlaying={isPlaying} settings={settings} />
      </div>
    </main>
  );
}
