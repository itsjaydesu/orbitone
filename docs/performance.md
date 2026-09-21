# Playback performance: DIG-3937

This harness measures the local production app with system Chrome.
M1 adds regression tests and measurement tooling without changing application source.
Independent QA owns browser checks, baseline evidence, and candidate comparisons.
No performance result exists from implementation checks alone.
CPU measurement requires CDP `threadTicks`; unavailable metrics block the run.

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

Full `pnpm lint` currently fails with **35 errors and 31 warnings**.
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
It uses the default camera with MIDI roll disabled.
Each run uploads bundled Piano Man through the real file control.
It waits for running WebAudio, nonzero output, and visible transport progress.
It then warms playback for ten seconds, pauses, seeks to zero, and resumes.
The measured windows last 30 seconds playing and ten seconds paused.
Startup animation and sample loading precede those windows.
Samples remain loaded in the same page across all three runs.

The harness verifies the remote production build manifest against the local build.
It rejects stale build metadata and uncommitted application or harness inputs.
Exit `0` means three measurements were captured. Exit `1` means failure. Exit `2` means blocked measurement.
Failure reports retain completed runs but provide no median summary.
No harness exit replaces independent QA or authorizes C1.

Stop only this task service after QA:

```sh
pm2 stop orbitone-perf-3937
```

## Metrics and evidence

| Metric                | Definition and unit                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Renderer CPU fraction | CDP `TaskDuration` difference, in thread seconds, divided by CDP wall-clock `Timestamp` difference, in seconds |
| Thread CPU            | CDP `ThreadTime` difference, in seconds, retained as a separate diagnostic                                     |
| rAF p50/p95           | Nearest-rank percentiles of adjacent callback intervals inside each window, in milliseconds                    |
| Slow frame intervals  | Count of rAF intervals strictly above 50 milliseconds                                                          |
| Long tasks            | Count and clipped duration of tasks overlapping the explicit window, in milliseconds                           |
| Seek latency          | Real pointer input to the next rAF callback, in milliseconds                                                   |
| Seek position         | Native range value at that callback and observed position afterward, in seconds                                |
| Heap after pause      | CDP `JSHeapUsedSize` at the end of the pause window, in bytes                                                  |
| Audio-ready time      | Time from the play action until nonzero audio output and playback progress, in milliseconds                    |
| Playback progress     | Observed transport display positions at each window boundary, in seconds                                       |

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

Network access permits the local app and the existing piano sample host.
The installed analytics package requests `/_vercel/insights/script.js`.
The harness intercepts that script and the same-origin `/_vercel/insights/` namespace with empty local responses.
Reports count intercepted scripts and events. They omit request bodies.
Unexpected requests, browser errors, missing audio, and failed upload cause failure.
Reports omit MIDI data, uploaded filenames, cookies, tokens, and raw error messages.

## Independent acceptance

QA must exercise real playback, pause, seek, tempo change, end/replay, track switch, and MIDI-roll toggle.
QA must confirm continuous animation, smooth seeking, audible continuity, and immediate explicit control updates.
Use real WebAudio, WebGL, and system Chrome. Test doubles do not satisfy these checks.

| C1 gate      | Required result                                                               |
| ------------ | ----------------------------------------------------------------------------- |
| Playback CPU | Median fraction decreases at least 10%                                        |
| rAF p95      | Increase stays within the larger of 5% or 1 ms                                |
| Seek latency | Increase stays within the larger of 10% or 16.7 ms                            |
| Paused CPU   | Increase stays within the larger of 10% or one percentage point               |
| Behavior     | No new browser errors, audio gaps, visual changes, or delayed control updates |

Inspect every run as well as medians. Disclose unstable measurements.
ORCH must authorize C1 after `MEASURE_BASELINE_OK`. This document does not authorize C1.
Allow at most two measured C1 attempts. Revert C1 if both fail.

## Current results and follow-ups

- Regression baseline: **29 passing tests**, committed as `3a1fa5bd3f5ec35dadc6311570778116233d190b`.
- M1 development checks: **38 passing tests** across seven files; typecheck and touched-file lint pass.
- Production measurements: **UNVERIFIED**; independent QA has not supplied evidence here.
- C1 implementation and performance gains: **not implemented or claimed**.
- [DIG-3950](https://linear.app/digital-philosophy/issue/DIG-3950/orbitone-recover-when-piano-samples-fail-to-load): sample-download failure leaves readiness pending and loading visible.
- [DIG-3951](https://linear.app/digital-philosophy/issue/DIG-3951/orbitone-preserve-keyboard-seeking-on-focused-range-controls): focused-range arrow keys can switch tracks instead of seeking.
- [DIG-3952](https://linear.app/digital-philosophy/issue/DIG-3952/orbitone-measure-midi-roll-rendering-and-idle-animation-costs): MIDI-roll instancing and idle-render design remain separate candidates.

The sample-loading test characterizes the known defect with a bounded pending assertion.
QA must record focused-range interception as a defect, without treating track switching as successful seeking.
The harness uses pointer input for measured seeking and Home for its reset.
M1 changes no application files and repairs neither known defect.
