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

## Phase 3 — Audio engine robustness & efficiency
- [ ] B1: sampler load failure path — onerror wiring in instrument-live, evict failed builds from caches in useMusic + export-audio, play button shows retryable error state (toast)
- [ ] P2: BPM without rebuild — schedule Parts in ticks, drive `Tone.Transport.bpm`; notes stay immutable; visualizer + seekbar get time scale
- [ ] P6: remove no-op EQ3; repurpose Meter into `audioLevelRef` (feeds Phase 6 reactive visuals); remove unread `notesRef`; volume `rampTo` instead of instant set
- [ ] P6: midi→note-name lookup table in instrument-live (no per-trigger `Tone.Frequency` alloc)
- [ ] M7: Tone context `latencyHint: 'playback'` + larger lookAhead
- [ ] B4: visibilitychange + AudioContext statechange handling (pause when hidden/interrupted); iPad-aware Safari detection
- [ ] Typecheck + browser test + commit

## Phase 4 — Visualizer render perf
- [ ] P2b: instanced MIDI roll — replace per-note mesh/material/useFrame with InstancedMesh (mirror InstancedNotes pattern), both flat and space layouts, crossfade layers included
- [ ] P6b: scratch vectors in CameraController per-frame paths (no per-frame `new Vector3`)
- [ ] D6b: WebGL context-loss handler — overlay + canvas remount on restore
- [ ] Typecheck + browser test (all camera views, midi roll on/off, crossfade via track switch) + commit

## Phase 5 — Bundle & loading (P3)
- [ ] Decouple Visualizer from Tone (`getTransportSeconds` prop instead of `Tone.Transport.seconds`)
- [ ] Lazy-load Tone.js: dynamic import gateway in useMusic; instrument-live/export-audio reached only via async paths
- [ ] Lazy-load `lib/library.ts` + translations (idle-time dynamic import; library UI, initial random track, prev/next all async)
- [ ] Verify with production build: initial JS chunk drop (baseline: 610 KB gz total, 404 KB gz main chunk)
- [ ] Typecheck + browser test + commit

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
