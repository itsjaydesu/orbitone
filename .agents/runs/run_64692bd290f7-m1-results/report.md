# M1 measured-results documentation: DIG-3937

Updated [docs/performance.md](../../../docs/performance.md) from the frozen spec and final QA records.
Recorded all four numeric gates as PASS, with CPU runs, spread, and measurement limits.
Preserved the failed harness evidence and its unknown cause.
Documentation lint and diff checks pass; application tests were not rerun.
ORCH must add the linked QA files in its final integration commit.

## Evidence and scope

Baseline: `0a88a96859b4ce255014a7693b3222358cb09f9a`.
Candidate: `6fb2db5ef00e9b36ae345e3d740faef75448574a`.
Sources: [final QA](../run_64692bd290f7/qa/m2.md) and [gate summary](../run_64692bd290f7/perf/comparison/gate-summary-attempt1.json).
Both raw attempt-1 reports support the document tables.
Nine QA evidence links resolve in the coordinator checkout; the lint disclosure links to this owned report.
The opening summary uses seven lines, including its heading and blank line.

Playback CPU decreased 55.216%; rAF p95 stayed at 9.2 ms.
Active seek latency increased 2.0 ms; paused CPU increased 0.489 percentage points.
Completion observations span 3.9–13.5 ms and remain separate from next-frame latency.
Candidate run 3 first showed 85.5 seconds, then reached 175 seconds after 13.5 ms.

Existing QA records 48 passing tests, typecheck PASS, and touched-file lint PASS.
Baseline full lint has 35 errors and 31 warnings under DIG-3939.
ORCH reports final candidate source has 35 errors and 32 warnings.
No application, UI, test, harness, configuration, browser, or server changes were made.
M2 reviewers retain their fixed source SHA.

## Lint disclosure

Source: coordinator message `msg_a6b0a9ceddf9`, received before worker completion.
ORCH sent this correction at 13:04:59 JST on 2026-09-21 (04:04:59 UTC).
ORCH reports 48 integration tests, typecheck, and touched-file lint pass.
Candidate touched-file lint has 21 warnings. M2 adds one acknowledged direct-set-state warning.
Baseline full lint has 35 errors and 31 warnings; final candidate source has 35 errors and 32 warnings.
ORCH owns a separate run-log formatting error and its correction before final integration.
These counts follow the coordinator's check; this documentation task did not rerun full lint.

IMPL_COMPLETE
