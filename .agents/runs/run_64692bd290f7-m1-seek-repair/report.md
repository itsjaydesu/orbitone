# M1 seek repair: DIG-3937

The seek repair preserves the frozen pointerdown-to-next-rAF latency metric.
It uses Playwright actionability checks, stable geometry, and one real locator click.
It captures native input independently and records bounded completion observations.
The original browser failure cause remains unknown. Independent QA must rerun both builds.

## Changes

- Preserve the first native input value before delegated handlers update the controlled range.
- Retain first-frame timing and position while separately observing completion within 2,000 milliseconds from pointerdown.
- Preserve the 3% position tolerance. Reject missing or repeated input without another click.
- Record state-specific failure codes and numeric diagnostics, including incomplete seeks.
- Document metric limits and the 14-pixel range thumb's quarter-point geometry bias.

## Development checks

| Check                         | Result                                               |
| ----------------------------- | ---------------------------------------------------- |
| Initial regression checkpoint | Two probe tests failed before implementation changes |
| Focused tests                 | 11 passed                                            |
| Final suite                   | 48 passed across eight files                         |
| Typecheck                     | PASS                                                 |
| Touched lint                  | PASS                                                 |
| Diff check                    | PASS                                                 |
| Full lint                     | Existing 35 errors and 31 warnings; DIG-3939         |
| Runtime                       | Node 24.18.0 through explicit PATH                   |

The existing Vite configuration warning remains. No dependencies or configuration changed.
No application files, other run records, servers, or browser sessions changed.
QA owns the independent browser rerun; these checks do not prove real-flow reliability or a performance gain.
