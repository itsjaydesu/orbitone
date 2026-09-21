# REV-DEPTH report, round 1 — run_43ff26f7720f (PR7 repair)

Role: REV-DEPTH. Model: Claude Opus 5, high effort.
Author family: Astra (Codex). Reviewer family: Claude. Families differ.
Written: 2026-09-21T05:57:20Z. Round 1 of 2. Superseded by report.md; kept as the round-1 record.

## Gate

**REVIEW_FAIL** — one P1. The harness repair is correct. The evidence chain is broken.

## Scope inspected

Diff `c876838..e456081` in `/Users/dev/orca/workspaces/orbitone/pr7-benchmark-repair`.
Results docs `e456081..bb18837`, supplied by ORCH.
I confirmed no source drift after `e456081`. Only `docs/` and run records changed.

## Independent verification

I re-ran every mechanical gate. I did not trust the QA report.

| Check                           | Result                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| Perf test files (5)             | 80/80 pass                                                    |
| `tsc --noEmit`                  | exit 0                                                        |
| Lint, 11 touched files          | exit 0, 0 errors                                              |
| Full lint                       | 35 errors, 32 warnings — equals the DIG-3939 frozen exception |
| Red commit `9375760` content    | tests and records only, no `perf/` source                     |
| `9375760` ancestor of `4bd0c89` | true                                                          |
| App source `c876838..e456081`   | empty for `app components hooks lib public`                   |

Paired identity, verified by git object hashes, not by report text:

- Baseline checkout `e160e11` app trees equal `3ee74f3` exactly, including `public`.
- `perf` tree `5db651f` and `tests` tree `bfee8a8` are identical on both sides.
- `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.json`,
  `postcss.config.mjs`, `ecosystem.config.js`, `vitest.config.ts` blobs are identical.
- Fixture sha256 `4d3a338a…d5e4b` is equal on both sides and matches the QA record.

Both sides therefore ran one repaired harness against two application sources. This is correct method.

## Comparison gates

I recomputed all four gates from the raw run files.

| Gate              | Baseline | Candidate | Change    | Limit                       | Result |
| ----------------- | -------- | --------- | --------- | --------------------------- | ------ |
| Playback CPU      | 0.382869 | 0.167971  | −56.128%  | ≥10% reduction              | PASS   |
| rAF p95           | 9.2 ms   | 9.2 ms    | 0 ms      | max(5%, 1 ms) = 1 ms        | PASS   |
| Target-reach seek | 3.1 ms   | 6.8 ms    | +3.7 ms   | max(10%, 16.7 ms) = 16.7 ms | PASS   |
| Paused CPU        | 0.102156 | 0.093753  | −0.008403 | max(10%, 1 pp) = 0.010216   | PASS   |

The arithmetic is correct. `allPass` is true. Both reports show `status PASS`, 3 runs, production build, 0 browser errors.
Analytics intercepts are equal on both sides (1 script, 0 events). No measurement skew.

The new metric discriminates. Candidate run 1 records `firstFrameLatencyMs` 5.2 ms with first-frame
position 85.5 s, and `latencyMs` 12.4 ms at position 175 s. The first frame missed the target.
The old metric would have reported 5.2 ms. This is direct proof the repair changed the measurement.

## Codex findings — closure check

**Finding 1 (P1, `perf/seek.ts:25`) — gate on target reach. CLOSED.**
`perf/probe.ts:69-83` runs one rAF chain from pointerdown. It sets `latencyMs` at the first frame
whose position is inside tolerance of `requestedPositionSeconds`. `perf/baseline.ts:154,156` feed the
gate from `latencyMs` only. `firstFrameLatencyMs` never reaches a gate.
`components/PlaybackTimeline.tsx:36-44` renders a controlled input with `value={currentTime}` from the
playback clock. `position()` therefore reads the application clock, not the browser's pre-commit value.
The stale-bar regression Codex described now raises the gate metric.

**Finding 2 (P2, `perf/baseline.ts:240`) — deterministic startup. CLOSED.**
`perf/baseline.ts:241-243` appends `automation=1` before navigation. I checked the guard myself.
`app/page.tsx:621` reads the flag. `app/page.tsx:1467` uses it, and `app/page.tsx:1511` is the
dependency entry. These are the only uses. Automation mode gates the random library load and nothing else.
No application file changed.

