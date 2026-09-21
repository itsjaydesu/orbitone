# REV-DEPTH S4 spec-axis review log — M1 (DIG-3937)

AGENTS_MD_ACK

- Read machine AGENTS.md and ~/.claude/PIPELINE.md before review.
- Role REV-DEPTH, axis Spec, read-only. Author lane is Astra (IMPL-CORE), so
  reviewer family differs from author family.
- Target checkout pinned at 14e608e0624dbbc8a7c64e22d701c2fd41fa4cd9.
- Preamble capability verified with live heartbeat msg_15357ea08294.

## Review steps

- Read frozen `SPEC.md` at the target, 144 lines, and the fixed diff `3ee74f3...14e608e`.
- Mapped every SPEC:45-49 regression boundary to a test file. All are present.
- Checked mock boundaries with one grep. Only `tone` and clock or WebAudio globals are mocked.
- Read `perf/contracts.ts`, `perf/probe.ts`, `perf/baseline.ts`, `perf/service.mjs`, `ecosystem.config.js`.
- Confirmed `threadTicks` at `perf/baseline.ts:229`, with BLOCKED on failure per SPEC:91.
- Verified from recorded evidence that CDP `Timestamp` stays wall-clock: 30.015 s against 30001 ms.
- Traced `introStartRef` and intro settle 3.7 s. Startup animation stays outside the windows (SPEC:79).
- Confirmed `app/page.tsx:93-99` defaults match the recorded scenario metadata (SPEC:77).
- Attributed `SPEC.md`, run `log.md`, and `spec-archb.md` to ORCH commit `147a01f`, not M1.
- Read QA browser findings and the baseline perf JSON as run evidence only.
- Did not read the Standards report. Did not inspect or edit M2.

## Result

No P1. Five P2 items and four P3 items. Report: `m1-spec.md`.

REVIEW_PASS

## Revision, dispatch ctx_c4e4ed5d5ab2

Correction 1. The earlier `ended_utc` 03:12:00Z was an estimate, and it fell after the
recorded worker_done at 03:07:21Z. Replaced with recorded values: start 02:55:41Z from the
first sidecar write, end 03:06:57Z from the last artifact write. I no longer estimate times.

Correction 2. P2-1 recommended a manual `pnpm dev` start. Machine AGENTS requires PM2 and
Portless, so that advice conflicted with the standard. The finding now keeps its evidence and
asks for two things: label the service benchmark-only, and match the Scripts table to
`package.json`. It proposes no new server.

Correction 3. P2-3 claimed three runs "cannot resolve" a 10% effect. That is too strong from
three samples. The finding now treats an effect near 10% as uncertain at the observed spread
and asks for per-run disclosure, not a new gate.

Findings trimmed to 398 words. P2-2 active seek, P2-4 final results, and P2-5 QA audio
evidence stay as first written. ORCH assigns the M1-owned repairs; QA owns its evidence.
No source, test, config, doc, or spec file changed. I did not read the Standards report.

REVIEW_PASS
