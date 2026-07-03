# orbitone — Performance / Mobile / Visual Overhaul Plan

Working branch: `feat/perf-mobile-visual-overhaul`
Baseline: instruments WIP committed as d3471dc. Typecheck clean at baseline.

Status legend: `[ ]` todo · `[x]` done · `[~]` in progress

## Phase 1 — Quick correctness fixes ✅ COMPLETE
- [x] B2: `getEffectiveCameraPoseForView` swapped args at Visualizer.tsx:1809/1833 (isMobileView/exportMode reversed)
- [x] C2: export pedal ramps unanchored — add `setValueAtTime` before `linearRampToValueAtTime` (export-audio.ts:379-382)
- [x] C5: `Tone.Transport.stop()/cancel()` + position reset on useMusic unmount
- [x] B5: in-flight guard so a second tap during slow async `togglePlay` setup is a no-op
- [x] B3: hydration-safe language init ('en' first render, navigator.language via effect)
- [x] Typecheck + commit

## Phase 2 — Core React perf (P1) ✅ COMPLETE
- [x] useMusic: removed `currentTime` React state entirely — `currentTimeRef` is the per-frame source of truth, exposed via stable `getPlaybackTime()`; playback now causes zero React renders (better than the planned 4 Hz throttle)
- [x] New `components/PlaybackControls.tsx` (`PlaybackTimeline`): own rAF writes input value + time label via DOM refs; scrub-guard so imperative writes don't fight the user's drag. Play button stayed in page (it only renders from low-frequency state — moving it bought nothing)
- [x] `React.memo` on `Visualizer`
- [x] Memoized `getNotesSignature(notes)` in Scene
- [x] Verified in browser: seekbar advances during playback, seek-while-playing continues from new position, console clean
- [x] Typecheck + browser test + commit