**Finding 3 (P2, `perf/baseline.ts:182`) — public assets in the clean check. CLOSED.**
`perf/build-inputs.mjs:1-16` lists the 14 spec paths in the spec order. `perf/baseline.ts:183` and
`perf/service.mjs:12` both use it. `perf/service.mjs:14` now throws the named `UNCOMMITTED_BUILD_INPUTS`.
`--porcelain` reports dirty, deleted, and untracked files.
Benchmark outputs live under `.agents/`, which the pathspec excludes. The check cannot block itself.

## Test quality

The red tests are real. They exercise the subject, not a mock of it.

- `tests/perf-seek-target.test.ts:22-24` reads the real `perf/probe.ts`, transpiles it, and runs it in a VM.
  `tests/perf-seek-target.test.ts:33-36` reproduces the controlled-input restore, then commits the seek at
  a chosen time. The delayed case at line 68 asserts `latencyMs` 64 with `firstFrameLatencyMs` 16, and
  asserts 64 exceeds the C1 allowance. Before the repair this case reported 16 and passed the gate.
- `tests/perf-inputs.test.ts:16-35` builds real temporary git repositories and runs the real `git status`.
  It proves both entry points block 14 input paths and permit 10 exclusion paths, for dirty, deleted,
  and untracked states.
- `tests/perf-seek-target.test.ts:85` proves the internal timeout text stays out of the serialized failure.

## Standards findings

**ST-1 (P3) `perf/service.mjs:13`.** `dirty.status !== 0 || dirty.stdout.trim()` reports a git failure as
`UNCOMMITTED_BUILD_INPUTS`. An operator will look for a dirty file that does not exist.
The direction is fail-safe. Separate the two causes.

**ST-2 (P3) `perf/seek.ts:47`.** The call passes the whole `diagnostics` object to `page.evaluate`, but the
callback destructures two fields. Pass only `toleranceSeconds` and `completionTimeoutMs`.

**ST-3 (P3) `perf/probe.ts:72`.** `armSeek` mixes `probe.seek` and `this.seek` in one method.
Use one term for one concept.

**ST-4 (P3) `perf/comparison/gate-summary.json`.** The `file` fields record absolute local paths under
`/Users/dev/...`. Record repository-relative paths in committed evidence.

## Spec findings

**SP-1 (P1) `docs/performance.md:384-387`.** The four new evidence links do not resolve.
I checked each path at `bb18837`. All four are absent from the repository:
`qa/report.md`, the baseline report, the candidate report, and `comparison/gate-summary.json`.
The files exist only in the untracked `gar` worktree. `.agents/` is not in `.gitignore`.
The earlier run committed its evidence; `.agents/runs/run_64692bd290f7/perf/**` is tracked at `bb18837`.
Spec acceptance criterion 4 requires the docs to record the new results.
The Re-measurement clause requires an updated gate-summary pointer.
A pointer to an absent file does not meet either. After merge the accepted evidence is unreachable.
Fix: commit the four artifacts to the candidate branch, then re-gate.

**SP-2 (P2) `perf/probe.ts:112`.** `observedPositionSeconds` now returns the latched
`targetPositionSeconds`. `observeSeek` therefore stops reading the live position after target reach.
`tests/perf-probe.test.ts:70` inverts an earlier assertion: a drift to 53.1 s previously returned null and
now returns a pass. A seek that reaches the target and then reverts is now invisible to the harness.
The latch follows spec R1.1, and `docs/performance.md:163` discloses the playback-advance case.
It does not disclose the revert case. Keep the latch. Add a separate post-reach stability check, or ticket it.

**SP-3 (P3) `docs/performance.md:262`.** The paused CPU limit reads "At most +0.01".
The computed limit is 0.010216, which is 10% of the baseline median. State the computed value.

**SP-4 (P3).** `perf/build-inputs.mjs` is a new file outside the spec Target list.
R3 requires one shared pathspec, and `perf/service.mjs` runs under plain node.
A `.mjs` module is the only form both entry points can import. I accept it. No action.

## Results-docs review

I checked every number at `bb18837` against the raw run files. All medians, both build IDs, the fixture
hash, both application SHAs, the three baseline CPU values, the three candidate CPU values, and the run-1
target-reach narrative match the measurements. The 56.1284% reduction and the 3.7 ms increase are correct.
The disclosures are honest: three runs support no significance claim, and the document claims no audible
continuity and no hardware listening. Only SP-1 and SP-3 apply.

## Verdict

The three Codex findings are closed in source, with meaningful red-before-green tests.
The paired measurement method is sound and independently verified.
One P1 blocks acceptance: the accepted evidence is not in the repository, so the results docs point at
nothing. This is cheap to fix and needs no code change.

REVIEW_FAIL
