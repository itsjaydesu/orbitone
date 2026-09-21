# Orbitone playback performance, iteration 1

Issue: DIG-3937. Baseline: 3ee74f349f70074aba0ee0f9daf4ec39398c541d.
Priority: playback and 3D animation.
This contract incorporates ARCH-A's draft and all eight ARCH-B findings.
Add regression tests before changing application behavior.
Measure production playback, then keep one optimization only if measured results pass.
Scope excludes visual redesign and export throughput changes.

## Ownership

M1 CORE-TEST uses IMPL-CORE, Astra xhigh, in an isolated worktree.
M1 owns `tests/**`, `perf/**`, `vitest.config.ts`, `ecosystem.config.js`, `package.json`, and `pnpm-lock.yaml`.
M1 also owns `docs/performance.md`, relevant README setup instructions, and its run records.
M1 must not change application files in `app/`, `components/`, `hooks/`, or `lib/`.

M2 UI-PERF uses IMPL-UI, Claude Fable high, in an isolated worktree.
M2 owns `hooks/useMusic.ts`, `app/page.tsx`, and an optional `components/PlaybackTimeline.tsx`.
M2 may update `components/Visualizer.tsx` only if stable prop boundaries require it.
M2 must not change the scene, audio scheduling, parser, export engine, dependencies, or M1 tests.
Test changes return to M1 through ORCH.

QA-MECH uses Grok medium and owns run `qa/**` and `perf/**` evidence directories.
QA runs all browser checks and measurements independently from implementation.
Its browser-qa role must use real Chrome, WebAudio, and WebGL.
Source reviewers use the model family that did not author the reviewed module.
ORCH owns the frozen contract, integration, and run log.

## Ordered checkpoints

1. M1 commits regression tests against unchanged application source: TEST_BASELINE_OK.
2. M1 adds measurement tooling and service configuration, then emits IMPL_COMPLETE for M1.
3. Independent QA verifies M1 and records baseline measurements: MEASURE_BASELINE_OK.
4. ORCH authorizes C1 from that evidence. C1 is not preapproved by this contract.
5. M2 implements C1 and emits IMPL_COMPLETE. Independent QA measures the candidate.
6. Independent source review follows QA. Accepted changes land on the user's current branch.

## Regression boundaries

Tests exercise public interfaces. Expected values come from worked examples or independent fixture facts.
Do not copy implementation calculations into assertions or test private fields.
Use Vitest for the existing CommonJS and TypeScript import conventions.
DOM hook tests may mock external Tone/WebAudio and clock boundaries, but not Orbitone's own modules.

- `parseMidiFile`: lead-in, sustain release and cap, velocity bounds and dynamics, empty files, and tempo-map timing.
- Parse three real bundled files, including Piano Man and Moonlight Sonata, with concrete invariant assertions.
- `useMusic`: load, play, pause, seek/clamp, BPM changes, end/replay, and cancellation of playback work on unmount.
- `lib/export.ts`: worked timeline examples, frame boundaries, camera cycling, fades, and audio duration.
- `useVideoExport`: cancellation after session creation cleans up its session and returns to idle.

Characterize sample-download failure using a bounded pending/loading assertion; the existing promise does not reject.
Label this as a known defect, not an accepted success path. Recovery changes are deferred.
Record focused-range arrow interception as a known defect in browser evidence; do not endorse track switching as correct seeking.
Existing defects do not authorize extra application changes in M1.

## Tooling and service

Add `pnpm test` for Vitest. Run focused tests during development and the full suite at the final checkpoint.
Typecheck regularly with `pnpm exec tsc --noEmit`.
Use the installed `playwright-core` with system Chrome. Do not download another browser.
The harness lives under `perf/` and collects only local, bounded measurements.
Do not add telemetry code to the application or send analytics events.

Add a repository PM2 configuration using Portless and its assigned PORT.
Use the unique service name `orbitone-perf-3937`; set its cwd from the configuration's own directory.
Run `pnpm build` before serving with `next start` through Portless.
Resolve the exact route with `portless list`; worktree prefixes must not be guessed.
The harness requires an explicit `--base-url` for that route.
Stop this task's service after QA. Never stop unrelated services or the Portless proxy.
Correct README setup text touched by this service setup; do not recommend `.env.local` or fixed ports.

## Reproducible measurements

