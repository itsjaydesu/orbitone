# Orbitone AGENTS

## App Identity
- App name: `orbitone`
- PM2 service name: `orbitone`
- Working directory: `/workspace/orbitone`
- Stack: Next.js 16, React 19, Three.js/R3F, Tone.js

## Dev Server And Logs
- Always operate the dev server through the Zedbock PM2 service.
- Start or restart with `devserver orbitone`.
- Check status with `pm2 list`.
- View logs with `devlogs orbitone` or `pm2 logs orbitone`.
- Raw log files:
  - `/logs/orbitone/out.log`
  - `/logs/orbitone/error.log`
- Do not use `npm run dev`, `pnpm dev`, or direct `next dev` for normal server operations.

## Ports And URLs
- Assigned dev port: `8048`
- Local URL inside the container: `http://127.0.0.1:8048`
- User-facing Tailscale URL: `https://zedbock.tail1ff0.ts.net:8048`

## Repo-Specific Commands
- Install deps: `npm install`
- Lint: `npm run lint`
- Production build: `npm run build`

## Notes
- The PM2 definition lives in `/workspace/ecosystem.config.js`.
- Server debugging should start with PM2 status and `/logs/orbitone/error.log` before making code changes.
- The managed `orbitone` dev server currently runs Next with `--webpack` because this repo still uses a custom webpack config under Next 16.
