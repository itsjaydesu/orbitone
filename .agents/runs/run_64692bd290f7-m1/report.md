# M1 CORE-TEST handoff

Regression checkpoint: `3a1fa5bd3f5ec35dadc6311570778116233d190b` — TEST_BASELINE_OK, 29 tests.
Tooling checkpoint: `1b44efb8a686299a7f7d8c51bc06ef56771bbae8` — IMPL_COMPLETE, 38 tests across seven files.

Application directories match frozen baseline `3ee74f349f70074aba0ee0f9daf4ec39398c541d`.
Node 24.18.0 and pnpm 11.1.1 match the task. The coordinator verified Astra xhigh.

Files: `tests/**`, `perf/**`, `vitest.config.ts`, `ecosystem.config.js`, `package.json`, `pnpm-lock.yaml`, `docs/performance.md`, README setup, and own run records.

Development tests, TypeScript, JavaScript service typechecks, touched-file lint, and diff checks pass.
Full lint retains 35 errors and 31 warnings under DIG-3939.
Vite reports a future config-loader warning; the current runner passes.

The harness uses real upload, system Chrome, explicit Portless URLs, and required threadTicks metrics.
It records three runs and medians, blocks missing metrics, and intercepts analytics locally.
The PM2 service builds production before serving and records build identity.

No service start, browser QA, production measurement, source review, or C1 implementation ran.
Independent QA must verify real browser flows and baseline measurements before C1 authorization.

Initial installation triggered the existing Lightpanda browser download.
The coordinator accepted that deviation; subsequent installs disabled scripts. Shared caches were not removed.

IMPL_COMPLETE
