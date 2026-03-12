# Todo

- [x] Review `/workspace/AGENTS.md` for container-wide server rules.
- [x] Create project-local `AGENTS.md` for `orbitone` with PM2 service, logs, and URL details.
- [x] Record the server-operation correction in `tasks/lessons.md`.
- [x] Align the PM2 `orbitone` service with the repo's working Next 16 startup mode.

## Review
- Added project-specific instructions to use the PM2-backed `orbitone` service on port `8048`.
- Documented the correct log locations and the preferred `devserver` / `devlogs` workflow.
- Updated `/workspace/ecosystem.config.js` so the PM2 `orbitone` service starts Next with `--webpack`, which resolves the Next 16 Turbopack/webpack crash loop.
