# REV-DEPTH report, round 2 addendum — run_43ff26f7720f (PR7 repair)

Role: REV-DEPTH. Model: Claude Opus 5, high effort.
Author family: Astra (Codex). Reviewer family: Claude. Families differ.
Written: 2026-09-21T06:01:29Z. Round 1 record: `report-round1.md`.

## Gate

**REVIEW_PASS**

## Scope of this round

This is a bounded re-review. It is not a new source audit.
I checked three things only: the changed evidence, the ORCH dispositions, and my own record timestamps.
The round-1 source verdict stays valid. Round 1 verified the three Codex findings, the test quality,
the paired identity, and the four recomputed C1 gates. I did not repeat that work.
I ran no tests and made no source edit in this round.

## Source and docs did not move

I compared gar `367097d` against the reviewed bytes, by git object hash.

| Path                                                | gar 367097d | Source of truth | Result |
| --------------------------------------------------- | ----------- | --------------- | ------ |
| `app` `components` `hooks` `lib` `public` `scripts` | tree        | `e456081`       | EQUAL  |
| `perf`                                              | `5db651f`   | `e456081`       | EQUAL  |
| `tests`                                             | `bfee8a8`   | `e456081`       | EQUAL  |
| 8 root config files                                 | blob        | `e456081`       | EQUAL  |
| `docs/performance.md`                               | `f49f83a`   | `bb18837`       | EQUAL  |

The `perf` and `tests` hashes match the values I recorded in round 1.
`c5f03f0` and `367097d` add evidence and records only. No reviewed byte changed.

## SP-1 — CLOSED

Round 1 raised one P1. Four evidence links in `docs/performance.md:384-387` pointed at absent files.

I checked each target twice. All four are now tracked at `367097d`:

- `.agents/runs/run_43ff26f7720f/qa/report.md`
- `.agents/runs/run_43ff26f7720f/perf/baseline/baseline-pr7-2026-09-21T05-32-24.482Z.json`
- `.agents/runs/run_43ff26f7720f/perf/candidate/candidate-pr7-2026-09-21T05-36-26.661Z.json`
- `.agents/runs/run_43ff26f7720f/perf/comparison/gate-summary.json`

I also resolved each relative link from the `docs/` directory on disk. All four resolve.
The committed `gate-summary.json` holds the same numbers I recomputed in round 1:
`allPass` true, playback CPU reduction 0.5612843144169953, rAF p95 increase 0,
target-reach seek increase 3.700000286102295 ms, paused CPU change -0.008402970812470656.
Baseline SHA `e160e11…` and candidate SHA `e456081…` are unchanged.
The working tree holds no modification to the committed evidence.

Spec acceptance criterion 4 and the gate-summary pointer now hold. SP-1 is closed.

## Disposition review

I accept all eight dispositions. Each rests on a fact I checked, except where noted.

| ID   | Disposition                                           | My check                                                                                          |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SP-1 | Fixed by `c5f03f0`                                    | Verified. Four targets tracked and resolving.                                                     |
| SP-2 | Tracked as DIG-3964                                   | Accepted. See the limitation below.                                                               |
| ST-1 | Waived; git failure still blocks capture              | Correct. I called the direction fail-safe in round 1.                                             |
| ST-2 | Waived; serialized fields are numeric test inputs     | Correct. `diagnostics` carries state, fractions, tolerance, timeout, and box geometry. No secret. |
| ST-3 | Waived; receiver and closed-over probe are one object | Correct. `armSeek` runs as `window.__orbitonePerf.armSeek(...)`. Style only.                      |
| ST-4 | Waived; raw paths are capture provenance              | Reasonable. The documentation links are repository-relative and resolve.                          |
| SP-3 | Waived; `+0.01` is a rounding of 0.010216             | Correct. The candidate decreases paused CPU, so the limit is not load-bearing.                    |
| SP-4 | Accepted; shared module implements R3                 | Matches my round-1 reasoning.                                                                     |

ST-1 through ST-4 and SP-3 are P3. PIPELINE allows a P3 waiver with a logged reason.
The reasons are logged in `review-disposition.md` and are accurate.
SP-2 is P2. PIPELINE allows a P2 to be fixed or ticketed before acceptance. Ticketing is valid.

## Limitation — DIG-3964 not independently verified

I could not confirm the DIG-3964 issue myself. The Linear MCP server is unauthenticated and exposes
only `authenticate` and `complete_authentication`. No sanctioned Linear CLI exists on this machine;
AGENTS.md retires the wrapper tools. I did not start an OAuth flow during a dispatch.

The SP-2 ticket is therefore the one disposition that rests on ORCH attestation, not on filesystem or
git truth. The URL is well formed and names the correct defect. Asking ORCH to confirm its own record
adds no independent evidence, so I did not block on it. ORCH must confirm the issue exists before merge.

## Observation — not a finding

`c5f03f0` leaves five QA artifacts untracked: `qa/browser/browser-qa.mjs`, `qa/browser/shots/`,
`qa/heartbeat`, `qa/mech/identity-hashes.txt`, and `qa/mech/identity-hashes-partial.txt`.
None is a `docs/performance.md` link target, so SP-1 stays closed.
`qa/report.md` names `qa/browser/` as a directory, and that directory exists with its findings file.
The untracked items are screenshots, a driver script, a heartbeat, and two superseded identity files.
I raise no finding. Commit the screenshots if the release record needs the visual evidence.

## Record correction

ORCH found invented timestamps in my round-1 records. I corrected them from the file system.

| Record                | Was         | Now         | Ground                       |
| --------------------- | ----------- | ----------- | ---------------------------- |
| Round-1 report header | `06:00Z`    | `05:57:20Z` | `report.md` mtime            |
| Manifest `updated_at` | `06:02:00Z` | `05:58:17Z` | ORCH worker_done receipt     |
| Manifest `started_at` | `05:46:00Z` | `05:47:00Z` | `review/` directory creation |

I wrote the round-1 manifest at 05:57:45Z and recorded `06:02Z` in it. That value was four minutes
in the future at the moment I wrote it. I took it from assumption, not from a clock.
I now read the system clock before I record any time.

## Verdict

Source and docs bytes are unchanged from the reviewed state. SP-1 is closed by committed evidence.
The P2 is ticketed. The five P3 waivers carry accurate logged reasons.
No finding remains open against this diff.

REVIEW_PASS
