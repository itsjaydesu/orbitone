# SPEC: PR7 repair and release (run_43ff26f7720f, S1)

Status: FROZEN after ARCH-B round 2. User authorizes repair, merge, and production release.
Scope: the three Codex findings on PR7 head c876838, then guarded merge and
production deployment. The frozen spec file from run_64692bd290f7 stays on
disk unchanged. This contract explicitly supersedes its seek metric
semantics. All other frozen limits stay in force.

## Target

- `perf/probe.ts`, `perf/probe-types.d.ts`, `perf/seek.ts`, `perf/baseline.ts`,
  `perf/contracts.ts`, `perf/service.mjs`
- `tests/perf-probe.test.ts`, `tests/perf-seek.test.ts`, `tests/perf-cli.test.ts`
- `docs/performance.md` (method, inputs, results)
- No application file changes. `app/`, `components/`, `hooks/`, `lib/` stay
  untouched.

## R1 — Target-reach latency becomes the primary seek metric (P1)

1. The probe measures target-reach latency: pointerdown to the first
   animation frame whose position is inside tolerance of
   `requestedPositionSeconds`. One frame chain, started at pointerdown.
2. `playbackSeekLatencyMs` and `pausedSeekLatencyMs` now carry target-reach
   latency. This supersedes the frozen first-frame semantics; document the
   supersession in `docs/performance.md`.
3. The C1 seek gate keeps its existing allowance: the candidate median
   increase stays within the larger of 10% or 16.7 ms, applied to the new
   metric. No new numeric limit. No grace constant.
4. The first-frame value stays as a separately named diagnostic,
   `firstFrameLatencyMs`, with `nextFramePositionSeconds`. Diagnostics never
   drive the gate.
5. If the position never reaches tolerance inside the 2,000 ms observation
   timeout, the run fails. The timeout stays a timeout, not an acceptance
   threshold.

## R2 — Deterministic startup (P2)

Navigate the benchmark with the `automation` query parameter appended to
`options.baseUrl`. The guard at `app/page.tsx:1466` already suppresses the
random startup load. Do not modify `app/page.tsx`. Confirm automation mode
gates nothing else a measurement reads.

## R3 — Complete build-input cleanliness (P2)

Both entry points (`perf/baseline.ts` clean check, `perf/service.mjs`
pre-build check) use one shared pathspec covering all build inputs:

`app components hooks lib public scripts perf package.json pnpm-lock.yaml
pnpm-workspace.yaml next.config.ts tsconfig.json postcss.config.mjs
ecosystem.config.js`

- `git status --porcelain` over this pathspec catches dirty, deleted, and
  untracked files. Any hit blocks the run.
- Both entry points fail with the named code `UNCOMMITTED_BUILD_INPUTS`.
  Add that code to `perf/service.mjs`, which today throws a generic error.
- Documented exclusions, recorded in `docs/performance.md`: `docs/`,
  `tests/`, `vitest.config.ts`, `eslint.config.mjs`, `README.md`, `LICENSE`,
  `.agents/`, and generated files (`.next/`, `next-env.d.ts`,
  `tsconfig.tsbuildinfo`). Rationale: they do not change build output.

## Test-first ordering

Commit failing regression tests before any repair code, as a separate
commit. Required red coverage:

1. Delayed target reach fails; prompt target reach passes.
2. Observation timeout fails the run.
3. Repeated pointer or input events fail the run.
4. Benchmark navigation includes the `automation` parameter.
5. Dirty, deleted, and untracked `public/` (and one root config) inputs
   block both entry points with `UNCOMMITTED_BUILD_INPUTS`.

The repair commit turns all red tests green without weakening them.

## Re-measurement

Historical reports cannot satisfy the repaired gates. Produce new paired
evidence:

- Identical repaired harness, dependency, and configuration bytes on both
  sides. Baseline = app at `3ee74f3` (origin/master). Candidate = PR7 head.
- Three runs per side, same scenario as the frozen spec.
- Record per side: application SHA, harness file hashes, production build
  identity (`BUILD_ID` + SHA), `piano-man.mid` fixture hash, and every
  individual run. Preserve prior report files; write new ones.
- All four C1 gates must pass on the new data, with the seek gate on the
  new target-reach metric. Update `docs/performance.md` tables and the
  gate-summary pointer.

## Gates through release

Order: S2 repair → S3 QA → S4 review → thread disposition → S5 merge →
deploy → production smoke. Pre-merge QA uses the local production build.
Production smoke runs only after deployment; no gate requires production
before merge.

1. **S3 QA (independent):** full suite, typecheck, touched-file lint. Full
   lint gains no new errors over the recorded 35. Local production-build
   browser QA through a QA lane, not inline.
2. **S4 review (independent):** REV-DEPTH family differs from the IMPL
   family. Reviewer verifies each Codex finding is closed by the diff.
3. **Thread disposition:** `gh-pr-reply` is not allowlisted for Orbitone.
   Use `gh pr comment` with one comment linking each of the three findings
   to its fixing commit and test. Do not alter the wrapper; do not require
   inline thread mutation.
4. **S5 guarded merge:** re-read `origin/master` and the PR head SHA
   immediately before merging. Merge via GitHub API with the exact-head
   SHA condition; abort on any drift and re-gate.
5. **Deployment gate:** confirm the Vercel production alias for project
   `orbitone` (team `itsjaydesus-projects`) serves a deployment whose
   commit equals the merged SHA before smoke starts.
6. **Production smoke (signed-out, QA lane):** the release ships the
   accumulated `fbbac4d` → release delta (Visualizer, `useMusic`,
   layout/CSS, config), not only PR7. Smoke covers that full delta on the
   real production URL, signed out: every real playback control (start,
   stop, pause, both seeks, tempo, end/replay, track switch, MIDI-roll
   toggle), scene rendering and camera motion, and zero new console
   errors. WebAudio evidence: prove real audio output and playback
   progress via the page's own analyser and position. Disclose the
   limitation: analyser samples cannot prove audible-gap absence, and no
   hardware-listening evidence exists. Claim neither.
7. Smoke failure blocks the release and escalates to ORCH; no inline fix.
   Record the smoke verdict and the rollout delta in the run log before
   the run's final release signal.

## Observable acceptance

1. Red-test commit precedes the repair commit in history.
2. All five red-coverage areas pass after repair; full suite, typecheck,
   lint gates green.
3. New paired benchmark reports exist with the recorded identities; all
   four C1 gates PASS on the target-reach metric.
4. `docs/performance.md` documents superseded seek semantics, the full
   input pathspec, exclusions with rationale, and new results.
5. One `gh pr comment` maps all three findings to fixing commits.
6. Merge is exact-head; Vercel production commit equals the merged SHA.
7. Signed-out production smoke verdict PASS over the full rollout delta,
   with the WebAudio evidence limitation disclosed.

## Ownership and routing

One IMPL module for all repairs (suggested IMPL-CORE; R2/R3 ride along).
IMPL never QAs or reviews. REV-\* never edits. ORCH executes merge and
deploy gates; browser verification always delegates to QA lanes.

## Out of scope

Follow-ups DIG-3939, DIG-3950, DIG-3951, DIG-3952. Application code
changes. Frozen non-seek limits. Wrapper or allowlist changes.

SPEC_FROZEN
