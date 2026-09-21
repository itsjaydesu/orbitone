# M1 contract evidence

These checks support implementation completion only.
Independent QA owns browser checks and measurements.

| Frozen contract                                       | Implementation evidence               | Development result                               |
| ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| Parser boundaries and three real files                | tests/music.test.ts                   | 9 tests pass                                     |
| Public useMusic controls and cleanup                  | tests/use-music.test.ts               | 11 tests pass                                    |
| Export timing, frames, cameras, fades, audio duration | tests/export.test.ts                  | 8 tests pass                                     |
| Export session cancellation                           | tests/use-video-export.test.ts        | 1 test passes                                    |
| Missing CPU, upload, audio, progress, browser errors  | tests/perf-contract.test.ts           | Failure gates pass                               |
| Analytics network isolation                           | tests/perf-contract.test.ts           | Local interception and external rejection pass   |
| Window bounds, seek timing, audio connection          | tests/perf-probe.test.ts              | Controlled browser-boundary tests pass           |
| Required explicit URL                                 | tests/perf-cli.test.ts                | Process exits with failure before browser launch |
| Production PM2 and Portless service                   | ecosystem.config.js; perf/service.mjs | Typecheck and lint pass; runtime UNVERIFIED      |
| Three-run scenario and medians                        | perf/baseline.ts                      | Typecheck and lint pass; measurements UNVERIFIED |
| No application changes                                | git diff against 3ee74f3              | app, components, hooks, and lib remain unchanged |
| Full lint                                             | full-lint-final.txt                   | 35 errors and 31 warnings; DIG-3939              |
| Real browser acceptance                               | docs/performance.md                   | Independent QA pending                           |

The sample-loading test records DIG-3950 as a known defect.
The focused-range defect remains for browser evidence under DIG-3951.
C1 remains outside M1 and requires coordinator authorization after baseline measurements.