## Phase 3 — Audio engine robustness & efficiency ✅ COMPLETE
- [x] B1: sampler onerror → ready rejects; useMusic evicts failed builds from both caches, disposes, sets `audioLoadFailed` (exposed; toast wiring lands in Phase 7); ensureAudioReady returns boolean and togglePlay/unlockAudio abort cleanly
- [x] P2: Parts scheduled once per track in transport ticks (PPQ 960) at original tempo; BPM changes = one `transport.bpm.value` write + `playbackSpeedRef` for callback durations. No Part rebuild, no note-array identity churn into scheduling. Scaled `notes` memo kept for display/export (ids stable → no spurious visualizer crossfade)
- [x] P6: EQ3 removed (dry/wet → master direct); Meter now read every tick into exposed `audioLevelRef` (0..1 from dB); `notesRef` removed; master + track gains use `rampTo` (no zipper clicks)
- [x] P6: 128-entry midi→note-name table replaces per-trigger `Tone.Frequency` alloc
- [x] M7: fresh Tone context with `latencyHint: 'playback'`, `lookAhead 0.2` — required migrating every `Tone.Transport` (static import-time binding) to `getSharedTransport()`/`getTransport()`; Visualizer decoupled from Tone via `lib/transport-time.ts` reader bridge (Phase 5 item pulled forward)
- [x] B4: visibilitychange + pagehide pause; AudioContext statechange pause (iOS interruption); resume attempt on return; `isLikelyIOSSafari` now covers iPad (incl. Macintosh+touch UA)
- [x] Also: removed unused `isInstrumentId` (carried an `unknown`); shared `pausePlayback` helper
- [x] Typecheck + browser test (portless origin https://orbitone.local) + commit

### Dev-server note
Dev server now runs through portless (`https://orbitone.local`) — do not bind :3000. The `.next` lock belongs to the portless-managed server; stop it before any `next build`.

## Phase 4 — Visualizer render perf ✅ COMPLETE
- [x] P2b: `InstancedMidiRoll` — one InstancedMesh + one useFrame per roll layer (≤4 layers during transitions) instead of a mesh + MeshStandardMaterial + frame callback per note; brightness (base luma + emissive glow) × opacity composited into instance color over additive blending, matching the InstancedNotes pipeline. `MidiRollNote` deleted
- [x] P6b: CameraController per-frame allocations removed — intro front-pose hoisted to a render-scope memo (was allocating a full pose + toFixed strings per frame), scratch vector for orbit, direct component reads instead of vectorFromCameraVector
- [x] D6b: `webglcontextlost` → preventDefault + Canvas remount via epoch key (silent recovery; intro replays)
- [x] Typecheck + lint (memo wrappers restructured for prefer-arrow-callback) + browser test (roll in two camera views during playback, zero console errors) + commit

## Phase 5 — Bundle & loading (P3) ✅ COMPLETE
- [x] Visualizer decoupled from Tone (done in Phase 3 via `lib/transport-time.ts`)
- [x] Tone.js fully lazy: `loadTone()` gateway (context configured at import); Parts scheduling deferred via `scheduleTrackPartsRef` + dirty flag until first play intent; instrument-live dynamically imported inside `ensureInstrument`; all transport access null-guarded pre-load; transport reader falls back to `currentTimeRef`
- [x] `@tonejs/midi` lazy inside `parseMidiFile`
- [x] Library + translations behind `useMidiLibrary()` (idle-time dynamic import); page rewired: indexes/random-initial-track/adjacent-nav/localization all null-safe; visualizer holds empty until initial track loads (or fails → falls back to default piece)
- [x] Production build measured: **610.7 → 540.5 KB gz (2111.6 → 1784.4 KB raw)** first load. Main chunk = three+postprocessing only (Tone core, standardized-audio-context, @tonejs/midi, translations all deferred; verified at runtime: no Tone chunk until play, then chunk + 30 samples fetch on demand). Caveat: Turbopack still lists the library-data chunk (31.9 KB gz) in initial scripts — it hoists mount-reachable dynamic imports; async/non-blocking, acceptable. Future option: serve catalog as JSON
- [x] Typecheck + lint + browser test + commit
- Note: an external supervisor auto-respawns the portless orbitone dev server — never start one manually; just use https://orbitone.local

## Phase 6 — Mobile UX
- [ ] M1: `h-dvh` + `overscroll-none` on main (100vh iOS bug)
- [ ] M2: reclaim dead bottom 40% on mobile — controls to thumb zone, camera target shift reduced so composition fills viewport
- [ ] M3: SettingsPanel mobile bottom sheet (mirror library sheet: scrim, handle, safe-area, max-h + scroll); desktop gets max-h + scroll too
- [ ] M4: wrap all custom `.nm-*:hover` rules in `@media (hover: hover)`
- [ ] M5: touch targets ≥44px (chevrons, GitHub link, settings tabs, close buttons); chevron resting contrast up
- [ ] M6: use-mobile cleanup (drop redundant resize listener)
- [ ] P5: remove full-screen `backdrop-blur` over live canvas (library scrim, info overlay)
- [ ] Typecheck + mobile-viewport browser test + commit

## Phase 7 — Visual polish & design cohesion
- [ ] D1: music-reactive scene — `audioLevelRef` modulates ring luminance + bloom intensity (subtle)
- [ ] D2: exit animations for library/settings/info/hint via motion `AnimatePresence` (dep already present); reduced-motion respected
- [ ] D3: info modal restyled into the nm design system (keep mono voice, drop the 9× border)
- [ ] D4: typography tokens — collapse ~9 tracking/size variants into 2–3 label classes
- [ ] D5: toast component replaces `alert()`; library load + midi parse errors use it
- [ ] D6: metadata — metadataBase, OG/Twitter cards, `opengraph-image.tsx` + `apple-icon.tsx` via ImageResponse, manifest
- [ ] Typecheck + browser test + commit

## Phase 8 — Export pipeline hardening
- [ ] B6: route security — sessionId UUID validation + path containment, frameIndex integer bounds, metadata-exists check before writes, session TTL sweep, frame/byte caps
- [ ] Finding 3: block settings-panel close (S/Esc/click-outside) while export phase active (phase reported up to page)
- [ ] Finding 6: AbortController threaded through uploads/finalize; cancel aborts in-flight work
- [ ] Finding 7: `startExport` in-flight guard (automation API safe)
- [ ] Finding 5: stream finalize response from disk; probe ffmpeg at init
- [ ] Finding 10: overlay shows real error message; renderer-wait timeout; composite canvas released after export; webm hidden on iOS; Content-Disposition quoting; drop dead `firstNoteTimeSeconds`
- [ ] P4: shared piano sample cache (fetch once, live + export decode from cached ArrayBuffers)
- [ ] Typecheck + commit

## Phase 9 — Cleanliness & structure
- [ ] Extract from page.tsx: `lib/i18n.ts` (copy/shortcuts/brand), `components/InfoModal.tsx`, `components/LibraryPanel.tsx`; dedupe category meta/blurbs
- [ ] CL1: shared `FX_CHAIN` constants (piano-audio.ts) consumed by live + export
- [ ] CL2: single Salamander sample map (derive note-name map from PIANO_SAMPLE_FILES)
- [ ] CL3: instruments.ts drops lucide imports (icon map moves to SettingsPanel)
- [ ] Dead code: `.nm-title`/`.nm-link`/`.nm-checkbox` CSS, badge color names, `visualizer-intro` class, unused public assets, `.DS_Store` (+ gitignore), `leva` dep, `transpilePackages: ['motion']`, autoprefixer, avatar `priority`
- [ ] z-index token scale replaces `z-[20000000]`-style values; cursor-hide selector de-uglified; `transition: all` enumerated
- [ ] Typecheck + lint + commit

## Phase 10 — Final verification
- [ ] Full browser matrix: desktop + mobile viewport — playback, seek, track prev/next, library, settings tabs, info, camera views, midi roll, fullscreen, ja locale
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean
- [ ] Bundle re-measure vs baseline
- [ ] Final plan update + commit
