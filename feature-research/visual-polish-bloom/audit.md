# Audit: visual-polish-bloom

## Files changed
- components/Visualizer.tsx (modified)
- components/PlaybackTimeline.tsx (modified)
- app/globals.css (modified)
- ecosystem.config.js (modified)
- tests/playback-timeline.test.ts (created)
- feature-research/visual-polish-bloom/audit.md (created)
- feature-research/visual-polish-bloom/feedback.md (created)

## What changed per file

### components/Visualizer.tsx (commit 826d8e7)
- Bloom: `luminanceThreshold` 0.24 -> 0.66, `luminanceSmoothing` 0.9 -> 0.4,
  `DEFAULT_BLOOM_INTENSITY` 1.2 -> 0.8, `radius` 0.72 -> 0.6.
  Idle note luminance is 0.5 + 0.18 = 0.68, so idle discs sit at the threshold
  edge and no longer bloom. Staff rings (max opacity 0.26) and the playhead
  (opacity 0.55) also stay below it.
- Orbit note glow: `peakGlow` 1.6 + v*1.4 -> 0.9 + v*0.8;
  `sustainGlow` 0.52 + v*0.44 -> 0.35 + v*0.3.
- Scale pop: `1 + strike*(0.5 + v)` -> `1 + strike*(0.25 + v*0.45)`.
- MidiRollNote emissive: `peakGlow` 1.25 + v*0.9 -> 0.7 + v*0.5;
  `sustainGlow` 0.42 + v*0.28 -> 0.3 + v*0.2.
- Strike ripple: new module-scope `noteRippleGeo` (RingGeometry 0.15..0.165,
  48 segments) and `noteRippleMaterial` (additive, depthWrite false). A second
  `InstancedMesh` (`rippleRef`, capacity NOTE_INSTANCE_CAPACITY, frustumCulled
  false, renderOrder 9) is written in the same loop. For 0 <= timeDiff <= 0.7s
  the ring scales 1x -> 3x (easeOutCubic) and brightness fades
  `visibility * 0.35 * velocity * (1 - progress)` -> 0. Instances are compacted
  (`rippleCount`), so idle frames draw zero ripple instances. Everything is a
  pure function of `timeDiff` and `visibility`, so export stays deterministic.
- Staff rings: `createCircularLineGeometry` now writes a static `color`
  attribute. Brightness = lerp(0.35, 1, smootherStep((cos(angle)+1)/2)); the
  LineBasicMaterial sets `vertexColors: true`. No per-frame cost. Intro draw
  range and opacity ramp are unchanged.

### components/PlaybackTimeline.tsx (commit 3a4b69a)
- Text time subscribes to `Math.floor(clock.getTime())` through
  `useSyncExternalStore`, so React commits only once per second.
- A `useEffect` subscribes to the clock and writes `input.value` and the
  `--nm-progress` custom property on the range element via a ref each tick.
- Range input is now uncontrolled (`defaultValue={0}`), `step="any"`, with an
  `aria-label`. `onChange -> onSeek` is unchanged.

### app/globals.css (commit 3a4b69a)
- `.nm-seekbar` declares `--nm-progress: 0%` and paints a
  `rgba(255,255,255,0.22)` fill from 0 to `--nm-progress` via
  `background-image: linear-gradient(...)` over `background-color: var(--nm-bg)`.
  Pill radius and inset shadows unchanged. Firefox track stays transparent so
  the fill shows through.

### ecosystem.config.js (commit 1a4f64a)
- New PM2 app `orbitone`: `portless run --name orbitone pnpm exec next dev`
  (interpreter `none`, autorestart false, NODE_ENV development).

### tests/playback-timeline.test.ts (commit 3a4b69a)
- Three tests: `--nm-progress` and `input.value` track clock ticks; sub-second
  ticks cause zero React commits (React Profiler `onRender` counter) and a new
  whole second causes exactly one; `step="any"` and change -> `onSeek(12.5)`.

## Deviations from the plan
- Vitest only includes `tests/**/*.test.ts`, so the timeline test is a `.ts`
  file using `createElement` rather than JSX.
- Added `aria-label="Playback position"` on the range input. The input became
  uncontrolled and had no accessible name; this is one attribute.
- I did not screenshot the running app. The IMPL role does not drive browsers;
  the plan's suggested numbers were used as given.
- All three Visualizer changes share one commit because they interleave in
  the same file and `git add -p` is not available non-interactively.

## Test results
`pnpm test`:
```
 Test Files  11 passed (11)
      Tests  120 passed (120)
```
`pnpm exec tsc --noEmit`: no output (clean).

`pnpm exec eslint components/Visualizer.tsx components/PlaybackTimeline.tsx app/globals.css ecosystem.config.js tests/playback-timeline.test.ts`:
- PlaybackTimeline.tsx, ecosystem.config.js, playback-timeline.test.ts: clean.
- app/globals.css: 2 `format/prettier` errors at lines 6-8 (font-family
  block). Present on HEAD before this work (verified with the file stashed);
  baseline debt DIG-3939. My edit is at ~line 459.
- Visualizer.tsx: 9 pre-existing warnings at lines 1293-1297 and 1713-1735
  (ref naming, set-state-in-effect). Not in touched regions. No new findings.

## Open risks
- Bloom numbers are untuned by eye. Idle note luminance (0.68) sits just above
  the 0.66 threshold; with smoothing 0.4 the idle contribution is near zero but
  not exactly zero. If idle discs still show a halo, raise threshold to 0.7.
- The playhead (opacity 0.55) previously bloomed at threshold 0.24 and now does
  not. This matches the goal of a restrained flash but is a visible change.
- Ripple peak brightness (0.35 * velocity) is below the bloom threshold, so
  ripples never bloom. Ripples overlap with the disc's own scale pop for the
  first ~100 ms; additive blending makes that read as a brighter core.
- Seekbar drag: the clock subscription rewrites `input.value` every tick
  during a drag. `onSeek` moves the transport to the dragged value first, so
  the thumb follows the pointer, same as the previous controlled input.
- Dev server `orbitone` (PM2 id 188) is running at https://orbitone.asuka.
  Stop with `pm2 stop orbitone` when QA is done.

## QA verification
QA verification: PENDING — orchestrator to attach browser-qa/ios-qa verdicts
