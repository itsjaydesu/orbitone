# M1 measured-results documentation review: DIG-3937

REVIEW_PASS. All numeric claims in `docs/performance.md` match the raw evidence.
Nine QA evidence links resolve to real files in the coordinator checkout.
The lint-disclosure anchor resolves inside the owned report.
No P1, P2, or P3 defect found; one transparency note follows.
Scope: doc diff `6fb2db5..d1c24f4` only. No code changed.

## Verified arithmetic

Source: `perf/comparison/gate-summary-attempt1.json` and both attempt-1 raw reports.

| Claim                                   | Raw value                                       | Result |
| --------------------------------------- | ----------------------------------------------- | ------ |
| Playback CPU 32.932% → 14.748%          | 0.3293200408737775 → 0.1474819850284763         | OK     |
| 55.216% relative reduction              | 0.5521621318970882                              | OK     |
| rAF p95 9.2 ms, change 0.0 ms           | 9.19999999999709 both sides                     | OK     |
| Active seek 4.4 → 6.4 ms, +2.0 ms       | 4.400000095 → 6.400000095                       | OK     |
| Paused CPU 8.479% → 8.967%, +0.489 pp   | 0.0847867443 → 0.0896732363, delta 0.0048864920 | OK     |
| All four gates PASS                     | `allPass: true`                                 | OK     |
| Paused seek median 6.1 → 5.8 ms         | 6.100000381 → 5.799999714                       | OK     |
| Median audio-ready 684.102 / 666.993 ms | 684.1018330 / 666.9930830                       | OK     |

The paused-CPU limit is conditional in the frozen spec: the larger of 10% or one percentage point.
At a 8.479% baseline, 10% gives 0.848 pp, so 1.000 pp binds.
The table header "Limit for this baseline" states that correctly.

## Verified individual runs and spread

All twelve cell values round correctly from the raw `individual` arrays.
The raw `values` arrays are run order, confirmed against `seekDiagnostics` run numbers.
Baseline playback spread 0.032892587 gives 3.289 pp. Candidate gives 1.490 pp.
Baseline paused spread 0.026592262 gives 2.659 pp. Candidate gives 1.460 pp.
CPU rises across the three sequential runs in all four series, as the doc states.
Candidate playback maximum 15.246% stays below baseline minimum 29.941%, as the doc states.
Paused ranges overlap: baseline 7.769–10.428%, candidate 7.993–9.453%.

## Verified seek evidence

Active latency range 3.9–4.4 ms baseline and 5.4–7.0 ms candidate.
Paused latency range 6.1–6.6 ms baseline and 4.7–6.3 ms candidate.
Twelve `observationElapsedMs` values exist. Their range is 3.9–13.5 ms.
Candidate run 3 active seek matches every cell: requested 175 s, latency 5.4 ms,
next-frame position 85.5 s, observed 175 s, elapsed 13.5 ms.
The two-frame description is correct. `completionTimeoutMs` is 2000, a timeout only.

## Verified counts, scenario, and limitations

`test-base.txt` and `test-cand.txt` both record 48 passing tests across eight files.
`harness-identity.txt` records matching harness files for both checkouts.
Scenario `DIG-3937-upload-01` records 1280x720, DPR 1, default camera, `midiRoll: false`.
It records 10 s warmup, 30 s playback, 10 s pause, and 3 runs.
All six runs record zero `frames.over50Ms` and zero `longTasks.count`, for playback and pause.
All six playback windows record position 0 to 30 s and nonzero analyser peak.
Browser errors are zero on both sides.
JST capture times convert correctly from the recorded UTC timestamps.
Raw `limits` cover renderer-only CPU, single-point heap, and audio-gap uncertainty.
The doc states each limitation, plus the device and Chrome scope.
`qa/m2.md` confirms the browser checks used `a08fd3a` with code `1137ea5`.
`qa/m2.md` confirms the failed revised baseline cause stays unknown.

## Note, P3 severity zero

`qa/m2.md` records full lint debt as 35 errors and 31 warnings only.
The 35 errors with 32 warnings figure and the 21 touched-file warnings come from
coordinator message `msg_a6b0a9ceddf9`, not from a stored lint artifact.
The doc attributes both figures to ORCH and links the disclosure.
That attribution is honest, so this is not a defect.
ORCH should attach its lint output before the PR to make the figures reproducible.

DONE
REVIEW_PASS
