# M2 UI-PERF handoff — DIG-3937 C1

Commit: 1137ea5 on itsjaydesu/run-64692bd290f7-ui (base 14e608e).
Diff: hooks/useMusic.ts (+52/−12), app/page.tsx (+6/−28), components/PlaybackTimeline.tsx (new, +51).

Design. Playback time lives in a ref-backed PlaybackClock (getTime, subscribe).
The rAF tick publishes every frame to clock subscribers.
It updates React state at most each 500 ms (2 Hz), keyed on the frame timestamp.
Explicit actions (seek, pause, play, end, replay, load, BPM) call setPlaybackTime.
That call syncs state at once and re-arms the throttle.
New PlaybackTimeline renders the seek bar and time text.
It subscribes per frame with useSyncExternalStore, so only that small subtree re-renders.
The page tree no longer reads per-frame time. Visualizer is unchanged; it still reads transport in its frame loop.

Checks (Node v24.18.0). `pnpm exec tsc --noEmit`: clean. `pnpm exec vitest run`: 38/38 pass, no test edits.
Lint on the three touched files: 0 errors, 21 warnings.
One warning is new, same tolerated class (no-direct-set-state-in-use-effect, useMusic.ts:283); the frozen spec requires that immediate BPM sync.

Limits. No browser run, no measurement, no self-QA. Independent QA must measure the candidate.
