# Implementation Plan

**Progress:** 100% (12/12 tasks completed)

## General Goal

Create a deterministic export pipeline for Orbitone that can produce high-FPS video with audio aligned to the same logical timeline, so the final render does not depend on live playback timing or browser recording jitter.

## Major Goals

- Replace real-time timing assumptions in the final export path with a shared export timeline.
- Render audio from the same timeline used to render video frames.
- Produce the final video artifact through frame-sequence rendering plus FFmpeg muxing.
- Preserve only the start and end timing behavior that is explicitly confirmed for export.
- Integrate the finished exporter into the selected delivery surface after requirements are clarified.

## Acceptance Criteria

- The final export path does not rely on wall-clock `MediaRecorder` timing for synchronized output.
- Video frames and audio are both generated from one deterministic export timeline.
- The confirmed intro delay, note lead-in behavior, and visual tail behavior are preserved exactly in the exported video.
- The chosen export entry point can generate a final video artifact from the current MIDI data and camera state.
- Existing live playback behavior remains intact outside the final export path.

---

## Phase 1 — Clarification and Architecture

- [x] 🟩 **Clarify unresolved export requirements**
  - [x] 🟩 Deliver the final exporter through the existing UI-triggered export surface in Orbitone.
  - [x] 🟩 Use **60 FPS** as the deterministic high-FPS export target.
  - [x] 🟩 Keep the current **1080×1920 portrait** export size as the baseline output.
  - [x] 🟩 Preserve the existing **MP4 and WebM** output set.
  - [x] 🟩 Preserve the current intro settle time, existing note lead-in timing, and existing visual tail timing in final renders.
  - [x] 🟩 Allow export audio rendering to use the existing Salamander sample source, with export failing clearly if those samples cannot be loaded.

- [x] 🟩 **Define deterministic export pipeline structure**
  - [x] 🟩 Shared timing and contract logic now lives in `lib/export.ts`.
  - [x] 🟩 Offline audio rendering now lives in `lib/export-audio.ts` with reusable piano/render helpers in `lib/piano-audio.ts`.
  - [x] 🟩 `hooks/useVideoExport.ts` now orchestrates timeline creation, offline audio rendering, deterministic frame rendering, upload, and muxing.
  - [x] 🟩 `hooks/useMusic.ts` remains the live playback hook and now exposes reusable note, pedal, and playback gain data for export.
  - [x] 🟩 `components/Visualizer.tsx` now accepts explicit export render time values while preserving live `Tone.Transport` timing outside export mode.
  - [x] 🟩 `app/api/render/export/route.ts` and `lib/server/export-session.ts` now define the handoff between PNG frame output, WAV upload, and FFmpeg muxing.

---

## Phase 2 — Data and Timeline

- [x] 🟩 **Define the export timeline model**
  - [x] 🟩 `globalTime` now measures elapsed export-video time from frame 0.
  - [x] 🟩 `transportTime` now measures musical playback time on the same timeline, clamped to 0 during intro settle and to the visual playback end after the score finishes.
  - [x] 🟩 Intro settle time comes from `getVisualizerIntroSettleSeconds()`, note lead-in comes from the loaded note data, playback end preserves the current visual tail rule, and total duration is `introSettleSeconds + playbackEndSeconds`.
  - [x] 🟩 Frame count is now `ceil(totalDurationSeconds * fps)`.
  - [x] 🟩 Offline audio is rendered for the full deterministic timeline so leading silence and trailing silence preserve the intended visual tail instead of trimming to live playback length.

- [x] 🟩 **Define the export input contract**
  - [x] 🟩 Export now consumes loaded note data, pedal data, playback gain, current camera choice, camera mode, and the current camera preset map from app state.
  - [x] 🟩 Export validation now rejects missing note data and unsupported output formats, and offline audio rendering fails explicitly when browser or sample-loading requirements are unavailable.
  - [x] 🟩 The UI export entry point now exchanges deterministic render artifacts with `/api/render/export`, which creates a temp export session, receives WAV and PNG frames, muxes them with FFmpeg, and returns the final downloadable artifact.

---

## Phase 3 — Core Implementation

- [x] 🟩 **Refactor visualizer export timing**
  - [x] 🟩 `components/Visualizer.tsx` now consumes explicit `globalTime` and `transportTime` values for export rendering.
  - [x] 🟩 The deterministic timeline now drives intro animation, note positioning, MIDI roll behavior, and camera motion during export.
  - [x] 🟩 Live playback still uses the existing `Tone.Transport` timing path outside export mode.

- [x] 🟩 **Extract reusable audio render setup**
  - [x] 🟩 Shared piano/render helpers now live outside React hook state in `lib/piano-audio.ts` and `lib/export-audio.ts`.
  - [x] 🟩 The exporter reuses note, pedal, and playback gain data already produced by the music pipeline.
  - [x] 🟩 Offline audio render duration now comes directly from the shared export timeline.

- [x] 🟩 **Implement the offline audio render path**
  - [x] 🟩 The exporter now renders WAV audio from the shared deterministic timeline in-browser with `OfflineAudioContext`.
  - [x] 🟩 Note and pedal events are scheduled against the same timing model used for video frames.
  - [x] 🟩 The rendered audio preserves leading silence and ending duration so the final video does not cut the intended tail.

---

## Phase 4 — Services and Orchestration

- [x] 🟩 **Implement frame-sequence render orchestration**
  - [x] 🟩 Export now renders video frames from the export canvas against the deterministic timeline rather than wall-clock playback.
  - [x] 🟩 Frames are captured as PNGs and uploaded into the FFmpeg mux session.
  - [x] 🟩 Progress now reflects rendered frame count instead of elapsed real time.

- [x] 🟩 **Implement the selected export entry point**
  - [x] 🟩 The existing Orbitone settings panel remains the selected export surface.
  - [x] 🟩 The export entry point now collects current Orbitone note, pedal, playback gain, camera, and format inputs.
  - [x] 🟩 The UI now invokes offline audio rendering, deterministic frame rendering, and server-side muxing in dependency order.

- [x] 🟩 **Implement FFmpeg mux orchestration**
  - [x] 🟩 The new export session API now combines the PNG frame sequence and WAV output into MP4 or WebM with FFmpeg.
  - [x] 🟩 The mux step now uses the confirmed total export duration explicitly instead of trimming to whichever stream is shorter.
  - [x] 🟩 The selected export entry point now returns the final artifact as a downloaded file.

---

## Phase 5 — Integration

- [x] 🟩 **Integrate the deterministic exporter into Orbitone**
  - [x] 🟩 The old wall-clock export orchestration has been replaced only for the final export path.
  - [x] 🟩 The exporter reuses the existing hidden export canvas and current camera settings/cycle choices.
  - [x] 🟩 Cancellation, error handling, and completion state now reflect preparing, audio rendering, frame rendering, muxing, and done/error states accurately.

---

## Phase 6 — Testing and Validation

- [x] 🟩 **Validate sync, duration, and regression boundaries**
  - [x] 🟩 Browser validation on the running zedbock instance confirmed the deterministic export phases advance correctly and the exported file completes successfully.
  - [x] 🟩 The exported artifact preserved the deterministic intro/audio/tail timeline and produced a playable `1080x1920`, `60 FPS`, `H.264 + AAC`, `48 kHz stereo` MP4.
  - [x] 🟩 The chosen high-FPS target completed successfully and produced a downloadable video with audio.
  - [x] 🟩 Additional browser validation confirmed cancellation works and live playback plus MIDI loading still work outside the export path.
