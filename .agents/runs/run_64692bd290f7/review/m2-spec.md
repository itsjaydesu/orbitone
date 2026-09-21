# M2 spec review

Target: `6fb2db5ef00e9b36ae345e3d740faef75448574a`; baseline: `3ee74f349f70074aba0ee0f9daf4ec39398c541d`.
Reviewer: REV-DEPTH, Astra xhigh; author: Claude Fable.
Completed: 2026-09-21T04:01:37.135242+00:00.

Findings: **P1: 0; P2: 0; P3: 0**. No proved regression, missing M2 requirement, or scope expansion.

Source references below resolve against the target worktree. Requirement references resolve against the frozen `SPEC.md`.

- Ownership, SPEC:18–20: M2 changes only `hooks/useMusic.ts`, `app/page.tsx`, and `components/PlaybackTimeline.tsx`. `components/Visualizer.tsx` has no diff. Audio scheduling calculations and callbacks remain unchanged (`hooks/useMusic.ts:504–568`).
- C1, SPEC:99: “Reduce whole-page updates from the playback clock while preserving transport time as the audio and scene authority.” `hooks/useMusic.ts:577–598` publishes each frame, but updates page-owned time state every 500 ms. `components/PlaybackTimeline.tsx:28–32` subscribes locally; `app/page.tsx:2807–2811` passes the stable clock.
- C1, SPEC:103: “The seek bar must remain smooth and reflect seeking and pause immediately.” `hooks/useMusic.ts:280–283` publishes explicit changes without the throttle. Pause, seek, and end use that path at lines 616, 714, and 321. Play starts the frame loop through lines 649–655 and 570–599. BPM, replay, and track changes publish at lines 519, 640, and 671, satisfying SPEC:104.
- Subscriber lifecycle: `hooks/useMusic.ts:286–302` retains stable functions and removes each listener on unsubscribe. `components/PlaybackTimeline.tsx:28–32` owns the subscription. Frame cleanup remains at `hooks/useMusic.ts:472–490,597–603`.
- C1, SPEC:100–105: `components/Visualizer.tsx:236,1671,2008` preserves transport reads, export time, and live `always` rendering. Scene and export source remain unchanged.

QA evidence: `qa/m2.md` and both raw attempt1 JSON files under `perf/comparison/` match the reviewed source. Browser-check source at `a08fd3a` is identical across these four files.

Playback CPU medians fall 55.2%; rAF p95 stays 9.2 ms. Active seek rises 4.4→6.4 ms; paused CPU rises 0.084787→0.089673. All four frozen gates pass. Individual CPU ranges remain separate: baseline 0.2994–0.3323, candidate 0.1376–0.1525.

All twelve seek completions span 3.9–13.5 ms. Candidate run3 needs two frames. This observation does not prove an M2 control regression or its cause.

This review used source reasoning and existing QA evidence. It ran no tests or browser checks. M1 final-results documentation remains separately owned.

REVIEW_PASS
