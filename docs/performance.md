# Playback performance: DIG-3937

The repaired harness measures seek target reach and uses deterministic startup.
Both entry points reject uncommitted build inputs through one shared pathspec.
Independent QA recorded **QA_PASS** for the accepted paired reports below.
All four repaired numeric gates pass on Chrome 153 and Apple M3 Max Metal.
First-frame timing remains diagnostic and does not drive the seek gate.
Full lint retains known debt in DIG-3939.

## Setup

Use Node **24.18.0**, pnpm **11.1.1**, PM2, Portless, and installed Google Chrome.
The harness uses `playwright-core`. Do not install or download a Playwright browser.
Disable dependency lifecycle scripts to avoid the existing Lightpanda browser installer.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm exec tsc --noEmit
pnpm exec eslint tests perf vitest.config.ts ecosystem.config.js package.json docs/performance.md README.md
```

Baseline full lint reports **35 errors and 31 warnings**.
ORCH's [final integration check][lint-disclosure] reports **35 source errors and 32 warnings** for the candidate.
M2 adds one acknowledged direct-set-state warning. Candidate touched-file lint passes with **21 warnings**.
Track that baseline debt in [DIG-3939](https://linear.app/digital-philosophy/issue/DIG-3939/orbitone-repair-existing-lint-baseline-before-performance-changes).
Touched-file lint and typecheck must pass before commits.

## Start the task service

Commit the checkout before building. Run these commands from that same checkout:

```sh
pm2 start ecosystem.config.js --only orbitone-perf-3937
pm2 logs orbitone-perf-3937 --lines 30 --nostream
portless list
```

The service runs `pnpm build`, records its commit and build ID, then starts `next start` through Portless.
Its working directory comes from the configuration directory. Portless supplies the ephemeral `PORT`.
The service disables exports and Next telemetry. It creates no environment file.

### Build-input cleanliness

The service pre-build check and benchmark clean check use `perf/build-inputs.mjs` as their shared pathspec:

```text
app components hooks lib public scripts perf package.json pnpm-lock.yaml
pnpm-workspace.yaml next.config.ts tsconfig.json postcss.config.mjs
ecosystem.config.js
```

Both checks run `git status --porcelain` over these paths.
Dirty, deleted, or untracked inputs block execution with `UNCOMMITTED_BUILD_INPUTS`.
This includes the uploaded fixture under `public/` and all listed root configuration files.

The checks exclude `docs/`, `tests/`, `vitest.config.ts`, `eslint.config.mjs`, `README.md`, `LICENSE`, and `.agents/`.
They also exclude generated `.next/`, `next-env.d.ts`, and `tsconfig.tsbuildinfo` files.
These documentation, test, lint, run-record, and generated files do not change build output as source inputs.
The harness checks generated production identity separately through commit metadata, `BUILD_ID`, and the served build manifest.

Use the exact route from `portless list`. Worktree prefixes and proxy suffixes can differ.
Wait for the production build and service to finish starting.
Confirm PM2 lists this checkout as the service directory before measuring.
If the named service belongs to another checkout, ask its owner to stop it first.

After candidate integration, restart only this service to rebuild:

```sh
pm2 restart orbitone-perf-3937
portless list
```

## Capture three runs

Replace `RESOLVED_URL` with the exact Portless route.
Replace `COORDINATOR_PERF_DIR` with the absolute coordinator evidence directory.

```sh
pnpm perf:baseline -- --base-url RESOLVED_URL --label baseline --runs 3 --output-dir COORDINATOR_PERF_DIR
```

Repeat with `--label candidate-1` after authorized C1 implementation and a fresh build.
An optional `--chrome /absolute/path/to/Chrome` selects an installed Chrome executable.
Without `--output-dir`, results go under ignored `test-results/performance/`.

Keep Chrome visible, foreground, and unobscured during measurement. Avoid unrelated heavy work.
The harness opens its own clean browser context with a 1280×720 viewport and DPR 1.
It appends `automation=1` to the supplied base URL before navigation.
The existing application guard skips the random initial library-track load in this mode.
Source inspection confirms that this guard gates no other state read by the measurement.
It uses the default camera with MIDI roll disabled.
Each run uploads bundled Piano Man through the real file control.
It waits for running WebAudio, nonzero output, and visible transport progress.
It then warms playback for ten seconds, pauses, seeks to zero, and resumes.
The measured windows last 30 seconds playing and ten seconds paused.
After those windows, the harness measures paused seeking to 25% of the track.
It then resumes playback, confirms progress, and measures active seeking to 50% of the track.
Each seek records its playback state and requested fraction. Both seeks remain outside the fixed measurement windows.
The harness pauses again before the next upload.
Startup animation and sample loading precede those windows.
Samples remain loaded in the same page across all three runs.

The harness verifies the remote production build manifest against the local build.
It rejects stale build metadata and uncommitted build inputs from the shared pathspec.
Exit `0` means three measurements were captured. Exit `1` means failure. Exit `2` means blocked measurement.
Failure reports retain completed runs but provide no median summary.
Seek failures also retain `failedSeek`, including state, target, input count, geometry, positions, and timing when available.
Unavailable numeric readings remain null or absent. Failure codes distinguish `PLAYBACK_SEEK_*` from `PAUSED_SEEK_*`.
No harness exit replaces independent QA or authorizes C1.

Stop only this task service after QA:

```sh
pm2 stop orbitone-perf-3937
```

## Metrics and evidence

| Metric                | Definition and unit                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Renderer CPU fraction | CDP `TaskDuration` difference, in thread seconds, divided by CDP wall-clock `Timestamp` difference, in seconds           |
| Thread CPU            | CDP `ThreadTime` difference, in seconds, retained as a separate diagnostic                                               |
| rAF p50/p95           | Nearest-rank percentiles of adjacent callback intervals inside each window, in milliseconds                              |
| Slow frame intervals  | Count of rAF intervals strictly above 50 milliseconds                                                                    |
| Long tasks            | Count and clipped duration of tasks overlapping the explicit window, in milliseconds                                     |
| Active seek latency   | Pointerdown to the first rAF inside target tolerance, in milliseconds; `playbackSeekLatencyMs` drives the comparison     |
| Paused seek latency   | Pointerdown to the first rAF inside target tolerance while paused, in milliseconds; `pausedSeekLatencyMs` stays separate |
| First-frame latency   | Pointerdown to the first rAF, in milliseconds; `firstFrameLatencyMs` is a diagnostic only                                |
| Seek position         | Requested native input value, first-rAF range value, and first target-frame range value, in seconds                      |
| Seek observation time | Pointerdown to the successful polling observation, in milliseconds; includes polling delay                               |
| Heap after pause      | CDP `JSHeapUsedSize` at the end of the pause window, in bytes                                                            |
| Audio-ready time      | Time from the play action until nonzero audio output and playback progress, in milliseconds                              |
| Playback progress     | Observed transport display positions at each window boundary, in seconds                                                 |

The harness enables [`Performance.enable`](https://chromedevtools.github.io/devtools-protocol/tot/Performance/) with `timeDomain: threadTicks`.
[Chromium's implementation](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc) rejects unsupported thread clocks.
Missing, invalid, or frozen CPU counters produce `BLOCKED`. No frame-rate or long-task substitute exists.

The CPU interval surrounds the browser window by two CDP calls. Both interval boundaries enter the report.
The browser window records `performance.now()` boundaries and actual elapsed time.
Long-task duration includes only overlap with that window.

An injected parallel analyser reads audio output without changing the audible destination connection.
It samples during measured rAF callbacks at roughly ten samples per second.
Evidence contains only peak and activity counts. It stores no audio samples.
This observer adds overhead; use the identical harness for baseline and candidate.
Nonzero output does not prove the absence of audible gaps. Independent listening remains required.

Each JSON report includes commit SHA, production build ID, browser version, scenario, viewport, DPR, durations, and UTC timestamps.
Reports contain individual runs and medians, including paused metrics.
Renderer information identifies software rendering when Chrome exposes it.
Missing renderer detail stays unavailable; it does not establish hardware acceleration.
Frame intervals do not measure GPU time. Heap points do not prove freedom from memory leaks.
The harness makes no React component commit-count claims.

### Seek measurement limits

The frozen repair contract `run_43ff26f7720f` supersedes the first-frame semantics from `run_64692bd290f7`.
`latencyMs` measures pointerdown to the first animation frame inside tolerance of `requestedPositionSeconds`.
Both `playbackSeekLatencyMs` and `pausedSeekLatencyMs` report medians of this target-reach latency.
One frame chain starts at pointerdown and continues until target reach or the observation timeout.
It retains the first target-frame position, even if playback advances before the harness polls the result.
`firstFrameLatencyMs` and `nextFramePositionSeconds` retain the first callback's readings as diagnostics only.
The comparison never uses first-frame latency.
`requestedPositionSeconds` captures the first native input event before delegated application handlers can change the controlled value.
Target reach must occur within the 2,000 ms observation timeout; otherwise the run fails.
`latencyMs` remains null when the target does not arrive in time, even if a first frame exists.
`observedPositionSeconds` records the first target-frame position on success and the current position on failure.
`observationElapsedMs` includes polling delay. It does not drive the comparison.
The existing 3% track-duration tolerance stays unchanged for the requested fraction and observed position.
The observer also requires the captured input and observed position to agree within that tolerance.
Missing native input, repeated input, missing frames, and incomplete seeks fail the run.
This wait adds no click retry. Each seek sends one locator click after Playwright's trial actionability check.
The trial checks control stability before geometry capture. The actual click repeats actionability checks without `force`.
Failure codes identify action, state, pointer, input, frame, or position failure.

Observed completion proves the displayed range reached the target within the stated tolerance and time bound.
It does not independently read Tone transport, audio seek timing, or GPU draw completion.
The C1 allowance remains the larger of 10% or 16.7 ms above the baseline target-reach median.
The two-second observation timeout adds no acceptance threshold or grace period.
Independent browser QA must still check immediate controls, smooth seeking, and audible continuity.

The requested fraction selects a point on the control's outer box, preserving the original scenario.
Native thumbs shorten the usable track. The source defines a 14-pixel thumb and a 0.1-second range step.
For a 544-pixel control, the thumb center travels 530 pixels, starting seven pixels inside the box.
A 25% outer-box click therefore selects about 24.34% of the range, while a 50% click stays centered.
For the 350.082-second fixture, this predicts approximately 85.2 seconds, compared with the nominal 87.52-second quarter point.
Reports preserve both the nominal target and actual input value; they do not relabel this geometry bias as latency.
Pointerdown diagnostics capture the actual control box and pointer coordinates without storing DOM text.
This instrumentation adds overhead. Use the identical repaired harness for both builds.

Network access permits the local app and the existing piano sample host.
The installed analytics package requests `/_vercel/insights/script.js`.
The harness intercepts that script and the same-origin `/_vercel/insights/` namespace with empty local responses.
Reports count intercepted scripts and events. They omit request bodies.
Unexpected requests, browser errors, missing audio, and failed upload cause failure.
Reports omit MIDI data, uploaded filenames, cookies, tokens, and raw error messages.
Guarded failures retain the original error as a non-enumerable `cause` in memory for debugging.
Reports expose failure codes and numeric seek diagnostics. Terminal output exposes failure codes and the report path.
Neither serializes or logs the original cause.

## Independent acceptance

QA must exercise real playback, pause, seek, tempo change, end/replay, track switch, and MIDI-roll toggle.
QA must confirm continuous animation, smooth seeking, audible continuity, and immediate explicit control updates.
Use real WebAudio, WebGL, and system Chrome. Test doubles do not satisfy these checks.

| C1 gate             | Required result                                                                         |
| ------------------- | --------------------------------------------------------------------------------------- |
| Playback CPU        | Median fraction decreases at least 10%                                                  |
| rAF p95             | Increase stays within the larger of 5% or 1 ms                                          |
| Active seek latency | Target-reach `playbackSeekLatencyMs` increase stays within the larger of 10% or 16.7 ms |
| Paused CPU          | Increase stays within the larger of 10% or one percentage point                         |
| Behavior            | No new browser errors, audio gaps, visual changes, or delayed control updates           |

Inspect every run as well as medians. Disclose unstable measurements.
ORCH must authorize C1 after `MEASURE_BASELINE_OK`. This document does not authorize C1.
Allow at most two measured C1 attempts. Revert C1 if both fail.

## Accepted repaired paired results

Independent QA recorded **QA_PASS** in the [QA report][current-qa-report].
The accepted reports use baseline source `e160e11` and candidate source `e456081`.
Both sides use Chrome **153.0.8010.48**, hardware ANGLE Metal on Apple M3 Max, and CDP `threadTicks`.
The scenario is `DIG-3937-upload-01` with **1280×720**, **DPR 1**, default camera, and MIDI roll disabled.
Each side has three runs with ten seconds of warmup, 30 seconds playing, and ten seconds paused.
The real Piano Man upload uses `automation=1`. The fixture hash is `4d3a338a97f7bcb1d6cf3f7f5a88477e72f02d41f2728889e50f1617a68d5e4b`.
The harness and configuration hashes match across both sides. Build IDs are `GMWOu80n6BAT2Vr7FmV4R` and `TUIzWFOJBexqOZmnl0Tz4`.

| Evidence                        |                                   Baseline |                                    Candidate |
| ------------------------------- | -----------------------------------------: | -------------------------------------------: |
| Raw report                      | [baseline report][current-baseline-report] | [candidate report][current-candidate-report] |
| Application SHA                 | `e160e11cbc1c1aa3bd4f4ad4d458d03f935fa17a` |   `e456081266ad58928e09963dbae56e3141f3c38b` |
| Playback CPU median             |                         0.3828687623613073 |                          0.16797053156765743 |
| Playback rAF p95                |                                     9.2 ms |                                       9.2 ms |
| Target-reach active seek median |                                     3.1 ms |                                       6.8 ms |
| Paused CPU median               |                        0.10215570056482984 |                          0.09375272975235918 |
| Paused seek median              |                                     5.2 ms |                                       4.9 ms |

The playback CPU median decreases **56.1284%**. The rAF p95 remains unchanged.
The active seek increase is 3.7 ms. The paused CPU change is -0.00840297081247066.
The paused seek median decreases by 0.3 ms. All four numeric gates pass in the [gate summary][current-gate-summary].

CPU spread is **34.55%**, **38.29%**, and **45.26%** for baseline runs.
Candidate playback CPU values are **16.797%**, **17.913%**, and **16.748%**.
Every candidate playback CPU value is below every baseline value in this sample.
Three runs do not support a significance claim or a longer-term stability claim.
These results make no whole-machine CPU, GPU, battery, memory-leak, or general-device claim.

Candidate run 1 reached the target in **12.4 ms**. Its first frame arrived at **5.2 ms**.
The target requested by the active seek was **175 s**. Its first-frame position was **85.5 s**.
The target-reach value is the gate metric; the first-frame value is diagnostic only.

### Repaired gate results

| Gate                     | Baseline median | Candidate median |             Change |                  Limit | Result |
| ------------------------ | --------------: | ---------------: | -----------------: | ---------------------: | ------ |
| Playback CPU             |          0.3829 |           0.1680 | 56.1284% reduction | At least 10% reduction | PASS   |
| Playback rAF p95         |          9.2 ms |           9.2 ms |             0.0 ms |        At most +1.0 ms | PASS   |
| Active target-reach seek |          3.1 ms |           6.8 ms |            +3.7 ms |       At most +16.7 ms | PASS   |
| Paused CPU               |          0.1022 |           0.0938 |            -0.0084 |          At most +0.01 | PASS   |

The paired reports preserve individual runs and raw diagnostics. They do not prove audible continuity.
Independent QA observed WebAudio analyser output and transport progress, without hardware listening.

## Historical superseded results

The following tables and links preserve earlier evidence. They do not satisfy the repaired target-reach gates.
The accepted repaired evidence is recorded above. The earlier tables use superseded first-frame semantics.
Baseline application source remains `3ee74f3`; the candidate contains PR7 application changes.
Record application SHA, harness file hashes, production `BUILD_ID` and SHA, fixture hash, and every run for each side.
The fixture is `public/midi/pop-electronic/piano-man.mid`. Include `perf/build-inputs.mjs` in the harness identity record.
Preserve the old report files. Do not replace this historical evidence.

Earlier independent QA recorded **QA_PASS** for measured C1 attempt 1 in the [final M2 report][qa-report].
C1 isolates frequent playback updates. Those paired runs used the same earlier harness.
The [harness identity record][harness-identity] confirms matching harness, tests, configuration, and dependencies across both checkouts.

| Evidence                   | Baseline                                   | Candidate                                  |
| -------------------------- | ------------------------------------------ | ------------------------------------------ |
| Raw report                 | [Baseline attempt 1][baseline-report]      | [Candidate attempt 1][candidate-report]    |
| Commit                     | `0a88a96859b4ce255014a7693b3222358cb09f9a` | `6fb2db5ef00e9b36ae345e3d740faef75448574a` |
| Production build ID        | `aXgdB5W1MgS2QYMFil8E0`                    | `tag1DQ7aWyu8hmG4Z1Y2-`                    |
| Capture on 2026-09-21, JST | 12:49:23.128–12:52:05.422                  | 12:52:45.621–12:55:22.553                  |
| Source capture, UTC        | 03:49:23.128–03:52:05.422                  | 03:52:45.621–03:55:22.553                  |

Both builds used Chrome **153.0.8010.48**, hardware ANGLE Metal rendering on **Apple M3 Max**, and CDP `threadTicks`.
Scenario `DIG-3937-upload-01` used **1280×720**, **DPR 1**, the default camera, and MIDI roll disabled.
Each side recorded three runs with ten seconds of warmup, 30 seconds playing, and ten seconds paused.

### Historical C1 gates

The [historical gate summary][gate-summary] records **PASS for all four earlier numeric gates**.
Its seek gate uses first-frame latency, so this summary cannot establish acceptance under the repaired contract.
CPU percentages describe renderer main-thread time divided by wall time, not device-wide utilization.
The table rounds values after calculating changes from the raw measurements.

| Gate                | Baseline median | Candidate median | Change                     | Limit for this baseline         | Result |
| ------------------- | --------------- | ---------------- | -------------------------- | ------------------------------- | ------ |
| Playback CPU        | 32.932%         | 14.748%          | 55.216% relative reduction | At least 10% reduction          | PASS   |
| Playback rAF p95    | 9.2 ms          | 9.2 ms           | 0.0 ms                     | At most +1.0 ms                 | PASS   |
| Active seek latency | 4.4 ms          | 6.4 ms           | +2.0 ms                    | At most +16.7 ms                | PASS   |
| Paused CPU          | 8.479%          | 8.967%           | +0.489 percentage points   | At most +1.000 percentage point | PASS   |

Paused seek latency remains separate: its median changed from **6.1 ms to 5.8 ms**.
Both sides recorded a playback rAF p50 of 8.3 ms and zero browser errors.
All measured playback and pause windows recorded zero intervals over 50 ms and zero long tasks.
Every playback window showed 30 seconds of progress and nonzero analyser output.
Median audio-ready time was 684.102 ms for baseline and 666.993 ms for candidate.

### Individual CPU runs and spread

Values below express CPU fractions as percentages. Spread means maximum minus minimum, in percentage points.

| Run                       | Baseline playback | Candidate playback | Baseline paused | Candidate paused |
| ------------------------- | ----------------- | ------------------ | --------------- | ---------------- |
| 1                         | 29.941%           | 13.756%            | 7.769%          | 7.993%           |
| 2                         | 32.932%           | 14.748%            | 8.479%          | 8.967%           |
| 3                         | 33.231%           | 15.246%            | 10.428%         | 9.453%           |
| Median                    | 32.932%           | 14.748%            | 8.479%          | 8.967%           |
| Spread, percentage points | 3.289             | 1.490              | 2.659           | 1.460            |

CPU rose across the three sequential runs on each side. Three runs do not establish longer-term stability or statistical confidence.
Every candidate playback CPU result was below every baseline result in this sample.
Paused CPU ranges overlap. Its median increase remains within the frozen gate; this result does not show an idle improvement.
These measurements establish no device-wide CPU, GPU, battery, or memory-leak result.

### Seek completion and behavior evidence

Active next-frame latency ranged from **3.9–4.4 ms** for baseline and **5.4–7.0 ms** for candidate.
Paused next-frame latency ranged from **6.1–6.6 ms** for baseline and **4.7–6.3 ms** for candidate.
All twelve completion observations ranged from **3.9–13.5 ms**; the [QA report][qa-report] lists each reading.
Completion observations include polling delay. These reports used the superseded first-frame latency metric.

Candidate run 3 shows why these measurements differ:

| Active seek reading                 | Value   |
| ----------------------------------- | ------- |
| Requested native input position     | 175 s   |
| Next-frame latency                  | 5.4 ms  |
| Next-frame position                 | 85.5 s  |
| Completed observed position         | 175 s   |
| Completion observation elapsed time | 13.5 ms |

The first recorded frame still showed 85.5 seconds. The observer recorded the 175-second target after 13.5 ms.
This was a two-frame observation, not completion at the first frame.
The 2,000 ms diagnostic ceiling remains a timeout, not a user-experience acceptance threshold.

The [QA report][qa-report] records passing playback, pause, seek, tempo, end/replay, track-switch, and MIDI-roll browser checks.
Those checks ran on pre-repair candidate `a08fd3a`, with application code `1137ea5`.
The historical paired measurements cover baseline `0a88a96` and candidate `6fb2db5` with the earlier harness.
QA used analyser output and transport progress; it made no hardware listening claim.
These observations do not prove audible continuity or the absence of audio gaps.

### Regression checks and remaining work

The original regression baseline passed 29 tests before application changes, at `3a1fa5bd3f5ec35dadc6311570778116233d190b`.
Final independent QA recorded **48 passing tests across eight files** on [baseline][baseline-tests] and [candidate][candidate-tests].
Final QA and ORCH's integration check record **typecheck PASS** and **touched-file lint PASS**.
ORCH records **21 warnings** in candidate touched-file lint, including one acknowledged direct-set-state warning from M2.
Baseline full lint has **35 errors and 31 warnings**; final candidate source has **35 errors and 32 warnings**.
The source error debt remains in [DIG-3939][lint-issue]. The [final lint disclosure][lint-disclosure] records ORCH's correction.
These historical checks do not validate the current repair. Fresh independent checks remain required.

- [DIG-3950](https://linear.app/digital-philosophy/issue/DIG-3950/orbitone-recover-when-piano-samples-fail-to-load): sample-download failure leaves readiness pending and loading visible.
- [DIG-3951](https://linear.app/digital-philosophy/issue/DIG-3951/orbitone-preserve-keyboard-seeking-on-focused-range-controls): focused-range arrow keys can switch tracks instead of seeking.
- [DIG-3952](https://linear.app/digital-philosophy/issue/DIG-3952/orbitone-measure-midi-roll-rendering-and-idle-animation-costs): MIDI-roll instancing and idle-render design remain separate candidates.

The sample-loading test characterizes the known defect with a bounded pending assertion.
QA must record focused-range interception as a defect, without treating track switching as successful seeking.
The harness uses pointer input for measured seeking and Home for its reset.
M1 changes no application files and repairs neither known defect.

### Earlier harness evidence and limitation

The [original baseline][original-baseline] predates active-seek measurement. Its 2.2 ms paused-seek median does not enter the final comparison.
The [failed revised baseline][failed-baseline] at `70332ae` stopped with `SEEK_POSITION_FAILED` in run 2.
It lacks the failed seek's state and readings. The bounded diagnostic did not reproduce the failure; its cause remains unknown.
The controlled-input race remains an unproven hypothesis. Preserve this failure record; it does not provide a passing baseline.
The historical paired runs above both **PASS** with the same earlier harness.
Those passes do not establish the original failure's cause or reliability beyond this sample.

[current-qa-report]: ../.agents/runs/run_43ff26f7720f/qa/report.md
[current-baseline-report]: ../.agents/runs/run_43ff26f7720f/perf/baseline/baseline-pr7-2026-09-21T05-32-24.482Z.json
[current-candidate-report]: ../.agents/runs/run_43ff26f7720f/perf/candidate/candidate-pr7-2026-09-21T05-36-26.661Z.json
[current-gate-summary]: ../.agents/runs/run_43ff26f7720f/perf/comparison/gate-summary.json
[qa-report]: ../.agents/runs/run_64692bd290f7/qa/m2.md
[harness-identity]: ../.agents/runs/run_64692bd290f7/qa/m2/mech-seek-repair/harness-identity.txt
[baseline-report]: ../.agents/runs/run_64692bd290f7/perf/comparison/baseline-attempt1/baseline-c1a-2026-09-21T03-49-23.128Z.json
[candidate-report]: ../.agents/runs/run_64692bd290f7/perf/comparison/candidate-attempt1/candidate-c1a-2026-09-21T03-52-45.621Z.json
[gate-summary]: ../.agents/runs/run_64692bd290f7/perf/comparison/gate-summary-attempt1.json
[baseline-tests]: ../.agents/runs/run_64692bd290f7/qa/m2/mech-seek-repair/test-base.txt
[candidate-tests]: ../.agents/runs/run_64692bd290f7/qa/m2/mech-seek-repair/test-cand.txt
[lint-issue]: https://linear.app/digital-philosophy/issue/DIG-3939/orbitone-repair-existing-lint-baseline-before-performance-changes
[lint-disclosure]: ../.agents/runs/run_64692bd290f7-m1-results/report.md#lint-disclosure
[original-baseline]: ../.agents/runs/run_64692bd290f7/perf/baseline/baseline-2026-09-21T02-29-58.205Z.json
[failed-baseline]: ../.agents/runs/run_64692bd290f7/perf/comparison/baseline/baseline-c1-2026-09-21T03-26-21.967Z.json
