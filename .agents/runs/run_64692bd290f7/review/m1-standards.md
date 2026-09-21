# M1 Standards review — DIG-3937 (revision 2)

REV-DEPTH (claude-opus-5), Standards axis. Author family: Astra.
Target `14e608e`, diff `3ee74f3...14e608e`.

## Gate

**REVIEW_PASS**

No P1. Application source equals `3ee74f3`. C1 authorization follows baseline QA, which passed.
P2 resolution is required before acceptance. This review adds no gate.

## P2 findings

### P2-1 Global probe type breaks the repo augmentation idiom

`perf/probe-types.d.ts:25-33` declares `orbitonePerf` required, plus four unprefixed global interfaces.
Both repo precedents make the member optional: `components/VideoExportDevTools.tsx:40-42` (`__orbitoneAutomation?`),
`hooks/useMusic.ts:32-35` (`audioSession?`). `tsconfig.json:34` includes `**/*.ts`, so application code may call
`window.orbitonePerf.position()` unguarded and still typecheck.

### P2-2 `guard` discards the original error

`perf/baseline.ts:31-35` replaces any error with a `HarnessFailure` code, sets no `cause`, and logs nothing.
A selector, timeout, or network failure reports only `UPLOAD_FAILED`.

### P2-3 Part scheduling callbacks never run in tests

`tests/tone-boundary.ts:40-44`: `Part` ignores its callback and events arguments; `start()` is empty.
`hooks/useMusic.ts:496-506` therefore never executes. Note scheduling, `Tone.Frequency`, and
`triggerAttackRelease` are unreachable in every test. A regression there keeps the suite green.

### P2-4 README Scripts table is wrong in both directions

`README.md:100-110` drops `dev` and `start` (`package.json:10,12`), and omits `test` and `perf:baseline` (`package.json:17-18`).

## Withdrawn from revision 1

**Analysers do not accumulate per run.** One native-destination connect occurs, at
`tone/build/esm/core/context/Destination.js:37`, once per context. The app's only other one,
`hooks/useMusic.ts:95`, sits behind `unlockAudio`, which returns at `:399-401` unless
`isLikelyIPhoneSafari()` (`:226`) is true. Desktop Chrome skips it. `ensureAudioReady` early-returns on a
retained sampler; `ecosystem.config.js:11` disables export contexts. One analyser serves all three runs.

**No timeDomain readback exists.** The CDP Performance domain has four methods
(`protocol.d.ts:22984-22987`); `getMetricsReturnValue` is `{ metrics }` (`:16054-16059`). `timeDomain` is a
closed enum (`:16032`), so an unsupported value is a protocol error, and the guarded `Performance.enable`
at `perf/baseline.ts:229` turns that into BLOCKED. The literal at `:63` restates a verified precondition.

## P3 notes

- `perf/baseline.ts:63` duplicates the argument at `:229`; share one constant.
- `tests/perf-contract.test.ts:12` is titled "thread CPU seconds" but asserts `TaskDuration`.
- `tests/tone-boundary.ts` omits `getContext`. `hooks/useMusic.ts:409` is unreachable for environment reasons, not stub shape. Latent.
- `perf/probe.ts:5` never restores `AudioNode.prototype.connect`. The one added connect cancels across baseline and candidate.
- `perf/baseline.ts:201` and `:216` both count one blocked request.
- `perf/baseline.ts:128` re-asserts `:122`; only `browserErrors()` is fresh.
- `perf/contracts.ts:98` calls `new URL` with no catch. `:39` defaults to a macOS Chrome path. Run count `3` repeats at `:32,37` and `perf/baseline.ts:21`.
- `tests/web-audio-boundary.ts:32` gives every channel the same `Float32Array`.

M2 and Spec-axis report unread.

REVIEW_PASS
