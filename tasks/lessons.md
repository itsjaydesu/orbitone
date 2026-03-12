# Lessons

## 2026-03-12
- In Zedbock, never operate app servers with `npm run dev`, `pnpm dev`, or direct framework commands when a PM2-managed service exists.
- For `orbitone`, always use the PM2 service `orbitone` via `devserver orbitone`, and inspect `/logs/orbitone/error.log` or `devlogs orbitone` when debugging server issues.
- When a repo has a custom webpack config and is upgraded to Next 16, the PM2 service definition must match the repo's startup mode by passing `--webpack` or the service will loop on the Turbopack/webpack mismatch error.
