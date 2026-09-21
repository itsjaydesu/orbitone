# REV-DEPTH S4 — M1 repair verification — DIG-3937

REV-DEPTH, claude-opus-5 high. Author: IMPL-CORE Astra. Families differ.
Target `run-64692bd290f7-core-repair` at `70332ae`. Diff `14e608e..70332ae`. Read-only.
2026-09-21: start 03:26Z, completion 03:34:04Z, correction 03:35Z.
No `app/`, `components/`, `hooks/`, or `lib/` file changed.

## Verdict

**REVIEW_FAIL** — one P1. `perf/comparison/baseline/baseline-c1-2026-09-21T03-26-21.967Z.json`
records `FAIL SEEK_POSITION_FAILED` at `stage: run-2`, ending 03:28:07.365Z.

## Accepted repairs — verified

1. Scoped globals: `perf/probe-types.d.ts:23` gives `__orbitonePerf?`, all interfaces prefixed, no bare reference left. Callers throw `PERFORMANCE_PROBE_UNAVAILABLE` (`perf/baseline.ts:44,60,126,134`).
2. Private cause: `perf/contracts.ts:5-6` takes `ErrorOptions`, `perf/baseline.ts:35` passes it, non-enumerable, so `:325` omits it and `:326,333` print codes only. Tests `tests/perf-contract.test.ts:5-12`, `tests/perf-cli.test.ts:25-51`.
3. Real Part callbacks: `tests/tone-boundary.ts:49-66,14-19` dispatch events, so `hooks/useMusic.ts:496-506` runs. `tests/use-music.test.ts:73-89` asserts pitch, duration, audio time, velocity against the 0.5 s lead-in at `:54`.
4. README: `README.md:104-112` restores `dev` and `start`, adds `test` and `perf:baseline`. `:23-25` marks the service benchmark-only.
5. Seek separation: `perf/baseline.ts:149-156,177-180`.

Withdrawn analyser and `timeDomain` findings stay withdrawn.

## P1 — the seek stage fails the baseline and records no evidence

Confirmed: `guard` rethrows `HarnessFailure` unchanged (`perf/baseline.ts:33-34`), so a missed pointer or hung wait gives `PAUSED_SEEK_FAILED` or `PLAYBACK_SEEK_FAILED`. QA got `SEEK_POSITION_FAILED`, raised only at `:106` after `waitForFunction` proved a reading exists. The click landed; the read-back disagreed.

Not determined: `measureSeek` raises that code for both call sites (`:149,155`), so it names neither state. `:317` stores completed runs only, so run 2 left no reading, position, or state. Elapsed time does not separate the two seeks.

Hypothesis, unproven: `app/page.tsx:2826` re-asserts `value={currentTime}` on the controlled input during playback while the probe reads `input.value` (`perf/probe.ts:20,49`). A reproduction must decide it.

Fix: carry the state into the code; record the failing seek's reading, fraction, and position. Keep the hard failure. Never retry the input click; that hides a product defect.

## P2

- `perf/probe.ts:47-50` measures input to next rAF. `SPEC.md:86` freezes that definition and its gate; keep both. Limitation: `SPEC.md:98` keeps rAF `always`, so the value is a frame-phase sample near 7 ms in any state. `SPEC.md:86` gives the independent check, the observed seek position, reported separately. That position proves the bar followed the seek.
- Run 1 paused seek observed 85.2 s against 87.52 s. That 0.66% bias is range-thumb inset, absent at fraction 0.5. Disclose it.

## P3

- `tests/tone-boundary.ts:53` never rewinds `next` on stop or seek, so a replay test sees no notes.
- `tests/use-music.test.ts:18` resets `audio.activeParts` but never clears `scheduledParts`.
- `perf/baseline.ts:72` repeats `:260`. `perf/probe.ts:5` never restores `connect`.

REVIEW_FAIL
