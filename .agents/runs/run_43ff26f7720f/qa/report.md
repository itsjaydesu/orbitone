# QA report — run_43ff26f7720f (PR7 repair)

Role: QA-MECH + browser-qa (grok-4.5 medium). Node `v24.18.0`, pnpm `11.1.1`.
Written: 2026-09-21T05:41:17Z

## Gate

**QA_PASS**

## Identities

| Side | Checkout | HEAD | App trees |
| --- | --- | --- | --- |
| Baseline | `run-64692bd290f7-core-repair` | `e160e11cbc1c1aa3bd4f4ad4d458d03f935fa17a` | `app/components/hooks/lib` == `3ee74f3` |
| Candidate | `pr7-benchmark-repair` | `e456081266ad58928e09963dbae56e3141f3c38b` | `app/components/hooks/lib` == pre-repair `c876838` |

Harness/config/fixture hashes equal across sides (see `qa/mech/identity-hashes-fixed.txt` and `qa/mech/identity-complete.txt`). Fixture sha256 `4d3a338a97f7bcb1d6cf3f7f5a88477e72f02d41f2728889e50f1617a68d5e4b`. Scripts blobs equal. Malformed initial identity preserved as `perf/baseline/identity-malformed-initial.txt`.

Build IDs: baseline `GMWOu80n6BAT2Vr7FmV4R`; candidate `TUIzWFOJBexqOZmnl0Tz4`.

## Red-before-repair

- Red `9375760` is ancestor of repair `4bd0c89`.
- Red evidence: 42 failed / 75 passed of 117 at red commit (`red-tests.txt`).
- After repair: **117/117** pass on both checkouts (`qa/mech/test-*.txt`).

## Mechanical

| Check | Result | Evidence |
| --- | --- | --- |
| Full suite | **PASS** 117/117 | `qa/mech/test-cand.txt`, `qa/mech/test-base.txt` |
| Typecheck | **PASS** | `qa/mech/tsc.txt` |
| Touched lint | **PASS** 0 errors | `qa/mech/touched-lint.txt` |
| Full tracked lint | **35 errors / 32 warnings** (DIG-3939 baseline; no new-error claim beyond recorded) | `qa/mech/full-lint.txt` |

## Paired production benchmarks (target-reach seek)

URLs from `portless list` (no guessed hosts):
- Baseline: `https://pr7-repaired-baseline.orbitone-perf-3937.asuka` (route-correction recorded; obsolete core-repair hostname filter abandoned without restarting server)
- Candidate: `https://pr7-benchmark-repair.orbitone-perf-3937.asuka`

Reports:
- `perf/baseline/baseline-pr7-2026-09-21T05-32-24.482Z.json`
- `perf/candidate/candidate-pr7-2026-09-21T05-36-26.661Z.json`
- Summary: `perf/comparison/gate-summary.json`

Chrome 153 / hardware ANGLE Metal Apple M3 Max / threadTicks.

### Frozen gates (target-reach `playbackSeekLatencyMs`)

| Gate | Baseline median | Candidate median | Delta | Limit | Result |
| --- | --- | --- | --- | --- | --- |
| Playback CPU ≥10% reduction | 0.3829 | 0.1680 | **−56.1%** | ≥10% | **PASS** |
| rAF p95 | 9.2 ms | 9.2 ms | 0 | ≤ max(5%,1ms)=1ms | **PASS** |
| playbackSeekLatencyMs (target-reach) | 3.1 ms | 6.8 ms | +3.7 ms | ≤ max(10%,16.7ms)=16.7 | **PASS** |
| Paused CPU | 0.1022 | 0.0938 | −0.0084 | ≤ max(10%,1pp) | **PASS** |

Paused seek (separate): baseline 5.2 ms → candidate 4.9 ms.
First-frame diagnostic (not gate): see `gate-summary.json` `firstFrame*` spreads. Candidate playbackSeek individual 12.4 / 6.5 / 6.8 ms (median 6.8); run1 target-reach 12.4 with firstFrame 5.2 (two-frame case possible).

### Spreads

- playbackCpu B 0.346–0.453 (spread 0.107); C 0.167–0.179 (0.012)
- pausedCpu B 0.089–0.126; C 0.090–0.105
- Disclose: baseline CPU run3 0.453 elevates median; reduction still large.

## Independent browser QA

System Chrome, WebGL, WebAudio analyser; URL with `?automation=1`. Evidence `qa/browser/`.

PASS: upload, sustained audio peak 0.261 over 10s after onset, play/pause, seek, live-seek-while-playing (loose box-fraction; see note), tempo, track switch, end/replay, MIDI roll, continuous animation, WebGL Metal. DIG-3951 KNOWN_DEFECT (arrow switches track). DIG-3950 known. No hardware listening claim. Analytics 404s intercepted/separated.

Note: independent live-seek used full-box fraction and loose 12% tol (observed ~184 vs naive ~192); harness target-reach metrics remain the seek-gate authority.

## Service

`orbitone-perf-3937` stopped after QA. Restored generated `next-env.d.ts` where dirty. Other PM2 apps untouched.

## Handoff

Independent S3 QA PASS for PR7 repair. Identities, 117 tests, tsc, touched lint, and full lint 35/32 recorded. Fresh paired production runs on repaired harness: all four frozen gates PASS on target-reach seek. Browser flows PASS with known DIG-3950/3951. Evidence under `qa/**` and `perf/**` of this run. Results-doc update remains IMPL; production smoke is a later dispatch.

QA_PASS
