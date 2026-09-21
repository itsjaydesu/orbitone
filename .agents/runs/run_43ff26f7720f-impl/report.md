# Implementation report

Implemented R1, R2, and R3 within the frozen module boundaries.
Development checks pass 117 tests, typecheck, and touched-file lint.
Independent QA, paired measurements, and review remain pending.
Historical measurements do not satisfy the repaired gates.

## Commits and scope

- Red tests: `93757608816b7d1f23d7d46312be20fa64e33245`.
- Source repair: `4bd0c89bebb86ca89cc2294cb4a336f9e66c186e`.
- Starting checkout: `d537287` on `itsjaydesu/pr7-benchmark-repair`.
- Ownership: `perf/**`, `tests/perf*.ts`, `docs/performance.md`, and this run directory.
- Application source, fixture bytes, scripts, dependencies, and configuration files remain unchanged.
- Baseline checkout `0a88a96` matches application source `3ee74f3` under `app/`, `components/`, `hooks/`, and `lib/`.

Apply both implementation commits to baseline checkout `0a88a96` before rebuilding.
The local tag `run/run_43ff26f7720f-impl` identifies the final handoff records.
The red commit precedes every repair source edit.
The repair only adapts existing probe tests to explicit tolerance and timeout arguments; it weakens no red assertion.

## Changes

R1 starts one frame chain at pointerdown and records the first frame inside the requested target tolerance.
The chain retains the target-frame position for later polling.
Both median seek fields consume target-reach `latencyMs` through the existing summary function.
`firstFrameLatencyMs` and `nextFramePositionSeconds` remain separate diagnostics.
Missing target reach leaves `latencyMs` null and fails after the existing 2,000 ms observation timeout.
Missing frames and incomplete target reach retain different failure codes.
Repeated pointer or input events still fail without another click.
The C1 allowance remains the larger of 10% or 16.7 ms.
Failure reports retain numeric diagnostics and omit private causes.

R2 navigates to the supplied base URL with `automation=1`.
Application source uses this flag only for the initial library-track load guard and its effect dependency.
The inspected references are `app/page.tsx:621`, `:626`, `:1467`, and `:1511`.

R3 shares the complete frozen pathspec through `perf/build-inputs.mjs`.
Both entry points reject dirty, deleted, and untracked build inputs with `UNCOMMITTED_BUILD_INPUTS`.
Tests use real temporary Git repositories and mock only process, filesystem, and browser boundaries.
They exercise every included path and documented exclusion.
The service never reaches the build boundary for rejected inputs.

Documentation records the new method, exclusions, identity requirements, and pending independent measurements.
It retains prior tables and links as historical evidence.
Network policy, local telemetry, production identity checks, fixture, and scenario remain unchanged.

## Development evidence

Use Node `24.18.0` and pnpm `11.1.1`.

| Command                                                                       | Result                                | Evidence                     |
| ----------------------------------------------------------------------------- | ------------------------------------- | ---------------------------- |
| `pnpm test` before test edits                                                 | 48 passed across eight files          | Red checkpoint in `log.md`   |
| `pnpm test` before source repair                                              | 42 failed, 75 passed                  | `red-tests.txt`              |
| `pnpm exec eslint tests/perf*.ts`                                             | PASS before red commit                | `red-lint.txt`               |
| `pnpm exec tsc --noEmit`                                                      | PASS before red commit                | `red-types.txt`              |
| `pnpm test` after repair                                                      | 117 passed across ten files           | `green-tests.txt`            |
| `pnpm exec tsc --noEmit`                                                      | PASS after repair                     | `green-types.txt`            |
| `pnpm exec eslint perf tests/perf*.ts docs/performance.md` plus owned records | PASS                                  | `touched-lint.txt`           |
| `pnpm exec eslint .`                                                          | 35 errors, 32 warnings; existing debt | `full-lint.txt`              |
| ESLint on staged and tracked files from `git ls-files -z`                     | 35 errors, 32 warnings; no new errors | `tracked-lint.txt`           |
| `git diff --check`                                                            | PASS                                  | Final checkpoint in `log.md` |

The synthetic delayed-target test records 64 ms instead of the old 16 ms first-frame value.
A 16 ms baseline permits 32.7 ms under the frozen allowance, so that delayed result fails the comparison.
Prompt target reach passes. Timeout and repeated-event tests fail the run.
These controlled clocks are regression evidence, not browser performance measurements.

The full-lint debt remains tracked in DIG-3939.
An initial full-lint run read its own incomplete JSON output and added one report-file error.
A later concurrent check caught an unformatted log line before the formatter completed.
Both report issues are fixed. The final full-directory output retains only the existing 35 errors.
No full-lint green claim is made.

## Identity and remaining QA

`input-identity.json` records SHA-256 hashes for all harness files, perf tests, fixture, dependencies, and configuration files.
It includes the new shared helper and application tree object IDs.
This source record does not replace production build identity or paired QA evidence.
No new build or browser measurements were collected.

Independent QA must rebuild both checkouts and record fresh production `BUILD_ID` and SHA values.
QA must verify matching harness, dependency, configuration, and fixture hashes on both sides.
Capture three runs per side with installed system Chrome, real WebAudio, and real WebGL.
Use target-reach medians for the seek comparison and preserve all four frozen numeric allowances.
Record each run, failure diagnostics, and the real playback-control flow.
Update historical result tables and the gate-summary pointer only after independent paired evidence exists.
Independent depth review remains required before coordinator integration and release gates.

The first test command installed missing dependencies and ran the configured Lightpanda installer.
That incidental download did not change dependency files. No Lightpanda or browser tool ran.
No further installs, browser downloads, external mutations, push, merge, or deployment occurred.
The feedback file records the setup correction.
