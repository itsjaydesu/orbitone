# REV-DEPTH S4 — M1 seek repair verification — DIG-3937

REV-DEPTH, claude-opus-5 high. Author: IMPL-CORE Astra. Families differ.
Target `run-64692bd290f7-core-repair` at `0a88a96`. Diff `70332ae..0a88a96`. Read-only.
2026-09-21: start 03:49Z, end 03:55Z. Only `perf/`, `tests/`, `docs/performance.md`, and the repair run record changed.

## Verdict

**REVIEW_PASS** — no P1. One P2 and one P3 stay open.

## Confirmed, with evidence

1. Pointer actionability: `perf/seek.ts:38` runs `bar.click({ trial: true, timeout: 5000 })` before geometry capture. A trial click sends no input. `tests/perf-seek.test.ts:29` asserts that call shape.
2. One real click: `perf/seek.ts:49` sends one locator click. `tests/perf-seek.test.ts:63` counts exactly one non-trial call. No retry path exists.
3. Native capture before React: `perf/probe.ts:80` binds `input` on `document` with `capture: true`. `tests/perf-probe.test.ts:55-62` restore the old value in a bubble listener on the control, and the probe still reads `50`.
4. Frozen latency semantics: `perf/probe.ts:58,68` keep pointerdown to next rAF. `tests/perf-probe.test.ts:64` keeps `{ latencyMs, nextFramePositionSeconds }` exact. `perf/baseline.ts:153,155` keep the median gate fields.
5. Separate bounded position proof: `perf/probe.ts:104-109` check `observedPositionSeconds` against the target and against the captured input, inside `observationElapsedMs`. `perf/baseline.ts:154,156` report position apart from latency. `tests/perf-probe.test.ts:68,72-73` prove the bound rejects a late reading.
6. State diagnostics, private-safe: `perf/seek.ts:15` prefixes every code with `PLAYBACK` or `PAUSED`. `perf/seek.ts:71-78` separate pointer, input, repeat, and frame causes. `perf/baseline.ts:287` writes numbers only; `docs/performance.md:167`; `tests/perf-seek.test.ts:30,53` prove the cause never serialises.
7. Geometry: `app/globals.css:459-469` gives no border and no padding, so the Playwright position box equals the outer box. `:475` gives the 14-pixel thumb. The `docs/performance.md:151-156` quarter-point arithmetic is correct.

## P2 — the completion window relaxes the immediacy gate

`perf/seek.ts:25` allows 2000 ms from pointerdown. The former code read the position right after the first frame. A control that follows a seek in 1.9 s now passes. `SPEC.md:103` demands an immediate seek response. `docs/performance.md:148` states the bound grants no permission, and `perf/seek.ts:63` keeps `observationElapsedMs` in each run record. QA must read that field for both builds.

## P3 — probe absence loses its code

`perf/seek.ts:45` throws `PERFORMANCE_PROBE_UNAVAILABLE`, which `:84` reports as `*_SEEK_ACTION_FAILED`.

## Evidence limits

Tests-first is self-report: commit `63ed3d5` carries tests and source together. I ran no test, browser, or server. The original `70332ae` failure cause stays unknown. The controlled-input race stays an unproven hypothesis. The results rows at `docs/performance.md:193` await independent QA.

REVIEW_PASS
