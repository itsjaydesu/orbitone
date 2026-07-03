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

## Phase 6 — Mobile UX ✅ COMPLETE

- [x] M1: `h-dvh` + `overscroll-none` on main
- [x] M2: controls moved to thumb zone (timeline safe+7.75rem, play safe+1.75rem, was 42dvh/34dvh); `MOBILE_CAMERA_TARGET_Y_SHIFTS` reduced (3.0→1.2 etc.) — composition now fills the phone screen, dead bottom band gone (verified via screenshots)
- [x] M3: SettingsPanel mobile bottom sheet (scrim + handle + safe-area padding + 85dvh cap + scrollable content, `onClose` prop); desktop dropdown gains max-h + scroll
- [x] M4: all 8 interactive `.nm-*:hover` rules wrapped in `@media (hover: hover)`; library-track hover drops its 32px-blur outer shadow
- [x] M5: touch targets — chevrons min-44px + resting white/45, GitHub link -m-3/p-3 hit area, library close min-44px, settings tabs/reset min-h-10
- [x] M6: use-mobile uses `mql.matches` + change listener only (resize listener dropped)
- [x] P5: backdrop-blur removed from library scrim + info overlay (opacity bumped to compensate)
- [x] Bonus: `isStartingPlayback` state covers the click→Tone-load window so the play button shows busy immediately (was a dead-feeling button during chunk fetch); dead CSS (.nm-title/.nm-link/.nm-checkbox) and rule-less `visualizer-intro` class removed early
- [x] Typecheck + lint + mobile & desktop browser verification + commit

## Phase 7 — Visual polish & design cohesion

- [x] D1: music-reactive scene — smoothed energy (fast attack / slow release) from `audioLevelRef` lifts ring luminance (+70% at peak) and bloom intensity (+40%); exports keep deterministic baseline. Gotcha found: React 19 passes `ref` as a prop and @react-three/postprocessing JSON.stringify()s props → circular crash; fixed by constructing `BloomEffect` directly (postprocessing added as direct dep, pinned 6.38.3) rendered via `<primitive>`
- [x] D2: motion (`LazyMotion domAnimation strict` + `m` + `AnimatePresence`) exit/enter animations for library (sheet/dropdown), settings (sheet/dropdown), info modal, toast; `useReducedMotion` zeroes durations
- [x] D3: info modal border white/35 → white/12 (design-system cohesion, mono voice kept)
- [x] D4: `.type-overline` token replaces the 10-11px/0.16-0.2em micro-label variants across page + SettingsPanel
- [x] D5: Toast component (motion, monochrome, auto-dismiss 4.2s) replaces alert(); wired: library load failure, MIDI parse failure, sampler load failure (audioLoadFailed). useMusic no longer needs `language`
- [x] D6: metadataBase (+NEXT_PUBLIC_SITE_URL override), OG/Twitter cards, generated `opengraph-image.tsx` (rings + wordmark — verified render), `apple-icon.tsx`, `manifest.ts`; avatar `priority` dropped; eslint override for Next metadata-file exports
- [ ] Browser verification of exits/toast/reactive bloom + commit (in progress — agent-browser daemon needed a restart)

## Phase 8 — Export pipeline hardening ✅ CODE COMPLETE

- [x] B6: sessionId UUID validation inside `getSessionDirectory` (every path flows through it) + route-level `parseSessionId`/DELETE check; frameIndex integer + [0, frameCount) bounds; metadata-exists check before frame/audio writes; 2h stale-session sweep at init; EXPORT_LIMITS caps (36k frames, 24MB/frame, 300MB audio, 4096px, 120fps, 900s) enforced at route + session layers
- [x] Finding 3: `onExportActiveChange` → page `isExportActive`; S/I/L/Escape, click-outside, trigger button, and mobile-scrim onClose all refuse to close settings mid-export
- [x] Finding 6: AbortController threaded through init/audio/frame/finalize uploads; cancel aborts in-flight requests
- [x] Finding 7: `exportBusyRef` guard — automation `startExport()` can no longer double-run
- [x] Finding 5 (partial): ffmpeg probed at init (fail-fast before any frame uploads). Finalize response kept as a buffer rather than a disk stream — Node-web stream typing would force an `unknown` cast (banned) and outputs are tens of MB in a dev-gated feature; caps + sweep bound the memory
- [x] Finding 10: overlay renders the real error message; renderer-wait 10s timeout; composite canvas released; webm hidden on iOS; Content-Disposition sanitized (quotes/control chars stripped); dead `firstNoteTimeSeconds` removed
- [x] P4: shared `fetchPianoSampleArrayBuffer` cache in piano-audio.ts — live sampler now decodes from the shared bytes (no Sampler-internal downloads), export re-decodes but never re-downloads; failed fetches evicted for retry. CL2 fell out for free: the note-name Salamander map in instrument-live deleted, `midiToNoteName` + `PIANO_SAMPLE_MIDI_VALUES` centralized
- [x] Typecheck + lint (flushSync exemptions for the render-then-capture loop)

## Phase 9 — Cleanliness & structure ✅ COMPLETE

- [x] page.tsx 2,905 → 1,684 lines: extracted `lib/i18n.ts` (UiCopy/UI_COPY/shortcuts/brand), `lib/library-meta.ts` (category meta + primary groups, **blurb duplication collapsed** — single-category groups now derive from `getLibraryCategoryMeta`), `components/BrandMarks.tsx`, `components/InfoModal.tsx`, `components/LibraryPanel.tsx` (PlaybackControls was Phase 2)
- [x] CL1: `FX_CHAIN` in piano-audio.ts — live chain + export mixer + pedal ramps all read the same constants
- [x] CL2: done in Phase 8 (shared sample fetch cache + `midiToNoteName` + `PIANO_SAMPLE_MIDI_VALUES` centralized)
- [x] CL3: instruments.ts is icon-free pure data; `INSTRUMENT_ICONS` map lives in SettingsPanel
- [x] Dead code: dead CSS removed in Phase 6; unused `public/mouse_cursor.svg` + `cursor.png` + `.DS_Store` deleted (+ gitignore); `leva` and `autoprefixer` uninstalled; `transpilePackages: ['motion']` dropped; postcss config reduced to the Tailwind plugin; avatar `priority` dropped in Phase 7
- [x] z-index scale: panels 50 · camera lab 55 · info 60 · toast 70 · hint 75 · export overlay 80 (was 135/99999/20000000); cursor-hide selector reduced from 5 universal+pseudo selectors to `html.nm-system-cursor-hidden, … *`; last `transition: all` enumerated
- [x] Repo-wide lint: 0 errors (fixed pre-existing script errors too); typecheck clean; panels verified in browser after extraction

## Phase 10 — Final verification

- [ ] Full browser matrix: desktop + mobile viewport — playback, seek, track prev/next, library, settings tabs, info, camera views, midi roll, fullscreen, ja locale
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean
- [ ] Bundle re-measure vs baseline
- [ ] Final plan update + commit
