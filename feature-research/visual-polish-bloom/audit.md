# Audit: visual-polish-bloom

## Files changed
- components/Visualizer.tsx (modified)
- components/PlaybackTimeline.tsx (modified)
- app/globals.css (modified)
- app/page.tsx (modified, rounds 2 and 4)
- ecosystem.config.js (modified)
- lib/keyboard.ts (created, round 2)
- lib/strike-ripple.ts (created round 2, removed round 3)
- tests/playback-timeline.test.ts (created)
- tests/keyboard.test.ts (created, round 2)
- lib/playback-chrome.ts (created, round 4)
- tests/playback-chrome.test.ts (created, round 4)
- tests/strike-ripple.test.ts (created round 2, removed round 3)
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

## Round 2 (QA + review fixes)

### lib/strike-ripple.ts (new) and components/Visualizer.tsx
- Ripple envelope moved to a pure helper `getStrikeRipple(timeDiff,
  velocity, radius)`: null outside 0..0.5 s, position pinned at the playhead
  column `(0, radius)`, scale 1x -> 2.2x (easeOutCubic), brightness
  `0.28 * velocity * (1 - progress)`. Visualizer multiplies brightness by
  `displayProgress` and applies the same intro lift/depth offsets as the
  note. The ripple no longer follows the note along the orbit.
- `useLayoutEffect` now calls `setColorAt(0, black)` on both the note mesh
  and the ripple mesh before zeroing `count`, so `instanceColor` exists
  before the first strike and three.js compiles one shader variant only.
- Bloom threshold 0.66 -> 0.7; comment corrected (idle 0.68 and playhead
  0.55 both sit below it).
- Staff ring gradient: floor 0.35 -> 0.18, lit arc narrowed with
  `((cos+1)/2) ** 1.5` before smootherStep. Linear brightness: top 1.0,
  sides (90 deg) ~0.35, bottom 0.18.

### components/PlaybackTimeline.tsx
- `aria-valuetext={formatTime(wholeSecond)}` on the range input.

### app/globals.css
- Fill alpha 0.22 -> 0.45.
- `.nm-seekbar:focus-visible`: keeps the inset track shadows and adds a
  2px bg gap + 1px rgba(255,255,255,0.28) ring.

### lib/keyboard.ts (new) and app/page.tsx
- Bug from master: with the seekbar focused, ArrowLeft/ArrowRight loaded the
  adjacent track because the global keydown handler only skipped
  text/number/password/email inputs. `isGlobalShortcutTarget(target, key)`
  now also returns false for arrow keys on any `<input>` or `<select>`.
  Letter shortcuts still work from a focused range input. page.tsx calls
  the helper in place of the inline checks.
- Reproduced first: the test file was run against the master predicate
  (extracted verbatim) and the two arrow-key tests failed; after the fix
  all pass.

### Tests (round 2)
- tests/strike-ripple.test.ts: null outside window; anchored at (0, radius)
  for all timeDiff; scale strictly increasing and brightness strictly
  decreasing across 20 steps, ending at 2.2x and 0; velocity scaling.
- tests/playback-timeline.test.ts: + duration change while paused rewrites
  max/value/--nm-progress; a bare listener publish (no rAF, no act) updates
  value and fill; aria-valuetext tracks the displayed time; unmount leaves
  zero clock listeners.
- tests/keyboard.test.ts: range/checkbox/select keep arrows; range still
  routes 'f'; text/textarea ignore all keys; body/null route everything.

### Round 2 results
`pnpm test`: 13 files, 133 tests passed.
`pnpm exec tsc --noEmit`: clean.
eslint on touched files (Visualizer.tsx, PlaybackTimeline.tsx, globals.css,
page.tsx, lib/keyboard.ts, lib/strike-ripple.ts, three test files):
2 errors + 28 warnings, identical to the same three legacy files on HEAD
(globals.css lines 6-8 prettier; page.tsx/Visualizer.tsx warnings in
untouched regions). New files are clean.

### Round 2 open risks
- Gradient and fill values are chosen by reasoning, not by eye. If the
  staff arc still reads flat, drop the floor to 0.12; if the fill is too
  loud, use 0.38.
- Arrow keys on a focused `<button>` still reach the global handler; buttons
  do not consume arrows, so this matches native behaviour.

## Round 3 (ripple removed)
Jay asked for the strike ripple to go. Removed the ripple InstancedMesh,
its geometry, material, loop block and import from components/Visualizer.tsx,
plus lib/strike-ripple.ts and tests/strike-ripple.test.ts. The ripple
sections above (round 1 item 2, round 2 ripple notes and tests) are
historical only. Kept unchanged: bloom and glow numbers, the instanceColor
pre-create on the note mesh, the staff ring gradient, the seekbar work and
the keyboard fix. Round 3 results are in the final report.

## Round 4 (chrome hides under keyboard focus)
Bug (also on master): a keyboard user on the seekbar pressed ArrowLeft. The
chrome hid after 2 s and became `inert`. Focus dropped to BODY, so later
arrows switched the track.

Fix:
- lib/playback-chrome.ts: `isInPlaybackChrome(target)` checks for a
  `[data-playback-chrome]` ancestor. `shouldHoldPlaybackChrome(active,
  lastInputWasKeyboard)` is the hold decision.
- app/page.tsx: the three chrome wrappers (top bar, timeline, play button)
  get `data-playback-chrome`. The idle timeout skips the hide when the
  helper says hold. A new effect tracks input type (capture `keydown` sets
  keyboard, capture `pointerdown` sets pointer). A keydown inside the chrome
  restarts the timer. A `focusout` that leaves the chrome restarts the
  timer, so the idle hide resumes. Both skip while a panel is open, because
  the panel effect already keeps the chrome shown.
- Pointer activity already restarts the timer through the existing window
  `pointermove`/`pointerdown` listener; unchanged.

Deviation: the hold needs the last input to be the keyboard. Without that,
a mouse click on the seekbar leaves focus on it and the chrome never hides.
That would change the mouse-idle behaviour, which the task said to keep.

Tests: tests/playback-chrome.test.ts (4 tests) covers the helper in jsdom.
The page wiring (timer + listeners) has no automated test: rendering
app/page.tsx in jsdom needs WebGL and audio. Browser QA must run the repro.

Results:
- `pnpm test`: 13 files, 133 tests passed.
- `pnpm exec tsc --noEmit`: exit 0, no output.
- `pnpm exec eslint app/page.tsx`: 0 errors, 19 warnings; same rule set as
  HEAD e29c41d. New files: 0 problems.

Open risks:
- After a keyboard user moves focus into the chrome, the chrome stays
  visible until focus leaves or a pointerdown happens. This is intended.
- QA repro to run: start playback, Tab to the seekbar, press ArrowLeft every
  0.6 s for 5 s; chrome must stay, track must not change. Then click the
  canvas; chrome must hide after about 2 s. Also check mouse-only idle hide
  after a seekbar click.

## QA verification
QA verification: PENDING — orchestrator to attach browser-qa/ios-qa verdicts
