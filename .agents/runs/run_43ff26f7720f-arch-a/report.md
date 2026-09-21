# ARCH-A report: PR7 repair and release contract (run_43ff26f7720f, S1)

Deliverable: `.agents/runs/run_43ff26f7720f/SPEC-draft.md`, revision r2.
File SHA-256: `59ca1bac272e42cbe1fb8cca36d94f16c4005c02325975361f80714005fa9e91`.
ARCH-B reviewed this exact hash and recorded SPEC_REVIEW_PASS.
This dispatch verified the draft against PR7 head `c876838` and did not change it.

## Verified facts

1. P1 (`perf/seek.ts:25`): `observeSeek` waits for target reach, but
   `latencyMs` records the first frame (`perf/probe.ts:68`). A stale bar
   inside the 2,000 ms window still passes. R1 closes this: target-reach
   latency drives the gate; first frame becomes a named diagnostic.
2. P2 startup race: the initial-track effect in `app/page.tsx` skips when
   `isAutomationMode` is true (`app/page.tsx:626`, `?automation` query).
   R2 uses this existing mode. No app file changes.
3. P2 dirty inputs: both `perf/baseline.ts:182` and `perf/service.mjs:11`
   share a pathspec that omits `public`, `scripts`, `tsconfig.json`,
   `postcss.config.mjs`, `pnpm-workspace.yaml`. R3 completes the pathspec
   in both entry points with one failure code, `UNCOMMITTED_BUILD_INPUTS`.
4. The seek allowance the draft reuses is the documented C1 gate:
   the larger of 10% or 16.7 ms (`docs/performance.md:182`).
5. The named test files exist: `tests/perf-probe.test.ts`,
   `tests/perf-seek.test.ts`, `tests/perf-cli.test.ts`.

## Binary acceptance

The draft states seven observable criteria (section "Observable
acceptance"). Each is a yes/no check on git history, test output, report
files, docs, PR state, deployment identity, or a QA-lane verdict.

## Single-writer ownership

One IMPL module owns all repairs: `perf/*`, the three perf test files,
and `docs/performance.md`. No shared files. IMPL never QAs or reviews.
REV-\* never edits. ORCH alone runs merge and deploy gates. QA lanes alone
drive browsers.

## Risks and limits

1. Metric supersession: the frozen first-frame seek semantics change to
   target-reach. The draft documents this as an explicit supersession.
   The old frozen spec file stays on disk unchanged.
2. Re-measurement risk: target-reach medians can exceed old first-frame
   medians on both sides. The gate compares candidate to baseline under
   the same metric, so this is safe, but new numbers will differ from
   published tables. Docs must present them as a new method, not a redo.
3. Audio evidence limit: analyser samples prove output and progress.
   They cannot prove audible-gap absence. No hardware-listening evidence
   exists. The smoke verdict must not claim either.
4. Thread resolution limit: `gh-pr-reply` is not allowlisted for this
   repo. The contract uses one `gh pr comment` mapping findings to fixing
   commits. Inline thread resolution stays manual for the human.
5. Deploy drift risk: production trails master (`fbbac4d` vs `3ee74f3`).
   The release ships the accumulated delta, not only PR7. The smoke
   scope covers the full delta; a failure there blocks the release even
   if PR7 itself is sound.
6. Race window at merge: the exact-head merge condition aborts on drift.
   Any abort re-gates; it never retries blind.

## Limits of this verdict

This report covers the contract only. Implementation, measurements,
merge, deployment, and production acceptance remain pending under S2–S5.

ARCH_A_COMPLETE