Command: `pnpm perf:baseline -- --base-url <resolved-url> --label <label> --runs 3`.
Allow an explicit output directory. QA writes evidence under the coordinator run's `perf/` directory.
Capture three runs and their median summary for both baseline and candidate.
Use production builds, the same Chrome version, 1280x720 viewport, DPR 1, default camera, and MIDI roll disabled.
Load Piano Man through the real file-upload control. Use warm samples and a fixed warmup before each measurement.
Measure 30 seconds of playback and 10 seconds paused. Do not count startup animation in the playback window.

Record these measurements and their units:

- Renderer main-thread CPU time using CDP Performance duration metrics in `threadTicks` mode, divided by elapsed wall time.
- rAF interval p50/p95 and intervals over 50 ms. These are not GPU timing claims.
- Long-task count and duration, with the measurement window bounded explicitly.
- Seek input-to-next-frame latency and the observed seek position, separately.
- Heap usage after pause; this is a point measurement, not proof of no memory leak.
- Audio-ready time and actual playback progress; a visible button alone is insufficient.

Do not silently replace CPU measurement with rAF rate or long-task counts.
If Chrome cannot supply the required CPU metric, report that gate as BLOCKED.
Do not assert per-component React commit counts without a validated attribution method.
Record SHA, build mode, browser version, scenario ID, viewport, DPR, warmup, durations, and timestamps.
No MIDI contents, uploaded filenames, cookies, tokens, or external analytics events enter evidence.
The report states whether Chrome used hardware or software rendering when that information is available.

## C1: isolate frequent playback updates

Reduce whole-page updates from the playback clock while preserving transport time as the audio and scene authority.
The scene already reads transport time in its frame loop. Preserve those reads and export's explicit timeline.
Keep the live frame loop set to `always` in this iteration.
Prefer a small playback-display boundary or equivalent local change over a new state-management system.
Text may update at 2 Hz. The seek bar must remain smooth and reflect seeking and pause immediately.
Track changes, replay, end state, and BPM changes must update correctly without waiting for a display timer.
Keep camera motion, crossfades, note positions, glow, and scene quality unchanged.

## Binary acceptance

M1 passes when its committed tests pass on unchanged application source, tooling typechecks, and touched-file lint passes.
Its harness must fail visibly on missing audio, failed upload, missing metrics, and browser errors.
Browser checks cover real playback, pause, seek, tempo change, end/replay, track switch, and MIDI-roll toggle.
Known baseline defects remain explicitly identified. All other scenarios must pass.

C1 passes only when all regression tests pass and independent browser QA confirms continuous animation and smooth seeking.
Median playback main-thread CPU fraction must decrease by at least 10% against baseline.
Candidate rAF p95 must not exceed baseline by more than the larger of 5% or 1 ms.
Candidate seek latency must not exceed baseline by more than the larger of 10% or 16.7 ms.
Paused CPU must not increase by more than the larger of 10% or one percentage point.
No new browser errors, audio gaps, visible changes, or delayed explicit control updates are accepted.
Review both the comparison numbers and individual runs; disclose unstable measurements.

Maximum two measured C1 attempts. If both fail, revert C1 and report the test and measurement foundation separately.
Do not claim a performance gain from unit tests, source inspection, or an incomplete browser run.
Full baseline lint debt remains in DIG-3939. Touched-file lint and typechecking must pass before every code commit.
No full-lint green claim is allowed until the full command passes.

## Documentation and review

Document repeatable commands, metric definitions, limitations, measured results, and remaining candidates in `docs/performance.md`.
Keep its opening summary within seven lines.
Record sample-loading recovery, keyboard seeking, roll instancing, and idle-render design as follow-up work in Linear.
Review against baseline 3ee74f3 with separate Standards and Spec reports, using the code-review skill.
Commit accepted work to `perf/orbitone-regression-baseline` and provide a review URL.
Do not merge or deploy.

## OUT OF SCOPE — DO NOT BUILD

- A visual redesign, a lower default quality setting, or new helper copy.
- Demand rendering, roll instancing, parser changes, or export throughput work.
- A new telemetry service, dashboard, state-management library, or wrapper framework.
- Repairs to known baseline behavior outside C1 or unrelated lint debt.
- Production configuration changes, cloud artifacts, or device-wide performance claims.

SPEC_FROZEN
