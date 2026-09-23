module.exports = {
  apps: [{
    name: 'orbitone',
    cwd: __dirname,
    script: 'portless',
    args: ['run', '--name', 'orbitone', 'pnpm', 'exec', 'next', 'dev'],
    interpreter: 'none',
    autorestart: false,
    env: {
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  }, {
    name: 'orbitone-perf-3937',
    cwd: __dirname,
    script: 'perf/service.mjs',
    interpreter: process.execPath,
    autorestart: false,
    env: {
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_ENABLE_VIDEO_EXPORT: 'false',
      ENABLE_VIDEO_EXPORT: 'false',
    },
  }],
}
