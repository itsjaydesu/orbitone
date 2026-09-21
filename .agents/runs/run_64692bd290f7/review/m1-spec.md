# REV-DEPTH S4 — Spec axis — M1 (DIG-3937)

Reviewer: REV-DEPTH, Claude Opus high. Author lane: IMPL-CORE Astra. Families differ.
Target: `run-64692bd290f7-core` at `14e608e0624dbbc8a7c64e22d701c2fd41fa4cd9`.
Diff: `3ee74f3...14e608e`. Spec: frozen `SPEC.md`, 144 lines.
Method: read-only. Source reasoning plus recorded evidence. No installs, no QA runs, no commits.
Scope: spec conformance only. I did not read the Standards report.

## Verdict

REVIEW_PASS. No P1. Five P2 items need ORCH reconciliation before acceptance.
M1 built the required test and measurement foundation. It claims no performance gain.
M2 C1 is absent by design (SPEC:34-35). That is not an M1 gap.

## Findings

### P2-1 README presents a benchmark-only service as the general setup path

SPEC:70 "Correct README setup text touched by this service setup".
`README.md:24-35` puts `pm2 start ecosystem.config.js --only orbitone-perf-3937` under "Getting started" without saying it is benchmark-only. SPEC:69 stops it after QA, so the text then misleads.
The Scripts table also dropped the `dev` row that `package.json:7` still defines.
Fix: label the service benchmark-only and match the Scripts table to `package.json`. Machine AGENTS keeps PM2 and Portless, so add no manual server.

### P2-2 Seek latency is measured only while paused

SPEC:86 "Seek input-to-next-frame latency and the observed seek position, separately."
`perf/baseline.ts:123-127` seeks only after the paused window, so the 2.2 ms median is a paused number. `docs/performance.md:96` omits the state.
SPEC:103 needs a smooth seek bar during playback, which C1 changes. The SPEC:117 gate never samples it.
Fix: measure a seek during playback, or state the paused scope.

### P2-3 Baseline spread equals the C1 gate size and stays undisclosed

SPEC:120 "Review both the comparison numbers and individual runs; disclose unstable measurements."
`perf/baseline/baseline-2026-09-21T02-29-58.205Z.json` records 0.2928, 0.3249, 0.3177. The 0.0321 range is 10.1% of the median, and SPEC:115 demands a 10% fall.
Three runs are too few to characterize that spread, so treat an effect near 10% as uncertain. SPEC:74 fixes runs at three, so the duty is disclosure, not a new gate.
Fix: report per-run values and the spread beside the median.

### P2-4 The doc still reports measurements as unverified

SPEC:129 requires "measured results" in `docs/performance.md`. Line 152 states "UNVERIFIED", but QA now records MEASURE_BASELINE_OK with medians.
The text was correct at IMPL_COMPLETE (SPEC:31-33). M1 owns the file (SPEC:14).

### P2-5 Browser evidence does not corroborate audible playback

SPEC:88 "a visible button alone is insufficient".
`qa/browser/findings.json` passes `play-progress` at analyser peak 0.000583, `active=7/30`. The harness measured 0.51-0.54, 272/288 active, on the same route.
`m1-browser-qa.mjs:323` passes on `peak > 0.00001`, so near-silence passes. QA owns it (SPEC:23), not M1.
Fix: explain the 900x gap or raise the floor.

### P3 items

- `perf/contracts.ts:53-57` emits `threadCpuSeconds` from `ThreadTime` while the gate uses `taskCpuSeconds`; `tests/perf-contract.test.ts:12` claims "thread CPU seconds" and asserts 3/30. Correct under `threadTicks`, but the names invite the wrong number (SPEC:90).
- `perf/contracts.ts:71` treats any peak above 1e-5 as audio present (SPEC:110).
- `tests/use-music.test.ts:118` reads `kNOWN DEFECT`; fix the case (SPEC:52).
- `package.json:5-7` and `perf/service.mjs:6` pin Node to exactly 24.18.0; a patch bump stops the service.

## Verified against the frozen spec

- SPEC:15 No application change. The diff touches no `app/`, `components/`, `hooks/`, or `lib/` file.
- SPEC:13-14 Ownership holds. `SPEC.md`, run `log.md`, and `spec-archb.md` come from ORCH commit `147a01f`, not M1.
- SPEC:45-46 Parser coverage complete: lead-in, pedal release, 15 s cap, velocity bounds, empty file, tempo map. Three bundled files include Piano Man and Moonlight Sonata with invariant assertions.
- SPEC:47-49 `useMusic` covers load, play, pause, resume, seek clamp, BPM, end, replay, unmount cancel. `lib/export.ts` covers timeline, frame bounds, camera cycling, fades, audio duration. `useVideoExport` proves session delete, no finalize, idle return.
- SPEC:40-41 Expected values are literals and independent facts. The parser drops no note, so bundled counts are file facts.
- SPEC:43 Only `tone` and clock or WebAudio globals are mocked. No Orbitone module is mocked.
- SPEC:83, 91 `perf/baseline.ts:229` enables `threadTicks` and blocks on failure. Recorded `wallSeconds` 30.015 against 30001 ms elapsed proves `Timestamp` stays wall-clock.
- SPEC:79 Startup animation stays outside the windows. Intro settle is 3.7 s, `introStartRef` sets once, and a 10 s warmup precedes each window.
- SPEC:77 Scenario metadata is truthful. `app/page.tsx:93-99` defaults `showMidiRoll` false and `cameraView` 'default'.
- SPEC:84-87, 93, 95 rAF percentiles, bounded long tasks, seek position, heap point, SHA, build mode, browser version, viewport, DPR, warmup, durations, timestamps, and hardware rendering all appear.
- SPEC:51-53 Known defects stay labeled. QA records the arrow interception and refuses to endorse it as seek.
- SPEC:62, 94 No telemetry enters the application. The harness intercepts analytics and stores no MIDI data or filenames.
- SPEC:64-66 Service name `orbitone-perf-3937`, cwd from `__dirname`, `pnpm build` before `next start` through Portless, no fixed port.
- SPEC:111 Browser checks cover playback, pause, seek, tempo, end/replay, track switch, and MIDI-roll toggle.
- SPEC:123-125 No gain claim. Full lint debt reported as 35 errors and 31 warnings, matching the captured output.
- SPEC:130 The doc summary is five lines.

## Uncertainty

I did not run tests, lint, or the harness. Test counts come from static reading: 38 cases in seven files.
I did not open the Linear issues DIG-3950, DIG-3951, or DIG-3952. SPEC:131 needs them; the doc links all four topics.
I treat QA output as evidence about runs, never as proof of source semantics.

REVIEW_PASS
